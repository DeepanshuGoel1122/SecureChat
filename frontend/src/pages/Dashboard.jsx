import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

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
  const [removeConfirm, setRemoveConfirm] = useState({ friendId: null, step: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });
  
  // Delete Account Modal state
  const [deleteModal, setDeleteModal] = useState({ open: false, step: 1, password: '', error: '', loading: false });
  
  const profileMenuRef = useRef(null);
  
  const navigate = useNavigate();
  const { user, logout, socket, onlineUsers } = useContext(AuthContext);

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
      socket.on('receive_message', handleIncoming);
      return () => socket.off('receive_message', handleIncoming);
    }
  }, [socket, user]);

  const fetchFriends = async () => {
    setIsFriendsLoading(true);
    try {
      const res = await fetch(`https://securechat-flwx.onrender.com/api/users/friends/${user.id}`);
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
      const res = await fetch(`https://securechat-flwx.onrender.com/api/messages/unread/${user.id}`);
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
      const res = await fetch(`https://securechat-flwx.onrender.com/api/users/search?q=${searchQuery}&userId=${user.id}`);
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
      await fetch(`https://securechat-flwx.onrender.com/api/users/${endpoint}`, {
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
  const handleBlockUser = async (blockId) => {
    await executeAction('block-user', { userId: user.id, blockId });
  };
  const handleUnblockUser = async (blockId) => {
    await executeAction('unblock-user', { userId: user.id, blockId });
  };

  const handleRemoveFriend = async (e, friendId) => {
    e.stopPropagation(); 
    if (removeConfirm.friendId !== friendId) return setRemoveConfirm({ friendId, step: 1 });
    if (removeConfirm.step === 1) return setRemoveConfirm({ friendId, step: 2 });
    if (removeConfirm.step === 2) {
      await executeAction('remove-friend', { userId: user.id, friendId });
      setRemoveConfirm({ friendId: null, step: 0 });
    }
  };

  const handleDeleteChat = async (e, friendId) => {
    e.stopPropagation(); 
    if (deleteConfirm.friendId !== friendId) return setDeleteConfirm({ friendId, step: 1 });
    if (deleteConfirm.step === 1) return setDeleteConfirm({ friendId, step: 2 });
    if (deleteConfirm.step === 2) {
      try {
        await fetch(`https://securechat-flwx.onrender.com/api/messages/history/${user.id}/${friendId}`, { method: 'DELETE' });
        setDeleteConfirm({ friendId: null, step: 0 });
        fetchFriends(); 
        fetchUnreadCounts();
      } catch (err) {}
    }
  };

  const getRemoveText = (fId) => {
    if (removeConfirm.friendId !== fId) return 'Remove Friend';
    if (removeConfirm.step === 1) return 'Remove?';
    if (removeConfirm.step === 2) return 'Sure?';
  };

  const getRemoveStyle = (fId) => {
    if (removeConfirm.friendId !== fId) return { color: 'var(--danger)', textDecoration: 'underline' };
    if (removeConfirm.step === 1) return { color: 'white' };
    if (removeConfirm.step === 2) return { color: 'white', fontWeight: 'bold' };
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordForm.oldPassword || !passwordForm.newPassword) return;
    setLoadingChangePassword(true);
    setPasswordMessage({ text: '', type: '' });
    try {
      const res = await fetch('https://securechat-flwx.onrender.com/api/auth/change-password', {
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
      const verifyRes = await fetch('https://securechat-flwx.onrender.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, password: deleteModal.password })
      });
      if (!verifyRes.ok) {
        setDeleteModal(prev => ({ ...prev, loading: false, error: 'Incorrect password. Account deletion cancelled.' }));
        return;
      }
      // Password verified, proceed with soft delete
      await fetch('https://securechat-flwx.onrender.com/api/auth/soft-delete', {
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
    <div className="dashboard-container" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '2rem', width: '100%', minHeight: '100vh', padding: '1rem', boxSizing: 'border-box' }} onClick={() => { setDeleteConfirm({ friendId: null, step: 0 }); setRemoveConfirm({ friendId: null, step: 0 }); setIsProfileMenuOpen(false); }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '700px', margin: '0 auto 2rem auto' }}>
        <h1 style={{ margin: 0, background: 'linear-gradient(to right, #58a6ff, #a371f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '1.75rem' }}>SecureChat</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }} onClick={() => setIsSidebarOpen(true)}>Friends / Add &rarr;</button>
          
          <div style={{ position: 'relative' }} ref={profileMenuRef}>
            <div 
              onClick={(e) => { e.stopPropagation(); setIsProfileMenuOpen(!isProfileMenuOpen); setIsChangePasswordOpen(false); setPasswordMessage({ text: '', type: '' }); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.75rem', color: 'white' }}>
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '500' }}>{user?.username}</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>▼</span>
            </div>

            {isProfileMenuOpen && (
              <div 
                onClick={(e) => e.stopPropagation()}
                style={{ position: 'absolute', top: '100%', right: '0', marginTop: '0.4rem', width: '190px', background: 'rgba(15,15,22,0.97)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.3rem', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}
              >
                {!isChangePasswordOpen ? (
                  <>
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
      
      <div className="glass-panel dashboard-box" style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '1rem', margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="auth-title" style={{ textAlign: 'left', marginBottom: '0.5rem', fontSize: '1.25rem', background: 'none', WebkitTextFillColor: 'var(--text-primary)' }}>Your Chats</h2>
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
              return (
                <div key={f._id} style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => navigate(`/chat/${f._id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: onlineUsers.includes(f._id) ? 'var(--success)' : 'var(--text-secondary)', boxShadow: onlineUsers.includes(f._id) ? '0 0 5px var(--success)' : 'none' }}></div>
                    <span style={{ fontWeight: '500' }}>{f.username}</span>
                    {unread > 0 && <span style={{ background: 'var(--danger)', color: 'white', border: '1px solid transparent', borderRadius: '12px', padding: '0.1rem 0.5rem', fontSize: '0.7rem', fontWeight: 'bold' }}>{unread}</span>}
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

      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}>
          <div className="sidebar-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Friends / Requests</h2>
              <button onClick={() => setIsSidebarOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '2rem', cursor: 'pointer', lineHeight: '1rem', padding: 0 }}>&times;</button>
            </div>

            {/* Search */}
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Find Users</h3>
            <form onSubmit={searchUsers} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input type="text" className="input-field" placeholder="Search username..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ marginBottom: 0, flex: 1 }} />
              <button type="submit" className="btn" style={{ padding: '0.5rem 1rem' }}>Search</button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', minHeight: '40px' }}>
              {isSearching && (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <span className="spinner" style={{ borderTopColor: 'var(--accent)', marginRight: 0 }}></span>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Searching users...</div>
                </div>
              )}
              {!isSearching && hasSearched && searchResults.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--danger)', textAlign: 'center', background: 'rgba(255,0,0,0.1)', borderRadius: '8px', fontSize: '0.9rem' }}>User not found.</div>}
              {!isSearching && searchResults.map(u => (
                <div key={u._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.95rem' }}>{u.username}</span>
                  {friends.some(f => f._id === u._id) ? <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Added</span> : 
                   sentRequests.some(f => f._id === u._id) ? <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pending Req</span> :
                   receivedRequests.some(f => f._id === u._id) ? <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>See Below</span> :
                  <button className="btn btn-secondary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleSendRequest(u._id)}>Send Request</button>}
                </div>
              ))}
            </div>
            
            <hr style={{ border: 'none', borderBottom: '1px solid var(--glass-border)', marginBottom: '1rem' }} />

            {/* Incoming Requests */}
            {receivedRequests.length > 0 && (
              <>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', color: 'var(--accent)' }}>Incoming Requests</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {receivedRequests.map(r => (
                    <div key={r._id} style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                       <span style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>{r.username} wants to connect</span>
                       <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                         <button className="btn" style={{ background: 'var(--success)', padding: '0.3rem', flex: 1, fontSize: '0.75rem' }} onClick={() => handleAcceptRequest(r._id)}>Accept</button>
                         <button className="btn btn-secondary" style={{ padding: '0.3rem', flex: 1, fontSize: '0.75rem' }} onClick={() => handleRejectRequest(r._id)}>Reject</button>
                         <button className="btn btn-secondary" style={{ padding: '0.3rem', flex: 1, color: 'var(--danger)', fontSize: '0.75rem' }} onClick={() => handleBlockUser(r._id)}>Block</button>
                       </div>
                       <button className="btn btn-secondary" style={{ padding: '0.4rem', width: '100%', fontSize: '0.8rem' }} onClick={() => { setIsSidebarOpen(false); navigate(`/chat/${r._id}`); }}>Message (10 Limit)</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Connected Friends */}
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Active Friends</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', minHeight: '60px' }}>
               {isFriendsLoading ? (
                 <div style={{ textAlign: 'center', padding: '1rem' }}>
                   <span className="spinner" style={{ borderTopColor: 'var(--accent)', marginRight: 0 }}></span>
                   <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Loading friends...</div>
                 </div>
               ) : friends.length === 0 ? (
                 <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No active friends yet.</span>
               ) : (
                 friends.map(f => (
                    <div key={f._id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => navigate(`/chat/${f._id}`)}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: onlineUsers.includes(f._id) ? 'var(--success)' : 'var(--text-secondary)' }}></div>
                            <span style={{ fontSize: '0.95rem' }}>{f.username}</span>
                         </div>
                         <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>Chat</button>
                       </div>
                       <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '1rem', marginTop: '0.25rem' }}>
                         <button className="btn btn-secondary" style={{ background: 'none', border: 'none', fontSize: '0.75rem', cursor: 'pointer', padding: 0, ...getRemoveStyle(f._id) }} onClick={(e) => handleRemoveFriend(e, f._id)}>{getRemoveText(f._id)}</button>
                         <button className="btn btn-secondary" style={{ background: 'none', border: 'none', fontSize: '0.75rem', cursor: 'pointer', padding: 0, color: 'var(--danger)' }} onClick={() => handleBlockUser(f._id)}>Block User</button>
                       </div>
                    </div>
                 ))
               )}
            </div>

            {/* Waiting Requests */}
            {sentRequests.length > 0 && (
              <>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Sent Requests (Pending)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', opacity: 0.9 }}>
                  {sentRequests.map(s => (
                    <div key={s._id} style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                         <span style={{ fontSize: '0.9rem' }}>{s.username}</span>
                         <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pending...</span>
                       </div>
                       <button className="btn btn-secondary" style={{ padding: '0.3rem', width: '100%', fontSize: '0.8rem' }} onClick={() => { setIsSidebarOpen(false); navigate(`/chat/${s._id}`); }}>Message (10 Limit)</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Blocked Users */}
            {blockedUsers.length > 0 && (
              <>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--danger)' }}>Blocked Users</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', border: '1px solid rgba(255,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
                  {blockedUsers.map(b => (
                    <div key={b._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,0,0,0.1)', borderRadius: '8px' }}>
                       <span style={{ fontSize: '0.9rem', color: '#ffb3b3' }}>{b.username}</span>
                       <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem' }} onClick={() => handleUnblockUser(b._id)}>Unblock</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            
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
    </div>
  );
}

export default Dashboard;
