// Example Usage of Settings Module in Different Scenarios

/**
 * SCENARIO 1: Basic Integration with React Router
 */

// App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Settings from './components/Settings/Settings';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav>
          <Link to="/">Home</Link>
          <Link to="/chat">Chat</Link>
          <Link to="/settings">Settings</Link>
        </nav>
        
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:section" element={<Settings />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

/**
 * SCENARIO 2: Settings as Modal/Dialog
 */

import React, { useState } from 'react';
import Settings from './components/Settings/Settings';

function ChatPage() {
  const [showSettings, setShowSettings] = useState(false);
  
  return (
    <div>
      <button onClick={() => setShowSettings(true)}>
        ⚙️ Open Settings
      </button>
      
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button 
              className="close-btn"
              onClick={() => setShowSettings(false)}
            >
              ✕
            </button>
            <Settings />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SCENARIO 3: Settings in Sidebar Panel
 */

function AppWithSidebar() {
  const [activePanel, setActivePanel] = useState('chat');
  
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <button onClick={() => setActivePanel('chat')}>Chat</button>
        <button onClick={() => setActivePanel('settings')}>Settings</button>
      </aside>
      
      <main className="main-panel">
        {activePanel === 'chat' && <ChatInterface />}
        {activePanel === 'settings' && <Settings />}
      </main>
    </div>
  );
}

/**
 * SCENARIO 4: Direct Link to Specific Setting
 */

import { Link } from 'react-router-dom';

function ProfileMenu() {
  return (
    <div className="menu">
      {/* Link directly to specific settings section */}
      <Link to="/settings/privacy">Privacy Settings</Link>
      <Link to="/settings/security">Security Settings</Link>
      <Link to="/settings/notifications">Notification Settings</Link>
      <Link to="/settings/appearance">Appearance Settings</Link>
    </div>
  );
}

/**
 * SCENARIO 5: Programmatic Navigation
 */

import { useNavigate } from 'react-router-dom';

function Header() {
  const navigate = useNavigate();
  
  const handleSettingsClick = (section) => {
    navigate(`/settings/${section}`);
  };
  
  return (
    <header>
      <button onClick={() => handleSettingsClick('general')}>
        Go to General Settings
      </button>
    </header>
  );
}

/**
 * SCENARIO 6: Using Settings Service Directly
 */

import { 
  getGeneralSettings, 
  updateGeneralSettings,
  getAppearanceSettings 
} from './components/Settings/services/settingsService';

async function applyUserPreferences() {
  try {
    // Load user's appearance settings
    const appearance = await getAppearanceSettings();
    
    // Apply theme
    if (appearance.theme === 'dark') {
      document.documentElement.classList.add('dark-theme');
    }
    
    // Apply other settings
    console.log('User preferences applied:', appearance);
  } catch (error) {
    console.error('Failed to load preferences:', error);
  }
}

/**
 * SCENARIO 7: Checking Settings Before Action
 */

import { getNotificationSettings } from './components/Settings/services/settingsService';

async function sendNotification(message) {
  // Check if notifications are enabled
  const settings = await getNotificationSettings();
  
  if (!settings.messageNotifications) {
    console.log('Notifications disabled by user');
    return;
  }
  
  // Send notification
  if (settings.messageSound) {
    playNotificationSound();
  }
  
  if (settings.messageVibrate && 'vibrate' in navigator) {
    navigator.vibrate(200);
  }
  
  showNotification(message);
}

/**
 * SCENARIO 8: Syncing Settings After Login
 */

import { offlineQueue } from './components/Settings/services/offlineQueue';

async function handleLogin(token) {
  // Save token
  localStorage.setItem('token', token);
  
  // Sync any offline changes
  await offlineQueue.syncQueue();
  
  // Load user settings
  await loadAllUserSettings();
  
  console.log('Login complete, settings synced');
}

async function loadAllUserSettings() {
  const [general, privacy, notifications, calls, appearance] = await Promise.all([
    getGeneralSettings(),
    getPrivacySettings(),
    getNotificationSettings(),
    getCallSettings(),
    getAppearanceSettings()
  ]);
  
  return { general, privacy, notifications, calls, appearance };
}

/**
 * SCENARIO 9: Settings Context for Global Access
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    general: null,
    appearance: null,
    notifications: null
  });
  
  useEffect(() => {
    loadSettings();
  }, []);
  
  const loadSettings = async () => {
    const [general, appearance, notifications] = await Promise.all([
      getGeneralSettings(),
      getAppearanceSettings(),
      getNotificationSettings()
    ]);
    
    setSettings({ general, appearance, notifications });
  };
  
  const refreshSettings = () => {
    loadSettings();
  };
  
  return (
    <SettingsContext.Provider value={{ settings, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);

// Usage in any component:
function MyComponent() {
  const { settings } = useSettings();
  
  return (
    <div>
      <p>Current theme: {settings.appearance?.theme}</p>
      <p>Language: {settings.general?.language}</p>
    </div>
  );
}

/**
 * SCENARIO 10: Settings Backup/Restore
 */

async function backupAllSettings() {
  const backup = {
    general: await getGeneralSettings(),
    privacy: await getPrivacySettings(),
    notifications: await getNotificationSettings(),
    calls: await getCallSettings(),
    appearance: await getAppearanceSettings(),
    timestamp: new Date().toISOString()
  };
  
  // Download as JSON
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `settings-backup-${Date.now()}.json`;
  a.click();
  
  console.log('Settings backed up');
}

async function restoreSettings(backupFile) {
  const text = await backupFile.text();
  const backup = JSON.parse(text);
  
  await Promise.all([
    updateGeneralSettings(backup.general),
    updatePrivacySettings(backup.privacy),
    updateNotificationSettings(backup.notifications),
    updateCallSettings(backup.calls),
    updateAppearanceSettings(backup.appearance)
  ]);
  
  console.log('Settings restored');
  window.location.reload();
}

/**
 * SCENARIO 11: Settings Migration
 */

async function migrateOldSettings() {
  // Check for old settings format
  const oldSettings = localStorage.getItem('old_user_settings');
  
  if (oldSettings) {
    const old = JSON.parse(oldSettings);
    
    // Convert to new format
    await updateGeneralSettings({
      language: old.lang || 'en',
      fontSize: old.textSize || 'medium'
    });
    
    await updateAppearanceSettings({
      theme: old.darkMode ? 'dark' : 'light'
    });
    
    // Remove old settings
    localStorage.removeItem('old_user_settings');
    
    console.log('Settings migrated to new format');
  }
}

/**
 * SCENARIO 12: Admin Panel - View User Settings
 */

async function viewUserSettings(userId, token) {
  const BASE_URL = 'http://localhost:3001';
  
  const response = await fetch(`${BASE_URL}/api/admin/users/${userId}/settings`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const settings = await response.json();
  console.log('User settings:', settings);
  
  return settings;
}

/**
 * SCENARIO 13: Bulk Settings Update
 */

async function applyRecommendedSettings() {
  const recommended = {
    general: {
      autoDownloadMedia: true,
      saveToGallery: false,
      fontSize: 'medium'
    },
    privacy: {
      lastSeen: 'contacts',
      readReceipts: true
    },
    notifications: {
      messageNotifications: true,
      messageSound: true,
      showPreview: false // Privacy-focused
    }
  };
  
  await Promise.all([
    updateGeneralSettings(recommended.general),
    updatePrivacySettings(recommended.privacy),
    updateNotificationSettings(recommended.notifications)
  ]);
  
  alert('Recommended settings applied!');
}

/**
 * SCENARIO 14: Settings Change Listener
 */

class SettingsListener {
  constructor() {
    this.listeners = new Map();
    this.startListening();
  }
  
  startListening() {
    // Listen for storage changes
    window.addEventListener('storage', (e) => {
      if (e.key?.startsWith('settings_')) {
        const category = e.key.replace('settings_', '');
        this.notifyListeners(category, JSON.parse(e.newValue));
      }
    });
  }
  
  subscribe(category, callback) {
    if (!this.listeners.has(category)) {
      this.listeners.set(category, []);
    }
    this.listeners.get(category).push(callback);
  }
  
  notifyListeners(category, newSettings) {
    const callbacks = this.listeners.get(category) || [];
    callbacks.forEach(cb => cb(newSettings));
  }
}

// Usage:
const listener = new SettingsListener();
listener.subscribe('appearance', (settings) => {
  console.log('Appearance changed:', settings);
  applyTheme(settings.theme);
});

/**
 * SCENARIO 15: Testing Settings Service
 */

// Jest test example
import { getGeneralSettings, updateGeneralSettings } from './settingsService';

describe('Settings Service', () => {
  test('should fetch general settings', async () => {
    const settings = await getGeneralSettings();
    expect(settings).toHaveProperty('language');
    expect(settings).toHaveProperty('fontSize');
  });
  
  test('should update general settings', async () => {
    const updated = await updateGeneralSettings({ language: 'vi' });
    expect(updated.language).toBe('vi');
  });
  
  test('should cache settings in localStorage', async () => {
    await getGeneralSettings();
    const cached = localStorage.getItem('settings_general');
    expect(cached).toBeTruthy();
  });
});

/**
 * THESE EXAMPLES SHOW:
 * - Multiple integration approaches
 * - Service usage patterns
 * - Context/state management
 * - Backup/restore functionality
 * - Migration strategies
 * - Testing examples
 * 
 * Choose the pattern that fits your architecture best!
 */
