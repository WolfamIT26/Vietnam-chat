# Auth & OTP Implementation (ChatViet)

Tài liệu này triển khai theo thứ tự từ trên xuống dưới (yêu cầu của bạn). Bao gồm UI/UX, API spec, socket auth, DDL, security, và test cases.

## 1. Màn hình Xác thực OTP (Forget / Reset / Change password)
- Giao diện:
  - Văn bản: "Nhập mã OTP" và phần mô tả: "nhập otp...." — hiển thị 6 ô input (mỗi ô 1 chữ số).
  - Hỗ trợ auto-focus: khi nhập 1 chữ số sẽ focus ô tiếp theo; backspace quay lại ô trước.
  - Hỗ trợ paste toàn bộ mã 6 chữ số: khi paste, phân tách từng ký tự vào từng ô.
  - Hiển thị target đã gửi: `+84*******567` (masked). Có button "Thay đổi" để chọn phương thức khác.
  - Countdown 60s (hiển thị mm:ss). Khi hết time, bật nút Resend nhưng phải giới hạn số lần resend (ví dụ 3 lần / 15 phút).
  - Submit flow: gửi POST `/auth/verify` với body { identifier, code, purpose }.
  - Error handling:
    - Nếu OTP sai: tăng attempts trên server; trả về 400 INVALID_CODE.
    - Nếu attempts vượt mức: server trả 429 TOO_MANY_ATTEMPTS hoặc yêu cầu CAPTCHA → UI hiển thị CAPTCHA (web) và hướng dẫn.

### UX details / Accessibility
- Ô input nên là `<input type="text" inputMode="numeric" pattern="[0-9]*" maxlength=1>`
- Hỗ trợ keyboard navigation, aria-label cho từng ô.

## 2. Màn hình Đăng nhập
- Fields: `identifier` (phone/email), `password`.
- Checkbox: "Nhớ đăng nhập trên thiết bị này".
- Khi submit: show spinner, disable inputs, POST `/auth/login` body { identifier, password, device_info }.
- Success: lưu token (secure, see storage note), mở socket với Bearer token, GET `/auth/me`, redirect vào app.
- Fail:
  - 401 → show "Sai thông tin đăng nhập".
  - 423 → account locked → hiển thị chỉ dẫn liên hệ support / flow unlock.

## 3. Quên mật khẩu / Reset
- POST `/auth/forgot_password` { identifier } → server luôn trả 200 (no enumeration) và gửi OTP/token.
- Client hiển thị "Đã gửi" message chung.
- Reset: user nhập token/OTP + new_password + confirm. POST `/auth/reset_password` { token, new_password }.

## 4. API SPEC – ChatViet (0.3)

### 0.3.1 POST /auth/register
Request body:
```
{
  "display_name": "Nguyen Van A",
  "identifier": "+84901234567",
  "identifier_type": "phone",
  "password": "P@ssw0rd!",
  "idempotency_key": "uuid-v4"
}
```
Responses:
- 201 PENDING_VERIFICATION: mã OTP đã gửi.
- 201 SUCCESS: đăng ký và auto login.
- Errors: 400, 409, 422, 429.

### 0.3.2 POST /auth/verify
Request:
```
{ "identifier": "+84901234567", "code": "123456", "purpose": "register" }
```
Success 200: trả về tokens + user.
Errors: 400 INVALID_CODE, 410 CODE_EXPIRED, 429 TOO_MANY_ATTEMPTS.

### 0.3.3 POST /auth/login
Request:
```
{ "identifier":"+84901234567","password":"P@ssw0rd!","device_info": { "device_id":"...","platform":"android" } }
```
Success 200: tokens + user + device_id.
Errors: 401, 423, 403.

### 0.3.4 POST /auth/logout
Request: { "refresh_token":"...", "device_id":"device_abc" }

### 0.3.5 POST /auth/refresh
Request: { "refresh_token":"...", "device_id":"device_abc" }

### 0.3.6 POST /auth/forgot_password & /auth/reset_password
- forgot_password: { identifier } → return 200 (no enumeration)
- reset_password: { token, new_password }

## 5. Socket Auth & Real-time
- Connect socket with header Authorization: Bearer <access_token>.
- On connect: verify token; map socket_id ↔ user_id; store presence in Redis `presence:user:{user_id}`.
- On disconnect: remove mapping; implement grace period 60s before marking offline.

## 6. DB Schema (DDL)
```
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  identifier VARCHAR(255) UNIQUE NOT NULL,
  identifier_type VARCHAR(20),
  display_name VARCHAR(255),
  password_hash TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE auth_otps (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  identifier VARCHAR(255) NOT NULL,
  code_hash TEXT NOT NULL,
  purpose VARCHAR(50),
  attempts INT DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  device_id TEXT,
  refresh_token_hash TEXT,
  issued_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP
);
```

## 7. Security & Anti-abuse
- Password hashing: Argon2id or bcrypt.
- OTP storage: HMAC + salt (store hash only).
- Rate limits:
  - Register: max 5/h/IP.
  - OTP resend: max 3 fois / 15 minutes.
  - Login attempts: 5 fails → lock 15 minutes.
- Idempotency keys for state-changing endpoints.
- Token rotation and device session tracking.

## 8. Zalo OTP (ZNS / OA)
- Server should call Zalo Business API to send template OTP, log status, and retry up to 3 times on transient errors.

## 9. Test Cases (high level)
- TC-REG-001..003 (happy path, existing identifier, weak password)
- TC-OTP-001..003 (valid code, invalid, expired)
- TC-LOGIN-001..003 (success, invalid, locked)
- TC-LOGOUT-001
- TC-SEC-001..002 (rate-limit, token rotation)

## 10. Pseudo-code backend (Node.js/TypeScript)
```js
async function register(req,res){
  const { display_name, identifier, identifier_type, password, idempotency_key } = req.body;
  // validate inputs
  // check idempotency
  // hash password
  // create user pending
  const code = generateOTP();
  await saveOtpHash(identifier, hash(code), 'register', expiresAt);
  await sendOtpViaPreferredChannel(identifier, code);
  return res.status(201).json({ code:'PENDING_VERIFICATION' });
}

async function verify(req,res){
  const { identifier, code, purpose } = req.body;
  const otpRecord = await getOtpRecord(identifier,purpose);
  if(!otpRecord) return res.status(400).json({ code:'INVALID_CODE' });
  if(isExpired(otpRecord)) return res.status(410).json({ code:'CODE_EXPIRED' });
  if(!verifyHash(code, otpRecord.code_hash)){
    await incrementAttempts(otpRecord.id);
    return res.status(400).json({ code:'INVALID_CODE' });
  }
  const tokens = issueTokens(userId, deviceId);
  await deleteOtpRecord(otpRecord.id);
  return res.json({ code:'SUCCESS', data:{ tokens } });
}
```

## 11. Deployment & Observability
- Metrics: auth_success, auth_fail, otp_sent, otp_failed, refresh_usage.
- Tracing: register/login/verify traces.
- Alerts: spikes in auth_fail or SMS provider errors.

---

Nếu bạn muốn, mình có thể tiếp tục và:
- (A) Tạo các route backend stub trong `server/routes/auth/` và implement logic cơ bản.
- (B) Tạo component React `OTPVerification` + `Login` theo spec (kèm unit tests).

Chọn (A), (B), hoặc cả hai và mình sẽ triển khai tiếp theo từng bước an toàn (backup branch trước khi chỉnh sửa).
