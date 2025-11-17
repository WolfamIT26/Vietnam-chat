import React, { useState, useEffect } from 'react';import React, { useState, useEffect } from 'react';
import GeneralSettings from './components/GeneralSettings';



































































export default Settings;};  );    </div>      </div>        {renderActiveSection()}      <div className="settings-content">      </div>        </nav>          ))}            </button>              <span className="nav-text">{section.name}</span>              <span className="nav-icon">{section.icon}</span>            >              onClick={() => setActiveSection(section.id)}              className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}              key={section.id}            <button          {sections.map(section => (        <nav className="settings-nav">        </div>          <h2>Settings</h2>        <div className="settings-header">      <div className="settings-sidebar">    <div className="settings-container">  return (  };    }        return <GeneralSettings />;      default:        return <AppearanceSettings />;      case 'appearance':        return <CallSettings />;      case 'calls':        return <NotificationSettings />;      case 'notifications':        return <SecuritySettings />;      case 'security':        return <PrivacySettings />;      case 'privacy':        return <GeneralSettings />;      case 'general':    switch (activeSection) {  const renderActiveSection = () => {  ];    { id: 'appearance', name: 'Appearance', icon: '🎨' }    { id: 'calls', name: 'Calls', icon: '📞' },    { id: 'notifications', name: 'Notifications', icon: '🔔' },    { id: 'security', name: 'Security', icon: '🛡️' },    { id: 'privacy', name: 'Privacy', icon: '🔒' },    { id: 'general', name: 'General', icon: '⚙️' },  const sections = [  const [isLoading, setIsLoading] = useState(false);  const [activeSection, setActiveSection] = useState('general');const Settings = () => {import './styles/settings.css';import AppearanceSettings from './components/AppearanceSettings';import CallSettings from './components/CallSettings';import NotificationSettings from './components/NotificationSettings';import SecuritySettings from './components/SecuritySettings';import PrivacySettings from './components/PrivacySettings';import GeneralSettings from './panels/GeneralSettings';
import PrivacySettings from './panels/PrivacySettings';
import SecuritySettings from './panels/SecuritySettings';
import NotificationsSettings from './panels/NotificationsSettings';
import CallsSettings from './panels/CallsSettings';
import AppearanceSettings from './panels/AppearanceSettings';
import { settingsService } from '../../services/settingsService';
import './styles/settings.css';

const SETTINGS_TABS = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'privacy', label: 'Privacy', icon: '🔒' },
  { id: 'security', label: 'Security', icon: '🛡️' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'calls', label: 'Calls', icon: '📞' },
  { id: 'appearance', label: 'Appearance', icon: '🎨' }
];

const Settings = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingStates, setSavingStates] = useState({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getSettings();
      setSettings(data);
      setError(null);
    } catch (err) {
      setError('Failed to load settings');
      console.error('Settings load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = async (category, key, value) => {
    const settingKey = `${category}.${key}`;
    
    // Optimistic UI update - cập nhật ngay lập tức
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value
      }
    }));
    
    // Set saving state
    setSavingStates(prev => ({ ...prev, [settingKey]: 'saving' }));

    // Save to server
    try {
      await settingsService.updateSetting(category, key, value);
      setSavingStates(prev => ({ ...prev, [settingKey]: 'saved' }));
      
      // Clear saved indicator after 2 seconds
      setTimeout(() => {
        setSavingStates(prev => {
          const newStates = { ...prev };
          delete newStates[settingKey];
          return newStates;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to save setting:', err);
      setSavingStates(prev => ({ ...prev, [settingKey]: 'error' }));
      
      // Revert on error
      await loadSettings();
      
      if (window.showToast) {
        window.showToast('Lỗi', 'Không thể lưu cài đặt');
      }
      
      // Clear error indicator after 3 seconds
      setTimeout(() => {
        setSavingStates(prev => {
          const newStates = { ...prev };
          delete newStates[settingKey];
          return newStates;
        });
      }, 3000);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Bạn có chắc muốn đặt lại tất cả cài đặt về mặc định?')) {
      try {
        setLoading(true);
        const defaultSettings = await settingsService.resetToDefaults();
        setSettings(defaultSettings);
        if (window.showToast) {
          window.showToast('Thành công', 'Đã đặt lại cài đặt mặc định');
        }
      } catch (err) {
        console.error('Failed to reset settings:', err);
        if (window.showToast) {
          window.showToast('Lỗi', 'Không thể đặt lại cài đặt');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleClose = () => {
    // Check if any settings are currently being saved
    const isSaving = Object.values(savingStates).some(state => state === 'saving');
    if (isSaving) {
      if (window.confirm('Một số cài đặt đang được lưu. Bạn có chắc muốn đóng?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const renderActivePanel = () => {
    if (loading) {
      return <div className="settings-loading">Đang tải cài đặt...</div>;
    }

    if (error) {
      return (
        <div className="settings-error">
          <p>{error}</p>
          <button onClick={loadSettings}>Thử lại</button>
        </div>
      );
    }

    if (!settings) return null;

    const commonProps = {
      settings: settings[activeTab] || {},
      onChange: (key, value) => handleSettingChange(activeTab, key, value),
      savingStates: savingStates
    };

    switch (activeTab) {
      case 'general':
        return <GeneralSettings {...commonProps} />;
      case 'privacy':
        return <PrivacySettings {...commonProps} />;
      case 'security':
        return <SecuritySettings {...commonProps} />;
      case 'notifications':
        return <NotificationsSettings {...commonProps} />;
      case 'calls':
        return <CallsSettings {...commonProps} />;
      case 'appearance':
        return <AppearanceSettings {...commonProps} />;
      default:
        return null;
    }
  };

  return (
    <div className="settings-modal">
      <div className="settings-overlay" onClick={handleClose}></div>
      <div className="settings-container">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={handleClose}>✕</button>
        </div>
        
        <div className="settings-content">
          <div className="settings-sidebar">
            <nav className="settings-nav">
              {SETTINGS_TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="settings-nav-icon">{tab.icon}</span>
                  <span className="settings-nav-label">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="settings-main">
            {renderActivePanel()}
          </div>
        </div>

        <div className="settings-footer">
          <div className="settings-footer-left">
            {Object.keys(savingStates).length > 0 && (
              <div className="settings-status-indicators">
                {Object.entries(savingStates).map(([key, state]) => (
                  <span key={key} className={`settings-status-badge status-${state}`}>
                    {state === 'saving' && '⏳ Đang lưu...'}
                    {state === 'saved' && '✓ Đã lưu'}
                    {state === 'error' && '✗ Lỗi'}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="settings-footer-actions">
            <button 
              className="settings-footer-btn btn-reset"
              onClick={handleReset}
              disabled={loading}
              title="Đặt lại tất cả về mặc định"
            >
              Đặt lại mặc định
            </button>
            <button 
              className="settings-footer-btn btn-close"
              onClick={handleClose}
              disabled={loading}
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
