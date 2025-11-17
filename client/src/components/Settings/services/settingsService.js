// Settings Service - API client with optimistic updates and offline queue
import { offlineQueue } from './offlineQueue';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const MOCK_SERVER_URL = process.env.REACT_APP_MOCK_SERVER_URL || 'http://localhost:3001';

// Determine if we should use mock server (for development without backend changes)
const USE_MOCK_SERVER = process.env.REACT_APP_USE_MOCK_SERVER === 'true';
const BASE_URL = USE_MOCK_SERVER ? MOCK_SERVER_URL : API_BASE_URL;

// Helper function to make API calls with error handling
const apiCall = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    // If offline, queue the request
    if (!navigator.onLine && options.method !== 'GET') {
      offlineQueue.add(endpoint, options);
      throw new Error('Offline - changes will sync when online');
    }
    throw error;
  }
};

// ===== GENERAL SETTINGS =====
export const getGeneralSettings = async () => {
  try {
    const response = await apiCall('/api/settings/general');
    return response.data || response;
  } catch (error) {
    console.error('Error fetching general settings:', error);
    // Return cached settings if available
    const cached = localStorage.getItem('settings_general');
    if (cached) return JSON.parse(cached);
    // Return defaults
    return {
      language: 'en',
      autoDownloadMedia: true,
      saveToGallery: false,
      fontSize: 'medium'
    };
  }
};

export const updateGeneralSettings = async (settings) => {
  // Cache optimistically
  const current = await getGeneralSettings();
  localStorage.setItem('settings_general', JSON.stringify({ ...current, ...settings }));
  
  const response = await apiCall('/api/settings/general', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return response.data || response;
};

// ===== PRIVACY SETTINGS =====
export const getPrivacySettings = async () => {
  try {
    const response = await apiCall('/api/settings/privacy');
    return response.data || response;
  } catch (error) {
    console.error('Error fetching privacy settings:', error);
    const cached = localStorage.getItem('settings_privacy');
    if (cached) return JSON.parse(cached);
    return {
      lastSeen: 'everyone',
      profilePhoto: 'everyone',
      about: 'everyone',
      readReceipts: true,
      groupsAddMe: 'everyone',
      blockedContacts: []
    };
  }
};

export const updatePrivacySettings = async (settings) => {
  const current = await getPrivacySettings();
  localStorage.setItem('settings_privacy', JSON.stringify({ ...current, ...settings }));
  
  const response = await apiCall('/api/settings/privacy', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return response.data || response;
};

// ===== SECURITY SETTINGS =====
export const changePassword = async ({ currentPassword, newPassword }) => {
  const response = await apiCall('/api/security/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return response.data || response;
};

export const enable2FA = async () => {
  const response = await apiCall('/api/security/2fa/enable', {
    method: 'POST',
  });
  return response.data || response;
};

export const disable2FA = async () => {
  const response = await apiCall('/api/security/2fa/disable', {
    method: 'POST',
  });
  return response.data || response;
};

export const getSessions = async () => {
  try {
    const response = await apiCall('/api/security/sessions');
    return response.data || response;
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return {
      sessions: [
        {
          id: '1',
          device: 'Current Device',
          location: 'Unknown',
          lastActive: 'Now',
          current: true
        }
      ],
      twoFactorEnabled: false
    };
  }
};

// ===== NOTIFICATION SETTINGS =====
export const getNotificationSettings = async () => {
  try {
    const response = await apiCall('/api/settings/notifications');
    return response.data || response;
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    const cached = localStorage.getItem('settings_notifications');
    if (cached) return JSON.parse(cached);
    return {
      messageNotifications: true,
      messageSound: true,
      messageVibrate: true,
      groupNotifications: true,
      groupSound: true,
      callNotifications: true,
      callRingtone: 'default',
      showPreview: true,
      notificationLight: true
    };
  }
};

export const updateNotificationSettings = async (settings) => {
  const current = await getNotificationSettings();
  localStorage.setItem('settings_notifications', JSON.stringify({ ...current, ...settings }));
  
  const response = await apiCall('/api/settings/notifications', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return response.data || response;
};

// ===== CALL SETTINGS =====
export const getCallSettings = async () => {
  try {
    const response = await apiCall('/api/settings/calls');
    return response.data || response;
  } catch (error) {
    console.error('Error fetching call settings:', error);
    const cached = localStorage.getItem('settings_calls');
    if (cached) return JSON.parse(cached);
    return {
      videoEnabled: true,
      audioEnabled: true,
      lowDataMode: false,
      callWaiting: true,
      speakerphone: false,
      videoQuality: 'auto',
      microphoneDevice: 'default',
      cameraDevice: 'default',
      speakerDevice: 'default'
    };
  }
};

export const updateCallSettings = async (settings) => {
  const current = await getCallSettings();
  localStorage.setItem('settings_calls', JSON.stringify({ ...current, ...settings }));
  
  const response = await apiCall('/api/settings/calls', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return response.data || response;
};

// ===== APPEARANCE SETTINGS =====
export const getAppearanceSettings = async () => {
  try {
    const response = await apiCall('/api/settings/appearance');
    return response.data || response;
  } catch (error) {
    console.error('Error fetching appearance settings:', error);
    const cached = localStorage.getItem('settings_appearance');
    if (cached) return JSON.parse(cached);
    return {
      theme: 'auto',
      chatWallpaper: 'default',
      bubbleStyle: 'rounded',
      showAvatars: true,
      compactMode: false,
      animationsEnabled: true,
      emojiSize: 'medium'
    };
  }
};

export const updateAppearanceSettings = async (settings) => {
  const current = await getAppearanceSettings();
  localStorage.setItem('settings_appearance', JSON.stringify({ ...current, ...settings }));
  
  const response = await apiCall('/api/settings/appearance', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return response.data || response;
};
