import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function AdminDashboard() {
  const { user, logout, onlineUsers } = useContext(AuthContext);
  const navigate = useNavigate();

  const [usersInfo, setUsersInfo] = useState([]);
  const [deletedUsernames, setDeletedUsernames] = useState([]);
  const [targetUser, setTargetUser] = useState(null);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'pending' | 'blacklist'
  
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

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    fetchTopology();
  }, [user, navigate]);

  const fetchTopology = async () => {
    try {
      const res = await fetch(`https://securechat-flwx.onrender.com/api/admin/users`);
      const data = await res.json();
      setUsersInfo(data.users || []);
      setDeletedUsernames(data.deletedUsernames || []);
    } catch (err) {
      console.error(err);
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
      const response = await fetch(`https://securechat-flwx.onrender.com/api/admin/reset-password`, {
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
      const response = await fetch(`https://securechat-flwx.onrender.com/api/admin/toggle-disable`, {
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
      const res = await fetch(`https://securechat-flwx.onrender.com/api/admin/permanent-delete`, {
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
      const res = await fetch(`https://securechat-flwx.onrender.com/api/admin/reactivate-user`, {
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
      const res = await fetch(`https://securechat-flwx.onrender.com/api/admin/remove-blacklist`, {
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
  const activeUsers = usersInfo.filter(u => !u.isInactive);

  const tabStyle = (tab) => ({
    padding: '0.5rem 1.1rem',
    fontSize: '0.82rem',
    fontWeight: '600',
    cursor: 'pointer',
    borderRadius: '8px',
    border: 'none',
    background: activeTab === tab ? 'rgba(88,166,255,0.15)' : 'transparent',
    color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '2rem', minHeight: '100vh', paddingBottom: '4rem', paddingLeft: '1rem', paddingRight: '1rem', boxSizing: 'border-box', width: '100%' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '900px', margin: '0 auto 1.5rem auto', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, color: 'var(--danger)', fontSize: '1.4rem', letterSpacing: '-0.02em' }}>Admin Control Center</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Elevated: <strong style={{color:'var(--text-primary)'}}>{user?.username}</strong></span>
          <button className="btn btn-secondary" style={{ color: 'var(--danger)', fontSize: '0.78rem' }} onClick={() => { logout(); navigate('/login'); }}>Terminate Session</button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ width: '100%', maxWidth: '900px', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { label: 'Active Users', value: activeUsers.filter(u => u.role !== 'admin').length, color: 'var(--success)', tab: 'active' },
          { label: 'Pending Deletion', value: pendingDeletions.length, color: '#ff9800', tab: 'pending' },
          { label: 'Blacklisted Names', value: deletedUsernames.length, color: 'var(--danger)', tab: 'blacklist' },
        ].map(stat => (
          <div
            key={stat.tab}
            className="glass-panel"
            onClick={() => setActiveTab(stat.tab)}
            style={{ flex: '1 1 150px', textAlign: 'center', padding: '1rem 0.75rem', cursor: 'pointer', borderRadius: '10px', border: activeTab === stat.tab ? `1px solid ${stat.color}` : '1px solid var(--glass-border)', transition: 'all 0.2s' }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: stat.color }}>{stat.value}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ width: '100%', maxWidth: '900px', display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '0' }}>
        <button style={tabStyle('active')} onClick={() => setActiveTab('active')}>
          <span>👥</span> Active Users <span style={{ background: 'rgba(46,160,67,0.2)', color: 'var(--success)', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px' }}>{activeUsers.filter(u => u.role !== 'admin').length}</span>
        </button>
        <button style={tabStyle('pending')} onClick={() => { setActiveTab('pending'); setDeleteConfirm(null); }}>
          <span>⏳</span> Pending Deletion {pendingDeletions.length > 0 && <span style={{ background: 'rgba(255,152,0,0.2)', color: '#ff9800', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px' }}>{pendingDeletions.length}</span>}
        </button>
        <button style={tabStyle('blacklist')} onClick={() => setActiveTab('blacklist')}>
          <span>🔴</span> Blacklisted {deletedUsernames.length > 0 && <span style={{ background: 'rgba(248,81,73,0.2)', color: 'var(--danger)', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px' }}>{deletedUsernames.length}</span>}
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ width: '100%', maxWidth: '900px', background: 'var(--panel-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: '2rem', boxSizing: 'border-box' }}>
        
        {/* ---- ACTIVE USERS TAB ---- */}
        {activeTab === 'active' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeUsers.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9rem' }}>No active users.</p>}
            {activeUsers.map(u => {
              const isOnline = onlineUsers?.includes(u._id);
              return (
                <div key={u._id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '0.85rem 1rem', borderRadius: '8px', borderLeft: u.role === 'admin' ? '3px solid var(--danger)' : u.isDisabled ? '3px solid #555' : '3px solid var(--success)', opacity: u.isDisabled ? 0.6 : 1 }}>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {u.username}
                      {u.role === 'admin' && <span style={{ fontSize: '0.55rem', background: 'var(--danger)', color: 'white', padding: '1px 5px', borderRadius: '4px' }}>ADMIN</span>}
                      {u.isDisabled && <span style={{ fontSize: '0.55rem', background: '#555', color: 'white', padding: '1px 5px', borderRadius: '4px' }}>DISABLED</span>}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'monospace', opacity: 0.6 }}>ID: {u._id}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      Last: {isOnline ? <span style={{ color: 'var(--success)' }}>Active Now</span> : u.lastOnline ? new Date(u.lastOnline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Offline'}
                    </div>
                  </div>
                  <div style={{ flex: 2, minWidth: '140px', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-secondary)', marginRight: '0.3rem' }}>Friends ({u.friends.length}):</span>
                    {u.friends.length > 0 ? u.friends.map(f => (
                      <span key={f._id} style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: '10px', fontSize: '0.7rem', marginRight: '0.25rem' }}>{f.username}</span>
                    )) : <span style={{ fontStyle: 'italic', opacity: 0.4, fontSize: '0.72rem' }}>None</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', color: 'yellow', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => handleOpenReset(u)} disabled={isResetting || togglingId === u._id}>
                      Reset Pwd
                    </button>
                    {u.role !== 'admin' && (
                      <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', color: u.isDisabled ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => handleToggleDisable(u)} disabled={togglingId === u._id}>
                        {togglingId === u._id && <span className="spinner"></span>}
                        {togglingId === u._id ? (u.isDisabled ? 'Enabling...' : 'Disabling...') : (u.isDisabled ? 'Enable' : 'Disable')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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
              <div key={u._id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,152,0,0.06)', padding: '0.85rem 1rem', borderRadius: '8px', borderLeft: '3px solid #ff9800' }}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {u.username}
                    <span style={{ fontSize: '0.55rem', background: '#ff9800', color: '#000', padding: '1px 5px', borderRadius: '4px' }}>INACTIVE</span>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'monospace', opacity: 0.6 }}>ID: {u._id}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Registered: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'} · Friends: {u.friends.length}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {deleteConfirm === u._id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', minWidth: '200px' }}>
                      <span style={{ fontSize: '0.72rem', color: '#ffb3b3' }}>Enter SuperAdmin password to confirm:</span>
                      {deletePassError && <span style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>{deletePassError}</span>}
                      <input
                        type="password"
                        placeholder="SuperAdmin password"
                        value={deletePassInput}
                        onChange={e => { setDeletePassInput(e.target.value); setDeletePassError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handlePermanentDelete(u._id)}
                        autoFocus
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,0,0,0.4)', borderRadius: '6px', color: 'white', width: '190px', outline: 'none' }}
                      />
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', background: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => handlePermanentDelete(u._id)} disabled={deletingId === u._id}>
                          {deletingId === u._id && <span className="spinner"></span>}
                          {deletingId === u._id ? 'Wiping...' : 'Confirm Wipe'}
                        </button>
                        <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }} onClick={() => { setDeleteConfirm(null); setDeletePassInput(''); setDeletePassError(''); }} disabled={deletingId === u._id}>Cancel</button>
                      </div>
                    </div>
                  ) : reactivateConfirm === u._id ? (
                    <>
                      <span style={{ fontSize: '0.75rem', color: '#a3f7a3', alignSelf: 'center' }}>Reactivate account?</span>
                      <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => handleReactivate(u._id)} disabled={reactivatingId === u._id}>
                        {reactivatingId === u._id && <span className="spinner"></span>}
                        {reactivatingId === u._id ? 'Activating...' : 'Confirm'}
                      </button>
                      <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }} onClick={() => setReactivateConfirm(null)} disabled={reactivatingId === u._id}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', color: 'var(--success)' }} onClick={() => setReactivateConfirm(u._id)}>✅ Reactivate</button>
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', background: 'var(--danger)' }} onClick={() => setDeleteConfirm(u._id)}>🗑️ Delete</button>
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
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1rem' }}>
              These usernames are permanently reserved — no new account can be created with them.
            </p>
            {deletedUsernames.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                No blacklisted usernames yet.
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              {deletedUsernames.map(d => (
                <div key={d._id} style={{ background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.25)', padding: '0.35rem 0.8rem', borderRadius: '16px', fontSize: '0.78rem', color: '#ffb3b3', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}>
                  {blacklistConfirm === d._id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 'bold', color: 'white' }}>Restore {d.username}?</span>
                      <button className="btn" style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem', background: 'var(--success)', minHeight: '22px' }} onClick={() => handleRemoveBlacklist(d._id)} disabled={removingBlacklistId === d._id}>
                        {removingBlacklistId === d._id ? <span className="spinner" style={{ width: '10px', height: '10px' }}></span> : 'Yes'}
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem', minHeight: '22px' }} onClick={() => setBlacklistConfirm(null)}>No</button>
                    </div>
                  ) : (
                    <>
                      <span>🚫</span>
                      <span>{d.username}</span>
                      <span style={{ fontSize: '0.62rem', color: '#888', opacity: 0.7 }}>{new Date(d.createdAt).toLocaleDateString()}</span>
                      <button 
                        title="Remove from blacklist"
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ff5858', cursor: 'pointer', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', transition: 'background 0.2s' }}
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
