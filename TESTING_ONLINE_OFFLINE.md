# ✅ Online/Offline Status - Quick Testing Guide

## 🎯 What Was Implemented

Users now show as **🟢 Online** when they log in and **⚪ Offline** when they disconnect or logout. All connected users see status changes in real-time.

## 📋 Testing Checklist

### Setup
- [ ] Backend running: `cd server && python app.py`
- [ ] Frontend running: `cd client && npm start`
- [ ] Open browser to http://localhost:3000

### Test 1: Login = Online
**Steps:**
1. Open Chat App in Browser 1
2. Login as User A
3. Open Chat App in Browser 2 (or incognito)
4. Login as User B
5. Look at Browser B's contact list

**Expected:**
- [ ] User A shows 🟢 Online in Browser B's contacts
- [ ] Click on User A shows "🟢 Online" in chat header

### Test 2: Logout = Offline
**Steps:**
1. Keep Browser 1 (User A) and Browser 2 (User B) both open
2. In Browser 1, click logout
3. Watch Browser 2

**Expected:**
- [ ] User A immediately shows ⚪ Offline in Browser B
- [ ] Status changes instantly (no refresh needed)
- [ ] Chat header shows "⚪ Offline" instead of "🟢 Online"

### Test 3: Close Browser = Offline
**Steps:**
1. Login User A in Browser 1
2. Login User B in Browser 2
3. Browser 1 shows User B is 🟢 Online
4. Browser 2 shows User A is 🟢 Online
5. Close Browser 1 completely

**Expected:**
- [ ] Browser 2 shows User A as ⚪ Offline (within 2-3 seconds)
- [ ] No manual refresh needed

### Test 4: Internet Loss = Offline
**Steps:**
1. Both users logged in and chatting
2. Disconnect Browser 1's internet (unplug WiFi/ethernet)
3. Watch Browser 2

**Expected:**
- [ ] Browser 2 shows User A as ⚪ Offline (within 5-10 seconds)
- [ ] Reconnect internet to Browser 1
- [ ] Browser 2 shows User A as 🟢 Online again

### Test 5: Multiple Logins
**Steps:**
1. Open 3 browsers
2. Login same user in all 3
3. Logout from one browser

**Expected:**
- [ ] User still shows 🟢 Online in other 2 browsers
- [ ] Only the disconnected session shows offline
- [ ] Last connection wins

### Test 6: Chat While Online
**Steps:**
1. User A and User B both 🟢 Online
2. Both chatting
3. User A goes offline
4. User B tries to type message

**Expected:**
- [ ] Chat header shows User A is ⚪ Offline
- [ ] User B can still send messages (stored in DB)
- [ ] Message shows when User A comes back online

## 🔍 How to Verify in Code

### Check Database
```sql
-- Run in database
SELECT id, username, status FROM user;
-- Should show: status = 'online' or 'offline'
```

### Check Browser Console
Open DevTools (F12) → Console tab

Should see logs:
```
[USER_STATUS_CHANGED] { user_id: '1', status: 'online' }
[STATUS_CHANGE] User 1 is now online
```

### Check Backend Logs
Backend terminal should show:
```
[CHAT][NHẬN] ✅ Updated user 1 status to 'online'
[CHAT][GỬI] ✅ Broadcasted user 1 online status
```

On disconnect:
```
[CHAT][NHẬN] ✅ Updated user 1 status to 'offline'
[CHAT][GỬI] ✅ Broadcasted user 1 offline status
```

## 🐛 Troubleshooting

### Status Not Changing
1. **Check logs in browser console (F12)**
   - Should see `[USER_STATUS_CHANGED]` messages
   - If not, check if socket is connected

2. **Check backend logs**
   - Should see `Updated user X status to 'online'`
   - If not, check if join event is being received

3. **Refresh browser**
   - Sometimes client needs refresh to see changes

### Status Shows But Doesn't Update
1. **Check if Socket.IO is connected**
   - Open DevTools → Network tab → WS (WebSocket)
   - Should see active socket connection

2. **Check if JavaScript errors**
   - DevTools → Console → Red errors?
   - Fix errors first

3. **Restart everything**
   ```bash
   # Terminal 1: Backend
   cd server && python app.py
   
   # Terminal 2: Frontend  
   cd client && npm start
   ```

### Status Updates But Not Visible in UI
1. **Check if contact list shows status**
   - Contact list should show 🟢 Online or ⚪ Offline next to name

2. **Check if chat header shows status**
   - When chatting, header should show status

3. **Try different tab**
   - Switch between "Conversations" and "Contacts" tabs
   - Status should update in both

## 📊 Status Display Locations

Where online/offline status is shown:

1. **Contact List**
   - Click "Liên hệ" (Contacts) tab
   - Each contact shows 🟢 Online or ⚪ Offline

2. **Conversation List**
   - Click "Đoạn hội thoại" (Conversations) tab
   - Below each user's last message shows status

3. **Chat Header**
   - When chatting with someone
   - Top right shows their status

4. **Friend Suggestions**
   - When viewing suggested friends
   - Status shown next to each person

## 🎓 Understanding the Flow

### When User Logs In:
```
1. User fills login form
2. Clicks "Đăng nhập" (Login)
3. Backend authenticates, sends token
4. Frontend stores token
5. Frontend joins socket
6. Socket emits 'join' event with user_id
7. Backend marks user as 'online' in database
8. Backend broadcasts 'user_status_changed' event
9. ALL other users receive event
10. ALL users update that person's status to 🟢 Online
```

### When User Logs Out/Disconnects:
```
1. User clicks logout OR closes browser
2. Socket disconnects
3. Backend receives 'disconnect' event
4. Backend marks user as 'offline' in database
5. Backend broadcasts 'user_status_changed' event
6. ALL other users receive event
7. ALL users update that person's status to ⚪ Offline
```

## 📝 Test Report Template

When testing, record results:

```
Test Date: _______________
Tester: _______________

Test 1: Login = Online
Result: [ ] PASS [ ] FAIL
Notes: _______________

Test 2: Logout = Offline  
Result: [ ] PASS [ ] FAIL
Notes: _______________

Test 3: Close Browser = Offline
Result: [ ] PASS [ ] FAIL
Notes: _______________

Test 4: Internet Loss = Offline
Result: [ ] PASS [ ] FAIL
Notes: _______________

Test 5: Multiple Logins
Result: [ ] PASS [ ] FAIL
Notes: _______________

Test 6: Chat While Online
Result: [ ] PASS [ ] FAIL
Notes: _______________

Overall Result: [ ] ALL PASS [ ] SOME FAIL

Issues Found: _______________
```

## ✅ Success Criteria

All of these should be true:

- [ ] Users show 🟢 Online when logged in
- [ ] Users show ⚪ Offline when logged out
- [ ] Status changes show in real-time
- [ ] No page refresh needed to see status
- [ ] All connected users see the same status
- [ ] Status persists in database
- [ ] Works with multiple browser tabs
- [ ] Works when user loses internet
- [ ] Console shows `[USER_STATUS_CHANGED]` events

---

**Ready to test!** 🚀

If you encounter issues, check:
1. Backend running? `ps aux | grep python`
2. Frontend running? `ps aux | grep npm`
3. Socket connected? DevTools → Network → WS
4. No JavaScript errors? DevTools → Console
5. Database has status field? (Already exists)

Good luck! 🎉
