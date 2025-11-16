from flask_socketio import emit, join_room, leave_room
from flask import request
from models.user_model import User
from models.message_model import Message
from models.message_reaction_model import MessageReaction
from models.friend_model import Friend
from models.block_model import Block
from models.contact_sync_model import ContactSync
from config.database import db
import logging
from services.auth_service import decode_token

# Store mapping of user_id -> socket.sid for direct targeting
user_sockets = {}

def register_chat_events(socketio):
    def GetContactsList(user_id):
        """Return a list of contact dicts for given user_id: {id, name, online}.
        Looks up Friend relations with status 'accepted' and queries User for profile.
        Online detection uses the in-memory `user_sockets` mapping.
        """
        try:
            # Find both directions where relationship exists
            outgoing = Friend.query.filter_by(user_id=user_id, status='accepted').all() or []
            incoming = Friend.query.filter_by(friend_id=user_id, status='accepted').all() or []
            rows = []
            for f in outgoing:
                fid = f.friend_id
                u = User.query.get(fid)
                if not u:
                    continue
                rows.append({
                    'id': str(u.id),
                    'name': u.display_name or u.username,
                    'online': fid in user_sockets
                })
            for f in incoming:
                fid = f.user_id
                u = User.query.get(fid)
                if not u:
                    continue
                rows.append({
                    'id': str(u.id),
                    'name': u.display_name or u.username,
                    'online': fid in user_sockets
                })
            return rows
        except Exception as e:
            print(f"[CONTACTS] Error building contacts list: {e}")
            return []

    def AddBlock(user_id, target_id):
        try:
            # don't duplicate
            exists = Block.query.filter_by(user_id=user_id, target_id=target_id).first()
            if exists:
                return False, 'exists'
            b = Block(user_id=user_id, target_id=target_id)
            db.session.add(b)
            db.session.commit()
            return True, b
        except Exception as e:
            print(f"[BLOCK] Error adding block: {e}")
            db.session.rollback()
            return False, 'error'

    def RemoveBlock(user_id, target_id):
        try:
            b = Block.query.filter_by(user_id=user_id, target_id=target_id).first()
            if not b:
                return False, 'not_found'
            db.session.delete(b)
            db.session.commit()
            return True, None
        except Exception as e:
            print(f"[BLOCK] Error removing block: {e}")
            db.session.rollback()
            return False, 'error'

    def SyncContacts(user_id, contacts):
        """Compare given contacts (list of phone numbers) with users, persist and return matches."""
        try:
            # Find users where phone_number in provided contacts
            if not contacts:
                contacts = []
            users = User.query.filter(User.phone_number.in_(contacts)).all() if contacts else []
            matches = [{'id': str(u.id), 'name': u.display_name or u.username, 'phone': u.phone_number} for u in users]

            # Load or create ContactSync row
            cs = ContactSync.query.filter_by(user_id=user_id).first()
            old = []
            if cs:
                old = cs.get_contacts()
            else:
                cs = ContactSync(user_id=user_id)
                db.session.add(cs)

            # Save contacts list (as provided)
            cs.set_contacts(contacts)
            from datetime import datetime
            cs.updated_at = datetime.utcnow()
            db.session.commit()

            # If matches changed compared to old, return flag to emit update
            old_set = set(old or [])
            new_set = set(contacts or [])
            changed = old_set != new_set
            return matches, changed
        except Exception as e:
            print(f"[CONTACTS] Error syncing: {e}")
            db.session.rollback()
            return [], False

    def AddFriendRequest(sender_id, target_user_id=None, target_phone=None):
        """Create a Friend request record from sender_id to target (by id or phone).
        Returns tuple (success:bool, message:str, friend_obj or None, target_user_id)
        """
        try:
            # Resolve target by id or phone
            target = None
            if target_user_id:
                target = User.query.get(int(target_user_id))
            elif target_phone:
                target = User.query.filter_by(phone_number=target_phone).first()

            if not target:
                return False, 'target_not_found', None, None

            # Check existing relationship (any direction)
            exists = Friend.query.filter(((Friend.user_id==sender_id) & (Friend.friend_id==target.id)) | ((Friend.user_id==target.id) & (Friend.friend_id==sender_id))).first()
            if exists:
                # If already accepted or pending, return appropriate message
                return False, 'already_exists', exists, target.id

            fr = Friend(user_id=sender_id, friend_id=target.id, status='pending')
            db.session.add(fr)
            db.session.commit()
            return True, 'created', fr, target.id
        except Exception as e:
            print(f"[FRIENDS] Error creating friend request: {e}")
            db.session.rollback()
            return False, 'error', None, None

    def AcceptFriendRequest(request_id, accepter_user_id):
        """Accept a friend request. Only the recipient (friend_id) may accept.
        Returns tuple (success, msg, friend_obj, requester_id)
        """
        try:
            fr = Friend.query.get(int(request_id))
            if not fr:
                return False, 'not_found', None, None

            # The accepter must match the friend_id (target)
            if int(fr.friend_id) != int(accepter_user_id):
                return False, 'not_authorized', None, None

            fr.status = 'accepted'
            db.session.commit()
            requester_id = fr.user_id
            return True, 'accepted', fr, requester_id
        except Exception as e:
            print(f"[FRIENDS] Error accepting friend request: {e}")
            db.session.rollback()
            return False, 'error', None, None

    def RejectFriendRequest(request_id, rejector_user_id):
        """Reject (or delete) a friend request. Only the recipient may reject.
        Returns (success, msg, requester_id)
        """
        try:
            fr = Friend.query.get(int(request_id))
            if not fr:
                return False, 'not_found', None
            if int(fr.friend_id) != int(rejector_user_id):
                return False, 'not_authorized', None

            requester_id = fr.user_id
            # delete the pending request
            db.session.delete(fr)
            db.session.commit()
            return True, 'rejected', requester_id
        except Exception as e:
            print(f"[FRIENDS] Error rejecting friend request: {e}")
            db.session.rollback()
            return False, 'error', None

    @socketio.on('connect')
    def handle_connect():
        ip = request.remote_addr
        print(f"[CHAT][NHẬN] [CONNECT] Connected from {ip}, sid={request.sid}")
        emit('connected', {'msg': 'Connected to chat server'})

    @socketio.on('join')
    def handle_join(data):
        """
        Expect data to include either:
          - user_id: join user's personal room named `user-<id>`
          - room: arbitrary room name (e.g., `group-<id>` or conversation room)
        """
        print(f"[CHAT][NHẬN] [JOIN] sid={request.sid} data={data}")
        
        user_id = data.get('user_id')
        room = data.get('room')
        
        if user_id:
            room_name = f'user-{user_id}'
            # Store user_id -> sid mapping
            user_sockets[user_id] = request.sid
            print(f"[CHAT][NHẬN] ✅ Stored mapping: user_id={user_id} → sid={request.sid}")
            
            # Update user status to online in database
            try:
                user = User.query.get(int(user_id))
                if user:
                    user.status = 'online'
                    db.session.commit()
                    print(f"[CHAT][NHẬN] ✅ Updated user {user_id} status to 'online'")
            except Exception as e:
                print(f"[CHAT][NHẬN] ⚠️  Error updating user status: {e}")
                db.session.rollback()
        elif room:
            room_name = room
            print(f"Using explicit room: {room_name}")
        else:
            # nothing sensible to join
            print("❌ No user_id or room provided")
            print("[JOIN] END - FAILED\n")
            return

        join_room(room_name)
        print(f"[CHAT][GỬI] ✅ User joined room: {room_name}")
        print(f"[CHAT][NHẬN] Current user_sockets mapping: {user_sockets}")
        
        socketio.emit('user_joined', {'user_id': user_id, 'room': room_name}, room=room_name)
        
        # Broadcast online status to all connected users
        if user_id:
            socketio.emit('user_status_changed', {'user_id': user_id, 'status': 'online'}, broadcast=True)
            print(f"[CHAT][GỬI] ✅ Broadcasted user {user_id} online status")
        
        print("[CHAT][GỬI] [JOIN] END - SUCCESS")

    @socketio.on('send_message')
    def handle_send_message(data):
        """Handle 1:1 messages with support for reply_to, forward_from, reactions."""
        sender_id = data.get('sender_id')
        receiver_id = data.get('receiver_id')
        content = data.get('content')
        client_message_id = data.get('client_message_id')  # For ACK tracking
        reply_to_id = data.get('reply_to_id')  # Message ID being replied to
        forward_from_id = data.get('forward_from_id')  # Message ID being forwarded
        
        print(f"[CHAT][NHẬN] [SEND_MESSAGE] sid={request.sid} sender_id={sender_id} receiver_id={receiver_id} client_msg_id={client_message_id} content_preview={content[:30] if content else 'N/A'}")

        if not sender_id or not receiver_id or not content:
            print(f"[ERROR] Missing required fields: sender={sender_id}, receiver={receiver_id}, content_exists={bool(content)}")
            print("[SEND_MESSAGE] END - FAILED (missing fields)\n")
            return

        try:
            # Save message to DB
            # Check block list: if receiver has blocked sender, refuse delivery
            blocked = Block.query.filter_by(user_id=receiver_id, target_id=sender_id).first()
            if blocked:
                print(f"[CHAT][NHẬN] Sender {sender_id} is blocked by receiver {receiver_id} - rejecting send")
                # Inform sender that message was blocked
                if client_message_id:
                    ack_data = {
                        'client_message_id': client_message_id,
                        'status': 'blocked',
                    }
                    socketio.emit('message_sent_ack', ack_data, room=request.sid)
                return
            msg = Message(
                sender_id=sender_id, 
                receiver_id=receiver_id, 
                content=content
            )
            db.session.add(msg)
            db.session.commit()
            print(f"[CHAT][GỬI] ✅ Message saved to DB: message_id={msg.id}, timestamp={msg.timestamp}")
        except Exception as e:
            print(f"[ERROR] ❌ ERROR saving message to DB: {e}")
            db.session.rollback()
            print("[SEND_MESSAGE] END - FAILED (DB save)\n")
            return

        # Prepare message data to broadcast
        message_data = {
            'id': msg.id,
            'sender_id': sender_id,
            'receiver_id': receiver_id,
            'content': content,
            'timestamp': msg.timestamp.isoformat(),
            'status': 'sent',
            'reply_to_id': reply_to_id,
            'forward_from_id': forward_from_id,
        }
        
        # Send ACK back to sender (to confirm message saved with real ID)
        if client_message_id:
            ack_data = {
                'client_message_id': client_message_id,
                'message_id': msg.id,
                'status': 'sent',
            }
            print(f"[CHAT][GỬI] 📋 Sending ACK to sender: {ack_data}")
            socketio.emit('message_sent_ack', ack_data, room=request.sid)
        
        # Broadcast to receiver's room
        receiver_room = f'user-{receiver_id}'
        print(f"[CHAT][GỬI] 📤 Emitting to receiver room '{receiver_room}'...")
        try:
            socketio.emit('receive_message', message_data, room=receiver_room)
            print(f"[CHAT][GỬI] ✅ Emitted to {receiver_room}")
        except Exception as e:
            print(f"[ERROR] ❌ ERROR emitting to {receiver_room}: {e}")
        
        print("[CHAT][GỬI] [SEND_MESSAGE] END - SUCCESS")

    @socketio.on('add_reaction')
    def handle_add_reaction(data):
        """Handle emoji reactions to messages."""
        message_id = data.get('message_id')
        user_id = data.get('user_id')
        reaction = data.get('reaction')  # emoji like '❤️', '😂', etc
        
        print(f"[CHAT][NHẬN] [REACTION] message_id={message_id} user={user_id} reaction={reaction}")
        if not message_id or not user_id or not reaction:
            print('[REACTION] Missing fields')
            return

        try:
            # avoid duplicate same-reaction by same user
            exists = MessageReaction.query.filter_by(message_id=message_id, user_id=user_id, reaction_type=reaction).first()
            if exists:
                print('[REACTION] Reaction already exists, ignoring')
            else:
                mr = MessageReaction(message_id=message_id, user_id=user_id, reaction_type=reaction)
                db.session.add(mr)
                db.session.commit()
                print(f'[REACTION] Saved reaction id={mr.id}')

            # Aggregate reactions for this message
            reactions = MessageReaction.query.filter_by(message_id=message_id).all()
            agg = {}
            for r in reactions:
                agg.setdefault(r.reaction_type, []).append(r.user_id)

            # Emit aggregated reactions to interested parties (sender & receiver rooms)
            msg = Message.query.get(message_id)
            target_rooms = set()
            if msg:
                target_rooms.add(f'user-{msg.sender_id}')
                target_rooms.add(f'user-{msg.receiver_id}')
            else:
                # fallback: broadcast
                target_rooms = None

            payload = {
                'message_id': message_id,
                'reactions': agg
            }
            if target_rooms:
                for r in target_rooms:
                    try:
                        socketio.emit('message_reaction', payload, room=r)
                    except Exception as e:
                        print(f'[REACTION] Error emitting to {r}: {e}')
            else:
                socketio.emit('message_reaction', payload, broadcast=True)
        except Exception as e:
            print(f'[REACTION] Error saving/emitting reaction: {e}')

    @socketio.on('send_sticker')
    def handle_send_sticker(data):
        """Handle sticker messages (Giphy, EmojiOne, Twemoji, custom pack)."""
        sender_id = data.get('sender_id')
        receiver_id = data.get('receiver_id')
        sticker_id = data.get('sticker_id')  # Giphy ID or custom pack ID
        sticker_url = data.get('sticker_url')  # URL for sticker image
        client_message_id = data.get('client_message_id')
        
        print(f"[CHAT][NHẬN] [STICKER] sender={sender_id} receiver={receiver_id} sticker_id={sticker_id}")
        
        if not sender_id or not receiver_id or not sticker_url:
            print(f"[ERROR] Missing required fields for sticker")
            print("[STICKER] END - FAILED\n")
            return
        
        try:
            # Save sticker message to DB
            msg = Message(
                sender_id=sender_id,
                receiver_id=receiver_id,
                content=sticker_url,
                message_type='sticker',
                sticker_id=sticker_id,
                sticker_url=sticker_url
            )
            db.session.add(msg)
            db.session.commit()
            print(f"[CHAT][GỬI] ✅ Sticker saved to DB: message_id={msg.id}")
        except Exception as e:
            print(f"[ERROR] ❌ ERROR saving sticker to DB: {e}")
            db.session.rollback()
            print("[STICKER] END - FAILED (DB save)\n")
            return
        
        # Prepare sticker message data
        sticker_data = {
            'id': msg.id,
            'sender_id': sender_id,
            'receiver_id': receiver_id,
            'message_type': 'sticker',
            'sticker_id': sticker_id,
            'sticker_url': sticker_url,
            'timestamp': msg.timestamp.isoformat(),
            'status': 'sent',
        }
        
        # Send ACK back to sender
        if client_message_id:
            ack_data = {
                'client_message_id': client_message_id,
                'message_id': msg.id,
                'status': 'sent',
            }
            print(f"[CHAT][GỬI] 📋 Sending ACK for sticker to sender: {ack_data}")
            socketio.emit('message_sent_ack', ack_data, room=request.sid)
        
        # Broadcast to receiver's room
        receiver_room = f'user-{receiver_id}'
        print(f"[CHAT][GỬI] 📤 Emitting sticker to receiver room '{receiver_room}'...")
        try:
            socketio.emit('receive_message', sticker_data, room=receiver_room)
            print(f"[CHAT][GỬI] ✅ Sticker emitted to {receiver_room}")
        except Exception as e:
            print(f"[ERROR] ❌ ERROR emitting sticker to {receiver_room}: {e}")
        
        print("[CHAT][GỬI] [STICKER] END - SUCCESS")

    @socketio.on('typing')
    def handle_typing(data):
        """Broadcast typing indicator."""
        sender_id = data.get('sender_id')
        receiver_id = data.get('receiver_id')
        is_typing = data.get('is_typing', False)
        
        print(f"[CHAT][NHẬN] [TYPING] sender={sender_id} receiver={receiver_id} typing={is_typing}")
        
        # Send to receiver only
        receiver_room = f'user-{receiver_id}'
        socketio.emit('user_typing', {
            'sender_id': sender_id,
            'is_typing': is_typing
        }, room=receiver_room)
        print(f"[CHAT][GỬI] user_typing -> room={receiver_room}")

    @socketio.on('command')
    def handle_command(payload):
        """Handle generic JSON command payloads from client.
        Expected format: { action: 'GET_CONTACTS_LIST', data: {...}, token: 'jwt' }
        Responds with event 'command_response' and a JSON body containing status/action/data.
        """
        try:
            print(f"[CHAT][NHẬN] [COMMAND] from sid={request.sid} payload={payload}")
            if not payload or not isinstance(payload, dict):
                socketio.emit('command_response', {'status': 'ERROR', 'action': None, 'error': 'Invalid payload'}, room=request.sid)
                return

            action = payload.get('action')
            if action == 'GET_CONTACTS_LIST':
                token = payload.get('token')
                auth = decode_token(token) if token else None
                if not auth:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'CONTACTS_LIST_RESULT', 'error': 'Invalid token'}, room=request.sid)
                    return
                user_id = auth.get('user_id')
                contacts = GetContactsList(user_id)
                socketio.emit('command_response', {'status': 'SUCCESS', 'action': 'CONTACTS_LIST_RESULT', 'data': contacts}, room=request.sid)
                print(f"[CHAT][GỬI] [COMMAND] CONTACTS_LIST_RESULT sent to sid={request.sid}")
                return

            if action == 'FRIEND_REQUEST':
                token = payload.get('token')
                auth = decode_token(token) if token else None
                if not auth:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'FRIEND_REQUEST_SENT', 'error': 'Invalid token'}, room=request.sid)
                    return
                sender_id = auth.get('user_id')
                data = payload.get('data') or {}
                target_phone = data.get('target_phone')
                target_user_id = data.get('target_user_id')

                ok, msg, friend_obj, target_id = AddFriendRequest(sender_id, target_user_id=target_user_id, target_phone=target_phone)
                if not ok:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'FRIEND_REQUEST_SENT', 'error': msg}, room=request.sid)
                    return

                # Notify sender that request was created
                socketio.emit('command_response', {'status': 'SUCCESS', 'action': 'FRIEND_REQUEST_SENT', 'data': {'friend_id': friend_obj.id, 'target_user_id': target_id}}, room=request.sid)

                # Notify target user in real-time (if they're online in their room)
                try:
                    target_room = f'user-{target_id}'
                    socketio.emit('friend_request_received', {'event': 'FRIEND_REQUEST_RECEIVED', 'from_user': str(sender_id)}, room=target_room)
                    print(f"[CHAT][GỬI] Friend request real-time -> room={target_room}")
                except Exception as e:
                    print(f"[FRIENDS] Error emitting real-time notify: {e}")

                return

            if action == 'BLOCK_USER':
                token = payload.get('token')
                auth = decode_token(token) if token else None
                if not auth:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'BLOCK_USER', 'error': 'Invalid token'}, room=request.sid)
                    return
                user_id = auth.get('user_id')
                data = payload.get('data') or {}
                target = data.get('target')
                if not target:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'BLOCK_USER', 'error': 'missing_target'}, room=request.sid)
                    return
                # allow target either as id or string numeric
                try:
                    target_id = int(target)
                except Exception:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'BLOCK_USER', 'error': 'invalid_target'}, room=request.sid)
                    return
                ok, res = AddBlock(user_id, target_id)
                if not ok:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'BLOCK_USER', 'error': res}, room=request.sid)
                    return
                socketio.emit('command_response', {'status': 'SUCCESS', 'action': 'BLOCK_USER', 'data': {'target_id': str(target_id)}}, room=request.sid)
                # notify target (optional)
                try:
                    target_room = f'user-{target_id}'
                    socketio.emit('user_blocked', {'event': 'USER_BLOCKED', 'by_user': str(user_id)}, room=target_room)
                except Exception as e:
                    print(f"[BLOCK] error notifying target: {e}")
                return

            if action == 'UNBLOCK_USER':
                token = payload.get('token')
                auth = decode_token(token) if token else None
                if not auth:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'UNBLOCK_USER', 'error': 'Invalid token'}, room=request.sid)
                    return
                user_id = auth.get('user_id')
                data = payload.get('data') or {}
                target = data.get('target')
                if not target:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'UNBLOCK_USER', 'error': 'missing_target'}, room=request.sid)
                    return
                try:
                    target_id = int(target)
                except Exception:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'UNBLOCK_USER', 'error': 'invalid_target'}, room=request.sid)
                    return
                ok, res = RemoveBlock(user_id, target_id)
                if not ok:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'UNBLOCK_USER', 'error': res}, room=request.sid)
                    return
                socketio.emit('command_response', {'status': 'SUCCESS', 'action': 'UNBLOCK_USER', 'data': {'target_id': str(target_id)}}, room=request.sid)
                return

            if action == 'FRIEND_ACCEPT' or action == 'FRIEND_REJECT':
                token = payload.get('token')
                auth = decode_token(token) if token else None
                if not auth:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': action, 'error': 'Invalid token'}, room=request.sid)
                    return
                actor_id = auth.get('user_id')
                data = payload.get('data') or {}
                request_id = data.get('request_id')
                if not request_id:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': action, 'error': 'missing_request_id'}, room=request.sid)
                    return

                if action == 'FRIEND_ACCEPT':
                    ok, msg, fr_obj, requester_id = AcceptFriendRequest(request_id, actor_id)
                    if not ok:
                        socketio.emit('command_response', {'status': 'ERROR', 'action': 'FRIEND_ACCEPT', 'error': msg}, room=request.sid)
                        return
                    # Notify accepter (actor) of success
                    socketio.emit('command_response', {'status': 'SUCCESS', 'action': 'FRIEND_ACCEPT', 'data': {'request_id': request_id, 'friend_id': fr_obj.id}}, room=request.sid)
                    # Notify original requester in real-time
                    try:
                        requester_room = f'user-{requester_id}'
                        socketio.emit('friend_request_accepted', {'event': 'FRIEND_ACCEPTED', 'user_id': str(actor_id)}, room=requester_room)
                        print(f"[CHAT][GỬI] Friend accepted notify -> room={requester_room}")
                    except Exception as e:
                        print(f"[FRIENDS] Error emitting accepted notify: {e}")
                    return

                if action == 'FRIEND_REJECT':
                    ok, msg, requester_id = RejectFriendRequest(request_id, actor_id)
                    if not ok:
                        socketio.emit('command_response', {'status': 'ERROR', 'action': 'FRIEND_REJECT', 'error': msg}, room=request.sid)
                        return
                    socketio.emit('command_response', {'status': 'SUCCESS', 'action': 'FRIEND_REJECT', 'data': {'request_id': request_id}}, room=request.sid)
                    try:
                        requester_room = f'user-{requester_id}'
                        socketio.emit('friend_request_rejected', {'event': 'FRIEND_REJECTED', 'user_id': str(actor_id)}, room=requester_room)
                        print(f"[CHAT][GỬI] Friend rejected notify -> room={requester_room}")
                    except Exception as e:
                        print(f"[FRIENDS] Error emitting rejected notify: {e}")
                    return

            if action == 'CONTACTS_SYNC':
                token = payload.get('token')
                auth = decode_token(token) if token else None
                if not auth:
                    socketio.emit('command_response', {'status': 'ERROR', 'action': 'CONTACTS_SYNC_RESULT', 'error': 'Invalid token'}, room=request.sid)
                    return
                user_id = auth.get('user_id')
                data = payload.get('data') or {}
                contacts = data.get('contacts') or []
                matches, changed = SyncContacts(user_id, contacts)
                socketio.emit('command_response', {'status': 'SUCCESS', 'action': 'CONTACTS_SYNC_RESULT', 'friends': matches}, room=request.sid)
                if changed:
                    # emit contact updated event to user room
                    try:
                        socketio.emit('contact_updated', {'event': 'CONTACT_UPDATED', 'data': matches}, room=request.sid)
                    except Exception as e:
                        print(f"[CONTACTS] Error emitting update: {e}")
                return

            # Unknown action
            socketio.emit('command_response', {'status': 'ERROR', 'action': action, 'error': 'Unknown action'}, room=request.sid)
        except Exception as e:
            print(f"[COMMAND] Error handling command: {e}")
            socketio.emit('command_response', {'status': 'ERROR', 'action': None, 'error': 'Server error'}, room=request.sid)

    @socketio.on('edit_message')
    def handle_edit_message(data):
        """Allow sender to edit their message. data: { message_id, user_id, new_content }"""
        message_id = data.get('message_id')
        user_id = data.get('user_id')
        new_content = data.get('new_content')
        print(f"[CHAT][NHẬN] [EDIT] message_id={message_id} user={user_id}")
        if not message_id or not user_id or new_content is None:
            print('[EDIT] Missing fields')
            return
        try:
            msg = Message.query.get(message_id)
            if not msg:
                print('[EDIT] Message not found')
                return
            if int(msg.sender_id) != int(user_id):
                print('[EDIT] User not owner of message')
                return
            msg.content = new_content
            from datetime import datetime
            msg.timestamp = datetime.utcnow()
            db.session.commit()
            # Emit update to participants
            target_rooms = [f'user-{msg.sender_id}', f'user-{msg.receiver_id}']
            payload = {
                'message_id': message_id,
                'new_content': new_content,
                'timestamp': msg.timestamp.isoformat()
            }
            for r in set(target_rooms):
                try:
                    socketio.emit('message_edited', payload, room=r)
                except Exception as e:
                    print(f'[EDIT] Error emitting to {r}: {e}')
            print('[EDIT] Success')
        except Exception as e:
            db.session.rollback()
            print('[EDIT] Error:', e)

    @socketio.on('recall_message')
    def handle_recall_message(data):
        """Allow sender to recall (delete) a message. data: { message_id, user_id }"""
        message_id = data.get('message_id')
        user_id = data.get('user_id')
        print(f"[CHAT][NHẬN] [RECALL] message_id={message_id} user={user_id}")
        if not message_id or not user_id:
            print('[RECALL] Missing fields')
            return
        try:
            msg = Message.query.get(message_id)
            if not msg:
                print('[RECALL] Message not found')
                return
            if int(msg.sender_id) != int(user_id):
                print('[RECALL] User not owner of message')
                return
            # Simple recall: delete row from DB
            db.session.delete(msg)
            db.session.commit()
            payload = {'message_id': message_id}
            target_rooms = [f'user-{user_id}', f'user-{msg.receiver_id}']
            for r in set(target_rooms):
                try:
                    socketio.emit('message_recalled', payload, room=r)
                except Exception as e:
                    print(f'[RECALL] Error emitting to {r}: {e}')
            print('[RECALL] Success')
        except Exception as e:
            db.session.rollback()
            print('[RECALL] Error:', e)

    @socketio.on('disconnect')
    def handle_disconnect(data=None):
        print(f"[CHAT][NHẬN] [DISCONNECT] sid={request.sid}")
        # Remove user_id from mapping on disconnect and set offline
        disconnected_user_id = None
        for uid, sid in list(user_sockets.items()):
            if sid == request.sid:
                del user_sockets[uid]
                disconnected_user_id = uid
                print(f"[CHAT][NHẬN] ✅ Removed user_id={uid} from mapping")
                
                # Update user status to offline in database
                try:
                    user = User.query.get(int(uid))
                    if user:
                        user.status = 'offline'
                        db.session.commit()
                        print(f"[CHAT][NHẬN] ✅ Updated user {uid} status to 'offline'")
                except Exception as e:
                    print(f"[CHAT][NHẬN] ⚠️  Error updating user status: {e}")
                    db.session.rollback()
                break
        
        # Broadcast offline status to all connected users
        if disconnected_user_id:
            socketio.emit('user_status_changed', {'user_id': disconnected_user_id, 'status': 'offline'}, broadcast=True)
            print(f"[CHAT][GỬI] ✅ Broadcasted user {disconnected_user_id} offline status")
        
        # Legacy offline event for backward compatibility
        emit('user_offline', {'sid': request.sid}, broadcast=True)
        print("[CHAT][GỬI] [DISCONNECT] END")
