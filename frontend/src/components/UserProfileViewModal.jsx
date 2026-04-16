import React from 'react';

function UserProfileViewModal({ isOpen, onClose, profileUser, onSendRequest, onBlockUser, onRemoveFriend, relationState }) {
  if (!isOpen || !profileUser) return null;
  
  const displayPic = profileUser.profilePic;
  const initial = profileUser.firstName ? profileUser.firstName.charAt(0).toUpperCase() : profileUser.username?.charAt(0).toUpperCase();
  const fullName = profileUser.firstName || profileUser.lastName ? `${profileUser.firstName} ${profileUser.lastName}` : profileUser.username;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="glass-panel" style={{ width: '90%', maxWidth: '400px', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(163, 113, 247, 0.3)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', textAlign: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer', lineHeight: '1' }}>&times;</button>
        
        <div style={{ width: '120px', height: '120px', borderRadius: '50%', margin: '0 auto 1.5rem auto', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem', fontWeight: 'bold', color: 'white', border: '3px solid rgba(255,255,255,0.1)' }}>
          {displayPic ? (
            <img src={displayPic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : initial}
        </div>
        
        <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>{fullName}</h2>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>@{profileUser.username}</div>
        
        {profileUser.bio && (
           <p style={{ fontSize: '0.95rem', color: 'white', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontStyle: 'italic', wordBreak: 'break-word' }}>
             "{profileUser.bio}"
           </p>
        )}
        
        <div style={{ marginTop: '1rem' }}>
          {relationState === 'friend' && (
            <div style={{ padding: '0.6rem', background: 'rgba(46, 160, 67, 0.1)', color: 'var(--success)', borderRadius: '8px', border: '1px solid var(--success)', fontWeight: 'bold' }}>
              Friends
            </div>
          )}
          {onRemoveFriend && relationState === 'friend' && (
            <button className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', color: 'var(--text-secondary)', borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'transparent' }} onClick={(e) => { onRemoveFriend(e, profileUser._id); onClose(); }}>
               Remove Friend
            </button>
          )}
          {relationState === 'sent' && (
            <div style={{ padding: '0.6rem', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', borderRadius: '8px', fontWeight: 'bold' }}>
              Request Pending
            </div>
          )}
          {relationState === 'received' && (
            <div style={{ padding: '0.6rem', background: 'rgba(88, 166, 255, 0.1)', color: 'var(--accent)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
              They sent you a request
            </div>
          )}
          {relationState === 'none' && onSendRequest && (
            <button className="btn" style={{ width: '100%', padding: '0.6rem' }} onClick={() => { onSendRequest(profileUser._id); onClose(); }}>
              Send Friend Request
            </button>
          )}
          {onBlockUser && relationState !== 'blocked' && (
            <button className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', color: 'var(--danger)', borderColor: 'rgba(255,0,0,0.2)', backgroundColor: 'transparent' }} onClick={() => { onBlockUser(profileUser._id); onClose(); }}>
               Block User
            </button>
          )}
          {relationState === 'blocked' && (
            <div style={{ padding: '0.6rem', marginTop: '0.5rem', background: 'rgba(255, 0, 0, 0.1)', color: 'var(--danger)', borderRadius: '8px', border: '1px solid rgba(255,0,0,0.3)', fontWeight: 'bold' }}>
               You blocked this user
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserProfileViewModal;
