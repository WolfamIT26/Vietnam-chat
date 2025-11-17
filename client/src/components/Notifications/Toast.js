import React from 'react';

const Toast = ({ toast, onClose }) => {
  const { title, message, variant, icon } = toast;

  if (variant === 'success') {
    return (
      <div style={{
        background: '#ecfdf5',
        color: '#065f46',
        padding: '12px 16px',
        borderRadius: 10,
        boxShadow: '0 8px 20px rgba(6,95,70,0.08)',
        marginBottom: 10,
        minWidth: 300,
        maxWidth: 480,
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{width:44,height:44,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:22,background:'#10b981',color:'#fff',fontSize:18,fontWeight:700,boxShadow:'inset 0 -2px 0 rgba(0,0,0,0.06)'}}>{icon || '✓'}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700, marginBottom:4}}>{title || 'Thành công'}</div>
          {message ? <div style={{fontSize:13,color:'#064e3b'}}>{message}</div> : null}
        </div>
        <button onClick={() => onClose(toast.id)} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#065f46', cursor: 'pointer', fontSize:16 }}>✕</button>
      </div>
    );
  }

  return (
    <div style={{
      background: 'rgba(30,30,30,0.95)',
      color: 'white',
      padding: '10px 14px',
      borderRadius: 8,
      boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
      marginBottom: 10,
      minWidth: 260,
      maxWidth: 420,
      fontSize: 13,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <button onClick={() => onClose(toast.id)} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#ddd', cursor: 'pointer' }}>✕</button>
      </div>
      {message ? <div style={{ marginTop: 6 }}>{message}</div> : null}
    </div>
  );
};

export default Toast;
