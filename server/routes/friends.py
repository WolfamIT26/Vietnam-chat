from flask import Blueprint, request, jsonify, current_app
from services.auth_service import decode_token
from models.user_model import User
from models.friend_model import Friend
from models.block_model import Block
from config.database import db

friends_bp = Blueprint('friends', __name__, url_prefix='/friends')


def current_user_from_request(req):
    auth = req.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth.split(' ', 1)[1]
        payload = decode_token(token)
        if payload:
            return payload.get('user_id')
    return None


@friends_bp.route('', methods=['GET'])
def list_friends():
    uid = current_user_from_request(request)
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    # return accepted friends where user is involved
    rels = Friend.query.filter(((Friend.user_id == uid) | (Friend.friend_id == uid)), Friend.status == 'accepted').all()
    friend_ids = [r.friend_id if r.user_id == uid else r.user_id for r in rels]
    users = User.query.filter(User.id.in_(friend_ids)).all() if friend_ids else []
    return jsonify([{'id': u.id, 'username': u.username, 'avatar_url': u.avatar_url} for u in users])


@friends_bp.route('/requests', methods=['GET'])
def list_friend_requests():
    """List incoming pending friend requests for current user"""
    uid = current_user_from_request(request)
    if not uid:
        # Development convenience: allow unauthenticated access when explicitly enabled
        # Set environment variable ALLOW_DEV_FRIENDS_NOAUTH=true to enable.
        if str(current_app.config.get('ALLOW_DEV_FRIENDS_NOAUTH', '')).lower() == 'true':
            return jsonify([])
        return jsonify({'error': 'Unauthorized'}), 401
    # incoming requests where friend_id == uid and status == pending
    rels = Friend.query.filter_by(friend_id=uid, status='pending').all()
    user_ids = [r.user_id for r in rels]
    users = User.query.filter(User.id.in_(user_ids)).all() if user_ids else []
    # include the friend relation id so the client can accept by id (or by user id)
    result = []
    for r in rels:
        u = next((u for u in users if u.id == r.user_id), None)
        if u:
            result.append({'rel_id': r.id, 'user_id': u.id, 'username': u.username, 'display_name': getattr(u, 'display_name', None)})
    return jsonify(result)


@friends_bp.route('/blocked', methods=['GET'])
def list_blocked_users():
    """List users that current user has blocked"""
    uid = current_user_from_request(request)
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    # Get all users blocked by current user
    blocks = Block.query.filter_by(user_id=uid).all()
    target_ids = [b.target_id for b in blocks]
    users = User.query.filter(User.id.in_(target_ids)).all() if target_ids else []
    return jsonify([{'id': u.id, 'username': u.username, 'display_name': getattr(u, 'display_name', None), 'avatar_url': u.avatar_url} for u in users])


@friends_bp.route('/test', methods=['GET'])
def test_friends():
    """Test endpoint to verify friends blueprint is loaded"""
    return jsonify({'status': 'Friends blueprint is working'})


@friends_bp.route('/<int:other_id>/add', methods=['POST'])
def add_friend(other_id):
    uid = current_user_from_request(request)
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    if uid == other_id:
        return jsonify({'error': 'Cannot add yourself'}), 400
    # check existing (either direction)
    exists = Friend.query.filter(((Friend.user_id == uid) & (Friend.friend_id == other_id)) | ((Friend.user_id == other_id) & (Friend.friend_id == uid))).first()
    if exists:
        return jsonify({'success': False, 'message': 'Already friends or pending'})
    rel = Friend(user_id=uid, friend_id=other_id, status='pending')
    db.session.add(rel)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Friend request sent'})


@friends_bp.route('/<int:other_id>/accept', methods=['POST'])
def accept_friend(other_id):
    uid = current_user_from_request(request)
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    # find pending request where other_id was the requester and uid is recipient (either direction)
    rel = Friend.query.filter(((Friend.user_id == other_id) & (Friend.friend_id == uid)) | ((Friend.user_id == uid) & (Friend.friend_id == other_id)), Friend.status == 'pending').first()
    if not rel:
        return jsonify({'error': 'No friend request found'}), 404
    rel.status = 'accepted'
    db.session.commit()
    return jsonify({'success': True})


@friends_bp.route('/<int:other_id>/remove', methods=['DELETE', 'POST'])
def remove_friend(other_id):
    """Remove/unfriend another user"""
    uid = current_user_from_request(request)
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    if uid == other_id:
        return jsonify({'error': 'Cannot remove yourself'}), 400

    # Find the friendship relationship (either direction)
    rel = Friend.query.filter(((Friend.user_id == uid) & (Friend.friend_id == other_id)) | ((Friend.user_id == other_id) & (Friend.friend_id == uid))).first()
    if not rel:
        return jsonify({'error': 'Not friends'}), 404

    # Delete the relationship
    try:
        db.session.delete(rel)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Friend removed'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
