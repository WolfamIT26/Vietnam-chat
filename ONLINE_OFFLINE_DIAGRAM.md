# 🔄 Online/Offline Status - System Diagram

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CHAT APPLICATION                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐              ┌──────────────────┐   │
│  │   Frontend 1     │              │   Frontend 2     │   │
│  │   (Browser A)    │              │   (Browser B)    │   │
│  │                  │              │                  │   │
│  │  ChatBox.js      │              │  ChatBox.js      │   │
│  │  - userList      │◄────WS───────►│  - userList      │   │
│  │  - statusListener│              │  - statusListener│   │
│  │  - updateUI      │              │  - updateUI      │   │
│  └──────────────────┘              └──────────────────┘   │
│           ▲                                ▲               │
│           │                                │               │
│     socket.js                        socket.js             │
│     onUserStatusChanged()            onUserStatusChanged() │
│           │                                │               │
└───────────┼────────────────────────────────┼───────────────┘
            │                                │
            │         WebSocket              │
            │      Broadcasting              │
            │                                │
        ┌───▼────────────────────────────────▼────┐
        │                                         │
        │    Backend - Flask + Socket.IO          │
        │                                         │
        │  ┌──────────────────────────────────┐  │
        │  │  Socket Event Handlers           │  │
        │  │                                  │  │
        │  │  @socketio.on('join')            │  │
        │  │  ├─ Set user.status = 'online'  │  │
        │  │  ├─ Save to database             │  │
        │  │  └─ Broadcast status_changed    │  │
        │  │                                  │  │
        │  │  @socketio.on('disconnect')     │  │
        │  │  ├─ Set user.status = 'offline' │  │
        │  │  ├─ Save to database             │  │
        │  │  └─ Broadcast status_changed    │  │
        │  └──────────────────────────────────┘  │
        │                ▲                       │
        │                │                       │
        │         Read/Write DB                  │
        │                │                       │
        └────────────────┼───────────────────────┘
                         │
                    ┌────▼────┐
                    │ DATABASE │
                    │          │
                    │users tbl │
                    │ id       │
                    │ username │
                    │ status   │◄──── 'online' or 'offline'
                    │ avatar   │
                    └──────────┘
```

## Event Flow - User Login

```
STEP 1: User Opens App & Logs In
┌─────────────────────────────────────┐
│ Frontend: User fills login form      │
│ - username: alice                   │
│ - password: ****                    │
│ Clicks: "Đăng nhập" button          │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Backend: Verify credentials         │
│ ✓ Username & password correct       │
│ ✓ Generate JWT token                │
│ ✓ Return token to frontend          │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Frontend: Receive token             │
│ ✓ Save to localStorage              │
│ ✓ Navigate to /chat page            │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Frontend: Connect Socket            │
│ ✓ Open WebSocket connection         │
│ ✓ Emit 'join' event with user_id    │
│   { user_id: 123 }                  │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Backend: Receive 'join' event       │
│ ✓ Get user_id = 123                 │
│ ✓ Store in user_sockets mapping     │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Backend: Update Status              │
│ SELECT user WHERE id = 123          │
│ UPDATE user SET status = 'online'   │
│ COMMIT ✓                            │
│                                     │
│ user.id = 123                       │
│ user.status = 'online' ← CHANGED    │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Backend: Broadcast to ALL           │
│ socketio.emit(                      │
│   'user_status_changed',            │
│   {                                 │
│     user_id: 123,                   │
│     status: 'online'                │
│   },                                │
│   broadcast=True                    │
│ )                                   │
└─────────────────────────────────────┘
           │
      ┌────┴────┐
      ▼         ▼
