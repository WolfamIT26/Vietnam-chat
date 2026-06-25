from flask import Flask, request, make_response, send_from_directory
from flask_socketio import SocketIO
from flask_cors import CORS
import sys, os

# Ensure the server package directory is on sys.path so imports like
# `from config.settings import Config` (where config lives in server/config)
# resolve when importing `server.app` from the project root.
sys.path.insert(0, os.path.dirname(__file__))

from config.settings import Config
from config.database import db, migrate
from services.network_setup import start_ngrok
import logging
import os
from utils.logging_helpers import LoggingDedupFilter

# Initialize Flask app
# Serve client build (if present) as static files so the same public URL can serve frontend + API
CLIENT_BUILD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'client', 'build'))
if os.path.isdir(CLIENT_BUILD_DIR):
    app = Flask(__name__, static_folder=CLIENT_BUILD_DIR, static_url_path='')
else:
    app = Flask(__name__)
app.config.from_object(Config)

# Initialize extensions
socketio = SocketIO(app, cors_allowed_origins="*")

# Enable official Flask-CORS for production deployment
CORS(app, supports_credentials=True, origins=["http://localhost:3000", "https://vietnam-chat-1qte-e5ocjphaf-pducviet.vercel.app"])

db.init_app(app)
migrate.init_app(app, db)

# Register blueprints
from routes.auth.register import auth_register_bp
from routes.auth.login import auth_login_bp
from routes.auth.logout import auth_logout_bp
from routes.auth.forgot_password import auth_forgot_bp
from routes.auth.refresh import auth_refresh_bp
from routes.users import users_bp
from routes.messages import messages_bp
from routes.friends import friends_bp
from routes.groups import groups_bp
from routes.uploads import uploads_bp
from routes.stickers import stickers_bp
from routes.auth.me import auth_me_bp

app.register_blueprint(auth_register_bp)
app.register_blueprint(auth_login_bp)
app.register_blueprint(auth_logout_bp)
app.register_blueprint(auth_forgot_bp)
app.register_blueprint(auth_refresh_bp)
app.register_blueprint(users_bp)
app.register_blueprint(messages_bp)
app.register_blueprint(friends_bp)
app.register_blueprint(groups_bp)
app.register_blueprint(uploads_bp)
app.register_blueprint(stickers_bp)
app.register_blueprint(auth_me_bp)

# Ensure DB tables exist for development convenience (creates missing tables).
with app.app_context():
    # Import models to ensure SQLAlchemy metadata is populated before create_all
    try:
        from models.user_model import User
        from models.friend_model import Friend
        from models.group_model import Group
        from models.message_model import Message
        from models.sticker_model import Sticker
    except Exception:
        # If imports fail, log and continue; create_all may still create available tables
        app.logger.debug('Model import failed during create_all prep')
    try:
        db.create_all()
        # Add file_url column if it doesn't exist (for existing databases)
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        columns = [col['name'] for col in inspector.get_columns('message')]
        if 'file_url' not in columns:
            try:
                with db.engine.connect() as conn:
                    conn.execute(db.text('ALTER TABLE message ADD COLUMN file_url VARCHAR(500)'))
                    conn.commit()
                app.logger.info('Added file_url column to message table')
            except Exception as e:
                app.logger.debug(f'Could not add file_url column: {e}')
    except Exception as e:
        app.logger.warning(f"Could not create tables automatically: {e}")
    # If DB is empty, create a few demo users for development convenience
    try:
        from models.user_model import User
        if User.query.count() == 0:
            from services.auth_service import register_user
            register_user('alice', 'password', display_name='Alice Nguyễn')
            register_user('bob', 'password', display_name='Bob Trần')
            register_user('carol', 'password', display_name='Carol Lê')
            app.logger.info('Created demo users: alice, bob, carol')
    except Exception:
        # ignore seeding errors in production
        pass

# Register socket events
from sockets.chat_events import register_chat_events
from sockets.signaling_events import register_signaling_events
register_chat_events(socketio)
register_signaling_events(socketio)


# If a client build exists, serve it at the root so the ngrok/public URL shows the React app.
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_client(path):
    """Serve files from client/build if present, otherwise return 404 for unknown routes.

    This keeps API and socket routes working (they are registered earlier). Any path that
    doesn't match an API route will fall through to this handler and return the React
    app's index.html so client-side routing works over the public ngrok URL.
    """
    if not os.path.isdir(CLIENT_BUILD_DIR):
        # No static build available; let Flask handle 404s normally
        return make_response(('Not Found', 404))

    # Serve static assets if they exist; otherwise serve index.html for client-side routing
    requested = path or 'index.html'
    full_path = os.path.join(CLIENT_BUILD_DIR, requested)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        return send_from_directory(CLIENT_BUILD_DIR, requested)
    return send_from_directory(CLIENT_BUILD_DIR, 'index.html')

# Logging setup: concise format with timestamp, level, module, message
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(level=LOG_LEVEL, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger(__name__)

# Add deduplication filter to reduce repeated identical messages (default 5s)
try:
    dedup_seconds = int(os.environ.get('LOG_DEDUP_SECONDS', '5'))
except Exception:
    dedup_seconds = 5
root_logger = logging.getLogger()
root_logger.addFilter(LoggingDedupFilter(window_seconds=dedup_seconds))

# Reduce noisy logs from pyngrok unless explicitly debugging
logging.getLogger('pyngrok').setLevel(logging.ERROR)
# By default suppress Werkzeug access logs to keep terminal readable.
# Set LOG_SHOW_ACCESS=true to re-enable access logs.
if os.environ.get('LOG_SHOW_ACCESS', 'false').lower() != 'true':
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('engineio').setLevel(logging.WARNING)
    logging.getLogger('socketio').setLevel(logging.WARNING)

if __name__ == "__main__":
    try:
        # Determine port early so ngrok can use the same port
        port = int(os.environ.get('BACKEND_PORT', '5000'))

        # Only attempt to start ngrok if explicitly enabled via env var.
        if os.environ.get('ENABLE_NGROK', 'false').lower() == 'true':
            public_url = start_ngrok(app, port=port)
            # Log a concise ngrok info line instead of large ASCII banner
            logger.info("NGROK public URL: %s", public_url)
            logger.info("API Base: %s | Socket URL: %s", public_url, public_url)
            # expose to app config for other modules
        else:
            logger.info("Ngrok disabled (ENABLE_NGROK not set to 'true'). Running local only.")
    except Exception as e:
        # Keep the exception visible in logs but don't let ngrok failure stop the server.
        logger.exception("Ngrok connection failed: %s", str(e))
        logger.info("Running without ngrok tunnel - you can access via http://localhost:<port>")
    # Allow choosing a port/host via environment variables to avoid 'address already in use'
    # `port` was already read above for ngrok; fall back if not present
    try:
        port = int(os.environ.get('BACKEND_PORT', str(port)))
    except Exception:
        port = 5000
    host = os.environ.get('BACKEND_HOST', '0.0.0.0')
    # Newer Flask-SocketIO versions raise an error when running with the
    # Werkzeug dev server. For local development we allow it explicitly.
    socketio.run(app, host=host, port=port, debug=False, allow_unsafe_werkzeug=True)
