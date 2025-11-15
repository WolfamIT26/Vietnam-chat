#!/usr/bin/env python3
"""
Migration script to add file_url column to Message table
Run this if your database doesn't have the file_url column yet
"""
import sys
sys.path.insert(0, '/Users/melaniepham/Documents/Viet/HK1 Năm 3/CUOI KY/Vietnam Chat/server')

from app import app, db
from sqlalchemy import inspect

with app.app_context():
    # Check if file_url column exists
    inspector = inspect(db.engine)
    columns = [col['name'] for col in inspector.get_columns('message')]
    
    if 'file_url' not in columns:
        print("Adding file_url column to message table...")
        with db.engine.connect() as conn:
            conn.execute(db.text('ALTER TABLE message ADD COLUMN file_url VARCHAR(500)'))
            conn.commit()
        print("✅ file_url column added successfully!")
    else:
        print("✅ file_url column already exists!")
