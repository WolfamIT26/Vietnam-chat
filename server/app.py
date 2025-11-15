from flask import Flask, request, make_response, send_from_directory
from flask_socketio import SocketIO
from config.settings import Config
from config.database import db, migrate
from services.network_setup import start_ngrok
import logging
import os

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

# Simple CORS handling for development: allow React dev server + ngrok + localhost origins
# We avoid adding a new dependency so this works out-of-the-box.
# Include both localhost and any ngrok/public URL for flexibility
ALLOWED_ORIGINS = {
    "http://localhost:3000", 
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
}
# For ngrok URLs, we'll check in the handler and allow them (see add_cors_headers below)


@app.after_request
def add_cors_headers(response):
    # For development convenience allow the React dev server origin.
    # If you want to tighten this, set specific origins using ALLOWED_ORIGINS above.
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
    else:
        # fallback to permissive during local development
        response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    return response


@app.before_request
def handle_preflight():
    # Respond to preflight OPTIONS requests with CORS headers immediately.
    if request.method == 'OPTIONS':
        resp = make_response()
        origin = request.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            resp.headers['Access-Control-Allow-Origin'] = origin
        else:
            resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Credentials'] = 'true'
        resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        return resp
    
# WSGI middleware fallback to ensure CORS headers are present on all responses
class _CORSMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        def _start_response(status, headers, exc_info=None):
            # Add permissive CORS headers for local development, but avoid
            # duplicating headers that may have been set earlier by
            # Flask handlers (after_request / preflight responses).
            # Browsers reject responses where Access-Control-Allow-Origin
            # contains multiple values like "http://localhost:3000, *".
            header_names = {name.lower() for name, _ in headers}
            if 'access-control-allow-origin' not in header_names:
                headers.append(('Access-Control-Allow-Origin', '*'))
            if 'access-control-allow-credentials' not in header_names:
                headers.append(('Access-Control-Allow-Credentials', 'true'))
            if 'access-control-allow-methods' not in header_names:
                headers.append(('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'))
            if 'access-control-allow-headers' not in header_names:
                headers.append(('Access-Control-Allow-Headers', 'Content-Type,Authorization'))
            return start_response(status, headers, exc_info)

        return self.wsgi_app(environ, _start_response)


app.wsgi_app = _CORSMiddleware(app.wsgi_app)
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
app.register_blueprint(auth_me_bp)

# Ensure DB tables exist for development convenience (creates missing tables).
with app.app_context():
    # Import models to ensure SQLAlchemy metadata is populated before create_all
    try:
        from models.user_model import User
        from models.friend_model import Friend
        from models.group_model import Group
        from models.message_model import Message
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

# Logging setup
logging.basicConfig(level=logging.INFO)

# Reduce noisy logs from pyngrok unless explicitly debugging
logging.getLogger('pyngrok').setLevel(logging.ERROR)

if __name__ == "__main__":
    try:
        # Determine port early so ngrok can use the same port
        port = int(os.environ.get('BACKEND_PORT', '5000'))

        # Only attempt to start ngrok if explicitly enabled via env var.
        if os.environ.get('ENABLE_NGROK', 'false').lower() == 'true':
            public_url = start_ngrok(app, port=port)
            print("\n")
            print("=" * 80)
            print("🌐 [NGROK] PUBLIC URL - SHARE THIS WITH FRIENDS:")
            print("=" * 80)
            print(f"   {public_url}")
            print("=" * 80)
            print(f"   API Base:     {public_url}")
            print(f"   Socket URL:   {public_url}")
            print("=" * 80)
            print("\n")
        else:
            logging.info("Ngrok disabled (ENABLE_NGROK not set to 'true'). Running local only.")
    except Exception as e:
        # Keep the exception visible in logs but don't let ngrok failure stop the server.
        print(f"[WARNING] Ngrok connection failed: {e}")
        logging.info("Running without ngrok tunnel - you can access via http://localhost:<port>")
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