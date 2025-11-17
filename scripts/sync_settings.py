#!/usr/bin/env python3
"""
Settings Sync Script - Independent Python utility
Syncs settings from localStorage backup to server

Usage:
    python sync_settings.py --user-id 123 --backup-file settings_backup.json

Features:
    - Reads settings from JSON backup
    - Syncs to server with retry logic
    - Does not modify main server code
    - Can run as cron job or manual
"""

import argparse
import json
import requests
import time
import sys
from typing import Dict, Any, Optional

class SettingsSync:
    def __init__(self, base_url: str, auth_token: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.auth_token = auth_token
        self.session = requests.Session()
        
        if auth_token:
            self.session.headers.update({
                'Authorization': f'Bearer {auth_token}',
                'Content-Type': 'application/json'
            })
    
    def sync_settings(self, user_id: int, settings_data: Dict[str, Any]) -> bool:
        """Sync all settings categories to server"""
        categories = ['general', 'privacy', 'notifications', 'calls', 'appearance']
        success_count = 0
        
        for category in categories:
            if category in settings_data:
                if self._sync_category(category, settings_data[category]):
                    success_count += 1
                    print(f"✓ Synced {category} settings")
                else:
                    print(f"✗ Failed to sync {category} settings")
                
                time.sleep(0.5)  # Rate limiting
        
        print(f"\nSync complete: {success_count}/{len(categories)} categories")
        return success_count == len(categories)
    
    def _sync_category(self, category: str, data: Dict[str, Any]) -> bool:
        """Sync a single settings category"""
        endpoint = f"{self.base_url}/api/settings/{category}"
        
        try:
            response = self.session.put(endpoint, json=data, timeout=10)
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException as e:
            print(f"Error syncing {category}: {e}")
            return False
    
    def backup_settings(self, user_id: int, output_file: str) -> bool:
        """Backup current settings from server"""
        categories = ['general', 'privacy', 'notifications', 'calls', 'appearance']
        backup_data = {}
        
        for category in categories:
            endpoint = f"{self.base_url}/api/settings/{category}"
            
            try:
                response = self.session.get(endpoint, timeout=10)
                response.raise_for_status()
                result = response.json()
                backup_data[category] = result.get('data', result)
                print(f"✓ Backed up {category} settings")
            except requests.exceptions.RequestException as e:
                print(f"✗ Failed to backup {category}: {e}")
        
        if backup_data:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, indent=2, ensure_ascii=False)
            print(f"\n✓ Backup saved to {output_file}")
            return True
        
        return False
    
    def validate_settings(self, settings_data: Dict[str, Any]) -> bool:
        """Validate settings structure"""
        required_categories = ['general', 'privacy', 'notifications', 'calls', 'appearance']
        
        for category in required_categories:
            if category not in settings_data:
                print(f"Warning: Missing {category} settings")
        
        return True

def main():
    parser = argparse.ArgumentParser(description='Sync settings to server')
    parser.add_argument('--user-id', type=int, required=True, help='User ID')
    parser.add_argument('--backup-file', type=str, help='Settings backup JSON file')
    parser.add_argument('--output-file', type=str, help='Output file for backup')
    parser.add_argument('--base-url', type=str, default='http://localhost:5000', 
                        help='Server base URL')
    parser.add_argument('--token', type=str, help='Authentication token')
    parser.add_argument('--action', type=str, choices=['sync', 'backup'], 
                        default='sync', help='Action to perform')
    
    args = parser.parse_args()
    
    syncer = SettingsSync(args.base_url, args.token)
    
    if args.action == 'sync':
        if not args.backup_file:
            print("Error: --backup-file required for sync action")
            sys.exit(1)
        
        try:
            with open(args.backup_file, 'r', encoding='utf-8') as f:
                settings_data = json.load(f)
            
            if syncer.validate_settings(settings_data):
                print(f"Syncing settings for user {args.user_id}...\n")
                success = syncer.sync_settings(args.user_id, settings_data)
                sys.exit(0 if success else 1)
        except FileNotFoundError:
            print(f"Error: File {args.backup_file} not found")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in {args.backup_file}: {e}")
            sys.exit(1)
    
    elif args.action == 'backup':
        if not args.output_file:
            print("Error: --output-file required for backup action")
            sys.exit(1)
        
        print(f"Backing up settings for user {args.user_id}...\n")
        success = syncer.backup_settings(args.user_id, args.output_file)
        sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
