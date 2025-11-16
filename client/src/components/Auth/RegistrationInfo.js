import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const RegistrationInfo = () => {
  const navigate = useNavigate();
  const [regInfo, setRegInfo] = useState({
    username: '',
    contact: '',
    password: '',
  });

  useEffect(() => {
    // Load thông tin từ localStorage
    const username = localStorage.getItem('registeredUsername') || '';
    const contact = localStorage.getItem('registeredContact') || '';
    const password = localStorage.getItem('registeredPassword') || '';
    
    setRegInfo({ username, contact, password });
  }, []);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert('Đã copy vào clipboard!');
  };

  const handleClearInfo = () => {
    if (window.confirm('Bạn chắc chắn muốn xóa thông tin đã lưu?')) {
      localStorage.removeItem('registeredUsername');
      localStorage.removeItem('registeredContact');
      localStorage.removeItem('registeredPassword');
      setRegInfo({ username: '', contact: '', password: '' });
      alert('✅ Đã xóa thông tin');
    }
  };

  const handleGoToLogin = () => {
    // Pre-fill login form with registered username and password
    localStorage.setItem('preFilledUsername', regInfo.username);
    localStorage.setItem('preFilledPassword', regInfo.password);
    navigate('/login');
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>📋 Thông Tin Đăng Ký</h1>
        
        {regInfo.username ? (
          <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <div className="form-group">
              <label>Tên đăng nhập:</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="text" value={regInfo.username} readOnly style={{ flex: 1 }} />
                <button 
                  type="button" 
                  onClick={() => handleCopy(regInfo.username)} 
                  className="btn-primary"
                  style={{ padding: '8px 12px', fontSize: '12px' }}
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Email / Số điện thoại:</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="text" value={regInfo.contact} readOnly style={{ flex: 1 }} />
                <button 
                  type="button" 
                  onClick={() => handleCopy(regInfo.contact)} 
                  className="btn-primary"
                  style={{ padding: '8px 12px', fontSize: '12px' }}
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Mật khẩu:</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="password" value={regInfo.password} readOnly style={{ flex: 1 }} />
                <button 
                  type="button" 
                  onClick={() => handleCopy(regInfo.password)} 
                  className="btn-primary"
                  style={{ padding: '8px 12px', fontSize: '12px' }}
                >
                  Copy
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button 
                type="button" 
                onClick={handleGoToLogin} 
                className="btn-primary"
                style={{ flex: 1 }}
              >
                ✅ Đã ghi nhớ, đến đăng nhập
              </button>
              <button 
                type="button" 
                onClick={handleClearInfo}
                style={{ 
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                🗑️ Xóa thông tin
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p>📭 Không có thông tin đăng ký nào được lưu</p>
            <button 
              type="button" 
              onClick={() => navigate('/login')} 
              className="btn-primary"
              style={{ marginTop: '16px' }}
            >
              Quay lại đăng nhập
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegistrationInfo;
