import React, { useState, useEffect } from 'react';
import { getAppearanceSettings, updateAppearanceSettings } from '../services/settingsService';
import SettingToggle from './common/SettingToggle';
import SettingSelect from './common/SettingSelect';

const AppearanceSettings = () => {
  const [settings, setSettings] = useState({
    theme: 'auto',
    chatWallpaper: 'default',
    bubbleStyle: 'rounded',
    showAvatars: true,
    compactMode: false,
    animationsEnabled: true,
    emojiSize: 'medium'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await getAppearanceSettings();
      setSettings(data);
      setError(null);
      
      // Apply theme immediately
      applyTheme(data.theme);
    } catch (err) {
      setError('Failed to load appearance settings');
      console.error('Error loading appearance settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (theme) => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark-theme');
      root.classList.remove('light-theme');
    } else if (theme === 'light') {
      root.classList.add('light-theme');
      root.classList.remove('dark-theme');
    } else {
      // Auto - use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark-theme');
        root.classList.remove('light-theme');
      } else {
        root.classList.add('light-theme');
        root.classList.remove('dark-theme');
      }
    }
  };

  const handleToggle = async (key) => {
    const oldValue = settings[key];
    const newValue = !oldValue;
    
    // Optimistic update
    setSettings(prev => ({ ...prev, [key]: newValue }));
    
    try {
      await updateAppearanceSettings({ [key]: newValue });
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
    
    // Apply theme change immediately
    if (key === 'theme') {
      applyTheme(value);
    }
    
    try {
      await updateAppearanceSettings({ [key]: value });
      setError(null);
    } catch (err) {
      // Rollback on error
      setSettings(prev => ({ ...prev, [key]: oldValue }));
      if (key === 'theme') {
        applyTheme(oldValue);
      }
      setError(`Failed to update ${key}`);
      console.error('Error updating setting:', err);
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading...</div>;
  }

  return (
    <div className="settings-section">
      <h3>Appearance Settings</h3>
      {error && <div className="settings-error">{error}</div>}
      
      <div className="settings-group">
        <h4>Theme</h4>
        <SettingSelect
          label="App theme"
          value={settings.theme}
          options={[
            { value: 'auto', label: 'Auto (System)' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' }
          ]}
          onChange={(value) => handleSelectChange('theme', value)}
        />
        <div className="theme-preview">
          {settings.theme === 'light' && <div className="preview-light">☀️ Light Theme</div>}
          {settings.theme === 'dark' && <div className="preview-dark">🌙 Dark Theme</div>}
          {settings.theme === 'auto' && <div className="preview-auto">🔄 Auto (follows system)</div>}
        </div>
      </div>

      <div className="settings-group">
        <h4>Chat Appearance</h4>
        <SettingSelect
          label="Chat wallpaper"
          value={settings.chatWallpaper}
          options={[
            { value: 'default', label: 'Default' },
            { value: 'none', label: 'None' },
            { value: 'gradient1', label: 'Gradient Blue' },
            { value: 'gradient2', label: 'Gradient Purple' },
            { value: 'pattern1', label: 'Pattern 1' },
            { value: 'pattern2', label: 'Pattern 2' }
          ]}
          onChange={(value) => handleSelectChange('chatWallpaper', value)}
        />
        <SettingSelect
          label="Bubble style"
          value={settings.bubbleStyle}
          options={[
            { value: 'rounded', label: 'Rounded' },
            { value: 'squared', label: 'Squared' },
            { value: 'minimal', label: 'Minimal' }
          ]}
          onChange={(value) => handleSelectChange('bubbleStyle', value)}
        />
      </div>

      <div className="settings-group">
        <h4>Display Options</h4>
        <SettingToggle
          label="Show avatars in chat"
          description="Display profile pictures in conversations"
          checked={settings.showAvatars}
          onChange={() => handleToggle('showAvatars')}
        />
        <SettingToggle
          label="Compact mode"
          description="Reduce spacing for more content on screen"
          checked={settings.compactMode}
          onChange={() => handleToggle('compactMode')}
        />
        <SettingToggle
          label="Enable animations"
          description="Show smooth transitions and animations"
          checked={settings.animationsEnabled}
          onChange={() => handleToggle('animationsEnabled')}
        />
      </div>

      <div className="settings-group">
        <h4>Emoji & Stickers</h4>
        <SettingSelect
          label="Emoji size"
          value={settings.emojiSize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' }
          ]}
          onChange={(value) => handleSelectChange('emojiSize', value)}
        />
      </div>
    </div>
  );
};

export default AppearanceSettings;
