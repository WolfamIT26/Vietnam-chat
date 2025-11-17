import io from 'socket.io-client';

/**
 * Socket.IO Service - Kết nối WebSocket với Flask backend
 * Quản lý real-time events: connect, disconnect, send_message, receive_message
 */

// Auto-detect socket URL: if REACT_APP_SOCKET_URL is set, use it; otherwise build from current host
let SOCKET_URL = process.env.REACT_APP_SOCKET_URL;

// In development prefer an explicit backend socket URL so sockets connect to the backend (not to the CRA dev server)
if (!SOCKET_URL) {
  if (process.env.NODE_ENV === 'development') {
    SOCKET_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
  } else {
    SOCKET_URL = window.location.origin;
  }
}
const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
  console.debug('');
  console.debug('═══════════════════════════════════════════════════════════');
  console.debug('🔗 [SOCKET] INITIALIZATION');
  console.debug('═══════════════════════════════════════════════════════════');
  console.debug(`📍 SOCKET_URL: ${SOCKET_URL}`);
  console.debug(`📍 Current location: ${window.location.href}`);
  console.debug(`📍 Hostname: ${window.location.hostname}`);
  console.debug(`📍 Protocol: ${window.location.protocol}`);
  console.debug('═══════════════════════════════════════════════════════════');
  console.debug('');
}

let socket = null;

// Tạo kết nối Socket.IO
export const initializeSocket = () => {
  if (socket) {
    if (isDev) console.debug('[SOCKET] Socket already initialized, returning existing instance');
    return socket;
  }
  if (isDev) console.debug('[SOCKET] Attempting to connect to', SOCKET_URL);
  socket = io(SOCKET_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    if (isDev) {
      console.debug('');
      console.debug('✅ [SOCKET] Connected successfully!');
      console.debug(`   sid: ${socket.id}`);
      console.debug('');
    }
  });

  socket.on('disconnect', () => {
    if (isDev) console.debug('❌ [SOCKET] Disconnected');
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
  if (isDev) console.debug('[COMMAND] Emitting command:', cmd);
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
    if (isDev) console.debug('[COMMAND_RESPONSE] Received:', data);
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
  if (isDev) console.debug(`\n[JOIN] Attempting to join user room: user-${userId}`);
  if (!sock || !sock.connected) {
    console.warn(`[JOIN] ⚠️  Socket not connected yet (connected=${sock?.connected}), will retry in 500ms`);
    setTimeout(() => joinUserRoom(userId), 500);
    return;
  }
  if (isDev) console.debug(`[JOIN] ✅ Socket connected, emitting join event...`);
  sock.emit('join', { user_id: userId });
  if (isDev) console.debug(`[JOIN] ✅ Join event emitted for user_id: ${userId}\n`);
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
  sock.emit('send_message', payload);
  // debug output only in development
  if (isDev) sendMessageDebug(payload, sock);
};
// wrap send message debug logs in dev-only
export const sendMessageDebug = (payload, sock) => {
  if (!isDev) return;
  console.debug('\n========== [SEND_MESSAGE] CLIENT ==========');
  console.debug('Payload:', payload);
  console.debug('Socket connected?', sock?.connected);
  console.debug('Socket id:', sock?.id);
  console.debug('✅ Emitted to server');
  console.debug('========== \n');
};

// Gửi reaction (cảm xúc)
export const sendReaction = (messageId, userId, reaction) => {
  const sock = getSocket();
  if (isDev) console.debug('[ADD_REACTION] message_id:', messageId, 'reaction:', reaction);
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
  sock.emit('send_sticker', payload);
  if (isDev) {
    console.debug('\n========== [SEND_STICKER] CLIENT ==========');
    console.debug('Payload:', payload);
    console.debug('Socket connected?', sock?.connected);
    console.debug('✅ Sticker emitted to server');
    console.debug('========== \n');
  }
};

// Gửi typing indicator
export const sendTyping = (senderId, receiverId, isTyping) => {
  const sock = getSocket();
  if (isDev) console.debug('[SEND_TYPING] sender:', senderId, 'receiver:', receiverId, 'is_typing:', isTyping);
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
    if (isDev) {
      console.debug('\n========== [RECEIVE_MESSAGE] CLIENT ==========');
      console.debug('Received:', data);
      console.debug('========== \n');
    }
    callback(data);
  });
};

// Lắng nghe message_sent_ack (server xác nhận message đã lưu)
export const onMessageSentAck = (callback) => {
  const sock = getSocket();
  sock.off('message_sent_ack');
  sock.on('message_sent_ack', (data) => {
    if (isDev) console.debug('[MESSAGE_SENT_ACK]', data);
    callback(data);
  });
};

// Lắng nghe reactions (setup once, auto-cleanup old listeners)
export const onReaction = (callback) => {
  const sock = getSocket();
  // Off previous listeners to avoid duplicates
  sock.off('message_reaction');
  sock.on('message_reaction', (data) => {
    if (isDev) console.debug('[REACTION]', data);
    callback(data);
  });
};

// Lắng nghe typing indicator (setup once, auto-cleanup old listeners)
export const onTyping = (callback) => {
  const sock = getSocket();
  // Off previous listeners to avoid duplicates
  sock.off('user_typing');
  sock.on('user_typing', (data) => {
    if (isDev) console.debug('[TYPING]', data);
    callback(data);
  });
};

// Lắng nghe user offline
export const onUserOffline = (callback) => {
  const sock = getSocket();
  sock.on('user_offline', callback);
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
    if (isDev) console.debug('[FRIEND_REQUEST_RECEIVED]', data);
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
    if (isDev) console.debug('[FRIEND_REQUEST_ACCEPTED]', data);
    callback(data);
  });
};

export const onFriendRejected = (callback) => {
  const sock = getSocket();
  sock.off('friend_request_rejected');
  sock.on('friend_request_rejected', (data) => {
    if (isDev) console.debug('[FRIEND_REQUEST_REJECTED]', data);
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
    if (isDev) console.debug('[USER_BLOCKED]', data);
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
    if (isDev) console.debug('[CONTACT_UPDATED]', data);
    callback(data);
  });
};