┌──────────┐ ┌──────────┐
│ Client A │ │ Client B │
│   (Alice)│ │  (Bob)   │
└──────────┘ └──────────┘
      │         │
      │         ▼
      │    ┌────────────────────────┐
      │    │ Bob's Frontend receives│
      │    │ 'user_status_changed'  │
      │    │ { user_id: 123,        │
      │    │   status: 'online' }   │
      │    └────────────────────────┘
      │         │
      │         ▼
      │    ┌────────────────────────┐
      │    │ Bob's React updates:   │
      │    │ setUsers(prev =>       │
      │    │   prev.map(u =>        │
      │    │     if (u.id === 123)  │
      │    │       return {...u,    │
      │    │         status: 'online│
      │    │       }                │
      │    │   )                    │
      │    │ )                      │
      │    └────────────────────────┘
      │         │
      │         ▼
      │    ┌────────────────────────┐
      │    │ Bob sees Alice as:     │
      │    │ 🟢 Alice Online        │
      │    │                        │
      │    │ In contact list        │
      │    │ In conversation list   │
      │    │ In chat header (if     │
      │    │   chatting with Alice) │
      │    └────────────────────────┘
      │
      └─ Alice also sees herself updated
```

## Event Flow - User Disconnect

```
STEP 2: User Closes App / Loses Internet / Logs Out
┌─────────────────────────────────────┐
│ Frontend: User Action               │
│ - Closes browser tab                │
│ OR: Closes entire browser           │
│ OR: Clicks logout button            │
│ OR: Internet disconnects            │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Browser: Close WebSocket            │
│ Socket connection closes            │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Backend: Receive 'disconnect' event │
│ ✓ Socket closes                     │
│ ✓ Find user_id from socket mapping  │
│   user_id = 123 (Alice)             │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Backend: Update Status              │
│ SELECT user WHERE id = 123          │
│ UPDATE user SET status = 'offline'  │
│ COMMIT ✓                            │
│                                     │
│ user.id = 123                       │
│ user.status = 'offline' ← CHANGED   │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Backend: Broadcast to ALL           │
│ socketio.emit(                      │
│   'user_status_changed',            │
│   {                                 │
│     user_id: 123,                   │
│     status: 'offline'               │
│   },                                │
│   broadcast=True                    │
│ )                                   │
└─────────────────────────────────────┘
           │
      ┌────┴────┐
      ▼         ▼
 (Alice gone) ┌──────────────────────┐
             │ Bob's Frontend receives
             │ 'user_status_changed'
             │ { user_id: 123,
             │   status: 'offline' }
             └──────────────────────┘
                     │
                     ▼
             ┌──────────────────────┐
             │ Bob's React updates: │
             │ setUsers(prev =>     │
             │   prev.map(u =>      │
             │     if (u.id === 123)│
             │       return {...u,  │
             │         status:      │
             │         'offline'    │
             │       }              │
             │   )                  │
             │ )                    │
             └──────────────────────┘
                     │
                     ▼
             ┌──────────────────────┐
             │ Bob sees Alice as:   │
             │ ⚪ Alice Offline     │
             │                      │
             │ In contact list      │
             │ In conversation list │
             │ In chat header (if   │
             │   was chatting)      │
             │                      │
             │ NO REFRESH NEEDED!   │
             │ INSTANT UPDATE!      │
             └──────────────────────┘
```

## Real-Time Status Update Flow

```
                Frontend A (Alice)              Backend              Frontend B (Bob)
                ──────────────                  ───────              ──────────────
                
Alice clicks logout
│
├─ Closes WebSocket
│
└──────────────────────────────────────────────► [disconnect event]
                                                        │
                                        ┌───────────────┘
                                        │
                                    Finds Alice's
                                    user_id from
                                    socket mapping
                                        │
                                    Updates DB:
                                    status = offline
                                        │
                         Broadcasts to ALL clients:
                         {user_id: 123,
                          status: offline}
                                        │
                 ┌──────────────────────┼────────────────────┐
                 │                      │                    │
            (no socket)         [status_changed event]   ◄───┘
                                        │
                                        │ (all browsers receive)
                                        │
                                        └──────────► React updates:
                                                     setUsers() →
                                                     Alice.status = offline
                                                     
                                                     UI Shows:
                                                     ⚪ Alice Offline
