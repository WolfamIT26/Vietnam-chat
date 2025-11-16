ChatViet - Module 1: Chat
=================================

1.0 Mục tiêu Module
-------------------
Khái niệm chung
•	Message model: id, client_message_id, conversation_id, sender_id, type, content, attachments, status (sending → sent → delivered → seen), created_at, updated_at.
•	Conversation model: id, type (1:1 / group), participants, last_message_id, unread_count.
•	Quản lý toàn bộ luồng chat: gửi, sửa, thu hồi, reaction, trả lời, chuyển tiếp, typing, đã xem.
•	Hỗ trợ UI realtime, offline, retry khi lỗi mạng.
•	Tích hợp socket event & API, bảo mật, test case.

1.A Kiến trúc luồng (Sequence flow ngắn)
1.	Người dùng mở ChatViet → vào conversation list → chọn conversation.
2.	Nhập text / emoji / sticker → bật nút gửi hoặc reaction.
3.	Nhấn gửi → UI thêm message tạm (status=sending).
4.	Socket emit send_message.
5.	Server lưu DB → trả message_sent_ack.
6.	Server broadcast receive_message tới người nhận.
7.	Người nhận mở conversation → emit message_seen.
8.	Client cập nhật status: sending → sent → delivered → seen.
9.	Offline / mất mạng → queue message local → sync khi online.

1.1 UI / UX SPEC
----------------
1.1.1 Input & Nút gửi / Reaction
•	Input trống: show ReactionButton (👍)
o	Hover → show emoji picker: ❤️ 😆 😢 😮 😡 😍 …
o	Right-click → đổi emoji mặc định cho nút
•	Input có text: show SendButton (mũi tên)
•	Nhấn Send: disable input, show spinner, scroll xuống cuối chat

1.1.2 Gửi tin nhắn văn bản
•	User Action: nhập text → nhấn Send
•	UI Handling:
o	Tạo client_message_id
o	Thêm vào UI, status=sending
•	Socket emit:
send_message({
  client_message_id,
  conversation_id,
  sender_id,
  type: "text",
  content: "Nội dung"
})
•	Server:
o	Lưu DB (messages)
o	Trả message_sent_ack { client_message_id, message_id, status: 'sent' }
o	Broadcast receive_message tới recipients
•	Client nhận ACK: cập nhật status=sent
•	Lỗi mạng: không nhận ack trong 10s → status=failed, show nút retry

1.1.3 Gửi Emoji / Reaction
•	ReactionButton hover → chọn emoji
•	Socket emit:
send_message({ type: "reaction", content: "❤️", target_message_id })
•	Server lưu DB → broadcast message_reacted
•	Client hiển thị emoji nhỏ dưới tin nhắn

1.1.4 Gửi Sticker
•	Click StickerButton → mở sticker library (gợi ý: Giphy API, EmojiOne, Twemoji hoặc custom pack)
•	Chọn sticker → emit socket:
send_message({ type: "sticker", sticker_id, url })
•	Server lưu DB, trả message_sent_ack, broadcast receive_message
•	Client hiển thị 

1.1.5 Gửi ảnh / file
•	Click 📎 → chọn file → hiển thị preview → nhấn gửi
•	Backend:
o	POST /upload → trả URL
o	Socket emit send_message({ type: "image/file", url })
•	Client hiển thị message với preview / link download
•	Retry: nút retry nếu upload thất bại

1.1.6 Tin nhắn chưa đọc & badge
•	Conversation list hiển thị unread_count
o	Nếu >5 → hiển thị 5+
•	Client nhận receive_message → tăng counter
•	Khi mở conversation → reset counter, emit message_seen

1.2 Sửa / Thu hồi tin nhắn
-------------------------
•	Chỉnh sửa: nhấn giữ → "Chỉnh sửa"
o	API: PATCH /messages/{id}
o	Socket emit: message_edited({ message_id, new_content })
o	DB: update content, updated_at
•	Thu hồi: nhấn giữ → "Thu hồi"
o	API: DELETE /messages/{id}
o	Socket emit: recall_message({ message_id })
o	Client hiển thị “Tin nhắn đã được thu hồi”

1.3 Trả lời / Chuyển tiếp
------------------------
•	Reply:
o	Chọn “Trả lời” → preview message gốc
o	Socket emit: send_message({ reply_to: message_id, content })
•	Forward:
o	Chọn “Chuyển tiếp” → chọn target user
o	Socket emit: forward_message({ target_user_id, original_message_id })

1.4 Typing indicator
--------------------
•	User nhập text → debounce 300ms → emit typing_start
•	Ngừng nhập → emit typing_stop
•	Server broadcast tới participants

1.5 Offline & Delta Sync
------------------------
•	Offline → queue local messages
•	Online → GET /sync?since=timestamp
•	Server trả: messages mới, seen status, settings mới
•	Conflict → ưu tiên timestamp server

1.6 Media & File
-----------------
•	Upload:
o	POST /media/presign → nhận presigned URL
o	Upload trực tiếp S3
o	Send message type image/file với URL
•	Xử lý: thumbnail, tối ưu ảnh/video
•	Retry: nút retry nếu upload thất bại

