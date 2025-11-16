import io from 'socket.io-client';

/**
 * Socket.IO Service - Kết nối WebSocket với Flask backend
 * Quản lý real-time events: connect, disconnect, send_message, receive_message
 */

// Auto-detect socket URL: if REACT_APP_SOCKET_URL is set, use it; otherwise build from current host
let SOCKET_URL = process.env.REACT_APP_SOCKET_URL;

if (!SOCKET_URL) {
  // Default: use the same origin (hostname + protocol + port) where the app is loaded from
  // This way: localhost:3000 -> localhost:3000 (via proxy), ngrok URL -> ngrok URL
  // Only if specifically needed (e.g., dev server behind proxy), override REACT_APP_SOCKET_URL
  SOCKET_URL = window.location.origin;
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('🔗 [SOCKET] INITIALIZATION');
console.log('═══════════════════════════════════════════════════════════');
console.log(`📍 SOCKET_URL: ${SOCKET_URL}`);
console.log(`📍 Current location: ${window.location.href}`);
console.log(`📍 Hostname: ${window.location.hostname}`);
console.log(`📍 Protocol: ${window.location.protocol}`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');

let socket = null;

// Tạo kết nối Socket.IO
export const initializeSocket = () => {
  if (socket) {
    console.log('[SOCKET] Socket already initialized, returning existing instance');
    return socket;
  }

  console.log('[SOCKET] Attempting to connect to', SOCKET_URL);
  socket = io(SOCKET_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('');
    console.log('✅ [SOCKET] Connected successfully!');
    console.log(`   sid: ${socket.id}`);
    console.log('');
  });

  socket.on('disconnect', () => {
    console.log('❌ [SOCKET] Disconnected');
  });

  socket.on('connect_error', (error) => {
    console.error('❌ [SOCKET] Connection error:', error);
  });

  return socket;
};

// Lấy socket instance
export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

// Đóng kết nối Socket
export const closeSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// Generic send command (JSON-style): { action: 'SOMETHING', data: {...}, token }
export const sendCommand = (cmd) => {
  const sock = getSocket();
  console.log('[COMMAND] Emitting command:', cmd);
  sock.emit('command', cmd);
};

// Convenience: request contacts list via command format
export const requestContactsList = (token) => {
  sendCommand({ action: 'GET_CONTACTS_LIST', data: {}, token });
};

// Listen for generic command responses from server
export const onCommandResponse = (callback) => {
  const sock = getSocket();
  sock.off('command_response');
  sock.on('command_response', (data) => {
    console.log('[COMMAND_RESPONSE] Received:', data);
    try {
      callback(data);
    } catch (e) {
      console.error('Error in command response callback:', e);
    }
  });
};

// Tham gia room chat
export const joinUserRoom = (userId) => {
  const sock = getSocket();
  console.log(`\n[JOIN] Attempting to join user room: user-${userId}`);
  if (!sock || !sock.connected) {
    console.warn(`[JOIN] ⚠️  Socket not connected yet (connected=${sock?.connected}), will retry in 500ms`);
    setTimeout(() => joinUserRoom(userId), 500);
    return;
  }
  console.log(`[JOIN] ✅ Socket connected, emitting join event...`);
  sock.emit('join', { user_id: userId });
  console.log(`[JOIN] ✅ Join event emitted for user_id: ${userId}\n`);
};

// Gửi tin nhắn qua Socket (có hỗ trợ reply_to, forward_from, client_message_id)
export const sendMessage = (senderId, receiverId, content, opts = {}) => {
  const sock = getSocket();
  const payload = {
    sender_id: senderId,
    receiver_id: receiverId,
    content,
    client_message_id: opts.client_message_id || null,
    reply_to_id: opts.reply_to_id || null,
    forward_from_id: opts.forward_from_id || null,
  };
  console.log('\n========== [SEND_MESSAGE] CLIENT ==========');
  console.log('Payload:', payload);
  console.log('Socket connected?', sock?.connected);
  console.log('Socket id:', sock?.id);
  sock.emit('send_message', payload);
  console.log('✅ Emitted to server');
  console.log('========== \n');
};

// Gửi reaction (cảm xúc)
export const sendReaction = (messageId, userId, reaction) => {
  const sock = getSocket();
  console.log('[ADD_REACTION] message_id:', messageId, 'reaction:', reaction);
  sock.emit('add_reaction', {
    message_id: messageId,
    user_id: userId,
    reaction,
  });
};

// Gửi sticker (Giphy, EmojiOne, Twemoji, custom pack)
export const sendSticker = (senderId, receiverId, stickerId, stickerUrl, opts = {}) => {
  const sock = getSocket();
  const payload = {
    sender_id: senderId,
    receiver_id: receiverId,
    sticker_id: stickerId,
    sticker_url: stickerUrl,
    client_message_id: opts.client_message_id || null,
  };
  console.log('\n========== [SEND_STICKER] CLIENT ==========');
  console.log('Payload:', payload);
  console.log('Socket connected?', sock?.connected);
  sock.emit('send_sticker', payload);
  console.log('✅ Sticker emitted to server');
  console.log('========== \n');
};

// Gửi typing indicator
export const sendTyping = (senderId, receiverId, isTyping) => {
  const sock = getSocket();
  console.log('[SEND_TYPING] sender:', senderId, 'receiver:', receiverId, 'is_typing:', isTyping);
  sock.emit('typing', {
    sender_id: senderId,
    receiver_id: receiverId,
    is_typing: isTyping,
  });
};
// Lắng nghe tin nhắn nhận được (setup once, auto-cleanup old listeners)
export const onReceiveMessage = (callback) => {
  const sock = getSocket();
  // Off previous listeners to avoid duplicates
  sock.off('receive_message');
  sock.on('receive_message', (data) => {
    console.log('\n========== [RECEIVE_MESSAGE] CLIENT ==========');
    console.log('Received:', data);
    console.log('========== \n');
    callback(data);
  });
};

// Lắng nghe message_sent_ack (server xác nhận message đã lưu)
export const onMessageSentAck = (callback) => {
  const sock = getSocket();
  sock.off('message_sent_ack');
  sock.on('message_sent_ack', (data) => {
    console.log('[MESSAGE_SENT_ACK]', data);
    callback(data);
  });
};

// Lắng nghe reactions (setup once, auto-cleanup old listeners)
export const onReaction = (callback) => {
  const sock = getSocket();
  // Off previous listeners to avoid duplicates
  sock.off('message_reaction');
  sock.on('message_reaction', (data) => {
    console.log('[REACTION]', data);
    callback(data);
  });
};

// Lắng nghe typing indicator (setup once, auto-cleanup old listeners)
export const onTyping = (callback) => {
  const sock = getSocket();
  // Off previous listeners to avoid duplicates
  sock.off('user_typing');
  sock.on('user_typing', (data) => {
    console.log('[TYPING]', data);
    callback(data);
  });
};

// Lắng nghe user offline
export const onUserOffline = (callback) => {
  const sock = getSocket();
  sock.on('user_offline', callback);
};

// Lắng nghe user status changed (online/offline)
export const onUserStatusChanged = (callback) => {
  const sock = getSocket();
  sock.off('user_status_changed');
  sock.on('user_status_changed', (data) => {
    console.log('[USER_STATUS_CHANGED]', data);
    callback(data);
  });
};

// Lắng nghe user joined
export const onUserJoined = (callback) => {
  const sock = getSocket();
  sock.on('user_joined', callback);
};

// Send friend request using the command pattern
export const sendFriendRequest = ({ target_user_id = null, target_phone = null, token = null }) => {
  const cmd = { action: 'FRIEND_REQUEST', data: {}, token };
  if (target_user_id) cmd.data.target_user_id = target_user_id;
  if (target_phone) cmd.data.target_phone = target_phone;
  sendCommand(cmd);
};

// Listen for real-time friend request notifications (when someone sends you a request)
export const onFriendRequestReceived = (callback) => {
  const sock = getSocket();
  sock.off('friend_request_received');
  sock.on('friend_request_received', (data) => {
    console.log('[FRIEND_REQUEST_RECEIVED]', data);
    callback(data);
  });
};

// Send friend accept/reject using command pattern
export const sendFriendAccept = ({ request_id = null, token = null }) => {
  if (!request_id) return;
  sendCommand({ action: 'FRIEND_ACCEPT', data: { request_id }, token });
};

export const sendFriendReject = ({ request_id = null, token = null }) => {
  if (!request_id) return;
  sendCommand({ action: 'FRIEND_REJECT', data: { request_id }, token });
};

// Listen for real-time accepted notifications (when someone accepted your request)
export const onFriendAccepted = (callback) => {
  const sock = getSocket();
  sock.off('friend_request_accepted');
  sock.on('friend_request_accepted', (data) => {
    console.log('[FRIEND_REQUEST_ACCEPTED]', data);
    callback(data);
  });
};

export const onFriendRejected = (callback) => {
  const sock = getSocket();
  sock.off('friend_request_rejected');
  sock.on('friend_request_rejected', (data) => {
    console.log('[FRIEND_REQUEST_REJECTED]', data);
    callback(data);
  });
};

// Block/unblock user
export const sendBlockUser = ({ target = null, token = null }) => {
  if (!target) return;
  sendCommand({ action: 'BLOCK_USER', data: { target }, token });
};

export const sendUnblockUser = ({ target = null, token = null }) => {
  if (!target) return;
  sendCommand({ action: 'UNBLOCK_USER', data: { target }, token });
};

export const onUserBlocked = (callback) => {
  const sock = getSocket();
  sock.off('user_blocked');
  sock.on('user_blocked', (data) => {
    console.log('[USER_BLOCKED]', data);
    callback(data);
  });
};

// Contacts sync
export const requestContactsSync = (contacts = [], token = null) => {
  sendCommand({ action: 'CONTACTS_SYNC', data: { contacts }, token });
};

export const onContactUpdated = (callback) => {
  const sock = getSocket();
  sock.off('contact_updated');
  sock.on('contact_updated', (data) => {
    console.log('[CONTACT_UPDATED]', data);
    callback(data);
  });
};
