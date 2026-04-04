import React, { createContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';

export const AuthContext = createContext();

const playNotificationSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (err) {
    console.log('Audio play failed:', err);
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      const storedUser = localStorage.getItem('user');
      if (storedUser) setUser(JSON.parse(storedUser));
      localStorage.setItem('lastActiveTime', Date.now().toString());
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('lastActiveTime');
      setUser(null);
    }
  }, [token]);

  // Inactivity Timeout Enforcer (3 Hours)
  useEffect(() => {
    if (!token) return;

    const INACTIVITY_LIMIT = 3 * 60 * 60 * 1000; // 3 hours

    const checkInactivity = () => {
      const lastActive = localStorage.getItem('lastActiveTime');
      if (lastActive && Date.now() - parseInt(lastActive, 10) > INACTIVITY_LIMIT) {
        logout();
        alert('Session expired due to 3 hours of inactivity. Please login again for security.');
      }
    };

    let lastUpdate = Date.now();
    const updateActivity = () => {
      const now = Date.now();
      if (now - lastUpdate > 5000) { 
        localStorage.setItem('lastActiveTime', now.toString());
        lastUpdate = now;
      }
    };

    checkInactivity();
    const interval = setInterval(checkInactivity, 60000); 

    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('scroll', updateActivity);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('scroll', updateActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token]);

  // Handle global socket connection when user logs in
  useEffect(() => {
    if (user?.id) {
      const newSocket = io('https://securechat-flwx.onrender.com');
      setSocket(newSocket);

      newSocket.emit('user_online', user.id);

      newSocket.on('online_users', (users) => {
        setOnlineUsers(users);
      });
      
      newSocket.on('receive_message', (data) => {
        if (data.receiver._id === user.id) {
          playNotificationSound();
        }
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [user]);

  const login = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, socket, onlineUsers }}>
      {children}
    </AuthContext.Provider>
  );
};
