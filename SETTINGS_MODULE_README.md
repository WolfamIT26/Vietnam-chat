# 📱 Settings Module - Complete Implementation

**Module cài đặt đầy đủ cho ứng dụng chat với 6 nhóm chức năng**

## ⚠️ QUAN TRỌNG - ĐỌC TRƯỚC

✅ **Module này KHÔNG chỉnh sửa server hiện tại**  
✅ **KHÔNG yêu cầu restart backend**  
✅ **Hoạt động độc lập với mock server riêng**  
✅ **Hỗ trợ offline với auto-sync**  

---

## 🎯 Tính Năng

### 6 Nhóm Settings
1. **General** - Ngôn ngữ, tự động tải media, cỡ chữ
2. **Privacy** - Quyền riêng tư, ai xem profile, read receipts
3. **Security** - Đổi mật khẩu, 2FA, quản lý sessions
4. **Notifications** - Thông báo tin nhắn, nhóm, cuộc gọi
5. **Calls** - Cài đặt video/audio call, chọn thiết bị
6. **Appearance** - Theme (light/dark/auto), wallpaper, bubble style

### Đặc Điểm Kỹ Thuật
- ✨ **Optimistic UI** - Cập nhật UI ngay lập tức, rollback khi lỗi
- 💾 **Offline Support** - Queue changes và sync khi online
- 🎨 **Responsive Design** - Hoạt động trên mobile và desktop
- 🌓 **Dark Mode** - Tự động theo system hoặc chọn manual
- 🔄 **Auto-sync** - Tự động đồng bộ khi có kết nối
- 📱 **Mobile-first** - Tối ưu cho trải nghiệm mobile

---

## 📁 Cấu Trúc File

```
client/src/components/Settings/
├── Settings.js                           # Main component với navigation
├── components/
│   ├── GeneralSettings.js               # General settings
│   ├── PrivacySettings.js               # Privacy settings
│   ├── SecuritySettings.js              # Security settings
│   ├── NotificationSettings.js          # Notification settings
│   ├── CallSettings.js                  # Call settings
│   ├── AppearanceSettings.js            # Appearance settings
│   └── common/
│       ├── SettingToggle.js             # Toggle switch component
│       └── SettingSelect.js             # Select dropdown component
├── services/
│   ├── settingsService.js               # API service với optimistic updates
│   └── offlineQueue.js                  # Offline queue manager
└── styles/
    └── settings.css                     # Complete responsive CSS

settings-mock-server/
├── server.js                            # Express mock server (port 3001)
├── package.json                         # Dependencies
└── README.md                            # Mock server documentation
```

---

## 🚀 Hướng Dẫn Cài Đặt (3 Bước)

### Bước 1: Setup Mock Server (Development)

```bash
# 1. Vào thư mục mock server
cd settings-mock-server

# 2. Cài dependencies
npm install

# 3. Khởi chạy mock server (port 3001)
npm start
```

**Mock server sẽ chạy tại:** `http://localhost:3001`

### Bước 2: Cấu Hình Frontend

Thêm vào file `client/.env`:

```env
# Sử dụng mock server (development)
REACT_APP_USE_MOCK_SERVER=true
REACT_APP_MOCK_SERVER_URL=http://localhost:3001

# Hoặc sử dụng production backend (khi đã có endpoints)
# REACT_APP_USE_MOCK_SERVER=false
# REACT_APP_API_URL=http://localhost:5000
```

### Bước 3: Tích Hợp Vào App

**Option 1: React Router (Khuyến Nghị)**

Thêm vào `client/src/App.js`:

```javascript
import Settings from './components/Settings/Settings';

// Trong routes
<Route path="/settings" element={<Settings />} />
```

**Option 2: Standalone Component**

```javascript
import Settings from './components/Settings/Settings';

// Render trực tiếp
<Settings />
```

**Option 3: Modal/Dialog**

```javascript
import Settings from './components/Settings/Settings';

// Trong modal
{showSettings && (
  <div className="modal">
    <Settings />
  </div>
)}
```

---

## 🔧 Sử Dụng

### 1. Khởi động Mock Server

```bash
cd settings-mock-server
npm start
```

Bạn sẽ thấy:
```
🚀 Settings Mock Server is running!
📡 Server: http://localhost:3001
🏥 Health: http://localhost:3001/health
```

### 2. Khởi động Client

```bash
cd client
npm start
```

### 3. Truy cập Settings

- Navigate to `/settings` route
- Hoặc render `<Settings />` component

---

## 🧪 Testing

### Test Mock Server

```bash
# Health check
curl http://localhost:3001/health

# Get settings
curl http://localhost:3001/api/settings/general

# Update settings
curl -X PUT http://localhost:3001/api/settings/general \
  -H "Content-Type: application/json" \
  -d '{"language": "vi", "fontSize": "large"}'
```

### Test Offline Mode

1. Mở DevTools → Network tab
2. Set "Offline" mode
3. Thay đổi settings → Thấy "Offline - changes will sync when online"
4. Set "Online" mode → Changes tự động sync

### Test Optimistic UI

1. Thay đổi một setting
2. UI cập nhật ngay lập tức
3. Nếu API lỗi → UI rollback về giá trị cũ

---

## 📊 API Endpoints

### General Settings
- `GET /api/settings/general`
- `PUT /api/settings/general`

### Privacy Settings
- `GET /api/settings/privacy`
- `PUT /api/settings/privacy`

### Notification Settings
- `GET /api/settings/notifications`
- `PUT /api/settings/notifications`

### Call Settings
- `GET /api/settings/calls`
- `PUT /api/settings/calls`

### Appearance Settings
- `GET /api/settings/appearance`
- `PUT /api/settings/appearance`

