import React, { useState, useEffect } from 'react';
import { getPrivacySettings, updatePrivacySettings } from '../services/settingsService';
import SettingToggle from './common/SettingToggle';
import SettingSelect from './common/SettingSelect';

const PrivacySettings = () => {
  const [settings, setSettings] = useState({
    lastSeen: 'everyone',
    profilePhoto: 'everyone',
    about: 'everyone',
    readReceipts: true,
    groupsAddMe: 'everyone',
    blockedContacts: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await getPrivacySettings();
      setSettings(data);
      setError(null);
    } catch (err) {
      setError('Failed to load privacy settings');
      console.error('Error loading privacy settings:', err);
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
      await updatePrivacySettings({ [key]: newValue });
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
      await updatePrivacySettings({ [key]: value });
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

  const privacyOptions = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'contacts', label: 'My Contacts' },
    { value: 'nobody', label: 'Nobody' }
  ];

  return (
    <div className="settings-section">
      <h3>Privacy Settings</h3>
      {error && <div className="settings-error">{error}</div>}
      
      <div className="settings-group">
        <h4>Who can see my personal info</h4>
        <SettingSelect
          label="Last seen"
          value={settings.lastSeen}
          options={privacyOptions}
          onChange={(value) => handleSelectChange('lastSeen', value)}
        />
        <SettingSelect
          label="Profile photo"
          value={settings.profilePhoto}
          options={privacyOptions}
          onChange={(value) => handleSelectChange('profilePhoto', value)}
        />
        <SettingSelect
          label="About"
          value={settings.about}
          options={privacyOptions}
          onChange={(value) => handleSelectChange('about', value)}
        />
      </div>

      <div className="settings-group">
        <h4>Messaging</h4>
        <SettingToggle
          label="Read receipts"
          description="If turned off, you won't send or receive read receipts"
          checked={settings.readReceipts}
          onChange={() => handleToggle('readReceipts')}
        />
      </div>

      <div className="settings-group">
        <h4>Groups</h4>
        <SettingSelect
          label="Who can add me to groups"
          value={settings.groupsAddMe}
          options={privacyOptions}
          onChange={(value) => handleSelectChange('groupsAddMe', value)}
        />
      </div>

      <div className="settings-group">
        <h4>Blocked Contacts</h4>
        <div className="blocked-list">
          {settings.blockedContacts.length === 0 ? (
            <p className="empty-state">No blocked contacts</p>
          ) : (
            settings.blockedContacts.map(contact => (
              <div key={contact.id} className="blocked-item">
                <span>{contact.name}</span>
                <button className="btn-unblock">Unblock</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;
