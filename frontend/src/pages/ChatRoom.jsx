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

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);

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
    }
  }, [user, friendId, socket]);

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
    
    return () => {
      socket.off('receive_message', handleReceive);
      socket.off('message_edited', handleEditReceive);
      socket.off('messages_read', handleMessagesRead);
      socket.off('chat_error', handleError);
    };
  }, [socket, user, friendId, userState]);

  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView();
    }, 100);
  }, [messages.length > 0 && messages[0]?._id]); 

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() === '' || userState === 'blocked' || userState === 'none') return;
    
    if (userState.includes('pending') && sentCount >= 10) {
       alert("Limit of 10 messages reached. Accept or wait for them to accept to continue.");
       return;
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
        replyTo: replyingTo ? replyingTo._id : null
      });
      setReplyingTo(null);
    }
    
    setInputMessage('');
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
    setInputMessage('');
    inputRef.current?.focus();
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

  const isOnline = onlineUsers.includes(friendId);

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
            
            return (
              <React.Fragment key={msg._id || idx}>
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
                    <div>{msg.replyTo.text.length > 60 ? msg.replyTo.text.substring(0, 60) + '...' : msg.replyTo.text}</div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.05rem', paddingRight: '18px' }}>
                  <span className="message-sender" style={{ fontSize: '0.62rem', fontWeight: '600', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{isSelf ? 'You' : msg.sender.username}</span>
                </div>

                <div style={{ lineHeight: '1.4', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{msg.text}</div>

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
                {(replyingTo || editingMessage) && (
                  <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span>
                      {replyingTo && <>Replying to <strong>{replyingTo.sender.username}</strong>: {replyingTo.text.slice(0, 30)}...</>}
                      {editingMessage && <>Editing message...</>}
                    </span>
                    <button onClick={cancelAction} className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none' }}>Cancel</button>
                  </div>
                )}
                <form onSubmit={sendMessage} className="input-area" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', margin: 0, alignItems: 'flex-end' }}>
                  <textarea 
                    ref={inputRef}
                    className="input-field" 
                    placeholder={editingMessage ? "Edit your message..." : (userState.includes('pending') && sentCount >= 10 ? "Limit reached..." : "Type a message...")} 
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
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