### Security
- `POST /api/security/change-password`
- `POST /api/security/2fa/enable`
- `POST /api/security/2fa/disable`
- `GET /api/security/sessions`

---

## 🔄 Chuyển Sang Production Backend

Khi backend đã có endpoints thật:

### 1. Tắt Mock Server Mode

File `client/.env`:
```env
REACT_APP_USE_MOCK_SERVER=false
REACT_APP_API_URL=http://localhost:5000
```

### 2. Implement Backend Endpoints

Tham khảo format response từ mock server:

```python
# Example: General settings endpoint
@app.route('/api/settings/general', methods=['GET'])
def get_general_settings():
    user_id = get_current_user_id()
    settings = get_user_settings(user_id, 'general')
    return jsonify({'success': True, 'data': settings})

@app.route('/api/settings/general', methods=['PUT'])
def update_general_settings():
    user_id = get_current_user_id()
    data = request.get_json()
    settings = update_user_settings(user_id, 'general', data)
    return jsonify({'success': True, 'data': settings})
```

### 3. Database Schema (Suggestion)

```sql
CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    category VARCHAR(50) NOT NULL,
    settings JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_user_settings ON user_settings(user_id, category);
```

---

## 🎨 Customization

### Thay đổi Theme Colors

File `client/src/components/Settings/styles/settings.css`:

```css
:root {
  --primary-color: #2196f3;  /* Đổi màu chủ đạo */
  --bg-primary: #f5f5f5;
  /* ... các biến khác */
}
```

### Thêm Setting Mới

1. Thêm vào state trong component
2. Thêm UI element (toggle/select)
3. Thêm vào `settingsService.js`
4. Thêm endpoint vào mock server

Example:
```javascript
// Component
<SettingToggle
  label="New Feature"
  description="Description here"
  checked={settings.newFeature}
  onChange={() => handleToggle('newFeature')}
/>
```

### Custom Validation

File `settingsService.js`:

```javascript
export const updateGeneralSettings = async (settings) => {
  // Custom validation
  if (settings.fontSize && !['small', 'medium', 'large'].includes(settings.fontSize)) {
    throw new Error('Invalid font size');
  }
  
  // Continue with API call...
};
```

---

## 💾 Offline Storage

### How It Works

1. **Normal Mode**: Changes → API → LocalStorage cache
2. **Offline Mode**: Changes → LocalStorage + Queue
3. **Back Online**: Auto-sync queued changes

### Clear Offline Data

```javascript
// Clear all cached settings
localStorage.removeItem('settings_general');
localStorage.removeItem('settings_privacy');
localStorage.removeItem('settings_notifications');
localStorage.removeItem('settings_calls');
localStorage.removeItem('settings_appearance');
localStorage.removeItem('settings_offline_queue');
```

### Force Sync

```javascript
import { offlineQueue } from './components/Settings/services/offlineQueue';

// Manually trigger sync
offlineQueue.syncQueue();

// Clear queue
offlineQueue.clear();
```

---

## 🐛 Troubleshooting

### Mock Server không chạy

```bash
# Kiểm tra port 3001 có bị chiếm
netstat -ano | findstr :3001  # Windows
lsof -i :3001                 # Mac/Linux

# Thay đổi port trong settings-mock-server/server.js
const PORT = process.env.PORT || 3002;  # Đổi port
```

### Settings không load

1. Kiểm tra console: F12 → Console tab
2. Kiểm tra Network: có lỗi API không?
3. Kiểm tra `.env`: `REACT_APP_USE_MOCK_SERVER=true`
4. Restart client: `Ctrl+C` → `npm start`

### CSS không hiển thị đúng

Thêm import vào `client/src/App.js`:
```javascript
import './components/Settings/styles/settings.css';
```

### Offline sync không hoạt động

Kiểm tra localStorage:
```javascript
// DevTools Console
localStorage.getItem('settings_offline_queue');
```

---

## 📝 Notes

### Development
- Mock server chạy port 3001
- Không cần restart backend
- Có thể test độc lập

### Security
- Mock server: **DEVELOPMENT ONLY**
- Production: Implement authentication
- Validate data server-side
- Sanitize user inputs

### Performance
- Settings cached in localStorage
- Optimistic updates → Fast UX
- Lazy load components nếu cần

---

## 🎓 Architecture Decisions

### Why Optimistic UI?
- Instant feedback cho user
- Better UX trên slow network
- Rollback khi lỗi

### Why Mock Server?
- Không can thiệp backend
- Test độc lập
- Develop song song với backend

### Why localStorage Cache?
- Offline support
- Fast initial load
- Reduce API calls

---

## 📞 Support

Nếu gặp vấn đề:
1. Check console errors
2. Verify mock server running
3. Check `.env` configuration
4. Review API response format

---

## ✅ Checklist Tích Hợp

- [ ] Copy thư mục `client/src/components/Settings/` vào project
- [ ] Copy thư mục `settings-mock-server/` vào project root
- [ ] Cài dependencies: `cd settings-mock-server && npm install`
- [ ] Tạo file `client/.env` với config
- [ ] Khởi chạy mock server: `npm start` trong thư mục mock-server
- [ ] Import Settings component vào App
- [ ] Test trên browser: `/settings` route
- [ ] Test offline mode
- [ ] Test optimistic updates

---

## 🎉 Done!

Bây giờ bạn có module Settings hoàn chỉnh với:
- ✅ 6 nhóm settings đầy đủ
- ✅ Optimistic UI
- ✅ Offline support
- ✅ Mock server độc lập
- ✅ Responsive design
- ✅ Dark mode
- ✅ Không động server production

**Enjoy coding! 🚀**
