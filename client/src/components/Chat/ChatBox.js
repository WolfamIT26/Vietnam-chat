import React, { useEffect, useState, useRef } from 'react';
import { initializeSocket, sendMessage, onReceiveMessage, joinUserRoom, sendReaction, onReaction, sendTyping, onTyping, onMessageSentAck } from '../../services/socket';
import { userAPI, messageAPI, groupAPI } from '../../services/api';
import MessageBubble from './MessageBubble';
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
  
  // Ref để scroll xuống cuối chat
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

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
          const resp = await userAPI.getFriends();
          // friends endpoint returns users
          setUsers(resp.data || []);
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
            acc.push({ ...m, timestamp, isSent: m.sender_id === currentUserId });
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
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await userAPI.acceptFriend(r.user_id);
                                const resp = await userAPI.getFriendRequests();
                                setFriendRequests(resp.data || []);
                                const usersResp = await userAPI.getUsers();
                                setUsers(usersResp.data || []);
                              } catch (err) {
                                console.error('Lỗi chấp nhận:', err);
                              }
                            }}
                            title="Chấp nhận"
                          >
                            ✓
                          </button>
                          <button
                            className="btn-decline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFriendRequests(prev => prev.filter(x => x.rel_id !== r.rel_id));
                            }}
                            title="Từ chối"
                          >
                            ✕
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
                                  await userAPI.addFriend(u.id);
                                  const resp = await userAPI.getSuggestions(6);
                                  setSuggestions(resp.data || []);
                                  // Also reload friends list if on contacts tab
                                  if (filterTab === 'contacts') {
                                    const friendsResp = await userAPI.getFriends();
                                    setUsers(friendsResp.data || []);
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
          {(!searchFocused || searchQuery.trim()) && users.map((user) => (
            <div
              key={user.id}
              className={`conversation-item ${selectedUser?.id === user.id ? 'active' : ''}`}
              onClick={() => handleSelectUser(user)}
            >
              <div className="conv-avatar" onClick={(e) => { e.stopPropagation(); openUserProfile(user.id); }} style={{cursor:'pointer'}}>{user.username[0]?.toUpperCase()}</div>
              <div className="conv-body">
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div className="conv-title" onClick={(e) => { e.stopPropagation(); if (!user.is_group) openUserProfile(user.id); }} style={{cursor: user.is_group ? 'default' : 'pointer'}}>{user.display_name || user.username}</div>
                  <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:'11px', fontWeight:'500', color: user.status === 'online' ? '#16a34a' : '#9ca3af'}}>{user.status === 'online' ? '🟢 Online' : '⚪ Offline'}</span>
                  </div>
                </div>
                <div className="conv-preview" style={{color: user.last_message ? '#1f2937' : '#9ca3af', fontWeight: user.last_message ? '500' : '400'}}>{user.last_message || (user.status === 'online' ? 'Đang online' : 'Chưa có tin nhắn')}</div>
              </div>
            </div>
          ))}
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
    </div>
  );
};

export default ChatBox;
