import React, { useEffect, useState, useRef } from 'react';
import { initializeSocket, getSocket, sendMessage, onReceiveMessage, joinUserRoom, sendReaction, onReaction, sendTyping, onTyping, onMessageSentAck, sendSticker, requestContactsList, onCommandResponse, sendFriendRequest, onFriendRequestReceived, sendFriendAccept, sendFriendReject, onFriendAccepted, onFriendRejected, sendBlockUser, sendUnblockUser, onUserBlocked, requestContactsSync, onContactUpdated, onUserJoined, onUserOffline } from '../../services/socket';
import { showToast, showSystemNotification, playSound } from '../../services/notifications';
import api, { userAPI, messageAPI, groupAPI } from '../../services/api';
import profileSync from '../../services/profileSync';
import { uploadFile } from '../../services/upload';
import MessageBubble from './MessageBubble';
import StickerButton from './StickerButton';
import TypingIndicator from './TypingIndicator';
import LogoutButton from '../Auth/LogoutButton';
import ProfileModal from './ProfileModal';
import AvatarModal from './AvatarModal';
import EditProfileModal from './EditProfileModal';
import AddFriendModal from './AddFriendModal';
import CreateGroupModal from './CreateGroupModal';

/**
 * ChatBox - Giao diện chat chính
 * Kết nối Socket.IO, hiển thị danh sách messages, gửi tin nhắn
 */
