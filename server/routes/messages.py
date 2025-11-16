from flask import Blueprint, request, jsonify
from models.message_model import Message
from config.database import db
from sqlalchemy import or_
import os
from werkzeug.utils import secure_filename
import time

messages_bp = Blueprint('messages', __name__, url_prefix='/messages')


@messages_bp.route('', methods=['GET'])
def get_messages():
    """Return messages between two users (both directions).

    Query params:
      - sender_id: required
      - receiver_id: required
      - limit: optional int to cap number of messages (most recent)
    """
    sender_id = request.args.get('sender_id')
    receiver_id = request.args.get('receiver_id')
    print(f"[MESSAGES] sender={sender_id} receiver={receiver_id}")
    if not sender_id or not receiver_id:
        print("[MESSAGES] Missing sender_id or receiver_id")
        return jsonify({'error': 'Missing sender_id or receiver_id'}), 400

    try:
        a = int(sender_id)
        b = int(receiver_id)
    except ValueError:
        print("[MESSAGES] sender_id and receiver_id must be integers")
        return jsonify({'error': 'sender_id and receiver_id must be integers'}), 400

    limit = request.args.get('limit', type=int)

    # messages where (sender=a and receiver=b) OR (sender=b and receiver=a)
    query = Message.query.filter(
        or_(
            (Message.sender_id == a) & (Message.receiver_id == b),
            (Message.sender_id == b) & (Message.receiver_id == a),
        )
    ).order_by(Message.timestamp.asc())

    if limit:
        msgs = query.limit(limit).all()
    else:
        msgs = query.all()

    response_data = [
        {
            'id': m.id,
            'sender_id': m.sender_id,
            'receiver_id': m.receiver_id,
            'content': m.content,
            'file_url': m.file_url,
            'message_type': m.message_type,
            'sticker_id': m.sticker_id,
            'sticker_url': m.sticker_url,
            'timestamp': m.timestamp.isoformat()
        } for m in msgs
    ]
    print(f"[MESSAGES] count={len(response_data)}")
    return jsonify(response_data)


@messages_bp.route('/conversations', methods=['GET'])
def get_conversations():
    """Return conversation summaries for current user: last message per conversation (user or group).

    Requires Authorization: Bearer <token>
    """
    from services.auth_service import decode_token
    from models.user_model import User
    from models.group_model import Group

    auth = request.headers.get('Authorization', '')
    uid = None
    if auth.startswith('Bearer '):
        token = auth.split(' ', 1)[1]
        payload = decode_token(token)
        if payload:
            uid = payload.get('user_id')

    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401

    # Gather messages involving user
    msgs = Message.query.filter(
        or_(Message.sender_id == uid, Message.receiver_id == uid)
    ).order_by(Message.timestamp.desc()).all()

    conv_map = {}
    for m in msgs:
        if m.group_id:
            key = ('group', m.group_id)
        else:
            # determine the other participant
            other = m.receiver_id if m.sender_id == uid else m.sender_id
            key = ('user', other)

        if key not in conv_map:
            # Show a friendly preview depending on message type
            if m.message_type == 'sticker':
                preview = '[Sticker]'
            elif m.file_url:
                preview = '[File] '
            else:
                preview = m.content

            conv_map[key] = {
                'type': key[0],
                'id': key[1],
                'last_message': preview,
                'last_ts': m.timestamp.isoformat(),
            }

    # Enrich with display names
    result = []
    for k, v in conv_map.items():
        if v['type'] == 'user':
            u = User.query.get(v['id'])
            v['display_name'] = (u.display_name or u.username) if u else None
            v['username'] = u.username if u else None
        else:
            g = Group.query.get(v['id'])
            v['group_name'] = g.name if g else f'Group {v["id"]}'
        result.append(v)

    # sort by last_ts desc
    result.sort(key=lambda x: x.get('last_ts') or '', reverse=True)
    return jsonify(result)


@messages_bp.route('/upload', methods=['POST'])
def upload_file():
    """Upload a file as a message"""
    try:
        sender_id = request.form.get('sender_id')
        receiver_id = request.form.get('receiver_id')
        
        if not sender_id or not receiver_id:
            return jsonify({'error': 'Missing sender_id or receiver_id'}), 400
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Empty filename'}), 400
        
        # Create uploads directory
        upload_dir = os.path.join(os.path.dirname(__file__), '..', 'storage', 'uploads')
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save file with timestamp prefix
        filename = secure_filename(file.filename)
        prefix = f'{int(time.time())}_{sender_id}_'
        saved_filename = prefix + filename
        filepath = os.path.join(upload_dir, saved_filename)
        file.save(filepath)
        print(f"[UPLOAD] File saved: {filepath}")
        
        # Create message with file URL
        file_url = f'/uploads/files/{saved_filename}'
        msg = Message(
            sender_id=int(sender_id),
            receiver_id=int(receiver_id),
            content=filename,
            file_url=file_url
        )
        
        db.session.add(msg)
        db.session.commit()
        print(f"[UPLOAD] Message created: {msg.id}")
        
        return jsonify({
            'id': msg.id,
            'content': msg.content,
            'file_url': file_url,
            'timestamp': msg.timestamp.isoformat()
        }), 201
    except Exception as e:
        db.session.rollback()
        print(f"[UPLOAD ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
