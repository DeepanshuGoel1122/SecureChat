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
  
  const [userState, setUserState] = useState('none'); // 'friend', 'pending', 'blocked', 'none'
  const [sentCount, setSentCount] = useState(0);

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch(`https://securechat-u1nk.onrender.com/api/users/friends/${user.id}`);
        const data = await res.json();
        
        const isFriend = (data.friends || []).some(f => f._id === friendId);
        const isSentReq = (data.sentRequests || []).some(f => f._id === friendId);
        const isRecvReq = (data.receivedRequests || []).some(f => f._id === friendId);
        const isBlocked = (data.blockedUsers || []).some(f => f._id === friendId);
        
        if (isBlocked) setUserState('blocked');
        else if (isFriend) setUserState('friend');
        else if (isSentReq || isRecvReq) setUserState('pending');
        else setUserState('none');

        const userRes = await fetch(`https://securechat-u1nk.onrender.com/api/users/user/${friendId}`);
        const fallbackUser = await userRes.json();
        setFriendDetails(fallbackUser);
        
        const histRes = await fetch(`https://securechat-u1nk.onrender.com/api/messages/history/${user.id}/${friendId}`);
        const histData = await histRes.json();
        setMessages(histData);
        
        const myMessages = histData.filter(m => m.sender._id === user.id).length;
        setSentCount(myMessages);

        if (socket && isFriend) {
          socket.emit('mark_read', { userId: user.id, friendId });
        }
      } catch (err) {
        console.error('Error fetching data', err);
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

    socket.on('receive_message', handleReceive);
    socket.on('message_edited', handleEditReceive);
    socket.on('chat_error', handleError);
    
    return () => {
      socket.off('receive_message', handleReceive);
      socket.off('message_edited', handleEditReceive);
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
    if (userState === 'pending' && sentCount >= 10) {
       alert("Limit of 10 messages reached. Wait for them to accept the request.");
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
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
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
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleEdit = (msg) => {
    if (userState === 'blocked' || userState === 'none') return;
    setEditingMessage(msg);
    setReplyingTo(null);
    setInputMessage(msg.text);
    setActiveMenuId(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const cancelAction = () => {
    setReplyingTo(null);
    setEditingMessage(null);
    setInputMessage('');
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      <div className="glass-panel header" style={{ marginBottom: '1rem', padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ 
            width: '12px', height: '12px', borderRadius: '50%', 
            background: isOnline ? 'var(--success)' : 'var(--text-secondary)',
            boxShadow: isOnline ? '0 0 5px var(--success)' : 'none'
          }}></div>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>Chat with {friendDetails ? friendDetails.username : '...'}</h2>
            <span style={{ fontSize: '0.85rem', color: isOnline ? 'var(--success)' : 'var(--text-secondary)' }}>
              {isOnline ? 'Online & Secure' : 'Offline'}
            </span>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Back</button>
      </div>

      <div className="glass-panel messages-area" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>
        
        {userState === 'pending' && (
          <div style={{ background: '#ff9800', color: '#fff', padding: '0.5rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 'bold', zIndex: 10 }}>
            Friend request pending. {10 - sentCount > 0 ? (10 - sentCount) : 0}/10 message limit active.
          </div>
        )}

        <div 
          ref={chatContainerRef}
          onScroll={handleScroll}
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {messages.map((msg, idx) => {
            const isSelf = msg.sender._id === user.id;
            const showMenu = activeMenuId === msg._id;
            
            return (
              <div 
                key={msg._id || idx} 
                id={`msg-${msg._id}`}
                className={`message ${isSelf ? 'self' : 'other'}`}
                style={{ position: 'relative', paddingBottom: '1rem', minWidth: '220px', opacity: (userState === 'friend' || userState === 'pending') ? 1 : 0.8 }}
              >
                {/* Arrow Button */}
                <button 
                  onClick={(e) => { e.stopPropagation(); setActiveMenuId(showMenu ? null : msg._id); }}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'rgba(0,0,0,0.3)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.6
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showMenu && (
                  <div style={{
                    position: 'absolute',
                    top: '36px',
                    right: '8px',
                    background: 'var(--panel-bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '6px',
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                  }}>
                    <button onClick={() => handleCopy(msg.text)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.6rem 1rem', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Copy</button>
                    {(userState === 'friend' || userState === 'pending') && (
                      <>
                        <button onClick={() => handleReply(msg)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.6rem 1rem', cursor: 'pointer', textAlign: 'left' }}>Reply</button>
                        {isSelf && (
                          <button onClick={() => handleEdit(msg)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.6rem 1rem', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.05)' }}>Edit</button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Reply Block */}
                {msg.replyTo && (
                  <div 
                    onClick={() => scrollToOriginal(msg.replyTo._id)}
                    style={{ 
                      background: 'rgba(0,0,0,0.15)', 
                      padding: '0.5rem', 
                      borderRadius: '4px', 
                      marginBottom: '0.5rem',
                      borderLeft: `3px solid ${isSelf ? 'white' : 'var(--accent)'}`,
                      fontSize: '0.85rem',
                      opacity: 0.9,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ color: isSelf ? '#ddd' : 'var(--accent)' }}>{msg.replyTo.sender?.username}</strong>
                      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{formatTime(msg.replyTo.createdAt)}</span>
                    </div>
                    <div>{msg.replyTo.text.length > 60 ? msg.replyTo.text.substring(0, 60) + '...' : msg.replyTo.text}</div>
                  </div>
                )}

                <div 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'baseline', 
                    marginBottom: '0.25rem',
                    paddingRight: '22px'
                  }}
                >
                  <span className="message-sender">{isSelf ? 'You' : msg.sender.username}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {msg.isEdited && <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>(edited)</span>}
                    <span style={{ fontSize: '0.7rem', opacity: isSelf ? 0.8 : 0.5 }}>{formatTime(msg.createdAt)}</span>
                  </div>
                </div>

                <div style={{ lineHeight: '1.4' }}>{msg.text}</div>
              </div>
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

        {/* Dynamic Content Footer */}
        <div style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--panel-bg)', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
          {userState === 'blocked' ? (
            <div style={{ color: '#ffb3b3', fontStyle: 'italic', fontSize: '0.9rem', width: '100%', textAlign: 'center', padding: '1rem', background: 'rgba(255,0,0,0.1)' }}>
              Messaging blocked.
            </div>
          ) : userState === 'none' ? (
             <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem', width: '100%', textAlign: 'center', padding: '1rem' }}>
              You are no longer friends with this user. Messaging disabled.
             </div>
          ) : (
             <div style={{ width: '100%' }}>
               {(replyingTo || editingMessage) && (
                 <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                   <span>
                     {replyingTo && <>Replying to <strong>{replyingTo.sender.username}</strong>: {replyingTo.text.substring(0, 30)}{replyingTo.text.length > 30 ? '...' : ''}</>}
                     {editingMessage && <>Editing message...</>}
                   </span>
                   <button onClick={cancelAction} className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none' }}>Cancel</button>
                 </div>
               )}
               <form onSubmit={sendMessage} className="input-area" style={{ padding: '1rem', display: 'flex', gap: '1rem', margin: 0 }}>
                 <input 
                   type="text" 
                   ref={inputRef}
                   className="input-field" 
                   placeholder={editingMessage ? "Edit your message..." : (userState === 'pending' && sentCount >= 10 ? "Limit reached..." : "Type a message...")} 
                   value={inputMessage}
                   onChange={(e) => setInputMessage(e.target.value)}
                   style={{ marginBottom: 0, flex: 1 }}
                   disabled={userState === 'pending' && sentCount >= 10}
                 />
                 <button type="submit" className="btn" disabled={userState === 'pending' && sentCount >= 10}>{editingMessage ? 'Save' : 'Send'}</button>
               </form>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatRoom;
