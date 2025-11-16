from config.database import db
from datetime import datetime
import json


class ContactSync(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    contacts_json = db.Column(db.Text, default='[]')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

    def get_contacts(self):
        try:
            return json.loads(self.contacts_json or '[]')
        except Exception:
            return []

    def set_contacts(self, contacts):
        self.contacts_json = json.dumps(contacts)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'contacts': self.get_contacts(),
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
