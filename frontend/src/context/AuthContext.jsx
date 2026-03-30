import React, { createContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';

export const AuthContext = createContext();

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
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    }
  }, [token]);

  // Handle global socket connection when user logs in
  useEffect(() => {
    if (user?.id) {
      const newSocket = io('https://securechat-u1nk.onrender.com');
      setSocket(newSocket);

      newSocket.emit('user_online', user.id);

      newSocket.on('online_users', (users) => {
        setOnlineUsers(users);
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
