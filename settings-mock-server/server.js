const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (simulating database)
const storage = {
  general: {
    language: 'en',
    autoDownloadMedia: true,
    saveToGallery: false,
    fontSize: 'medium'
  },
  privacy: {
    lastSeen: 'everyone',
    profilePhoto: 'everyone',
    about: 'everyone',
    readReceipts: true,
    groupsAddMe: 'everyone',
    blockedContacts: []
  },
  notifications: {
    messageNotifications: true,
    messageSound: true,
    messageVibrate: true,
    groupNotifications: true,
    groupSound: true,
    callNotifications: true,
    callRingtone: 'default',
    showPreview: true,
    notificationLight: true
  },
  calls: {
    videoEnabled: true,
    audioEnabled: true,
    lowDataMode: false,
    callWaiting: true,
    speakerphone: false,
    videoQuality: 'auto',
    microphoneDevice: 'default',
    cameraDevice: 'default',
    speakerDevice: 'default'
  },
  appearance: {
    theme: 'auto',
    chatWallpaper: 'default',
    bubbleStyle: 'rounded',
    showAvatars: true,
    compactMode: false,
    animationsEnabled: true,
    emojiSize: 'medium'
  },
  security: {
    twoFactorEnabled: false,
    sessions: [
      {
        id: '1',
        device: 'Chrome on Windows',
        location: 'Hanoi, Vietnam',
        lastActive: 'Now',
        current: true
      },
      {
        id: '2',
        device: 'Mobile App',
        location: 'Ho Chi Minh City, Vietnam',
        lastActive: '2 hours ago',
        current: false
      }
    ]
  }
};

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ===== GENERAL SETTINGS =====
app.get('/api/settings/general', (req, res) => {
  res.json({ success: true, data: storage.general });
});

app.put('/api/settings/general', (req, res) => {
  storage.general = { ...storage.general, ...req.body };
  console.log('Updated general settings:', storage.general);
  res.json({ success: true, data: storage.general });
});

// ===== PRIVACY SETTINGS =====
app.get('/api/settings/privacy', (req, res) => {
  res.json({ success: true, data: storage.privacy });
});

app.put('/api/settings/privacy', (req, res) => {
  storage.privacy = { ...storage.privacy, ...req.body };
  console.log('Updated privacy settings:', storage.privacy);
  res.json({ success: true, data: storage.privacy });
});

// ===== NOTIFICATION SETTINGS =====
app.get('/api/settings/notifications', (req, res) => {
  res.json({ success: true, data: storage.notifications });
});

app.put('/api/settings/notifications', (req, res) => {
  storage.notifications = { ...storage.notifications, ...req.body };
  console.log('Updated notification settings:', storage.notifications);
  res.json({ success: true, data: storage.notifications });
});

// ===== CALL SETTINGS =====
app.get('/api/settings/calls', (req, res) => {
  res.json({ success: true, data: storage.calls });
});

app.put('/api/settings/calls', (req, res) => {
  storage.calls = { ...storage.calls, ...req.body };
  console.log('Updated call settings:', storage.calls);
  res.json({ success: true, data: storage.calls });
});

// ===== APPEARANCE SETTINGS =====
app.get('/api/settings/appearance', (req, res) => {
  res.json({ success: true, data: storage.appearance });
});

app.put('/api/settings/appearance', (req, res) => {
  storage.appearance = { ...storage.appearance, ...req.body };
  console.log('Updated appearance settings:', storage.appearance);
  res.json({ success: true, data: storage.appearance });
});

// ===== SECURITY SETTINGS =====
app.post('/api/security/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  // Mock validation
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      message: 'Current and new password are required' 
    });
  }
  
  if (newPassword.length < 8) {
    return res.status(400).json({ 
      success: false, 
      message: 'Password must be at least 8 characters' 
    });
  }
  
  console.log('Password changed successfully (mock)');
  res.json({ success: true, message: 'Password changed successfully' });
});

app.post('/api/security/2fa/enable', (req, res) => {
  storage.security.twoFactorEnabled = true;
  console.log('2FA enabled');
  res.json({ success: true, data: { twoFactorEnabled: true } });
});

app.post('/api/security/2fa/disable', (req, res) => {
  storage.security.twoFactorEnabled = false;
  console.log('2FA disabled');
  res.json({ success: true, data: { twoFactorEnabled: false } });
});

app.get('/api/security/sessions', (req, res) => {
  res.json({ 
    success: true, 
    data: {
      sessions: storage.security.sessions,
      twoFactorEnabled: storage.security.twoFactorEnabled
    }
  });
});

app.delete('/api/security/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  storage.security.sessions = storage.security.sessions.filter(
    s => s.id !== sessionId
  );
  console.log('Session logged out:', sessionId);
  res.json({ success: true, message: 'Session logged out' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Settings Mock Server is running!');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
  console.log('Available endpoints:');
  console.log('  GET/PUT  /api/settings/general');
  console.log('  GET/PUT  /api/settings/privacy');
  console.log('  GET/PUT  /api/settings/notifications');
  console.log('  GET/PUT  /api/settings/calls');
  console.log('  GET/PUT  /api/settings/appearance');
  console.log('  POST     /api/security/change-password');
  console.log('  POST     /api/security/2fa/enable');
  console.log('  POST     /api/security/2fa/disable');
  console.log('  GET      /api/security/sessions');
  console.log('='.repeat(60));
  console.log('⚠️  This is a MOCK server for development only!');
  console.log('⚠️  Do NOT use in production!');
  console.log('='.repeat(60));
});
