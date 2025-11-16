import React, { useState, useEffect } from 'react';
import { userAPI } from '../../services/api';
import api from '../../services/api';
import { sendFriendRequest } from '../../services/socket';

const formatDateVN = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day} tháng ${month}, ${year}`;
  } catch (e) {
    return iso;
  }
};

const formatPhone = (p) => {
  if (!p) return '';
  let digits = (p || '').replace(/[^0-9+]/g, '');
  if (digits.startsWith('0')) {
    // replace leading 0 with +84
    digits = '+84' + digits.slice(1);
  }
  // insert spaces after country code +84
  if (digits.startsWith('+')) {
    const rest = digits.slice(3);
    const groups = rest.match(/.{1,3}/g) || [rest];
    return `${digits.slice(0,3)} ${groups.join(' ')}`.trim();
  }
  return p;
};

const ProfileModal = ({ isOpen, onClose, user, onUpdated, onOpenEdit, isOwner = true, onStartChat = null }) => {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name || user?.username || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || '');
  const [file, setFile] = useState(null);
  const [gender, setGender] = useState(user?.gender || '');
  const [birthdate, setBirthdate] = useState(user?.birthdate || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [sendingFriendRequest, setSendingFriendRequest] = useState(false);

  useEffect(() => {
    setDisplayName(user?.display_name || user?.username || '');
    setAvatarPreview(user?.avatar_url || '');
    setFile(null);
    setGender(user?.gender || '');
    setBirthdate(user?.birthdate || '');
    setPhoneNumber(user?.phone_number || '');
  }, [user, isOpen]);

  if (!isOpen) return null;

  const onFileChange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleSave = async () => {
    try {
      let avatar_url = avatarPreview;
      // If a file was selected, upload it to backend first
      if (file) {
        const form = new FormData();
        form.append('avatar', file);
        // use axios instance so interceptor attaches token automatically
        const upResp = await api.post('/uploads/avatar', form, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        if (!upResp || !upResp.data) throw new Error('Upload failed (no response)');
        avatar_url = upResp.data.avatar_url;
      }

  const payload = { display_name: displayName };
  if (avatar_url) payload.avatar_url = avatar_url;
  if (gender) payload.gender = gender;
  if (birthdate) payload.birthdate = birthdate;
  if (phoneNumber) payload.phone_number = phoneNumber;
  const resp = await userAPI.updateMe(payload);
      // After successful save, update parent state and return to view mode inside this modal
      onUpdated && onUpdated(resp.data);
      setEditing(false);
    } catch (err) {
      // Try to surface server error message if available
      console.error('Update profile failed', err);
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message;
      alert(serverMsg ? `Cập nhật thất bại: ${serverMsg}` : 'Cập nhật thất bại');
    }
  };

  const handleLogout = async () => {
    // remove token and reload to login screen
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <div className="profile-modal-backdrop">
      <div className="profile-modal">
        <div className="profile-modal-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {editing ? (
              <button className="btn" onClick={() => setEditing(false)}>◀</button>
            ) : null}
            <h3 style={{margin:0}}>Thông tin tài khoản</h3>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="profile-hero" style={{background:'#e8f0ea',height:120}}></div>

        <div className="profile-main">
          <div className="profile-left">
            <div className="avatar-wrapper">
              <img className="profile-avatar" alt="avatar" src={avatarPreview || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName||user?.username||'U')}&background=ffffff&color=0b5ed7`} />
              <label className="avatar-upload">
                <input type="file" accept="image/*" onChange={onFileChange} style={{display:'none'}} />
                📷
              </label>
            </div>
            <h4>{displayName || user?.username}</h4>
          </div>

          <div className="profile-right">
            {!editing && (
              <div>
                <div style={{display:'grid',gridTemplateColumns:'120px 1fr',rowGap:12,columnGap:12,alignItems:'center'}}>
                  <div style={{color:'#6b7280'}}>Giới tính</div>
                  <div style={{fontWeight:600}}>{user?.gender === 'male' ? 'Nam' : user?.gender === 'female' ? 'Nữ' : ''}</div>

                  <div style={{color:'#6b7280'}}>Ngày sinh</div>
                  <div style={{fontWeight:600}}>{formatDateVN(user?.birthdate)}</div>

                  <div style={{color:'#6b7280'}}>Điện thoại</div>
                  <div style={{fontWeight:600}}>{formatPhone(user?.phone_number)}</div>
                </div>

                <div style={{marginTop:18}}>
                  <p style={{color:'#6b7280'}}>Chỉ bạn bè có lưu số của bạn trong danh bạ máy xem được số này</p>
                </div>

                <div style={{marginTop:12}}>
                  {isOwner ? (
                    <button onClick={() => { setEditing(true); }} className="btn">✎ Cập nhật</button>
                  ) : (
                    <div style={{display:'flex',gap:8}}>
                      {!user?.is_friend ? (
                        <button
                          className="btn"
                          disabled={sendingFriendRequest}
                          onClick={async () => {
                            const token = localStorage.getItem('token');
                            try {
                              setSendingFriendRequest(true);
                              if (token) {
                                sendFriendRequest({ target_user_id: user?.id, token });
                                alert('Đã gửi lời mời kết bạn');
                              } else {
                                await userAPI.addFriend(user?.id);
                                alert('Đã gửi lời mời kết bạn (REST)');
                              }
                            } catch (err) {
                              console.error('Send friend request failed', err);
                              const msg = err?.response?.data?.error || err?.message || 'Gửi thất bại';
                              alert(msg);
                            } finally {
                              setSendingFriendRequest(false);
                            }
                          }}
                        >
                          ➕ Thêm
                        </button>
                      ) : (
                        <button className="btn" disabled title="Bạn bè">Bạn bè</button>
                      )}

                      <button
                        className="btn"
                        onClick={() => {
                          try {
                            if (onStartChat) onStartChat(user);
                          } catch (e) {
                            console.error('onStartChat handler error', e);
                          }
                          onClose();
                        }}
                      >
                        ✉️ Nhắn tin
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {editing && (
              <div style={{display:'grid',gridTemplateColumns:'1fr',gap:12}}>
                <div className="form-group">
                  <label>Tên hiển thị</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Giới tính</label>
                  <div style={{display:'flex',gap:16,alignItems:'center'}}>
                    <label style={{display:'flex',alignItems:'center',gap:6}}><input type="radio" name="gender" value="male" checked={gender==='male'} onChange={() => setGender('male')} /> Nam</label>
                    <label style={{display:'flex',alignItems:'center',gap:6}}><input type="radio" name="gender" value="female" checked={gender==='female'} onChange={() => setGender('female')} /> Nữ</label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Ngày sinh</label>
                  <input type="date" value={birthdate || ''} onChange={(e) => setBirthdate(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Số điện thoại</label>
                  <input value={phoneNumber || ''} onChange={(e) => setPhoneNumber(e.target.value)} />
                </div>

                <div style={{marginTop:10}}>
                  <button onClick={handleSave} className="btn btn-primary">Lưu</button>
                  <button onClick={() => setEditing(false)} className="btn" style={{marginLeft:8}}>Hủy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
