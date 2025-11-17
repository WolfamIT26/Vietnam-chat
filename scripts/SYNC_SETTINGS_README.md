# Sync Settings Script

Python script để sync settings từ backup hoặc backup settings hiện tại.

## Requirements

```bash
pip install requests
```

## Usage

### Sync Settings từ Backup File

```bash
python sync_settings.py \
  --user-id 123 \
  --action sync \
  --backup-file my_settings.json \
  --base-url http://localhost:3001 \
  --token your_auth_token
```

### Backup Settings hiện tại

```bash
python sync_settings.py \
  --user-id 123 \
  --action backup \
  --output-file settings_backup.json \
  --base-url http://localhost:3001 \
  --token your_auth_token
```

## Example Backup File Format

```json
{
  "general": {
    "language": "vi",
    "autoDownloadMedia": true,
    "saveToGallery": false,
    "fontSize": "large"
  },
  "privacy": {
    "lastSeen": "contacts",
    "profilePhoto": "everyone",
    "about": "everyone",
    "readReceipts": true,
    "groupsAddMe": "contacts"
  },
  "notifications": {
    "messageNotifications": true,
    "messageSound": true,
    "messageVibrate": false
  },
  "calls": {
    "videoEnabled": true,
    "audioEnabled": true,
    "lowDataMode": false
  },
  "appearance": {
    "theme": "dark",
    "chatWallpaper": "gradient1",
    "bubbleStyle": "rounded"
  }
}
```

## Use Cases

1. **Migrate Settings Between Accounts**
2. **Restore Settings After Reset**
3. **Bulk Update Settings**
4. **Automated Backup (Cron Job)**

## Cron Job Example

```bash
# Backup settings daily at 2 AM
0 2 * * * cd /path/to/scripts && python sync_settings.py --user-id 123 --action backup --output-file backups/settings_$(date +\%Y\%m\%d).json --base-url http://localhost:5000 --token TOKEN
```

## Notes

- Script is independent - doesn't modify server code
- Uses same API endpoints as frontend
- Supports retry logic (built into requests)
- Works with both mock server and production
