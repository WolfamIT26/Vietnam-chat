from pyngrok import ngrok
import os
import subprocess


def start_ngrok(app, port=None):
    """Start an ngrok tunnel and return the public URL.

    - If NGROK_AUTH_TOKEN env var is set, configure it first.
    - Port can be passed explicitly; otherwise BACKEND_PORT or 5000 is used.
    - Uses ngrok from PATH (assumed to be installed manually or system-wide).
    """
    # Allow explicit port or read from env
    if port is None:
        try:
            port = int(os.environ.get('BACKEND_PORT', '5000'))
        except Exception:
            port = 5000

    auth_token = os.environ.get('NGROK_AUTH_TOKEN')
    if auth_token:
        try:
            ngrok.set_auth_token(auth_token)
        except Exception:
            # ignore if setting token fails
            pass

    try:
        # If there's already a tunnel open for this port, reuse it to avoid endpoint conflicts
        try:
            existing = ngrok.get_tunnels()
        except Exception:
            existing = []

        for t in existing:
            # t.addr can be like "http://localhost:5000" or ":5000" depending on platform
            addr = getattr(t, 'addr', '') or ''
            if str(port) in addr or addr.endswith(f":{port}") or addr.endswith(f"localhost:{port}"):
                public_url = t.public_url
                app.logger.info(f"[NGROK] Reusing existing tunnel: {public_url}")
                app.config["BASE_URL"] = public_url
                return public_url

        # No existing matching tunnel found — open a new one
        tunnel = ngrok.connect(port, bind_tls=True)
        public_url = tunnel.public_url
    except Exception as e:
        # If pyngrok fails due to an already-online endpoint, try to return an existing tunnel;
        # otherwise fall back to asking the user to run ngrok manually.
        msg = str(e)
        print(f"[NGROK] pyngrok failed ({e}), attempting fallback checks...")
        try:
            existing = ngrok.get_tunnels()
            for t in existing:
                addr = getattr(t, 'addr', '') or ''
                if str(port) in addr or addr.endswith(f":{port}") or addr.endswith(f"localhost:{port}"):
                    public_url = t.public_url
                    app.logger.info(f"[NGROK] Found existing tunnel after error: {public_url}")
                    app.config["BASE_URL"] = public_url
                    return public_url
        except Exception:
            pass

        # Final fallback: instruct the user to run ngrok manually (more reliable than trying
        # to spawn a background ngrok binary from here in every environment).
        if 'ngrok' in msg and 'already online' in msg:
            raise Exception("Existing ngrok endpoint detected. Please stop the other ngrok process or use a different subdomain and try again.")
        # If ngrok binary isn't available or another error occurred, surface a helpful message
        raise Exception("ngrok tunnel could not be started automatically. Please run: ngrok http " + str(port))

    # Save public url into app config for the app to consume if needed
    app.config["BASE_URL"] = public_url
    return public_url
