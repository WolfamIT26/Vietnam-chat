# Settings Mock Server

🚀 **Mock API server for Settings module - Development ONLY**

## ⚠️ Important Notes

- **DO NOT use in production**
- This server is for development and testing only
- It runs on port 3001 (separate from your main backend)
- Data is stored in memory and resets on restart

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd settings-mock-server
npm install
```

### 2. Start the Server
```bash
npm start
```

Or with auto-reload:
```bash
npm run dev
```

### 3. Configure Frontend
In your client `.env` file, add:
```
REACT_APP_USE_MOCK_SERVER=true
REACT_APP_MOCK_SERVER_URL=http://localhost:3001
```

## 📡 Available Endpoints

### General Settings
- `GET /api/settings/general` - Get general settings
- `PUT /api/settings/general` - Update general settings

### Privacy Settings
- `GET /api/settings/privacy` - Get privacy settings
- `PUT /api/settings/privacy` - Update privacy settings

### Notification Settings
- `GET /api/settings/notifications` - Get notification settings
- `PUT /api/settings/notifications` - Update notification settings

### Call Settings
- `GET /api/settings/calls` - Get call settings
- `PUT /api/settings/calls` - Update call settings

### Appearance Settings
- `GET /api/settings/appearance` - Get appearance settings
- `PUT /api/settings/appearance` - Update appearance settings

### Security
- `POST /api/security/change-password` - Change password
- `POST /api/security/2fa/enable` - Enable 2FA
- `POST /api/security/2fa/disable` - Disable 2FA
- `GET /api/security/sessions` - Get active sessions
- `DELETE /api/security/sessions/:sessionId` - Logout session

### Health Check
- `GET /health` - Server health status

## 🧪 Testing with cURL

```bash
# Get general settings
curl http://localhost:3001/api/settings/general

# Update general settings
curl -X PUT http://localhost:3001/api/settings/general \
  -H "Content-Type: application/json" \
  -d '{"language": "vi", "fontSize": "large"}'

# Change password
curl -X POST http://localhost:3001/api/security/change-password \
  -H "Content-Type: application/json" \
  -d '{"currentPassword": "old123", "newPassword": "new12345"}'
```

## 📊 Default Data

The server starts with pre-configured default settings:
- Language: English
- Theme: Auto
- Notifications: All enabled
- 2FA: Disabled
- 2 mock sessions

## 🔧 Customization

Edit `server.js` to:
- Add new endpoints
- Modify default data
- Change validation logic
- Add authentication (for testing)

## 🛑 Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

## 📝 Notes

- Data persists only while server is running
- CORS is enabled for all origins (dev only!)
- No real authentication - all requests accepted
- Logs all requests to console
