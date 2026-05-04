import React, { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === 'dark';

  return (
    <div 
      onClick={toggleTheme}
      style={{ 
        width: '44px', 
        height: '22px', 
        background: isDark ? '#333' : 'var(--accent)', 
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
        left: isDark ? '2px' : '20px', 
        transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }}>
        {isDark ? '🌙' : '☀️'}
      </div>
    </div>
  );
};

export default ThemeToggle;
