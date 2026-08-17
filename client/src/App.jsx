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

  // Real-time state
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);

  // Mobile sidebar toggle
  const [showSidebar, setShowSidebar] = useState(true);

  // Refs
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

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
        <div className="auth-card">
          <div className="auth-header">
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
  // RENDER: Chat Application
  // ============================================================
  return (
    <div className="chat-app">
      {/* ---- Sidebar: User List ---- */}
      <div className={`sidebar ${showSidebar ? 'show' : ''}`}>
        <div className="sidebar-header">
          <h2>Chats</h2>
          <div className="sidebar-user-info">
            <span className="current-user">{user.username}</span>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        </div>

        <div className="user-list">
          {users.map((u) => (
            <div
              key={u._id}
              className={`user-item ${selectedUser?._id === u._id ? 'active' : ''}`}
              onClick={() => { setSelectedUser(u); setShowSidebar(false); setTypingUser(null); }}
            >
              <div className="user-avatar">
                {u.username.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-name">{u.username}</span>
                <span className={`user-status ${onlineUsers.includes(u._id) ? 'online' : 'offline'}`}>
                  {onlineUsers.includes(u._id) ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="no-users">No other users yet. Ask someone to register!</div>
          )}
        </div>
      </div>

      {/* ---- Chat Area ---- */}
      <div className="chat-area">
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="chat-header">
              <button className="back-btn" onClick={() => setShowSidebar(true)}>←</button>
              <div className="chat-header-info">
                <h3>{selectedUser.username}</h3>
                <span className={`header-status ${onlineUsers.includes(selectedUser._id) ? 'online' : 'offline'}`}>
                  {onlineUsers.includes(selectedUser._id) ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div className="messages-container">
              {messages.map((msg, index) => (
                <div
                  key={msg._id || index}
                  className={`message ${msg.sender === user.id ? 'sent' : 'received'}`}
                >
                  <div className="message-bubble">
                    <p className="message-text">{msg.text}</p>
                    <div className="message-meta">
                      <span className="message-time">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.sender === user.id && (
                        <span className={`message-status ${msg.status}`}>
                          {getStatusIcon(msg.status)}
                          {msg.status === 'read' && ' Read'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing Indicator */}
              {typingUser && typingUser.senderId === selectedUser._id && (
                <div className="typing-indicator">
                  <div className="typing-dots">
                    <span></span><span></span><span></span>
                  </div>
                  <span>{typingUser.senderName} is typing...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form onSubmit={sendMessage} className="message-input-form">
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={handleTyping}
                className="message-input"
              />
              <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="no-chat-selected">
            <div className="no-chat-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="currentColor"/>
              </svg>
            </div>
            <h2>Welcome, {user.username}!</h2>
            <p>Select a user to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
