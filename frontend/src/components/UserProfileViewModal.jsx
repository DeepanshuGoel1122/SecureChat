import React, { useState } from 'react';
import FileDisplay from './FileDisplay';

function UserProfileViewModal({ isOpen, onClose, profileUser, onSendRequest, onBlockUser, onUnblockUser, onRemoveFriend, relationState, sharedMedia }) {
  const [view, setView] = useState('profile'); // 'profile' or 'media'
  const [mediaTab, setMediaTab] = useState('sent'); // 'sent' or 'received'

  // Reset state when opening a new modal
  React.useEffect(() => {
    if (isOpen) {
      setView('profile');
      setMediaTab('sent');
    }
  }, [isOpen, profileUser?._id]);

  if (!isOpen || !profileUser) return null;
  
  const displayPic = profileUser.profilePic;
  const initial = profileUser.firstName ? profileUser.firstName.charAt(0).toUpperCase() : profileUser.username?.charAt(0).toUpperCase();
  const fullName = profileUser.firstName || profileUser.lastName ? `${profileUser.firstName} ${profileUser.lastName}` : profileUser.username;

  const renderMediaSection = (messages, title) => {
    let images = [];
    let files = [];
    
    messages.forEach(msg => {
      if (msg.imageUrl) images.push(msg.imageUrl);
      if (msg.imageUrls) images.push(...msg.imageUrls);
      if (msg.file) files.push({ file: msg.file, message: msg });
      if (msg.files) msg.files.forEach(f => files.push({ file: f, message: msg }));
    });

    if (images.length === 0 && files.length === 0) return null;

    return (
      <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        {title && <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>{title}</h3>}
        {images.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '1rem' }}>
            {images.map((url, i) => (
              <div key={i} style={{ borderRadius: '8px', overflow: 'hidden', height: '80px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => sharedMedia?.openImageGallery && sharedMedia.openImageGallery(url, images)}>
                <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Media" />
              </div>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {files.map((item, i) => (
              <FileDisplay key={i} file={item.file} message={item.message} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div className="glass-panel" style={{ width: '90%', maxWidth: '400px', height: view === 'media' ? '60vh' : 'auto', maxHeight: '85vh',  display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '16px', border: '1px solid rgba(163, 113, 247, 0.3)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', textAlign: 'center', position: 'relative', overflow: 'hidden', transition: 'height 0.3s ease' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer', lineHeight: '1', zIndex: 10 }}>&times;</button>
        
        {view === 'profile' ? (
          <div style={{ padding: '2rem', overflowY: 'auto' }}>
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
                <>
                  <div style={{ padding: '0.6rem', marginTop: '0.5rem', background: 'rgba(255, 0, 0, 0.1)', color: 'var(--danger)', borderRadius: '8px', border: '1px solid rgba(255,0,0,0.3)', fontWeight: 'bold' }}>
                     You blocked this user
                  </div>
                  {onUnblockUser && (
                    <button className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', color: 'var(--success)', borderColor: 'rgba(46,160,67,0.4)', backgroundColor: 'transparent' }} onClick={() => { onUnblockUser(profileUser._id); onClose(); }}>
                       Unblock User
                    </button>
                  )}
                </>
              )}
              {sharedMedia && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <button className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem', color: 'var(--accent)', borderColor: 'rgba(88,166,255,0.3)', backgroundColor: 'rgba(88,166,255,0.05)' }} onClick={() => setView('media')}>
                    View Media
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <button 
                onClick={() => setView('profile')} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                ← Back
              </button>
              <h3 style={{ margin: 0, flex: 1, textAlign: 'center', paddingRight: '2rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Shared Media</h3>
            </div>
            
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <button 
                onClick={() => setMediaTab('sent')} 
                style={{ flex: 1, padding: '0.8rem 0.5rem', background: 'transparent', border: 'none', borderBottom: mediaTab === 'sent' ? '2px solid var(--accent)' : '2px solid transparent', color: mediaTab === 'sent' ? 'white' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Sent
              </button>
              <button 
                onClick={() => setMediaTab('received')} 
                style={{ flex: 1, padding: '0.8rem 0.5rem', background: 'transparent', border: 'none', borderBottom: mediaTab === 'received' ? '2px solid var(--accent)' : '2px solid transparent', color: mediaTab === 'received' ? 'white' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Received
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {mediaTab === 'sent' && (
                <div style={{ width: '100%' }}>
                  {!sharedMedia?.sent?.length ? (
                     <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '2rem 0' }}>No media sent.</div>
                  ) : (
                     renderMediaSection(sharedMedia.sent, null)
                  )}
                </div>
              )}

              {mediaTab === 'received' && (
                <div style={{ width: '100%' }}>
                  {!sharedMedia?.received?.length ? (
                     <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '2rem 0' }}>No media received.</div>
                  ) : (
                     renderMediaSection(sharedMedia.received, null)
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfileViewModal;
