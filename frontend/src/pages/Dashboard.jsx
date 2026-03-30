import React, { useState, useEffect, useContext } from 'react';
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
  
  const [deleteConfirm, setDeleteConfirm] = useState({ friendId: null, step: 0 });
  const [removeConfirm, setRemoveConfirm] = useState({ friendId: null, step: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
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
    try {
      const res = await fetch(`https://securechat-u1nk.onrender.com/api/users/friends/${user.id}`);
      const data = await res.json();
      setFriends(data.friends || []);
      setActiveChats(data.activeChats || []);
      setSentRequests(data.sentRequests || []);
      setReceivedRequests(data.receivedRequests || []);
      setBlockedUsers(data.blockedUsers || []);
    } catch (err) {
      console.error('Error fetching data', err);
    }
  };

  const fetchUnreadCounts = async () => {
    try {
      const res = await fetch(`https://securechat-u1nk.onrender.com/api/messages/unread/${user.id}`);
      const data = await res.json();
      setUnreadCounts(data || {});
    } catch (err) {}
  };

  const searchUsers = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      setHasSearched(true);
      const res = await fetch(`https://securechat-u1nk.onrender.com/api/users/search?q=${searchQuery}&userId=${user.id}`);
      const data = await res.json();
      setSearchResults(data); 
    } catch (err) {}
  };

  const executeAction = async (endpoint, payload) => {
    try {
      await fetch(`https://securechat-u1nk.onrender.com/api/users/${endpoint}`, {
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
        await fetch(`https://securechat-u1nk.onrender.com/api/messages/history/${user.id}/${friendId}`, { method: 'DELETE' });
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

  return (
    <div className="dashboard-container" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '2rem', width: '100%', minHeight: '100vh', padding: '1rem', boxSizing: 'border-box' }} onClick={() => { setDeleteConfirm({ friendId: null, step: 0 }); setRemoveConfirm({ friendId: null, step: 0 }); }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '700px', margin: '0 auto 2rem auto' }}>
        <h1 style={{ margin: 0, background: 'linear-gradient(to right, #58a6ff, #a371f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '1.75rem' }}>SecureChat</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Welcome, <strong style={{color: 'var(--text-primary)'}}>{user?.username}</strong>!</span>
          <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }} onClick={() => setIsSidebarOpen(true)}>Friends / Add &rarr;</button>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }} onClick={() => { logout(); navigate('/login'); }}>Logout</button>
        </div>
      </div>
      
      <div className="glass-panel dashboard-box" style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '1rem', margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="auth-title" style={{ textAlign: 'left', marginBottom: '0.5rem', fontSize: '1.25rem', background: 'none', WebkitTextFillColor: 'var(--text-primary)' }}>Your Chats</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {activeChats.length === 0 ? (
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {hasSearched && searchResults.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--danger)', textAlign: 'center', background: 'rgba(255,0,0,0.1)', borderRadius: '8px', fontSize: '0.9rem' }}>User not found.</div>}
              {searchResults.map(u => (
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
               {friends.length === 0 ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No active friends yet.</span> : 
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
               }
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

    </div>
  );
}

export default Dashboard;
