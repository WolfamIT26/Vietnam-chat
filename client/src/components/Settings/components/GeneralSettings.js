import React, { useState, useEffect } from 'react';
import { getGeneralSettings, updateGeneralSettings } from '../services/settingsService';
import SettingToggle from './common/SettingToggle';
import SettingSelect from './common/SettingSelect';

const GeneralSettings = () => {
  const [settings, setSettings] = useState({
    language: 'en',
    autoDownloadMedia: true,
    saveToGallery: false,
    fontSize: 'medium'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await getGeneralSettings();
      setSettings(data);
      setError(null);
    } catch (err) {
      setError('Failed to load settings');
      console.error('Error loading general settings:', err);
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
      await updateGeneralSettings({ [key]: newValue });
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
      await updateGeneralSettings({ [key]: value });
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
      <h3>General Settings</h3>
      {error && <div className="settings-error">{error}</div>}
      
      <div className="settings-group">
        <h4>Language & Region</h4>
        <SettingSelect
          label="Language"
          value={settings.language}
          options={[
            { value: 'en', label: 'English' },
            { value: 'vi', label: 'Tiếng Việt' },
            { value: 'fr', label: 'Français' },
            { value: 'es', label: 'Español' }
          ]}
          onChange={(value) => handleSelectChange('language', value)}
        />
      </div>

      <div className="settings-group">
        <h4>Media</h4>
        <SettingToggle
          label="Auto-download media"
          description="Automatically download photos and videos when on Wi-Fi"
          checked={settings.autoDownloadMedia}
          onChange={() => handleToggle('autoDownloadMedia')}
        />
        <SettingToggle
          label="Save to gallery"
          description="Save received media to your device's gallery"
          checked={settings.saveToGallery}
          onChange={() => handleToggle('saveToGallery')}
        />
      </div>

      <div className="settings-group">
        <h4>Display</h4>
        <SettingSelect
          label="Font size"
          value={settings.fontSize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
            { value: 'extra-large', label: 'Extra Large' }
          ]}
          onChange={(value) => handleSelectChange('fontSize', value)}
        />
      </div>
    </div>
  );
};

export default GeneralSettings;
