import React, { useState } from 'react';
import { changePassword, enable2FA, disable2FA, getSessions } from '../services/settingsService';
import SettingToggle from './common/SettingToggle';

const SecuritySettings = () => {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data.sessions || []);
      setTwoFactorEnabled(data.twoFactorEnabled || false);
    } catch (err) {
      console.error('Error loading sessions:', err);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setSuccess('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordForm(false);
    } catch (err) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAToggle = async () => {
    const oldValue = twoFactorEnabled;
    
    // Optimistic update
    setTwoFactorEnabled(!oldValue);
    
    try {
      if (oldValue) {
        await disable2FA();
      } else {
        await enable2FA();
      }
      setSuccess(`Two-factor authentication ${!oldValue ? 'enabled' : 'disabled'}`);
      setError(null);
    } catch (err) {
      // Rollback on error
      setTwoFactorEnabled(oldValue);
      setError('Failed to update two-factor authentication');
      console.error('Error updating 2FA:', err);
    }
  };

  const handleLogoutSession = async (sessionId) => {
    // Implementation would call API to logout specific session
    console.log('Logout session:', sessionId);
  };

  return (
    <div className="settings-section">
      <h3>Security Settings</h3>
      {error && <div className="settings-error">{error}</div>}
      {success && <div className="settings-success">{success}</div>}
      
      <div className="settings-group">
        <h4>Password</h4>
        {!showPasswordForm ? (
          <button 
            className="btn-primary"
            onClick={() => setShowPasswordForm(true)}
          >
            Change Password
          </button>
        ) : (
          <form onSubmit={handlePasswordChange} className="password-form">
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                required
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                required
                minLength={8}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Changing...' : 'Change Password'}
              </button>
              <button 
                type="button" 
                className="btn-secondary"
                onClick={() => {
                  setShowPasswordForm(false);
                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="settings-group">
        <h4>Two-Factor Authentication</h4>
        <SettingToggle
          label="Enable 2FA"
          description="Add an extra layer of security to your account"
          checked={twoFactorEnabled}
          onChange={handle2FAToggle}
        />
      </div>

      <div className="settings-group">
        <h4>Active Sessions</h4>
        <div className="sessions-list">
          {sessions.map(session => (
            <div key={session.id} className="session-item">
              <div className="session-info">
                <div className="session-device">{session.device}</div>
                <div className="session-details">
                  {session.location} • {session.lastActive}
                </div>
              </div>
              {!session.current && (
                <button 
                  className="btn-logout"
                  onClick={() => handleLogoutSession(session.id)}
                >
                  Logout
                </button>
              )}
              {session.current && (
                <span className="current-session-badge">Current</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;
