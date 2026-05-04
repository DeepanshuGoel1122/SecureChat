import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ProfileEditModal from '../components/ProfileEditModal';
import UserProfileViewModal from '../components/UserProfileViewModal';
import ThemeToggle from '../components/ThemeToggle';

const DASHBOARD_CACHE_TTL_MS = 30 * 1000;
const dashboardStorage = typeof window !== 'undefined' ? window.sessionStorage : null;

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
  const [isActiveChatsLoading, setIsActiveChatsLoading] = useState(false);
  const [isFriendsLoading, setIsFriendsLoading] = useState(false);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const [isLoadingMoreFriends, setIsLoadingMoreFriends] = useState(false);
  const [listPagination, setListPagination] = useState({
    activeChats: { hasMore: false, nextOffset: 0 },
    friends: { hasMore: false, nextOffset: 0, total: 0 }
  });
  
  const [deleteConfirm, setDeleteConfirm] = useState({ friendId: null, step: 0 });
  const [blockConfirm, setBlockConfirm] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loadingActions, setLoadingActions] = useState({});

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
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

  const upsertChatPreview = React.useCallback((incomingUser) => {
    if (!incomingUser?._id) return;

    setActiveChats((prev) => {
      const existingIndex = prev.findIndex((chat) => chat._id === incomingUser._id);
      const existingChat = existingIndex >= 0 ? prev[existingIndex] : null;

      const mergedChat = {
        ...existingChat,
        ...incomingUser,
      };

      if (existingIndex === 0) {
        return [mergedChat, ...prev.slice(1)];
      }

      if (existingIndex > 0) {
        return [
          mergedChat,
          ...prev.slice(0, existingIndex),
          ...prev.slice(existingIndex + 1),
        ];
      }

      return [mergedChat, ...prev];
    });
  }, []);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  
  const profileMenuRef = useRef(null);
  
  const navigate = useNavigate();
  const { user, logout, socket, onlineUsers, updateUser, pushEnabled, enablePushNotifications, disablePushNotifications } = useContext(AuthContext);

  const dashboardListsCacheKey = user?.id ? `dashboard_lists_${user.id}` : null;
  const activeChatsCacheKey = user?.id ? `dashboard_active_chats_${user.id}` : null;
  const unreadCountsCacheKey = user?.id ? `dashboard_unread_${user.id}` : null;

  const readSessionCache = React.useCallback((key) => {
    if (!key) return null;
    try {
      const cached = dashboardStorage?.getItem(key);
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (!parsed.timestamp || Date.now() - parsed.timestamp > DASHBOARD_CACHE_TTL_MS) {
        dashboardStorage?.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch {
      dashboardStorage?.removeItem(key);
      return null;
    }
  }, []);

  const writeSessionCache = React.useCallback((key, data) => {
    if (!key) return;
    try {
      dashboardStorage?.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {
      // Ignore sessionStorage quota/read-only errors.
    }
  }, []);

  const clearDashboardSessionCache = React.useCallback(() => {
    if (!dashboardListsCacheKey && !activeChatsCacheKey && !unreadCountsCacheKey) return;
    dashboardStorage?.removeItem(dashboardListsCacheKey);
    dashboardStorage?.removeItem(activeChatsCacheKey);
    dashboardStorage?.removeItem(unreadCountsCacheKey);
    console.log('[Dashboard][sessionStorage] Cleared dashboard cache after local mutation');
  }, [dashboardListsCacheKey, activeChatsCacheKey, unreadCountsCacheKey]);

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
      fetchActiveChats();
      fetchFriends({ skipActive: true });
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
          clearDashboardSessionCache();
          const sender = data.sender;

          if (sender?._id) {
            setUnreadCounts((prev) => ({
              ...prev,
              [sender._id]: (prev[sender._id] || 0) + 1,
            }));
            upsertChatPreview(sender);
          }
        }
      };
      
      const handleFriendReq = (payload) => {
        console.log('Incoming friend request received via socket!');
        clearDashboardSessionCache();
        const requester = payload?.requester;
        if (!requester?._id) {
          return;
        }

        setReceivedRequests((prev) => {
          if (prev.some((u) => String(u._id) === String(requester._id))) return prev;
          return [requester, ...prev];
        });
      };
      
      socket.on('receive_message', handleIncoming);
      socket.on('friend_request_received', handleFriendReq);
      
      return () => {
        socket.off('receive_message', handleIncoming);
        socket.off('friend_request_received', handleFriendReq);
      };
    }
  }, [socket, user, upsertChatPreview, clearDashboardSessionCache]);

  const fetchActiveChats = async ({ appendActive = false } = {}) => {
    if (appendActive) setIsLoadingMoreChats(true);
    else setIsActiveChatsLoading(true);
    try {
      if (!appendActive) {
        const cached = readSessionCache(activeChatsCacheKey);
        if (cached) {
          console.log('[Dashboard][sessionStorage] HIT for active chats; skipping API');
          setActiveChats(cached.activeChats || []);
          setListPagination((prev) => ({
            ...prev,
            activeChats: cached.pagination?.activeChats || { hasMore: false, nextOffset: 0 },
          }));
          return;
        }
        console.log('[Dashboard][sessionStorage] MISS for active chats; calling lightweight API');
      }

      const activeOffset = appendActive ? listPagination.activeChats.nextOffset : 0;
      const params = new URLSearchParams({
        activeLimit: '20',
        activeOffset: String(activeOffset),
      });
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/active-chats/${user.id}?${params.toString()}`);
      const data = await res.json();
      const source = res.headers.get('X-Cache-Source') || data.source || 'unknown';
      console.log(`[Dashboard][API] Active chats returned from ${source.toUpperCase()}: ${(data.activeChats || []).length}`);

      setActiveChats((prev) => appendActive ? [...prev, ...(data.activeChats || [])] : (data.activeChats || []));
      setListPagination((prev) => ({
        ...prev,
        activeChats: data.pagination?.activeChats || { hasMore: false, nextOffset: 0 },
      }));

      if (!appendActive) {
        writeSessionCache(activeChatsCacheKey, {
          activeChats: data.activeChats || [],
          pagination: data.pagination || null,
        });
        console.log('[Dashboard][sessionStorage] SAVED active chats');
      }
    } catch (err) {
      console.error('Error fetching active chats', err);
    } finally {
      setIsActiveChatsLoading(false);
      setIsLoadingMoreChats(false);
    }
  };

  const fetchFriends = async ({ appendActive = false, appendFriends = false, skipActive = false } = {}) => {
    if (appendActive) setIsLoadingMoreChats(true);
    else if (appendFriends) setIsLoadingMoreFriends(true);
    else setIsFriendsLoading(true);
    try {
      if (!appendActive && !appendFriends) {
        const cached = readSessionCache(dashboardListsCacheKey);
        if (cached) {
          console.log('[Dashboard][sessionStorage] HIT for chat/friend lists; skipping API');
          setFriends(cached.friends || []);
          if (!skipActive) setActiveChats(cached.activeChats || []);
          setSentRequests(cached.sentRequests || []);
          setReceivedRequests(cached.receivedRequests || []);
          setBlockedUsers(cached.blockedUsers || []);
          setListPagination(cached.pagination || {
            activeChats: { hasMore: false, nextOffset: 0 },
            friends: { hasMore: false, nextOffset: 0, total: cached.friends?.length || 0 }
          });
          return;
        }
        console.log('[Dashboard][sessionStorage] MISS for chat/friend lists; calling API');
      }

      const activeOffset = appendActive ? listPagination.activeChats.nextOffset : 0;
      const friendsOffset = appendFriends ? listPagination.friends.nextOffset : 0;
      const params = new URLSearchParams({
        activeLimit: '20',
        activeOffset: String(activeOffset),
        friendsLimit: '20',
        friendsOffset: String(friendsOffset),
        requestsLimit: '20',
        blockedLimit: '20',
        includeActive: skipActive ? '0' : '1'
      });
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/friends/${user.id}?${params.toString()}`);
      const data = await res.json();
      const source = res.headers.get('X-Cache-Source') || data.source || 'unknown';
      console.log(`[Dashboard][API] Chat/friend lists returned from ${source.toUpperCase()}`);
      setFriends((prev) => appendFriends ? [...prev, ...(data.friends || [])] : (data.friends || []));
      if (!skipActive) {
        setActiveChats((prev) => appendActive ? [...prev, ...(data.activeChats || [])] : (data.activeChats || []));
      }
      if (!appendActive && !appendFriends) {
        setSentRequests(data.sentRequests || []);
        setReceivedRequests(data.receivedRequests || []);
        setBlockedUsers(data.blockedUsers || []);
      }
      setListPagination(data.pagination || {
        activeChats: { hasMore: false, nextOffset: 0 },
        friends: { hasMore: false, nextOffset: 0, total: data.friends?.length || 0 }
      });
      if (!appendActive && !appendFriends) {
        writeSessionCache(dashboardListsCacheKey, {
          friends: data.friends || [],
          activeChats: skipActive ? [] : (data.activeChats || []),
          sentRequests: data.sentRequests || [],
          receivedRequests: data.receivedRequests || [],
          blockedUsers: data.blockedUsers || [],
          pagination: data.pagination || null
        });
        console.log('[Dashboard][sessionStorage] SAVED chat/friend lists');
      }
    } catch (err) {
      console.error('Error fetching data', err);
    } finally {
      setIsFriendsLoading(false);
      setIsLoadingMoreChats(false);
      setIsLoadingMoreFriends(false);
    }
  };

  const fetchUnreadCounts = async () => {
    try {
      const cached = readSessionCache(unreadCountsCacheKey);
      if (cached) {
        console.log('[Dashboard][sessionStorage] HIT for unread counts; skipping API');
        setUnreadCounts(cached || {});
        return;
      }
      console.log('[Dashboard][sessionStorage] MISS for unread counts; calling API');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/unread/${user.id}`);
      const data = await res.json();
      const source = res.headers.get('X-Cache-Source') || 'unknown';
      console.log(`[Dashboard][API] Unread counts returned from ${source.toUpperCase()}`);
      setUnreadCounts(data || {});
      writeSessionCache(unreadCountsCacheKey, data || {});
    } catch (err) {}
  };

  const searchUsers = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setHasSearched(false);
    try {
      const params = new URLSearchParams({ q: searchQuery.trim(), userId: user.id, limit: '20' });
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/search?${params.toString()}`);
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : (data.users || [])); 
      setHasSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const executeAction = async (endpoint, payload, onSuccess, actionKey) => {
    if (actionKey) setLoadingActions(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok && onSuccess) {
        clearDashboardSessionCache();
        
        // Invalidate specific user chat cache
        const targetId = payload.friendId || payload.requesterId || payload.receiverId || payload.blockId;
        if (targetId) {
          try {
            sessionStorage.removeItem(`chat_cache_${targetId}`);
            console.log(`[Dashboard] Invalidated local cache for ${targetId}`);
          } catch(e) {}
        }
        
        onSuccess();
      }
    } catch (err) {}
    finally {
      if (actionKey) setLoadingActions(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleSendRequest = async (friendId) => {
    await executeAction('add-friend', { userId: user.id, friendId }, () => {
      const targetUser = searchResults.find(u => u._id === friendId) || viewedProfile?.user || { _id: friendId, username: 'Unknown' };
      setSentRequests((prev) => [...prev, targetUser]);
    }, `send-${friendId}`);
  };
  const handleAcceptRequest = async (requesterId) => {
    await executeAction('accept-request', { userId: user.id, requesterId }, () => {
      const targetUser = receivedRequests.find(u => u._id === requesterId) || viewedProfile?.user || { _id: requesterId, username: 'Unknown' };
      setReceivedRequests((prev) => prev.filter((u) => u._id !== requesterId));
      setFriends((prev) => [...prev, targetUser]);
    }, `accept-${requesterId}`);
  };
  const handleRejectRequest = async (requesterId) => {
    await executeAction('reject-request', { userId: user.id, requesterId }, () => {
      setReceivedRequests((prev) => prev.filter((u) => u._id !== requesterId));
    }, `reject-${requesterId}`);
  };
  const handleCancelRequest = async (receiverId) => {
    await executeAction('cancel-request', { userId: user.id, receiverId }, () => {
      setSentRequests((prev) => prev.filter((u) => u._id !== receiverId));
    }, `cancel-${receiverId}`);
  };
  const handleBlockUser = async (blockId) => {
    setBlockConfirm(blockId);
  };

  const confirmBlockUser = async () => {
    if (!blockConfirm) return;
    setLoadingActions(prev => ({ ...prev, [`block-${blockConfirm}`]: true }));
    await executeAction('block-user', { userId: user.id, blockId: blockConfirm }, () => {
      const targetUser = friends.find(u => u._id === blockConfirm) || searchResults.find(u => u._id === blockConfirm) || viewedProfile?.user || { _id: blockConfirm, username: 'Unknown' };
      setBlockedUsers((prev) => [...prev, targetUser]);
      setFriends((prev) => prev.filter((u) => u._id !== blockConfirm));
      setActiveChats((prev) => prev.filter((u) => u._id !== blockConfirm));
    });
    setLoadingActions(prev => ({ ...prev, [`block-${blockConfirm}`]: false }));
    setBlockConfirm(null);
  };

  const handleUnblockUser = async (blockId) => {
    await executeAction('unblock-user', { userId: user.id, blockId }, () => {
      const targetUser = blockedUsers.find(u => u._id === blockId) || viewedProfile?.user || { _id: blockId, username: 'Unknown' };
      setBlockedUsers((prev) => prev.filter((u) => u._id !== blockId));
      setFriends((prev) => [...prev, targetUser]);
    }, `unblock-${blockId}`);
    if (socket) socket.emit('user_unblocked', { userId: user.id, unblockedId: blockId });
  };

  const handleRemoveFriend = async (e, friendId) => {
    if (e?.stopPropagation) e.stopPropagation();
    setRemoveConfirm(friendId);
  };

  const confirmRemoveFriend = async () => {
    if (!removeConfirm) return;
    setLoadingActions(prev => ({ ...prev, [`remove-${removeConfirm}`]: true }));
    await executeAction('remove-friend', { userId: user.id, friendId: removeConfirm }, () => {
      setFriends((prev) => prev.filter((u) => u._id !== removeConfirm));
      setActiveChats((prev) => prev.filter((u) => u._id !== removeConfirm));
    });
    setLoadingActions(prev => ({ ...prev, [`remove-${removeConfirm}`]: false }));
    setRemoveConfirm(null);
  };
  const handleDeleteChat = async (e, friendId) => {
    e.stopPropagation(); 
    if (deleteConfirm.friendId !== friendId) return setDeleteConfirm({ friendId, step: 1 });
    if (deleteConfirm.step === 1) return setDeleteConfirm({ friendId, step: 2 });
    if (deleteConfirm.step === 2) {
      try {
        await fetch(`${import.meta.env.VITE_API_URL}/api/messages/history/${user.id}/${friendId}`, { method: 'DELETE' });
        clearDashboardSessionCache();
        try { sessionStorage.removeItem(`chat_cache_${friendId}`); } catch(e){}
        setDeleteConfirm({ friendId: null, step: 0 });
        setUnreadCounts((prev) => {
          const updated = { ...prev };
          delete updated[friendId];
          return updated;
        });
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
    <div className="dashboard-container" onClick={() => { setDeleteConfirm({ friendId: null, step: 0 }); setRemoveConfirm(null); setIsProfileMenuOpen(false); }}>
      
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--header-bg)',
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
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', background: 'var(--input-bg)', padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid var(--glass-border)', minWidth: 0 }}
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
                style={{ position: 'absolute', top: '100%', right: '0', marginTop: '0.4rem', width: '220px', background: 'var(--panel-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.3rem', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}
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
                    <div style={{ padding: '0.6rem 0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: '500' }}>Theme Mode</span>
                      <ThemeToggle />
                    </div>
                    <hr style={{ border: 'none', borderBottom: '1px solid var(--glass-border)', margin: '0.25rem 0.3rem' }} />
                    <button 
                      style={{ width: '100%', textAlign: 'left', padding: '0.45rem 0.7rem', border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-border)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { setIsProfileEditOpen(true); setIsProfileMenuOpen(false); }}
                    >
                      <span style={{ fontSize: '0.75rem' }}>🧑‍🎓</span> Profile Settings
                    </button>
                    <hr style={{ border: 'none', borderBottom: '1px solid var(--glass-border)', margin: '0.25rem 0.3rem' }} />
                    <button 
                      style={{ width: '100%', textAlign: 'left', padding: '0.45rem 0.7rem', border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-border)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => setIsChangePasswordOpen(true)}
                    >
                      <span style={{ fontSize: '0.75rem' }}>🔒</span> Change Password
                    </button>
                    <hr style={{ border: 'none', borderBottom: '1px solid var(--glass-border)', margin: '0.25rem 0.3rem' }} />
                    <button 
                      style={{ width: '100%', textAlign: 'left', padding: '0.45rem 0.7rem', border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,60,60,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={openDeleteModal}
                    >
                      <span style={{ fontSize: '0.75rem' }}>🗑️</span> Delete Account
                    </button>
                    <hr style={{ border: 'none', borderBottom: '1px solid var(--glass-border)', margin: '0.25rem 0.3rem' }} />
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
          {isActiveChatsLoading ? (
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <span className="spinner" style={{ borderTopColor: 'var(--accent)', marginRight: 0 }}></span>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Fetching your chats...</div>
            </div>
          ) : activeChats.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: '1rem 0' }}>No active chats. Open the Friends menu to start one!</p>
          ) : (
            <>
            {activeChats.map(f => {
              const unread = unreadCounts[f._id] || 0;
              const displayName = f.firstName || f.lastName ? `${f.firstName} ${f.lastName}` : f.username;
              return (
                <div key={f._id} className="chat-list-item" style={{ padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => navigate(`/chat/${f._id}`)}>
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
            })}
            {listPagination.activeChats?.hasMore && (
              <button className="btn btn-secondary" style={{ marginTop: '0.5rem', padding: '0.5rem', fontSize: '0.8rem' }} onClick={() => fetchActiveChats({ appendActive: true })} disabled={isLoadingMoreChats}>
                {isLoadingMoreChats ? 'Loading...' : 'Load more chats'}
              </button>
            )}
            </>
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
                  <div key={u._id} className="chat-list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer' }} onClick={() => setViewedProfile({ user: u, relation })}>
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
                    <button className="btn btn-secondary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={loadingActions[`send-${u._id}`]} onClick={(e) => { e.stopPropagation(); handleSendRequest(u._id) }}>
                      {loadingActions[`send-${u._id}`] ? <span className="spinner" style={{ width: '12px', height: '12px', marginRight: 0, borderWidth: '2px' }}></span> : "Send Request"}
                    </button>}
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
                            <div key={r._id} className="chat-list-item" style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', borderRadius: '8px' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', cursor: 'pointer' }} onClick={() => setViewedProfile({ user: r, relation: 'received' })}>
                                 <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}>
                                   {r.profilePic ? <img src={r.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (r.firstName ? r.firstName.charAt(0).toUpperCase() : r.username.charAt(0).toUpperCase())}
                                 </div>
                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
                                   <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{r.firstName || r.lastName ? `${r.firstName} ${r.lastName}` : r.username}</span>
                                 </div>
                               </div>
                               <div style={{ display: 'flex', gap: '0.5rem' }}>
                                 <button className="btn" style={{ background: 'var(--success)', padding: '0.3rem', flex: 1, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={loadingActions[`accept-${r._id}`]} onClick={() => handleAcceptRequest(r._id)}>
                                   {loadingActions[`accept-${r._id}`] ? <span className="spinner" style={{ width: '10px', height: '10px', marginRight: 0, borderWidth: '2px', borderTopColor: 'var(--bg-dark)' }}></span> : "Accept"}
                                 </button>
                                 <button className="btn btn-secondary" style={{ padding: '0.3rem', flex: 1, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={loadingActions[`reject-${r._id}`]} onClick={() => handleRejectRequest(r._id)}>
                                   {loadingActions[`reject-${r._id}`] ? <span className="spinner" style={{ width: '10px', height: '10px', marginRight: 0, borderWidth: '2px' }}></span> : "Reject"}
                                 </button>
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
                            <div key={f._id} className="chat-list-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '8px', cursor: 'pointer' }} onClick={() => navigate(`/chat/${f._id}`)}>
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
                          {listPagination.friends?.hasMore && (
                            <button className="btn btn-secondary" style={{ padding: '0.45rem', fontSize: '0.78rem' }} onClick={() => fetchFriends({ appendFriends: true })} disabled={isLoadingMoreFriends}>
                              {isLoadingMoreFriends ? 'Loading...' : 'Load more friends'}
                            </button>
                          )}
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
                            <div key={s._id} className="chat-list-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', borderRadius: '8px' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => setViewedProfile({ user: s, relation: 'sent' })}>
                                 <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}>
                                   {s.profilePic ? <img src={s.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (s.firstName ? s.firstName.charAt(0).toUpperCase() : s.username.charAt(0).toUpperCase())}
                                 </div>
                                 <span style={{ fontSize: '0.85rem' }}>{s.firstName || s.lastName ? `${s.firstName} ${s.lastName}` : s.username}</span>
                               </div>
                               <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', color: 'var(--danger)', border: '1px solid var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }} disabled={loadingActions[`cancel-${s._id}`]} onClick={() => handleCancelRequest(s._id)}>
                                 {loadingActions[`cancel-${s._id}`] ? <span className="spinner" style={{ width: '10px', height: '10px', marginRight: 0, borderWidth: '2px', borderTopColor: 'var(--danger)' }}></span> : "Cancel"}
                               </button>
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
                            <div key={b._id} className="chat-list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,0,0,0.1)' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                 <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}>
                                   {b.profilePic ? <img src={b.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (b.firstName ? b.firstName.charAt(0).toUpperCase() : b.username.charAt(0).toUpperCase())}
                                 </div>
                                 <span style={{ fontSize: '0.85rem', color: 'var(--danger)', fontWeight: '500' }}>{b.firstName || b.lastName ? `${b.firstName} ${b.lastName}` : b.username}</span>
                               </div>
                               <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={loadingActions[`unblock-${b._id}`]} onClick={() => handleUnblockUser(b._id)}>
                                 {loadingActions[`unblock-${b._id}`] ? <span className="spinner" style={{ width: '10px', height: '10px', marginRight: 0, borderWidth: '2px' }}></span> : "Unblock"}
                               </button>
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

      {/* Block Confirmation Modal */}
      {blockConfirm && (
        <div
          onClick={() => setBlockConfirm(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(33, 38, 45, 0.98)', border: '1px solid rgba(248, 81, 73, 0.3)',
              borderRadius: '12px', padding: '1.5rem', width: '90%', maxWidth: '340px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)', textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🚫</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: '700' }}>Block this user?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              They will no longer be able to send you messages or see your profile.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button
                disabled={loadingActions[`block-${blockConfirm}`]}
                onClick={confirmBlockUser}
                style={{
                  width: '100%', padding: '0.7rem', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f85149, #991b1b)', color: 'white',
                  fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(248, 81, 73, 0.3)',
                  transition: 'transform 0.15s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                onMouseDown={(e) => !loadingActions[`block-${blockConfirm}`] && (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={(e) => !loadingActions[`block-${blockConfirm}`] && (e.currentTarget.style.transform = 'scale(1)')}
              >
                {loadingActions[`block-${blockConfirm}`] ? <span className="spinner" style={{ width: '15px', height: '15px', marginRight: 0, borderWidth: '2px' }}></span> : "Block User"}
              </button>
              <button
                onClick={() => setBlockConfirm(null)}
                style={{
                  width: '100%', padding: '0.7rem', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px', background: 'transparent', color: 'var(--text-primary)',
                  fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Friend Confirmation Modal */}
      {removeConfirm && (
        <div
          onClick={() => setRemoveConfirm(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(33, 38, 45, 0.98)', border: '1px solid rgba(248, 81, 73, 0.3)',
              borderRadius: '12px', padding: '1.5rem', width: '90%', maxWidth: '340px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)', textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>❌</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: '700' }}>Remove this friend?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              Are you sure you want to remove this user from your friends list?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button
                disabled={loadingActions[`remove-${removeConfirm}`]}
                onClick={confirmRemoveFriend}
                style={{
                  width: '100%', padding: '0.7rem', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f85149, #991b1b)', color: 'white',
                  fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(248, 81, 73, 0.3)',
                  transition: 'transform 0.15s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                onMouseDown={(e) => !loadingActions[`remove-${removeConfirm}`] && (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={(e) => !loadingActions[`remove-${removeConfirm}`] && (e.currentTarget.style.transform = 'scale(1)')}
              >
                {loadingActions[`remove-${removeConfirm}`] ? <span className="spinner" style={{ width: '15px', height: '15px', marginRight: 0, borderWidth: '2px' }}></span> : "Remove Friend"}
              </button>
              <button
                onClick={() => setRemoveConfirm(null)}
                style={{
                  width: '100%', padding: '0.7rem', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px', background: 'transparent', color: 'var(--text-primary)',
                  fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Cancel
              </button>
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
            style={{ width: '100%', maxWidth: '420px', margin: '1rem', background: 'var(--panel-bg)', border: '1px solid var(--danger)', borderRadius: '16px', padding: '2rem', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⚠️</div>
              <h2 style={{ margin: 0, color: 'var(--danger)', fontSize: '1.3rem' }}>Delete Account</h2>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Step {deleteModal.step} of 2</p>
            </div>

            {deleteModal.step === 1 ? (
              <>
                <div style={{ background: 'rgba(255,60,60,0.08)', border: '1px solid var(--danger)', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: 'var(--danger)', fontSize: '0.9rem' }}>This action will:</p>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.8' }}>
                    <li>Flag your account as <strong style={{color:'var(--danger)'}}>Inactive</strong></li>
                    <li>Block all future logins with your credentials</li>
                    <li>Queue your data for <strong style={{color:'var(--danger)'}}>permanent deletion</strong> by Admin</li>
                    <li>Log you out <strong style={{color:'var(--danger)'}}>immediately</strong></li>
                  </ul>
                </div>
                <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Are you sure you want to continue?</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-secondary" style={{ flex: 1, padding: '0.6rem' }} onClick={() => setDeleteModal(prev => ({ ...prev, open: false }))}>Cancel</button>
                  <button className="btn" style={{ flex: 1, padding: '0.6rem', background: 'var(--danger)', border: 'none', color: 'white' }} onClick={() => setDeleteModal(prev => ({ ...prev, step: 2, error: '' }))}>Yes, Continue</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '1.25rem' }}>Enter your password to confirm you are the owner of this account. This is your <strong>final</strong> confirmation.</p>
                {deleteModal.error && (
                  <div style={{ background: 'rgba(255,0,0,0.12)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '0.6rem 0.9rem', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--danger)' }}>{deleteModal.error}</div>
                )}
                <input 
                  type="password"
                  className="input-field"
                  placeholder="Enter your current password"
                  value={deleteModal.password}
                  onChange={e => setDeleteModal(prev => ({ ...prev, password: e.target.value, error: '' }))}
                  onKeyDown={e => e.key === 'Enter' && handleSoftDelete()}
                  autoFocus
                  style={{ marginBottom: '1rem', border: '1px solid var(--danger)' }}
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
        onUnblockUser={handleUnblockUser}
        onRemoveFriend={handleRemoveFriend}
      />
    </div>
  );
}

export default Dashboard;
