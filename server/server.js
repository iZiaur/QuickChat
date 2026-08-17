// ============================================================
// server.js — ENTIRE BACKEND IN ONE FILE
// Contains: MongoDB models, REST routes, Socket.IO events
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ============================================================
// CORS & Socket.IO Setup
// ============================================================
const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL // Production frontend URL (set on Render)
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
});

// ============================================================
// MONGODB CONNECTION
// ============================================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB error:', err));

// ============================================================
// MONGOOSE MODELS (defined right here, no separate files)
// ============================================================

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email:    { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
  sender:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:     { type: String, required: true },
  status:   { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

// ============================================================
// JWT MIDDLEWARE (just one simple function)
// ============================================================
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]; // "Bearer <token>"
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, username }
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// ============================================================
// REST API ROUTES
// ============================================================

// --- Register ---
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password with bcrypt (10 salt rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save user
    const user = await User.create({ username, email, password: hashedPassword });

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// --- Login ---
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid email or password' });

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- Get all users (except the logged-in user) ---
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } }).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// --- Get messages between two users ---
app.get('/api/messages/:otherUserId', authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user.id, receiver: req.params.otherUserId },
        { sender: req.params.otherUserId, receiver: req.user.id }
      ]
    }).sort({ createdAt: 1 }); // oldest first

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ============================================================
// SOCKET.IO — REAL-TIME EVENTS
// ============================================================

// Track online users: Map<userId, socketId>
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // --- User comes online ---
  socket.on('userOnline', async (userId) => {
    onlineUsers.set(userId, socket.id);
    console.log(`🟢 ${userId} is online`);

    // Tell everyone who is online
    io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));

    // Deliver any messages that were sent while user was offline
    const undelivered = await Message.find({ receiver: userId, status: 'sent' });
    for (const msg of undelivered) {
      msg.status = 'delivered';
      await msg.save();

      // Notify the sender that their message was delivered
      const senderSocket = onlineUsers.get(msg.sender.toString());
      if (senderSocket) {
        io.to(senderSocket).emit('messageStatusUpdate', {
          messageId: msg._id,
          status: 'delivered'
        });
      }
    }
  });

  // --- Send Message ---
  socket.on('sendMessage', async (data) => {
    // data = { senderId, receiverId, text }
    try {
      const receiverSocket = onlineUsers.get(data.receiverId);

      // Save to MongoDB
      const message = await Message.create({
        sender: data.senderId,
        receiver: data.receiverId,
        text: data.text,
        status: receiverSocket ? 'delivered' : 'sent' // delivered if receiver is online
      });

      // Send to receiver if online
      if (receiverSocket) {
        io.to(receiverSocket).emit('receiveMessage', message);
      }

      // Send back to sender with saved message (includes _id and status)
      socket.emit('messageSent', message);
    } catch (err) {
      console.log('Message error:', err);
    }
  });

  // --- Typing Indicator ---
  socket.on('typing', (data) => {
    // data = { senderId, receiverId, senderName }
    const receiverSocket = onlineUsers.get(data.receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('userTyping', {
        senderId: data.senderId,
        senderName: data.senderName
      });
    }
  });

  socket.on('stopTyping', (data) => {
    // data = { senderId, receiverId }
    const receiverSocket = onlineUsers.get(data.receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('userStopTyping', { senderId: data.senderId });
    }
  });

  // --- Mark Messages as Read ---
  socket.on('markAsRead', async (data) => {
    // data = { readerId, senderId }
    // Mark all messages from senderId to readerId as "read"
    try {
      const result = await Message.updateMany(
        { sender: data.senderId, receiver: data.readerId, status: { $ne: 'read' } },
        { status: 'read' }
      );

      // Notify the sender that their messages were read
      if (result.modifiedCount > 0) {
        const senderSocket = onlineUsers.get(data.senderId);
        if (senderSocket) {
          io.to(senderSocket).emit('messagesRead', {
            readerId: data.readerId
          });
        }
      }
    } catch (err) {
      console.log('Mark read error:', err);
    }
  });

  // --- User Disconnects ---
  socket.on('disconnect', () => {
    // Find which user disconnected
    for (const [userId, socketId] of onlineUsers) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`⚪ ${userId} went offline`);
        break;
      }
    }
    // Tell everyone the updated online users list
    io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
