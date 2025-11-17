import React, { useState } from 'react';
import { sendFriendRequest } from '../../services/socket';
import { userAPI } from '../../services/api';

const AddFriendModal = ({ isOpen, onClose }) => {
  const [target, setTarget] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!target.trim()) return;
    setSending(true);
    try {
      // Try REST first (backend supports POST /friends/:id/add)
      if (/^\d+$/.test(target.trim())) {
        await userAPI.addFriend(Number(target.trim()));
        setMessage('Đã gửi lời mời theo ID.');
      } else {
        // If not an ID, attempt socket send by username/phone
        sendFriendRequest({ target_phone: target.trim() });
        setMessage('Đã gửi lời mời.');
      }
    } catch (err) {
      console.error('Send friend request failed', err);
      setMessage('Gửi thất bại.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal small-modal add-friend-modal">
        <div className="modal-header">
          <h3>Thêm bạn mới</h3>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <label>Nhập username hoặc số điện thoại</label>
          <input value={target} onChange={(e)=>setTarget(e.target.value)} placeholder="username hoặc phone" />
          <div style={{marginTop:8}}>
            <button className="btn" type="submit" disabled={sending}>Gửi lời mời</button>
            <button className="btn btn-ghost" type="button" onClick={onClose} style={{marginLeft:8}}>Đóng</button>
          </div>
          {message && <div style={{marginTop:8}} className="muted">{message}</div>}
        </form>
      </div>
    </div>
  );
};

export default AddFriendModal;
