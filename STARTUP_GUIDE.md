# 🚀 Vietnam Chat - Quick Start Guide

## Chạy Toàn Bộ Ứng Dụng (Backend + Frontend + Ngrok)

### **Option 1: Chạy Tất Cả Cùng Lúc (Recommended)**
```bash
bash start_all.sh
```
✅ Tự động khởi động backend, frontend, và ngrok tunnel  
✅ Chỉ cần 1 lệnh duy nhất  
✅ Cleanup tự động các process cũ  

---

### **Option 2: Chạy Từng Dịch Vụ Riêng (3 lệnh trong 3 terminal khác nhau)**

**Terminal 1 - Backend (Flask + Ngrok):**
```bash
export ENABLE_NGROK=true
bash run_backend.sh
```
📌 Backend chạy trên `http://localhost:5000`  
🌐 Public URL (via ngrok): `https://unmodelled-higher-jeanette.ngrok-free.dev`

**Terminal 2 - Frontend (React Dev Server):**
```bash
bash run_frontend.sh
```
📌 Frontend chạy trên `http://localhost:3000`

---

## 🌐 Truy Cập Ứng Dụng

### Local (Same Machine)
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000

### Remote (Friends/Others via Ngrok)
- **Public URL**: https://unmodelled-higher-jeanette.ngrok-free.dev
- Frontend + Backend API tất cả đều ở URL này

---

## 🔧 Troubleshooting

### ❌ Lỗi "Lỗi kết nối server"
**Nguyên nhân:**
- Backend chưa chạy hoặc bị crash
- Socket.IO không kết nối được

**Giải pháp:**
1. Đảm bảo backend đang chạy: `lsof -i :5000`
2. Check logs backend để tìm lỗi
3. Try restart: `bash start_all.sh`

### ❌ Ngrok URL không hoạt động
**Nguyên nhân:**
- Ngrok tunnel bị timeout (free plan có thời hạn)
- Multiple endpoint conflict

**Giải pháp:**
1. Restart backend: `export ENABLE_NGROK=true; bash run_backend.sh`
2. Xem lại public URL mới trong logs

### ❌ Port 5000/3000 đang bị dùng
**Giải pháp:**
```bash
lsof -ti:5000 | xargs kill -9  # Kill process on port 5000
lsof -ti:3000 | xargs kill -9  # Kill process on port 3000
```
Hoặc `start_all.sh` sẽ tự động cleanup.

---

## 📝 Environment Variables

### Backend
- `ENABLE_NGROK=true` - Kích hoạt ngrok tunnel
- `BACKEND_PORT=5000` - Port backend (default)
- `NGROK_AUTH_TOKEN=xxx` - (Optional) Ngrok auth token để có stable URL

### Frontend  
- `REACT_APP_API_URL` - (Optional) Custom API base URL
- `REACT_APP_SOCKET_URL` - (Optional) Custom socket URL

---

## 📚 Dự Án Structure

```
Vietnam Chat/
├── server/              # Flask backend
│   ├── app.py
│   ├── routes/
│   ├── models/
│   └── services/
├── client/              # React frontend
│   ├── src/
│   ├── package.json
│   └── build/           (build output)
├── run_backend.sh       # Start backend script
├── run_frontend.sh      # Start frontend script
└── start_all.sh         # Start all services at once
```

---

## 💡 Tips

1. **Để share app với bạn**: Copy ngrok URL từ logs backend
2. **Stable ngrok URL**: Setup ngrok account + set `NGROK_AUTH_TOKEN`
3. **Production Build**: 
   ```bash
   cd client && npm run build && cd ..
   ```
   Sau đó backend sẽ serve build tĩnh (faster than dev server)

---

**Made with ❤️ for Vietnam Chat**
