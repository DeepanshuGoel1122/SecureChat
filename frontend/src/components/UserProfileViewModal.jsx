import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import FileDisplay from './FileDisplay';
import ImageGalleryModal from './ImageGalleryModal';
import { AuthContext } from '../context/AuthContext';

function UserProfileViewModal({ isOpen, onClose, profileUser, onSendRequest, onBlockUser, onUnblockUser, onRemoveFriend, relationState, sharedMedia }) {
  const { user } = useContext(AuthContext);
  const [view, setView] = useState('profile'); // 'profile' or 'media'
  const [mediaTab, setMediaTab] = useState('sent'); // 'sent' or 'received'
  const [isProfileImageOpen, setIsProfileImageOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);

  // Lazy loading state
  const [fetchedMedia, setFetchedMedia] = useState({ sent: [], received: [] });
  const [hasMoreMedia, setHasMoreMedia] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [nextBefore, setNextBefore] = useState(null);
  
  const observer = useRef();
  
  const fetchMedia = async (isLoadMore = false) => {
    if (!user || !profileUser) return;
    if (isLoadMore && !nextBefore) return;
    
    setMediaLoading(true);
    try {
      const url = new URL(`${import.meta.env.VITE_API_URL}/api/messages/media/${user.id}/${profileUser._id}`);
      url.searchParams.append('limit', '20');
      if (isLoadMore && nextBefore) {
        url.searchParams.append('before', nextBefore);
      }
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setFetchedMedia(prev => ({
          sent: isLoadMore ? [...prev.sent, ...data.sent] : data.sent,
          received: isLoadMore ? [...prev.received, ...data.received] : data.received
        }));
        setHasMoreMedia(data.hasMore);
        setNextBefore(data.nextBefore);
      }
    } catch (err) {
      console.error('Error fetching media:', err);
    } finally {
      setMediaLoading(false);
    }
  };

  const lastMediaElementRef = useCallback(node => {
    if (mediaLoading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreMedia) {
        fetchMedia(true);
      }
    });
    if (node) observer.current.observe(node);
  }, [mediaLoading, hasMoreMedia, nextBefore]);

  // Reset state when opening a new modal
  useEffect(() => {
    if (isOpen) {
      setView('profile');
      setMediaTab('sent');
      setIsProfileImageOpen(false);
      setLoadingAction(null);
      setFetchedMedia({ sent: [], received: [] });
      setNextBefore(null);
      setHasMoreMedia(false);
    }
  }, [isOpen, profileUser?._id]);

  useEffect(() => {
    if (view === 'media' && fetchedMedia.sent.length === 0 && fetchedMedia.received.length === 0 && !nextBefore) {
      fetchMedia(false);
    }
  }, [view]);

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

    if (images.length === 0 && files.length === 0) return <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '2rem 0' }}>No media.</div>;

    return (
      <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        {title && <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>{title}</h3>}
        {images.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '1rem' }}>
            {images.map((url, i) => (
              <div key={i} style={{ borderRadius: '8px', overflow: 'hidden', aspectRatio: '1 / 1', cursor: 'pointer', border: '1px solid var(--glass-border)' }} onClick={() => sharedMedia?.openImageGallery && sharedMedia.openImageGallery(url, images)}>
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
            <div
              style={{ width: '120px', height: '120px', borderRadius: '50%', margin: '0 auto 1.5rem auto', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem', fontWeight: 'bold', color: 'white', border: '3px solid rgba(255,255,255,0.1)', cursor: displayPic ? 'pointer' : 'default' }}
              onClick={() => displayPic && setIsProfileImageOpen(true)}
              title={displayPic ? 'View full profile image' : ''}
            >
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
                <button className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', color: 'var(--text-secondary)', borderColor: 'var(--glass-border)', backgroundColor: 'transparent' }} onClick={(e) => { onRemoveFriend(e, profileUser._id); onClose(); }}>
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
                <button className="btn" style={{ width: '100%', padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={loadingAction === 'send'} onClick={async () => { 
                  setLoadingAction('send');
                  await onSendRequest(profileUser._id);
                  setLoadingAction(null);
                  onClose(); 
                }}>
                  {loadingAction === 'send' ? <span className="spinner" style={{ width: '15px', height: '15px', marginRight: 0, borderWidth: '2px', borderTopColor: 'var(--bg-dark)' }}></span> : "Send Friend Request"}
                </button>
              )}
              {onBlockUser && relationState !== 'blocked' && (
                <button className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', color: 'var(--danger)', borderColor: 'var(--danger)', backgroundColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={loadingAction === 'block'} onClick={async () => { 
                  setLoadingAction('block');
                  await onBlockUser(profileUser._id); 
                  setLoadingAction(null);
                  onClose(); 
                }}>
                   {loadingAction === 'block' ? <span className="spinner" style={{ width: '15px', height: '15px', marginRight: 0, borderWidth: '2px', borderTopColor: 'var(--danger)' }}></span> : "Block User"}
                </button>
              )}
              {relationState === 'blocked' && (
                <>
                  <div style={{ padding: '0.6rem', marginTop: '0.5rem', background: 'rgba(255, 0, 0, 0.1)', color: 'var(--danger)', borderRadius: '8px', border: '1px solid rgba(255,0,0,0.3)', fontWeight: 'bold' }}>
                     You blocked this user
                  </div>
                  {onUnblockUser && (
                    <button className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', color: 'var(--success)', borderColor: 'var(--success)', backgroundColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={loadingAction === 'unblock'} onClick={async () => { 
                      setLoadingAction('unblock');
                      await onUnblockUser(profileUser._id); 
                      setLoadingAction(null);
                      onClose(); 
                    }}>
                       {loadingAction === 'unblock' ? <span className="spinner" style={{ width: '15px', height: '15px', marginRight: 0, borderWidth: '2px', borderTopColor: 'var(--success)' }}></span> : "Unblock User"}
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
            <div style={{ display: 'flex', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
              <button 
                onClick={() => setView('profile')} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                ← Back
              </button>
              <h3 style={{ margin: 0, flex: 1, textAlign: 'center', paddingRight: '2rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Shared Media</h3>
            </div>
            
            <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)' }}>
              <button 
                onClick={() => setMediaTab('sent')} 
                style={{ flex: 1, padding: '0.8rem 0.5rem', background: 'transparent', border: 'none', borderBottom: mediaTab === 'sent' ? '2px solid var(--accent)' : '2px solid transparent', color: mediaTab === 'sent' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Sent
              </button>
              <button 
                onClick={() => setMediaTab('received')} 
                style={{ flex: 1, padding: '0.8rem 0.5rem', background: 'transparent', border: 'none', borderBottom: mediaTab === 'received' ? '2px solid var(--accent)' : '2px solid transparent', color: mediaTab === 'received' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Received
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {mediaTab === 'sent' && (
                <div style={{ width: '100%' }}>
                   {renderMediaSection(fetchedMedia.sent, null)}
                   {hasMoreMedia && <div ref={lastMediaElementRef} style={{ height: '20px' }}></div>}
                   {mediaLoading && <div style={{ textAlign: 'center', padding: '1rem' }}><span className="spinner" style={{ width: '20px', height: '20px', marginRight: 0 }}></span></div>}
                </div>
              )}

              {mediaTab === 'received' && (
                <div style={{ width: '100%' }}>
                   {renderMediaSection(fetchedMedia.received, null)}
                   {hasMoreMedia && <div ref={lastMediaElementRef} style={{ height: '20px' }}></div>}
                   {mediaLoading && <div style={{ textAlign: 'center', padding: '1rem' }}><span className="spinner" style={{ width: '20px', height: '20px', marginRight: 0 }}></span></div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <ImageGalleryModal
        isOpen={isProfileImageOpen}
        onClose={() => setIsProfileImageOpen(false)}
        images={displayPic ? [displayPic] : []}
        initialIndex={0}
      />
    </div>
  );
}

export default UserProfileViewModal;
