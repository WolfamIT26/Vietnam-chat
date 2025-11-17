from flask import Blueprint, jsonify, request
from models.user_model import User
from config.database import db
from services.auth_service import decode_token
from sqlalchemy import or_

users_bp = Blueprint('users', __name__, url_prefix='/users')


@users_bp.route('', methods=['GET'])
def get_users():
    """Return all users (small apps only)."""
    users = User.query.all()
    return jsonify([
        {
            'id': u.id,
            'username': u.username,
            'display_name': u.display_name if getattr(u, 'display_name', None) else u.username,
            'avatar_url': u.avatar_url,
            'status': u.status
        } for u in users
    ])


@users_bp.route('/me', methods=['PATCH'])
def update_me():
    """Update current user's profile (display_name, avatar_url, gender, birthdate, phone_number)."""
    from datetime import date

    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return jsonify({'error': 'Unauthorized'}), 401
    token = auth.split(' ', 1)[1]
    payload = decode_token(token)
    if not payload or not payload.get('user_id'):
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.get(payload['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json() or {}
    display_name = data.get('display_name')
    avatar_url = data.get('avatar_url')
    gender = data.get('gender')
    birthdate = data.get('birthdate')
    phone_number = data.get('phone_number')

    changed = False
    if display_name is not None:
        user.display_name = display_name
        changed = True
    if avatar_url is not None:
        user.avatar_url = avatar_url
        changed = True
    if gender is not None:
        user.gender = gender
        changed = True
    if phone_number is not None:
        user.phone_number = phone_number
        changed = True
    if birthdate is not None:
        # accept ISO date YYYY-MM-DD or fallback to string
        try:
            # try parse
            d = date.fromisoformat(birthdate)
            user.birthdate = d
        except Exception:
            # store raw string if parse fails (DB column is flexible)
            user.birthdate = birthdate
        changed = True

    if changed:
        try:
            db.session.add(user)
            db.session.commit()
            # Debug log for profile update
            try:
                current_app.logger.info(f"[USERS] User {user.id} profile updated. avatar_url={user.avatar_url}")
            except Exception:
                pass
            # Emit realtime update to friends so they see new avatar/profile immediately
            try:
                # import here to avoid circular imports at module import time
                from app import socketio
                from models.friend_model import Friend
                # collect friend ids in both directions
                outgoing = Friend.query.filter_by(user_id=user.id, status='accepted').all() or []
                incoming = Friend.query.filter_by(friend_id=user.id, status='accepted').all() or []
                friend_ids = set()
                for f in outgoing:
                    friend_ids.add(f.friend_id)
                for f in incoming:
                    friend_ids.add(f.user_id)

                payload = {
                    'event': 'PROFILE_UPDATED',
                    'data': {
                        'id': user.id,
                        'username': user.username,
                        'display_name': user.display_name if getattr(user, 'display_name', None) else user.username,
                        'avatar_url': user.avatar_url,
                        'status': user.status,
                    }
                }

                # Emit to the user's own room (useful for multi-tab) and to each friend's room
                # Diagnostic: log current user_sockets mapping so we can tell which users are connected
                try:
                    from sockets import chat_events as _chat_events
                    current_map = getattr(_chat_events, 'user_sockets', {}) or {}
                    try:
                        current_app.logger.info(f"[USERS][DIAG] current user_sockets keys={list(current_map.keys())}")
                        # show a compact mapping of user_id -> sid for debugging
                        for k, v in list(current_map.items())[:50]:
                            current_app.logger.debug(f"[USERS][DIAG] mapping {k} -> {v}")
                    except Exception:
                        current_app.logger.debug('[USERS][DIAG] failed logging user_sockets mapping')
                except Exception:
                    # best-effort only
                    try:
                        current_app.logger.debug('[USERS][DIAG] chat_events not importable')
                    except Exception:
                        pass
                try:
                    current_app.logger.info(f"[USERS] Emitting PROFILE_UPDATED for user {user.id} to user-{user.id} and {len(friend_ids)} friends")
                    socketio.emit('contact_updated', payload, room=f'user-{user.id}')
                except Exception as e:
                    current_app.logger.exception(f"[USERS] Failed emitting to own room: {e}")

                for fid in friend_ids:
                    try:
                        current_app.logger.debug(f"[USERS] Emitting PROFILE_UPDATED for user {user.id} to friend room user-{fid}")
                        socketio.emit('contact_updated', payload, room=f'user-{fid}')
                    except Exception as e:
                        current_app.logger.exception(f"[USERS] Failed emitting to friend {fid}: {e}")
                # As a fallback, also broadcast the update to all connected clients.
                # This ensures clients that for some reason didn't join rooms still receive profile updates.
                try:
                    current_app.logger.info(f"[USERS] Broadcasting PROFILE_UPDATED for user {user.id} to all connected clients as fallback")
                    socketio.emit('contact_updated', payload)
                except Exception as e:
                    current_app.logger.exception(f"[USERS] Failed broadcasting PROFILE_UPDATED: {e}")
            except Exception:
                # Do not fail the request if emitting realtime updates fails
                pass
        except Exception as e:
            # log and return error to client so frontend can show more info
            current_err = str(e)
            return jsonify({'error': 'DB update failed', 'detail': current_err}), 500

    return jsonify({
        'id': user.id,
        'username': user.username,
        'display_name': user.display_name,
        'avatar_url': user.avatar_url,
        'status': user.status,
        'gender': user.gender,
        'birthdate': user.birthdate.isoformat() if getattr(user, 'birthdate', None) and hasattr(user.birthdate, 'isoformat') else (user.birthdate if user.birthdate else None),
        'phone_number': user.phone_number,
    })


@users_bp.route('/me', methods=['GET'])
def get_me():
    """Return current logged-in user's profile"""
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return jsonify({'error': 'Unauthorized'}), 401
    token = auth.split(' ', 1)[1]
    payload = decode_token(token)
    if not payload or not payload.get('user_id'):
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.get(payload['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({
        'id': user.id,
        'username': user.username,
        'display_name': user.display_name if getattr(user, 'display_name', None) else user.username,
        'avatar_url': user.avatar_url,
        'status': user.status,
        'gender': getattr(user, 'gender', None),
        'birthdate': user.birthdate.isoformat() if getattr(user, 'birthdate', None) and hasattr(user.birthdate, 'isoformat') else (user.birthdate if user.birthdate else None),
        'phone_number': getattr(user, 'phone_number', None),
    })


@users_bp.route('/<int:user_id>', methods=['GET'])
def get_user_by_id(user_id):
    """Return public profile for a given user id.

    If Authorization Bearer token is provided we will compute `is_friend`
    relative to the caller and include a small `mutuals` count where possible.
    Fields that don't exist in the model will be returned as null.
    """
    auth = request.headers.get('Authorization', '')
    caller_id = None
    if auth.startswith('Bearer '):
        token = auth.split(' ', 1)[1]
        payload = decode_token(token)
        if payload:
            caller_id = payload.get('user_id')

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # determine friendship status if caller authenticated
    is_friend = False
    mutuals = 0
    try:
        if caller_id and caller_id != user_id:
            from models.friend_model import Friend
            # check accepted relationship
            rel = Friend.query.filter(((Friend.user_id == caller_id) & (Friend.friend_id == user_id)) | ((Friend.user_id == user_id) & (Friend.friend_id == caller_id)), Friend.status == 'accepted').first()
            is_friend = bool(rel)
            # compute mutual friends count (simple approach)
            my_rels = Friend.query.filter(((Friend.user_id == caller_id) | (Friend.friend_id == caller_id)), Friend.status == 'accepted').all()
            their_rels = Friend.query.filter(((Friend.user_id == user_id) | (Friend.friend_id == user_id)), Friend.status == 'accepted').all()
            my_ids = set([r.friend_id if r.user_id == caller_id else r.user_id for r in my_rels])
            their_ids = set([r.friend_id if r.user_id == user_id else r.user_id for r in their_rels])
            mutuals = len(my_ids.intersection(their_ids))
    except Exception:
        # be resilient — if Friend model unavailable, fall back to defaults
        is_friend = False
        mutuals = 0

    profile = {
        'id': user.id,
        'username': user.username,
        'display_name': user.display_name if getattr(user, 'display_name', None) else user.username,
        'avatar_url': user.avatar_url,
        # Not yet implemented fields — return None so frontend can handle gracefully
        'cover_url': getattr(user, 'cover_url', None) if hasattr(user, 'cover_url') else None,
        'status_msg': getattr(user, 'status_msg', None) if hasattr(user, 'status_msg') else None,
        'last_seen': getattr(user, 'last_seen', None).isoformat() if getattr(user, 'last_seen', None) and hasattr(user.last_seen, 'isoformat') else (getattr(user, 'last_seen', None) if getattr(user, 'last_seen', None) else None),
        'presence': getattr(user, 'status', None),
        'is_friend': is_friend,
        'mutuals': mutuals,
    }

    return jsonify(profile), 200


@users_bp.route('/search', methods=['GET'])
def search_users():
    """Search users by username. Query param: q (partial match)."""
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])
    # Simple case-insensitive partial match
    like = f"%{q}%"
    # Match username or display_name
    results = User.query.filter(
        (User.username.ilike(like)) | (getattr(User, 'display_name', User.username).ilike(like))
    ).limit(50).all()
    return jsonify([{'id': u.id, 'username': u.username, 'display_name': (u.display_name or u.username), 'avatar_url': u.avatar_url, 'status': u.status} for u in results])


