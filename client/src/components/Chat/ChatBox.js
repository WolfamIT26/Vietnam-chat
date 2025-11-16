import React, { useEffect, useState, useRef } from 'react';
import { initializeSocket, sendMessage, onReceiveMessage, joinUserRoom, sendReaction, onReaction, sendTyping, onTyping, onMessageSentAck, sendSticker, requestContactsList, onCommandResponse, sendFriendRequest, onFriendRequestReceived, sendFriendAccept, sendFriendReject, onFriendAccepted, onFriendRejected, sendBlockUser, sendUnblockUser, onUserBlocked, requestContactsSync, onContactUpdated, onUserStatusChanged } from '../../services/socket';
import { userAPI, messageAPI, groupAPI } from '../../services/api';
import MessageBubble from './MessageBubble';
import StickerButton from './StickerButton';
import TypingIndicator from './TypingIndicator';
import LogoutButton from '../Auth/LogoutButton';
import ProfileModal from './ProfileModal';
import AvatarModal from './AvatarModal';
import EditProfileModal from './EditProfileModal';

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
  
  // Ref để scroll xuống cuối chat
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

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
        message_type: 'sticker',
        sticker_id: sticker.id,
        sticker_url: sticker.url,
        timestamp: new Date().toISOString(),
        isSent: true,
        status: 'sending',
      },
    ]);
  };

  // Prepare a sticker to be sent when the user hits send/enter (don't send immediately)
  // (stickers are sent immediately via handleSendSticker)

  // Thêm emoji vào input; nếu sendNow=true thì gửi ngay lập tức
  const handleAddEmoji = (emoji, sendNow = false) => {
    if (!sendNow) {
      setMessageText((prev) => prev + emoji);
      // Auto-focus input để user có thể continue typing hoặc gửi
      document.querySelector('.message-input')?.focus();
      return;
    }

    // Send immediately (used for multi-emoji send)
    if (!selectedUser || !currentUserId) return;
    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setIsSending(true);

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
    setReplyTo(null);
    // Stop typing indicator when sending
    sendTyping(currentUserId, selectedUser.id, false);

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
  setCurrentUserProfile(user);
  localStorage.setItem('username', user.username);
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

    return () => {
      // Cleanup khi unmount
    };
  }, []);

  // Setup receive message listener after currentUserId is set
  useEffect(() => {
    if (!currentUserId) return;
    
    onReceiveMessage((data) => {
      console.log('[CHAT] Received message:', data);
      const isSent = data.sender_id === currentUserId;
      setMessages((prev) => {
        // If message with same id already exists, ignore
        if (prev.some((m) => m.id === data.id)) return prev;

        // If there is an optimistic message (sent by current user) with same content,
        // replace it with the server-saved message (to normalize id/timestamp).
        const optimisticIndex = prev.findIndex(
          (m) => m.isSent && m.content === data.content
        );
        if (optimisticIndex !== -1) {
          const copy = [...prev];
          copy[optimisticIndex] = { ...data, isSent };
          return copy;
        }

        return [...prev, { ...data, isSent }];
      });
    });

    // Setup ACK listener for message_sent_ack
    onMessageSentAck((ack) => {
      console.log('[ACK] Message saved by server:', ack);
      const { client_message_id, message_id, status } = ack;
      
      // Clear timeout and update message status
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === client_message_id) {
            // Clear timeout if exists
            if (m._ackTimeout) clearTimeout(m._ackTimeout);
            return { ...m, id: message_id, status: status || 'sent' };
          }
          return m;
        })
      );
      setIsSending(false);
      // release press-hold scale if any
      keepScaledRef.current = false;
      setPressScale(1);
    });

    // Setup reaction listener
    onReaction((data) => {
      console.log('[REACTION]', data);
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

    // Setup typing listener
    onTyping((data) => {
      console.log('[TYPING]', data);
      setRemotePeerIsTyping(data.is_typing);
    });

    // Listen for incoming friend requests in real-time
    onFriendRequestReceived((payload) => {
      try {
        // payload: { event: 'FRIEND_REQUEST_RECEIVED', from_user: '123' }
        const fromId = payload?.from_user;
        // Add to friendRequests state so it appears in UI (use minimal shape)
        setFriendRequests((prev) => {
          // avoid duplicates by from_user
          if (prev.some((r) => String(r.user_id) === String(fromId))) return prev;
          const newReq = { rel_id: `fr_${Date.now()}_${fromId}`, user_id: fromId, username: `User ${fromId}` };
          return [newReq, ...prev];
        });
        // Simple user-visible notification
        alert('Bạn có lời mời kết bạn mới!');
      } catch (e) {
        console.error('Error handling friend_request_received:', e);
      }
    });

    // Listen for accepted/rejected notifications (when someone accepts/rejects your outgoing request)
    onFriendAccepted((payload) => {
      try {
        // payload: { event: 'FRIEND_ACCEPTED', user_id: '123' }
        const accepterId = payload?.user_id;
        alert(`Lời mời của bạn đã được chấp nhận bởi người dùng ${accepterId}`);
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

    onFriendRejected((payload) => {
      try {
        const rejectorId = payload?.user_id;
        alert(`Lời mời của bạn đã bị từ chối bởi người dùng ${rejectorId}`);
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
            alert('Lời mời kết bạn đã gửi');
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
            alert('Gửi lời mời thất bại: ' + (resp.error || ''));
          }
        }
        if (resp.action === 'BLOCK_USER') {
          if (resp.status === 'SUCCESS') {
            alert('Chặn thành công');
          } else {
            alert('Chặn thất bại: ' + (resp.error || ''));
          }
        }

        if (resp.action === 'UNBLOCK_USER') {
          if (resp.status === 'SUCCESS') {
            alert('Bỏ chặn thành công');
          } else {
            alert('Bỏ chặn thất bại: ' + (resp.error || ''));
          }
        }

        if (resp.action === 'CONTACTS_SYNC_RESULT') {
          if (resp.status === 'SUCCESS') {
            // server returns 'friends' array
            const friends = resp.friends || resp.data || [];
            alert(`Đồng bộ xong - tìm thấy ${friends.length} bạn trên ChatApp`);
          } else {
            alert('Đồng bộ danh bạ thất bại: ' + (resp.error || ''));
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
        alert(`Người dùng ${by} đã chặn bạn`);
      } catch (e) {
        console.error('Error handling user_blocked:', e);
      }
    });

    // Contact updated event
    onContactUpdated((payload) => {
      try {
        // payload: { event: 'CONTACT_UPDATED', data: [...] }
        console.log('Contact updated payload', payload);
        alert('Danh bạ được cập nhật từ server');
      } catch (e) {
        console.error('Error handling contact_updated:', e);
      }
    });

    // Listen for user status changes (online/offline)
    onUserStatusChanged((data) => {
      try {
        // data: { user_id: '123', status: 'online' | 'offline' }
        const changedUserId = data?.user_id;
        const newStatus = data?.status;
        console.log(`[STATUS_CHANGE] User ${changedUserId} is now ${newStatus}`);
        
        // Update users list with new status
        setUsers((prev) => {
          return prev.map((user) => {
            if (String(user.id) === String(changedUserId)) {
              return { ...user, status: newStatus };
            }
            return user;
          });
        });
        
        // If the selected user's status changed, update it too
        if (selectedUser && String(selectedUser.id) === String(changedUserId)) {
          setSelectedUser((prev) => {
            if (prev) return { ...prev, status: newStatus };
            return prev;
          });
        }
      } catch (e) {
        console.error('Error handling user_status_changed:', e);
      }
    });
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
        setFriendRequests(resp.data || []);
      } catch (err) {
        console.error('Lỗi tải lời mời kết bạn:', err);
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
          // Request contacts via socket command (GET_CONTACTS_LIST). Fallback to REST if token missing.
          const token = localStorage.getItem('token');
          if (token) {
            // send request via socket; global onCommandResponse handler will process the result
            requestContactsList(token);
          } else {
            // fallback to REST
            const resp = await userAPI.getFriends();
            setUsers(resp.data || []);
          }
        } else {
          const resp = await userAPI.getUsers();
          setUsers(resp.data || []);
        }
      } catch (err) {
        console.error('Lỗi tải danh sách cho tab:', err);
        // fallback to all users
        try {
          const resp = await userAPI.getUsers();
          setUsers(resp.data || []);
        } catch (e) {
          console.error('Fallback users failed', e);
        }
      }
    };

    // Load common data and the tab-specific list
    fetchGroups();
    fetchFriendRequests();
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

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedUser) return;

    // Create unique client message id for ACK tracking
    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setIsSending(true);

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
    setMessageText('');
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

  // Handle input change and send typing indicator
  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessageText(value);
    
    // Send typing indicator only if selectedUser exists
    if (selectedUser && currentUserId) {
      sendTyping(currentUserId, selectedUser.id, value.length > 0);
    }
  };

  // Open another user's public profile modal
  const openUserProfile = async (userId) => {
    try {
      const resp = await userAPI.getUserById(userId);
      setOtherProfileUser(resp.data);
      setOtherProfileOpen(true);
    } catch (err) {
      console.error('Lỗi tải profile người dùng:', err);
      alert('Không thể tải thông tin người dùng');
    }
  };

  // Handle file upload
  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedUser || !currentUserId) return;

    for (let file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sender_id', currentUserId);
      formData.append('receiver_id', selectedUser.id);

      try {
        setIsSending(true);
        console.log('Uploading file:', file.name, 'to user:', selectedUser.id);
        const response = await messageAPI.sendFile(formData);
        
        console.log('Upload response:', response.data);
        
        // Add file message to chat
        const fileMessage = {
          id: response.data.id,
          content: response.data.content,
          file_url: response.data.file_url,
          timestamp: response.data.timestamp,
          isSent: true,
          sender_id: currentUserId,
          status: 'sent',
        };
        
        setMessages((prev) => [...prev, fileMessage]);
        console.log('File message added to chat');
      } catch (err) {
        console.error('Lỗi gửi file:', err.response?.data || err.message);
        alert(`Lỗi gửi file: ${file.name}\n${err.response?.data?.error || err.message}`);
      } finally {
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
  };

  return (
    <div className="chat-container">
      {/* Left navigation column */}
      <aside className="left-nav">
        <div className="profile" style={{position:'relative'}}>
          {/* placeholder profile image or icon */}
          <img alt="profile" src={`https://ui-avatars.com/api/?name=${encodeURIComponent(currentUsername||'U')}&background=ffffff&color=0b5ed7`} onClick={(e) => {
            // open avatar modal
            setAvatarMenuOpen((v)=>!v);
          }} style={{cursor:'pointer',borderRadius:8}} />
        </div>
        <div className="nav-icons">
          <button
            className="nav-btn"
            title="Tin nhắn"
            onClick={() => {
              // show conversations (people/groups you've messaged)
              setFilterTab('conversations');
            }}
          >💬</button>
          <button
            className="nav-btn"
            title="Bạn bè"
            onClick={() => {
              // show accepted friends/contacts
              setFilterTab('contacts');
            }}
          >👥</button>
          <button
            className="nav-btn"
            title="Đồng bộ danh bạ"
            onClick={async () => {
              try {
                const token = localStorage.getItem('token');
                if (!token) {
                  alert('Cần đăng nhập để đồng bộ danh bạ');
                  return;
                }
                // Example: pull contacts from localStorage or prompt for a few numbers for demo
                const raw = window.prompt('Nhập danh bạ (phân tách bởi dấu phẩy):', '+84901234,+84881234');
                if (!raw) return;
                const arr = raw.split(',').map(s => s.trim()).filter(Boolean);
                requestContactsSync(arr, token);
                alert('Đã gửi yêu cầu đồng bộ danh bạ');
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
              alert('Mở Cloud (chưa triển khai)');
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
                alert('Đã cập nhật tên hiển thị');
              } catch (err) {
                console.error('Lỗi cập nhật tên:', err);
                alert('Cập nhật thất bại');
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

      {/* Conversation list (center column) */}
      <aside className="chat-sidebar conversation-list">
        <div className="sidebar-header">
          <h2>{filterTab === 'contacts' ? '👥 Bạn bè' : '💬 Danh sách'}</h2>
        </div>
        <div className="search-box" onMouseEnter={() => setSearchContainerActive(true)} onMouseLeave={() => setSearchContainerActive(false)}>
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
        </div>
        <div className="filter-bar">
          <button className={`filter ${filterTab==='conversations'?'active':''}`} onClick={() => setFilterTab('conversations')}>💬 Nhắn tin</button>
          <button className={`filter ${filterTab==='contacts'?'active':''}`} onClick={() => setFilterTab('contacts')}>👥 Bạn bè</button>
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
                          alt={r.username}
                          className="friend-avatar"
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
                                  alert(`✅ Đã kết bạn với ${r.username}`);
                                } catch (err) {
                                  console.error('Lỗi chấp nhận:', err);
                                  alert('Lỗi khi chấp nhận lời mời');
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
                          alt={u.username}
                          className="suggestion-avatar"
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
              style={{position:'relative'}}
            >
              <div className="conv-avatar" onClick={(e) => { e.stopPropagation(); openUserProfile(user.id); }} style={{cursor:'pointer'}}>{user.username[0]?.toUpperCase()}</div>
              <div className="conv-body">
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div className="conv-title" onClick={(e) => { e.stopPropagation(); if (!user.is_group) openUserProfile(user.id); }} style={{cursor: user.is_group ? 'default' : 'pointer'}}>{user.display_name || user.username}</div>
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
                                  // Send unblock or delete friend command via socket if available
                                  // For now, call REST endpoint to remove friend
                                  // Note: You may need to implement a removeFriend/unfriend endpoint in the backend
                                  const resp = await fetch(`/friends/${user.id}/remove`, {
                                    method: 'DELETE',
                                    headers: { 'Authorization': `Bearer ${token}` }
                                  });
                                  if (resp.ok) {
                                    // Remove from users list
                                    setUsers(prev => prev.filter(u => u.id !== user.id));
                                    alert(`✅ Đã hủy kết bạn với ${user.display_name || user.username}`);
                                  } else {
                                    alert('Lỗi khi hủy kết bạn');
                                  }
                                } else {
                                  alert('Chưa đăng nhập');
                                }
                              } catch (err) {
                                console.error('Lỗi hủy kết bạn:', err);
                                alert('Lỗi khi hủy kết bạn');
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
              <div style={{padding:'12px', borderBottom:'1px solid #e5e7eb'}}>
                <span style={{fontSize:'12px', fontWeight:'700', color:'#6b7280', textTransform:'uppercase'}}>Danh sách bạn bè</span>
              </div>
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`conversation-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                  onClick={() => handleSelectUser(user)}
                  style={{position:'relative'}}
                >
                  <div className="conv-avatar" onClick={(e) => { e.stopPropagation(); openUserProfile(user.id); }} style={{cursor:'pointer'}}>{user.username[0]?.toUpperCase()}</div>
                  <div className="conv-body">
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div className="conv-title" onClick={(e) => { e.stopPropagation(); if (!user.is_group) openUserProfile(user.id); }} style={{cursor: user.is_group ? 'default' : 'pointer'}}>{user.display_name || user.username}</div>
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
                                        headers: { 'Authorization': `Bearer ${token}` }
                                      });
                                      if (resp.ok) {
                                        setUsers(prev => prev.filter(u => u.id !== user.id));
                                        alert(`✅ Đã hủy kết bạn với ${user.display_name || user.username}`);
                                      } else {
                                        alert('Lỗi khi hủy kết bạn');
                                      }
                                    } else {
                                      alert('Chưa đăng nhập');
                                    }
                                  } catch (err) {
                                    console.error('Lỗi hủy kết bạn:', err);
                                    alert('Lỗi khi hủy kết bạn');
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
                  alert('Đã tạo nhóm');
                } catch (err) {
                  alert('Lỗi tạo nhóm');
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
                      alert(`Thành viên: ${names}`);
                    } catch (err) {
                      alert('Lỗi lấy thành viên');
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
                            alert('Cần đăng nhập để chặn người dùng');
                            return;
                          }
                          const target = selectedUser.id;
                          if (blockedTargets.includes(String(target))) {
                            // unblock
                            sendUnblockUser({ target, token });
                            setBlockedTargets(prev => prev.filter(x => x !== String(target)));
                            alert('Đã bỏ chặn');
                          } else {
                            sendBlockUser({ target, token });
                            setBlockedTargets(prev => [String(target), ...prev]);
                            alert('Đã chặn người dùng');
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
                          document.querySelector('.message-input')?.focus();
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
                onChange={handleInputChange}
                onFocus={() => setTyping(true)}
                onBlur={() => {
                  setTyping(false);
                  // Stop typing when focus lost
                  if (selectedUser && currentUserId) {
                    sendTyping(currentUserId, selectedUser.id, false);
                  }
                }}
                placeholder="Nhập tin nhắn..."
                className="message-input"
                disabled={isSending}
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
                  cursor: 'pointer',
                  padding: '8px',
                  color: '#667eea'
                }}
                title="Gửi file"
                disabled={isSending}
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
                  disabled={isSending}
                  style={{
                    opacity: isSending ? 0.6 : 1,
                    cursor: isSending ? 'not-allowed' : 'pointer',
                  }}
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
    </div>
  );
};

export default ChatBox;
