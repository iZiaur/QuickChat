// ============================================================
// App.jsx — ENTIRE FRONTEND IN ONE FILE
// Contains: Auth, User List, Chat, Socket.IO integration
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import './App.css';

// Backend URL — uses Vite proxy in development, env variable in production
const API = import.meta.env.VITE_API_URL || '';

function App() {
  // ============================================================
  // STATE
  // ============================================================
  
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');

  // Chat state
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  // UI state
  const [activeNavTab, setActiveNavTab] = useState('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeHeaderTab, setActiveHeaderTab] = useState('Messages');
  const [toast, setToast] = useState(null);

  // Real-time state
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);

  // Mobile sidebar toggle
  const [showSidebar, setShowSidebar] = useState(true);

  // Refs
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // Helpers
  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  // ============================================================
  // AXIOS SETUP — attach JWT to every request
  // ============================================================
  const api = axios.create({
    baseURL: API,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  // ============================================================
  // AUTH FUNCTIONS
  // ============================================================
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');

    try {
      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      const body = authMode === 'login'
        ? { email: authForm.email, password: authForm.password }
        : authForm;

      const res = await axios.post(`${API}${endpoint}`, body);
      
      // Save token and user to state + localStorage
      setToken(res.data.token);
      setUser(res.data.user);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Something went wrong');
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setSelectedUser(null);
    setMessages([]);
    setUsers([]);
    setAuthForm({ username: '', email: '', password: '' });
    setAuthError('');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (socket) socket.disconnect();
    setSocket(null);
  };

  // ============================================================
  // FETCH USERS (REST API)
  // ============================================================
  useEffect(() => {
    if (!token) return;

    const fetchUsers = async () => {
      try {
        const res = await api.get('/api/users');
        setUsers(res.data);
      } catch (err) {
        console.log('Failed to fetch users:', err);
      }
    };

    fetchUsers();
  }, [token]);

  // ============================================================
  // SOCKET.IO CONNECTION
  // ============================================================
  useEffect(() => {
    if (!token || !user) return;

    // Connect to Socket.IO server
    const newSocket = io(API || window.location.origin, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Connected to socket');
      // Tell the server this user is online
      newSocket.emit('userOnline', user.id);
    });

    // Listen for online users list
    newSocket.on('getOnlineUsers', (users) => {
      setOnlineUsers(users);
    });

    // Listen for incoming messages
    newSocket.on('receiveMessage', (message) => {
      setMessages(prev => [...prev, message]);
    });

    // Listen for sent message confirmation (with _id and status from server)
    newSocket.on('messageSent', (message) => {
      setMessages(prev => [...prev, message]);
    });

    // Listen for message status updates (delivered)
    newSocket.on('messageStatusUpdate', ({ messageId, status }) => {
      setMessages(prev => prev.map(msg =>
        msg._id === messageId ? { ...msg, status } : msg
      ));
    });

    // Listen for messages read
    newSocket.on('messagesRead', ({ readerId }) => {
      setMessages(prev => prev.map(msg =>
        msg.sender === user.id && msg.receiver === readerId
          ? { ...msg, status: 'read' }
          : msg
      ));
    });

    // Listen for typing indicators
    newSocket.on('userTyping', ({ senderId, senderName }) => {
      setTypingUser({ senderId, senderName });
    });

    newSocket.on('userStopTyping', () => {
      setTypingUser(null);
    });

    setSocket(newSocket);

    // Cleanup on unmount or logout
    return () => newSocket.disconnect();
  }, [token, user]);

  // ============================================================
  // FETCH MESSAGES WHEN SELECTING A USER (REST API)
  // ============================================================
  useEffect(() => {
    if (!selectedUser || !token) return;

    const fetchMessages = async () => {
      try {
        const res = await api.get(`/api/messages/${selectedUser._id}`);
        setMessages(res.data);

        // Mark messages as read
        if (socket) {
          socket.emit('markAsRead', {
            readerId: user.id,
            senderId: selectedUser._id
          });
        }
      } catch (err) {
        console.log('Failed to fetch messages:', err);
      }
    };

    fetchMessages();
  }, [selectedUser]);

  // ============================================================
  // AUTO-SCROLL to bottom when new messages arrive
  // ============================================================
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ============================================================
  // MARK AS READ when receiving message from selected user
  // ============================================================
  useEffect(() => {
    if (!socket || !selectedUser || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.sender === selectedUser._id && lastMessage.status !== 'read') {
      socket.emit('markAsRead', {
        readerId: user.id,
        senderId: selectedUser._id
      });
    }
  }, [messages, selectedUser]);

  // ============================================================
  // SEND MESSAGE (Socket.IO)
  // ============================================================
  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !socket) return;

    socket.emit('sendMessage', {
      senderId: user.id,
      receiverId: selectedUser._id,
      text: newMessage.trim()
    });

    // Stop typing indicator
    socket.emit('stopTyping', {
      senderId: user.id,
      receiverId: selectedUser._id
    });

    setNewMessage('');
  };

  // ============================================================
  // TYPING INDICATOR (Socket.IO)
  // ============================================================
  const handleTyping = (e) => {
    setNewMessage(e.target.value);

    if (!socket || !selectedUser) return;

    // Emit typing event
    socket.emit('typing', {
      senderId: user.id,
      receiverId: selectedUser._id,
      senderName: user.username
    });

    // Clear previous timeout and set new one
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stopTyping', {
        senderId: user.id,
        receiverId: selectedUser._id
      });
    }, 1000); // Stop typing after 1 second of no input
  };

  // ============================================================
  // HELPER: Message status icon
  // ============================================================
  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent': return '✓';
      case 'delivered': return '✓✓';
      case 'read': return '✓✓';
      default: return '';
    }
  };

  // ============================================================
  // RENDER: Login / Register Page
  // ============================================================
  if (!token) {
    return (
      <div className="auth-container">
        {/* Abstract Background Video */}
        <video autoPlay loop muted playsInline className="auth-bg-video">
          <source src="https://assets.codepen.io/3364143/7btrrd.mp4" type="video/mp4" />
        </video>
        <div className="auth-bg-overlay"></div>

        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3L2 12H5V20H19V12H22L12 3Z" fill="currentColor"/>
              </svg>
            </div>
            <h1>Quick Chat</h1>
            <p>Real-time messaging</p>
          </div>

          <div className="auth-tabs">
            <button
              className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
            >
              Login
            </button>
            <button
              className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuth} className="auth-form">
            {authMode === 'register' && (
              <input
                type="text"
                placeholder="Username"
                value={authForm.username}
                onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              required
            />
            {authError && <div className="auth-error">{authError}</div>}
            <button type="submit" className="auth-submit">
              {authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: Chat Application (Dribbble Layout)
  // ============================================================
  return (
    <div className="chat-app">
      <div className="app-container">
        {/* ---- Slim Left Nav ---- */}
        <div className="slim-nav">
          <div className="nav-top">
            <div className="brand-logo">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3L2 12H5V20H19V12H22L12 3Z" fill="var(--primary)"/>
              </svg>
            </div>
            <div 
              className={`nav-item ${activeNavTab === 'home' ? 'active' : ''}`}
              onClick={() => { setActiveNavTab('home'); showToast('Home view coming soon!'); }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
            <div 
              className={`nav-item ${activeNavTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveNavTab('chat')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div 
              className={`nav-item ${activeNavTab === 'time' ? 'active' : ''}`}
              onClick={() => { setActiveNavTab('time'); showToast('History view coming soon!'); }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div 
              className={`nav-item ${activeNavTab === 'files' ? 'active' : ''}`}
              onClick={() => { setActiveNavTab('files'); showToast('Files view coming soon!'); }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
          </div>
          <div className="nav-bottom">
            <button className="nav-item logout-icon" onClick={handleLogout} title="Logout">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* ---- Middle Sidebar (Chat List) ---- */}
        <div className={`sidebar ${showSidebar ? 'show' : ''}`}>
          
          <div className="sidebar-profile">
            <div className="profile-header">
              <h2>Chat</h2>
              <button className="settings-btn" onClick={() => showToast('Settings coming soon!')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>
            </div>
            
            <div className="my-profile">
              <div className="my-avatar">
                {user.username.charAt(0).toUpperCase()}
                <div className="status-dot"></div>
              </div>
              <h3>{user.username}</h3>
              <div className="availability-badge">Available ▾</div>
            </div>

            <div className="search-bar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                placeholder="Search" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="last-chats-header">
            <h4>Last chats</h4>
            <button className="add-chat-btn" onClick={() => showToast('Group chats coming soon!')}>+</button>
          </div>

          <div className="user-list">
            {users.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase())).map((u) => (
              <div
                key={u._id}
                className={`user-item ${selectedUser?._id === u._id ? 'active' : ''}`}
                onClick={() => { setSelectedUser(u); setShowSidebar(false); setTypingUser(null); }}
              >
                <div className="user-avatar-small">
                  {u.username.charAt(0).toUpperCase()}
                  {onlineUsers.includes(u._id) && <div className="online-dot-small"></div>}
                </div>
                <div className="user-info">
                  <div className="user-name-row">
                    <span className="user-name">{u.username}</span>
                    <span className="time-placeholder">11:15</span>
                  </div>
                  <span className="user-status-text">
                     {onlineUsers.includes(u._id) ? 'Online right now' : 'Away'}
                  </span>
                </div>
              </div>
            ))}

            {users.length === 0 && (
              <div className="no-users">No other users yet.</div>
            )}
          </div>
        </div>

        {/* ---- Main Chat Area ---- */}
        <div className="chat-area">
          {selectedUser ? (
            <>
              {/* Chat Header */}
              <div className="chat-header">
                <button className="back-btn" onClick={() => setShowSidebar(true)}>←</button>
                <div className="chat-header-info">
                  <h3>{selectedUser.username}</h3>
                  <div className="header-tabs">
                    <button 
                      className={`tab ${activeHeaderTab === 'Messages' ? 'active' : ''}`}
                      onClick={() => setActiveHeaderTab('Messages')}
                    >
                      Messages
                    </button>
                    <button 
                      className={`tab ${activeHeaderTab === 'Participants' ? 'active' : ''}`}
                      onClick={() => { setActiveHeaderTab('Participants'); showToast('Participants view coming soon!'); }}
                    >
                      Participants
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="messages-container">
                {messages.map((msg, index) => {
                  const isSent = msg.sender === user.id;
                  return (
                    <div
                      key={msg._id || index}
                      className={`message-wrapper ${isSent ? 'sent-wrapper' : 'received-wrapper'}`}
                    >
                      {!isSent && (
                        <div className="msg-avatar">
                           {selectedUser.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      
                      <div className={`message ${isSent ? 'sent' : 'received'}`}>
                        <span className="msg-name-time">
                          {isSent ? 'You' : selectedUser.username}, {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="message-bubble">
                          <p className="message-text">{msg.text}</p>
                          {isSent && (
                            <span className={`message-status ${msg.status}`}>
                              {getStatusIcon(msg.status)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing Indicator */}
                {typingUser && typingUser.senderId === selectedUser._id && (
                  <div className="message-wrapper received-wrapper">
                    <div className="msg-avatar">
                       {selectedUser.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="typing-indicator">
                      <div className="typing-dots">
                        <span></span><span></span><span></span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Pill */}
              <div className="input-wrapper">
                <form onSubmit={sendMessage} className="message-input-form">
                  <input
                    type="text"
                    placeholder="Write your message..."
                    value={newMessage}
                    onChange={handleTyping}
                    className="message-input"
                  />
                  <div className="input-actions">
                    <button type="button" className="icon-btn" onClick={() => showToast('Emojis coming soon!')}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                      </svg>
                    </button>
                    <button type="button" className="icon-btn" onClick={() => showToast('File uploads coming soon!')}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                      </svg>
                    </button>
                    <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                      </svg>
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="no-chat-selected">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1" strokeDasharray="4 2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <h2>Select a conversation</h2>
              <p>Choose a chat from the sidebar to start messaging.</p>
            </div>
          )}
        </div>
      </div>

      {/* Global Toast Notification */}
      {toast && (
        <div className="toast-notification">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
