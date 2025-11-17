import React from 'react';

const SettingToggle = ({ label, description, checked, onChange, disabled }) => {
  return (
    <div className="setting-item setting-toggle">
      <div className="setting-info">
        <div className="setting-label">{label}</div>
        {description && <div className="setting-description">{description}</div>}
      </div>
      <label className="toggle-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        <span className="toggle-slider"></span>
      </label>
    </div>
  );
};

export default SettingToggle;
