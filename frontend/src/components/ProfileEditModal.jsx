import React, { useState, useRef, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import ImageGalleryModal from './ImageGalleryModal';

// Small inline confirmation dialog
const CompactConfirm = ({ isOpen, title, onConfirm, onCancel, confirmText = "Yes", cancelText = "No" }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--modal-backdrop)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div className="glass-panel" style={{ width: '280px', padding: '1.25rem', borderRadius: '12px', textAlign: 'center', boxShadow: 'var(--modal-shadow)' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: '600' }}>{title}</h3>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }} onClick={onCancel}>{cancelText}</button>
          <button type="button" className="btn" style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', background: 'var(--danger)' }} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
};

function ProfileEditModal({ isOpen, onClose, isFirstSetup = false }) {
  const { user, updateUser } = useContext(AuthContext);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [profilePic, setProfilePic] = useState(user?.profilePic || '');
  const [isProfileImageOpen, setIsProfileImageOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 25 * 1024 * 1024) {
      alert("Image size must be less than 25MB");
      return;
    }
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/upload?quality=compressed`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setProfilePic(data.imageUrl);
      } else {
        alert(data.message || "Failed to upload image");
      }
    } catch (err) {
      alert("Network error while uploading image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/profile-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, firstName, lastName, bio, profilePic })
      });
      const data = await res.json();
      if (res.ok) {
        updateUser({ firstName, lastName, bio, profilePic, isProfileSetup: true });
        onClose();
      } else {
        alert(data.message || "Failed to update profile");
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    sessionStorage.setItem('skipProfileSetup', 'true');
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--modal-backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)', animation: 'fadeInFast 0.22s ease both' }} onClick={!isFirstSetup ? onClose : undefined}>
      <div className="glass-panel" style={{ width: '90%', maxWidth: '450px', padding: '2rem', borderRadius: '16px', border: '1px solid var(--glass-border)', boxShadow: 'var(--modal-shadow)', overflowY: 'auto', maxHeight: '90vh', animation: 'popIn 0.35s cubic-bezier(0.22,1,0.36,1) both' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)', textAlign: 'center', fontSize: '1.5rem' }}>
          {isFirstSetup ? 'Complete Your Profile' : 'Edit Profile'}
        </h2>
        
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{ width: '100px', height: '100px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', fontWeight: 'bold', color: 'white', position: 'relative', border: '3px solid rgba(255,255,255,0.1)', cursor: profilePic ? 'pointer' : 'default' }}
              onClick={() => profilePic && !isUploading && setIsProfileImageOpen(true)}
              title={profilePic ? 'View full profile image' : ''}
            >
              {profilePic ? (
                <img src={profilePic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                (firstName ? firstName.charAt(0).toUpperCase() : user?.username?.charAt(0).toUpperCase() || '?')
              )}
              {isUploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="spinner" style={{ width: '30px', height: '30px' }}></span>
                </div>
              )}
            </div>
            
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} style={{ display: 'none' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }} onClick={() => fileInputRef.current.click()} disabled={isUploading}>
                {profilePic ? 'Change Picture' : 'Add Picture'}
              </button>
              {profilePic && (
                <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'rgba(244, 63, 94, 0.4)' }} onClick={() => setIsRemoveConfirmOpen(true)} disabled={isUploading}>
                  Remove
                </button>
              )}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block' }}>First Name</label>
              <input type="text" className="input-field" style={{ marginBottom: 0 }} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name" />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block' }}>Last Name</label>
              <input type="text" className="input-field" style={{ marginBottom: 0 }} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name" />
            </div>
          </div>
          
          <div 
          >
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block' }}>Bio</label>
            <textarea className="input-field" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us about yourself..." style={{ minHeight: '80px', resize: 'vertical', marginBottom: 0 }}></textarea>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            {isFirstSetup ? (
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={handleSkip}>Skip for now</button>
            ) : (
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            )}
            <button type="submit" className="btn" style={{ flex: 1 }} disabled={isSaving || isUploading}>
              {isSaving ? <><span className="spinner" style={{ width: '15px', height: '15px', marginRight: '5px' }}></span> Saving...</> : 'Save Profile'}
            </button>
          </div>
          
        </form>
      </div>
      <ImageGalleryModal
        isOpen={isProfileImageOpen}
        onClose={() => setIsProfileImageOpen(false)}
        images={profilePic ? [profilePic] : []}
        initialIndex={0}
      />
      <CompactConfirm 
        isOpen={isRemoveConfirmOpen}
        title="Remove Profile Picture?"
        onConfirm={() => {
          setProfilePic('');
          setIsRemoveConfirmOpen(false);
        }}
        onCancel={() => setIsRemoveConfirmOpen(false)}
        confirmText="Remove"
      />
    </div>
  );
}

export default ProfileEditModal;
