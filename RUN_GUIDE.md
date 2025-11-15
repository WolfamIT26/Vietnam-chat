# 🎯 Vietnam Chat - 3 Cách Chạy (Chọn 1 trong 3)

## **🏆 CÁCH 1: EASIEST - Chạy Tất Cả Cùng Lúc (1 LỆNH)**
```bash
bash start_all.sh
```
✅ Tự động start backend + frontend + ngrok  
✅ Chỉ 1 lệnh duy nhất  
✅ Tự động cleanup process cũ  
✅ **RECOMMENDED** 👌

---

## **CÁCH 2: Chạy 2 Lệnh (2 Terminal)**

### Terminal 1 - Backend (chạy trong background hoặc terminal riêng):
```bash
export ENABLE_NGROK=true && bash run_backend.sh
```

### Terminal 2 - Frontend:
```bash
bash run_frontend.sh
```

---

## **CÁCH 3: Chạy 3 Lệnh Riêng (3 Terminal Khác Nhau)**

### Terminal 1 - Backend + Ngrok:
```bash
export ENABLE_NGROK=true
bash run_backend.sh
```
📌 Logs sẽ show: `🌐 [NGROK] PUBLIC URL - SHARE THIS WITH FRIENDS:`

### Terminal 2 - Frontend:
```bash
bash run_frontend.sh
```
📌 Logs sẽ show: `Compiled successfully! ... Local: http://localhost:3000`

### Terminal 3 - Ngrok Tunnel (Optional - nếu muốn extra tunnel):
```bash
ngrok http 3000
```
📌 Serve React dev server qua ngrok (không cần nếu backend đã có ngrok)

---

## 🌐 **URLs sau khi chạy**

| Dịch Vụ | Local | Public (Ngrok) |
|---------|-------|---|
| **Frontend** | http://localhost:3000 | https://unmodelled-higher-jeanette.ngrok-free.dev |
| **Backend API** | http://localhost:5000 | https://unmodelled-higher-jeanette.ngrok-free.dev |
| **Socket.IO** | http://localhost:5000 | https://unmodelled-higher-jeanette.ngrok-free.dev |

---

## ✅ **Kiểm Tra Mọi Thứ Chạy Đúng**

### Backend đang chạy?
```bash
lsof -i :5000
# Nếu có output = Backend OK
```

### Frontend đang chạy?
```bash
lsof -i :3000
# Nếu có output = Frontend OK
```

### Ngrok tunnel hoạt động?
- Vào ngrok URL từ logs backend
- Nếu thấy login form = OK ✅
- Nếu thấy "Not Found" = Backend chưa serve React build

---

## 🔧 **Nếu Có Lỗi "Lỗi kết nối server"**

### ✅ Giải pháp (theo thứ tự):

1. **Đảm bảo backend chạy:**
   ```bash
   lsof -i :5000
   ```
   Nếu không có, khởi động lại backend.

2. **Check browser console (F12):**
   - Xem socket URL/API URL là gì?
   - Nó có match ngrok URL hay localhost:5000?

3. **Check backend logs:**
   - Có error gì không?
   - Socket.IO connect success hay fail?

4. **Hard refresh (Cmd+Shift+R trên Mac):**
   - Clear browser cache

5. **Nếu vẫn fail → restart tất cả:**
   ```bash
   # Kill old processes
   lsof -ti:5000 | xargs kill -9
   lsof -ti:3000 | xargs kill -9
   
   # Start lại
   bash start_all.sh
   ```

---

## 🎓 **Hiểu Cách Hoạt Động**

### **Local (localhost:3000 → localhost:5000):**
```
Browser (localhost:3000)
    ↓
React Frontend (npm start on port 3000)
    ↓ (API calls to http://localhost:5000)
    ↓
Flask Backend (port 5000)
```

### **Public (via ngrok):**
```
Browser (https://unmodelled-higher-jeanette.ngrok-free.dev)
    ↓
Ngrok Tunnel (forwards to localhost:5000)
    ↓
Flask Backend + React Build (port 5000 serves both)
    ↓ (Socket.IO, API calls to same origin)
    ✅ No CORS issues!
```

---

## 📋 **Tổng Kết**

| Cách | Lệnh | Terminal | Ưu Điểm |
|------|------|----------|--------|
| **1** | `bash start_all.sh` | 1 | Dễ nhất, tự động cleanup |
| **2** | 2 lệnh | 2 | Balance |
| **3** | 3 lệnh | 3 | Full control |

**Khuyến cáo:** Dùng **Cách 1** với `bash start_all.sh` - dễ, nhanh, không lo lắng! 🚀

---

Bất kỳ lỗi gì báo mình, mình sẽ fix liền!
