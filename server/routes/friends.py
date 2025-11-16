from flask import Blueprint, request, jsonify
from services.auth_service import decode_token
from models.user_model import User
from models.friend_model import Friend
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
    return jsonify([{'id':u.id,'username':u.username,'avatar_url':u.avatar_url} for u in users])


@friends_bp.route('/requests', methods=['GET'])
def list_friend_requests():
    """List incoming pending friend requests for current user"""
    uid = current_user_from_request(request)
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    # incoming requests where friend_id == uid and status == pending
    rels = Friend.query.filter_by(friend_id=uid, status='pending').all()
    user_ids = [r.user_id for r in rels]
    users = User.query.filter(User.id.in_(user_ids)).all() if user_ids else []
    # include the friend relation id so the client can accept by id (or by user id)
    result = []
    for r in rels:
        sender = next((u for u in users if u.id == r.user_id), None)
        if sender:
            result.append({'rel_id': r.id, 'user_id': sender.id, 'username': sender.username})
    return jsonify(result)


@friends_bp.route('/<int:other_id>/add', methods=['POST'])
def add_friend(other_id):
    uid = current_user_from_request(request)
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    if uid == other_id:
        return jsonify({'error':'Cannot add yourself'}), 400
    # check existing
    exists = Friend.query.filter(((Friend.user_id==uid)&(Friend.friend_id==other_id))|((Friend.user_id==other_id)&(Friend.friend_id==uid))).first()
    if exists:
        return jsonify({'success': False, 'message':'Request already exists or you are friends'}), 400
    rel = Friend(user_id=uid, friend_id=other_id, status='pending')
    db.session.add(rel)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Friend request sent'})


@friends_bp.route('/<int:other_id>/accept', methods=['POST'])
def accept_friend(other_id):
    uid = current_user_from_request(request)
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    rel = Friend.query.filter(((Friend.user_id==other_id)&(Friend.friend_id==uid))|((Friend.user_id==uid)&(Friend.friend_id==other_id))).first()
    if not rel:
        return jsonify({'error':'No friend request found'}), 404
    rel.status = 'accepted'
    db.session.commit()
    return jsonify({'success': True})


@friends_bp.route('/<int:other_id>/remove', methods=['DELETE'])
def remove_friend(other_id):
    """Remove/unfriend another user"""
    uid = current_user_from_request(request)
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    if uid == other_id:
        return jsonify({'error':'Cannot remove yourself'}), 400
    # Find the friendship relationship (either direction)
    rel = Friend.query.filter(((Friend.user_id==uid)&(Friend.friend_id==other_id))|((Friend.user_id==other_id)&(Friend.friend_id==uid))).first()
    if not rel:
        return jsonify({'error':'Not friends'}), 404
    # Delete the relationship
    db.session.delete(rel)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Friend removed'})
