import React, { useState } from 'react';
import twemoji from 'twemoji';

// ---------------------------------------------------------------------------
// HẰNG SỐ KÍCH THƯỚC CHUNG CHO MESSAGE
// - MESSAGE_STICKER_SIZE: kích thước (px) cho sticker hiển thị trong khung tin
// - STATUS_ICON_FONT_SIZE: kích thước (px) cho icon trạng thái (✓, ✓✓, 👁, ...)
// - STATUS_ICON_MIN_WIDTH: min-width (px) để tránh layout nhảy khi đổi icon
// Thay các hằng số dưới đây để điều chỉnh nhanh giao diện.
// ---------------------------------------------------------------------------
const MESSAGE_STICKER_SIZE = 24; // px
const STATUS_ICON_FONT_SIZE = 8; // px (thay nếu muốn nhỏ hơn)
const STATUS_ICON_MIN_WIDTH = 14; // px

/**
 * MessageBubble - Hiển thị một tin nhắn (sent hoặc received)
 * Props: { message, isSent, onReply, onReaction }
 */
const MessageBubble = ({ message, isSent, onReply, onReaction, onEmojiHover, onRetry }) => {
  const [showActions, setShowActions] = useState(false);

  const emoticons = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

  return (
    <div className={`message-bubble ${isSent ? 'sent' : 'received'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Show quoted message if this is a reply */}
      {message.reply_to_id && (
        <div style={{
          background: '#f0f0f0',
          padding: '6px 8px',
          borderLeft: '3px solid #0b5ed7',
          marginBottom: '6px',
          fontSize: '12px',
          color: '#666',
        }}>
          Trả lời tin nhắn
        </div>
      )}

      <div className="message-content">
        {message.message_type === 'sticker' ? (
          // Hiển thị sticker inside a rounded tile (matches picker style)
          <div style={{ display: 'inline-block', background: '#f6f7fb', padding: 8, borderRadius: 12 }}>
            <img
              src={message.sticker_url}
              alt="sticker"
              // Dùng MESSAGE_STICKER_SIZE ở đầu file để dễ sửa
              style={{
                width: MESSAGE_STICKER_SIZE,
                height: MESSAGE_STICKER_SIZE,
                objectFit: 'contain',
                borderRadius: 8,
                display: 'block',
              }}
            />
          </div>
        ) : message.file_url ? (
          <div style={{ marginBottom: '8px' }}>
            <a
              href={message.file_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: isSent ? '#fff' : '#667eea',
                textDecoration: 'underline',
                wordBreak: 'break-word'
              }}
            >
              📎 {message.content}
            </a>
          </div>
        ) : (
          // Render text with Twemoji to make emoji consistent across platforms
          <div>
            <span dangerouslySetInnerHTML={{ __html: twemoji.parse(message.content || '', { folder: 'svg', ext: '.svg' }) }} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString('vi-VN')}
          </span>
          {/* Show status icon if sent by current user */}
          {isSent && message.status && (
            // Kích thước icon trạng thái dùng hằng số để dễ chỉnh về sau
            <span style={{ fontSize: STATUS_ICON_FONT_SIZE, minWidth: STATUS_ICON_MIN_WIDTH }} title={`Status: ${message.status}`}>
              {message.status === 'sending' && '⏳'}
              {message.status === 'sent' && '✓'}
              {message.status === 'delivered' && '✓✓'}
              {message.status === 'seen' && '👁'}
              {message.status === 'failed' && '❌'}
            </span>
          )}
          {/* Retry button for failed outgoing messages */}
          {isSent && message.status === 'failed' && onRetry && (
            <button
              onClick={() => onRetry(message)}
              style={{
                marginLeft: 6,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Thử gửi lại"
            >
              🔁
            </button>
          )}
        </div>
      </div>

      {/* Show reactions if any */}
      {message.reactions && Object.keys(message.reactions).length > 0 && (
        <div style={{ marginTop: '4px', fontSize: '14px' }}>
          {Object.entries(message.reactions).map(([emoji, users]) => (
            <span key={emoji} style={{ marginRight: '4px' }}>
              {emoji}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {showActions && (
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '0',
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: '6px',
          display: 'flex',
          gap: '4px',
          padding: '4px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          zIndex: 100,
        }}>
          {/* Reaction picker */}
          {emoticons.map((emoji) => (
            <button
              key={emoji}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '2px 4px',
              }}
              onMouseEnter={() => {
                if (onEmojiHover) onEmojiHover(message.id, emoji);
              }}
              onMouseLeave={() => {
                if (onEmojiHover) onEmojiHover(message.id, null);
              }}
              onClick={() => {
                if (onReaction) onReaction(message.id, emoji);
                setShowActions(false);
              }}
            >
              {emoji}
            </button>
          ))}

          {/* Reply button */}
          <button
            style={{
              background: '#0b5ed7',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
            onClick={() => {
              if (onReply) onReply(message);
              setShowActions(false);
            }}
          >
            ↩️
          </button>

          {/* Forward button */}
          <button
            style={{
              background: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
            onClick={() => {
              alert('Chuyển tiếp: ' + message.content);
              setShowActions(false);
            }}
          >
            ⬆️
          </button>
        </div>
      )}
    </div>
  );
};

export default MessageBubble;

