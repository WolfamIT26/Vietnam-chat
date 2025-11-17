import React, { useState } from 'react';
import api from '../../services/api';

const CreateGroupModal = ({ isOpen, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const resp = await api.groupAPI.createGroup(name.trim());
      setMessage('Nhóm đã tạo');
      setName('');
      if (onCreated && resp && resp.data) onCreated(resp.data);
    } catch (err) {
      console.error('Create group failed', err);
      setMessage('Tạo thất bại');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal small-modal create-group-modal">
        <div className="modal-header">
          <h3>Tạo nhóm mới</h3>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleCreate} className="modal-body">
          <label>Tên nhóm</label>
          <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Tên nhóm" />
          <div style={{marginTop:8}}>
            <button className="btn" type="submit" disabled={creating}>Tạo</button>
            <button className="btn btn-ghost" type="button" onClick={onClose} style={{marginLeft:8}}>Đóng</button>
          </div>
          {message && <div style={{marginTop:8}} className="muted">{message}</div>}
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
