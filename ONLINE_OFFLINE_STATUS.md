# 🟢 Online/Offline Status Implementation

## Overview
Implemented real-time online/offline status management for users. When a user logs in (joins socket), they are marked as **online**. When they disconnect/logout, they are marked as **offline**. All connected users are notified in real-time.

## Changes Made

### 1. Backend - Socket Events (`server/sockets/chat_events.py`)

#### User Join (Login)
```python
@socketio.on('join')
def handle_join(data):
    # ... existing code ...
    
    # When user joins, update their status to 'online'
    if user_id:
        user = User.query.get(int(user_id))
        if user:
            user.status = 'online'
            db.session.commit()
    
    # Broadcast online status to ALL connected users
    socketio.emit('user_status_changed', {
        'user_id': user_id, 
        'status': 'online'
    }, broadcast=True)
```

**What happens:**
- User logs in and joins socket room
- User's status in database updated to `'online'`
- Event `user_status_changed` broadcast to all connected clients

#### User Disconnect (Logout)
```python
@socketio.on('disconnect')
def handle_disconnect(data=None):
    # ... find user_id from socket mapping ...
    
    # When user disconnects, update their status to 'offline'
    if user_id:
        user = User.query.get(int(user_id))
        if user:
            user.status = 'offline'
            db.session.commit()
    
    # Broadcast offline status to ALL connected users
    socketio.emit('user_status_changed', {
        'user_id': disconnected_user_id,
        'status': 'offline'
    }, broadcast=True)
```

**What happens:**
- User disconnects/closes app/loses internet
- User's status in database updated to `'offline'`
- Event `user_status_changed` broadcast to all connected clients

### 2. Frontend - Socket Listener (`client/src/services/socket.js`)

Added new listener function:
```javascript
export const onUserStatusChanged = (callback) => {
  const sock = getSocket();
  sock.off('user_status_changed');
  sock.on('user_status_changed', (data) => {
    console.log('[USER_STATUS_CHANGED]', data);
    callback(data);
  });
};
```

### 3. Frontend - Status Update Handler (`client/src/components/Chat/ChatBox.js`)

Added listener in main useEffect:
```javascript
onUserStatusChanged((data) => {
  const changedUserId = data?.user_id;
  const newStatus = data?.status;
  
  // Update all users in list with new status
  setUsers((prev) => {
    return prev.map((user) => {
      if (String(user.id) === String(changedUserId)) {
        return { ...user, status: newStatus };
      }
      return user;
    });
  });
  
  // Update selected user status if they changed
  if (selectedUser && String(selectedUser.id) === String(changedUserId)) {
    setSelectedUser((prev) => {
      if (prev) return { ...prev, status: newStatus };
      return prev;
    });
  }
});
```

**What it does:**
- Listens for `user_status_changed` events from server
- Updates user status in the UI list
- Updates selected user status if they're currently chatting with you
- Status displays as 🟢 Online or ⚪ Offline

## How It Works

### Login Flow
```
1. User enters credentials
2. Backend authenticates and sends JWT token
3. Frontend receives token, stores it
4. Frontend opens chat page
5. Socket connects automatically
6. Frontend emits 'join' event with user_id
7. Backend receives 'join':
   - Sets user.status = 'online' in database
   - Broadcasts 'user_status_changed' to all clients
8. All connected clients receive the event
9. All clients update that user's status to 'online' ✅
```

### Logout/Disconnect Flow
```
1. User closes app or clicks logout
2. Socket connection closes
3. Backend receives 'disconnect' event
4. Backend:
   - Finds user_id from socket mapping
   - Sets user.status = 'offline' in database
   - Broadcasts 'user_status_changed' to all clients
5. All connected clients receive the event
6. All clients update that user's status to 'offline' ✅
```

## Database Updates

The user's `status` field in the `users` table is updated:

| Field | Type | Values |
|-------|------|--------|
| `status` | String | `'online'` or `'offline'` |

Database changes happen in:
- `handle_join()` - sets to `'online'`
- `handle_disconnect()` - sets to `'offline'`

