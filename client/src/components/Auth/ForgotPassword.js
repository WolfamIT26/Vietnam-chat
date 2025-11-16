import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';
import OTPInput from './OTPInput';

/**
 * ForgotPassword - Component quên mật khẩu
 * Gửi OTP, nhập OTP + mật khẩu mới, reset password
 */
// Mask contact for display: handle email and phone differently
const maskContact = (c) => {
  if (!c) return '';
  if (c.includes('@')) {
    // email: show first char, mask localpart, keep domain
    const [local, domain] = c.split('@');
    if (!local) return `***@${domain}`;
    const visible = local.slice(0, 1);
    return `${visible}***@${domain}`;
  }
  // phone: show last 2 digits, mask the rest
  const digits = c.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length - 1) + digits.slice(-1);
  return `${'*'.repeat(digits.length - 2)}${digits.slice(-2)}`;
};
const ForgotPassword = () => {
  const [step, setStep] = useState(1); // 1: nhập username, 2: nhập OTP + mật khẩu mới
  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let iv = null;
    if (resendTimer > 0) {
      iv = setInterval(() => setResendTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(iv);
  }, [resendTimer]);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.forgotPassword(contact);
      if (response.data.success) {
        setSuccess('✅ OTP đã gửi!');
        setStep(2);
        // start 60s resend cooldown
        setResendTimer(60);
      } else {
        setError(response.data.error || 'Không thể gửi OTP');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu không khớp!');
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.resetPassword(contact, otp, newPassword);
      if (response.data.success) {
        setSuccess('✅ Đặt lại mật khẩu thành công! Hãy đăng nhập với mật khẩu mới.');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(response.data.error || 'Đặt lại mật khẩu thất bại');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.forgotPassword(contact);
      if (response.data.success) {
        setSuccess('✅ OTP đã gửi lại!');
        setResendTimer(60);
      } else {
        setError(response.data.error || 'Không thể gửi OTP');
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
        <h1>🔑 Khôi Phục Mật Khẩu</h1>

        {step === 1 ? (
          <form onSubmit={handleSendOTP}>
            <div className="form-group">
              <label htmlFor="contact">Email hoặc số điện thoại:</label>
              <input
                type="text"
                id="contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Nhập email hoặc số điện thoại"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Đang gửi OTP...' : 'Gửi OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <div className="form-group">
              <label htmlFor="otp">Mã OTP gửi tới <strong>{maskContact(contact)}</strong>:</label>
              <OTPInput value={otp} onChange={(v) => setOtp(v)} />
              <div style={{ marginTop: 8 }}>
                {resendTimer > 0 ? (
                  <span>Gửi lại trong {resendTimer}s</span>
                ) : (
                  <button type="button" onClick={handleResend} className="btn-link">Gửi lại OTP</button>
                )}
              </div>
            </div>

          <div className="form-group">
            <label htmlFor="newPassword">Mật khẩu mới:</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNewPassword ? 'text' : 'password'}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới"
                required
                style={{ paddingRight: '36px' }}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
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
                {showNewPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Xác nhận mật khẩu:</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                required
                style={{ paddingRight: '36px' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Đang đặt lại...' : 'Đặt Lại Mật Khẩu'}
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn-secondary"
            >
              Quay Lại
            </button>
          </form>
        )}

        <p className="auth-links">
          <a href="/login">← Quay lại đăng nhập</a>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