1.7 API SPEC
------------
1.7.1 POST /messages/send
Request:
{
  "client_message_id": "uuid-v4",
  "conversation_id": "conv_123",
  "sender_id": "user_abc",
  "type": "text|sticker|image|file|reaction",
  "content": "Nội dung hoặc url",
  "reply_to": "optional_message_id",
  "attachments": []
}
Success 200:
{
  "code":"SUCCESS",
  "data":{
    "message_id":"msg_123",
    "status":"sent",
    "timestamp":"..."
  }
}
Errors:
•	400 INVALID_PAYLOAD
•	401 UNAUTHORIZED
•	429 RATE_LIMIT

1.7.2 PATCH /messages/{id} (edit)
Request:
{ "new_content":"Nội dung mới" }
Success 200 → message updated
Errors: 403 UNAUTHORIZED, 404 NOT_FOUND

1.7.3 DELETE /messages/{id} (recall)
Request: {}
Success 200 → broadcast message_recalled
Errors: 403 UNAUTHORIZED, 404 NOT_FOUND, 409 TOO_LATE

1.7.4 GET /sync?since=timestamp
•	Trả về: messages mới, seen status, settings mới
•	Errors: 401 UNAUTHORIZED

1.8 Socket Events
-----------------
Event	Direction	Payload	Mô tả
send_message	client→server	message object	gửi tin nhắn
message_sent_ack	server→client	message_id, client_message_id, status	ack message
receive_message	server→client	message object	broadcast đến recipient
message_edited	server→client	message_id, new_content	cập nhật nội dung
recall_message	client→server	message_id	thu hồi
message_recalled	server→client	message_id	broadcast message thu hồi
react_message	client→server	message_id, reaction	reaction
message_reacted	server→client	message_id, reactions	broadcast reaction
typing_start/stop	client→server	conversation_id	typing indicator
message_seen	client→server	message_ids	mark seen

1.9 DB Schema (DDL)
--------------------
CREATE TABLE conversations (
id BIGSERIAL PRIMARY KEY,
type VARCHAR(20), -- "1:1"|"group"
last_message_id BIGINT,
unread_count INT DEFAULT 0,
updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE TABLE messages (
id BIGSERIAL PRIMARY KEY,
conversation_id BIGINT REFERENCES conversations(id),
sender_id BIGINT REFERENCES users(id),
client_message_id UUID,
type VARCHAR(20),
content TEXT,
attachments JSONB,
status VARCHAR(20) DEFAULT 'sending',
reply_to BIGINT,
created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE TABLE message_reactions (
id BIGSERIAL PRIMARY KEY,
message_id BIGINT REFERENCES messages(id),
user_id BIGINT REFERENCES users(id),
reaction_type VARCHAR(20),
created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

1.10 Pseudo-code Backend (Node.js/TypeScript)
-------------------------------------------
// send_message handler
async function sendMessage(req, res) {
  const { client_message_id, conversation_id, sender_id, type, content } = req.body;
  validateInputs();
  const message = await db.insert('messages', { conversation_id, sender_id, client_message_id, type, content, status:'sent' });
  socket.broadcastToConversation(conversation_id, 'receive_message', message);
  res.json({ code:'SUCCESS', data:{ message_id: message.id, status:'sent' }});
}

// react_message handler
async function reactMessage(req, res) {
  const { message_id, user_id, reaction } = req.body;
  await db.insert('message_reactions', { message_id, user_id, reaction_type: reaction });
  const reactions = await db.select('message_reactions', { message_id });
  socket.broadcastToConversation(message.conversation_id, 'message_reacted', { message_id, reactions });
  res.json({ code:'SUCCESS' });
}

1.11 Bảo mật & Retry
---------------------
•	Hash dữ liệu nhạy cảm (attachments URL signature, reaction signature nếu cần)
•	Rate-limit: gửi message max 30 msg/5s, reaction max 20/10s
•	Offline retry / exponential backoff
•	Validation client & server

1.12 Test cases & QA checklist
-----------------------------
•	Gửi tin nhắn:
o	TC-CHAT-001: gửi text thành công → ack received → broadcast recipient
o	TC-CHAT-002: gửi tin nhắn offline → sync khi online
o	TC-CHAT-003: gửi tin nhắn failed → nút retry hoạt động
•	Sửa / Thu hồi:
o	TC-CHAT-004: sửa message → cập nhật message_edited
o	TC-CHAT-005: thu hồi trong thời gian cho phép → message_recalled
•	Reaction / Reply / Forward:
o	TC-CHAT-006: reaction hiển thị đúng
o	TC-CHAT-007: reply hiển thị quote message
o	TC-CHAT-008: forward gửi sang conversation khác
•	Typing indicator:
o	TC-CHAT-009: emit typing_start / stop đúng debounce
•	Media / File:
o	TC-CHAT-010: upload file → message hiển thị → retry thất bại
•	Tin nhắn chưa đọc / badge:
o	TC-CHAT-011: nhận tin nhắn chưa đọc → counter tăng
o	TC-CHAT-012: mở conversation → counter reset
