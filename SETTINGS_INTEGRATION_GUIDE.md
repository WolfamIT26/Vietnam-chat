# Settings Module - Integration Example

## Quick Integration into Existing App

### 1. Add to React Router (in App.js or main router file)

```javascript
// Import Settings component
import Settings from './components/Settings/Settings';

// Add to your routes
<Routes>
  {/* Existing routes */}
  <Route path="/chat" element={<ChatInterface />} />
  <Route path="/profile" element={<Profile />} />
  
  {/* NEW: Settings route */}
  <Route path="/settings" element={<Settings />} />
  <Route path="/settings/:section" element={<Settings />} />
</Routes>
```

### 2. Add Settings Button to Sidebar/Menu

```javascript
// In your sidebar/navigation component
import { Link } from 'react-router-dom';

function Sidebar() {
  return (
    <nav>
      <Link to="/chat">Chat</Link>
      <Link to="/profile">Profile</Link>
      {/* NEW: Settings link */}
      <Link to="/settings">⚙️ Settings</Link>
    </nav>
  );
}
```

### 3. Add to Avatar Menu (Dropdown)

```javascript
// In AvatarMenu.js or similar
function AvatarMenu({ onClose }) {
  const navigate = useNavigate();
  
  return (
    <div className="avatar-menu">
      <button onClick={() => {
        navigate('/profile');
        onClose();
      }}>Profile</button>
      
      {/* NEW: Settings option */}
      <button onClick={() => {
        navigate('/settings');
        onClose();
      }}>⚙️ Settings</button>
      
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}
```

### 4. Environment Variables Setup

Create or update `client/.env`:

```env
# For development with mock server
REACT_APP_USE_MOCK_SERVER=true
REACT_APP_MOCK_SERVER_URL=http://localhost:3001

# For production (when backend ready)
# REACT_APP_USE_MOCK_SERVER=false
# REACT_APP_API_URL=http://localhost:5000
```

### 5. Start Both Servers

Terminal 1 (Mock Server):
```bash
cd settings-mock-server
npm install
npm start
```

Terminal 2 (Frontend):
```bash
cd client
npm start
```

---

## Advanced Integration

### Deep Linking to Specific Setting

```javascript
// Link to specific settings section
<Link to="/settings/privacy">Privacy Settings</Link>
<Link to="/settings/security">Security Settings</Link>
<Link to="/settings/appearance">Appearance Settings</Link>
```

Update `Settings.js` to handle URL parameter:

```javascript
import { useParams } from 'react-router-dom';

const Settings = () => {
  const { section } = useParams();
  const [activeSection, setActiveSection] = useState(section || 'general');
  
  // ... rest of component
};
```

### Settings as Modal/Dialog

```javascript
// In parent component
const [showSettings, setShowSettings] = useState(false);

return (
  <>
    <button onClick={() => setShowSettings(true)}>
      ⚙️ Open Settings
    </button>
    
    {showSettings && (
      <div className="modal-overlay" onClick={() => setShowSettings(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <button className="close-btn" onClick={() => setShowSettings(false)}>
            ✕
          </button>
          <Settings />
        </div>
      </div>
    )}
  </>
);
```

Add modal CSS:
```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 90%;
  max-height: 90%;
  overflow: hidden;
  position: relative;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.1);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  cursor: pointer;
}
```

### Global Settings Access

```javascript
// Create a global settings context
import { createContext, useContext, useState, useEffect } from 'react';
import { getAppearanceSettings } from './components/Settings/services/settingsService';

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const [appearance, setAppearance] = useState(null);
  
  useEffect(() => {
    loadAppearanceSettings();
  }, []);
  
  const loadAppearanceSettings = async () => {
    const settings = await getAppearanceSettings();
    setAppearance(settings);
    applyTheme(settings.theme);
  };
  
  const applyTheme = (theme) => {
    // Apply theme logic
  };
  
  return (
    <SettingsContext.Provider value={{ appearance, loadAppearanceSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
```

Use in App.js:
```javascript
import { SettingsProvider } from './contexts/SettingsContext';

function App() {
  return (
    <SettingsProvider>
      <Routes>
        {/* Your routes */}
      </Routes>
    </SettingsProvider>
  );
}
```

---

## Backend Implementation Example (Python/Flask)

When ready to implement real backend:

```python
# routes/settings.py
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.user_model import User
from models.settings_model import UserSettings

settings_bp = Blueprint('settings', __name__)

@settings_bp.route('/api/settings/general', methods=['GET'])
@jwt_required()
def get_general_settings():
    user_id = get_jwt_identity()
    settings = UserSettings.get_by_user_and_category(user_id, 'general')
    
    if not settings:
        # Return defaults
        settings = {
            'language': 'en',
            'autoDownloadMedia': True,
            'saveToGallery': False,
            'fontSize': 'medium'
        }
    
    return jsonify({'success': True, 'data': settings}), 200

@settings_bp.route('/api/settings/general', methods=['PUT'])
@jwt_required()
def update_general_settings():
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Validate data
    allowed_keys = ['language', 'autoDownloadMedia', 'saveToGallery', 'fontSize']
    filtered_data = {k: v for k, v in data.items() if k in allowed_keys}
    
    # Update or create settings
    settings = UserSettings.update_or_create(
        user_id=user_id,
        category='general',
        settings=filtered_data
    )
    
    return jsonify({'success': True, 'data': settings}), 200

# Similar endpoints for privacy, notifications, calls, appearance...
```

Database model:
```python
# models/settings_model.py
from config.database import db
import json
from datetime import datetime

class UserSettings(db.Model):
    __tablename__ = 'user_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    settings = db.Column(db.Text, nullable=False)  # JSON string
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @staticmethod
    def get_by_user_and_category(user_id, category):
        record = UserSettings.query.filter_by(
            user_id=user_id, 
            category=category
        ).first()
        
        if record:
            return json.loads(record.settings)
        return None
    
    @staticmethod
    def update_or_create(user_id, category, settings):
        record = UserSettings.query.filter_by(
            user_id=user_id,
            category=category
        ).first()
        
        settings_json = json.dumps(settings)
        
        if record:
            record.settings = settings_json
            record.updated_at = datetime.utcnow()
        else:
            record = UserSettings(
                user_id=user_id,
                category=category,
                settings=settings_json
            )
            db.session.add(record)
        
        db.session.commit()
        return json.loads(record.settings)
```

Register blueprint in app.py:
```python
from routes.settings import settings_bp

app.register_blueprint(settings_bp)
```

---

## Testing Checklist

- [ ] Settings page loads without errors
- [ ] Can toggle settings and see optimistic update
- [ ] Settings persist after page reload
- [ ] Works in offline mode (queue changes)
- [ ] Syncs when back online
- [ ] Theme changes apply immediately
- [ ] Responsive on mobile (< 768px)
- [ ] Dark mode works correctly
- [ ] Password change validates properly
- [ ] Session logout works
- [ ] All 6 sections render correctly

---

## Production Deployment

1. **Backend**: Implement real endpoints
2. **Frontend**: Set `REACT_APP_USE_MOCK_SERVER=false`
3. **Database**: Create settings tables
4. **Security**: Add authentication to all endpoints
5. **Validation**: Server-side validation for all inputs
6. **Testing**: Integration tests for all endpoints
7. **Remove**: Delete `settings-mock-server/` from production build
