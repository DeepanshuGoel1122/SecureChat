import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function ChatRoom() {
  const { friendId } = useParams(); 
  const { user, socket, onlineUsers } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [friendDetails, setFriendDetails] = useState(null);
  
  const [userState, setUserState] = useState('none'); // 'friend', 'sent_pending', 'received_pending', 'blocked', 'none'
  const [sentCount, setSentCount] = useState(0);
  const [isAccepting, setIsAccepting] = useState(false);

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [compressionMode, setCompressionMode] = useState('compressed'); // 'compressed' or 'hd'
  const [originalFileSize, setOriginalFileSize] = useState(0);
  const [compressedFileSize, setCompressedFileSize] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);

  const [allowMessageDelete, setAllowMessageDelete] = useState(false);
  const [canDeleteMessages, setCanDeleteMessages] = useState(true);
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const firstUnreadIdRef = useRef(null);
  const unreadDividerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (fullScreenImage) {
          setFullScreenImage(null);
        } else if (deleteConfirmMsg) {
          setDeleteConfirmMsg(null);
        } else if (activeMenuId) {
          setActiveMenuId(null);
        } else if (imagePreview) {
          setImagePreview(null);
          setSelectedImage(null);
        } else if (replyingTo || editingMessage) {
          setReplyingTo(null);
          setEditingMessage(null);
        } else {
          // No modal/context open, go back to dashboard safely
          navigate('/dashboard');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [fullScreenImage, deleteConfirmMsg, activeMenuId, imagePreview, replyingTo, editingMessage, navigate]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoadingChat(true);
      try {
        console.log(`[ChatRoom] Fetching data for friend: ${friendId}`);
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/friends/${user.id}`);
        if (!res.ok) throw new Error(`Friends fetch failed: ${res.status}`);
        const data = await res.json();
        
        const isFriend = (data.friends || []).some(f => String(f._id) === String(friendId));
        const isSentReq = (data.sentRequests || []).some(f => String(f._id) === String(friendId));
        const isRecvReq = (data.receivedRequests || []).some(f => String(f._id) === String(friendId));
        const isBlocked = (data.blockedUsers || []).some(f => String(f._id) === String(friendId));
        
        if (isBlocked) setUserState('blocked');
        else if (isFriend) setUserState('friend');
        else if (isRecvReq) setUserState('received_pending');
        else if (isSentReq) setUserState('sent_pending');
        else setUserState('none');

        const userRes = await fetch(`${import.meta.env.VITE_API_URL}/api/users/user/${friendId}`);
        if (userRes.ok) {
          const fallbackUser = await userRes.json();
          setFriendDetails(fallbackUser);
        }
        
        const histRes = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/history/${user.id}/${friendId}`);
        if (histRes.ok) {
          const histData = await histRes.json();
          
          // Capture the first unread message from friend BEFORE marking as read
          if (!hasLoadedOnceRef.current) {
            const firstUnread = histData.find(m => m.sender._id === friendId && !m.isRead);
            firstUnreadIdRef.current = firstUnread ? firstUnread._id : null;
            hasLoadedOnceRef.current = true;
          }
          
          setMessages(histData);
          const myMessages = histData.filter(m => m.sender._id === user.id).length;
          setSentCount(myMessages);
        }
        
        if (socket && isFriend) {
          socket.emit('mark_read', { userId: user.id, friendId });
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
           if (data && data.canDeleteMessages !== undefined) {
             setCanDeleteMessages(data.canDeleteMessages);
           }
        })
        .catch(() => {});
    }
  }, [user, friendId, socket]);

  useEffect(() => {
    if (user?.id && friendId) {
      const draft = localStorage.getItem(`draft_${user.id}_${friendId}`);
      if (draft) {
        setInputMessage(draft);
      } else {
        setInputMessage('');
      }
    }
  }, [user?.id, friendId]);

  useEffect(() => {
    if (!socket || !user?.id) return;

    const handleReceive = (data) => {
      if (
        (data.sender._id === user.id && data.receiver._id === friendId) || 
        (data.sender._id === friendId && data.receiver._id === user.id)
      ) {
        setMessages((prev) => {
          const newMessages = [...prev, data];
          setSentCount(newMessages.filter(m => m.sender._id === user.id).length);
          return newMessages;
        });
        
        if (data.sender._id === friendId && userState === 'friend') {
           socket.emit('mark_read', { userId: user.id, friendId });
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
        setMessages((prev) => prev.map(m => m._id === data._id ? data : m));
      }
    };

    const handleError = (msg) => {
      alert(`Server Notice: ${msg}`);
    };

    const handleMessagesRead = ({ byUserId }) => {
      if (byUserId === friendId) {
        setMessages((prev) => prev.map(m => m.receiver._id === friendId ? { ...m, isRead: true } : m));
      }
    };

    socket.on('receive_message', handleReceive);
    socket.on('message_edited', handleEditReceive);
    socket.on('messages_read', handleMessagesRead);
    socket.on('chat_error', handleError);

    const handleDeleteReceive = ({ messageId }) => {
      setMessages((prev) => prev.filter(m => m._id !== messageId));
    };
    socket.on('message_deleted', handleDeleteReceive);
    
    return () => {
      socket.off('receive_message', handleReceive);
      socket.off('message_edited', handleEditReceive);
      socket.off('messages_read', handleMessagesRead);
      socket.off('chat_error', handleError);
      socket.off('message_deleted', handleDeleteReceive);
    };
  }, [socket, user, friendId, userState]);

  useEffect(() => {
    setTimeout(() => {
      // If there's an unread divider, scroll to it; otherwise scroll to bottom
      if (unreadDividerRef.current) {
        unreadDividerRef.current.scrollIntoView({ block: 'center' });
      } else {
        messagesEndRef.current?.scrollIntoView();
      }
    }, 150);
  }, [messages.length > 0 && messages[0]?._id]); 

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
    const file = e.target.files[0];
    if (!file) return;

    // Allow up to 25MB raw input (compression will handle it)
    if (file.size > 25 * 1024 * 1024) {
      alert("Image size must be less than 25MB");
      return;
    }

    setOriginalFileSize(file.size);
    setIsCompressing(true);

    try {
      const compressed = await compressImage(file, compressionMode);
      setCompressedFileSize(compressed.size);
      setSelectedImage(compressed);

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setIsCompressing(false);
      };
      reader.readAsDataURL(compressed);
    } catch (err) {
      console.error('Compression error:', err);
      // Fallback to original
      setSelectedImage(file);
      setCompressedFileSize(file.size);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setIsCompressing(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Re-compress when user toggles compression mode
  const handleCompressionToggle = async (newMode) => {
    setCompressionMode(newMode);
    if (!fileInputRef.current?.files?.[0]) return;
    const originalFile = fileInputRef.current.files[0];
    setIsCompressing(true);
    try {
      const compressed = await compressImage(originalFile, newMode);
      setCompressedFileSize(compressed.size);
      setSelectedImage(compressed);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setIsCompressing(false);
      };
      reader.readAsDataURL(compressed);
    } catch (err) {
      setIsCompressing(false);
    }
  };

  const uploadImage = async () => {
    if (!selectedImage) return null;
    setIsUploading(true);
    console.log("uploadImage started for file:", selectedImage.name);
    const formData = new FormData();
    formData.append('image', selectedImage);

    try {
      const qualityParam = compressionMode === 'hd' ? '?quality=hd' : '?quality=compressed';
      console.log("Fetching to:", `${import.meta.env.VITE_API_URL}/api/messages/upload${qualityParam}`);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/upload${qualityParam}`, {
        method: 'POST',
        body: formData,
      });
      console.log("Fetch response status:", res.status);
      const data = await res.json();
      console.log("Fetch response data:", data);
      if (res.ok) {
        return data.imageUrl;
      } else {
        alert(data.message || "Failed to upload image");
        return null;
      }
    } catch (err) {
      console.error("Error uploading image:", err);
      alert("Network error while uploading image");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if ((inputMessage.trim() === '' && !selectedImage) || userState === 'blocked' || userState === 'none') return;
    
    if (userState.includes('pending') && sentCount >= 10) {
       alert("Limit of 10 messages reached. Accept or wait for them to accept to continue.");
       return;
    }

    let imageUrl = null;
    if (selectedImage) {
      console.log("Calling uploadImage from sendMessage...");
      imageUrl = await uploadImage();
      if (!imageUrl) {
        console.log("uploadImage failed, aborting sendMessage.");
        setSelectedImage(null);
        setImagePreview(null);
        return; // Stop if upload failed
      }
      console.log("uploadImage succeeded, imageUrl:", imageUrl);
    }

    if (editingMessage) {
      socket.emit('edit_message', {
        messageId: editingMessage._id,
        newText: inputMessage
      });
      setEditingMessage(null);
    } else {
      socket.emit('send_message', {
        senderId: user.id,
        receiverId: friendId,
        text: inputMessage,
        imageUrl: imageUrl,
        replyTo: replyingTo ? replyingTo._id : null
      });
      setReplyingTo(null);
    }
    
    setInputMessage('');
    localStorage.removeItem(`draft_${user?.id}_${friendId}`);
    setSelectedImage(null);
    setImagePreview(null);
    // Clear unread divider after user sends a message
    firstUnreadIdRef.current = null;
    if (inputRef.current) {
      inputRef.current.style.height = '42px';
      inputRef.current.focus();
    }
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 10);
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

  const handleEdit = (msg) => {
    if (userState === 'blocked' || userState === 'none') return;
    setEditingMessage(msg);
    setReplyingTo(null);
    setInputMessage(msg.text);
    setActiveMenuId(null);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const cancelAction = () => {
    setReplyingTo(null);
    setEditingMessage(null);
    setSelectedImage(null);
    setImagePreview(null);
    setInputMessage('');
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
    if (scrollHeight - scrollTop - clientHeight > 150) {
      setShowScrollButton(true);
    } else {
      setShowScrollButton(false);
    }
    setActiveMenuId(null);
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

  return (
    <div className="chat-container" onClick={() => setActiveMenuId(null)}>
      <div className="glass-panel chat-header" style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(13,17,23,0.97)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <div style={{ 
            width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0,
            background: isOnline ? 'var(--success)' : 'var(--text-secondary)',
            boxShadow: isOnline ? '0 0 5px var(--success)' : 'none'
          }}></div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 'clamp(0.95rem, 4vw, 1.25rem)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Chat with {friendDetails ? friendDetails.username : '...'}</h2>
            <span style={{ fontSize: '0.8rem', color: isOnline ? 'var(--success)' : 'var(--text-secondary)' }}>
              {isOnline ? 'Online & Secure' : 'Offline'}
            </span>
          </div>
        </div>
        <button className="btn btn-secondary" style={{ flexShrink: 0, padding: '0.35rem 0.65rem', fontSize: '0.75rem' }} onClick={() => navigate('/dashboard')}>← Back</button>
      </div>

      {/* Fullscreen Image Overlay */}
      {/* Delete Confirmation Modal */}
      {deleteConfirmMsg && (
        <div 
          onClick={() => setDeleteConfirmMsg(null)}
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

      {fullScreenImage && (
        <div 
          onClick={() => setFullScreenImage(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)', cursor: 'zoom-out' }}
        >
          <img 
            src={fullScreenImage} 
            alt="Fullscreen" 
            style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 0 40px rgba(0,0,0,0.8)' }} 
            onClick={(e) => e.stopPropagation()} 
          />
          <button 
            onClick={() => setFullScreenImage(null)}
            style={{ position: 'absolute', top: '20px', right: '30px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            &times;
          </button>
        </div>
      )}

      <div className="glass-panel messages-area" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>
        
        <div style={{ width: '100%', padding: '0.4rem', textAlign: 'center', background: 'rgba(0,180,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
           <span style={{ fontSize: '0.8rem' }}>🔒</span> Messages are end-to-end encrypted. No one outside of this chat can read them.
        </div>
        
        {userState === 'sent_pending' && (
          <div style={{ background: 'rgba(255, 152, 0, 0.2)', color: '#ff9800', padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 'bold', zIndex: 10, borderBottom: '1px solid rgba(255,152,0,0.2)' }}>
            Friend request pending. {10 - sentCount > 0 ? (10 - sentCount) : 0}/10 message limit active.
          </div>
        )}
        
        {userState === 'received_pending' && (
          <div style={{ background: 'rgba(46, 160, 67, 0.15)', color: 'var(--success)', padding: '0.85rem 1rem', textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold', zIndex: 10, borderBottom: '1px solid var(--success)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{friendDetails?.username} sent you a request.</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({10 - sentCount > 0 ? (10 - sentCount) : 0}/10 trial replies left)</span>
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
          ) : messages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
              No messages yet. Send a message to start chatting!
            </div>
          ) : messages.map((msg, idx) => {
            const isSelf = msg.sender._id === user.id;
            const showMenu = activeMenuId === msg._id;
            const currentDateLabel = getDateLabel(msg.createdAt);
            const prevDateLabel = idx > 0 ? getDateLabel(messages[idx - 1].createdAt) : null;
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
                >
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

                {showMenu && (
                  <div style={{
                    position: 'absolute', top: '24px', right: '4px', background: 'rgba(33, 38, 45, 0.98)', border: '1px solid var(--glass-border)',
                    borderRadius: '8px', zIndex: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    width: 'max-content', minWidth: '100px', backdropFilter: 'blur(10px)'
                  }}>
                    <button onClick={() => handleCopy(msg.text)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.65rem 1rem', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Copy</button>
                    {(userState === 'friend' || userState.includes('pending')) && (
                      <>
                        <button onClick={() => handleReply(msg)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.65rem 1rem', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Reply</button>
                        {isSelf && (
                          <button onClick={() => handleEdit(msg)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.65rem 1rem', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Edit</button>
                        )}
                        {canDeleteMessages !== false && isSelf && (
                          <button onClick={() => handleDelete(msg)} style={{ background: 'transparent', border: 'none', color: '#f85149', padding: '0.65rem 1rem', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Delete</button>
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
                    <div>{msg.replyTo.text ? (msg.replyTo.text.length > 60 ? msg.replyTo.text.substring(0, 60) + '...' : msg.replyTo.text) : (msg.replyTo.imageUrl ? '[Image]' : '')}</div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.05rem', paddingRight: '18px' }}>
                  <span className="message-sender" style={{ fontSize: '0.62rem', fontWeight: '600', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{isSelf ? 'You' : msg.sender.username}</span>
                </div>

                <div style={{ lineHeight: '1.4', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{msg.text}</div>

                {msg.imageUrl && (
                  <div style={{ marginTop: '0.5rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <img 
                      src={msg.imageUrl} 
                      alt="Shared content" 
                      style={{ maxWidth: '100%', maxHeight: '400px', display: 'block', cursor: 'pointer' }} 
                      onClick={() => setFullScreenImage(msg.imageUrl)}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.2rem', gap: '0.35rem' }}>
                  {msg.isEdited && <span style={{ fontSize: '0.55rem', opacity: 0.6 }}>(edited)</span>}
                  <span style={{ fontSize: '0.62rem', opacity: isSelf ? 0.7 : 0.45 }}>{formatTime(msg.createdAt)}</span>
                  {isSelf && msg.isRead && (
                    <span style={{ fontSize: '0.55rem', background: 'var(--success)', color: 'white', padding: '1px 5px', borderRadius: '6px', fontWeight: 'bold' }}>Seen</span>
                  )}
                </div>
              </div>
            </React.Fragment>
            );
          })}
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
              Messaging blocked.
            </div>
          ) : userState === 'none' ? (
             <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem', width: '100%', textAlign: 'center', padding: '1rem' }}>
              You are no longer friends.
             </div>
          ) : (
             <div style={{ width: '100%' }}>
                {(replyingTo || editingMessage || imagePreview) && (
                  <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {imagePreview && (
                          <div style={{ position: 'relative', width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                            <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            {(isUploading || isCompressing) && (
                               <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                 <span className="spinner" style={{ width: '12px', height: '12px', marginRight: 0 }}></span>
                               </div>
                            )}
                          </div>
                        )}
                        <span>
                          {replyingTo && <>Replying to <strong>{replyingTo.sender.username}</strong>: {replyingTo.text.slice(0, 30)}...</>}
                          {editingMessage && <>Editing message...</>}
                          {imagePreview && !replyingTo && !editingMessage && (
                            <span>
                              <strong>{isUploading ? 'Sending image...' : isCompressing ? 'Compressing...' : 'Image ready'}</strong>
                              {!isCompressing && (
                                <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '0.5rem' }}>
                                  {compressionMode === 'compressed' && originalFileSize !== compressedFileSize
                                    ? `${formatFileSize(originalFileSize)} → ${formatFileSize(compressedFileSize)} (${Math.round((1 - compressedFileSize / originalFileSize) * 100)}% saved)`
                                    : formatFileSize(compressedFileSize)
                                  }
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                      </div>
                      <button onClick={cancelAction} className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none' }}>Cancel</button>
                    </div>
                    {/* Compression mode toggle - only show when image is selected */}
                    {imagePreview && !replyingTo && !editingMessage && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.25rem' }}>
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
                      </div>
                    )}
                  </div>
                )}
                <form onSubmit={sendMessage} className="input-area" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', margin: 0, alignItems: 'flex-end' }}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    onChange={handleImageChange} 
                  />
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '0.5rem', height: '42px', width: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => fileInputRef.current.click()}
                    disabled={isUploading}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                  </button>
                  <textarea 
                    ref={inputRef}
                    className="input-field" 
                    placeholder={editingMessage ? "Edit your message..." : (userState.includes('pending') && sentCount >= 10 ? "Limit reached..." : "Type a message...")} 
                    value={inputMessage}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInputMessage(val);
                      if (!editingMessage) {
                        if (val.trim() === '') {
                          localStorage.removeItem(`draft_${user?.id}_${friendId}`);
                        } else {
                          localStorage.setItem(`draft_${user?.id}_${friendId}`, val);
                        }
                      }
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
                      overflowY: inputMessage.length > 100 ? 'auto' : 'hidden'
                    }}
                    disabled={userState.includes('pending') && sentCount >= 10}
                  />
                  <button type="submit" className="btn" style={{ padding: '0.65rem 1.25rem', height: '42px' }} disabled={userState.includes('pending') && sentCount >= 10}>
                    {editingMessage ? 'Save' : 'Send'}
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
