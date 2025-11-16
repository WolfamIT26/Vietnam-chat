from flask import Blueprint, request, jsonify
from services.otp_service import send_otp, reset_password

auth_forgot_bp = Blueprint('auth_forgot', __name__, url_prefix='/forgot-password')


@auth_forgot_bp.route('', methods=['POST'])
def forgot_password():
    data = request.get_json() or {}
    contact = data.get('contact') or data.get('username')
    if not contact:
        return jsonify({'error': 'Missing contact (email or phone)'}), 400
    result = send_otp(contact)
    return jsonify(result), (200 if result.get('success') else 400)


@auth_forgot_bp.route('/reset', methods=['POST'])
def reset():
    data = request.get_json() or {}
    contact = data.get('contact') or data.get('username')
    otp = data.get('otp')
    new_password = data.get('new_password')
    if not contact or not otp or not new_password:
        return jsonify({'error': 'Missing fields'}), 400
    result = reset_password(contact, otp, new_password)
    return jsonify(result), (200 if result.get('success') else 400)


@auth_forgot_bp.route('/verify', methods=['POST'])
def verify_otp():
    """Verify OTP code endpoint: expects { contact, otp }"""
    data = request.get_json() or {}
    contact = data.get('contact') or data.get('username')
    otp = data.get('otp')
    if not contact or not otp:
        return jsonify({'error': 'Missing fields'}), 400

    # Use reset_password's internal check logic by calling into otp_service
    from services.otp_service import _verify_otp
    try:
        ok = _verify_otp(contact, otp)
    except Exception:
        ok = False

    if not ok:
        return jsonify({'success': False, 'error': 'Invalid or expired OTP'}), 400
    return jsonify({'success': True}), 200