@users_bp.route('/suggestions', methods=['GET'])
def user_suggestions():
    """Return friend suggestions for current user: users who are not already friends and not the current user.
    Optional `limit` query param.
    """
    auth = request.headers.get('Authorization', '')
    uid = None
    if auth.startswith('Bearer '):
        token = auth.split(' ', 1)[1]
        payload = decode_token(token)
        if payload:
            uid = payload.get('user_id')

    # If not logged in, return popular users (first N)
    limit = int(request.args.get('limit', '10'))
    if not uid:
        users = User.query.limit(limit).all()
        return jsonify([{'id': u.id, 'username': u.username, 'avatar_url': u.avatar_url, 'status': u.status} for u in users])

    # Get IDs of users to exclude: self and existing friends
    # We'll import Friend here to avoid circular imports at top-level
    from models.friend_model import Friend
    rels = Friend.query.filter((Friend.user_id == uid) | (Friend.friend_id == uid)).all()
    exclude_ids = {uid}
    for r in rels:
        exclude_ids.add(r.user_id)
        exclude_ids.add(r.friend_id)

    # Find users not in exclude_ids
    suggestions = User.query.filter(~User.id.in_(list(exclude_ids))).limit(limit).all()
    return jsonify([{'id': u.id, 'username': u.username, 'avatar_url': u.avatar_url, 'status': u.status} for u in suggestions])
