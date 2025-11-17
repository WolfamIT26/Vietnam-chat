import React, { useState, useEffect } from 'react';
import { getNotificationSettings, updateNotificationSettings } from '../services/settingsService';
import SettingToggle from './common/SettingToggle';
import SettingSelect from './common/SettingSelect';

const NotificationSettings = () => {
  const [settings, setSettings] = useState({
    messageNotifications: true,
    messageSound: true,
    messageVibrate: true,
    groupNotifications: true,
    groupSound: true,
    callNotifications: true,
    callRingtone: 'default',
    showPreview: true,
    notificationLight: true
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await getNotificationSettings();
      setSettings(data);
      setError(null);
    } catch (err) {
      setError('Failed to load notification settings');
      console.error('Error loading notification settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key) => {
    const oldValue = settings[key];
    const newValue = !oldValue;
    
    // Optimistic update
    setSettings(prev => ({ ...prev, [key]: newValue }));
    
    try {
      await updateNotificationSettings({ [key]: newValue });
      setError(null);
    } catch (err) {
      // Rollback on error
      setSettings(prev => ({ ...prev, [key]: oldValue }));
      setError(`Failed to update ${key}`);
      console.error('Error updating setting:', err);
    }
  };

  const handleSelectChange = async (key, value) => {
    const oldValue = settings[key];
    
    // Optimistic update
    setSettings(prev => ({ ...prev, [key]: value }));
    
    try {
      await updateNotificationSettings({ [key]: value });
      setError(null);
    } catch (err) {
      // Rollback on error
      setSettings(prev => ({ ...prev, [key]: oldValue }));
      setError(`Failed to update ${key}`);
      console.error('Error updating setting:', err);
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading...</div>;
  }

  return (
    <div className="settings-section">
      <h3>Notification Settings</h3>
      {error && <div className="settings-error">{error}</div>}
      
      <div className="settings-group">
        <h4>Message Notifications</h4>
        <SettingToggle
          label="Show notifications"
          description="Display notifications for new messages"
          checked={settings.messageNotifications}
          onChange={() => handleToggle('messageNotifications')}
        />
        {settings.messageNotifications && (
          <>
            <SettingToggle
              label="Sound"
              description="Play sound for new messages"
              checked={settings.messageSound}
              onChange={() => handleToggle('messageSound')}
            />
            <SettingToggle
              label="Vibrate"
              description="Vibrate for new messages"
              checked={settings.messageVibrate}
              onChange={() => handleToggle('messageVibrate')}
            />
            <SettingToggle
              label="Show preview"
              description="Display message content in notifications"
              checked={settings.showPreview}
              onChange={() => handleToggle('showPreview')}
            />
          </>
        )}
      </div>

      <div className="settings-group">
        <h4>Group Notifications</h4>
        <SettingToggle
          label="Show group notifications"
          description="Display notifications for group messages"
          checked={settings.groupNotifications}
          onChange={() => handleToggle('groupNotifications')}
        />
        {settings.groupNotifications && (
          <SettingToggle
            label="Sound"
            description="Play sound for group messages"
            checked={settings.groupSound}
            onChange={() => handleToggle('groupSound')}
          />
        )}
      </div>

      <div className="settings-group">
        <h4>Call Notifications</h4>
        <SettingToggle
          label="Show call notifications"
          description="Display notifications for incoming calls"
          checked={settings.callNotifications}
          onChange={() => handleToggle('callNotifications')}
        />
        {settings.callNotifications && (
          <SettingSelect
            label="Ringtone"
            value={settings.callRingtone}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'classic', label: 'Classic' },
              { value: 'modern', label: 'Modern' },
              { value: 'silent', label: 'Silent' }
            ]}
            onChange={(value) => handleSelectChange('callRingtone', value)}
          />
        )}
      </div>

      <div className="settings-group">
        <h4>Other</h4>
        <SettingToggle
          label="Notification light"
          description="Use LED indicator for notifications"
          checked={settings.notificationLight}
          onChange={() => handleToggle('notificationLight')}
        />
      </div>
    </div>
  );
};

export default NotificationSettings;
