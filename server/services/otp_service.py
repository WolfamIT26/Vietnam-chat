import random
from models.user_model import User
from config.database import db
from werkzeug.security import generate_password_hash

# In-memory OTP storage fallback (when Redis is not available)
otp_storage = {}

def send_otp(contact):
    """
    Send OTP to a contact which can be:
    - an existing username (treated as email/username)
    - an email address
    - a phone number

    For now this function will store the OTP in Redis (or in-memory fallback)
    and print the OTP to server logs. If SMTP or Zalo integration is configured
    it can be wired here; currently we just log the delivery method.
    """
    import redis
    from flask import current_app
    # Determine delivery method
    is_email = False
    is_phone = False
    if isinstance(contact, str) and '@' in contact and '.' in contact:
        is_email = True
    else:
        # treat digit-heavy strings as phone numbers
        digits = ''.join([c for c in (contact or '') if c.isdigit()])
        if len(digits) >= 7:
            is_phone = True

    # Try to find a user by username or phone_number
    user = User.query.filter((User.username == contact) | (User.phone_number == contact)).first()
    if not user:
        return {'success': False, 'error': 'User not found'}

    otp = str(random.randint(100000, 999999))

    # Try to use Redis, fallback to in-memory storage
    try:
        r = redis.Redis.from_url(current_app.config['REDIS_URL'])
        r.setex(f'otp:{contact}', current_app.config.get('OTP_EXPIRE_SECONDS', 300), otp)
        print(f"[OTP] OTP for {contact} stored in Redis: {otp}")
    except Exception as e:
        otp_storage[contact] = otp
        print(f"[OTP] Redis unavailable, using in-memory storage. OTP for {contact}: {otp}")
        print(f"[WARNING] Redis connection failed: {e}")

    # Delivery: in dev we just print. Hook email/SMS/Zalo here.
    if is_email:
        print(f"[DELIVERY] Would send OTP to email {contact}: {otp}")
        # Optionally: implement SMTP send if configured
    elif is_phone:
        print(f"[DELIVERY] Would send OTP via Zalo/SMS to {contact}: {otp}")
    else:
        print(f"[DELIVERY] Unknown contact type for {contact}, OTP: {otp}")

    return {'success': True, 'message': 'OTP sent'}


def _verify_otp(contact, otp):
    """Internal helper to verify an OTP. Returns True if valid."""
    import redis
    from flask import current_app
    real_otp = None
    try:
        r = redis.Redis.from_url(current_app.config['REDIS_URL'])
        real_otp = r.get(f'otp:{contact}')
        if real_otp:
            real_otp = real_otp.decode()
    except Exception:
        real_otp = otp_storage.get(contact)

    return bool(real_otp and otp == real_otp)

def reset_password(contact, otp, new_password):
    import redis
    from flask import current_app

    # Try to get OTP from Redis first, then fallback to in-memory storage
    real_otp = None
    try:
        r = redis.Redis.from_url(current_app.config['REDIS_URL'])
        real_otp = r.get(f'otp:{contact}')
        if real_otp:
            real_otp = real_otp.decode()
    except Exception:
        real_otp = otp_storage.get(contact)

    if not real_otp or otp != real_otp:
        return {'success': False, 'error': 'Invalid OTP'}

    # Find user by username or phone_number
    user = User.query.filter((User.username == contact) | (User.phone_number == contact)).first()
    if not user:
        return {'success': False, 'error': 'User not found'}

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()

    # Clean up OTP
    try:
        r = redis.Redis.from_url(current_app.config['REDIS_URL'])
        r.delete(f'otp:{contact}')
    except Exception:
        if contact in otp_storage:
            del otp_storage[contact]

    return {'success': True, 'message': 'Password reset'}
