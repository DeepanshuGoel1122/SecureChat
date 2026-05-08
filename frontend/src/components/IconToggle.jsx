import React from 'react';

const IconToggle = ({ isEnabled, onToggle, onIcon, offIcon, onColor = 'var(--success)', offColor = '#333' }) => {
  return (
    <div 
      onClick={onToggle}
      style={{ 
        width: '44px', 
        height: '22px', 
        background: isEnabled ? onColor : offColor, 
        borderRadius: '12px', 
        position: 'relative', 
        cursor: 'pointer', 
        transition: 'background 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        padding: '2px'
      }}
    >
      <div style={{ 
        width: '18px', 
        height: '18px', 
        background: 'white', 
        borderRadius: '50%', 
        position: 'absolute', 
        left: isEnabled ? '24px' : '2px', 
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        transform: isEnabled ? 'rotate(0deg)' : 'rotate(-30deg)'
      }}>
        {isEnabled ? onIcon : offIcon}
      </div>
    </div>
  );
};

export default IconToggle;
