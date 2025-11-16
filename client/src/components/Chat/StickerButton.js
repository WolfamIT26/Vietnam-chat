import React, { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// HẰNG SỐ KÍCH THƯỚC (Thay đổi ở đây để điều chỉnh nhanh)
// - EMOJI_BUTTON_FONT_SIZE: kích thước (px) của biểu tượng emoji trên nút mở picker
// - PACK_THUMB_SIZE: kích thước (px) của ảnh đại diện mỗi bộ sticker trong picker
// - STICKER_PREVIEW_SIZE: kích thước tối đa (px) để xem trước sticker trong picker
// Nếu muốn chỉnh kích thước sticker khi hiển thị trong tin nhắn, xem file:
// `client/src/components/Chat/MessageBubble.js` (biến MESSAGE_STICKER_SIZE).
// ---------------------------------------------------------------------------
const EMOJI_BUTTON_FONT_SIZE = 24; // px
const PACK_THUMB_SIZE = 30; // px
const STICKER_PREVIEW_SIZE = 140; // px (max width/height cho preview)

// Sticker packs: grouped for faster loading
const STICKER_PACKS = [
  {
    id: 'funny',
    name: 'Funny',
    thumbnail: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    stickers: [
      { id: 'laugh1', url: 'https://media.giphy.com/media/l3q2K5jinAlZ7iwFi/giphy.gif' },
      { id: 'love1', url: 'https://media.giphy.com/media/3o7TKU9I2F9DxIa0gw/giphy.gif' },
    ],
  },
  {
    id: 'animals',
    name: 'Animals',
    thumbnail: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
    stickers: [
      { id: 'cat1', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif' },
      { id: 'dog1', url: 'https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif' },
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts',
    thumbnail: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    stickers: [
      { id: 'heart1', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
      { id: 'angry1', url: 'https://media.giphy.com/media/3o7TKt3A7Sp6wnY2LK/giphy.gif' },
    ],
  },
];

// convenience flat list for legacy code (not used directly for packs)
const STICKERS = STICKER_PACKS.flatMap((p) => p.stickers);

// Emoji list by categories (English labels to be clear)
const EMOJIS = [
  { category: 'Recent', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂'] },
  { category: 'Smileys & Emotion', emojis: ['😊', '😇', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '', '😑', '', '', '😬', '🤥', '', '😴'] },
  { category: 'Gestures', emojis: ['👋', '🤚', '🖐️', '✋', '', '🤌', '🤏', '✌️', '🤞', '', '🤘', '🤙', '👍', '👎', '✊', '👊', '👏', '🙌'] },
  { category: 'Animals & Nature', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '', '🐵', '🐒', '🦄', '�', '🦋'] },
  { category: 'Food & Drink', emojis: ['🍎', '🍌', '🍇', '🍓', '🍕', '🍔', '🍟', '🍣', '🍩', '🍪', '☕', '🍺', '🍷', '🍜'] },
];

const StickerButton = ({ onSelectSticker, onAddEmoji }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('sticker'); // 'sticker' or 'emoji'
  const [selectedSticker, setSelectedSticker] = useState(null); // For sticker preview
  const [selectedPack, setSelectedPack] = useState(STICKER_PACKS[0]?.id || null);
  const [loadedPacks, setLoadedPacks] = useState({}); // cache map packId -> true

  const handleStickerSelect = (sticker) => {
    setSelectedSticker(sticker);
  };

  // When user chooses a sticker pack, preload its images for quick display
  useEffect(() => {
    if (!selectedPack || loadedPacks[selectedPack]) return;
    const pack = STICKER_PACKS.find((p) => p.id === selectedPack);
    if (!pack) return;
    // Preload images
    pack.stickers.forEach((s) => {
      const img = new Image();
      img.src = s.url;
    });
    setLoadedPacks((prev) => ({ ...prev, [selectedPack]: true }));
  }, [selectedPack, loadedPacks]);

  const handleSendSticker = () => {
    if (selectedSticker) {
      onSelectSticker(selectedSticker);
      setSelectedSticker(null);
      setOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button 
        onClick={() => setOpen((v) => !v)} 
        title="Gửi sticker hoặc emoji" 
        // Dùng hằng số EMOJI_BUTTON_FONT_SIZE ở trên để dễ thay đổi
        style={{ fontSize: EMOJI_BUTTON_FONT_SIZE, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
      >
        {/* Thay bằng SVG icon để đồng bộ giao diện - chỉnh URL nếu cần */}
        <img
          src="https://www.svgrepo.com/show/524524/emoji-funny-square.svg"
          alt="emoji"
          style={{ width: EMOJI_BUTTON_FONT_SIZE + 6, height: EMOJI_BUTTON_FONT_SIZE + 6, display: 'block' }}
        />
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 2000,
          width: '450px',
          maxHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Tab Header */}
          <div style={{
            display: 'flex',
            borderBottom: '2px solid #f0f0f0',
            padding: '12px 0',
          }}>
            <button
              onClick={() => {
                setTab('sticker');
                setSelectedSticker(null);
              }}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '8px',
                color: tab === 'sticker' ? '#0b5ed7' : '#999',
                borderBottom: tab === 'sticker' ? '3px solid #0b5ed7' : 'none',
                transition: 'all 0.3s',
              }}
            >
              STICKER
            </button>
            <button
              onClick={() => setTab('emoji')}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '8px',
                color: tab === 'emoji' ? '#0b5ed7' : '#999',
                borderBottom: tab === 'emoji' ? '3px solid #0b5ed7' : 'none',
                transition: 'all 0.3s',
              }}
            >
              EMOJI
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setSelectedSticker(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 18,
                cursor: 'pointer',
                color: '#999',
                padding: '4px 8px',
              }}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
          }}>
            {tab === 'sticker' ? (
              // STICKER TAB
              <div>
                {/* Sticker pack selector */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {STICKER_PACKS.map((pack) => (
                    <button
                      key={pack.id}
                      onClick={() => {
                        setSelectedPack(pack.id);
                        setSelectedSticker(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 8px',
                        borderRadius: 8,
                        border: selectedPack === pack.id ? '2px solid #0b5ed7' : '1px solid #eee',
                        background: selectedPack === pack.id ? '#f0f7ff' : '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      {/* Kích thước thumbnail của bộ sticker: thay PACK_THUMB_SIZE tại đầu file nếu muốn */}
                      <img src={pack.thumbnail} alt={pack.name} style={{ width: PACK_THUMB_SIZE, height: PACK_THUMB_SIZE, borderRadius: 6 }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{pack.name}</span>
                    </button>
                  ))}
                </div>

                {/* Sticker Preview + Send Button */}
                {selectedSticker && (
                  <div style={{
                    textAlign: 'center',
                    marginBottom: 16,
                    padding: '12px',
                    background: '#f9f9f9',
                    borderRadius: 8,
                    borderBottom: '1px solid #eee',
                  }}>
                    {/* Preview sticker: thay STICKER_PREVIEW_SIZE ở đầu file để chỉnh kích thước */}
                    <img 
                      src={selectedSticker.url} 
                      alt="preview"
                      style={{ maxWidth: STICKER_PREVIEW_SIZE, maxHeight: STICKER_PREVIEW_SIZE, marginBottom: '12px' }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button
                        onClick={handleSendSticker}
                        style={{
                          background: '#0b5ed7',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        ✓ Gửi
                      </button>
                      <button
                        onClick={() => setSelectedSticker(null)}
                        style={{
                          background: '#f0f0f0',
                          color: '#333',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}

                {/* Sticker Grid for selected pack */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 12,
                }}>
                  {(STICKER_PACKS.find((p) => p.id === selectedPack)?.stickers || []).map((sticker) => (
                    <img
                      key={sticker.id}
                      src={sticker.url}
                      alt="sticker"
                      style={{
                        width: '100%',
                        aspectRatio: '1',
                        cursor: 'pointer',
                        borderRadius: 6,
                        transition: 'transform 0.2s, border 0.2s',
                        border: selectedSticker?.id === sticker.id ? '3px solid #0b5ed7' : '2px solid transparent',
                      }}
                      onClick={() => handleStickerSelect(sticker)}
                      onMouseEnter={(e) => {
                        e.target.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = 'scale(1)';
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              // EMOJI TAB
              <div>
                {EMOJIS.map((group) => (
                  <div key={group.category} style={{ marginBottom: 16 }}>
                    <h4 style={{ marginBottom: 8, color: '#333', fontSize: 12, fontWeight: 600 }}>
                      {group.category}
                    </h4>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(8, 1fr)',
                      gap: 4,
                    }}>
                      {group.emojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={(e) => {
                            // If user holds Shift while clicking, send immediately
                            const sendNow = e.shiftKey === true;
                            onAddEmoji(emoji, sendNow);
                            // close only when not just inserting
                            if (sendNow) setOpen(false);
                          }}
                          onDoubleClick={() => {
                            // double-click = send immediately
                            onAddEmoji(emoji, true);
                            setOpen(false);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            fontSize: 24,
                            cursor: 'pointer',
                            padding: 4,
                            borderRadius: 4,
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = '#f0f0f0';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'none';
                          }}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StickerButton;
