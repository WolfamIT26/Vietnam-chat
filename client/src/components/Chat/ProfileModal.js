import React, { useState, useEffect } from 'react';
import { userAPI } from '../../services/api';
import api, { apiDirect } from '../../services/api';
import { sendFriendRequest } from '../../services/socket';
import { showToast, showSystemNotification } from '../../services/notifications';
import profileSync from '../../services/profileSync';

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
  const [saving, setSaving] = useState(false);
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);
  const [unfriendProcessing, setUnfriendProcessing] = useState(false);

  useEffect(() => {
    setDisplayName(user?.display_name || user?.username || '');
    setAvatarPreview(user?.avatar_url || '');
    setFile(null);
    setGender(user?.gender || '');
    setBirthdate(user?.birthdate || '');
    setPhoneNumber(user?.phone_number || '');
    // no-op: keep local component state in sync with provided `user`
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
      setSaving(true);
      let avatar_url = avatarPreview;
      // If a file was selected, upload it to backend first
      if (file) {
        const form = new FormData();
        form.append('avatar', file);
        // Try proxied request first, then fallback to direct backend call, then fetch fallback
        let upResp = null;
        try {
          upResp = await api.post('/uploads/avatar', form);
        } catch (err) {
          console.warn('proxied upload failed', err);
          try {
            upResp = await apiDirect.post('/uploads/avatar', form);
          } catch (err2) {
            console.warn('direct axios upload failed', err2);
            // final fetch fallback to direct baseURL
            try {
              const directBase = apiDirect?.defaults?.baseURL || 'http://localhost:5000';
              const token = localStorage.getItem('token') || sessionStorage.getItem('token');
              const fetchResp = await fetch(directBase + '/uploads/avatar', {
                method: 'POST',
                body: form,
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
              });
              const contentType = fetchResp.headers.get('content-type') || '';
              const data = contentType.includes('application/json') ? await fetchResp.json() : await fetchResp.text();
              upResp = { status: fetchResp.status, data };
            } catch (err3) {
              console.error('fetch upload fallback failed', err3);
              throw err; // rethrow original proxied error to be handled by outer catch
            }
          }
        }
        if (!upResp || !upResp.data) throw new Error('Upload failed (no response)');
        // Accept multiple possible response shapes from backend
        const d = upResp.data || {};
        avatar_url = d.avatar_url || d.url || d.file_url || d.path || avatarPreview;
        if (!avatar_url) {
          throw new Error('Upload did not return avatar URL');
        }
      }

  const payload = { display_name: displayName };
  if (avatar_url) payload.avatar_url = avatar_url;
  if (gender) payload.gender = gender;
  if (birthdate) payload.birthdate = birthdate;
  if (phoneNumber) payload.phone_number = phoneNumber;
  // Try to update via proxied API first; fallback to direct backend if needed
  let resp = null;
  const directBase = apiDirect?.defaults?.baseURL || 'http://localhost:5000';
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  try {
    resp = await userAPI.updateMe(payload);
  } catch (err) {
    console.warn('proxied patch failed', err);
    try {
      resp = await apiDirect.patch('/users/me', payload);
    } catch (err2) {
      console.warn('direct axios patch failed', err2);
      // final fetch fallback to direct backend
      try {
        const fetchResp = await fetch(directBase + '/users/me', {
          method: 'PATCH',
          headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
          body: JSON.stringify(payload),
        });
        const ctype = fetchResp.headers.get('content-type') || '';
        const pdata = ctype.includes('application/json') ? await fetchResp.json() : await fetchResp.text();
        if (!fetchResp.ok) {
          throw new Error(`fetch patch failed ${fetchResp.status} ${JSON.stringify(pdata)}`);
        }
        resp = { status: fetchResp.status, data: pdata };
      } catch (err3) {
        console.error('fetch patch fallback failed', err3);
        throw err; // rethrow original proxied error to be handled by outer catch
      }
    }
  }
      // After successful save, update parent state and return to view mode inside this modal
      try {
        // Update local preview/avatar state and clear file
        setAvatarPreview(avatar_url);
        setFile(null);
      } catch (e) {}
      onUpdated && onUpdated(resp.data);
      setEditing(false);
      showToast('Cập nhật thành công', 'Thông tin cá nhân của bạn đã được cập nhật.', { variant: 'success', icon: '✓' });
      showSystemNotification('Cập nhật thành công', 'Thông tin cá nhân của bạn đã được cập nhật.');
    } catch (err) {
      // Improved diagnostics: log whole axios error and present a clearer toast
      try {
        console.error('Update profile failed', err);
        if (err && typeof err.toJSON === 'function') console.error('Axios error.toJSON():', err.toJSON());
        if (err?.config) console.error('Request config:', err.config);
        if (err?.request) console.error('No/partial response. Request:', err.request);
        if (err?.response) console.error('Response data:', err.response.status, err.response.data);
      } catch (logErr) {
        console.error('Error while logging profile update failure', logErr);
      }

      // Build user-facing message
      let msg = 'Cập nhật thất bại';
      if (err?.response) {
        const status = err.response.status;
        let body = err.response.data;
        try { body = typeof body === 'object' ? JSON.stringify(body) : String(body); } catch (e) { body = String(err.response.data); }
        msg = `Cập nhật thất bại: server ${status} ${body}`;
      } else if (err?.request) {
        // request was made but no response received
        msg = `Cập nhật thất bại: không nhận được phản hồi từ server (${err.message || err.code || 'Network Error'})`;
      } else if (err?.message) {
        msg = `Cập nhật thất bại: ${err.message}`;
      }

      // If request was made but no response was received, perform an optimistic local update
      if (err && err.request && !err.response) {
        const localUser = Object.assign({}, user || {});
        localUser.display_name = displayName;
        localUser.gender = gender || null;
        localUser.birthdate = birthdate || null;
        localUser.phone_number = phoneNumber || null;
        // Use avatarPreview which may be a data URL if upload didn't return a server URL
        if (avatarPreview) localUser.avatar_url = avatarPreview;

        // persist locally and queue pending update
        profileSync.saveLocalProfile(localUser.id || user?.id || 'local', localUser);
        profileSync.addPendingUpdate(localUser.id || user?.id || 'local', {
          display_name: localUser.display_name,
          avatar_url: localUser.avatar_url,
          gender: localUser.gender,
          birthdate: localUser.birthdate,
          phone_number: localUser.phone_number,
        });

        // Update local component state so view reflects new values
        try {
          setAvatarPreview(localUser.avatar_url || '');
          setDisplayName(localUser.display_name || '');
          setGender(localUser.gender || '');
          setBirthdate(localUser.birthdate || '');
          setPhoneNumber(localUser.phone_number || '');
        } catch (e) {}

        onUpdated && onUpdated(localUser);
        setEditing(false);
        showToast('Cập nhật thành công (cục bộ)', 'Đã lưu cục bộ — sẽ tự đồng bộ lên server khi có kết nối.', { variant: 'success', icon: '✓' });
        showSystemNotification('Cập nhật thành công (cục bộ)', 'Đã lưu cục bộ — sẽ tự đồng bộ lên server khi có kết nối.');
        setSaving(false);
        return;
      }

      showToast('Cập nhật thất bại', msg);
      showSystemNotification('Cập nhật thất bại', msg);
    } finally {
      setSaving(false);
    }
  };



  const handleLogout = async () => {
    // remove token and reload to login screen
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <div className="profile-modal-backdrop" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div className="profile-modal" style={{width:720, maxWidth:'95%', maxHeight:'80vh', background:'#fff', borderRadius:10, overflow:'hidden', display:'flex', flexDirection:'column'}}>
        <div className="profile-modal-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between', padding:12, borderBottom:'1px solid #eee'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {editing ? (
              <button className="btn" onClick={() => setEditing(false)} style={{padding:'6px 8px'}}>◀</button>
            ) : null}
            <h3 style={{margin:0,fontSize:16}}>Thông tin tài khoản</h3>
          </div>
          <button onClick={onClose} style={{border:'none',background:'#f3f4f6',width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:6,cursor:'pointer'}}>✕</button>
        </div>

        <div style={{height:64, background:'#e8f0ea', flexShrink:0}} />

        <div className="profile-main" style={{overflowY:'auto', padding:16, display:'flex', gap:20}}>
          <div className="profile-left" style={{width:220, display:'flex', flexDirection:'column', alignItems:'center'}}>
            <div className="avatar-wrapper" style={{width:120,height:120,borderRadius:60,overflow:'hidden',background:'#f0f0f0',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <img className="profile-avatar" alt="avatar" src={avatarPreview || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName||user?.username||'U')}&background=ffffff&color=0b5ed7`} style={{width:'100%',height:'100%',objectFit:'cover'}} />
            </div>
            <label style={{marginTop:8,cursor:'pointer'}} className="avatar-upload">
              <input type="file" accept="image/*" onChange={onFileChange} style={{display:'none'}} />
              📷
            </label>
            <h4 style={{marginTop:8, textAlign:'center'}}>{displayName || user?.username}</h4>
          </div>

          <div className="profile-right" style={{flex:1}}>
            {!editing && (
              <div>
                <div style={{display:'grid',gridTemplateColumns:'140px 1fr',rowGap:10,columnGap:12,alignItems:'center'}}>
                  <div style={{color:'#6b7280', fontSize:13}}>Giới tính</div>
                  <div style={{fontWeight:600, fontSize:14}}>{user?.gender === 'male' ? 'Nam' : user?.gender === 'female' ? 'Nữ' : ''}</div>

                  <div style={{color:'#6b7280', fontSize:13}}>Ngày sinh</div>
                  <div style={{fontWeight:600, fontSize:14}}>{formatDateVN(user?.birthdate)}</div>

                  <div style={{color:'#6b7280', fontSize:13}}>Điện thoại</div>
                  <div style={{fontWeight:600, fontSize:14}}>{formatPhone(user?.phone_number)}</div>
                </div>

                <div style={{marginTop:12}}>
                  <p style={{color:'#6b7280', margin:0}}>Chỉ bạn bè có lưu số của bạn trong danh bạ máy xem được số này</p>
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
              </div>
            )}

                  {/* pending-sync banner removed per user request */}
          </div>
        </div>

        {/* Sticky footer with actions */}
        <div style={{borderTop:'1px solid #eee', padding:12, display:'flex', justifyContent:'flex-end', gap:8, flexShrink:0, background:'#fff'}}>
          {!editing && isOwner && (
            <button onClick={() => setEditing(true)} className="btn">✎ Cập nhật</button>
          )}

          {!editing && !isOwner && (
            <div style={{display:'flex',gap:8}}>
              {!user?.is_friend ? (
                <button className="btn" disabled={sendingFriendRequest} onClick={async () => {
                  const token = localStorage.getItem('token');
                  try {
                    setSendingFriendRequest(true);
                    if (token) {
                      sendFriendRequest({ target_user_id: user?.id, token });
                      showToast('Lời mời kết bạn', 'Đã gửi lời mời kết bạn');
                      showSystemNotification('Lời mời kết bạn', 'Đã gửi lời mời kết bạn');
                    } else {
                      await userAPI.addFriend(user?.id);
                      showToast('Lời mời kết bạn', 'Đã gửi lời mời kết bạn (REST)');
                      showSystemNotification('Lời mời kết bạn', 'Đã gửi lời mời kết bạn (REST)');
                    }
                  } catch (err) {
                    console.error('Send friend request failed', err);
                    const msg = err?.response?.data?.error || err?.message || 'Gửi thất bại';
                    showToast('Gửi lời mời thất bại', msg);
                    showSystemNotification('Gửi lời mời thất bại', msg);
                  } finally {
                    setSendingFriendRequest(false);
                  }
                }}>➕ Thêm</button>
              ) : (
                <div>
                  {!showUnfriendConfirm ? (
                    <button className="btn" onClick={() => setShowUnfriendConfirm(true)}>Bạn bè</button>
                  ) : (
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span style={{color:'#b91c1c', fontWeight:600}}>Xác nhận xóa bạn bè?</span>
                      <button className="btn" disabled={unfriendProcessing} onClick={async () => {
                        try {
                          setUnfriendProcessing(true);
                          await userAPI.removeFriend(user.id);
                          showToast('Bạn bè', `Đã xóa ${user.display_name || user.username}`);
                          showSystemNotification('Bạn bè', `Đã xóa ${user.display_name || user.username}`);
                          // Notify parent that profile changed so lists can refresh
                          onUpdated && onUpdated(null);
                          setShowUnfriendConfirm(false);
                          onClose();
                        } catch (err) {
                          console.error('Remove friend failed', err);
                          const msg = err?.response?.data?.error || err?.message || 'Xóa thất bại';
                          showToast('Lỗi', msg);
                          showSystemNotification('Lỗi', msg);
                        } finally {
                          setUnfriendProcessing(false);
                        }
                      }}>Xác nhận</button>
                      <button className="btn" onClick={() => setShowUnfriendConfirm(false)}>Hủy</button>
                    </div>
                  )}
                </div>
              )}

              <button className="btn" onClick={() => { try { if (onStartChat) onStartChat(user); } catch(e){} onClose(); }}>✉️ Nhắn tin</button>
            </div>
          )}

          {editing && (
            <>
              <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button onClick={() => setEditing(false)} className="btn">Hủy</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
