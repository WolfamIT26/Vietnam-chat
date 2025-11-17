import React, { useState, useEffect } from 'react';
import { userAPI } from '../../services/api';
import api from '../../services/api';
import { showToast, showSystemNotification } from '../../services/notifications';
import profileSync from '../../services/profileSync';

const EditProfileModal = ({ isOpen, onClose, user, onSaved, onBack }) => {
  const [displayName, setDisplayName] = useState(user?.display_name || user?.username || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [birthdate, setBirthdate] = useState(user?.birthdate || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [file, setFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || '');

  useEffect(() => {
    setDisplayName(user?.display_name || user?.username || '');
    setGender(user?.gender || '');
    setBirthdate(user?.birthdate || '');
    setPhoneNumber(user?.phone_number || '');
    setAvatarPreview(user?.avatar_url || '');
    setFile(null);
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
      if (file) {
        const form = new FormData();
        form.append('avatar', file);
        // Let the browser set the Content-Type (including boundary) for FormData
        const upResp = await api.post('/uploads/avatar', form);
        avatar_url = upResp.data.avatar_url || upResp.data.file_url || avatar_url;
      }
      const payload = { display_name: displayName };
      // avoid sending data URLs as avatar_url (only send server-hosted paths)
      if (avatar_url && !avatar_url.startsWith('data:')) payload.avatar_url = avatar_url;
      if (gender) payload.gender = gender;
      if (birthdate) payload.birthdate = birthdate;
      if (phoneNumber) payload.phone_number = phoneNumber;
      const resp = await userAPI.updateMe(payload);
      onSaved && onSaved(resp.data);
      // show polished success toast
      showToast('Cập nhật thành công', 'Thông tin cá nhân của bạn đã được cập nhật.', { variant: 'success', icon: '✓' });
      showSystemNotification('Cập nhật thành công', 'Thông tin cá nhân của bạn đã được cập nhật.');
      onClose();
    } catch (err) {
      // Detailed logging to help debug network/CORS issues
      console.error('Save profile failed', {
        message: err?.message,
        config: err?.config,
        request: err?.request,
        response: err?.response,
      });

      // If there's no response from server it's likely a network/CORS error.
      if (!err || !err.response) {
        // Perform an optimistic local update so the UI reflects user's changes immediately.
        const localUser = Object.assign({}, user || {});
        localUser.display_name = displayName;
        localUser.gender = gender || null;
        localUser.birthdate = birthdate || null;
        localUser.phone_number = phoneNumber || null;
        // Use preview avatar for local display (may be data URL)
        if (avatarPreview) localUser.avatar_url = avatarPreview;

        // persist locally and add to pending updates so it survives reloads
        profileSync.saveLocalProfile(localUser.id || user?.id || 'local', localUser);
        profileSync.addPendingUpdate(localUser.id || user?.id || 'local', {
          display_name: localUser.display_name,
          avatar_url: localUser.avatar_url,
          gender: localUser.gender,
          birthdate: localUser.birthdate,
          phone_number: localUser.phone_number,
        });

        onSaved && onSaved(localUser);
        onClose();

        showToast('Cập nhật thành công (cục bộ)', 'Đã lưu cục bộ — sẽ tự đồng bộ lên server khi có kết nối.', { variant: 'success', icon: '✓' });
        showSystemNotification('Cập nhật thành công (cục bộ)', 'Đã lưu cục bộ — sẽ tự đồng bộ lên server khi có kết nối.');
        return;
      }

      const serverMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message;
      const msg = serverMsg ? `Lưu thất bại: ${serverMsg}` : 'Lưu thất bại';
      showToast('Lưu hồ sơ thất bại', msg);
      showSystemNotification('Lưu hồ sơ thất bại', msg);
    }
  };

  // Render as a right-side panel (drawer) to match requested UI
  return (
    <div style={{position:'fixed',top:0,right:0,bottom:0,width:420,background:'#fff',zIndex:1200,boxShadow:'-8px 0 24px rgba(0,0,0,0.12)',display:'flex',flexDirection:'column'}}>
      {/* left blue strip */}
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:12,background:'#0b5ed7'}} />

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid #eee'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button className="btn" onClick={() => { if (onBack) onBack(); else onClose(); }} style={{marginLeft:4}}>◀</button>
          <h3 style={{margin:0,fontSize:18}}>Cập nhật thông tin cá nhân</h3>
        </div>
        <button onClick={onClose} style={{border:'none',background:'transparent',fontSize:18}}>✕</button>
      </div>

      <div style={{overflowY:'auto',padding:20,flex:1,background:'#f7f7f7'}}>
        <div style={{display:'flex',gap:20}}>
          <div style={{width:200,display:'flex',flexDirection:'column',alignItems:'center'}}>
            <div style={{width:160,height:160,borderRadius:80,overflow:'hidden',background:'#f0f0f0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:48,color:'#333'}}>
              {avatarPreview ? <img src={avatarPreview} alt="avatar" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : (displayName ? displayName.split(' ').map(s=>s[0]).join('').toUpperCase() : (user?.username||'U')[0].toUpperCase())}
            </div>
            <div style={{marginTop:12}}>
              <label className="btn">Chọn ảnh<input type="file" accept="image/*" onChange={onFileChange} style={{display:'none'}} /></label>
            </div>
          </div>

          <div style={{flex:1}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr',gap:14}}>
              <div className="form-group">
                <label>Tên hiển thị</label>
                <input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Giới tính</label>
                <div style={{display:'flex',gap:20,alignItems:'center'}}>
                  <label style={{display:'flex',alignItems:'center',gap:6}}><input type="radio" name="g" value="male" checked={gender==='male'} onChange={()=>setGender('male')} /> Nam</label>
                  <label style={{display:'flex',alignItems:'center',gap:6}}><input type="radio" name="g" value="female" checked={gender==='female'} onChange={()=>setGender('female')} /> Nữ</label>
                </div>
              </div>

              <div className="form-group">
                <label>Ngày sinh</label>
                <input type="date" value={birthdate||''} onChange={(e)=>setBirthdate(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Số điện thoại</label>
                <input value={phoneNumber||''} onChange={(e)=>setPhoneNumber(e.target.value)} />
              </div>

              <div style={{marginTop:6,display:'flex',gap:12}}>
                <button className="btn btn-primary" onClick={async () => {
                  await handleSave();
                  if (onBack) onBack();
                }}>Lưu</button>
                <button className="btn" style={{marginLeft:8}} onClick={() => { if (onBack) onBack(); else onClose(); }}>Hủy</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;