```

## Data Structure

### Socket Event: user_status_changed

**Emitted by:** Backend (`socketio.emit`)
**Received by:** All connected frontend clients
**Broadcast:** Yes (to all users)

```javascript
{
  user_id: 123,           // Which user changed
  status: 'online'        // New status: 'online' or 'offline'
}
```

### Database Record: User

```sql
user
├── id: INTEGER          (1, 2, 3, ...)
├── username: VARCHAR    ('alice', 'bob', ...)
├── password_hash: VARCHAR
├── display_name: VARCHAR
├── avatar_url: VARCHAR
├── status: VARCHAR      ← THIS IS WHAT WE UPDATE
│  ├── 'online'
│  └── 'offline'
├── gender: VARCHAR
├── birthdate: DATE
├── phone_number: VARCHAR
└── created_at: DATETIME
```

### Frontend State: User Object

```javascript
{
  id: 123,                     // User ID
  username: 'alice',           // Login name
  display_name: 'Alice Nguyễn', // Display name
  avatar_url: '/uploads/...',  // Avatar image
  status: 'online',            // ← DISPLAYED IN UI
  // ... other fields ...
}

// Displayed as:
// 🟢 Online   or   ⚪ Offline
```

## Component Update Flow

```
ChatBox.js
│
├─ useEffect([currentUserId])
│  └─ onUserStatusChanged((data) => {
│     ├─ Extract user_id and status
│     │
│     ├─ Update users list:
│     │  setUsers(prev =>
│     │    prev.map(user =>
│     │      if (user.id === user_id)
│     │        return {...user, status: newStatus}
│     │    )
│     │  )
│     │
│     └─ Update selected user (if chatting):
│        if (selectedUser?.id === user_id)
│          setSelectedUser({...selectedUser, status: newStatus})
│
└─ Component Re-renders
   ├─ Contact list updated
   ├─ Conversation list updated
   ├─ Chat header updated
   └─ UI shows 🟢 Online / ⚪ Offline
```

## Timeline: Login → Offline

```
Time    Event
────    ──────────────────────────────────────────────────
T+0s    User clicks Login button
T+0.1s  Backend verifies credentials
T+0.2s  Frontend receives token
T+0.3s  Frontend navigates to /chat
T+0.4s  Socket connects
T+0.5s  Frontend emits 'join' event
T+0.6s  Backend receives 'join'
T+0.7s  Backend sets status = 'online'
T+0.8s  Backend broadcasts 'user_status_changed'
T+0.9s  All other clients receive event
T+1.0s  Frontend updates UI
T+1.1s  🟢 Online appears in all browsers
        
        ════════════════════════════════════
        
T+600s  User closes browser
T+600.1s Backend receives 'disconnect'
T+600.2s Backend sets status = 'offline'
T+600.3s Backend broadcasts 'user_status_changed'
T+600.4s All other clients receive event
T+600.5s Frontend updates UI
T+600.6s ⚪ Offline appears in all browsers
        (NO REFRESH NEEDED!)
```

## Multiple User Scenario

```
User A          User B          User C          Database
──────          ──────          ──────          ────────

login   
  │
  └─► emit join ──────────────────────────► status = online
                    broadcast
                    ◄─────────────────────
                    │
                    ├─► User B sees
                    │   A: 🟢 Online
                    │
                    └─► User C sees
                        A: 🟢 Online
                        
User B login
  │
  └─► emit join ──────────────────────────► status = online
                    broadcast
                    ◄─────────────────────
                    │
                    ├─► User A sees
                    │   B: 🟢 Online
                    │
                    └─► User C sees
                        B: 🟢 Online

User A closes
  │
  └─► disconnect ────────────────────────► status = offline
                    broadcast
                    ◄─────────────────────
                    │
                    ├─► User B sees
                    │   A: ⚪ Offline
                    │
                    └─► User C sees
                        A: ⚪ Offline
```

---

**Visual Guide Complete!** Use this to understand how the online/offline system works. 🎯
