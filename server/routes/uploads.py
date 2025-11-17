from flask import Blueprint, request, jsonify, current_app, send_from_directory
from werkzeug.utils import secure_filename
import os
import boto3
from botocore.exceptions import ClientError
from services.auth_service import decode_token

uploads_bp = Blueprint('uploads', __name__, url_prefix='/uploads')

# Ensure uploads directory exists
def _uploads_dir():
    base = os.path.join(os.path.dirname(__file__), '..', 'storage', 'uploads')
    base = os.path.abspath(base)
    os.makedirs(base, exist_ok=True)
    return base


def get_s3_client():
    """Get configured S3 client using credentials from config."""
    try:
        # If credentials are not configured, return None so callers can
        # gracefully fall back to local storage. Creating a boto3 client
        # with None/empty credentials can produce malformed Authorization
        # headers when requests are attempted, which is the root cause of
        # the "AuthorizationHeaderMalformed" error seen in logs.
        access_key = current_app.config.get('AWS_ACCESS_KEY_ID')
        secret_key = current_app.config.get('AWS_SECRET_ACCESS_KEY')
        region = current_app.config.get('AWS_S3_REGION', 'ap-southeast-1')
        # If either key is missing or empty, do not create an S3 client
        if not access_key or not secret_key:
            current_app.logger.info('S3 credentials not configured; skipping S3 client creation')
            return None

        return boto3.client(
            's3',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )
    except Exception as e:
        current_app.logger.error(f"Error creating S3 client: {e}")
        return None


@uploads_bp.route('/presigned-url', methods=['POST'])
def generate_presigned_url():
    """Generate a presigned URL for uploading a file directly to S3.
    Expects JSON: { filename, content_type, file_size }
    Returns: { upload_url, file_url, key }
    """
    # Auth check
    auth = request.headers.get('Authorization', '')
    user_id = None
    if auth.startswith('Bearer '):
        token = auth.split(' ', 1)[1]
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        user_id = payload.get('user_id')
    else:
        return jsonify({'error': 'Authorization required'}), 401

    data = request.get_json() or {}
    filename = data.get('filename')
    content_type = data.get('content_type', 'application/octet-stream')
    file_size = data.get('file_size', 0)

    if not filename:
        return jsonify({'error': 'filename is required'}), 400

    # Validate file size (max 50MB)
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    if file_size > MAX_FILE_SIZE:
        return jsonify({'error': 'File size exceeds 50MB limit'}), 400

    # Generate unique key with user_id and timestamp
    import time
    import uuid
    secure_name = secure_filename(filename)
    unique_id = str(uuid.uuid4())[:8]
    timestamp = int(time.time())
    key = f'uploads/user{user_id}/{timestamp}_{unique_id}_{secure_name}'

    bucket = current_app.config.get('AWS_S3_BUCKET')
    region = current_app.config.get('AWS_S3_REGION', 'ap-southeast-1')
    expiration = current_app.config.get('S3_PRESIGNED_URL_EXPIRATION', 3600)

    s3_client = get_s3_client()
    if not s3_client:
        return jsonify({'error': 'S3 not configured'}), 500

    try:
        # Generate presigned POST URL for upload
        presigned_post = s3_client.generate_presigned_post(
            Bucket=bucket,
            Key=key,
            Fields={'Content-Type': content_type},
            Conditions=[
                {'Content-Type': content_type},
                ['content-length-range', 0, MAX_FILE_SIZE]
            ],
            ExpiresIn=expiration
        )

        # Generate the public file URL
        file_url = f'https://{bucket}.s3.{region}.amazonaws.com/{key}'

        return jsonify({
            'upload_url': presigned_post['url'],
            'fields': presigned_post['fields'],
            'file_url': file_url,
            'key': key
        })

    except ClientError as e:
        current_app.logger.error(f"Error generating presigned URL: {e}")
        return jsonify({'error': 'Failed to generate upload URL'}), 500


@uploads_bp.route('/file', methods=['POST'])
def upload_file():
    """Upload file through backend (alternative to presigned URL).
    Accepts multipart/form-data with 'file' field.
    Can upload to S3 or local storage depending on config.
    """
    # Auth check
    auth = request.headers.get('Authorization', '')
    user_id = None
    if auth.startswith('Bearer '):
        token = auth.split(' ', 1)[1]
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        user_id = payload.get('user_id')
    else:
        return jsonify({'error': 'Authorization required'}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    # Validate file size (max 50MB)
    MAX_FILE_SIZE = 50 * 1024 * 1024
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)
    
    if file_size > MAX_FILE_SIZE:
        return jsonify({'error': 'File size exceeds 50MB limit'}), 400

    try:
        import time
        import uuid
        secure_name = secure_filename(file.filename)
        unique_id = str(uuid.uuid4())[:8]
        timestamp = int(time.time())
        
        # Try S3 upload first
        s3_client = get_s3_client()
        bucket = current_app.config.get('AWS_S3_BUCKET')
        
        if s3_client and bucket:
            # Upload to S3
            key = f'uploads/user{user_id}/{timestamp}_{unique_id}_{secure_name}'
            region = current_app.config.get('AWS_S3_REGION', 'ap-southeast-1')
            
            s3_client.upload_fileobj(
                file,
                bucket,
                key,
                ExtraArgs={
                    'ContentType': file.content_type or 'application/octet-stream',
                    'ACL': 'public-read'
                }
            )
            
            file_url = f'https://{bucket}.s3.{region}.amazonaws.com/{key}'
            current_app.logger.info(f"[UPLOADS] File uploaded to S3: {key} -> {file_url}")
        else:
            # Fallback to local storage
            filename = f'user{user_id}_{timestamp}_{unique_id}_{secure_name}'
            dest = os.path.join(_uploads_dir(), filename)
            file.save(dest)
            file_url = f'/uploads/files/{filename}'
            current_app.logger.info(f"[UPLOADS] File saved locally: {filename} -> {file_url}")
        
        return jsonify({
            'file_url': file_url,
            'file_name': secure_name,
            'file_size': file_size,
            'file_type': file.content_type or 'application/octet-stream'
        })
        
    except Exception as e:
        current_app.logger.error(f"Error uploading file: {e}")
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@uploads_bp.route('/avatar', methods=['POST'])
def upload_avatar():
    """Accepts multipart/form-data file field 'avatar' and saves it to storage/uploads.
    Returns JSON { avatar_url: <url> } where url is a path accessible from the frontend.
    Requires an authenticated user (Bearer token) to be present in Authorization header.
    """
    # simple auth check -- allow unauthenticated uploads too but prefer token
    auth = request.headers.get('Authorization', '')
    user_id = None
    if auth.startswith('Bearer '):
        token = auth.split(' ', 1)[1]
        payload = decode_token(token)
        if payload:
            user_id = payload.get('user_id')

    if 'avatar' not in request.files:
        return jsonify({'error': 'No file part "avatar"'}), 400

    f = request.files['avatar']
    if f.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    filename = secure_filename(f.filename)
    # prefix with user id and timestamp if available
    import time
    prefix = f'user{user_id}_' if user_id else ''
    filename = prefix + str(int(time.time())) + '_' + filename
    dest = os.path.join(_uploads_dir(), filename)
    f.save(dest)

    # Return a URL that the client can fetch from the server
    # We'll expose a simple GET /uploads/files/<filename> route below
    avatar_url = f'/uploads/files/{filename}'
    return jsonify({'avatar_url': avatar_url})


@uploads_bp.route('/files/<path:filename>', methods=['GET'])
def serve_uploaded(filename):
    d = _uploads_dir()
    return send_from_directory(d, filename)
