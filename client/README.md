# ChatViet - Frontend ReactJS

Frontend ứng dụng web chat "ChatViet", kết nối với Flask backend thông qua HTTP API + WebSocket (Socket.IO).

## 🚀 Tính năng

✅ Đăng nhập / Đăng ký  
✅ Chat real-time qua WebSocket  
✅ Danh sách bạn bè  
✅ Gửi tin nhắn + Lưu vào database  
✅ Quên mật khẩu + OTP  
✅ Typing indicator  
✅ Responsive design (Mobile + Desktop)

---

## 📦 Cài đặt

### 1. Cài đặt Node.js packages

```bash
cd client
npm install
```

### 2. Cấu hình environment

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:

```env
REACT_APP_API_URL=http://localhost:8000
REACT_APP_SOCKET_URL=http://localhost:8000
```

Hoặc nếu dùng ngrok:

```env
REACT_APP_API_URL=https://xxxx.ngrok.io
REACT_APP_SOCKET_URL=https://xxxx.ngrok.io
```

---

## 🏃 Chạy ứng dụng

```bash
npm start
```

Ứng dụng sẽ tự động mở trên `http://localhost:3000`

---

## 📂 Cấu trúc thư mục

```
client/
├── public/
│   ├── index.html
│   └── assets/css/
│       ├── main.css
│       ├── auth.css
│       ├── chat.css
│       └── animations.css
├── src/
│   ├── components/
│   │   ├── Auth/
│   │   │   ├── LoginForm.js
│   │   │   ├── RegisterForm.js
│   │   │   ├── ForgotPassword.js
│   │   │   └── LogoutButton.js
│   │   └── Chat/
│   │       ├── ChatBox.js
│   │       ├── MessageBubble.js
│   │       ├── TypingIndicator.js
│   │       └── FileUploader.js
│   ├── services/
│   │   ├── api.js       # HTTP API calls
│   │   └── socket.js    # WebSocket (Socket.IO)
│   ├── App.js           # Root component + Router
│   └── index.js         # Entry point
├── package.json
└── .env
```

---

## 🔗 API Integration

### Backend URL
- **Local:** `http://localhost:8000`
- **Ngrok (Public):** `https://xxxx.ngrok.io`

### Endpoints sử dụng:
- `POST /register` - Đăng ký
- `POST /login` - Đăng nhập
- `GET /users` - Lấy danh sách users
- `GET /messages` - Lấy tin nhắn
- `POST /forgot-password` - Yêu cầu OTP
- `POST /forgot-password/reset` - Reset mật khẩu

### WebSocket Events:
- `connect` - Kết nối server
- `join` - Tham gia room chat
- `send_message` - Gửi tin nhắn
- `receive_message` - Nhận tin nhắn

---

## 🎨 Tính năng UI

### Login Page (`/login`)
- Form đăng nhập
- Lưu JWT token vào localStorage
- Liên kết "Quên mật khẩu" & "Đăng ký"

### Register Page (`/register`)
- Form đăng ký
- Validate password
- Thông báo thành công

### Chat Page (`/chat`)
- Sidebar: Danh sách bạn bè
- Main: Khung chat với message bubbles
- Typing indicator khi đang gõ
- Form gửi tin nhắn real-time

### Forgot Password (`/forgot-password`)
- Step 1: Nhập username → nhận OTP
- Step 2: Nhập OTP + mật khẩu mới → reset

---

## 🔐 Authentication

Token JWT được lưu trong `localStorage`:

```javascript
localStorage.setItem('token', response.data.token);
localStorage.setItem('username', username);
```

Mỗi API request tự động thêm header:

```
Authorization: Bearer <token>
```

---

## 📱 Responsive Design

- Desktop: 2-column layout (Sidebar + Chat)
- Tablet: Sidebar nhỏ hơn
- Mobile: Sidebar ở trên, Chat ở dưới (hoặc toggle)

---

## 🛠️ Development

### Build production

```bash
npm run build
```

### Run tests (nếu có)

```bash
npm test
```

---

## 📝 Dependencies

- **react** - UI library
- **react-router-dom** - Routing
- **axios** - HTTP client
- **socket.io-client** - WebSocket client
- **react-icons** - Icon library

---

## ⚠️ Lưu ý

1. **Backend phải chạy trên port 8000** hoặc cấu hình REACT_APP_API_URL
2. **CORS phải bật** trên backend (Flask)
3. **Socket.IO phải cấu hình** cho phép CORS
4. **OTP sẽ in ra terminal server** khi test (vì Redis không chạy)

---

## 🚧 Tính năng chưa hoàn tất

- [ ] Upload file/hình ảnh
- [ ] Video call
- [ ] Emoji picker
- [ ] Message search
- [ ] User status real-time
- [ ] Group chat

---

## 👨‍💻 Author

Sinh viên Năm 3 - Hệ CNTT

---

## 📧 Support

Liên hệ backend developer nếu có issue với API.
