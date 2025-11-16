from flask import Blueprint, request, jsonify
from models.user_model import User

check_username_bp = Blueprint('auth_check_username', __name__)

@check_username_bp.route('/auth/check-username', methods=['GET'])
@check_username_bp.route('/check-username', methods=['GET'])
def check_username():
    username = request.args.get('username')
    if not username:
        return jsonify({'error': 'username required'}), 400
    exists = User.query.filter_by(username=username).first() is not None
    return jsonify({'exists': exists}), 200
