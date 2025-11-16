import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, userAPI } from '../../services/api';
import { initializeSocket, joinUserRoom } from '../../services/socket';

/**
 * LoginForm - Component đăng nhập
 * Gọi API /login, lưu JWT token, điều hướng tới /chat
 */
const LoginForm = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(username, password);
      if (response.data.success) {
        // Lưu token vào localStorage hoặc sessionStorage
        const token = response.data.token;
        if (remember) {
          localStorage.setItem('token', token);
          localStorage.setItem('username', username);
        } else {
          sessionStorage.setItem('token', token);
        }
        
        // Set token cho axios interceptor (lần sau request sẽ dùng)
        // Nhưng để đảm bảo ngay lập tức, ta ghi vào localStorage tạm thời
        localStorage.setItem('token', token);
        
        // Khởi tạo socket và join room
        try {
          const sock = initializeSocket();
          // Fetch current user info để lấy ID
          const meResp = await userAPI.getCurrent();
          const userId = meResp?.data?.id || response.data.user_info?.id;
          if (userId) {
            joinUserRoom(userId);
          }
        } catch (sErr) {
          console.warn('Socket init/join failed', sErr);
        }
        
        // Điều hướng sang /chat
        navigate('/chat');
      } else {
        setError(response.data.error || 'Đăng nhập thất bại');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>🔐 Đăng Nhập </h1>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="username">Tên đăng nhập:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Mật khẩu:</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                required
                style={{ paddingRight: '36px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                }}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, justifyContent: 'flex-start' }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ width: 'auto', display: 'inline-block', padding: 0, margin: 0 }}
              />
              <label onClick={() => setRemember(!remember)} style={{ margin: 0, cursor: 'pointer', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>Ghi nhớ đăng nhập</label>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Đang đăng nhập...' : 'Đăng Nhập'}
          </button>
        </form>

        <p className="auth-links">
          Chưa có tài khoản? <a href="/register">Đăng ký ngay</a>
        </p>
        <p className="auth-links">
          Quên mật khẩu? <a href="/forgot-password">Khôi phục tại đây</a>
        </p>
      </div>
    </div>
  );
};

export default LoginForm;
