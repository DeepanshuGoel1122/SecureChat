import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ProfileEditModal from '../components/ProfileEditModal';
import UserProfileViewModal from '../components/UserProfileViewModal';

function Dashboard() {
  const [friends, setFriends] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingChangePassword, setLoadingChangePassword] = useState(false);
  const [isFriendsLoading, setIsFriendsLoading] = useState(false);
  
  const [deleteConfirm, setDeleteConfirm] = useState({ friendId: null, step: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });
  
  // Delete Account Modal state
  const [deleteModal, setDeleteModal] = useState({ open: false, step: 1, password: '', error: '', loading: false });

  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [viewedProfile, setViewedProfile] = useState(null);
  
  // Accordion state - track which sections are expanded
  const [expandedSections, setExpandedSections] = useState({
    friends: true,
    incoming: true,
    sent: false,
    blocked: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  
  const profileMenuRef = useRef(null);
  
  const navigate = useNavigate();
  const { user, logout, socket, onlineUsers, updateUser, pushEnabled, enablePushNotifications, disablePushNotifications } = useContext(AuthContext);

  const handleTogglePushNotifications = async () => {
    if (pushEnabled) {
      await disablePushNotifications();
    } else {
      await enablePushNotifications();
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (deleteModal.open) {
          setDeleteModal(prev => ({ ...prev, open: false }));
        } else if (isChangePasswordOpen) {
          setIsChangePasswordOpen(false);
          setPasswordMessage({ text: '', type: '' });
        } else if (isProfileMenuOpen) {
          setIsProfileMenuOpen(false);
        } else if (isProfileEditOpen) {
          // If first setup, we might want to prevent closing, let's check
          if (user?.isProfileSetup !== false || sessionStorage.getItem('skipProfileSetup')) {
            setIsProfileEditOpen(false);
          }
        } else if (viewedProfile) {
          setViewedProfile(null);
        } else if (isSidebarOpen && window.innerWidth <= 768) {
          setIsSidebarOpen(false);
        } else if (deleteConfirm.friendId) {
          setDeleteConfirm({ friendId: null, step: 0 });
        }
      }
    };
    
    // Click outside listener for profile menu
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
        // Also close change password if it was open inside the menu
        if (isChangePasswordOpen) {
          setIsChangePasswordOpen(false);
          setPasswordMessage({ text: '', type: '' });
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [deleteModal.open, isChangePasswordOpen, isProfileMenuOpen, isSidebarOpen, deleteConfirm, isProfileEditOpen, viewedProfile, user]);

  useEffect(() => {
    if (user) {
      if (user.role === 'admin') {
        navigate('/admin');
        return;
      }
      if (!user.id) {
        logout();
        navigate('/login');
        return;
      }
      fetchFriends();
      fetchUnreadCounts();
      
      if (user.isProfileSetup === false && !sessionStorage.getItem('skipProfileSetup')) {
        setIsProfileEditOpen(true);
      }
    }
  }, [user, navigate]);

  useEffect(() => {
    if (socket) {
      const handleIncoming = (data) => {
        if (data.receiver._id === user.id) {
          fetchUnreadCounts(); 
          fetchFriends(); 
        }
      };
      
      const handleFriendReq = () => {
        console.log('Incoming friend request received via socket!');
        fetchFriends();
      };
      
      socket.on('receive_message', handleIncoming);
      socket.on('friend_request_received', handleFriendReq);
      
      return () => {
        socket.off('receive_message', handleIncoming);
        socket.off('friend_request_received', handleFriendReq);
      };
    }
  }, [socket, user]);

  const fetchFriends = async () => {
    setIsFriendsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/friends/${user.id}`);
      const data = await res.json();
      setFriends(data.friends || []);
      setActiveChats(data.activeChats || []);
      setSentRequests(data.sentRequests || []);
      setReceivedRequests(data.receivedRequests || []);
      setBlockedUsers(data.blockedUsers || []);
    } catch (err) {
      console.error('Error fetching data', err);
    } finally {
      setIsFriendsLoading(false);
    }
  };

  const fetchUnreadCounts = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/unread/${user.id}`);
      const data = await res.json();
      setUnreadCounts(data || {});
    } catch (err) {}
  };

  const searchUsers = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setHasSearched(false);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/search?q=${searchQuery}&userId=${user.id}`);
      const data = await res.json();
      setSearchResults(data); 
      setHasSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const executeAction = async (endpoint, payload) => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/users/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      fetchFriends();
    } catch (err) {}
  };

  const handleSendRequest = async (friendId) => {
    await executeAction('add-friend', { userId: user.id, friendId });
  };
  const handleAcceptRequest = async (requesterId) => {
    await executeAction('accept-request', { userId: user.id, requesterId });
  };
  const handleRejectRequest = async (requesterId) => {
    await executeAction('reject-request', { userId: user.id, requesterId });
  };
  const handleCancelRequest = async (receiverId) => {
    await executeAction('cancel-request', { userId: user.id, receiverId });
  };
  const handleBlockUser = async (blockId) => {
    await executeAction('block-user', { userId: user.id, blockId });
  };
  const handleUnblockUser = async (blockId) => {
    await executeAction('unblock-user', { userId: user.id, blockId });
  };

  const handleRemoveFriend = async (e, friendId) => {
    if (e?.stopPropagation) e.stopPropagation(); 
    if (!window.confirm("Are you sure you want to remove this friend?")) return;
    await executeAction('remove-friend', { userId: user.id, friendId });
  };

  const handleDeleteChat = async (e, friendId) => {
    e.stopPropagation(); 
    if (deleteConfirm.friendId !== friendId) return setDeleteConfirm({ friendId, step: 1 });
    if (deleteConfirm.step === 1) return setDeleteConfirm({ friendId, step: 2 });
    if (deleteConfirm.step === 2) {
      try {
        await fetch(`${import.meta.env.VITE_API_URL}/api/messages/history/${user.id}/${friendId}`, { method: 'DELETE' });
        setDeleteConfirm({ friendId: null, step: 0 });
        fetchFriends(); 
        fetchUnreadCounts();
      } catch (err) {}
    }
  };


  
  const handleToggleAutoLogout = async () => {
    // Treat undefined as true (default)
    const currentVal = user.autoLogoutEnabled !== false;
    const newVal = !currentVal;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/users/toggle-autologout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, autoLogoutEnabled: newVal })
      });
      updateUser({ autoLogoutEnabled: newVal });
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordForm.oldPassword || !passwordForm.newPassword) return;
    setLoadingChangePassword(true);
    setPasswordMessage({ text: '', type: '' });
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, ...passwordForm })
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordMessage({ text: data.message || 'Error changing password', type: 'error' });
      } else {
        setPasswordMessage({ text: 'Password changed successfully!', type: 'success' });
        setTimeout(() => {
           setIsChangePasswordOpen(false);
           setIsProfileMenuOpen(false);
           setPasswordForm({ oldPassword: '', newPassword: '' });
           setPasswordMessage({ text: '', type: '' });
        }, 2000);
      }
    } catch (err) {
      setPasswordMessage({ text: 'Network error', type: 'error' });
    } finally {
      setLoadingChangePassword(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteModal.password.trim()) {
      setDeleteModal(prev => ({ ...prev, error: 'Please enter your password.' }));
      return;
    }
    setDeleteModal(prev => ({ ...prev, loading: true, error: '' }));
    try {
      // Verify password first by attempting login
      const verifyRes = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, password: deleteModal.password })
      });
      if (!verifyRes.ok) {
        setDeleteModal(prev => ({ ...prev, loading: false, error: 'Incorrect password. Account deletion cancelled.' }));
        return;
      }
      // Password verified, proceed with soft delete
      await fetch(`${import.meta.env.VITE_API_URL}/api/auth/soft-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      logout();
      navigate('/login');
    } catch (err) {
      setDeleteModal(prev => ({ ...prev, loading: false, error: 'Network error. Please try again.' }));
    }
  };

  const openDeleteModal = () => {
    setIsProfileMenuOpen(false);
    setDeleteModal({ open: true, step: 1, password: '', error: '', loading: false });
  };

  return (
    <div className="dashboard-container" onClick={() => { setDeleteConfirm({ friendId: null, step: 0 }); setRemoveConfirm({ friendId: null, step: 0 }); setIsProfileMenuOpen(false); }}>
      
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(13,17,23,0.95)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--glass-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        width: '100%', padding: '0.75rem 1rem',
        boxSizing: 'border-box'
      }}>
        <h1 style={{ margin: 0, background: 'linear-gradient(to right, #58a6ff, #a371f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: 'clamp(1.1rem, 5vw, 1.75rem)', flexShrink: 0 }}>SecureChat</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minWidth: 0 }}>
          <button className="btn" style={{ position: 'relative', padding: '0.4rem 0.7rem', fontSize: '0.8rem', flexShrink: 0 }} onClick={() => setIsSidebarOpen(true)}>
            Friends +
            {receivedRequests.length > 0 && (
              <span style={{ position: 'absolute', top: '-6px', right: '-6px', width: '16px', height: '16px', background: 'var(--danger)', borderRadius: '50%', border: '2px solid rgba(13,17,23,0.95)', animation: 'pulseBadge 2s infinite' }}></span>
            )}
          </button>
          
          <div style={{ position: 'relative' }} ref={profileMenuRef}>
            <div 
              onClick={(e) => { e.stopPropagation(); setIsProfileMenuOpen(!isProfileMenuOpen); setIsChangePasswordOpen(false); setPasswordMessage({ text: '', type: '' }); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', minWidth: 0 }}
            >
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', color: 'white', flexShrink: 0, overflow: 'hidden' }}>
                {user?.profilePic ? <img src={user.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (user?.firstName ? user.firstName.charAt(0).toUpperCase() : user?.username?.charAt(0).toUpperCase())}
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.firstName || user?.username}</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>▼</span>
            </div>

            {isProfileMenuOpen && (
              <div 
                onClick={(e) => e.stopPropagation()}
                style={{ position: 'absolute', top: '100%', right: '0', marginTop: '0.4rem', width: '220px', background: 'rgba(15,15,22,0.97)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.3rem', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}
              >
                {!isChangePasswordOpen ? (
                  <>
                    <div style={{ padding: '0.6rem 0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: '500' }}>Auto-logout (3hrs)</span>
                      <div 
                        onClick={handleToggleAutoLogout}
                        style={{ 
                          width: '34px', height: '18px', 
                          background: user.autoLogoutEnabled !== false ? 'var(--success)' : '#333', 
                          borderRadius: '10px', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' 
                        }}
                      >
                        <div style={{ 
                          width: '14px', height: '14px', background: 'white', borderRadius: '50%', 
                          position: 'absolute', top: '2px', 
                          left: user.autoLogoutEnabled !== false ? '18px' : '2px', 
                          transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)' 
                        }} />
                      </div>
                    </div>
                    <div style={{ padding: '0.6rem 0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: '500' }}>Push Notifications</span>
                      <div 
                        onClick={handleTogglePushNotifications}
                        style={{ 
                          width: '34px', height: '18px', 
                          background: pushEnabled ? 'var(--success)' : '#333', 
                          borderRadius: '10px', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' 
                        }}
                      >
                        <div style={{ 
                          width: '14px', height: '14px', background: 'white', borderRadius: '50%', 
                          position: 'absolute', top: '2px', 
                          left: pushEnabled ? '18px' : '2px', 
                          transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)' 
                        }} />
                      </div>
                    </div>
                    <hr style={{ border: 'none', borderBottom: '1px solid rgba(255,255,255,0.07)', margin: '0.25rem 0.3rem' }} />
                    <button 
                      style={{ width: '100%', textAlign: 'left', padding: '0.45rem 0.7rem', border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { setIsProfileEditOpen(true); setIsProfileMenuOpen(false); }}
                    >
                      <span style={{ fontSize: '0.75rem' }}>🧑‍🎓</span> Profile Settings
                    </button>
                    <hr style={{ border: 'none', borderBottom: '1px solid rgba(255,255,255,0.07)', margin: '0.25rem 0.3rem' }} />
                    <button 
                      style={{ width: '100%', textAlign: 'left', padding: '0.45rem 0.7rem', border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => setIsChangePasswordOpen(true)}
                    >
                      <span style={{ fontSize: '0.75rem' }}>🔒</span> Change Password
                    </button>
                    <hr style={{ border: 'none', borderBottom: '1px solid rgba(255,255,255,0.07)', margin: '0.25rem 0.3rem' }} />
                    <button 
                      style={{ width: '100%', textAlign: 'left', padding: '0.45rem 0.7rem', border: 'none', background: 'transparent', color: '#ffb3b3', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,60,60,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={openDeleteModal}
                    >
                      <span style={{ fontSize: '0.75rem' }}>🗑️</span> Delete Account
                    </button>
                    <hr style={{ border: 'none', borderBottom: '1px solid rgba(255,255,255,0.07)', margin: '0.25rem 0.3rem' }} />
                    <button 
                      style={{ width: '100%', textAlign: 'left', padding: '0.45rem 0.7rem', border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,60,60,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { logout(); navigate('/login'); }}
                    >
                      <span style={{ fontSize: '0.75rem' }}>🚪</span> Logout
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleChangePassword} style={{ padding: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-primary)' }}>Change Password</span>
                      <span onClick={() => { setIsChangePasswordOpen(false); setPasswordMessage({ text: '', type: '' }); }} style={{ cursor: 'pointer', fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: '1' }}>&times;</span>
                    </div>
                    {passwordMessage.text && (
                      <div style={{ padding: '0.3rem 0.5rem', marginBottom: '0.4rem', borderRadius: '4px', fontSize: '0.72rem', background: passwordMessage.type === 'error' ? 'rgba(255,0,0,0.1)' : 'rgba(0,255,0,0.1)', color: passwordMessage.type === 'error' ? '#ffb3b3' : '#a3f7a3' }}>
                        {passwordMessage.text}
                      </div>
                    )}
                    <input 
                      type="password" 
                      placeholder="Current Password" 
                      className="input-field" 
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem', marginBottom: '0.4rem' }}
                      value={passwordForm.oldPassword}
                      onChange={e => setPasswordForm({...passwordForm, oldPassword: e.target.value})}
                      required
                    />
                    <input 
                      type="password" 
                      placeholder="New Password (min 6 chars)" 
                      className="input-field" 
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem', marginBottom: '0.4rem' }}
                      value={passwordForm.newPassword}
                      onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                      required
                    />
                    <button type="submit" className="btn" style={{ width: '100%', padding: '0.4rem', fontSize: '0.78rem' }} disabled={loadingChangePassword}>
                      {loadingChangePassword && <span className="spinner"></span>}
                      {loadingChangePassword ? 'Updating...' : 'Update'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Dashboard content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div className="glass-panel dashboard-box" style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '1rem', margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
          <h2 className="auth-title" style={{ textAlign: 'left', marginBottom: 0, fontSize: '1.25rem', background: 'none', WebkitTextFillColor: 'var(--text-primary)' }}>Your Chats</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', opacity: 0.6 }}>
             <span style={{ fontSize: '0.75rem' }}>🛡️</span>
             <span style={{ fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: '0.03em' }}>END-TO-END ENCRYPTED</span>
          </div>
        </div>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>All your conversations are secure and private.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {isFriendsLoading ? (
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <span className="spinner" style={{ borderTopColor: 'var(--accent)', marginRight: 0 }}></span>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Fetching your chats...</div>
            </div>
          ) : activeChats.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: '1rem 0' }}>No active chats. Open the Friends menu to start one!</p>
          ) : (
            activeChats.map(f => {
              const unread = unreadCounts[f._id] || 0;
              const displayName = f.firstName || f.lastName ? `${f.firstName} ${f.lastName}` : f.username;
              return (
                <div key={f._id} style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => navigate(`/chat/${f._id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1rem' }} onClick={(e) => { e.stopPropagation(); setViewedProfile({ user: f, relation: 'friend' }); }}>
                        {f.profilePic ? <img src={f.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (f.firstName ? f.firstName.charAt(0).toUpperCase() : f.username.charAt(0).toUpperCase())}
                      </div>
                      <div style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', borderRadius: '50%', background: onlineUsers.some(ou => (ou.userId || ou) === f._id) ? 'var(--success)' : 'var(--text-secondary)', boxShadow: onlineUsers.some(ou => (ou.userId || ou) === f._id) ? '0 0 5px var(--success)' : 'none', border: '2px solid rgba(13,17,23,0.95)' }}></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontWeight: '500' }}>{displayName}</span>
                       <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>@{f.username}</span>
                    </div>
                    {unread > 0 && <span style={{ background: 'var(--danger)', color: 'white', border: '1px solid transparent', borderRadius: '12px', padding: '0.1rem 0.5rem', fontSize: '0.7rem', fontWeight: 'bold', marginLeft: '0.5rem' }}>{unread}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', background: deleteConfirm.friendId === f._id && deleteConfirm.step === 2 ? 'red' : (deleteConfirm.friendId === f._id ? 'var(--danger)' : 'transparent'), color: deleteConfirm.friendId === f._id ? 'white' : 'var(--text-secondary)' }} onClick={(e) => handleDeleteChat(e, f._id)}>
                      {deleteConfirm.friendId === f._id ? (deleteConfirm.step === 2 ? 'Sure?' : 'Delete?') : '🗑️'}
                    </button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent)', marginLeft: '4px' }}>&rarr;</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      </div>

      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}>
          <div className="sidebar-content" onClick={e => e.stopPropagation()}>
            {/* Sticky top: header + search */}
            <div className="sidebar-sticky-top">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Friends &amp; Requests</h2>
                <button onClick={() => setIsSidebarOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '2rem', cursor: 'pointer', lineHeight: '1rem', padding: 0 }}>&times;</button>
              </div>
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.95rem' }}>Find Users</h3>
              <form onSubmit={searchUsers} style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Search username..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  autoCapitalize="none"
                  autoCorrect="off"
                  style={{ marginBottom: 0, flex: 1, minWidth: 0 }} 
                />
                <button type="submit" className="btn" style={{ padding: '0.5rem 0.8rem', flexShrink: 0 }}>Search</button>
              </form>
            </div>

            {/* Scrollable content */}
            <div className="sidebar-scrollable">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', minHeight: '40px' }}>
                {isSearching && (
                  <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <span className="spinner" style={{ borderTopColor: 'var(--accent)', marginRight: 0 }}></span>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Searching users...</div>
                  </div>
                )}
                {!isSearching && hasSearched && searchResults.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--danger)', textAlign: 'center', background: 'rgba(255,0,0,0.1)', borderRadius: '8px', fontSize: '0.9rem' }}>User not found.</div>}
                {!isSearching && searchResults.map(u => {
                  let relation = 'none';
                  if (friends.some(f => f._id === u._id)) relation = 'friend';
                  else if (sentRequests.some(f => f._id === u._id)) relation = 'sent';
                  else if (receivedRequests.some(f => f._id === u._id)) relation = 'received';
                  
                  return (
                  <div key={u._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', cursor: 'pointer' }} onClick={() => setViewedProfile({ user: u, relation })}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        {u.profilePic ? <img src={u.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (u.firstName ? u.firstName.charAt(0).toUpperCase() : u.username.charAt(0).toUpperCase())}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                         <span style={{ fontSize: '0.95rem' }}>{u.firstName || u.lastName ? `${u.firstName} ${u.lastName}` : u.username}</span>
                         {u.firstName && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>@{u.username}</span>}
                      </div>
                    </div>
                    {relation === 'friend' ? <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Added</span> : 
                     relation === 'sent' ? <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pending Req</span> :
                     relation === 'received' ? <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>See Below</span> :
                    <button className="btn btn-secondary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); handleSendRequest(u._id) }}>Send Request</button>}
                  </div>
                )})}
              </div>

              <hr style={{ border: 'none', borderBottom: '1px solid var(--glass-border)', marginBottom: '1rem' }} />

              {/* Accordion Container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                
                {/* Incoming Requests Section */}
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', pb: '0.5rem' }}>
                  <div 
                    onClick={() => toggleSection('incoming')}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0.5rem', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', background: expandedSections.incoming ? 'rgba(88, 166, 255, 0.05)' : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '0.8rem', transition: 'transform 0.2s', transform: expandedSections.incoming ? 'rotate(90deg)' : 'rotate(0deg)', opacity: 0.6 }}>▶</span>
                      <h3 style={{ margin: 0, fontSize: '0.95rem', color: receivedRequests.length > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        Incoming Requests
                      </h3>
                      {receivedRequests.length > 0 && (
                        <span style={{ background: 'var(--accent)', color: 'white', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', minWidth: '18px', textAlign: 'center' }}>
                          {receivedRequests.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {expandedSections.incoming && (
                    <div style={{ padding: '0.5rem 0 1rem 1.5rem', animation: 'fadeIn 0.2s' }}>
                      {receivedRequests.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem' }}>No pending requests.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {receivedRequests.map(r => (
                            <div key={r._id} style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', cursor: 'pointer' }} onClick={() => setViewedProfile({ user: r, relation: 'received' })}>
                                 <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}>
                                   {r.profilePic ? <img src={r.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (r.firstName ? r.firstName.charAt(0).toUpperCase() : r.username.charAt(0).toUpperCase())}
                                 </div>
                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
                                   <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{r.firstName || r.lastName ? `${r.firstName} ${r.lastName}` : r.username}</span>
                                 </div>
                               </div>
                               <div style={{ display: 'flex', gap: '0.5rem' }}>
                                 <button className="btn" style={{ background: 'var(--success)', padding: '0.3rem', flex: 1, fontSize: '0.75rem' }} onClick={() => handleAcceptRequest(r._id)}>Accept</button>
                                 <button className="btn btn-secondary" style={{ padding: '0.3rem', flex: 1, fontSize: '0.75rem' }} onClick={() => handleRejectRequest(r._id)}>Reject</button>
                               </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Active Friends Section */}
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', pb: '0.5rem' }}>
                  <div 
                    onClick={() => toggleSection('friends')}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0.5rem', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', background: expandedSections.friends ? 'rgba(88, 166, 255, 0.05)' : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '0.8rem', transition: 'transform 0.2s', transform: expandedSections.friends ? 'rotate(90deg)' : 'rotate(0deg)', opacity: 0.6 }}>▶</span>
                      <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        Active Friends
                      </h3>
                      <span style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px' }}>
                        {friends.length}
                      </span>
                    </div>
                  </div>
                  {expandedSections.friends && (
                    <div style={{ padding: '0.5rem 0 1rem 1.5rem' }}>
                      {isFriendsLoading ? (
                        <div style={{ textAlign: 'center', padding: '1rem' }}>
                          <span className="spinner" style={{ borderTopColor: 'var(--accent)', width: '15px', height: '15px' }}></span>
                        </div>
                      ) : friends.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem' }}>No friends yet.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {friends.map(f => (
                            <div key={f._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', cursor: 'pointer' }} onClick={() => navigate(`/chat/${f._id}`)}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} onClick={(e) => { e.stopPropagation(); setViewedProfile({ user: f, relation: 'friend' }); }}>
                                  <div style={{ position: 'relative' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                                      {f.profilePic ? <img src={f.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (f.firstName ? f.firstName.charAt(0).toUpperCase() : f.username.charAt(0).toUpperCase())}
                                    </div>
                                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: '8px', height: '8px', borderRadius: '50%', background: onlineUsers.some(ou => (ou.userId || ou) === f._id) ? 'var(--success)' : 'var(--text-secondary)', border: '1.5px solid rgba(13,17,23,0.95)' }}></div>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{f.firstName || f.lastName ? `${f.firstName} ${f.lastName}` : f.username}</span>
                                  </div>
                               </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Sent Requests Section */}
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', pb: '0.5rem' }}>
                  <div 
                    onClick={() => toggleSection('sent')}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0.5rem', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', background: expandedSections.sent ? 'rgba(88, 166, 255, 0.05)' : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '0.8rem', transition: 'transform 0.2s', transform: expandedSections.sent ? 'rotate(90deg)' : 'rotate(0deg)', opacity: 0.6 }}>▶</span>
                      <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                        Sent Requests
                      </h3>
                      {sentRequests.length > 0 && (
                        <span style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px' }}>
                          {sentRequests.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {expandedSections.sent && (
                    <div style={{ padding: '0.5rem 0 1rem 1.5rem' }}>
                      {sentRequests.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem' }}>No sent requests.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {sentRequests.map(s => (
                            <div key={s._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => setViewedProfile({ user: s, relation: 'sent' })}>
                                 <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}>
                                   {s.profilePic ? <img src={s.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (s.firstName ? s.firstName.charAt(0).toUpperCase() : s.username.charAt(0).toUpperCase())}
                                 </div>
                                 <span style={{ fontSize: '0.85rem' }}>{s.firstName || s.lastName ? `${s.firstName} ${s.lastName}` : s.username}</span>
                               </div>
                               <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', color: '#ffb3b3' }} onClick={() => handleCancelRequest(s._id)}>Cancel</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Blocked Users Section */}
                <div>
                  <div 
                    onClick={() => toggleSection('blocked')}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0.5rem', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', background: expandedSections.blocked ? 'rgba(248, 81, 73, 0.05)' : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '0.8rem', transition: 'transform 0.2s', transform: expandedSections.blocked ? 'rotate(90deg)' : 'rotate(0deg)', opacity: 0.6 }}>▶</span>
                      <h3 style={{ margin: 0, fontSize: '0.95rem', color: blockedUsers.length > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                        Blocked Users
                      </h3>
                      {blockedUsers.length > 0 && (
                        <span style={{ background: 'rgba(248, 81, 73, 0.15)', color: 'var(--danger)', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px' }}>
                          {blockedUsers.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {expandedSections.blocked && (
                    <div style={{ padding: '0.5rem 0 1rem 1.5rem' }}>
                      {blockedUsers.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem' }}>No blocked users.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {blockedUsers.map(b => (
                            <div key={b._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,0,0,0.05)', borderRadius: '8px', border: '1px solid rgba(255,0,0,0.1)' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                 <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}>
                                   {b.profilePic ? <img src={b.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (b.firstName ? b.firstName.charAt(0).toUpperCase() : b.username.charAt(0).toUpperCase())}
                                 </div>
                                 <span style={{ fontSize: '0.85rem', color: '#ffb3b3' }}>{b.firstName || b.lastName ? `${b.firstName} ${b.lastName}` : b.username}</span>
                               </div>
                               <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }} onClick={() => handleUnblockUser(b._id)}>Unblock</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {deleteModal.open && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}
          onClick={() => !deleteModal.loading && setDeleteModal(prev => ({ ...prev, open: false }))}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '420px', margin: '1rem', background: 'rgba(18,18,28,0.98)', border: '1px solid rgba(255,60,60,0.4)', borderRadius: '16px', padding: '2rem', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⚠️</div>
              <h2 style={{ margin: 0, color: '#ff6b6b', fontSize: '1.3rem' }}>Delete Account</h2>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Step {deleteModal.step} of 2</p>
            </div>

            {deleteModal.step === 1 ? (
              <>
                <div style={{ background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.25)', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: '#ffb3b3', fontSize: '0.9rem' }}>This action will:</p>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.8' }}>
                    <li>Flag your account as <strong style={{color:'#ffb3b3'}}>Inactive</strong></li>
                    <li>Block all future logins with your credentials</li>
                    <li>Queue your data for <strong style={{color:'#ffb3b3'}}>permanent deletion</strong> by Admin</li>
                    <li>Log you out <strong style={{color:'#ffb3b3'}}>immediately</strong></li>
                  </ul>
                </div>
                <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Are you sure you want to continue?</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-secondary" style={{ flex: 1, padding: '0.6rem' }} onClick={() => setDeleteModal(prev => ({ ...prev, open: false }))}>Cancel</button>
                  <button className="btn" style={{ flex: 1, padding: '0.6rem', background: '#7f3030', border: '1px solid #ff6b6b', color: '#ffb3b3' }} onClick={() => setDeleteModal(prev => ({ ...prev, step: 2, error: '' }))}>Yes, Continue</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '1.25rem' }}>Enter your password to confirm you are the owner of this account. This is your <strong>final</strong> confirmation.</p>
                {deleteModal.error && (
                  <div style={{ background: 'rgba(255,0,0,0.12)', border: '1px solid rgba(255,0,0,0.4)', borderRadius: '8px', padding: '0.6rem 0.9rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#ffb3b3' }}>{deleteModal.error}</div>
                )}
                <input 
                  type="password"
                  className="input-field"
                  placeholder="Enter your current password"
                  value={deleteModal.password}
                  onChange={e => setDeleteModal(prev => ({ ...prev, password: e.target.value, error: '' }))}
                  onKeyDown={e => e.key === 'Enter' && handleSoftDelete()}
                  autoFocus
                  style={{ marginBottom: '1rem', border: '1px solid rgba(255,60,60,0.4)' }}
                  disabled={deleteModal.loading}
                />
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-secondary" style={{ flex: 1, padding: '0.6rem' }} onClick={() => setDeleteModal(prev => ({ ...prev, step: 1, password: '', error: '' }))} disabled={deleteModal.loading}>← Back</button>
                  <button className="btn" style={{ flex: 1, padding: '0.6rem', background: 'var(--danger)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={handleSoftDelete} disabled={deleteModal.loading}>
                    {deleteModal.loading && <span className="spinner"></span>}
                    {deleteModal.loading ? 'Deleting...' : '🗑️ Delete Forever'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Modals */}
      <ProfileEditModal 
        isOpen={isProfileEditOpen} 
        onClose={() => setIsProfileEditOpen(false)} 
        isFirstSetup={user?.isProfileSetup === false && !sessionStorage.getItem('skipProfileSetup')} 
      />
      <UserProfileViewModal
        isOpen={!!viewedProfile}
        onClose={() => setViewedProfile(null)}
        profileUser={viewedProfile?.user}
        relationState={viewedProfile?.relation}
        onSendRequest={handleSendRequest}
        onBlockUser={handleBlockUser}
        onRemoveFriend={handleRemoveFriend}
      />
    </div>
  );
}

export default Dashboard;
