import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import UserProfileViewModal from '../components/UserProfileViewModal';
import FileDisplay from '../components/FileDisplay';
import { formatFileSize } from '../assets/fileIcons';
import ImageGalleryModal from '../components/ImageGalleryModal';

const CHAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CHAT_BACKGROUND_REFRESH_INTERVAL_MS = 30 * 1000;
const chatStorage = typeof window !== 'undefined' ? window.sessionStorage : null;

function ChatRoom() {
  const { friendId } = useParams(); 
  const { user, socket, onlineUsers } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [friendDetails, setFriendDetails] = useState(null);
  
  // Cache messages per friend to avoid re-fetching
  const [messagesCache, setMessagesCache] = useState(new Map());
  
  // Load cached chat data from sessionStorage. Message bodies should not persist after the browser session.
  const loadFromSessionStorage = (friendId) => {
    const cacheKey = `chat_cache_${friendId}`;
    try {
      const cached = chatStorage?.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Check if cache is not too old (24 hours)
        if (parsed.timestamp && (Date.now() - parsed.timestamp) < CHAT_CACHE_TTL_MS) {
          console.log(`[ChatRoom][sessionStorage] HIT for friend ${friendId}: ${parsed.messages?.length || 0} cached messages`);
          return parsed;
        } else {
          // Remove expired cache
          console.log(`[ChatRoom][sessionStorage] EXPIRED for friend ${friendId}; removing stale cache`);
          chatStorage?.removeItem(cacheKey);
        }
      } else {
        console.log(`[ChatRoom][sessionStorage] MISS for friend ${friendId}`);
      }
    } catch (e) {
      console.warn(`[ChatRoom][sessionStorage] Failed to load cache for friend ${friendId}:`, e);
      chatStorage?.removeItem(cacheKey);
    }
    return null;
  };

  // Persist chat cache to sessionStorage
  const persistToSessionStorage = (friendId, data) => {
    try {
      const messagesCount = data.messages?.length || 0;
      chatStorage?.setItem(`chat_cache_${friendId}`, JSON.stringify({
        ...data,
        timestamp: Date.now()
      }));
      console.log(`[ChatRoom][sessionStorage] SAVED for friend ${friendId}: ${messagesCount} messages`);
    } catch (e) {
      console.warn(`[ChatRoom][sessionStorage] Failed to persist cache for friend ${friendId}:`, e);
    }
  };
  
  const [userState, setUserState] = useState('none'); // 'friend', 'sent_pending', 'received_pending', 'blocked', 'none'
  const [sentCount, setSentCount] = useState(0);
  const [isAccepting, setIsAccepting] = useState(false);

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [maxVisible, setMaxVisible] = useState(20);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [galleryState, setGalleryState] = useState({ isOpen: false, initialIndex: 0, images: [] });
  const [compressionMode, setCompressionMode] = useState('compressed'); // 'compressed' or 'hd'
  const [isCompressing, setIsCompressing] = useState(false);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [isNetworkOnline, setIsNetworkOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // File upload states
  const [fileUploadError, setFileUploadError] = useState(null);
  const [allowMediaSharing, setAllowMediaSharing] = useState(false);
  const [allowFileUpload, setAllowFileUpload] = useState(false);
  const [allowRestrictedFileUpload, setAllowRestrictedFileUpload] = useState(false);
  const [allowUnrestrictedFileUpload, setAllowUnrestrictedFileUpload] = useState(false);
  const [canMediaSharing, setCanMediaSharing] = useState(true);
  const [canRestrictedFileUpload, setCanRestrictedFileUpload] = useState(true);
  const [canUnrestrictedFileUpload, setCanUnrestrictedFileUpload] = useState(false);
  const [verifiedFileTypes, setVerifiedFileTypes] = useState([]);
  const [maxFileSize, setMaxFileSize] = useState(25); // in MB

  const [allowMessageDelete, setAllowMessageDelete] = useState(false);
  const [canDeleteMessages, setCanDeleteMessages] = useState(true);
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState(null);
  const [blockConfirm, setBlockConfirm] = useState(null);
  const [isBlockingAction, setIsBlockingAction] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [isRemovingAction, setIsRemovingAction] = useState(false);
  const [isViewProfileOpen, setIsViewProfileOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileAttachmentRef = useRef(null);
  const chatContainerRef = useRef(null);
  const firstUnreadIdRef = useRef(null);
  const unreadDividerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);
  const suppressNextAutoScrollRef = useRef(false);
  const pendingFlushLockRef = useRef(false);
  const pendingMessagesRef = useRef([]);
  const isSuperAdmin = user?.isSuperAdminSession === true || user?.isSuperAdminSession === 'true';
  const canShareMedia = isSuperAdmin || user?.role === 'admin' || (allowMediaSharing && canMediaSharing);
  const canUseRestrictedUpload = isSuperAdmin || (canShareMedia && (canRestrictedFileUpload !== false));
  const canUseUnrestrictedUpload = isSuperAdmin || (canShareMedia && allowUnrestrictedFileUpload && canUnrestrictedFileUpload);
  const canAttachFile = isSuperAdmin || canUseRestrictedUpload || canUseUnrestrictedUpload;
  const canUseDelete = isSuperAdmin || user?.role === 'admin' || (allowMessageDelete && canDeleteMessages !== false);
  const pendingStorageKey = user?.id && friendId ? `pending_msgs_${user.id}_${friendId}` : null;
  const clearDashboardSessionCache = React.useCallback(() => {
    if (!user?.id) return;
    chatStorage?.removeItem(`dashboard_lists_${user.id}`);
    chatStorage?.removeItem(`dashboard_unread_${user.id}`);
  }, [user?.id]);

  useEffect(() => {
    pendingMessagesRef.current = pendingMessages;
  }, [pendingMessages]);

  const removePendingMessage = React.useCallback((clientId) => {
    setPendingMessages(prev => prev.filter((m) => m.clientId !== clientId));
  }, [user?.id, friendId]);

  const flushPendingMessages = React.useCallback(() => {
    if (!socket || !socket.connected || !isNetworkOnline) return;
    if (pendingFlushLockRef.current) return;

    const now = Date.now();
    const candidates = pendingMessagesRef.current.filter((msg) => {
      // Skip messages that are already in flight and were attempted less than 4 seconds ago
      if (msg.inFlight && msg.lastAttemptAt && now - msg.lastAttemptAt < 4000) return false;
      return true;
    });
    if (candidates.length === 0) return;

    // Set lock BEFORE any state updates to prevent concurrent executions
    pendingFlushLockRef.current = true;

    try {
      setPendingMessages((prev) =>
        prev.map((msg) =>
          candidates.some((c) => c.clientId === msg.clientId)
            ? { ...msg, inFlight: true, lastAttemptAt: now }
            : msg
        )
      );

      // Emit messages to server - only once per message
      candidates.forEach((msg) => {
        socket.emit('send_message', {
          senderId: user.id,
          receiverId: friendId,
          text: msg.text,
          imageUrl: null,
          imageUrls: [],
          file: null,
          files: [],
          replyTo: msg.replyTo?._id || null
        });
      });
    } finally {
      // Release lock after a short delay to allow for async operations
      setTimeout(() => {
        pendingFlushLockRef.current = false;
      }, 100);
    }
  }, [socket, isNetworkOnline, user?.id, friendId]);

  useEffect(() => {
    if (!pendingStorageKey) return;
    try {
      const stored = chatStorage?.getItem(pendingStorageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      setPendingMessages(Array.isArray(parsed) ? parsed : []);
    } catch {
      setPendingMessages([]);
    }
  }, [pendingStorageKey]);

  useEffect(() => {
    if (!pendingStorageKey) return;
    try {
      if (pendingMessages.length === 0) {
        chatStorage?.removeItem(pendingStorageKey);
      } else {
        chatStorage?.setItem(pendingStorageKey, JSON.stringify(pendingMessages));
      }
    } catch {
      // Ignore sessionStorage quota/read-only errors
    }
  }, [pendingMessages, pendingStorageKey]);

  useEffect(() => {
    const onOnline = () => {
      setIsNetworkOnline(true);
      setTimeout(() => flushPendingMessages(), 150);
    };
    const onOffline = () => {
      setIsNetworkOnline(false);
      setPendingMessages((prev) => prev.map((m) => ({ ...m, inFlight: false })));
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushPendingMessages]);

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => flushPendingMessages();
    const onDisconnect = () => setPendingMessages((prev) => prev.map((m) => ({ ...m, inFlight: false })));
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket, flushPendingMessages]);

  useEffect(() => {
    if (pendingMessages.length > 0) {
      flushPendingMessages();
    }
  }, [pendingMessages.length, flushPendingMessages]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isViewProfileOpen) {
          setIsViewProfileOpen(false);
        } else if (galleryState.isOpen) {
          setGalleryState(prev => ({ ...prev, isOpen: false }));
        } else if (deleteConfirmMsg) {
          setDeleteConfirmMsg(null);
        } else if (blockConfirm) {
          setBlockConfirm(null);
        } else if (removeConfirm) {
          setRemoveConfirm(null);
        } else if (activeMenuId) {
          setActiveMenuId(null);
        } else if (selectedAttachments.length > 0) {
          setSelectedAttachments([]);
          setFileUploadError(null);
        } else if (replyingTo || editingMessage) {
          setReplyingTo(null);
          setEditingMessage(null);
          // Only clear input if we were editing (not replying) to avoid losing draft
          if (editingMessage) setInputMessage('');
        } else {
          // No modal/context open, go back to dashboard safely
          navigate('/dashboard');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isViewProfileOpen, galleryState.isOpen, deleteConfirmMsg, blockConfirm, removeConfirm, activeMenuId, selectedAttachments, replyingTo, editingMessage, navigate]);

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id || !friendId) return;

      setIsLoadingChat(true);
      setMaxVisible(20);
      firstUnreadIdRef.current = null;
      hasLoadedOnceRef.current = false;

      // First, try to load from sessionStorage
      const localCache = loadFromSessionStorage(friendId);

      if (localCache && Array.isArray(localCache.messages)) {
        console.log(`[ChatRoom] Rendering chat immediately from sessionStorage for friend ${friendId}`);

        // Load cached data immediately
        setMessages(localCache.messages);
        setHasMoreMessages(localCache.hasMore || false);
        setSentCount(localCache.sentCount || 0);
        setFriendDetails(localCache.friendDetails || null);
        setUserState(localCache.userState || 'none');

        // Update in-memory cache
        setMessagesCache(prev => new Map(prev).set(friendId, localCache));

        const cacheAgeMs = Date.now() - (localCache.timestamp || 0);
        if (cacheAgeMs < CHAT_BACKGROUND_REFRESH_INTERVAL_MS) {
          console.log(`[ChatRoom][API] Skipping background refresh for friend ${friendId}; sessionStorage is fresh (${Math.round(cacheAgeMs / 1000)}s old)`);
          if (socket && localCache.userState === 'friend') {
            socket.emit('mark_read', { userId: user.id, friendId });
            socket.emit('enter_chat', { userId: user.id, friendId });
            clearDashboardSessionCache();
          }

          setIsLoadingChat(false);
          return;
        }

        // Now fetch latest messages in background to update cache
        try {
          console.log(`[ChatRoom][API] Checking latest messages for friend ${friendId} after sessionStorage render`);
          const histRes = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/history/${user.id}/${friendId}?limit=20&paged=1`);
          if (histRes.ok) {
            const histPayload = await histRes.json();
            const latestMessages = Array.isArray(histPayload) ? histPayload : (histPayload.messages || []);
            const hasMore = Boolean(histPayload.hasMore);
            const source = Array.isArray(histPayload) ? 'unknown' : (histPayload.source || 'unknown');
            console.log(`[ChatRoom][API] Latest messages returned from ${source.toUpperCase()} for friend ${friendId}: ${latestMessages.length} messages`);

            if (latestMessages.length > 0) {
              // Merge with cached messages, keeping newer ones
              const existingIds = new Set(localCache.messages.map(m => m._id));
              const newMessages = [
                ...latestMessages.filter(m => !existingIds.has(m._id)),
                ...localCache.messages
              ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

              const newSentCount = newMessages.filter(m => m.sender._id === user.id).length;

              setMessages(newMessages);
              setHasMoreMessages(hasMore);
              setSentCount(newSentCount);

              // Update cache and persist
              const updatedCache = {
                messages: newMessages,
                hasMore,
                sentCount: newSentCount,
                friendDetails: localCache.friendDetails,
                userState: localCache.userState
              };

              setMessagesCache(prev => new Map(prev).set(friendId, updatedCache));
              persistToSessionStorage(friendId, updatedCache);
            } else {
              console.log(`[ChatRoom][API] No newer messages found for friend ${friendId}; keeping sessionStorage data`);
            }
          }
        } catch (err) {
          console.warn('[ChatRoom] Failed to fetch latest messages:', err);
          // Keep cached data if fetch fails
        }

        // Mark as read if friend
        if (socket && localCache.userState === 'friend') {
          socket.emit('mark_read', { userId: user.id, friendId });
          socket.emit('enter_chat', { userId: user.id, friendId });
          clearDashboardSessionCache();
        }

        setIsLoadingChat(false);
        return;
      }

      // No cache, fetch from API
      setMessages([]);
      setHasMoreMessages(false);
      try {
        console.log(`[ChatRoom] No usable sessionStorage chat cache; fetching relationship/profile/history for friend ${friendId}`);
        const relationRes = await fetch(`${import.meta.env.VITE_API_URL}/api/users/relationship/${user.id}/${friendId}`);
        if (!relationRes.ok) throw new Error(`Relationship fetch failed: ${relationRes.status}`);
        const relation = await relationRes.json();

        const isFriend = relation.isFriend;
        const isSentReq = relation.isSentReq;
        const isRecvReq = relation.isRecvReq;
        const isBlocked = relation.isBlocked;

        let currentUserState = 'none';
        if (isBlocked) currentUserState = 'blocked';
        else if (isFriend) currentUserState = 'friend';
        else if (isRecvReq) currentUserState = 'received_pending';
        else if (isSentReq) currentUserState = 'sent_pending';
        setUserState(currentUserState);

        const userRes = await fetch(`${import.meta.env.VITE_API_URL}/api/users/user/${friendId}`);
        let currentFriendDetails = null;
        if (userRes.ok) {
          currentFriendDetails = await userRes.json();
          setFriendDetails(currentFriendDetails);
        }

        const histRes = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/history/${user.id}/${friendId}?limit=20&paged=1`);
        let histData = [];
        let hasMore = false;
        let sentCountValue = 0;
        if (histRes.ok) {
          const histPayload = await histRes.json();
          histData = Array.isArray(histPayload) ? histPayload : (histPayload.messages || []);
          hasMore = Boolean(histPayload.hasMore);
          const source = Array.isArray(histPayload) ? 'unknown' : (histPayload.source || 'unknown');
          console.log(`[ChatRoom][API] Initial messages returned from ${source.toUpperCase()} for friend ${friendId}: ${histData.length} messages`);

          // Capture the first unread message from friend BEFORE marking as read
          if (!hasLoadedOnceRef.current) {
            const firstUnread = histData.find(m => m.sender._id === friendId && !m.isRead);
            firstUnreadIdRef.current = firstUnread ? firstUnread._id : null;
            hasLoadedOnceRef.current = true;
          }

          sentCountValue = histData.filter(m => m.sender._id === user.id).length;
        }

        setMessages(histData);
        setHasMoreMessages(hasMore);
        setSentCount(sentCountValue);

        // Cache the loaded data and persist to sessionStorage
        const cacheData = {
          messages: histData,
          hasMore,
          sentCount: sentCountValue,
          friendDetails: currentFriendDetails,
          userState: currentUserState
        };

        setMessagesCache(prev => new Map(prev).set(friendId, cacheData));
        persistToSessionStorage(friendId, cacheData);

        if (socket && currentUserState === 'friend') {
          socket.emit('mark_read', { userId: user.id, friendId });
          socket.emit('enter_chat', { userId: user.id, friendId });
          clearDashboardSessionCache();
        }
      } catch (err) {
        console.error('[ChatRoom] Error fetching data:', err);
      } finally {
        setIsLoadingChat(false);
      }
    };
    
    if (user?.id) {
      loadData();
      // Fetch this specific user's delete permission
      fetch(`${import.meta.env.VITE_API_URL}/api/users/user/${user.id}`)
        .then(res => res.json())
        .then(data => {
           if (data && data.allowMediaSharing !== undefined) {
             setAllowMediaSharing(data.allowMediaSharing);
           }
           if (data && data.allowUnrestrictedFileUpload !== undefined) {
             setAllowUnrestrictedFileUpload(data.allowUnrestrictedFileUpload);
           }
           if (data && data.canDeleteMessages !== undefined) {
             setCanDeleteMessages(data.canDeleteMessages);
           }
           if (data) {
             setCanMediaSharing((data.canMediaSharing ?? data.canUploadFiles) !== false);
             setCanRestrictedFileUpload((data.canRestrictedFileUpload ?? data.canUploadFiles) !== false);
             setCanUnrestrictedFileUpload(data.canUnrestrictedFileUpload !== false);
             if (data.maxFileSize) setMaxFileSize(data.maxFileSize);
           }
        })
        .catch(() => {});
    }

    return () => {
      if (socket && user?.id && friendId) {
        socket.emit('leave_chat', { userId: user.id, friendId });
      }
    };
  }, [user, friendId, socket, clearDashboardSessionCache]);

  // Cleanup expired chat cache entries from sessionStorage
  useEffect(() => {
    const cleanupExpiredCache = () => {
      try {
        const persistentStorage = window.localStorage;
        Object.keys(persistentStorage).forEach((key) => {
          if (key.startsWith('chat_cache_') || key.startsWith('pending_msgs_') || key === `draft_${user?.id}_${friendId}`) {
            persistentStorage.removeItem(key);
          }
        });

        const keys = Object.keys(chatStorage || {});
        const chatCacheKeys = keys.filter(key => key.startsWith('chat_cache_'));
        
        chatCacheKeys.forEach(key => {
          try {
            const cached = JSON.parse(chatStorage?.getItem(key));
            // Remove if older than 24 hours
            if (!cached.timestamp || (Date.now() - cached.timestamp) > CHAT_CACHE_TTL_MS) {
              chatStorage?.removeItem(key);
            }
          } catch (e) {
            // Remove corrupted cache entries
            chatStorage?.removeItem(key);
          }
        });
      } catch (e) {
        console.warn('Failed to cleanup expired cache:', e);
      }
    };

    // Run cleanup on mount and every hour
    cleanupExpiredCache();
    const interval = setInterval(cleanupExpiredCache, 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user?.id && friendId) {
      const draft = chatStorage?.getItem(`draft_${user.id}_${friendId}`);
      if (draft) {
        setInputMessage(draft);
      } else {
        setInputMessage('');
      }
    }
  }, [user?.id, friendId]);

  // Load file upload settings + global delete permission from admin
  useEffect(() => {
    const loadFileSettings = async () => {
      try {
        const [fileRes, settingsRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/admin/file-settings`),
          fetch(`${import.meta.env.VITE_API_URL}/api/admin/settings`),
        ]);
        if (fileRes.ok) {
          const data = await fileRes.json();
          setAllowMediaSharing(data.allowMediaSharing ?? data.allowFileUpload ?? false);
          setAllowFileUpload(data.allowFileUpload || false);
          setAllowRestrictedFileUpload(data.allowRestrictedFileUpload ?? data.allowFileUpload ?? false);
          setAllowUnrestrictedFileUpload(data.allowUnrestrictedFileUpload || false);
          setVerifiedFileTypes(data.verifiedFileTypes || data.allowedFileTypes || []);
          setMaxFileSize(data.maxFileSize || 25);
        }
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          // allowMessageDelete is a global admin setting stored on the admin doc
          if (settings.allowMessageDelete !== undefined) {
            setAllowMessageDelete(settings.allowMessageDelete);
          }
        }
      } catch (error) {
        console.error('Error loading file settings:', error);
      }
    };
    loadFileSettings();
  }, []);

  const handleBlockUser = async (targetId) => {
    setBlockConfirm(targetId);
  };

  const confirmBlockUser = async () => {
    if (!blockConfirm) return;
    setIsBlockingAction(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/block-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, blockId: blockConfirm })
      });
      if (res.ok) {
        setUserState('blocked');
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to block user');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while blocking user');
    } finally {
      setIsBlockingAction(false);
      setBlockConfirm(null);
    }
  };

  const handleUnblockUser = async (targetId) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/unblock-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, blockId: targetId })
      });
      if (res.ok) {
        setUserState('friend');
        if (socket) socket.emit('user_unblocked', { userId: user.id, unblockedId: targetId });
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to unblock user');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while unblocking user');
    }
  };

  const handleRemoveFriend = async (e, friendId) => {
    if (e?.stopPropagation) e.stopPropagation(); 
    setRemoveConfirm(friendId);
  };

  const confirmRemoveFriend = async () => {
    if (!removeConfirm) return;
    setIsRemovingAction(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/remove-friend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId: removeConfirm })
      });
      if (res.ok) {
        setUserState('none');
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to remove friend');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setIsRemovingAction(false);
      setRemoveConfirm(null);
    }
  };

  useEffect(() => {
    if (!socket || !user?.id) return;

    const handleReceive = (data) => {
      if (
        (data.sender._id === user.id && data.receiver._id === friendId) || 
        (data.sender._id === friendId && data.receiver._id === user.id)
      ) {
        clearDashboardSessionCache();
        // First, remove any matching pending messages BEFORE adding the real message
        let pendingClientId = null;
        if (data.sender._id === user.id && data.receiver._id === friendId) {
          // This is our message coming back from server, try to find and remove the pending version
          setPendingMessages((prev) => {
            const matchIndex = prev.findIndex((p) => {
              // Match pending messages by text and replyTo
              const textMatch = p.text === (data.text || '');
              const replyMatch = 
                (p.replyTo === null && data.replyTo === null) ||
                (p.replyTo?._id === data.replyTo?._id);
              return textMatch && replyMatch;
            });
            
            if (matchIndex !== -1) {
              pendingClientId = prev[matchIndex].clientId;
              return prev.filter((_, idx) => idx !== matchIndex);
            }
            return prev;
          });
        }

        // Now add the real message, but check if it's already in messages (avoid duplicates)
        setMessages((prev) => {
          // Check if message with this ID already exists
          if (prev.some(m => m._id === data._id)) {
            return prev; // Don't add duplicate
          }
          const newMessages = [...prev, data];
          const newSentCount = newMessages.filter(m => m.sender._id === user.id).length;
          setSentCount(newSentCount);
          
          // Update cache with new message
          setMessagesCache(prevCache => {
            const current = prevCache.get(friendId);
            if (current) {
              const updated = { ...current, messages: newMessages, sentCount: newSentCount };
              persistToSessionStorage(friendId, updated);
              return new Map(prevCache).set(friendId, updated);
            }
            return prevCache;
          });
          
          return newMessages;
        });
        
        if (data.sender._id === friendId && userState === 'friend') {
           socket.emit('mark_read', { userId: user.id, friendId });
           clearDashboardSessionCache();
        }
        
        if (chatContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
          if (scrollHeight - scrollTop - clientHeight < 150) {
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
        }
      }
    };

    const handleEditReceive = (data) => {
      if (
        (data.sender._id === user.id && data.receiver._id === friendId) || 
        (data.sender._id === friendId && data.receiver._id === user.id)
      ) {
        clearDashboardSessionCache();
        setMessages((prev) => {
          const updated = prev.map(m => m._id === data._id ? data : m);
          // Update cache
          setMessagesCache(prevCache => {
            const current = prevCache.get(friendId);
            if (current) {
              const cacheUpdated = { ...current, messages: updated };
              persistToSessionStorage(friendId, cacheUpdated);
              return new Map(prevCache).set(friendId, cacheUpdated);
            }
            return prevCache;
          });
          return updated;
        });
      }
    };

    const handleError = (msg) => {
      alert(`Server Notice: ${msg}`);
    };

    const handleMessagesRead = ({ byUserId }) => {
      if (byUserId === friendId) {
        clearDashboardSessionCache();
        setMessages((prev) => {
          const updated = prev.map(m => m.receiver._id === friendId ? { ...m, isRead: true } : m);
          // Update cache
          setMessagesCache(prevCache => {
            const current = prevCache.get(friendId);
            if (current) {
              const cacheUpdated = { ...current, messages: updated };
              persistToSessionStorage(friendId, cacheUpdated);
              return new Map(prevCache).set(friendId, cacheUpdated);
            }
            return prevCache;
          });
          return updated;
        });
      }
    };

    const handleUnblockedYou = (unblockerId) => {
      if (unblockerId === friendId) {
        setUserState('friend');
      }
    };

    socket.on('receive_message', handleReceive);
    socket.on('message_edited', handleEditReceive);
    socket.on('messages_read', handleMessagesRead);
    socket.on('chat_error', handleError);
    socket.on('friend_unblocked_you', handleUnblockedYou);

    const handleDeleteReceive = ({ messageId }) => {
      clearDashboardSessionCache();
      setMessages((prev) => {
        const filtered = prev.filter(m => m._id !== messageId);
        const newSentCount = filtered.filter(m => m.sender._id === user.id).length;
        setSentCount(newSentCount);
        
        // Update cache
        setMessagesCache(prevCache => {
          const current = prevCache.get(friendId);
          if (current) {
            const cacheUpdated = { ...current, messages: filtered, sentCount: newSentCount };
            persistToSessionStorage(friendId, cacheUpdated);
            return new Map(prevCache).set(friendId, cacheUpdated);
          }
          return prevCache;
        });
        
        return filtered;
      });
    };
    socket.on('message_deleted', handleDeleteReceive);
    
    return () => {
      socket.off('receive_message', handleReceive);
      socket.off('message_edited', handleEditReceive);
      socket.off('messages_read', handleMessagesRead);
      socket.off('chat_error', handleError);
      socket.off('message_deleted', handleDeleteReceive);
      socket.off('friend_unblocked_you', handleUnblockedYou);
    };
  }, [socket, user, friendId, userState, clearDashboardSessionCache]);

  useEffect(() => {
    if (isLoadingChat) return;
    if (suppressNextAutoScrollRef.current) {
      suppressNextAutoScrollRef.current = false;
      return;
    }
    // Use requestAnimationFrame to ensure DOM is updated before scrolling
    requestAnimationFrame(() => {
      setTimeout(() => {
        // If there's an unread divider, scroll to it; otherwise scroll to bottom
        if (unreadDividerRef.current) {
          unreadDividerRef.current.scrollIntoView({ block: 'center' });
        } else {
          messagesEndRef.current?.scrollIntoView();
        }
      }, 50);
    });
  }, [messages.length, pendingMessages.length, isLoadingChat]);

  const handleImageLoad = () => {
    if (suppressNextAutoScrollRef.current) return;
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      if (scrollHeight - scrollTop - clientHeight < 500) {
        messagesEndRef.current?.scrollIntoView();
      }
    }
  }; 

  useEffect(() => {
    // Auto-focus input when chat loads and user has permission to type
    if (!isLoadingChat && (userState === 'friend' || userState.includes('pending')) && inputRef.current) {
      // Small timeout ensures the DOM node is fully painted if userState just changed
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [isLoadingChat, userState, friendId]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const TARGET_SIZE = 5 * 1024 * 1024; // 5MB threshold

  const compressImage = (file, mode) => {
    return new Promise((resolve) => {
      // HD mode: if file is already under 5MB, send as-is
      if (mode === 'hd' && file.size <= TARGET_SIZE) {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          if (mode === 'compressed') {
            // Normal compression: resize to max 1920px
            const MAX_DIM = 1920;
            if (width > MAX_DIM || height > MAX_DIM) {
              if (width > height) {
                height = Math.round((height * MAX_DIM) / width);
                width = MAX_DIM;
              } else {
                width = Math.round((width * MAX_DIM) / height);
                height = MAX_DIM;
              }
            }
          } else {
            // HD mode for >5MB: keep original dimensions, only reduce JPEG quality
            // No resizing at all to preserve full resolution
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          if (mode === 'compressed') {
            // Standard compression at 0.85 quality
            canvas.toBlob(
              (blob) => {
                const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              },
              'image/jpeg',
              0.85
            );
          } else {
            // HD mode for >5MB: iteratively find the highest quality that fits under 5MB
            const tryQuality = (q) => {
              canvas.toBlob(
                (blob) => {
                  if (blob.size <= TARGET_SIZE || q <= 0.70) {
                    // Good enough or hit minimum quality floor
                    const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                      type: 'image/jpeg',
                      lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                  } else {
                    // Still too large, reduce quality slightly and retry
                    tryQuality(q - 0.02);
                  }
                },
                'image/jpeg',
                q
              );
            };
            // Start at 0.97 for near-lossless quality
            tryQuality(0.97);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    const validFiles = [];
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        alert(`Image ${file.name} must be less than 25MB`);
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) return;

    setIsCompressing(true);

    const newAttachments = await Promise.all(validFiles.map(async (file) => {
      const id = Math.random().toString(36).substr(2, 9);
      try {
        const compressed = await compressImage(file, compressionMode);
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              id,
              type: 'image',
              originalFile: file,
              compressedFile: compressed,
              preview: reader.result,
              originalSize: file.size,
              compressedSize: compressed.size
            });
          };
          reader.readAsDataURL(compressed);
        });
      } catch (err) {
        console.error('Compression error:', err);
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              id,
              type: 'image',
              originalFile: file,
              compressedFile: file,
              preview: reader.result,
              originalSize: file.size,
              compressedSize: file.size
            });
          };
          reader.readAsDataURL(file);
        });
      }
    }));

    setSelectedAttachments(prev => [...prev, ...newAttachments]);
    setIsCompressing(false);
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    setFileUploadError(null);
    if (!canShareMedia) {
      setFileUploadError('Image and file sharing are not enabled for your account');
      e.target.value = '';
      return;
    }
    if (!canAttachFile) {
      setFileUploadError('File attachments are not enabled for your account');
      e.target.value = '';
      return;
    }

    const activeMaxFileSize = canUseUnrestrictedUpload ? maxFileSize : 25;
    const maxSizeBytes = activeMaxFileSize * 1024 * 1024;
    
    const newAttachments = [];
    for (const file of files) {
      const extension = file.name.split('.').pop().toLowerCase();
      if (!isSuperAdmin && !canUseUnrestrictedUpload && verifiedFileTypes.length > 0 && !verifiedFileTypes.includes(extension)) {
        setFileUploadError(`.${extension} is not a verified file format`);
        continue;
      }
      if (!isSuperAdmin && file.size > maxSizeBytes) {
        setFileUploadError(`File size exceeds limit (${activeMaxFileSize}MB)`);
        continue;
      }
      
      newAttachments.push({
        id: Math.random().toString(36).substr(2, 9),
        type: 'file',
        originalFile: file,
        originalSize: file.size,
      });
    }

    if (newAttachments.length > 0) {
      setSelectedAttachments(prev => [...prev, ...newAttachments]);
    }
    e.target.value = '';
  };

  const handleCompressionToggle = async (newMode) => {
    setCompressionMode(newMode);
    
    const imageAttachments = selectedAttachments.filter(a => a.type === 'image');
    if (imageAttachments.length === 0) return;

    setIsCompressing(true);
    
    const recompressedAttachments = await Promise.all(selectedAttachments.map(async (attachment) => {
      if (attachment.type !== 'image') return attachment;
      try {
        const compressed = await compressImage(attachment.originalFile, newMode);
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
             resolve({
                ...attachment,
                compressedFile: compressed,
                preview: reader.result,
                compressedSize: compressed.size
             });
          };
          reader.readAsDataURL(compressed);
        });
      } catch (err) {
        return attachment;
      }
    }));
    
    setSelectedAttachments(recompressedAttachments);
    setIsCompressing(false);
  };

  const uploadWithProgress = (url, formData, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          onProgress(percentComplete);
        }
      };
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            resolve(xhr.responseText);
          }
        } else {
          try {
            const errResponse = JSON.parse(xhr.responseText);
            reject(new Error(errResponse.message || `Upload failed with status: ${xhr.status}`));
          } catch (e) {
            reject(new Error(`Upload failed with status: ${xhr.status}`));
          }
        }
      };
      
      xhr.onerror = () => reject(new Error('Network Error'));
      xhr.send(formData);
    });
  };

  const uploadImage = async (imageFile, onProgress) => {
    if (!imageFile) return null;
    if (!canShareMedia) throw new Error('Image sharing is disabled for your account');
    
    console.log("uploadImage started for file:", imageFile.name);
    const formData = new FormData();
    formData.append('userId', user.id);
    if (isSuperAdmin) formData.append('isSuperAdminSession', 'true');
    formData.append('image', imageFile);

    const qualityParam = compressionMode === 'hd' ? '?quality=hd' : '?quality=compressed';
    const data = await uploadWithProgress(
      `${import.meta.env.VITE_API_URL}/api/messages/upload${qualityParam}`,
      formData,
      onProgress
    );
    return data.imageUrl;
  };

  const uploadFileHandler = async (fileObj, onProgress) => {
    if (!fileObj) return null;
    if (!canAttachFile) throw new Error('File attachments are not enabled for your account');
    
    console.log("uploadFile started for file:", fileObj.name);
    const formData = new FormData();
    formData.append('userId', user.id);
    if (isSuperAdmin) formData.append('isSuperAdminSession', 'true');
    formData.append('file', fileObj);

    const data = await uploadWithProgress(
      `${import.meta.env.VITE_API_URL}/api/messages/upload-file`,
      formData,
      onProgress
    );
    return data;
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if ((inputMessage.trim() === '' && selectedAttachments.length === 0) || userState === 'blocked' || userState === 'none') return;
    
    if (userState.includes('pending') && sentCount >= 10) {
       alert("Limit of 10 messages reached. Accept or wait for them to accept to continue.");
       return;
    }

    const textToSend = inputMessage;
    const attachmentsToSend = [...selectedAttachments];
    const replyObj = replyingTo;
    const isEdit = editingMessage;

    // Clear inputs immediately to prevent double sending and allow next message composition
    setInputMessage('');
    chatStorage?.removeItem(`draft_${user?.id}_${friendId}`);
    setSelectedAttachments([]);
    setFileUploadError(null);
    setReplyingTo(null);
    setEditingMessage(null);
    if (fileAttachmentRef.current) fileAttachmentRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
    firstUnreadIdRef.current = null;

    if (inputRef.current) {
      inputRef.current.style.height = '42px';
      inputRef.current.focus();
    }
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 10);

    if (isEdit) {
      socket.emit('edit_message', {
        messageId: isEdit._id,
        newText: textToSend
      });
      return;
    }

    if (attachmentsToSend.length === 0) {
      const clientId = `pending-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      setPendingMessages((prev) => [
        ...prev,
        {
          clientId,
          _id: clientId,
          sender: { _id: user.id, username: user.username || 'You' },
          receiver: { _id: friendId },
          text: textToSend,
          imageUrl: null,
          imageUrls: [],
          file: null,
          files: [],
          createdAt: new Date().toISOString(),
          isRead: false,
          isEdited: false,
          replyTo: replyObj || null,
          isPending: true,
          inFlight: false,
          lastAttemptAt: null
        }
      ]);
      setTimeout(() => flushPendingMessages(), 10);
      return;
    }

    // Creating optimistic message with progress
    const tempId = `temp-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const localImageUrls = attachmentsToSend.filter(a => a.type === 'image').map(a => a.preview);
    const localFiles = attachmentsToSend.filter(a => a.type === 'file').map(a => ({
        originalName: a.originalFile.name, 
        size: a.originalSize, 
        mimeType: a.originalFile.type || 'application/octet-stream' 
    }));

    const tempMessage = {
      _id: tempId,
      sender: { _id: user.id, username: user.username || 'You' },
      receiver: { _id: friendId },
      text: textToSend,
      imageUrl: null,
      imageUrls: localImageUrls,
      file: null,
      files: localFiles,
      createdAt: new Date().toISOString(),
      isRead: false,
      isEdited: false,
      replyTo: replyObj || null,
      isUploading: true,
      progress: 0,
      isTempMessage: true, // Mark as temporary to help with deduplication
    };

    setMessages(prev => {
      // Avoid adding duplicate temp messages
      if (prev.some(m => m._id === tempId)) {
        return prev;
      }
      return [...prev, tempMessage];
    });

    try {
      const progresses = new Array(attachmentsToSend.length).fill(0);
      
      const uploadPromises = attachmentsToSend.map(async (attachment, index) => {
         const onProgress = (p) => {
            progresses[index] = p;
            const avgProgress = Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length);
            setMessages(prev => prev.map(m => m._id === tempId ? { ...m, progress: avgProgress } : m));
         };

         if (attachment.type === 'image') {
            const url = await uploadImage(attachment.compressedFile || attachment.originalFile, onProgress);
            return { type: 'image', url };
         } else {
            const fileData = await uploadFileHandler(attachment.originalFile, onProgress);
            return { type: 'file', fileData };
         }
      });
      
      const results = await Promise.all(uploadPromises);
      
      const finalImageUrls = results.filter(r => r.type === 'image').map(r => r.url);
      const finalFiles = results.filter(r => r.type === 'file').map(r => r.fileData);

      // Success: emit the actual message over socket
      socket.emit('send_message', {
        senderId: user.id,
        receiverId: friendId,
        text: textToSend,
        imageUrl: null,
        imageUrls: finalImageUrls,
        file: null,
        files: finalFiles,
        replyTo: replyObj ? replyObj._id : null
      });

      // Remove the temp message, the websocket server broadcast will instantly replace it
      setMessages(prev => prev.filter(m => m._id !== tempId));

    } catch (err) {
      console.error("Upload error:", err);
      // Show error on the temp message
      setMessages(prev => prev.map(m => m._id === tempId ? { 
        ...m, 
        isUploading: false, 
        uploadError: err.message || 'Failed to upload attachments' 
      } : m));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const newHeight = Math.min(inputRef.current.scrollHeight, 120);
      inputRef.current.style.height = (newHeight < 42 ? 42 : newHeight) + 'px';
    }
  }, [inputMessage]);

  const handleAcceptRequest = async () => {
    setIsAccepting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/accept-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, requesterId: friendId })
      });
      if (res.ok) {
        setUserState('friend');
      }
    } catch (err) {
      console.error('Error accepting request', err);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setActiveMenuId(null);
  };

  const handleReply = (msg) => {
    if (userState === 'blocked' || userState === 'none') return;
    setReplyingTo(msg);
    setEditingMessage(null);
    setInputMessage('');
    setActiveMenuId(null);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const handleDownloadAll = async (msg) => {
    setActiveMenuId(null);
    const urls = [...(msg.imageUrls || [])];
    if (msg.imageUrl) urls.unshift(msg.imageUrl);
    
    if (urls.length === 0) return;
    
    for (let i = 0; i < urls.length; i++) {
        try {
            const response = await fetch(urls[i]);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const filename = urls[i].split('/').pop().split('?')[0] || `image_${i+1}.jpg`;
            link.setAttribute('download', filename);
            if (document.body) {
              document.body.appendChild(link);
              link.click();
              link.parentNode.removeChild(link);
            } else {
              console.warn('Document body not ready for download');
            }
            window.URL.revokeObjectURL(url);
            // Small delay to prevent browser from blocking multiple downloads
            await new Promise(r => setTimeout(r, 300));
        } catch (err) {
            console.error('Download failed for:', urls[i], err);
        }
    }
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    e.currentTarget.dataset.startx = touch.clientX;
    e.currentTarget.dataset.starty = touch.clientY;
    e.currentTarget.style.transition = 'none';
  };

  const handleTouchMove = (e) => {
    const startX = parseFloat(e.currentTarget.dataset.startx);
    const startY = parseFloat(e.currentTarget.dataset.starty);
    if (!startX || !startY) return;

    const touch = e.touches[0];
    const diffX = touch.clientX - startX;
    const diffY = Math.abs(touch.clientY - startY);

    if (diffY > 20 && diffX < 20) {
      e.currentTarget.style.transform = `translateX(0px)`;
      e.currentTarget.dataset.startx = '';
      return;
    }

    if (diffX > 0 && diffX < 70) {
      e.currentTarget.style.transform = `translateX(${diffX}px)`;
    } else if (diffX >= 70) {
      e.currentTarget.style.transform = `translateX(70px)`;
    }
  };

  const handleTouchEnd = (e, msg) => {
    const startX = parseFloat(e.currentTarget.dataset.startx);
    if (!startX) {
      e.currentTarget.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
      e.currentTarget.style.transform = 'translateX(0px)';
      return;
    }

    const touch = e.changedTouches[0];
    const diffX = touch.clientX - startX;

    if (diffX >= 50) {
      if (window.navigator?.vibrate) window.navigator.vibrate(50);
      handleReply(msg);
    }

    e.currentTarget.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    e.currentTarget.style.transform = 'translateX(0px)';
    e.currentTarget.dataset.startx = '';
    e.currentTarget.dataset.starty = '';
  };

  const handleEdit = (msg) => {
    if (userState === 'blocked' || userState === 'none') return;
    setEditingMessage(msg);
    setReplyingTo(null);
    setInputMessage(msg.text);
    setActiveMenuId(null);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const cancelAction = () => {
    // Only clear input if we were editing (not replying) to avoid losing a reply draft
    if (editingMessage) setInputMessage('');
    
    setReplyingTo(null);
    setEditingMessage(null);
    setSelectedAttachments([]);
    setFileUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (fileAttachmentRef.current) fileAttachmentRef.current.value = '';
    inputRef.current?.focus();
  };

  const handleDelete = (msg) => {
    setDeleteConfirmMsg(msg);
    setActiveMenuId(null);
  };

  const confirmDelete = () => {
    if (!deleteConfirmMsg || !socket) return;
    socket.emit('delete_message', { messageId: deleteConfirmMsg._id, userId: user.id });
    setDeleteConfirmMsg(null);
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDateLabel = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isSameDay = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

    if (isSameDay(date, today)) return 'Today';
    if (isSameDay(date, yesterday)) return 'Yesterday';

    const diffTime = Math.abs(today - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays <= 7 && date.getDay() !== today.getDay()) { // within a week but not the same day of week (avoids an edge case)
      return date.toLocaleDateString([], { weekday: 'long' });
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  };

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollTop < 80 && hasMoreMessages && !isLoadingOlder && !isLoadingChat) {
      loadOlderMessages();
    }
    if (scrollHeight - scrollTop - clientHeight > 150) {
      setShowScrollButton(true);
    } else {
      setShowScrollButton(false);
    }
    setActiveMenuId(null);
  };

  const loadOlderMessages = async () => {
    if (isLoadingOlder || !hasMoreMessages || messages.length === 0) return;
    const container = chatContainerRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const oldestMessage = messages[0];
    if (!oldestMessage?.createdAt) return;

    setIsLoadingOlder(true);
    try {
      const url = `${import.meta.env.VITE_API_URL}/api/messages/history/${user.id}/${friendId}?limit=20&paged=1&before=${encodeURIComponent(oldestMessage.createdAt)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Older messages fetch failed: ${res.status}`);
      const payload = await res.json();
      const olderMessages = Array.isArray(payload) ? payload : (payload.messages || []);
      const source = Array.isArray(payload) ? 'unknown' : (payload.source || 'unknown');
      console.log(`[ChatRoom][API] Older messages returned from ${source.toUpperCase()} for friend ${friendId}: ${olderMessages.length} messages`);
      if (olderMessages.length) {
        suppressNextAutoScrollRef.current = true;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((msg) => msg._id));
          const newMessages = [...olderMessages.filter((msg) => !existingIds.has(msg._id)), ...prev];
          const newSentCount = newMessages.filter(m => m.sender._id === user.id).length;

          // Update cache with all messages (including newly loaded ones)
          setMessagesCache(prevCache => {
            const current = prevCache.get(friendId);
            if (current) {
              const updated = {
                ...current,
                messages: newMessages,
                sentCount: newSentCount,
                hasMore: Boolean(payload.hasMore)
              };
              // Persist to sessionStorage
              try {
                chatStorage?.setItem(`chat_cache_${friendId}`, JSON.stringify({
                  ...updated,
                  timestamp: Date.now()
                }));
                console.log(`[ChatRoom][sessionStorage] SAVED older messages for friend ${friendId}: ${newMessages.length} total messages`);
              } catch (e) {
                console.warn('Failed to persist cache to sessionStorage:', e);
              }
              return new Map(prevCache).set(friendId, updated);
            }
            return prevCache;
          });

          setSentCount(newSentCount);
          return newMessages;
        });
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - previousScrollHeight;
          }
        });
      }
      setHasMoreMessages(Boolean(payload.hasMore));
    } catch (err) {
      console.error('[ChatRoom] Error loading older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const scrollToOriginal = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.backgroundColor = 'rgba(88, 166, 255, 0.3)';
      setTimeout(() => {
        el.style.backgroundColor = '';
        el.style.transition = 'background-color 1.5s ease';
      }, 1000);
    }
  };

  const isOnline = onlineUsers?.some(ou => (ou.userId || ou) === friendId);

  const sentMedia = React.useMemo(() => {
    if (!isViewProfileOpen) return [];
    return messages.filter(m => m.sender._id === user?.id && (m.imageUrl || m.imageUrls?.length > 0 || m.file || m.files?.length > 0));
  }, [messages, user?.id, isViewProfileOpen]);
  
  const receivedMedia = React.useMemo(() => {
    if (!isViewProfileOpen) return [];
    return messages.filter(m => m.sender._id === friendId && (m.imageUrl || m.imageUrls?.length > 0 || m.file || m.files?.length > 0));
  }, [messages, friendId, isViewProfileOpen]);

  const allChatImages = React.useMemo(() => {
    if (!isViewProfileOpen) return [];
    let imgs = [];
    messages.forEach(msg => {
      if (msg.imageUrl) imgs.push(msg.imageUrl);
      if (msg.imageUrls) imgs.push(...msg.imageUrls);
    });
    return imgs;
  }, [messages, isViewProfileOpen]);

  const openImageGallery = (url, customImages = null) => {
    let imagesToUse = customImages;
    if (!imagesToUse) {
      imagesToUse = [];
      messages.forEach(msg => {
        if (msg.imageUrl) imagesToUse.push(msg.imageUrl);
        if (msg.imageUrls) imagesToUse.push(...msg.imageUrls);
      });
    }
    const idx = imagesToUse.indexOf(url);
    setGalleryState({ isOpen: true, initialIndex: idx !== -1 ? idx : 0, images: imagesToUse });
  };

  const displayedMessages = React.useMemo(() => {
    // Combine messages and pending messages, then deduplicate
    const allMessages = [...messages, ...pendingMessages];
    const seenIds = new Set();
    const deduplicated = [];
    
    for (const msg of allMessages) {
      // For pending messages, use clientId; for real messages, use _id
      const uniqueId = msg.clientId || msg._id;
      if (!seenIds.has(uniqueId)) {
        seenIds.add(uniqueId);
        deduplicated.push(msg);
      }
    }
    
    return deduplicated.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [messages, pendingMessages]);

  return (
    <div className="chat-container" onClick={() => setActiveMenuId(null)}>
      <div className="glass-panel chat-header" style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-color)', borderBottom: '1px solid var(--glass-border)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <div style={{ position: 'relative' }}>
            <div 
              style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'linear-gradient(135deg, #a371f7, #58a6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1.2rem', cursor: 'pointer' }}
              onClick={() => setIsViewProfileOpen(true)}
            >
              {friendDetails?.profilePic ? <img src={friendDetails.profilePic} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (friendDetails?.firstName ? friendDetails.firstName.charAt(0).toUpperCase() : friendDetails?.username?.charAt(0).toUpperCase())}
            </div>
            <div style={{ 
              position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', borderRadius: '50%',
              background: isOnline ? 'var(--success)' : 'var(--text-secondary)',
              boxShadow: isOnline ? '0 0 5px var(--success)' : 'none',
              border: '2px solid rgba(13,17,23,0.95)'
            }}></div>
          </div>
          <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => setIsViewProfileOpen(true)}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 'clamp(0.95rem, 4vw, 1.25rem)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {friendDetails?.firstName || friendDetails?.lastName ? `${friendDetails.firstName} ${friendDetails.lastName}` : friendDetails?.username}
            </h2>
            <span style={{ fontSize: '0.8rem', color: isOnline ? 'var(--success)' : 'var(--text-secondary)' }}>
              {isOnline ? 'Online & Secure' : 'Offline'} • @{friendDetails?.username}
            </span>
          </div>
        </div>
        <button className="btn btn-secondary" style={{ flexShrink: 0, padding: '0.35rem 0.65rem', fontSize: '0.75rem' }} onClick={() => navigate('/dashboard')}>← Back</button>
      </div>

      {/* Fullscreen Image Overlay */}
      {/* View Profile Modal */}
      <UserProfileViewModal
        isOpen={isViewProfileOpen}
        onClose={() => setIsViewProfileOpen(false)}
        profileUser={friendDetails}
        relationState={userState}
        onBlockUser={handleBlockUser}
        onUnblockUser={handleUnblockUser}
        onRemoveFriend={handleRemoveFriend}
        sharedMedia={{ sent: sentMedia, received: receivedMedia, allImages: allChatImages, openImageGallery }}
      />
      {/* Block Confirmation Modal */}
      {blockConfirm && (
        <div
          onClick={() => setBlockConfirm(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--panel-bg)', border: '1px solid var(--danger)',
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
                disabled={isBlockingAction}
                onClick={confirmBlockUser}
                style={{
                  width: '100%', padding: '0.7rem', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f85149, #991b1b)', color: 'white',
                  fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(248, 81, 73, 0.3)',
                  transition: 'transform 0.15s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                onMouseDown={(e) => !isBlockingAction && (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={(e) => !isBlockingAction && (e.currentTarget.style.transform = 'scale(1)')}
              >
                {isBlockingAction ? <span className="spinner" style={{ width: '15px', height: '15px', marginRight: 0, borderWidth: '2px' }}></span> : "Block User"}
              </button>
              <button
                onClick={() => setBlockConfirm(null)}
                style={{
                  width: '100%', padding: '0.7rem', border: '1px solid var(--glass-border)',
                  borderRadius: '8px', background: 'transparent', color: 'var(--text-primary)',
                  fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--glass-border)'}
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
              background: 'var(--panel-bg)', border: '1px solid var(--danger)',
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
                disabled={isRemovingAction}
                onClick={confirmRemoveFriend}
                style={{
                  width: '100%', padding: '0.7rem', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f85149, #991b1b)', color: 'white',
                  fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(248, 81, 73, 0.3)',
                  transition: 'transform 0.15s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                onMouseDown={(e) => !isRemovingAction && (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={(e) => !isRemovingAction && (e.currentTarget.style.transform = 'scale(1)')}
              >
                {isRemovingAction ? <span className="spinner" style={{ width: '15px', height: '15px', marginRight: 0, borderWidth: '2px' }}></span> : "Remove Friend"}
              </button>
              <button
                onClick={() => setRemoveConfirm(null)}
                style={{
                  width: '100%', padding: '0.7rem', border: '1px solid var(--glass-border)',
                  borderRadius: '8px', background: 'transparent', color: 'var(--text-primary)',
                  fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--glass-border)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmMsg && (
        <div 
          onClick={() => setDeleteConfirmMsg(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              background: 'var(--panel-bg)', border: '1px solid var(--danger)', 
              borderRadius: '12px', padding: '1.5rem', width: '90%', maxWidth: '340px', 
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)', textAlign: 'center' 
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🗑️</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: '700' }}>Delete this message?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              This message will be permanently deleted for everyone in this chat.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button 
                onClick={confirmDelete}
                style={{ 
                  width: '100%', padding: '0.7rem', border: 'none', borderRadius: '8px', 
                  background: 'linear-gradient(135deg, #f85149, #991b1b)', color: 'white', 
                  fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(248, 81, 73, 0.3)',
                  transition: 'transform 0.15s ease'
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Delete for Everyone
              </button>
              <button 
                onClick={() => setDeleteConfirmMsg(null)}
                style={{ 
                  width: '100%', padding: '0.7rem', border: '1px solid var(--glass-border)', 
                  borderRadius: '8px', background: 'transparent', color: 'var(--text-primary)', 
                  fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--glass-border)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ImageGalleryModal 
        isOpen={galleryState.isOpen}
        onClose={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}
        images={galleryState.images}
        initialIndex={galleryState.initialIndex}
      />

      <div className="glass-panel messages-area" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>
        
        <div style={{ width: '100%', padding: '0.4rem', textAlign: 'center', background: 'rgba(0,180,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
           <span style={{ fontSize: '0.8rem' }}>🔒</span> Messages are end-to-end encrypted. No one outside of this chat can read them.
        </div>
        
        {userState === 'sent_pending' && !isSuperAdmin && (
          <div style={{ background: 'rgba(255, 152, 0, 0.2)', color: '#ff9800', padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 'bold', zIndex: 10, borderBottom: '1px solid rgba(255,152,0,0.2)' }}>
            Friend request pending. {10 - sentCount > 0 ? (10 - sentCount) : 0}/10 message limit active.
          </div>
        )}
        
        {userState === 'received_pending' && (
          <div style={{ background: 'rgba(46, 160, 67, 0.15)', color: 'var(--success)', padding: '0.85rem 1rem', textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold', zIndex: 10, borderBottom: '1px solid var(--success)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{friendDetails?.username} sent you a request.</span>
              {!isSuperAdmin && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({10 - sentCount > 0 ? (10 - sentCount) : 0}/10 trial replies left)</span>}
            </div>
            <button 
              className="btn" 
              style={{ background: 'var(--success)', padding: '0.4rem 1.25rem', fontSize: '0.8rem' }}
              onClick={handleAcceptRequest}
              disabled={isAccepting}
            >
              {isAccepting ? 'Accepting...' : '✅ Accept Request & Chat'}
            </button>
          </div>
        )}

        <div 
          ref={chatContainerRef}
          onScroll={handleScroll}
          style={{ flex: 1, overflowY: 'auto', padding: '1rem', paddingBottom: '120px', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {isLoadingChat ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
               <span className="spinner" style={{ borderTopColor: 'var(--accent)', width: '30px', height: '30px', borderWidth: '3px' }}></span>
               <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Fetching conversation...</div>
            </div>
          ) : displayedMessages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
              No messages yet. Send a message to start chatting!
            </div>
          ) : (
            <>
              {isLoadingOlder && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '0.35rem 0' }}>
                  <span className="spinner" style={{ borderTopColor: 'var(--accent)', width: '14px', height: '14px', borderWidth: '2px', marginRight: 0 }}></span>
                  Loading older messages...
                </div>
              )}
              {!hasMoreMessages && displayedMessages.length >= 20 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.72rem', opacity: 0.7, padding: '0.2rem 0' }}>
                  Beginning of conversation
                </div>
              )}
              {displayedMessages.map((msg, idx) => {
            const isSelf = msg.sender._id === user.id;
            const isPending = msg.isPending === true;
            const showMenu = !isPending && activeMenuId === msg._id;
            const currentDateLabel = getDateLabel(msg.createdAt);
            const prevDateLabel = idx > 0 ? getDateLabel(displayedMessages[idx - 1].createdAt) : null;
            const showDateLabel = currentDateLabel !== prevDateLabel;
            
            const isFirstUnread = firstUnreadIdRef.current && msg._id === firstUnreadIdRef.current;
            
            return (
              <React.Fragment key={msg._id || idx}>
                {/* Unread messages divider */}
                {isFirstUnread && (
                  <div ref={unreadDividerRef} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.8rem 0', padding: '0 0.5rem' }}>
                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #58a6ff, transparent)' }}></div>
                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', padding: '0.15rem 0.6rem', background: 'rgba(88, 166, 255, 0.1)', borderRadius: '10px', border: '1px solid rgba(88, 166, 255, 0.2)' }}>Unread Messages</span>
                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #58a6ff, transparent)' }}></div>
                  </div>
                )}
                {showDateLabel && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '0.8rem 0 0.5rem 0' }}>
                    <div style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)', padding: '0.2rem 0.7rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '500', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', backdropFilter: 'blur(5px)' }}>
                      {currentDateLabel}
                    </div>
                  </div>
                )}
                <div 
                  id={`msg-${msg._id}`}
                  className={`message ${isSelf ? 'self' : 'other'}`}
                  style={{ position: 'relative', paddingBottom: '0.4rem', maxWidth: '82%', minWidth: '110px', opacity: (userState === 'friend' || userState.includes('pending')) ? 1 : 0.8 }}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={(e) => handleTouchEnd(e, msg)}
                >
                {!isPending && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(showMenu ? null : msg._id); }}
                    style={{
                      position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: '50%',
                      width: '18px', height: '18px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, zIndex: 1
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                )}

                {showMenu && (
                  <div style={{
                    position: 'absolute', top: '24px', right: '4px', background: 'var(--panel-bg)', border: '1px solid var(--glass-border)',
                    borderRadius: '8px', zIndex: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    width: 'max-content', minWidth: '100px', backdropFilter: 'blur(10px)'
                  }}>
                    <button onClick={() => handleCopy(msg.text)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.65rem 1rem', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Copy</button>
                    {((msg.imageUrls?.length || 0) + (msg.imageUrl ? 1 : 0) > 1) && (
                      <button onClick={() => handleDownloadAll(msg)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.65rem 1rem', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Download All</button>
                    )}
                    {(userState === 'friend' || userState.includes('pending') || isSuperAdmin || user?.role === 'admin') && (
                      <>
                        <button onClick={() => handleReply(msg)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.65rem 1rem', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Reply</button>
                        {isSelf && (
                          <button onClick={() => handleEdit(msg)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.65rem 1rem', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid var(--glass-border)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Edit</button>
                        )}
                        {canUseDelete && (isSelf || user?.role === 'admin' || isSuperAdmin) && (
                          <button onClick={() => handleDelete(msg)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', padding: '0.65rem 1rem', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid var(--glass-border)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Delete</button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {msg.replyTo && (
                  <div 
                    onClick={() => scrollToOriginal(msg.replyTo._id)}
                    style={{ 
                      background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.5rem',
                      borderLeft: `3px solid ${isSelf ? 'white' : 'var(--accent)'}`, fontSize: '0.85rem', opacity: 0.9, cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ color: isSelf ? '#ddd' : 'var(--accent)' }}>{msg.replyTo.sender?.username}</strong>
                      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{formatTime(msg.replyTo.createdAt)}</span>
                    </div>
                    <div>{msg.replyTo.text ? (msg.replyTo.text.length > 60 ? msg.replyTo.text.substring(0, 60) + '...' : msg.replyTo.text) : (msg.replyTo.imageUrl ? '[Image]' : msg.replyTo.file ? '[File]' : '[Message]')}</div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.05rem', paddingRight: '18px' }}>
                  <span className="message-sender" style={{ fontSize: '0.62rem', fontWeight: '600', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{isSelf ? 'You' : msg.sender.username}</span>
                </div>

                <div style={{ lineHeight: '1.4', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{msg.text}</div>

                {(msg.imageUrls?.length > 0 || msg.imageUrl) && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '4px', position: 'relative', maxWidth: '320px' }}>
                    {msg.imageUrl && (
                      <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', width: '100%', position: 'relative', background: 'rgba(0,0,0,0.1)' }}>
                        <img src={msg.imageUrl} onLoad={handleImageLoad} style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', display: 'block', cursor: 'pointer' }} onClick={() => !msg.isUploading && openImageGallery(msg.imageUrl)} />
                      </div>
                    )}
                    {msg.imageUrls && msg.imageUrls.map((url, i) => (
                      <div key={i} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', width: msg.imageUrls.length === 1 ? '100%' : 'calc(50% - 2.5px)', position: 'relative', flexGrow: 1, background: 'rgba(0,0,0,0.1)' }}>
                        <img src={url} onLoad={handleImageLoad} style={{ width: '100%', height: msg.imageUrls.length === 1 ? 'auto' : '150px', maxHeight: '300px', objectFit: 'cover', display: 'block', cursor: 'pointer', opacity: msg.isUploading || msg.uploadError ? 0.6 : 1 }} onClick={() => !msg.isUploading && openImageGallery(url)} />
                      </div>
                    ))}
                    {msg.isUploading && msg.imageUrls?.length > 0 && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', zIndex: 10, borderRadius: '8px' }}>
                        <div style={{ width: '60%', height: '6px', background: 'rgba(255,255,255,0.3)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${msg.progress || 0}%`, height: '100%', background: 'var(--success)', transition: 'width 0.2s ease-out' }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'white', marginTop: '0.4rem', fontWeight: 'bold' }}>{msg.progress || 0}%</span>
                      </div>
                    )}
                    {msg.uploadError && msg.imageUrls?.length > 0 && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,0,0,0.5)', color: 'white', fontSize: '0.85rem', fontWeight: 'bold', zIndex: 10, borderRadius: '8px' }}>
                        <div style={{ background: 'var(--panel-bg)', padding: '4px 10px', borderRadius: '4px' }}>
                          {msg.uploadError}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(msg.files?.length > 0 || msg.file) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '0.5rem', position: 'relative' }}>
                    {msg.file && <FileDisplay file={msg.file} message={msg} fileIndex={null} />}
                    {msg.files && msg.files.map((f, i) => <FileDisplay key={i} file={f} message={msg} fileIndex={i} />)}
                    
                    {(msg.isUploading || msg.uploadError) && (
                      <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: msg.uploadError ? 'rgba(255,0,0,0.15)' : 'rgba(0,0,0,0.45)', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', border: msg.uploadError ? '1px solid rgba(255,0,0,0.4)' : 'none' }}>
                        {msg.isUploading ? (
                          <>
                            <div style={{ width: '80%', height: '5px', background: 'rgba(255,255,255,0.3)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${msg.progress || 0}%`, height: '100%', background: 'var(--success)', transition: 'width 0.2s ease-out' }}></div>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'white', marginTop: '0.3rem', fontWeight: 'bold' }}>Uploading {msg.progress || 0}%</span>
                          </>
                        ) : (
                          <span style={{ color: '#ff6b6b', fontSize: '0.85rem', fontWeight: 'bold', background: 'var(--panel-bg)', padding: '4px 8px', borderRadius: '4px' }}>{msg.uploadError}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.2rem', gap: '0.35rem' }}>
                  {msg.isEdited && <span style={{ fontSize: '0.55rem', opacity: 0.6 }}>(edited)</span>}
                  <span style={{ fontSize: '0.62rem', opacity: isSelf ? 0.7 : 0.45 }}>{formatTime(msg.createdAt)}</span>
                  {isSelf && isPending && (
                    <span style={{ fontSize: '0.55rem', background: 'rgba(255,255,255,0.18)', color: 'white', padding: '1px 5px', borderRadius: '6px', fontWeight: 'bold' }}>
                      Sending...
                    </span>
                  )}
                  {isSelf && msg.isRead && (
                    <span style={{ fontSize: '0.55rem', background: 'var(--success)', color: 'white', padding: '1px 5px', borderRadius: '6px', fontWeight: 'bold' }}>Seen</span>
                  )}
                </div>
              </div>
              </React.Fragment>
            );
          })}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {showScrollButton && (
          <button 
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            style={{ position: 'absolute', bottom: '90px', right: '25px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 5 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        )}

        <div style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--panel-bg)', minHeight: '60px', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
          {userState === 'blocked' ? (
            <div style={{ color: '#ffb3b3', fontStyle: 'italic', fontSize: '0.9rem', width: '100%', textAlign: 'center', padding: '1rem', background: 'rgba(255,0,0,0.1)' }}>
              You cannot reply to this conversation.
            </div>
          ) : userState === 'none' ? (
             <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem', width: '100%', textAlign: 'center', padding: '1rem' }}>
              You cannot reply to this conversation.
             </div>
          ) : (
             <div style={{ width: '100%' }}>
                {(replyingTo || editingMessage || selectedAttachments.length > 0 || fileUploadError) && (
                  <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {fileUploadError && (
                      <div style={{ background: 'rgba(231, 76, 60, 0.2)', border: '1px solid #E74C3C', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#FF6B6B', fontSize: '0.8rem' }}>
                        {fileUploadError}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {selectedAttachments.map(a => (
                           a.type === 'image' ? (
                              <div key={a.id} style={{ position: 'relative', width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                                <img src={a.preview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <button type="button" onClick={() => setSelectedAttachments(prev => prev.filter(x => x.id !== a.id))} style={{position: 'absolute', top: 0, right: 0, background: 'rgba(255,0,0,0.8)', color: 'white', border: 'none', width: '14px', height: '14px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10}}>x</button>
                                {(isCompressing || isUploading) && (
                                   <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                     <span className="spinner" style={{ width: '12px', height: '12px', marginRight: 0 }}></span>
                                   </div>
                                )}
                              </div>
                           ) : (
                              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(88, 166, 255, 0.1)', borderRadius: '6px', border: '1px solid rgba(88, 166, 255, 0.3)' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                  <polyline points="13 2 13 9 20 9"></polyline>
                                </svg>
                                <span style={{ fontSize: '0.8rem' }}>{a.originalFile.name}</span>
                                <button type="button" onClick={() => setSelectedAttachments(prev => prev.filter(x => x.id !== a.id))} style={{background: 'transparent', color: '#ff6b6b', border: 'none', marginLeft: '4px', cursor: 'pointer', fontSize: '12px'}}>✖</button>
                              </div>
                           )
                        ))}
                        <span>
                          {replyingTo && <>Replying to <strong>{replyingTo.sender.username}</strong>: {replyingTo.text.slice(0, 30)}...</>}
                          {editingMessage && <>Editing message...</>}
                        </span>
                      </div>
                      <button type="button" onClick={cancelAction} className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none' }}>Cancel</button>
                    </div>
                    {/* Compression mode toggle */}
                    {selectedAttachments.some(a => a.type === 'image') && !replyingTo && !editingMessage && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.25rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '0.25rem' }}>Quality:</span>
                        <button
                          type="button"
                          onClick={() => handleCompressionToggle('compressed')}
                          disabled={isCompressing || isUploading}
                          style={{
                            padding: '0.2rem 0.6rem', fontSize: '0.7rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: '600',
                            transition: 'all 0.2s ease',
                            background: compressionMode === 'compressed' ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                            color: compressionMode === 'compressed' ? 'white' : 'var(--text-secondary)',
                            boxShadow: compressionMode === 'compressed' ? '0 0 8px rgba(88,166,255,0.4)' : 'none'
                          }}
                        >
                          ⚡ Optimized
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCompressionToggle('hd')}
                          disabled={isCompressing || isUploading}
                          style={{
                            padding: '0.2rem 0.6rem', fontSize: '0.7rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: '600',
                            transition: 'all 0.2s ease',
                            background: compressionMode === 'hd' ? 'linear-gradient(135deg, #f093fb, #f5576c)' : 'rgba(255,255,255,0.08)',
                            color: compressionMode === 'hd' ? 'white' : 'var(--text-secondary)',
                            boxShadow: compressionMode === 'hd' ? '0 0 8px rgba(245,87,108,0.4)' : 'none'
                          }}
                        >
                          🔥 Full HD
                        </button>
                        {(() => {
                          const imageAttachments = selectedAttachments.filter(a => a.type === 'image');
                          const totalOriginal = imageAttachments.reduce((acc, a) => acc + (a.originalSize || 0), 0);
                          const totalCompressed = imageAttachments.reduce((acc, a) => acc + (a.compressedSize || a.originalSize || 0), 0);
                          return !isCompressing && imageAttachments.length > 0 && (
                            <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '0.5rem' }}>
                              {compressionMode === 'compressed' && totalOriginal !== totalCompressed
                                ? `${formatFileSize(totalOriginal)} → ${formatFileSize(totalCompressed)} (${Math.round((1 - totalCompressed / totalOriginal) * 100)}% saved)`
                                : formatFileSize(totalCompressed)
                              }
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
                <form onSubmit={sendMessage} className="input-area" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', margin: 0, alignItems: 'flex-end' }}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    onChange={handleImageChange} 
                  />
                  {canAttachFile && (
                    <input
                      type="file"
                      multiple
                      ref={fileAttachmentRef}
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                      accept="*/*"
                    />
                  )}
                  <div className={`attach-icons-wrapper ${(inputMessage && inputMessage.length > 0) ? 'hide-if-typing' : ''}`}>
                    {canShareMedia && (
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '0.5rem', height: '42px', width: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        onClick={() => fileInputRef.current.click()}
                        disabled={isUploading}
                        title="Upload Image"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                      </button>
                    )}
                    {canAttachFile && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem', height: '42px', width: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        onClick={() => {
                          if (fileAttachmentRef.current) {
                            fileAttachmentRef.current.click();
                          } else {
                            console.error('File attachment ref is null');
                            setFileUploadError('File picker failed to load');
                          }
                        }}
                        disabled={isUploading}
                        title={canUseUnrestrictedUpload ? "Attach any safe file" : "Attach verified file"}
                      >
                        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7.5 12.5l5.8-5.8a3.4 3.4 0 0 1 4.8 4.8l-7.2 7.2a5 5 0 0 1-7.1-7.1l7.5-7.5" />
                          <path d="M9.6 14.6l6.4-6.4" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <textarea 
                    ref={inputRef}
                    className="input-field" 
                    placeholder={editingMessage ? "Edit your message..." : (userState.includes('pending') && sentCount >= 10 && !isSuperAdmin ? "Limit reached..." : "Type a message...")} 
                    value={inputMessage}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInputMessage(val);
                      if (!editingMessage) {
                        if (val.trim() === '') {
                          chatStorage?.removeItem(`draft_${user?.id}_${friendId}`);
                        } else {
                          chatStorage?.setItem(`draft_${user?.id}_${friendId}`, val);
                        }
                      }
                      
                      e.target.style.height = '42px';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={handleKeyDown}
                    style={{ 
                      marginBottom: 0, 
                      flex: 1, 
                      height: '42px', 
                      minHeight: '42px', 
                      maxHeight: '120px', 
                      resize: 'none', 
                      padding: '0.65rem 0.9rem',
                      lineHeight: '1.4',
                      overflowY: 'auto',
                      transition: 'height 0.1s ease-out'
                    }}
                    disabled={userState.includes('pending') && sentCount >= 10}
                  />
                  <button type="submit" className="btn" style={{ padding: '0', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }} disabled={userState.includes('pending') && sentCount >= 10} title={editingMessage ? 'Save Custom Edit' : 'Send Message'}>
                    {editingMessage ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'translate(-1px, 1px) rotate(45deg)' }}>
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                      </svg>
                    )}
                  </button>
                </form>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatRoom;