## Frontend Display

The status is shown in multiple places:

### Contact List
```javascript
status: c.online ? 'online' : 'offline'
// Displays as: 🟢 Online or ⚪ Offline
```

### Chat Header
```javascript
<span>{user.status === 'online' ? '🟢 Online' : '⚪ Offline'}</span>
```

### Conversation List
```javascript
{user.status === 'online' 
  ? '🟢 Online' 
  : '⚪ Offline'
}
```

## Real-Time Updates

All status changes are **instantly** visible to all connected users:

- User A logs in → All other users see "🟢 Online" for User A
- User B disconnects → All other users see "⚪ Offline" for User B
- User C logs out → All other users see "⚪ Offline" for User C
- User D loses internet → All other users see "⚪ Offline" for User D

## Event Flow

```
Server              Frontend Client A      Frontend Client B
──────              ────────────────      ────────────────

User A joins
✓ status = online
emit broadcast event
                    ← receive event
                      update status
                      to 'online'
                                          ← receive event
                                            update status
                                            to 'online'

User A disconnects
✓ status = offline
emit broadcast event
                    ← receive event
                      update status
                      to 'offline'
                                          ← receive event
                                            update status
                                            to 'offline'
```

## Testing

### Test 1: Login Shows Online
1. Open Chat App (User A)
2. Login with account
3. Open another browser (User B)
4. Login with different account
5. **Verify User A shows as 🟢 Online in User B's contact list**

### Test 2: Logout Shows Offline
1. With User B still logged in
2. User A closes app or logs out
3. **Verify User A immediately shows as ⚪ Offline in User B's contact list**

### Test 3: Real-Time Update
1. Keep both users logged in
2. Have them chat
3. One user closes browser/app
4. **Verify status changes instantly** (no need to refresh)

### Test 4: Internet Loss
1. User A online, chatting with User B
2. Disconnect User A's internet
3. **Verify User A shows as offline in User B's list** (within a few seconds)
4. Reconnect User A's internet
5. **Verify User A shows as online again**

## Files Modified

1. `server/sockets/chat_events.py`
   - Updated `handle_join()` - set status to online
   - Updated `handle_disconnect()` - set status to offline

2. `client/src/services/socket.js`
   - Added `onUserStatusChanged()` listener

3. `client/src/components/Chat/ChatBox.js`
   - Added import for `onUserStatusChanged`
   - Added listener in main useEffect to handle status changes

## Backward Compatibility

- Existing `onUserOffline()` listener still works
- New `user_status_changed` event is in addition to `user_offline`
- Database status field already existed, just using it properly

## Error Handling

If database update fails:
```python
except Exception as e:
    print(f"⚠️ Error updating user status: {e}")
    db.session.rollback()
```
The system continues working - event is still broadcast even if DB update fails, so status still updates in UI.

## Performance Impact

- **Minimal** - Status is just a string field update
- Single database UPDATE statement per login/logout
- Broadcast is built-in to Socket.IO
- No new API calls

## Future Enhancements

Possible improvements:
1. **Last seen timestamp** - Record when user last disconnected
2. **Typing status** - Show "User is typing..." indicator
3. **Activity status** - Show different status for "away", "busy", etc.
4. **Presence sync** - Sync status from multiple devices
5. **Grace period** - Wait 30 seconds before marking offline (for reconnections)

## Status Codes

Current status values:
- `'online'` - User is connected and active
- `'offline'` - User is not connected

Could be extended to:
- `'away'` - User online but inactive for X minutes
- `'dnd'` - Do Not Disturb mode
- `'invisible'` - Appear offline to others

## Logging

Console logs for debugging:

**Backend:**
```
[CHAT][NHẬN] ✅ Updated user 1 status to 'online'
[CHAT][GỬI] ✅ Broadcasted user 1 online status
```

**Frontend:**
```
[USER_STATUS_CHANGED] { user_id: '1', status: 'online' }
[STATUS_CHANGE] User 1 is now online
```

---

**Status**: ✅ IMPLEMENTED - Users now show online/offline status in real-time!
