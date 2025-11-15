from config.database import db
from datetime import datetime

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=True)
    content = db.Column(db.Text, nullable=False)
    file_url = db.Column(db.String(500), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    sender = db.relationship('User', foreign_keys=[sender_id], backref='sent_messages')
    receiver = db.relationship('User', foreign_keys=[receiver_id], backref='received_messages')
    group = db.relationship('Group', foreign_keys=[group_id], backref='group_messages')

    def __repr__(self):
        return f'<Message {self.id}>'

