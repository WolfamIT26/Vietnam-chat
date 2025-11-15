from flask_socketio import emit, join_room, leave_room
from flask import request
from models.user_model import User
from models.message_model import Message
from config.database import db
import logging

# Store mapping of user_id -> socket.sid for direct targeting
user_sockets = {}

def register_chat_events(socketio):
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
        
        # Broadcast reaction to all clients
        reaction_data = {
            'message_id': message_id,
            'user_id': user_id,
            'reaction': reaction
        }
        socketio.emit('message_reaction', reaction_data, broadcast=True)

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

    @socketio.on('disconnect')
    def handle_disconnect(data=None):
        print(f"[CHAT][NHẬN] [DISCONNECT] sid={request.sid}")
        # Remove user_id from mapping on disconnect
        for uid, sid in list(user_sockets.items()):
            if sid == request.sid:
                del user_sockets[uid]
                print(f"[CHAT][NHẬN] ✅ Removed user_id={uid} from mapping")
                break
        # Use emit (not socketio.emit) with broadcast=True to broadcast to all
        emit('user_offline', {'sid': request.sid}, broadcast=True)
        print("[CHAT][GỬI] [DISCONNECT] END")
