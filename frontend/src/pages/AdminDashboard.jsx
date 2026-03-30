import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function AdminDashboard() {
  const { user, logout, onlineUsers } = useContext(AuthContext);
  const navigate = useNavigate();

  const [usersInfo, setUsersInfo] = useState([]);
  const [targetUser, setTargetUser] = useState(null);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [superAdminPass, setSuperAdminPass] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    fetchTopology();
  }, [user, navigate]);

  const fetchTopology = async () => {
    try {
      const res = await fetch(`https://securechat-u1nk.onrender.com/api/admin/users`);
      const data = await res.json();
      setUsersInfo(data || []);
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
    
    try {
      const response = await fetch(`https://securechat-u1nk.onrender.com/api/admin/reset-password`, {
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
      setTimeout(() => setShowModal(false), 2000);
    } catch (err) {
      setResetError(err.message);
    }
  };

  const handleToggleDisable = async (targetUser) => {
    try {
      const response = await fetch(`https://securechat-u1nk.onrender.com/api/admin/toggle-disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser._id, isDisabled: !targetUser.isDisabled })
      });
      if (response.ok) fetchTopology();
    } catch(err) {
      console.error(err);
    }
  };

  return (
    <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '4rem', minHeight: '100vh', paddingBottom: '4rem', paddingLeft: '1rem', paddingRight: '1rem', boxSizing: 'border-box' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '900px', margin: '0 auto 2rem auto', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, color: 'var(--danger)', fontSize: '1.75rem' }}>Admin Control Center</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Elevated Rights: {user?.username}</span>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', color: 'var(--danger)' }} onClick={() => { logout(); navigate('/login'); }}>Terminate Session</button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '900px', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        
        {/* Statistics Cards */}
        <div className="glass-panel" style={{ flex: '1 1 200px', textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--success)' }}>{usersInfo.length}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total Registered Users</div>
        </div>

      </div>

      <div className="glass-panel dashboard-box" style={{ width: '100%', maxWidth: '900px', marginTop: '2rem' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Network Users Directory</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {usersInfo.map(u => {
            const isOnline = onlineUsers?.includes(u._id);
            return (
            <div key={u._id} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', borderLeft: u.role === 'admin' ? '4px solid var(--danger)' : u.isDisabled ? '4px solid #777' : '4px solid var(--success)', opacity: u.isDisabled ? 0.6 : 1 }}>
              
              <div style={{ flex: 1, minWidth: '200px' }}>
                 <div style={{ fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   {u.username}
                   {u.role === 'admin' && <span style={{ fontSize: '0.6rem', background: 'var(--danger)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>ADMIN</span>}
                   {u.isDisabled && <span style={{ fontSize: '0.6rem', background: '#777', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>DISABLED</span>}
                 </div>
                 <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>ID: {u._id}</div>
                 <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    <span style={{color: '#999'}}>Registered:</span> {u.createdAt ? new Date(u.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                 </div>
                 <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    <span style={{color: '#999'}}>Last Online:</span> {isOnline ? <span style={{ color: 'var(--success)' }}>Active Now</span> : u.lastOnline ? new Date(u.lastOnline).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Offline'}
                 </div>
              </div>

              <div style={{ flex: 2, minWidth: '200px', fontSize: '0.85rem' }}>
                 <div style={{ color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Connections ({u.friends.length}):</div>
                 {u.friends.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {u.friends.map(f => (
                         <span key={f._id} style={{ background: 'rgba(255,255,255,0.05)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>{f.username}</span>
                      ))}
                    </div>
                 ) : (
                    <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Isolated User</span>
                 )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', color: 'yellow' }} onClick={() => handleOpenReset(u)}>Reset Password</button>
                {u.role !== 'admin' && (
                  <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', color: u.isDisabled ? 'var(--success)' : 'var(--danger)' }} onClick={() => handleToggleDisable(u)}>
                    {u.isDisabled ? 'Enable User' : 'Disable User'}
                  </button>
                )}
              </div>

            </div>
          )})}
        </div>
      </div>

      {/* Reset Modal Overlay */}
      {showModal && targetUser && (
        <div className="sidebar-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setShowModal(false)}>
          <div className="glass-panel" style={{ width: '400px', background: 'rgba(20,20,30,0.95)', border: '1px solid var(--danger)', padding: '2rem' }} onClick={e => e.stopPropagation()}>
             <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--danger)' }}>Override User Credentials</h3>
             <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
               Targeting overriding hash structure for: <strong style={{color:'white'}}>{targetUser.username}</strong>
             </p>
             
             {resetError && <div style={{ color: '#ffb3b3', background: 'rgba(255,0,0,0.1)', padding: '0.5rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>{resetError}</div>}
             {resetMsg && <div style={{ color: 'var(--success)', background: 'rgba(0,255,0,0.1)', padding: '0.5rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>{resetMsg}</div>}
             
             <form onSubmit={executePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', margin: 0 }}>
               <div>
                 <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>New Password Value</label>
                 <input type="text" className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ marginBottom: 0 }} />
               </div>
               
               <div>
                 <label style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.5rem', display: 'block' }}>SuperAdmin Decrypt Key</label>
                 <input type="password" className="input-field" value={superAdminPass} onChange={e => setSuperAdminPass(e.target.value)} required style={{ border: '1px solid var(--danger)', marginBottom: 0 }} />
               </div>

               <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                 <button type="submit" className="btn" style={{ flex: 1, background: 'var(--danger)' }}>Overwrite Hash</button>
                 <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
               </div>
             </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default AdminDashboard;