const ChatBox = () => {
  const [users, setUsers] = useState([]);
  // Restore selectedUser from localStorage on mount
  const [selectedUser, setSelectedUser] = useState(() => {
    try {
      const saved = localStorage.getItem('selectedUser');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [typing, setTyping] = useState(false);
  const [currentUsername, setCurrentUsername] = useState('');

  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [blockedTargets, setBlockedTargets] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [filterTab, setFilterTab] = useState('conversations');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchContainerActive, setSearchContainerActive] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [otherProfileOpen, setOtherProfileOpen] = useState(false);
  const [otherProfileUser, setOtherProfileUser] = useState(null);
  
  // Build absolute avatar URL (prefix relative URLs with API base)
  const buildAvatarSrc = (avatar_url) => {
    try {
      // Basic validation: reject obviously-broken short tokens like 'profile'
      if (!avatar_url || (typeof avatar_url === 'string' && !avatar_url.includes('/') && !avatar_url.includes('.'))) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUsername||'U')}&background=ffffff&color=0b5ed7`;
      }
      if (typeof avatar_url === 'string') {
        // Data URLs should be used directly (they're already absolute)
        if (avatar_url.startsWith('data:')) return avatar_url;
        if (avatar_url.startsWith('http://') || avatar_url.startsWith('https://')) return avatar_url;
        // If avatar_url is a relative path (e.g. '/uploads/files/...'), prefix with API baseURL when available
        const base = (api && api.defaults && api.defaults.baseURL) ? api.defaults.baseURL : '';
        if (String(avatar_url).startsWith('/')) {
          return `${String(base).replace(/\/$/, '')}${avatar_url}`;
        }
        // otherwise, assume it's a relative path missing leading slash
        return `${String(base).replace(/\/$/, '')}/${avatar_url}`;
      }
    } catch (e) {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUsername||'U')}&background=ffffff&color=0b5ed7`;
    }
  };

  // Append a cache-busting timestamp to avatar URLs so updated images reload.
  // If URL already contains a `t=` param, replace it. Skip data: URLs.
  const cacheBustUrl = (url) => {
    try {
      if (!url || typeof url !== 'string') return url;
      if (url.startsWith('data:')) return url;
      const ts = Date.now();
      // remove existing t param if present
      const cleaned = url.replace(/([?&])t=\d+(&)?/, (m, p1, p2) => (p2 ? p1 : ''));
      return cleaned + (cleaned.includes('?') ? '&' : '?') + 't=' + ts;
    } catch (e) {
      return url;
    }
  };

  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', onConfirm: null });
  
  // New states for reply/forward/reaction
  const [replyTo, setReplyTo] = useState(null);
  const [reactions, setReactions] = useState({});
  const [remotePeerIsTyping, setRemotePeerIsTyping] = useState(false);
  
  // ReactionButton state
  const [defaultReaction, setDefaultReaction] = useState(() => {
    return localStorage.getItem('defaultReaction') || '👍';
  });
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  // Hover preview reaction (when user hovers emojis in a message bubble)
  const [hoverReaction, setHoverReaction] = useState(null);
  const hoverClearTimeoutRef = useRef(null);
  // Press & hold animation state for reaction button
  const [pressScale, setPressScale] = useState(1);
  const pressRafRef = useRef(null);
  const pressStartRef = useRef(null);
  const isPressingRef = useRef(false);
  const PRESS_DURATION = 800; // ms to reach full scale
  const MAX_PRESS_SCALE = 1.18;
  const keepScaledRef = useRef(false);
  const SEND_SCALE = 1.22;
  const pressResetTimeoutRef = useRef(null);
  const pickerClearTimeoutRef = useRef(null);
  const [pickerCloseSignal, setPickerCloseSignal] = useState(0);
  // Dev-only debug state to surface last socket payloads and avatar reloads
  const [lastContactPayload, setLastContactPayload] = useState(null);
  const [lastAvatarReload, setLastAvatarReload] = useState(null);
  
  // Ref để scroll xuống cuối chat
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const isDev = process.env.NODE_ENV === 'development';
  const [activeNav, setActiveNav] = useState(filterTab);
  useEffect(() => {
    // keep nav active in sync when switching tabs programmatically
    if (filterTab === 'conversations' || filterTab === 'contacts') setActiveNav(filterTab);
  }, [filterTab]);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  const acceptFriendRequest = async (userId) => {
    try {
      await userAPI.acceptFriend(userId);
      // remove from pending list
      setFriendRequests(prev => prev.filter(r => String(r.user_id) !== String(userId)));
      // refresh friends list (append newly accepted user)
      try {
        const resp = await userAPI.getUserById(userId);
        if (resp && resp.data) setUsers(prev => [resp.data, ...(prev || [])]);
      } catch (err) {
        // ignore
      }
      try {
        const uresp = await userAPI.getUserById(userId);
        const name = uresp?.data?.display_name || uresp?.data?.username || `Người dùng ${userId}`;
        showToast('Bạn bè', `Đã chấp nhận lời mời từ ${name}`);
      } catch (e) {
        showToast('Bạn bè', `Đã chấp nhận lời mời từ ${userId}`);
      }
    } catch (e) {
      console.error('Accept friend failed', e);
      showToast('Lỗi', 'Chấp nhận thất bại');
    }
  };

  const rejectFriendRequest = async (userId) => {
    try {
      // removeFriend endpoint handles deleting pending relations as well
      await userAPI.removeFriend(userId);
      setFriendRequests(prev => prev.filter(r => String(r.user_id) !== String(userId)));
        try {
          const uresp = await userAPI.getUserById(userId);
          const name = uresp?.data?.display_name || uresp?.data?.username || `Người dùng ${userId}`;
          showToast('Bạn bè', `Đã từ chối lời mời từ ${name}`);
        } catch (e) {
          showToast('Bạn bè', `Đã từ chối lời mời từ ${userId}`);
        }
    } catch (e) {
      console.error('Reject friend failed', e);
      showToast('Lỗi', 'Từ chối thất bại');
    }
  };

  // Gửi sticker trực tiếp
  const handleSendSticker = (sticker) => {
    if (!selectedUser || !currentUserId) return;
    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    sendSticker(currentUserId, selectedUser.id, sticker.id, sticker.url, {
      client_message_id: clientMessageId,
    });
    // Thêm sticker vào UI ngay (optimistic)
    setMessages((prev) => [
      ...prev,
      {
        id: clientMessageId,
        sender_id: currentUserId,
        receiver_id: selectedUser.id,
        sticker_id: sticker.id,
        message_type: 'sticker',
        sticker_url: sticker.url,
        timestamp: new Date().toISOString(),
        isSent: true,
        status: 'sending',
      },
    ]);
    // Update conversation preview immediately
    updateConversationPreview({ sender_id: currentUserId, receiver_id: selectedUser.id, message_type: 'sticker', sticker_url: sticker.url });
    try { playSound('send'); } catch (e) {}

  // restore focus to input after sending
  setTimeout(() => {
    try {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const len = el.value?.length || 0;
        try { el.setSelectionRange(len, len); } catch (e) {}
      }
    } catch (e) {}
  }, 50);

    const ackTimeout = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === clientMessageId ? { ...m, status: 'failed' } : m))
      );
      setIsSending(false);
      keepScaledRef.current = false;
      setPressScale(1);
    }, 3000);

    // Store timeout id on the optimistic message so ACK handling can clear it
    setMessages((prev) => prev.map((m) => (m.id === clientMessageId ? { ...m, _ackTimeout: ackTimeout } : m)));
  };

  // Thêm emoji vào input; nếu sendNow=true thì gửi ngay lập tức
  const handleAddEmoji = (emoji, sendNow = false) => {
    if (!sendNow) {
      setMessageText((prev) => prev + emoji);
      // Auto-focus input để user có thể continue typing hoặc gửi
      setTimeout(() => {
        try {
          const el = inputRef.current;
          if (el) {
            el.focus();
            const len = el.value?.length || 0;
            try { el.setSelectionRange(len, len); } catch (e) {}
          }
        } catch (e) {}
      }, 20);
      return;
    }

    // Send immediately (used for multi-emoji send)
    if (!selectedUser || !currentUserId) return;
    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setIsSending(true);

    // Debug: log outgoing emoji payload so we can track emoji persistence issues
    try {
      if (process.env.NODE_ENV === 'development') console.debug('[CLIENT][SEND_EMOJI_NOW] payload', { sender_id: currentUserId, receiver_id: selectedUser.id, content: emoji });
    } catch (e) {
      console.error('Debug logging failed', e);
    }

    sendMessage(currentUserId, selectedUser.id, emoji, {
      client_message_id: clientMessageId,
      reply_to_id: replyTo?.id || null,
    });

    const newMessage = {
      id: clientMessageId,
      content: emoji,
      timestamp: new Date().toISOString(),
      isSent: true,
      sender_id: currentUserId,
      status: 'sending',
      reply_to_id: replyTo?.id || null,
    };

    setMessages((prev) => [...prev, newMessage]);
    // Update conversation preview immediately so left list reflects the new message
    updateConversationPreview(newMessage);
    setReplyTo(null);
    // Stop typing indicator when sending
    sendTyping(currentUserId, selectedUser.id, false);

    try { playSound('send'); } catch (e) {}

  // restore focus to input after sending
  setTimeout(() => {
    try {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const len = el.value?.length || 0;
        try { el.setSelectionRange(len, len); } catch (e) {}
      }
    } catch (e) {}
  }, 50);

    const ackTimeout = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === clientMessageId ? { ...m, status: 'failed' } : m))
      );
      setIsSending(false);
      keepScaledRef.current = false;
      setPressScale(1);
    }, 3000);

    // Store timeout id on the optimistic message so ACK handling can clear it
    setMessages((prev) => prev.map((m) => (m.id === clientMessageId ? { ...m, _ackTimeout: ackTimeout } : m)));
  };

  // Helper to set selectedUser + save to localStorage
  const handleSelectUser = (user) => {
    setSelectedUser(user);
    if (user) {
      localStorage.setItem('selectedUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('selectedUser');
    }
  };

  // Update conversation preview in the left list when a message is sent or received
  const updateConversationPreview = (msg) => {
    try {
      if (isDev) console.debug('[updateConversationPreview] called with', msg, 'selectedUser', selectedUser);
      if (!msg) return;
      // determine peer id (the other participant)
      let peerId = null;
      if (msg.sender_id != null && String(msg.sender_id) === String(currentUserId)) {
        peerId = msg.receiver_id;
      } else {
        peerId = msg.sender_id;
      }

      // If peerId is missing or literally 'undefined'/'null', try selectedUser fallback
      if (!peerId || String(peerId).trim() === '' || String(peerId).toLowerCase() === 'undefined' || String(peerId).toLowerCase() === 'null') {
        if (selectedUser && selectedUser.id) peerId = selectedUser.id;
      }

      // If still no valid peerId, bail out (do not create an 'undefined' conversation)
      if (!peerId) return;

      // build a friendly preview string
      const previewText = msg.message_type === 'sticker'
        ? 'Sticker'
        : (msg.content || msg.sticker_url || msg.file_name || 'Tin nhắn mới');

      setUsers((prev) => {
        if (isDev) console.debug('[updateConversationPreview] users before', prev);
        // find existing conversation entry by id (string/number tolerant)
        const idx = prev.findIndex((u) => String(u.id) === String(peerId));
        // Derive username/display_name with fallbacks. Prefer selectedUser when it matches peerId.
        const derivedFromSelected = (selectedUser && String(selectedUser.id) === String(peerId));
        let username = msg.username || msg.sender_username || msg.sender_name || (derivedFromSelected ? selectedUser.username : null);
        let displayName = msg.display_name || msg.sender_name || msg.sender_username || (derivedFromSelected ? selectedUser.display_name || selectedUser.username : null);

        // Guard against string 'undefined' or other bad values
        if (typeof username === 'string' && username.trim().toLowerCase() === 'undefined') username = null;
        if (typeof displayName === 'string' && displayName.trim().toLowerCase() === 'undefined') displayName = null;

        const finalDisplay = displayName || username || `Người dùng ${peerId}`;

        let result;
        if (idx !== -1) {
          const existing = prev[idx];
          const updated = {
            ...existing,
            last_message: previewText,
            display_name: existing.display_name || finalDisplay,
            username: existing.username || username,
            avatar_url: existing.avatar_url || msg.avatar_url || msg.sender_avatar_url || (username ? `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff` : null),
          };
          // move to top
          const others = prev.filter((_, i) => i !== idx);
          result = [updated, ...others];
        } else {
          // not found -> create a lightweight conversation entry and put on top
          const newEntry = {
            id: peerId,
            username: username || null,
            display_name: finalDisplay,
            last_message: previewText,
            is_group: false,
            avatar_url: msg.avatar_url || msg.sender_avatar_url || (username ? `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff` : null),
          };
          result = [newEntry, ...prev];
        }
        if (isDev) console.debug('[updateConversationPreview] users after', result);
        return result;
      });
    } catch (e) {
      if (isDev) console.debug('updateConversationPreview error', e);
    }
  };

  // Khởi tạo Socket.IO khi component mount
  useEffect(() => {
    // Initialize socket first so we can emit join after we fetch the user
    const socket = initializeSocket();

    const loadCurrent = async () => {
      try {
        const resp = await userAPI.getCurrent();
        const user = resp.data;
        setCurrentUsername(user.username);
        setCurrentUserId(user.id);
        // merge with any locally cached profile to reflect optimistic local saves
        const cached = profileSync.getLocalProfile(String(user.id));
        const merged = Object.assign({}, user, cached || {});
        setCurrentUserProfile(merged);
        localStorage.setItem('username', user.username);
        if (cached) {
          // still try to push pending updates in background
          setTimeout(() => profileSync.retryPendingUpdates(), 1000);
        } else {
          // also attempt any pending updates for this user
          setTimeout(() => profileSync.retryPendingUpdates(), 500);
        }
        // Join the user's personal socket room by id for reliable delivery
        if (user && user.id) {
          joinUserRoom(user.id);
        } else if (user && user.username) {
          // fallback to legacy room by username if id isn't present
          socket.emit('join', { username: user.username, room: 'chat_room' });
        }
      } catch (err) {
        // fallback to localStorage if /me fails
        const stored = localStorage.getItem('username');
        setCurrentUsername(stored);
        if (stored) {
          socket.emit('join', { username: stored, room: 'chat_room' });
        }
      }
    };

    loadCurrent();

    // Periodic background retry for pending profile updates (attempt every 30s)
    const retryInterval = setInterval(() => {
      try {
        profileSync.retryPendingUpdates();
      } catch (e) { console.warn('retryPendingUpdates periodic failed', e); }
    }, 30000);

    return () => {
      clearInterval(retryInterval);
    };
  }, []);

  // Setup receive message listener after currentUserId is set
  useEffect(() => {
    if (!currentUserId) return;
    
    onReceiveMessage((data) => {
      if (isDev) console.debug('[CHAT] Received message:', data);
      const isSent = data.sender_id === currentUserId;
      setMessages((prev) => {
        // If message with same id already exists, ignore
        if (prev.some((m) => m.id === data.id)) return prev;

        // Try to find an optimistic message to replace.
        // For text messages we previously matched by content; for stickers match by sticker_id or sticker_url.
        const optimisticIndex = prev.findIndex((m) => {
          if (!m.isSent) return false;
          // exact content match for text/emoji
          if (m.content && data.content && m.content === data.content) return true;
          // sticker match by sticker_id or sticker_url
          if (data.message_type === 'sticker' && (m.sticker_id && data.sticker_id && String(m.sticker_id) === String(data.sticker_id))) return true;
          if (data.message_type === 'sticker' && (m.sticker_url && data.sticker_url && m.sticker_url === data.sticker_url)) return true;
          return false;
        });

        if (optimisticIndex !== -1) {
          const copy = [...prev];
          copy[optimisticIndex] = { ...data, isSent };
          return copy;
        }

        return [...prev, { ...data, isSent }];
      });
      // Update conversation preview when a message is received
      updateConversationPreview(data);
      try {
        // If message is from someone else and not currently selected, show notification
        if (!isSent) {
          const senderLabel = data.sender_username || data.sender_name || `Người dùng ${data.sender_id}`;
          const content = typeof data.content === 'string' ? data.content : (data.message_type === 'sticker' ? 'Sticker' : 'Tin nhắn mới');
          // In-app toast
          showToast('Tin nhắn mới', `${senderLabel}: ${content}`, {
            category: 'message',
            payload: { sender_id: data.sender_id, sender_username: data.sender_username || data.sender_name },
            onClick: (payload) => {
              try {
                handleSelectUser({ id: payload.sender_id, username: payload.sender_username });
              } catch (e) {}
            }
          });
          // System notification when the conversation isn't open
          if (!selectedUser || String(selectedUser.id) !== String(data.sender_id)) {
            showSystemNotification(senderLabel, content);
          }
        }
      } catch (e) {
        console.error('Notification error for incoming message', e);
      }
    });

    // Setup ACK listener for message_sent_ack
    onMessageSentAck((ack) => {
      if (isDev) console.debug('[ACK] Message saved by server:', ack);
      const { client_message_id, message_id, status, blocked_message } = ack;

      // Special-case: blocked by receiver or sender -> show user-friendly message
      if (status === 'blocked') {
        // mark optimistic message as blocked and clear its ACK timeout
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === client_message_id) {
              if (m._ackTimeout) clearTimeout(m._ackTimeout);
              return { ...m, status: 'blocked' };
            }
            return m;
          })
        );

        // Show a toast and a system message in the conversation so the user sees why send failed
        const human = blocked_message || 'Hiện tại bạn không thể gửi tin nhắn cho người này.';
        try { showToast('Không thể gửi', human); } catch (e) {}

        const sysMsg = {
          id: `sys_${Date.now()}`,
          message_type: 'system',
          content: human,
          timestamp: new Date().toISOString(),
          isSystem: true,
        };
        setMessages((prev) => [...prev, sysMsg]);

        setIsSending(false);
        keepScaledRef.current = false;
        setPressScale(1);
        return;
      }

      // Normal ACK flow: update message id and status
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === client_message_id) {
            // Clear timeout if exists
            if (m._ackTimeout) clearTimeout(m._ackTimeout);
            return { ...m, id: message_id || m.id, status: status || 'sent' };
          }
          return m;
        })
      );
      // Update conversation preview on ACK (best-effort) only when we have a selectedUser
      try {
        if (selectedUser && selectedUser.id) {
          updateConversationPreview({ sender_id: currentUserId, receiver_id: selectedUser.id, message_type: 'text' });
        }
      } catch (e) {}
      setIsSending(false);
      // release press-hold scale if any
      keepScaledRef.current = false;
      setPressScale(1);
    });

    // Setup reaction listener
    onReaction((data) => {
      if (isDev) console.debug('[REACTION]', data);
        setReactions((prev) => {
          const msgId = data.message_id;
          const existing = prev[msgId] || [];
          // Add reaction if not already present (avoid duplicates)
          const reactionExists = existing.some(
            (r) => r.reaction === data.reaction && r.user_id === data.user_id
          );
          if (reactionExists) return prev;
        
          return {
            ...prev,
            [msgId]: [...existing, { reaction: data.reaction, user_id: data.user_id }]
          };
        });
    });

    // Presence: listen for users joining/leaving to update online status in lists
    try {
      onUserJoined((payload) => {
        try {
          const uid = payload?.user_id || payload?.id || payload?.user_id;
          if (!uid) return;
          // Be lenient when matching: compare id, username or display_name
          setUsers((prev) => prev.map((u) => {
            try {
              if (String(u.id) === String(uid) || String(u.username) === String(uid) || String(u.display_name) === String(uid)) {
                return { ...u, status: 'online' };
              }
            } catch (e) {}
            return u;
          }));
          if (selectedUser && String(selectedUser.id) === String(uid)) {
            setSelectedUser((s) => ({ ...s, status: 'online' }));
          }
        } catch (e) { if (isDev) console.debug('onUserJoined handler error', e); }
      });

      onUserOffline((payload) => {
        try {
          const uid = payload?.user_id || payload?.id || payload?.user_id;
          if (!uid) return;
          setUsers((prev) => prev.map((u) => {
            try {
              if (String(u.id) === String(uid) || String(u.username) === String(uid) || String(u.display_name) === String(uid)) {
                return { ...u, status: 'offline' };
              }
            } catch (e) {}
            return u;
          }));
          if (selectedUser && String(selectedUser.id) === String(uid)) {
            setSelectedUser((s) => ({ ...s, status: 'offline' }));
          }
        } catch (e) { if (isDev) console.debug('onUserOffline handler error', e); }
      });
    } catch (e) {
      if (isDev) console.debug('Presence listeners not attached', e);
    }

    // Listen for contact/profile updates (e.g. avatar change) from server
    try {
      onContactUpdated((payload) => {
        try {
          if (!payload) return;
          try { setLastContactPayload(payload); } catch (e) {}
          if (payload.event === 'PROFILE_UPDATED' && payload.data) {
            const p = payload.data;
              // cache-bust avatar URL so browsers reload updated image
              const bustedAvatar = cacheBustUrl(p.avatar_url);
              // update users list entries
              setUsers((prev) => (prev || []).map((u) => {
                try {
                  if (String(u.id) === String(p.id)) {
                    return { ...u, avatar_url: bustedAvatar, display_name: p.display_name, username: p.username };
                  }
                } catch (e) {}
                return u;
              }));
              // update selected user view if currently open
              if (selectedUser && String(selectedUser.id) === String(p.id)) {
                setSelectedUser((s) => ({ ...s, avatar_url: bustedAvatar, display_name: p.display_name, username: p.username }));
              }
              // persist to local cache so open tabs / reloads reflect change
              try { profileSync.saveLocalProfile(String(p.id), { ...p, avatar_url: bustedAvatar }); } catch (e) {}

              // Force-update any DOM <img> elements for this user to ensure browser reloads image immediately
              try {
                const finalSrc = buildAvatarSrc(bustedAvatar);
                const imgs = Array.from(document.querySelectorAll(`img[data-user-id="${p.id}"]` || []));
                imgs.forEach((img) => {
                  try {
                    img.src = finalSrc;
                    try { console.log('[AVATAR] forced reload for user ->', p.id, finalSrc); } catch (e) {}
                    try { setLastAvatarReload({ id: p.id, url: finalSrc, ts: Date.now() }); } catch (e) {}
                  } catch (e) {}
                });
              } catch (e) {}
          }
        } catch (e) { if (isDev) console.debug('onContactUpdated handler error', e); }
      });
    } catch (e) { if (isDev) console.debug('onContactUpdated not attached', e); }

    // Setup typing listener
    onTyping((data) => {
      if (isDev) console.debug('[TYPING]', data);
      setRemotePeerIsTyping(data.is_typing);
    });

    // Listen for incoming friend requests in real-time
    onFriendRequestReceived((payload) => {
      try {
        // payload: { event: 'FRIEND_REQUEST_RECEIVED', from_user: '123' }
        const fromId = payload?.from_user;
        // Add to friendRequests state and try to enrich with the sender's profile immediately
        (async () => {
          try {
            const uresp = await userAPI.getUserById(fromId);
            const u = uresp.data;
            const newReq = { rel_id: `fr_${Date.now()}_${fromId}`, user_id: fromId, username: u?.username, display_name: u?.display_name, avatar_url: u?.avatar_url };
            setFriendRequests((prev) => {
              if (prev.some((r) => String(r.user_id) === String(fromId))) return prev;
              return [newReq, ...prev];
            });
            const fromLabel = u?.display_name || u?.username || `Người dùng ${fromId}`;
            showToast('Lời mời kết bạn', `${fromLabel} đã gửi lời mời kết bạn`);
            showSystemNotification('Lời mời kết bạn', `${fromLabel} đã gửi lời mời kết bạn`);
          } catch (e) {
            const newReq = { rel_id: `fr_${Date.now()}_${fromId}`, user_id: fromId, username: `User ${fromId}` };
            setFriendRequests((prev) => {
              if (prev.some((r) => String(r.user_id) === String(fromId))) return prev;
              return [newReq, ...prev];
            });
            const fromLabel = payload?.from_username || payload?.from_user_name || `Người dùng ${fromId}`;
            showToast('Lời mời kết bạn', `${fromLabel} đã gửi lời mời kết bạn`);
            showSystemNotification('Lời mời kết bạn', `${fromLabel} đã gửi lời mời kết bạn`);
          }
        })();
      } catch (e) {
        console.error('Error handling friend_request_received:', e);
      }
    });

    // Listen for accepted/rejected notifications (when someone accepts/rejects your outgoing request)
  onFriendAccepted(async (payload) => {
      try {
        // payload: { event: 'FRIEND_ACCEPTED', user_id: '123' }
        const accepterId = payload?.user_id;
        try {
          const uresp = await userAPI.getUserById(accepterId);
          const u = uresp.data;
          const name = u?.display_name || u?.username || `Người dùng ${accepterId}`;
          showToast('Lời mời được chấp nhận', `${name} đã chấp nhận lời mời của bạn`);
          showSystemNotification('Lời mời được chấp nhận', `${name} đã chấp nhận lời mời của bạn`);
        } catch (e) {
          showToast('Lời mời được chấp nhận', `Người dùng ${accepterId} đã chấp nhận lời mời của bạn`);
          showSystemNotification('Lời mời được chấp nhận', `Người dùng ${accepterId} đã chấp nhận lời mời của bạn`);
        }
        // refresh friends list if on contacts tab
        if (filterTab === 'contacts') {
          const token = localStorage.getItem('token');
          if (token) requestContactsList(token);
          else (async () => { const resp = await userAPI.getFriends(); setUsers(resp.data || []); })();
        }
      } catch (e) {
        console.error('Error handling friend accepted:', e);
      }
    });

    onFriendRejected(async (payload) => {
      try {
        const rejectorId = payload?.user_id;
        try {
          const uresp = await userAPI.getUserById(rejectorId);
          const name = uresp?.data?.display_name || uresp?.data?.username || `Người dùng ${rejectorId}`;
          showToast('Lời mời bị từ chối', `${name} đã từ chối lời mời của bạn`);
          showSystemNotification('Lời mời bị từ chối', `${name} đã từ chối lời mời của bạn`);
        } catch (e) {
          showToast('Lời mời bị từ chối', `Người dùng ${rejectorId} đã từ chối lời mời của bạn`);
          showSystemNotification('Lời mời bị từ chối', `Người dùng ${rejectorId} đã từ chối lời mời của bạn`);
        }
      } catch (e) {
        console.error('Error handling friend rejected:', e);
      }
    });

    // Central handler for command responses (contacts list, friend request sent, etc.)
    onCommandResponse((resp) => {
      if (!resp) return;
      try {
        if (resp.action === 'CONTACTS_LIST_RESULT') {
          if (resp.status === 'SUCCESS') {
            const mapped = (resp.data || []).map((c) => ({
              id: c.id,
              username: c.name,
              display_name: c.name,
              status: c.online ? 'online' : 'offline'
            }));
            setUsers(mapped);
          } else {
            console.error('Contacts command error:', resp.error);
            setUsers([]);
          }
        }

        if (resp.action === 'FRIEND_REQUEST_SENT') {
          if (resp.status === 'SUCCESS') {
            // optionally refresh suggestions and notify user
            showToast('Gửi lời mời', 'Lời mời kết bạn đã được gửi');
            showSystemNotification('Gửi lời mời', 'Lời mời kết bạn đã được gửi');
            (async () => {
              try {
                const sugg = await userAPI.getSuggestions(6);
                setSuggestions(sugg.data || []);
                if (filterTab === 'contacts') {
                  const token = localStorage.getItem('token');
                  if (token) requestContactsList(token);
                }
              } catch (e) {
                console.error('Error refreshing suggestions after friend request', e);
              }
            })();
          } else {
            showToast('Gửi lời mời thất bại', resp.error || 'Gửi lời mời thất bại');
            showSystemNotification('Gửi lời mời thất bại', resp.error || 'Gửi lời mời thất bại');
          }
        }
        if (resp.action === 'BLOCK_USER') {
          if (resp.status === 'SUCCESS') {
            showToast('Chặn', 'Chặn thành công');
            showSystemNotification('Chặn', 'Chặn thành công');
          } else {
            showToast('Chặn thất bại', resp.error || 'Chặn thất bại');
            showSystemNotification('Chặn thất bại', resp.error || 'Chặn thất bại');
          }
        }

        if (resp.action === 'UNBLOCK_USER') {
          if (resp.status === 'SUCCESS') {
            showToast('Bỏ chặn', 'Bỏ chặn thành công');
            showSystemNotification('Bỏ chặn', 'Bỏ chặn thành công');
          } else {
            showToast('Bỏ chặn thất bại', resp.error || 'Bỏ chặn thất bại');
            showSystemNotification('Bỏ chặn thất bại', resp.error || 'Bỏ chặn thất bại');
          }
        }

        if (resp.action === 'CONTACTS_SYNC_RESULT') {
          if (resp.status === 'SUCCESS') {
            // server returns 'friends' array
            const friends = resp.friends || resp.data || [];
            showToast('Đồng bộ danh bạ', `Đồng bộ xong - tìm thấy ${friends.length} bạn trên ChatApp`);
            showSystemNotification('Đồng bộ danh bạ', `Đồng bộ xong - tìm thấy ${friends.length} bạn trên ChatApp`);
          } else {
            showToast('Đồng bộ danh bạ thất bại', resp.error || 'Đồng bộ danh bạ thất bại');
            showSystemNotification('Đồng bộ danh bạ thất bại', resp.error || 'Đồng bộ danh bạ thất bại');
          }
        }
      } catch (e) {
        console.error('Error handling command response:', e);
      }
    });

    // User blocked notifications (someone blocked you)
    onUserBlocked((payload) => {
      try {
        const by = payload?.by_user;
        showToast('Bị chặn', `Người dùng ${by} đã chặn bạn`);
        showSystemNotification('Bị chặn', `Người dùng ${by} đã chặn bạn`);
      } catch (e) {
        console.error('Error handling user_blocked:', e);
      }
    });

    // Contact updated / profile update event
    onContactUpdated((payload) => {
      try {
        // Always log contact_updated payload to help debug in non-dev builds
        try { console.log('[SOCKET] contact_updated payload:', payload); } catch (e) {}
        try { setLastContactPayload(payload); } catch (e) {}
        if (isDev) console.debug('Contact updated payload (dev)', payload);

        const ev = payload?.event;
        const data = payload?.data;

        // Server may send a single profile object for PROFILE_UPDATED
        if (ev === 'PROFILE_UPDATED' && data) {
          const u = data;
          const busted = cacheBustUrl(u.avatar_url);
          // Update users list (replace or prepend)
          setUsers((prev) => {
            try {
              const idx = prev.findIndex((p) => String(p.id) === String(u.id));
              if (idx !== -1) {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], ...u, avatar_url: busted || copy[idx].avatar_url };
                return copy;
              }
              return [{ id: u.id, username: u.username, display_name: u.display_name, avatar_url: busted, status: u.status }, ...prev];
            } catch (e) {
              return prev;
            }
          });

          // Update selected user view if open
          try {
            if (selectedUser && String(selectedUser.id) === String(u.id)) {
              setSelectedUser((s) => ({ ...s, ...u, avatar_url: busted }));
            }
          } catch (e) {}

          // If this is current user, refresh local profile cache
          try {
            if (String(currentUserId) === String(u.id)) {
              setCurrentUserProfile((p) => ({ ...p, ...u, avatar_url: busted }));
            }
            // persist to local profile cache so other tabs pick it up
            try { profileSync.saveLocalProfile(String(u.id), { ...u, avatar_url: busted }); } catch (e) {}
          } catch (e) {}

          // Force-update any DOM <img> elements for this user to ensure browser reloads image immediately
          try {
            const finalSrc = buildAvatarSrc(busted);
            const imgs = Array.from(document.querySelectorAll(`img[data-user-id="${u.id}"]` || []));
            imgs.forEach((img) => {
              try {
                img.src = finalSrc;
                try { console.log('[AVATAR] forced reload for user ->', u.id, finalSrc); } catch (e) {}
                try { setLastAvatarReload({ id: u.id, url: finalSrc, ts: Date.now() }); } catch (e) {}
              } catch (e) {}
            });
          } catch (e) {}

          // Show subtle notification
          showToast('Hồ sơ', `${u.display_name || u.username} đã cập nhật hồ sơ`);
          showSystemNotification('Hồ sơ', `${u.display_name || u.username} đã cập nhật hồ sơ`);

          return;
        }

        // CONTACT_UPDATED may carry an array of matches (from contacts sync)
        if (ev === 'CONTACT_UPDATED' && Array.isArray(data)) {
          // merge contacts into users list
          setUsers((prev) => {
            const byId = new Map(prev.map((it) => [String(it.id), it]));
            data.forEach((d) => {
              const id = String(d.id);
              const existing = byId.get(id);
              const name = d.name || d.username || existing?.display_name || existing?.username || `Người dùng ${d.id}`;
              const avatar = existing?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=667eea&color=fff`;
              byId.set(id, { id: d.id, username: d.username || name, display_name: name, avatar_url: d.avatar_url || avatar, status: existing?.status || 'offline' });
            });
            return Array.from(byId.values());
          });

          showToast('Danh bạ', 'Danh bạ đã được cập nhật');
          showSystemNotification('Danh bạ', 'Danh bạ đã được cập nhật');
          return;
        }

        // Generic fallback: show a small notice
        showToast('Danh bạ', 'Danh bạ được cập nhật từ server');
        showSystemNotification('Danh bạ', 'Danh bạ được cập nhật từ server');
      } catch (e) {
        console.error('Error handling contact_updated:', e);
      }
    });

    // Listen for group update/create events if server emits them
    try {
      const sock = getSocket();
      sock.off('group_updated');
      sock.on('group_updated', (payload) => {
        if (isDev) console.debug('[GROUP_UPDATED]', payload);
        const name = payload?.group_name || payload?.name || 'Nhóm';
        showToast('Cập nhật nhóm', `${name} đã được cập nhật`);
        showSystemNotification('Cập nhật nhóm', `${name} đã được cập nhật`);
      });

      sock.off('group_created');
      sock.on('group_created', (payload) => {
        if (isDev) console.debug('[GROUP_CREATED]', payload);
        const name = payload?.group_name || payload?.name || 'Nhóm mới';
        showToast('Nhóm mới', `${name} đã được tạo`);
        showSystemNotification('Nhóm mới', `${name} đã được tạo`);
      });
    } catch (e) {
      if (isDev) console.debug('Socket group listeners could not be attached', e);
    }
  }, [currentUserId]);

  // Auto-scroll xuống cuối khi có tin nhắn mới
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Tải dữ liệu phụ thuộc tab (conversations / contacts / all)
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const resp = await groupAPI.getMyGroups();
        setGroups(resp.data || []);
      } catch (err) {
        console.error('Lỗi tải nhóm:', err);
      }
    };

    const fetchFriendRequests = async () => {
      try {
        const resp = await userAPI.getFriendRequests();
        const pending = resp.data || [];
        if (pending.length === 0) {
          setFriendRequests([]);
          return;
        }
        // Enrich pending requests with user profiles so we show real names immediately
        const enriched = await Promise.all(pending.map(async (r) => {
          try {
            const uresp = await userAPI.getUserById(r.user_id);
            const u = uresp.data;
            return {
              rel_id: r.rel_id || r.id || `fr_${r.user_id}`,
              user_id: r.user_id,
              username: u?.username || r.username,
              display_name: u?.display_name || r.display_name || u?.username || r.username,
              avatar_url: u?.avatar_url || null,
            };
          } catch (e) {
            return {
              rel_id: r.rel_id || r.id || `fr_${r.user_id}`,
              user_id: r.user_id,
              username: r.username || null,
              display_name: r.display_name || r.username || `Người dùng ${r.user_id}`,
              avatar_url: null,
            };
          }
        }));
        setFriendRequests(enriched);
      } catch (err) {
        console.error('Lỗi tải lời mời kết bạn:', err);
      }
    };

    const fetchBlockedUsers = async () => {
      try {
        const resp = await userAPI.getBlockedUsers();
        const blockedIds = (resp.data || []).map(u => String(u.id));
        setBlockedTargets(blockedIds);
      } catch (err) {
        console.error('Lỗi tải danh sách chặn:', err);
      }
    };

    const fetchSuggestions = async () => {
      try {
        const resp = await userAPI.getSuggestions(6);
        setSuggestions(resp.data || []);
      } catch (err) {
        console.error('Lỗi tải gợi ý kết bạn:', err);
      }
    };

    const loadListForTab = async () => {
      try {
          if (filterTab === 'conversations') {
          // fetch conversation summaries for current user
          const resp = await messageAPI.getConversations();
          // map conversations to items for the list
          const convs = (resp.data || []).map((c) => {
            if (c.type === 'user') {
              return {
                id: c.id,
                username: c.username,
                display_name: c.display_name || c.username,
                last_message: c.last_message,
                // default to offline until presence events arrive
                status: c.status || 'offline',
                is_group: false,
              };
            }
            return {
              id: c.id,
              username: null,
              display_name: c.group_name || `Group ${c.id}`,
              last_message: c.last_message,
              status: c.status || 'offline',
              is_group: true,
            };
          });
          setUsers(convs);
        } else if (filterTab === 'contacts') {
          // Request contacts via socket command (GET_CONTACTS_LIST). Fallback to REST if token missing.
          const token = localStorage.getItem('token');
          if (token) {
            // send request via socket; global onCommandResponse handler will process the result
            requestContactsList(token);
            } else {
            // fallback to REST
            const resp = await userAPI.getFriends();
            setUsers((resp.data || []).map(u => ({
              ...u,
              avatar_url: u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username||u.display_name||'U')}&background=667eea&color=fff`
            })));
          }
        } else {
          const resp = await userAPI.getUsers();
          setUsers((resp.data || []).map(u => ({
            ...u,
            avatar_url: u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username||u.display_name||'U')}&background=667eea&color=fff`
          })));
        }
      } catch (err) {
        console.error('Lỗi tải danh sách cho tab:', err);
        // fallback to all users
        try {
          const resp = await userAPI.getUsers();
          setUsers((resp.data || []).map(u => ({
            ...u,
            avatar_url: u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username||u.display_name||'U')}&background=667eea&color=fff`
          })));
        } catch (e) {
          console.error('Fallback users failed', e);
        }
      }
    };

    // Load common data and the tab-specific list
    fetchGroups();
    fetchFriendRequests();
    fetchBlockedUsers();
    fetchSuggestions();
    loadListForTab();
  }, [filterTab]);

  // Search box debounce: when searchQuery changes, call /users/search or reload all users
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        if (searchQuery.trim()) {
          const resp = await userAPI.searchUsers(searchQuery.trim());
          setUsers(resp.data || []);
        } else {
          // reload according to current tab
          if (filterTab === 'conversations') {
            const resp = await messageAPI.getConversations();
            const convs = (resp.data || []).map((c) => {
              if (c.type === 'user') {
                return {
                  id: c.id,
                  username: c.username,
                  display_name: c.display_name || c.username,
                  last_message: c.last_message,
                  is_group: false,
                };
              }
              return {
                id: c.id,
                username: null,
                display_name: c.group_name || `Group ${c.id}`,
                last_message: c.last_message,
                is_group: true,
              };
            });
            setUsers(convs);
          } else if (filterTab === 'contacts') {
            const resp = await userAPI.getFriends();
            setUsers(resp.data || []);
          } else {
            const resp = await userAPI.getUsers();
            setUsers(resp.data || []);
          }
        }
      } catch (err) {
        console.error('Lỗi tìm kiếm users:', err);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Tải messages khi chọn user
  useEffect(() => {
    if (selectedUser && currentUserId) {
      const loadMessages = async () => {
        try {
          const response = await messageAPI.getMessages(currentUserId, selectedUser.id);
          // Normalize and dedupe messages by id, and mark sent vs received
          const raw = response.data || [];
          const seen = new Set();
          const normalized = raw.reduce((acc, m) => {
            if (seen.has(m.id)) return acc;
            seen.add(m.id);
            // Ensure timestamp is always present (use server timestamp, never recalculate)
            const timestamp = m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString();

            // Backwards-compat: some messages saved as sticker may only have content set to the URL
            // If server didn't return message_type/sticker_url, detect common image/GIF URLs and treat them as stickers.
            const msgCopy = { ...m };
            if ((!msgCopy.message_type || msgCopy.message_type === 'text') && msgCopy.content && typeof msgCopy.content === 'string') {
              const lower = msgCopy.content.toLowerCase();
              if (lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.includes('giphy.com') || lower.includes('media.giphy.com')) {
                msgCopy.message_type = 'sticker';
                msgCopy.sticker_url = msgCopy.sticker_url || msgCopy.content;
              }
            }

            acc.push({ ...msgCopy, timestamp, isSent: msgCopy.sender_id === currentUserId });
            return acc;
          }, []);
          setMessages(normalized);
        } catch (error) {
          console.error('Lỗi tải messages:', error);
        }
      };

      loadMessages();
    }
  }, [selectedUser, currentUserId]);

  // Auto-focus the input whenever we select a user (small timeout to allow render)
  useEffect(() => {
    if (selectedUser) {
      // slight delay ensures the input is mounted and visible
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [selectedUser]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedUser) return;

    // Create unique client message id for ACK tracking
    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setIsSending(true);

    // Emit a single "typing" event to signal the send action (so server
    // sees a typing event only when the user actually sends — this
    // prevents noisy per-keystroke typing logs).
    if (selectedUser && currentUserId) {
      try {
        sendTyping(currentUserId, selectedUser.id, true);
      } catch (err) {
        // ignore
      }
    }

    // Debug: log outgoing payload so we can confirm emoji-only content is sent as expected
    try {
      if (process.env.NODE_ENV === 'development') console.debug('[CLIENT][SEND_MESSAGE] payload', { sender_id: currentUserId, receiver_id: selectedUser.id, content: messageText });
    } catch (e) {
      console.error('Debug logging failed', e);
    }

    // Gửi qua Socket.IO (với hỗ trợ reply_to)
    sendMessage(currentUserId, selectedUser.id, messageText, {
      client_message_id: clientMessageId,
      reply_to_id: replyTo?.id || null,
    });

    // Thêm vào giao diện ngay lập tức với status=sending
    const newMessage = {
      id: clientMessageId,
      content: messageText,
      timestamp: new Date().toISOString(),
      isSent: true,
      sender_id: currentUserId,
      status: 'sending', // ⏳ sending status
      reply_to_id: replyTo?.id || null,
    };
    setMessages((prev) => [...prev, newMessage]);
    // Update conversation preview immediately so the conversation list shows the sent message
    updateConversationPreview(newMessage);
    try {
      playSound('send');
    } catch (e) {}
    setMessageText('');
    // restore focus to input after sending so user can continue typing
    setTimeout(() => {
      try {
        const el = inputRef.current;
        if (el) {
          el.focus();
          const len = el.value?.length || 0;
          try { el.setSelectionRange(len, len); } catch (e) {}
        }
      } catch (e) {}
    }, 50);
    setReplyTo(null);  // Reset reply state

    // Signal pickers (sticker/emoji) to close
    setPickerCloseSignal((s) => s + 1);

    // Stop typing
    sendTyping(currentUserId, selectedUser.id, false);
    
    // Set timeout for ACK — if no ACK in 3s, mark as failed
    const ackTimeout = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === clientMessageId ? { ...m, status: 'failed' } : m
        )
      );
      setIsSending(false);
      // ensure button returns to normal size after failed send
      keepScaledRef.current = false;
      setPressScale(1);
    }, 3000);
    
    // Store timeout ID to clear if ACK arrives
    setMessages((prev) =>
      prev.map((m) =>
        m.id === clientMessageId ? { ...m, _ackTimeout: ackTimeout } : m
      )
    );
  };

  // Handle input change (typing indicator is NOT emitted per-keystroke to
  // reduce noisy logs). We emit typing on actual send (Enter/Send).
  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessageText(value);
  };

  // Open another user's public profile modal
  const openUserProfile = async (userId) => {
    try {
      const resp = await userAPI.getUserById(userId);
      setOtherProfileUser(resp.data);
      setOtherProfileOpen(true);
    } catch (err) {
      console.error('Lỗi tải profile người dùng:', err);
      const msg = 'Không thể tải thông tin người dùng';
      showToast('Lỗi', msg);
      showSystemNotification('Lỗi', msg);
    }
  };

  // Handle file upload with S3 presigned URL flow
  // Flow: Chọn file → presigned URL → upload S3 → tạo message local → emit socket → server lưu DB → broadcast → hiển thị preview
  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (!selectedUser || !currentUserId) {
      const msg = 'Vui lòng chọn người nhận trước khi gửi file';
      showToast('Upload file', msg);
      showSystemNotification('Upload file', msg);
      return;
    }

    for (let file of files) {
      // Validate file size (max 50MB)
      const MAX_SIZE = 50 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        const msg = `File "${file.name}" quá lớn! Kích thước tối đa là 50MB`;
        showToast('Upload file', msg);
        showSystemNotification('Upload file', msg);
        continue;
      }

      try {
        setIsSending(true);
        if (isDev) console.debug('[FILE_UPLOAD] Starting upload for:', file.name);

        // Upload file through backend using upload service
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const { file_url, file_name, file_size, file_type } = await uploadFile(file, token);
        
        if (isDev) console.debug('[FILE_UPLOAD] File uploaded successfully:', file_url);

        // Create local optimistic message (hiển thị ngay trên UI)
        const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fileMessage = {
          id: clientMessageId,
          content: file_name,
          message_type: 'file',
          file_url: file_url,
          file_name: file_name,
          file_size: file_size,
          file_type: file_type,
          timestamp: new Date().toISOString(),
          isSent: true,
          sender_id: currentUserId,
          receiver_id: selectedUser.id,
          status: 'sending',
        };
        
        // Add to UI immediately (optimistic update)
        setMessages((prev) => [...prev, fileMessage]);
        if (isDev) console.debug('[FILE_UPLOAD] Added optimistic message to UI');
  // Update conversation preview immediately for file sends
  updateConversationPreview(fileMessage);
        // keep input focused after file send
        setTimeout(() => {
          try {
            const el = inputRef.current;
            if (el) {
              el.focus();
              const len = el.value?.length || 0;
              try { el.setSelectionRange(len, len); } catch (e) {}
            }
          } catch (e) {}
        }, 50);

        // Emit socket event to server (server lưu DB và broadcast)
        const socket = getSocket();
        socket.emit('send_file_message', {
          sender_id: currentUserId,
          receiver_id: selectedUser.id,
          file_url: file_url,
          file_name: file_name,
          file_size: file_size,
          file_type: file_type,
          client_message_id: clientMessageId,
        });

        if (isDev) console.debug('[FILE_UPLOAD] Emitted send_file_message via socket');

        // Set timeout for ACK (nếu không nhận được ACK trong 5s -> đánh dấu failed)
        const ackTimeout = setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) => (m.id === clientMessageId ? { ...m, status: 'failed' } : m))
          );
          setIsSending(false);
        }, 5000);

        setMessages((prev) =>
          prev.map((m) => (m.id === clientMessageId ? { ...m, _ackTimeout: ackTimeout } : m))
        );
        
      } catch (err) {
        console.error('[FILE_UPLOAD] Error:', err);
        const msg = `Lỗi gửi file: ${file.name}\n${err.response?.data?.error || err.message}`;
        showToast('Lỗi gửi file', msg);
        showSystemNotification('Lỗi gửi file', msg);
        setIsSending(false);
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Retry sending a failed message (called from MessageBubble '🔁' button)
  const handleRetry = (failedMessage) => {
    if (!selectedUser || !currentUserId) return;

    // Create a fresh client message id for retry to follow the same ACK flow
    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Replace the failed message in the UI with a new optimistic message (status=sending)
    setMessages((prev) => prev.map((m) => (m.id === failedMessage.id ? {
      ...m,
      id: clientMessageId,
      status: 'sending',
      timestamp: new Date().toISOString(),
      _ackTimeout: null,
    } : m)));

    // Update conversation preview for the retried message
    updateConversationPreview({ sender_id: currentUserId, receiver_id: selectedUser.id, content: failedMessage.content || failedMessage.sticker_url || failedMessage.file_name });

    // Emit via socket
    sendMessage(currentUserId, selectedUser.id, failedMessage.content || failedMessage.sticker_url || '', {
      client_message_id: clientMessageId,
      reply_to_id: failedMessage.reply_to_id || null,
    });

    // Set ACK timeout to mark as failed if server doesn't ACK
    const ackTimeout = setTimeout(() => {
      setMessages((prev) => prev.map((m) => (m.id === clientMessageId ? { ...m, status: 'failed' } : m)));
    }, 3000);

    // Attach timeout id to the optimistic message so ACK handler can clear it
    setMessages((prev) => prev.map((m) => (m.id === clientMessageId ? { ...m, _ackTimeout: ackTimeout } : m)));
    // restore focus after retry
    setTimeout(() => {
      try {
        const el = inputRef.current;
        if (el) {
          el.focus();
          const len = el.value?.length || 0;
          try { el.setSelectionRange(len, len); } catch (e) {}
        }
      } catch (e) {}
    }, 50);
  };

  return (
    <div className="chat-container">
      {/* Left navigation column */}
      <aside className="left-nav">
        <div className="profile" style={{position:'relative'}}>
          {/* placeholder profile image or icon */}
          <img
            alt="profile"
            src={buildAvatarSrc(currentUserProfile?.avatar_url)}
            data-user-id={currentUserProfile?.id}
            onClick={(e) => { setAvatarMenuOpen((v) => !v); }}
            onLoad={() => { try { console.log('[AVATAR] currentUser avatar loaded ->', buildAvatarSrc(currentUserProfile?.avatar_url)); } catch (e) {} }}
            onError={(e) => {
              try {
                console.error('[AVATAR] currentUser avatar failed to load ->', e?.target?.src, e);
                e.target.onerror = null;
                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUsername||'U')}&background=ffffff&color=0b5ed7`;
              } catch (err) { }
            }}
            style={{ cursor: 'pointer', width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
          />
        </div>
        <div className="nav-icons">
          <button
            className={`nav-btn ${activeNav === 'conversations' ? 'active' : ''}`}
            title="Tin nhắn"
            onClick={() => {
              // show conversations (people/groups you've messaged)
              setFilterTab('conversations');
              setActiveNav('conversations');
            }}
            style={{ filter: activeNav === 'conversations' ? 'brightness(1.08)' : 'none' }}
          >💬</button>
          <button
            className={`nav-btn ${activeNav === 'contacts' ? 'active' : ''}`}
            title="Bạn bè"
            onClick={() => {
              // show accepted friends/contacts
              setFilterTab('contacts');
              setActiveNav('contacts');
            }}
            style={{ filter: activeNav === 'contacts' ? 'brightness(1.08)' : 'none' }}
          >👥</button>
          <button
            className="nav-btn"
            title="Đồng bộ danh bạ"
            onClick={async () => {
              try {
                const token = localStorage.getItem('token');
                if (!token) {
                  showToast('Đồng bộ danh bạ', 'Cần đăng nhập để đồng bộ danh bạ');
                  showSystemNotification('Đồng bộ danh bạ', 'Cần đăng nhập để đồng bộ danh bạ');
                  return;
                }
                // Example: pull contacts from localStorage or prompt for a few numbers for demo
                const raw = window.prompt('Nhập danh bạ (phân tách bởi dấu phẩy):', '+84901234,+84881234');
                if (!raw) return;
                const arr = raw.split(',').map(s => s.trim()).filter(Boolean);
                requestContactsSync(arr, token);
                showToast('Đồng bộ danh bạ', 'Đã gửi yêu cầu đồng bộ danh bạ');
                showSystemNotification('Đồng bộ danh bạ', 'Đã gửi yêu cầu đồng bộ danh bạ');
              } catch (e) {
                console.error('Contact sync error', e);
              }
            }}
          >🔁</button>
          <button
            className="nav-btn"
            title="Cloud của tôi"
            onClick={() => {
              // quick action: open uploads folder in a new tab (not implemented server-side)
              showToast('Cloud', 'Mở Cloud (chưa triển khai)');
              showSystemNotification('Cloud', 'Mở Cloud (chưa triển khai)');
            }}
          >☁️</button>
          <button
            className="nav-btn"
            title="Cài đặt"
            onClick={async () => {
              // simple settings: change display name
              const newName = window.prompt('Nhập tên hiển thị mới:', '');
              if (!newName) return;
              try {
                await userAPI.updateMe({ display_name: newName });
                // refresh current user and users list
                const me = await userAPI.getCurrent();
                setCurrentUsername(me.data.username);
                setCurrentUserProfile(me.data);
                // update users list to reflect change
                const all = await userAPI.getUsers();
                setUsers(all.data || []);
                showToast('Cập nhật thành công', 'Tên hiển thị đã được cập nhật.', { variant: 'success', icon: '✓' });
                showSystemNotification('Cập nhật thành công', 'Tên hiển thị đã được cập nhật.');
              } catch (err) {
                console.error('Lỗi cập nhật tên:', err);
                showToast('Cập nhật thất bại', 'Cập nhật thất bại');
                showSystemNotification('Cập nhật thất bại', 'Cập nhật thất bại');
              }
            }}
          >⚙️</button>
        </div>
      </aside>

      <ProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={currentUserProfile || { username: currentUsername, id: currentUserId }}
        onUpdated={async (u) => {
          // update local profile state and refresh lists after update
          if (u) setCurrentUserProfile(u);
          try {
            const all = await userAPI.getUsers();
            setUsers(all.data || []);
          } catch (e) {}
          // keep profile modal open (we return to view mode inside the modal)
        }}
        onOpenEdit={() => {
          // open edit screen as a separate view: close profile modal and open edit modal
          setProfileOpen(false);
          setAvatarMenuOpen(false);
          setEditProfileOpen(true);
        }}
      />

      {/* Profile modal for viewing other users' public profiles */}
      <ProfileModal
        isOpen={otherProfileOpen}
        onClose={() => { setOtherProfileOpen(false); setOtherProfileUser(null); }}
        user={otherProfileUser}
        isOwner={false}
        onUpdated={null}
        onStartChat={(u) => {
          // u is the full user object returned by GET /users/:id
          if (u) {
            handleSelectUser(u);
            setOtherProfileOpen(false);
            setOtherProfileUser(null);
          }
        }}
      />

      {avatarMenuOpen && (
        // When user selects 'Cập nhật thông tin' from the avatar menu we should show the profile modal first
        // so they see their info; they can then press Cập nhật inside the profile to open the edit panel.
        <AvatarModal
          isOpen={avatarMenuOpen}
          onClose={() => setAvatarMenuOpen(false)}
          onViewProfile={() => { setAvatarMenuOpen(false); setProfileOpen(true); }}
          onEditProfile={() => { setAvatarMenuOpen(false); setProfileOpen(true); /* user will press Cập nhật inside profile to edit */ }}
          onLogout={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
        />
      )}

      <EditProfileModal
        isOpen={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        user={currentUserProfile || { username: currentUsername, id: currentUserId }}
        onSaved={(u)=>{
          if(u) setCurrentUserProfile(u);
        }}
        onBack={() => {
          // when returning from edit view, show profile modal again
          setEditProfileOpen(false);
          setProfileOpen(true);
        }}
      />

      {/* Small action modals triggered from the search box */}
      <AddFriendModal isOpen={addFriendOpen} onClose={() => setAddFriendOpen(false)} />
      <CreateGroupModal isOpen={createGroupOpen} onClose={() => setCreateGroupOpen(false)} onCreated={(g) => {
        if (g) setGroups(prev => [g, ...(prev||[])]);
        setCreateGroupOpen(false);
      }} />

      {/* Conversation list (center column) */}
      <aside className="chat-sidebar conversation-list">
        <div className="sidebar-header">
          <h2>{filterTab === 'contacts' ? '👥 Bạn bè' : '💬 Danh sách'}</h2>
        </div>
        <div className="search-box" onMouseEnter={() => setSearchContainerActive(true)} onMouseLeave={() => setSearchContainerActive(false)}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <input
              type="text"
              placeholder="Tìm kiếm người hoặc cuộc trò chuyện..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => {
                if (!searchContainerActive) {
                  setTimeout(() => setSearchFocused(false), 100);
                }
              }}
              className="user-search-input"
            />
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <button aria-label="Thêm bạn" title="Thêm bạn" className="icon-btn" onClick={() => setAddFriendOpen(true)}>
                <span style={{fontSize:18}}>👤+</span>
              </button>
              <button aria-label="Tạo nhóm" title="Tạo nhóm" className="icon-btn" onClick={() => setCreateGroupOpen(true)}>
                <span style={{fontSize:18}}>👥+</span>
              </button>
            </div>
          </div>
        </div>
        <div className="filter-bar">
          <button className={`filter ${filterTab==='priority'?'active':''}`} onClick={() => setFilterTab('priority')}>Ưu tiên</button>
          <button className={`filter ${filterTab==='others'?'active':''}`} onClick={() => setFilterTab('others')}>Khác</button>
          <button className={`filter ${filterTab==='all'?'active':''}`} onClick={() => setFilterTab('all')}>Tất cả</button>
        </div>
        <div className="users-list" onMouseEnter={() => setSearchContainerActive(true)} onMouseLeave={() => setSearchContainerActive(false)}>
          {searchFocused && !searchQuery.trim() && showSuggestions && (
            <>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px', borderBottom:'1px solid #e5e7eb'}}>
                <span style={{fontSize:'12px', fontWeight:'700', color:'#6b7280', textTransform:'uppercase'}}>Kết bạn</span>
              </div>
              {friendRequests.length > 0 && (
                <div className="friend-requests-section">
                  <h4 className="section-title">👋 Lời mời kết bạn</h4>
                  <div className="friend-requests-list">
                    {friendRequests.map((r) => (
                      <div key={r.rel_id} className="friend-request-card">
                            <img 
                              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(r.username)}&background=667eea&color=fff`}
                              data-user-id={r.user_id}
                              alt={r.username}
                              className="friend-avatar"
                              onLoad={() => { try { console.log('[AVATAR] friend-request avatar loaded ->', r.user_id); } catch (e) {} }}
                              onError={(e) => { try { console.error('[AVATAR] friend-request avatar failed ->', r.user_id, e?.target?.src); } catch (err) {} }}
                            />
                        <div className="friend-info">
                          <div className="friend-name">{r.username}</div>
                          <div className="friend-meta">Muốn kết bạn với bạn</div>
                        </div>
                        <div className="friend-actions">
                          <button
                            className="btn-accept"
                            onClick={(e) => {
                              e.stopPropagation();
                              (async () => {
                                try {
                                  const token = localStorage.getItem('token');
                                  if (token) {
                                    // If we have token and socket flow, find likely request_id if present, otherwise try to match by user_id
                                    // Here we stored minimal friend request (rel_id) for incoming realtime events as `fr_<ts>_<from>`.
                                    // If backend provides real request_id in userAPI.getFriendRequests, prefer that. Use REST fallback to get request id.
                                    const resp = await userAPI.getFriendRequests();
                                    const reqs = resp.data || [];
                                    const found = reqs.find(x => String(x.user_id) === String(r.user_id));
                                    const request_id = found ? found.rel_id : null;
                                    if (request_id) {
                                      sendFriendAccept({ request_id, token });
                                    } else {
                                      // fallback: call REST accept
                                      await userAPI.acceptFriend(r.user_id);
                                    }
                                  } else {
                                    await userAPI.acceptFriend(r.user_id);
                                  }

                                  // remove the request from friendRequests list
                                  setFriendRequests(prev => prev.filter(x => String(x.user_id) !== String(r.user_id)));
                                  
                                  // add to users (friends) list if not already there
                                  setUsers(prev => {
                                    const alreadyExists = prev.some(u => String(u.id) === String(r.user_id));
                                    if (alreadyExists) return prev;
                                    return [...prev, {
                                      id: r.user_id,
                                      username: r.username,
                                      avatar_url: r.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.username)}&background=667eea&color=fff`
                                    }];
                                  });
                                  
                                  // show success message
                                  const okMsg = `✅ Đã kết bạn với ${r.username}`;
                                  showToast('Bạn bè', okMsg);
                                  showSystemNotification('Bạn bè', okMsg);
                                } catch (err) {
                                  console.error('Lỗi chấp nhận:', err);
                                  const msg = 'Lỗi khi chấp nhận lời mời';
                                  showToast('Lỗi', msg);
                                  showSystemNotification('Lỗi', msg);
                                }
                              })();
                            }}
                            title="Đồng ý kết bạn"
                          >
                            Đồng ý
                          </button>
                          <button
                            className="btn-decline"
                            onClick={(e) => {
                              e.stopPropagation();
                              (async () => {
                                try {
                                  const token = localStorage.getItem('token');
                                  if (token) {
                                    const resp = await userAPI.getFriendRequests();
                                    const reqs = resp.data || [];
                                    const found = reqs.find(x => String(x.user_id) === String(r.user_id));
                                    const request_id = found ? found.rel_id : null;
                                    if (request_id) {
                                      sendFriendReject({ request_id, token });
                                    } else {
                                      // fallback: simply remove locally (or call REST if available)
                                      setFriendRequests(prev => prev.filter(x => x.rel_id !== r.rel_id));
                                    }
                                  } else {
                                    setFriendRequests(prev => prev.filter(x => x.rel_id !== r.rel_id));
                                  }
                                } catch (err) {
                                  console.error('Lỗi từ chối:', err);
                                }
                              })();
                            }}
                            title="Từ chối lời mời"
                          >
                            Từ chối
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {suggestions.length > 0 && (
                <div className="suggestions-section">
                  <h4 className="section-title">✨ Gợi ý kết bạn</h4>
                  <div className="suggestions-grid">
                    {suggestions.map((u) => (
                      <div key={u.id} className="suggestion-card">
                        <img 
                                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(u.username)}&background=667eea&color=fff`}
                                  data-user-id={u.id}
                              alt={u.username}
                              className="suggestion-avatar"
                              onLoad={() => { try { console.log('[AVATAR] suggestion avatar loaded ->', u.id); } catch (e) {} }}
                              onError={(e) => { try { console.error('[AVATAR] suggestion avatar failed ->', u.id, e?.target?.src); } catch (err) {} }}
                              style={{cursor: 'pointer'}}
                              onClick={() => openUserProfile(u.id)}
                            />
                        <div className="suggestion-info">
                          <div className="suggestion-name" style={{cursor: 'pointer'}} onClick={() => openUserProfile(u.id)}>
                            {u.username}
                          </div>
                          <div className="suggestion-status">Có thể quen</div>
                        </div>
                        {currentUserId && currentUserId !== u.id && (
                          <div className="suggestion-actions">
                            <button
                              className="btn-add-friend"
                              onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const token = localStorage.getItem('token');
                                    if (token) {
                                      // use socket command if available
                                      sendFriendRequest({ target_user_id: u.id, token });
                                      // optimistic UI: remove suggestion locally
                                      setSuggestions((prev) => prev.filter(x => x.id !== u.id));
                                    } else {
                                      await userAPI.addFriend(u.id);
                                      const resp = await userAPI.getSuggestions(6);
                                      setSuggestions(resp.data || []);
                                    }

                                    // Also reload friends list if on contacts tab (REST) or request socket list
                                    if (filterTab === 'contacts') {
                                      const token2 = localStorage.getItem('token');
                                      if (token2) {
                                        requestContactsList(token2);
                                      } else {
                                        const friendsResp = await userAPI.getFriends();
                                        setUsers(friendsResp.data || []);
                                      }
                                    }
                                  } catch (err) {
                                    console.error('Lỗi gửi lời mời:', err);
                                  }
                                }}
                            >
                              ➕ Thêm
                            </button>
                            <button
                              className="btn-remove-suggest"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSuggestions(prev => prev.filter(x => x.id !== u.id));
                              }}
                              title="Ẩn gợi ý"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {(!searchFocused || searchQuery.trim()) && filterTab === 'conversations' && users.map((user) => (
            <div
              key={user.id}
              className={`conversation-item ${selectedUser?.id === user.id ? 'active' : ''}`}
              onClick={() => handleSelectUser(user)}
              style={{position:'relative', opacity: blockedTargets.includes(String(user.id)) ? 0.6 : 1}}
            >
              <div className="conv-avatar" onClick={(e) => { e.stopPropagation(); openUserProfile(user.id); }} style={{cursor:'pointer'}}>
                <img
                  alt={user?.display_name || user?.username}
                  src={buildAvatarSrc(user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username||'U')}&background=667eea&color=fff`)}
                  data-user-id={user?.id}
                  onLoad={() => { try { console.log('[AVATAR] conversation avatar loaded ->', user?.id, buildAvatarSrc(user?.avatar_url)); } catch (e) {} }}
                  onError={(e) => { try { console.error('[AVATAR] conversation avatar failed ->', user?.id, e?.target?.src, e); e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username||'U')}&background=667eea&color=fff`; } catch(err){} }}
                  style={{width:'40px',height:'40px',borderRadius:20,objectFit:'cover',display:'block'}}
                />
              </div>
              <div className="conv-body">
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div className="conv-title" onClick={(e) => { e.stopPropagation(); if (!user.is_group) openUserProfile(user.id); }} style={{cursor: user.is_group ? 'default' : 'pointer'}}>{user.display_name || user.username}</div>
                  {blockedTargets.includes(String(user.id)) && <span style={{fontSize:'10px', color:'#ef4444', fontWeight:'600'}}>🚫 Đã chặn</span>}
                  <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:'11px', fontWeight:'500', color: user.status === 'online' ? '#16a34a' : '#9ca3af'}}>{user.status === 'online' ? '🟢 Online' : '⚪ Offline'}</span>
                    {!user.is_group && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDialog({
                            open: true,
                            title: `Hủy kết bạn với ${user.display_name || user.username}?`,
                            onConfirm: async () => {
                              try {
                                const token = localStorage.getItem('token');
                                if (token) {
                                  const resp = await fetch(`/friends/${user.id}/remove`, {
                                    method: 'DELETE',
                                    headers: { 
                                      'Authorization': `Bearer ${token}`,
                                      'Content-Type': 'application/json'
                                    }
                                  });
                                  if (resp.ok) {
                                    setUsers(prev => prev.filter(u => u.id !== user.id));
                                    
                                    // Add to suggestions if not already there
                                    setSuggestions(prev => {
                                      const alreadyExists = prev.some(s => s.id === user.id);
                                      if (alreadyExists) return prev;
                                      return [user, ...prev];
                                    });
                                    
                                    // Clear selected user if they were selected
                                    if (selectedUser?.id === user.id) {
                                      handleSelectUser(null);
                                    }
                                    
                                    const okMsg = `✅ Đã hủy kết bạn với ${user.display_name || user.username}`;
                                    showToast('Bạn bè', okMsg);
                                    showSystemNotification('Bạn bè', okMsg);
                                  } else {
                                    const errData = await resp.json().catch(() => ({}));
                                    const errMsg = errData.error || errData.message || 'Lỗi khi hủy kết bạn';
                                    console.error('Remove friend error:', resp.status, errMsg);
                                    showToast('Lỗi', errMsg);
                                    showSystemNotification('Lỗi', errMsg);
                                  }
                                } else {
                                  showToast('Yêu cầu đăng nhập', 'Chưa đăng nhập');
                                  showSystemNotification('Yêu cầu đăng nhập', 'Chưa đăng nhập');
                                }
                              } catch (err) {
                                console.error('Lỗi hủy kết bạn:', err);
                                const msg = `Lỗi khi hủy kết bạn: ${err.message}`;
                                showToast('Lỗi', msg);
                                showSystemNotification('Lỗi', msg);
                              }
                              setConfirmDialog({ open: false, title: '', onConfirm: null });
                            }
                          });
                        }}
                        style={{
                          background:'#ef4444',
                          color:'white',
                          border:'none',
                          borderRadius:'4px',
                          padding:'4px 8px',
                          fontSize:'11px',
                          cursor:'pointer',
                          fontWeight:'600'
                        }}
                        title="Hủy kết bạn"
                      >
                        ✕ Hủy
                      </button>
                    )}
                  </div>
                </div>
                <div className="conv-preview" style={{color: user.last_message ? '#1f2937' : '#9ca3af', fontWeight: user.last_message ? '500' : '400'}}>{user.last_message || (user.status === 'online' ? 'Đang online' : 'Chưa có tin nhắn')}</div>
              </div>
            </div>
          ))}
          
          {filterTab === 'contacts' && users.length > 0 && (
            <>
              <div style={{padding:'8px 12px', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{fontSize:'12px', fontWeight:'700', color:'#6b7280', textTransform:'uppercase'}}>Bạn bè</span>
                  {friendRequests && friendRequests.length > 0 && (
                    <div style={{display:'inline-flex', alignItems:'center', justifyContent:'center'}}>
                      <div style={{minWidth:18, height:18, borderRadius:9, background:'#ef4444', color:'#fff', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 6px'}}>{friendRequests.length}</div>
                    </div>
                  )}
                </div>
                <div>
                  {friendRequests && friendRequests.length > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); setPendingOpen((v) => !v); }} style={{background:'transparent', border:'none', cursor:'pointer', fontSize:14, padding:6}} title="Xem lời mời">
                      {pendingOpen ? '▴' : '▾'}
                    </button>
                  )}
                </div>
              </div>
              {pendingOpen && (
                <div style={{padding:'8px 12px', borderBottom:'1px solid #e5e7eb', background:'#fff8f8'}}>
                  {(friendRequests || []).length === 0 ? (
                    <div style={{color:'#6b7280'}}>Không có lời mời</div>
                  ) : (
                    <div style={{display:'flex', flexDirection:'column', gap:8}}>
                      {(pendingExpanded ? friendRequests : friendRequests.slice(0,5)).map((r) => (
                        <div key={r.rel_id || r.user_id} style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                          <div style={{display:'flex', alignItems:'center', gap:8}}>
                            <div style={{width:34, height:34, borderRadius:18, background:'#6b7280', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700}}>{(r.username || (r.display_name || 'U')[0] || 'U').toString()[0].toUpperCase()}</div>
                            <div style={{display:'flex', flexDirection:'column'}}>
                              <span style={{fontWeight:600}}>{r.display_name || r.username || `User ${r.user_id}`}</span>
                              <small style={{color:'#9ca3af'}}>Lời mời kết bạn</small>
                            </div>
                          </div>
                          <div style={{display:'flex', gap:8}}>
                            <button title="đồng ý" onClick={() => acceptFriendRequest(r.user_id)} style={{background:'#10b981', color:'#fff', border:'none', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontWeight:700}}>đồng ý</button>
                            <button title="từ chối" onClick={() => rejectFriendRequest(r.user_id)} style={{background:'#ef4444', color:'#fff', border:'none', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontWeight:700}}>từ chối</button>
                          </div>
                        </div>
                      ))}
                      {friendRequests.length > 5 && (
                        <button onClick={() => setPendingExpanded(v => !v)} style={{border:'none', background:'transparent', color:'#2563eb', cursor:'pointer', textAlign:'left'}}>
                          {pendingExpanded ? 'Thu gọn' : `Xem thêm (${friendRequests.length - 5} thêm)`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`conversation-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                  onClick={() => handleSelectUser(user)}
                  style={{position:'relative', opacity: blockedTargets.includes(String(user.id)) ? 0.6 : 1}}
                >
                  <div className="conv-avatar" onClick={(e) => { e.stopPropagation(); openUserProfile(user.id); }} style={{cursor:'pointer'}}>
                    <img
                      alt={user?.display_name || user?.username}
                      src={buildAvatarSrc(user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username||'U')}&background=667eea&color=fff`)}
                      data-user-id={user?.id}
                      onError={(e) => { try { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username||'U')}&background=667eea&color=fff`; } catch(err){} }}
                      style={{width:'40px',height:'40px',borderRadius:20,objectFit:'cover',display:'block'}}
                    />
                  </div>
                  <div className="conv-body">
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div className="conv-title" onClick={(e) => { e.stopPropagation(); if (!user.is_group) openUserProfile(user.id); }} style={{cursor: user.is_group ? 'default' : 'pointer'}}>{user.display_name || user.username}</div>
                      {blockedTargets.includes(String(user.id)) && <span style={{fontSize:'10px', color:'#ef4444', fontWeight:'600'}}>🚫 Đã chặn</span>}
                      <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:'11px', fontWeight:'500', color: user.status === 'online' ? '#16a34a' : '#9ca3af'}}>{user.status === 'online' ? '🟢 Online' : '⚪ Offline'}</span>
                        {!user.is_group && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDialog({
                                open: true,
                                title: `Hủy kết bạn với ${user.display_name || user.username}?`,
                                onConfirm: async () => {
                                  try {
                                    const token = localStorage.getItem('token');
                                    if (token) {
                                      const resp = await fetch(`/friends/${user.id}/remove`, {
                                        method: 'DELETE',
                                        headers: { 
                                          'Authorization': `Bearer ${token}`,
                                          'Content-Type': 'application/json'
                                        }
                                      });
                                      if (resp.ok) {
                                        setUsers(prev => prev.filter(u => u.id !== user.id));
                                        
                                        // Add to suggestions if not already there
                                        setSuggestions(prev => {
                                          const alreadyExists = prev.some(s => s.id === user.id);
                                          if (alreadyExists) return prev;
                                          return [user, ...prev];
                                        });
                                        
                                        // Clear selected user if they were selected
                                        if (selectedUser?.id === user.id) {
                                          handleSelectUser(null);
                                        }
                                        
                                        const okMsg = `✅ Đã hủy kết bạn với ${user.display_name || user.username}`;
                                        showToast('Bạn bè', okMsg);
                                        showSystemNotification('Bạn bè', okMsg);
                                      } else {
                                        const errData = await resp.json().catch(() => ({}));
                                        const errMsg = errData.error || errData.message || 'Lỗi khi hủy kết bạn';
                                        console.error('Remove friend error:', resp.status, errMsg);
                                        showToast('Lỗi', errMsg);
                                        showSystemNotification('Lỗi', errMsg);
                                      }
                                    } else {
                                      showToast('Yêu cầu đăng nhập', 'Chưa đăng nhập');
                                      showSystemNotification('Yêu cầu đăng nhập', 'Chưa đăng nhập');
                                    }
                                  } catch (err) {
                                    console.error('Lỗi hủy kết bạn:', err);
                                    const msg = `Lỗi khi hủy kết bạn: ${err.message}`;
                                    showToast('Lỗi', msg);
                                    showSystemNotification('Lỗi', msg);
                                  }
                                  setConfirmDialog({ open: false, title: '', onConfirm: null });
                                }
                              });
                            }}
                            style={{
                              background:'#ef4444',
                              color:'white',
                              border:'none',
                              borderRadius:'4px',
                              padding:'4px 8px',
                              fontSize:'11px',
                              cursor:'pointer',
                              fontWeight:'600'
                            }}
                            title="Hủy kết bạn"
                          >
                            ✕ Hủy
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="conv-preview" style={{color: user.last_message ? '#1f2937' : '#9ca3af', fontWeight: user.last_message ? '500' : '400'}}>{user.last_message || (user.status === 'online' ? 'Đang online' : 'Chưa có tin nhắn')}</div>
                  </div>
                </div>
              ))}
            </>
          )}
          
          {filterTab === 'contacts' && users.length === 0 && (
            <div style={{padding:'20px', textAlign:'center', color:'#9ca3af'}}>
              <p>Chưa có bạn bè</p>
            </div>
          )}
        </div>
        <div className="groups-section">
          <div className="groups-header">
            <h3>Nhóm</h3>
            <button
              className="btn-create-group"
              onClick={async () => {
                const name = window.prompt('Tên nhóm mới:');
                if (!name) return;
                try {
                  await groupAPI.createGroup(name);
                  const resp = await groupAPI.getMyGroups();
                  setGroups(resp.data || []);
                  showToast('Nhóm', 'Đã tạo nhóm');
                  showSystemNotification('Nhóm', 'Đã tạo nhóm');
                } catch (err) {
                  showToast('Nhóm', 'Lỗi tạo nhóm');
                  showSystemNotification('Nhóm', 'Lỗi tạo nhóm');
                }
              }}
            >
              Tạo
            </button>
          </div>
          <div className="groups-list">
            {groups.map((g) => (
              <div key={g.id} className="group-item">
                <span>{g.name}</span>
                <button
                  className="btn-group-members"
                  onClick={async () => {
                    try {
                      const resp = await groupAPI.getGroupMembers(g.id);
                      const names = resp.data.map((u) => u.username).join(', ');
                        showToast('Thành viên nhóm', `Thành viên: ${names}`);
                        showSystemNotification('Thành viên nhóm', `Thành viên: ${names}`);
                    } catch (err) {
                        showToast('Nhóm', 'Lỗi lấy thành viên');
                        showSystemNotification('Nhóm', 'Lỗi lấy thành viên');
                    }
                  }}
                >
                  Thành viên
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="chat-header">
              <div>
                <h3>{selectedUser.username}</h3>
                <p className="status">{selectedUser.status === 'online' ? '🟢 Online' : '⚪ Offline'}</p>
              </div>
                <div style={{marginLeft:16}}>
                  {selectedUser && (
                    <button
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem('token');
                          if (!token) {
                            showToast('Yêu cầu đăng nhập', 'Cần đăng nhập để chặn người dùng');
                            showSystemNotification('Yêu cầu đăng nhập', 'Cần đăng nhập để chặn người dùng');
                            return;
                          }
                          const target = selectedUser.id;
                          if (blockedTargets.includes(String(target))) {
                            // unblock
                            sendUnblockUser({ target, token });
                            setBlockedTargets(prev => prev.filter(x => x !== String(target)));
                            showToast('Bỏ chặn', 'Đã bỏ chặn');
                            showSystemNotification('Bỏ chặn', 'Đã bỏ chặn');
                          } else {
                            sendBlockUser({ target, token });
                            setBlockedTargets(prev => [String(target), ...prev]);
                            showToast('Chặn', 'Đã chặn người dùng');
                            showSystemNotification('Chặn', 'Đã chặn người dùng');
                          }
                        } catch (e) {
                          console.error('Block/unblock error', e);
                        }
                      }}
                      style={{marginLeft:8}}
                    >
                      {blockedTargets.includes(String(selectedUser.id)) ? '🔓 Bỏ chặn' : '🔒 Chặn'}
                    </button>
                  )}
                </div>
              {/* Show typing indicator in header */}
              {remotePeerIsTyping && (
                <TypingIndicator userName={selectedUser.display_name || selectedUser.username} isTyping={true} />
              )}
            </div>

            {/* Messages Area */}
            <div className="messages-area">
              {messages.length === 0 ? (
                <p className="no-messages">Chưa có tin nhắn nào. Hãy bắt đầu cuộc hội thoại! 👋</p>
              ) : (
                  messages.map((msg, idx) => {
                    // Merge reactions from state into message object
                    const messageWithReactions = {
                      ...msg,
                      reactions: reactions[msg.id] || msg.reactions || {}
                    };
                      // Transform array of reactions into object format for display
                      if (Array.isArray(messageWithReactions.reactions)) {
                        const reactionsObj = {};
                        messageWithReactions.reactions.forEach((r) => {
                          if (!reactionsObj[r.reaction]) {
                            reactionsObj[r.reaction] = [];
                          }
                          reactionsObj[r.reaction].push(r.user_id);
                        });
                        messageWithReactions.reactions = reactionsObj;
                      }
                    return (
                      <MessageBubble
                        key={idx}
                        message={messageWithReactions}
                        isSent={msg.isSent}
                        onRetry={handleRetry}
                        onReply={(message) => {
                          setReplyTo(message);
                          // Auto-focus input
                          inputRef.current?.focus();
                        }}
                        onReaction={(messageId, emoji) => {
                          sendReaction(messageId, currentUserId, emoji);
                        }}
                        onEmojiHover={(messageId, emoji) => {
                          // Clear any pending clear timeout
                          if (hoverClearTimeoutRef.current) {
                            clearTimeout(hoverClearTimeoutRef.current);
                            hoverClearTimeoutRef.current = null;
                          }

                          if (emoji) {
                            // User is hovering an emoji — show preview
                            setHoverReaction(emoji);
                          } else {
                            // Start a short timeout before clearing hover so user can move to the input
                            hoverClearTimeoutRef.current = setTimeout(() => {
                              setHoverReaction(null);
                              hoverClearTimeoutRef.current = null;
                            }, 700);
                          }
                        }}
                      />
                    );
                  })
              )}
              <TypingIndicator userName={null} isTyping={false} />
              {/* Ref để scroll xuống */}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Preview */}
            
            {replyTo && (
              <div style={{
                background: '#f0f0f0',
                padding: '8px 12px',
                borderLeft: '3px solid #0b5ed7',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Trả lời</div>
                  <div style={{ fontSize: '13px' }}>{replyTo.content}</div>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px',
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Message Input */}
            <form onSubmit={handleSendMessage} className="message-input-form">
              <StickerButton onSelectSticker={handleSendSticker} onAddEmoji={handleAddEmoji} pickerCloseSignal={pickerCloseSignal} />
              <input
                type="text"
                value={messageText}
                ref={inputRef}
                onChange={handleInputChange}
                onFocus={() => setTyping(true)}
                onBlur={() => {
                  setTyping(false);
                  // Stop typing when focus lost
                  if (selectedUser && currentUserId) {
                    sendTyping(currentUserId, selectedUser.id, false);
                  }
                }}
                placeholder={blockedTargets.includes(String(selectedUser?.id)) ? "🚫 Bạn đã chặn người dùng này" : "Nhập tin nhắn..."}
                className="message-input"
                disabled={blockedTargets.includes(String(selectedUser?.id))}
              />
              
              {/* File Upload Input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              
              {/* File Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: blockedTargets.includes(String(selectedUser?.id)) ? 'not-allowed' : 'pointer',
                  padding: '8px',
                  color: blockedTargets.includes(String(selectedUser?.id)) ? '#ccc' : '#667eea',
                  opacity: blockedTargets.includes(String(selectedUser?.id)) ? 0.5 : 1
                }}
                title={blockedTargets.includes(String(selectedUser?.id)) ? "Bạn đã chặn người dùng này" : "Gửi file"}
                disabled={isSending || blockedTargets.includes(String(selectedUser?.id))}
                onMouseDown={(e) => e.preventDefault()}
              >
                📎
              </button>
              
              {/* ReactionButton (show when input empty) */}
              {!messageText.trim() ? (
                  <div
                    style={{ position: 'relative' }}
                    onMouseEnter={() => {
                      if (pickerClearTimeoutRef.current) {
                        clearTimeout(pickerClearTimeoutRef.current);
                        pickerClearTimeoutRef.current = null;
                      }
                      setShowReactionPicker(true);
                    }}
                    onMouseLeave={() => {
                      // small delay before hiding so user can move into picker
                      pickerClearTimeoutRef.current = setTimeout(() => setShowReactionPicker(false), 300);
                    }}
                  >
                  <button
                    type="button"
                    className="btn-reaction"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      // start press animation
                      if (pressRafRef.current) cancelAnimationFrame(pressRafRef.current);
                      isPressingRef.current = true;
                      pressStartRef.current = performance.now();
                      const tick = (now) => {
                        if (!isPressingRef.current) return;
                        const elapsed = now - pressStartRef.current;
                        const progress = Math.min(elapsed / PRESS_DURATION, 1);
                        const scale = 1 + progress * (MAX_PRESS_SCALE - 1);
                        setPressScale(scale);
                        pressRafRef.current = requestAnimationFrame(tick);
                      };
                      pressRafRef.current = requestAnimationFrame(tick);
                    }}
                    onMouseUp={(e) => {
                      // end press animation (leave slight transition)
                      isPressingRef.current = false;
                      if (pressRafRef.current) cancelAnimationFrame(pressRafRef.current);
                      pressRafRef.current = null;
                      // schedule a short delayed reset so click handler can set keepScaledRef if needed
                      if (pressResetTimeoutRef.current) clearTimeout(pressResetTimeoutRef.current);
                      pressResetTimeoutRef.current = setTimeout(() => {
                        if (!keepScaledRef.current) setPressScale(1);
                        pressResetTimeoutRef.current = null;
                      }, 80);
                    }}
                    onMouseLeave={() => {
                      // if leaving while pressing, end it
                      if (isPressingRef.current) {
                        isPressingRef.current = false;
                        if (pressRafRef.current) cancelAnimationFrame(pressRafRef.current);
                        pressRafRef.current = null;
                        if (!keepScaledRef.current) setPressScale(1);
                      }
                    }}
                    onTouchStart={(e) => {
                      // touch press start
                      if (pressRafRef.current) cancelAnimationFrame(pressRafRef.current);
                      isPressingRef.current = true;
                      pressStartRef.current = performance.now();
                      const tick = (now) => {
                        if (!isPressingRef.current) return;
                        const elapsed = now - pressStartRef.current;
                        const progress = Math.min(elapsed / PRESS_DURATION, 1);
                        const scale = 1 + progress * (MAX_PRESS_SCALE - 1);
                        setPressScale(scale);
                        pressRafRef.current = requestAnimationFrame(tick);
                      };
                      pressRafRef.current = requestAnimationFrame(tick);
                    }}
                    onTouchEnd={(e) => {
                      isPressingRef.current = false;
                      if (pressRafRef.current) cancelAnimationFrame(pressRafRef.current);
                      pressRafRef.current = null;
                      // schedule a small delay similar to mouseup
                      if (pressResetTimeoutRef.current) clearTimeout(pressResetTimeoutRef.current);
                      pressResetTimeoutRef.current = setTimeout(() => {
                        if (!keepScaledRef.current) setPressScale(1);
                        pressResetTimeoutRef.current = null;
                      }, 80);
                    }}
                    onClick={(e) => {
                      // Send the emoji as a chat message (optimistic + ACK)
                      if (!selectedUser || !currentUserId) {
                        // If there's no selected chat, just toggle picker
                        setShowReactionPicker(!showReactionPicker);
                        return;
                      }

                      const emojiToSendAsMessage = hoverReaction || defaultReaction;
                      const clientMessageId2 = `client_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
                      setIsSending(true);
                      // keep the button scaled while sending
                      keepScaledRef.current = true;
                      setPressScale(SEND_SCALE);

                      // Optimistic UI: append the emoji message
                      const optimisticMsg = {
                        id: clientMessageId2,
                        content: emojiToSendAsMessage,
                        timestamp: new Date().toISOString(),
                        isSent: true,
                        sender_id: currentUserId,
                        status: 'sending',
                        reply_to_id: null,
                      };
                      setMessages((prev) => [...prev, optimisticMsg]);

                      // Emit via socket
                      sendMessage(currentUserId, selectedUser.id, emojiToSendAsMessage, {
                        client_message_id: clientMessageId2,
                        reply_to_id: null,
                      });

                      // ACK timeout
                      const ackTimeout2 = setTimeout(() => {
                        setMessages((prev) =>
                          prev.map((m) => (m.id === clientMessageId2 ? { ...m, status: 'failed' } : m))
                        );
                        setIsSending(false);
                        // ensure button returns to normal size after failed send
                        keepScaledRef.current = false;
                        setPressScale(1);
                      }, 3000);

                      // store timeout id on message (so ACK handler can clear it)
                      setMessages((prev) =>
                        prev.map((m) => (m.id === clientMessageId2 ? { ...m, _ackTimeout: ackTimeout2 } : m))
                      );

                      setShowReactionPicker(false);
                      setHoverReaction(null);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      // Right-click to customize default emoji
                      const newEmoji = window.prompt('Chọn emoji mặc định:', defaultReaction);
                      if (newEmoji) {
                        setDefaultReaction(newEmoji);
                        localStorage.setItem('defaultReaction', newEmoji);
                      }
                    }}
                    style={{
                      fontSize: '20px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px',
                      transform: `scale(${pressScale})`,
                      transition: isPressingRef.current ? 'transform 0s' : 'transform 140ms ease',
                      willChange: 'transform'
                    }}
                    title="Right-click để đổi emoji mặc định"
                  >
                    {hoverReaction || defaultReaction}
                  </button>
                  
                  {/* Emoji Picker */}
                  {showReactionPicker && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      right: '0',
                      background: '#fff',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      padding: '8px',
                      display: 'flex',
                      gap: '4px',
                      marginBottom: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      zIndex: 1000,
                    }}>
                      {['👍', '❤️', '😂', '😮', '😢', '🔥', '😡', '😍'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={(e) => {
                            // prevent parent click (which would send the emoji as a message)
                            e.stopPropagation();
                            setDefaultReaction(emoji);
                            localStorage.setItem('defaultReaction', emoji);
                            setShowReactionPicker(false);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#f0f0f0'}
                          onMouseLeave={(e) => e.target.style.background = 'none'}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* SendButton (show when input has text) */
                <button
                  type="submit"
                  className="btn-send"
                  disabled={isSending || blockedTargets.includes(String(selectedUser?.id))}
                  onMouseDown={(e) => e.preventDefault()}
                  style={{
                    opacity: isSending || blockedTargets.includes(String(selectedUser?.id)) ? 0.6 : 1,
                    cursor: isSending || blockedTargets.includes(String(selectedUser?.id)) ? 'not-allowed' : 'pointer',
                  }}
                  title={blockedTargets.includes(String(selectedUser?.id)) ? "Bạn đã chặn người dùng này" : ""}
                >
                  {isSending ? '⏳' : '📤'} {isSending ? 'Gửi...' : 'Gửi'}
                </button>
              )}
            </form>
          </>
        ) : (
          <div className="chat-empty">
            <p>👈 Chọn một bạn để bắt đầu cuộc hội thoại</p>
          </div>
        )}
      </main>

      {/* Confirm Dialog */}
      {confirmDialog.open && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '8px',
            minWidth: '300px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold'}}>
              {confirmDialog.title}
            </h3>
            <div style={{display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
              <button
                onClick={() => setConfirmDialog({ open: false, title: '', onConfirm: null })}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.onConfirm) {
                    confirmDialog.onConfirm();
                  }
                }}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  background: '#ef4444',
                  color: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Dev debug panel removed per user request */}
    </div>
  );
};

export default ChatBox;
