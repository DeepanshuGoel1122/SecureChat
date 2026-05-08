import React, { createContext, useState, useEffect, useRef } from 'react';
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
  const [showDisabledModal, setShowDisabledModal] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [timeoutMessage, setTimeoutMessage] = useState('');
  const [recentNotification, setRecentNotification] = useState(null);
  const notificationTouchStartXRef = useRef(null);
  const isNotificationSwipeCloseRef = useRef(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      const storedUser = localStorage.getItem('user');
      if (storedUser) setUser(JSON.parse(storedUser));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('lastActiveTime');
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    if (!recentNotification?.id) return undefined;

    const timeoutId = setTimeout(() => {
      setRecentNotification((prev) => (prev?.id === recentNotification.id ? null : prev));
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [recentNotification?.id]);

  // Inactivity Timeout Enforcer (3 Hours)
  useEffect(() => {
    if (!token) return;

    const INACTIVITY_LIMIT = 3 * 60 * 60 * 1000; // 3 hours

    const checkInactivity = () => {
      const lastActive = localStorage.getItem('lastActiveTime');
      // Only proceed if autoLogoutEnabled is NOT explicitly false
      if (user?.autoLogoutEnabled !== false && lastActive && Date.now() - parseInt(lastActive, 10) > INACTIVITY_LIMIT) {
        const minutes = Math.round(INACTIVITY_LIMIT / 60000);
        const seconds = Math.round(INACTIVITY_LIMIT / 1000);
        setTimeoutMessage(`Session expired due to ${minutes > 0 ? minutes + ' hours' : seconds + ' seconds'} of inactivity. Please login again for security.`);
        setShowTimeoutModal(true);
        logout();
      }
    };

    let lastUpdate = Date.now();
    const updateActivity = () => {
      const now = Date.now();
      // Update check: every 2 seconds for short limits, 5 for long ones
      if (now - lastUpdate > (INACTIVITY_LIMIT < 60000 ? 1000 : 5000)) { 
        localStorage.setItem('lastActiveTime', now.toString());
        lastUpdate = now;
      }
    };

    checkInactivity();
    // Check more frequently for short test limits
    const interval = setInterval(checkInactivity, INACTIVITY_LIMIT < 60000 ? 2000 : 60000); 

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
  }, [token, user?.autoLogoutEnabled]);

  // Base64 to Uint8Array helper for VAPID key
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const enablePushNotifications = async (silent = false) => {
    if (!user?.id || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      if (!silent) alert("Push notifications are not supported in your current browser.");
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (!silent) alert("Notification permissions denied by user.");
        return false;
      }

      const register = await navigator.serviceWorker.register('/sw.js');
      const readyReg = await navigator.serviceWorker.ready;
      
      let subscription = await readyReg.pushManager.getSubscription();
      
      if (!subscription) {
        const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        subscription = await readyReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }
      
      // Send subscription to backend
      await fetch(`${import.meta.env.VITE_API_URL}/api/users/subscribe`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ userId: user.id, subscription })
      });
      setPushEnabled(true);
      return true;
    } catch (err) {
      console.error('Push registration error:', err);
      return false;
    }
  };

  const disablePushNotifications = async () => {
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
         const readyReg = await navigator.serviceWorker.ready;
         const subscription = await readyReg.pushManager.getSubscription();
         if (subscription) {
           await subscription.unsubscribe();
         }
      }
      setPushEnabled(false);
      await fetch(`${import.meta.env.VITE_API_URL}/api/users/unsubscribe`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ userId: user.id })
      });
    } catch (err) {
      console.error('Push unregistration error:', err);
    }
  };

  // Push Notification Setup (Silent check on load if already granted)
  useEffect(() => {
    if (user?.id && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setPushEnabled(!!sub);
        if (sub && Notification.permission === 'granted') {
           enablePushNotifications(true).catch(() => {});
        }
      }).catch(() => {});
    }
  }, [user?.id]);

  // Handle global socket connection when user logs in
  useEffect(() => {
    if (user?.id) {
      const newSocket = io(import.meta.env.VITE_API_URL);
      setSocket(newSocket);

      const getDeviceType = () => {
        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet';
        if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return 'mobile';
        return 'desktop';
      };

      newSocket.emit('user_online', { 
        userId: user.id, 
        deviceType: getDeviceType(),
        isSuperAdminSession: user.isSuperAdminSession
      });

      newSocket.on('online_users', (users) => {
        setOnlineUsers(users);
      });
      
      newSocket.on('receive_message', (data) => {
        if (data.receiver._id === user.id) {
          playNotificationSound();
          
          // Show in-app notification if we're not currently looking at this chat
          // Note: The specific ChatRoom component will set activeChatId on the server
          // and the server will handle actual Push Notifications. 
          // Here we show a visual toast for immediate feedback if the user is online.
          setRecentNotification({
            id: Date.now(),
            title: data.sender.username,
            body: data.text || (data.imageUrl ? 'Sent an image' : (data.imageUrls?.length > 0 ? 'Sent images' : (data.file ? 'Sent a file' : 'Sent a message'))),
            friendId: data.sender._id
          });
        }
      });

      newSocket.on('account_disabled', () => {
        setShowDisabledModal(true);
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
    localStorage.setItem('lastActiveTime', Date.now().toString());
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('lastActiveTime');
  };

  const updateUser = (updates) => {
    setUser(prev => {
      const merged = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(merged));
      return merged;
    });
  };

  const handleNotificationTouchStart = (e) => {
    if (!e.touches?.length) return;
    notificationTouchStartXRef.current = e.touches[0].clientX;
    isNotificationSwipeCloseRef.current = false;
  };

  const handleNotificationTouchEnd = (e) => {
    const startX = notificationTouchStartXRef.current;
    if (startX == null || !e.changedTouches?.length) return;

    const endX = e.changedTouches[0].clientX;
    const diffX = endX - startX;

    if (Math.abs(diffX) > 55) {
      isNotificationSwipeCloseRef.current = true;
      setRecentNotification(null);
    }

    notificationTouchStartXRef.current = null;
  };

  const handleNotificationClick = () => {
    if (isNotificationSwipeCloseRef.current) {
      isNotificationSwipeCloseRef.current = false;
      return;
    }
    if (!recentNotification?.friendId) return;
    window.location.href = `/chat/${recentNotification.friendId}`;
    setRecentNotification(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, socket, onlineUsers, updateUser, pushEnabled, enablePushNotifications, disablePushNotifications }}>
      {children}
      {recentNotification && (
        <div 
          className="notification-toast"
          onClick={handleNotificationClick}
          onTouchStart={handleNotificationTouchStart}
          onTouchEnd={handleNotificationTouchEnd}
        >
          <div className="notification-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div className="notification-content">
            <div className="notification-title">{recentNotification.title}</div>
            <div className="notification-body">{recentNotification.body}</div>
          </div>
          <button 
            className="notification-close"
            onClick={(e) => { e.stopPropagation(); setRecentNotification(null); }}
          >
            ×
          </button>
        </div>
      )}

      {showDisabledModal && (
        <div 
          className="sidebar-overlay" 
          style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            background: 'var(--modal-backdrop)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '1.5rem'
          }}
        >
          <div 
            className="glass-panel" 
            style={{ 
              width: '100%', 
              maxWidth: '400px', 
              textAlign: 'center',
              border: '1px solid rgba(248, 81, 73, 0.3)',
              boxShadow: 'var(--modal-shadow)',
              animation: 'fadeIn 0.4s ease-out'
            }}
          >
             <div style={{ 
               fontSize: '3.5rem', 
               marginBottom: '1rem',
               filter: 'drop-shadow(0 0 10px rgba(248, 81, 73, 0.4))'
             }}>🛡️</div>
             
             <h2 style={{ 
               color: 'var(--danger)', 
               margin: '0 0 1rem 0', 
               fontSize: '1.5rem', 
               fontWeight: '900',
               letterSpacing: '0.05em'
             }}>ACCESS TERMINATED</h2>
             
             <p style={{ 
               color: 'var(--text-primary)', 
               fontSize: '0.95rem', 
               lineHeight: '1.6',
               marginBottom: '2rem',
               opacity: 0.9
             }}>
               Your account has been deactivated by security administrators. 
               All active sessions have been terminated.
             </p>
             
             <button 
               className="btn" 
               style={{ 
                 width: '100%', 
                 padding: '0.8rem', 
                 background: 'linear-gradient(135deg, #f85149, #991b1b)',
                 fontSize: '1rem',
                 fontWeight: 'bold',
                 boxShadow: '0 4px 15px rgba(248, 81, 73, 0.3)'
               }}
               onClick={() => {
                 setShowDisabledModal(false);
                 logout();
               }}
             >
               ACKNOWLEDGE
             </button>
          </div>
        </div>
      )}

      {showTimeoutModal && (
        <div 
          className="sidebar-overlay" 
          style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            background: 'var(--modal-backdrop)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '1.5rem'
          }}
        >
          <div 
            className="glass-panel" 
            style={{ 
              width: '100%', 
              maxWidth: '400px', 
              textAlign: 'center',
              border: '1px solid rgba(88, 166, 255, 0.3)',
              boxShadow: 'var(--modal-shadow)',
              animation: 'fadeIn 0.4s ease-out'
            }}
          >
             <div style={{ 
               fontSize: '3.5rem', 
               marginBottom: '1rem',
               filter: 'drop-shadow(0 0 8px rgba(88, 166, 255, 0.4))'
             }}>🕒</div>
             
             <h2 style={{ 
               color: 'var(--accent)', 
               margin: '0 0 1rem 0', 
               fontSize: '1.5rem', 
               fontWeight: '900',
               letterSpacing: '0.05em'
             }}>SESSION EXPIRED</h2>
             
             <p style={{ 
               color: 'var(--text-primary)', 
               fontSize: '0.95rem', 
               lineHeight: '1.6',
               marginBottom: '2rem',
               opacity: 0.9
             }}>
               {timeoutMessage}
             </p>
             
             <button 
               className="btn" 
               style={{ 
                 width: '100%', 
                 padding: '0.8rem', 
                 background: 'linear-gradient(135deg, var(--accent), #1d4ed8)',
                 fontSize: '1rem',
                 fontWeight: 'bold',
                 boxShadow: '0 4px 15px rgba(88, 166, 255, 0.3)'
               }}
               onClick={() => {
                 setShowTimeoutModal(false);
                 // Redirection happens automatically as logout() was called earlier
               }}
             >
               LOGIN AGAIN
             </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};
