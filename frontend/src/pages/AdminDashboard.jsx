import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function AdminDashboard() {
  const { user, logout, onlineUsers, socket } = useContext(AuthContext);
  const navigate = useNavigate();

  const [usersInfo, setUsersInfo] = useState([]);
  const [deletedUsernames, setDeletedUsernames] = useState([]);
  const [targetUser, setTargetUser] = useState(null);
  const [activeTab, setActiveTab] = useState('active'); // 'online' | 'active' | 'pending' | 'disabled' | 'blacklist'
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [superAdminPass, setSuperAdminPass] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');

  // Permanent delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletePassInput, setDeletePassInput] = useState('');
  const [deletePassError, setDeletePassError] = useState('');
  const [reactivateConfirm, setReactivateConfirm] = useState(null);

  // Loading states
  const [isResetting, setIsResetting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [reactivatingId, setReactivatingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  
  const [blacklistConfirm, setBlacklistConfirm] = useState(null);
  const [removingBlacklistId, setRemovingBlacklistId] = useState(null);

  // Settings state
  const [allowMessageDelete, setAllowMessageDelete] = useState(false);
  const [togglingDelete, setTogglingDelete] = useState(false);
  const [togglingUserDeleteId, setTogglingUserDeleteId] = useState(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showModal) {
          setShowModal(false);
          setResetMsg('');
          setResetError('');
        } else if (deleteConfirm) {
          setDeleteConfirm(null);
          setDeletePassInput('');
          setDeletePassError('');
        } else if (reactivateConfirm) {
          setReactivateConfirm(null);
        } else if (blacklistConfirm) {
          setBlacklistConfirm(null);
        } else if (activeTab !== 'active') {
          setActiveTab('active');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showModal, deleteConfirm, reactivateConfirm, blacklistConfirm, activeTab]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    fetchTopology();
    fetchSettings();
  }, [user, navigate]);

  const fetchTopology = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users`);
      const data = await res.json();
      setUsersInfo(data.users || []);
      setDeletedUsernames(data.deletedUsernames || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/settings`);
      const data = await res.json();
      setAllowMessageDelete(data.allowMessageDelete || false);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const handleToggleDelete = async () => {
    setTogglingDelete(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/toggle-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowMessageDelete: !allowMessageDelete })
      });
      if (res.ok) {
        setAllowMessageDelete(!allowMessageDelete);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingDelete(false);
    }
  };

  const handleToggleUserDelete = async (targetUser) => {
    setTogglingUserDeleteId(targetUser._id);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/toggle-user-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser._id, canDeleteMessages: !(targetUser.canDeleteMessages !== false) })
      });
      if (res.ok) fetchTopology();
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingUserDeleteId(null);
    }
  };

  const handleOpenReset = (u) => {
    setTargetUser(u);
    setNewPassword('');
    setSuperAdminPass('');
    setResetMsg('');
    setResetError('');
    setShowModal(true);
  };

  const executePasswordReset = async (e) => {
    e.preventDefault();
    setResetMsg('');
    setResetError('');
    setIsResetting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: targetUser._id, 
          newPassword: newPassword, 
          superAdminPassword: superAdminPass 
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setResetMsg(result.message);
      setTimeout(() => {
        setShowModal(false);
        setIsResetting(false);
      }, 2000);
    } catch (err) {
      setResetError(err.message);
      setIsResetting(false);
    }
  };

  const handleToggleDisable = async (targetUser) => {
    setTogglingId(targetUser._id);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/toggle-disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser._id, isDisabled: !targetUser.isDisabled })
      });
      if (response.ok) fetchTopology();
    } catch(err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  };

  const handlePermanentDelete = async (userId) => {
    setDeletingId(userId);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/permanent-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, superAdminPassword: deletePassInput })
      });
      const data = await res.json();
      if (!res.ok) {
        setDeletePassError(data.message || 'Access denied.');
        setDeletingId(null);
        return;
      }
      setDeleteConfirm(null);
      setDeletePassInput('');
      setDeletePassError('');
      fetchTopology();
    } catch(err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleReactivate = async (userId) => {
    setReactivatingId(userId);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/reactivate-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        setReactivateConfirm(null);
        fetchTopology();
      }
    } catch(err) {
      console.error(err);
    } finally {
      setReactivatingId(null);
    }
  };

  const handleRemoveBlacklist = async (usernameId) => {
    setRemovingBlacklistId(usernameId);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/remove-blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameId })
      });
      if (res.ok) {
        setBlacklistConfirm(null);
        fetchTopology();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingBlacklistId(null);
    }
  };

  const pendingDeletions = usersInfo.filter(u => u.isInactive);
  const disabledUsers = usersInfo.filter(u => !u.isInactive && u.isDisabled);
  const activeUsers = usersInfo.filter(u => !u.isInactive && !u.isDisabled);
  
  const onlineCount = activeUsers.filter(u => 
    onlineUsers?.some(ou => (ou.userId || ou) === u._id)
  ).length;

  const sortedActiveUsers = [...activeUsers].sort((a, b) => {
    const isAOnline = !!onlineUsers?.find(ou => (ou.userId || ou) === a._id);
    const isBOnline = !!onlineUsers?.find(ou => (ou.userId || ou) === b._id);

    if (isAOnline && !isBOnline) return -1;
    if (!isAOnline && isBOnline) return 1;

    // Secondary sort: last login time (latest to oldest)
    return new Date(b.lastOnline || 0) - new Date(a.lastOnline || 0);
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString([], { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
  };



  return (
    <div className="admin-container">
      
      {/* Header */}
      <div style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        width: '100%', maxWidth: '900px', margin: '0 auto 1rem auto', 
        borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem 1rem',
        position: 'sticky', top: 0, 
        background: 'rgba(13, 17, 23, 0.75)', 
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 20,
        borderRadius: '0 0 16px 16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ 
            width: '32px', height: '32px', borderRadius: '8px', 
            background: 'linear-gradient(135deg, #cc0000, #440000)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: '1.2rem', 
            boxShadow: '0 0 15px rgba(204,0,0,0.4)',
            border: '1px solid rgba(255,0,0,0.2)'
          }}>🛡️</div>
          <h1 style={{ 
            margin: 0, 
            color: '#ff4d4d', 
            fontSize: '1.3rem', 
            fontWeight: '900', 
            letterSpacing: '0.05em',
            textShadow: '0 0 10px rgba(255,0,0,0.1)'
          }}>ADMIN CONTROL</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600', lineHeight: 1 }}>{user?.username}</div>
          </div>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', border: '1px solid rgba(255,0,0,0.5)', color: '#ff4d4d', background: 'rgba(255,0,0,0.1)', borderRadius: '6px', fontWeight: 'bold' }} 
            onClick={() => { logout(); navigate('/login'); }}
          >
            TERMINATE
          </button>
        </div>
      </div>

      {/* Stats / Navigation Row */}
      <div style={{ width: '100%', maxWidth: '900px', display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          { label: 'ONLINE', value: onlineCount, color: '#00ff00', tab: 'online', icon: '🔋' },
          { label: 'ACTIVE', value: activeUsers.length, color: '#ff4d4d', tab: 'active', icon: '👥' },
          { label: 'DISABLED', value: disabledUsers.length, color: '#666', tab: 'disabled', icon: '⛔' },
          { label: 'PENDING', value: pendingDeletions.length, color: '#ff9800', tab: 'pending', icon: '⚠️' },
          { label: 'BLACKLIST', value: deletedUsernames.length, color: '#cc0000', tab: 'blacklist', icon: '💀' },
          { label: 'SETTINGS', value: '⚙️', color: '#58a6ff', tab: 'settings', icon: '⚙️', isIcon: true },
        ].map(stat => (
          <div
            key={stat.tab}
            className="glass-panel"
            onClick={() => { setActiveTab(stat.tab); if(stat.tab === 'pending') setDeleteConfirm(null); }}
            style={{ 
              flex: '1 1 auto', textAlign: 'center', padding: '0.4rem 0.2rem', cursor: 'pointer', borderRadius: '8px', 
              border: activeTab === stat.tab ? `2px solid ${stat.color}` : '1px solid rgba(255,255,255,0.05)', 
              background: activeTab === stat.tab ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)',
              transition: 'all 0.2s', minWidth: '0',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              boxShadow: activeTab === stat.tab ? `0 0 10px ${stat.color}44` : 'none',
              maxWidth: '20%'
            }}
          >
            <div style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{stat.icon}</div>
            {!stat.isIcon && <div style={{ fontSize: '1.2rem', fontWeight: '900', color: stat.color, marginBottom: '0.1rem', lineHeight: 1 }}>{stat.value}</div>}
            <div style={{ color: activeTab === stat.tab ? 'white' : 'var(--text-secondary)', fontSize: stat.isIcon ? '0.65rem' : '0.55rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: stat.isIcon ? '0.1rem' : 0 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tab Content */}
      <div className="admin-content-box">
        
        {/* ---- ACTIVE USERS TAB ---- */}
        {(activeTab === 'active' || activeTab === 'online') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sortedActiveUsers.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9rem' }}>No active users.</p>}
            {sortedActiveUsers
              .filter(u => {
                if (activeTab === 'online') {
                  return onlineUsers?.some(ou => (ou.userId || ou) === u._id);
                }
                return true;
              })
              .map(u => {
                const onlineRef = onlineUsers?.find(ou => (ou.userId || ou) === u._id);
                const isOnline = !!onlineRef;
              const currentDevice = onlineRef?.deviceType || u.lastLoginMetadata?.deviceType || 'desktop';
              
              const getDeviceIcon = (type) => {
                if (type === 'mobile' || type === 'tablet') return '📱';
                return '💻';
              };

              return (
                <div key={u._id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '0.75rem', borderRadius: '10px', borderLeft: u.role === 'admin' ? '4px solid #ff0000' : '4px solid #cc0000', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ flex: 1, minWidth: '130px' }}>
                    <div style={{ fontWeight: '800', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'white' }}>
                      <span title={currentDevice.toUpperCase()} style={{ fontSize: '1.1rem' }}>{getDeviceIcon(currentDevice)}</span>
                      {u.username}
                      {u.role === 'admin' && <span style={{ fontSize: '0.7rem', background: '#ff0000', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>SYSTEM</span>}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ color: '#ff4d4d', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.7rem' }}>STATUS:</span>
                        {isOnline ? <span style={{ color: '#00ff00', fontWeight: 'bold', letterSpacing: '0.05em' }}>● ONLINE</span> : formatDate(u.lastOnline)}
                      </div>

                      {u.lastLoginMetadata?.os && (
                        <div style={{ fontSize: '0.75rem', color: '#aaa', fontStyle: 'italic', background: 'rgba(255,255,255,0.03)', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)', marginTop: '0.2rem' }}>
                          <span style={{ color: '#ff4d4d', marginRight: '0.3rem' }}>DEVICE:</span>
                          {u.lastLoginMetadata.brand} {u.lastLoginMetadata.model !== 'Device' && u.lastLoginMetadata.model} 
                          <span style={{ opacity: 0.6, fontSize: '0.65rem' }}> — {u.lastLoginMetadata.os} ({u.lastLoginMetadata.browser})</span>
                        </div>
                      )}
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Created:</span>
                        {formatDate(u.createdAt)}
                      </div>
                      
                      <div style={{ marginTop: '0.3rem', padding: '0.4rem', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.2rem', textTransform: 'uppercase' }}>FRIENDS ({u.friends?.length || 0})</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.8, display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                          {u.friends && u.friends.length > 0 ? (
                            u.friends.map((f, i) => (
                              <span key={f._id} style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                {f.username}
                              </span>
                            ))
                          ) : <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No friends</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* Per-user delete toggle - always show for non-admins */}
                    {u.role !== 'admin' && (
                      <div 
                        style={{ 
                          display: 'flex', alignItems: 'center', gap: '0.4rem',
                          background: 'rgba(255,255,255,0.03)', padding: '0.3rem 0.6rem', borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.06)',
                          opacity: togglingUserDeleteId === u._id ? 0.5 : 1
                        }}
                        title={u.canDeleteMessages !== false ? 'Delete enabled for this user' : 'Delete disabled for this user'}
                      >
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>🗑️ Del</span>
                        <button
                          onClick={() => handleToggleUserDelete(u)}
                          disabled={togglingUserDeleteId === u._id}
                          style={{
                            position: 'relative', width: '34px', height: '18px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                            background: u.canDeleteMessages !== false ? 'var(--success)' : 'rgba(255,255,255,0.15)',
                            transition: 'background 0.3s ease', flexShrink: 0,
                            boxShadow: u.canDeleteMessages !== false ? '0 0 6px rgba(46,160,67,0.4)' : 'none'
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: '2px', left: u.canDeleteMessages !== false ? '18px' : '2px',
                            width: '14px', height: '14px', borderRadius: '50%',
                            background: 'white', transition: 'left 0.3s ease',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                          }}></div>
                        </button>
                      </div>
                    )}
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', color: 'yellow', fontWeight: 'bold' }} onClick={() => handleOpenReset(u)} disabled={isResetting || togglingId === u._id}>
                      RESET
                    </button>
                    {u.role !== 'admin' && (
                      <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', color: 'var(--danger)', fontWeight: 'bold' }} onClick={() => handleToggleDisable(u)} disabled={togglingId === u._id}>
                        {togglingId === u._id ? '...' : 'DISABLE'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ---- DISABLED USERS TAB ---- */}
        {activeTab === 'disabled' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {disabledUsers.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9rem' }}>No disabled accounts.</p>}
            {disabledUsers.map(u => (
              <div key={u._id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 0.6rem', borderRadius: '8px', borderLeft: '3px solid #666', opacity: 0.8 }}>
                <div style={{ flex: 1, minWidth: '130px' }}>
                  <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#999' }}>{u.username}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.3rem' }}>
                    <span>Account Created: {formatDate(u.createdAt)}</span>
                    <span style={{ color: '#ff4d4d', fontWeight: 'bold' }}>Disabled At: {formatDate(u.disabledAt)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {deleteConfirm === u._id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-end', minWidth: '220px' }}>
                      <span style={{ fontSize: '0.85rem', color: '#ffb3b3', fontWeight: 'bold' }}>Requires Master Key:</span>
                      {deletePassError && <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{deletePassError}</span>}
                      <input
                        type="password"
                        placeholder="Master password"
                        value={deletePassInput}
                        onChange={e => { setDeletePassInput(e.target.value); setDeletePassError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handlePermanentDelete(u._id)}
                        autoFocus
                        style={{ padding: '0.5rem 0.8rem', fontSize: '0.9rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,0,0,0.5)', borderRadius: '6px', color: 'white', width: '210px', outline: 'none' }}
                      />
                      <div style={{ display: 'flex', gap: '0.6rem' }}>
                        <button className="btn" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', background: 'var(--danger)', fontWeight: 'bold' }} onClick={() => handlePermanentDelete(u._id)} disabled={deletingId === u._id}>
                          {deletingId === u._id ? '...' : 'WIPE DATA'}
                        </button>
                        <button className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }} onClick={() => { setDeleteConfirm(null); setDeletePassInput(''); setDeletePassError(''); }} disabled={deletingId === u._id}>ABORT</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', color: 'var(--success)', fontWeight: 'bold' }} onClick={() => handleToggleDisable(u)} disabled={togglingId === u._id}>
                        {togglingId === u._id ? '...' : 'RESTORE'}
                      </button>
                      <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: 'var(--danger)', fontWeight: 'bold' }} onClick={() => setDeleteConfirm(u._id)}>
                        🗑️ WIPE
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- PENDING DELETION TAB ---- */}
        {activeTab === 'pending' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingDeletions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                No accounts pending deletion.
              </div>
            )}
            {pendingDeletions.map(u => (
              <div key={u._id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,152,0,0.06)', padding: '0.6rem 0.6rem', borderRadius: '8px', borderLeft: '3px solid #ff9800' }}>
                <div style={{ flex: 1, minWidth: '130px' }}>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {u.username}
                    <span style={{ fontSize: '0.7rem', background: '#ff9800', color: '#000', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>INACTIVE</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div>Created: {formatDate(u.createdAt)}</div>
                    <div style={{ color: '#ff9800', fontWeight: 'bold' }}>Deletion Request: {formatDate(u.inactiveAt)}</div>
                    <div>Friends list size: {u.friends?.length || 0}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {deleteConfirm === u._id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-end', minWidth: '220px' }}>
                      <span style={{ fontSize: '0.85rem', color: '#ffb3b3', fontWeight: 'bold' }}>Enter Master Key to authorize:</span>
                      {deletePassError && <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{deletePassError}</span>}
                      <input
                        type="password"
                        placeholder="Master password"
                        value={deletePassInput}
                        onChange={e => { setDeletePassInput(e.target.value); setDeletePassError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handlePermanentDelete(u._id)}
                        autoFocus
                        style={{ padding: '0.5rem 0.8rem', fontSize: '0.9rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,0,0,0.5)', borderRadius: '6px', color: 'white', width: '210px', outline: 'none' }}
                      />
                      <div style={{ display: 'flex', gap: '0.6rem' }}>
                        <button className="btn" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', background: 'var(--danger)', fontWeight: 'bold' }} onClick={() => handlePermanentDelete(u._id)} disabled={deletingId === u._id}>
                          {deletingId === u._id ? 'Wiping...' : 'CONFIRM WIPE'}
                        </button>
                        <button className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }} onClick={() => { setDeleteConfirm(null); setDeletePassInput(''); setDeletePassError(''); }} disabled={deletingId === u._id}>ABORT</button>
                      </div>
                    </div>
                  ) : reactivateConfirm === u._id ? (
                    <>
                      <span style={{ fontSize: '0.85rem', color: '#a3f7a3', alignSelf: 'center', fontWeight: 'bold' }}>Reactivate account?</span>
                      <button className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', color: 'var(--success)', fontWeight: 'bold' }} onClick={() => handleReactivate(u._id)} disabled={reactivatingId === u._id}>
                        {reactivatingId === u._id ? '...' : 'YES'}
                      </button>
                      <button className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }} onClick={() => setReactivateConfirm(null)} disabled={reactivatingId === u._id}>NO</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', color: 'var(--success)', fontWeight: 'bold' }} onClick={() => setReactivateConfirm(u._id)}>REACTIVE</button>
                      <button className="btn" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', background: 'var(--danger)', fontWeight: 'bold' }} onClick={() => setDeleteConfirm(u._id)}>DELETE</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- BLACKLISTED TAB ---- */}
        {activeTab === 'blacklist' && (
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1.2rem' }}>
              These usernames are permanently reserved — no new account can be created with them.
            </p>
            {deletedUsernames.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                No blacklisted usernames yet.
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {deletedUsernames.map(d => (
                <div key={d._id} style={{ background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.25)', padding: '0.6rem 1rem', borderRadius: '16px', fontSize: '0.9rem', color: '#ffb3b3', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s' }}>
                  {blacklistConfirm === d._id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontWeight: 'bold', color: 'white', fontSize: '0.85rem' }}>Restore {d.username}?</span>
                      <button className="btn" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', background: 'var(--success)', minHeight: '26px' }} onClick={() => handleRemoveBlacklist(d._id)} disabled={removingBlacklistId === d._id}>
                        {removingBlacklistId === d._id ? '...' : 'Yes'}
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', minHeight: '26px' }} onClick={() => setBlacklistConfirm(null)}>No</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.1rem' }}>🚫</span>
                      <span style={{ fontWeight: 'bold' }}>{d.username}</span>
                      <span style={{ fontSize: '0.75rem', color: '#888', opacity: 0.7 }}>{new Date(d.createdAt).toLocaleDateString()}</span>
                      <button 
                        title="Remove from blacklist"
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ff5858', cursor: 'pointer', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,0,0,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onClick={() => setBlacklistConfirm(d._id)}
                      >
                        &times;
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- SETTINGS TAB ---- */}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Global settings that apply to all users in the system.
            </div>

            {/* Allow Message Delete Toggle */}
            <div style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '10px', 
              border: '1px solid rgba(255,255,255,0.05)' 
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'white', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🗑️ Allow Message Delete
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  When enabled, users can delete their own messages for everyone. A "Delete" button appears in the message action menu.
                </div>
              </div>
              <button
                onClick={handleToggleDelete}
                disabled={togglingDelete}
                style={{
                  position: 'relative', width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                  background: allowMessageDelete ? 'var(--success)' : 'rgba(255,255,255,0.15)',
                  transition: 'background 0.3s ease', flexShrink: 0, marginLeft: '1rem',
                  boxShadow: allowMessageDelete ? '0 0 12px rgba(46,160,67,0.4)' : 'none',
                  opacity: togglingDelete ? 0.5 : 1
                }}
              >
                <div style={{
                  position: 'absolute', top: '3px', left: allowMessageDelete ? '27px' : '3px',
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: 'white', transition: 'left 0.3s ease',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                }}></div>
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Reset Modal Overlay */}
      {showModal && targetUser && (
        <div className="sidebar-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setShowModal(false)}>
          <div className="glass-panel" style={{ width: '380px', background: 'rgba(20,20,30,0.97)', border: '1px solid var(--danger)', padding: '1.5rem' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--danger)', fontSize: '1rem' }}>Override Credentials</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Targeting: <strong style={{color:'white'}}>{targetUser.username}</strong>
            </p>
            {resetError && <div style={{ color: '#ffb3b3', background: 'rgba(255,0,0,0.1)', padding: '0.4rem 0.6rem', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.78rem' }}>{resetError}</div>}
            {resetMsg && <div style={{ color: 'var(--success)', background: 'rgba(0,255,0,0.08)', padding: '0.4rem 0.6rem', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.78rem' }}>{resetMsg}</div>}
            <form onSubmit={executePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: 0 }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block' }}>New Password</label>
                <input type="text" className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ marginBottom: 0 }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--danger)', marginBottom: '0.3rem', display: 'block' }}>Admin Decrypt Key</label>
                <input type="password" className="input-field" value={superAdminPass} onChange={e => setSuperAdminPass(e.target.value)} required style={{ border: '1px solid var(--danger)', marginBottom: 0 }} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="submit" className="btn" style={{ flex: 1, background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} disabled={isResetting}>
                  {isResetting && <span className="spinner"></span>}
                  {isResetting ? 'Overwriting...' : 'Overwrite'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)} disabled={isResetting}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default AdminDashboard;
