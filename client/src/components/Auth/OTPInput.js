import React, { useEffect, useRef, useState } from 'react';

/**
 * OTPInput - reusable 6-digit OTP input
 * Features:
 * - 6 separate inputs
 * - auto-advance and backspace behavior
 * - support paste of full code
 * - exposes current value via onChange
 */
const OTPInput = ({ length = 6, value: propValue = '', onChange }) => {
  const [values, setValues] = useState(() => {
    const arr = Array(length).fill('');
    for (let i = 0; i < Math.min(propValue.length, length); i++) arr[i] = propValue[i];
    return arr;
  });

  const inputs = useRef([]);

  useEffect(() => {
    // sync external value -> internal
    if (propValue && propValue.length === length) {
      const arr = propValue.split('').slice(0, length);
      setValues(arr);
    }
  }, [propValue, length]);

  useEffect(() => {
    onChange && onChange(values.join(''));
  }, [values, onChange]);

  const focusAt = (idx) => {
    const el = inputs.current[idx];
    if (el) el.focus();
  };

  const handleChange = (e, idx) => {
    const v = e.target.value.replace(/[^0-9]/g, '');
    if (!v) {
      // clear this digit
      const nv = [...values]; nv[idx] = '';
      setValues(nv);
      return;
    }

    // if user pasted multiple digits into one box, distribute them
    const chars = v.split('');
    const nv = [...values];
    for (let i = 0; i < chars.length && idx + i < length; i++) {
      nv[idx + i] = chars[i];
    }
    setValues(nv);

    const next = idx + chars.length;
    if (next < length) focusAt(next);
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace') {
      if (values[idx]) {
        const nv = [...values]; nv[idx] = '';
        setValues(nv);
      } else if (idx > 0) {
        focusAt(idx - 1);
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      focusAt(idx - 1);
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      focusAt(idx + 1);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text');
    const digits = paste.replace(/\D/g, '').slice(0, length);
    if (!digits) return;
    const nv = Array(length).fill('');
    for (let i = 0; i < digits.length; i++) nv[i] = digits[i];
    setValues(nv);
    // focus first empty
    const firstEmpty = nv.findIndex((c) => !c);
    focusAt(firstEmpty === -1 ? length - 1 : firstEmpty);
  };

  return (
    <div className="otp-input" style={{ display: 'flex', gap: '8px' }} onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={values[i] || ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          style={{ width: 40, height: 48, textAlign: 'center', fontSize: 18 }}
        />
      ))}
    </div>
  );
};

export default OTPInput;
