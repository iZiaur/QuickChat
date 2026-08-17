# 💬 Real-Time Chat Application

A minimal, interview-ready 1-to-1 real-time chat application.

## Tech Stack

- **Frontend:** React.js + Vite
- **Backend:** Node.js + Express.js
- **Real-time:** Socket.IO
- **Database:** MongoDB + Mongoose
- **Auth:** JWT + bcrypt

## Project Structure

```
client/
  src/
    App.jsx       ← Entire frontend (auth, chat, socket)
    App.css       ← All styles
    main.jsx      ← Entry point

server/
  server.js       ← Entire backend (routes, models, socket)
  .env            ← Environment variables
```

**Only 2 main logic files** — easy to read and explain in an interview.

## Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd "Real Time Chat Engine"
```

### 2. Install dependencies

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

### 3. Configure environment

Create `server/.env`:

```
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
PORT=5000
```

### 4. Run the application

```bash
# Terminal 1 — Start the server
cd server
npm start

# Terminal 2 — Start the client
cd client
npm run dev
```

### 5. Test with two browser windows

1. Open `http://localhost:5173` in Window 1 → Register as **Alice**
2. Open `http://localhost:5173` in Window 2 → Register as **Bob**
3. Select each other and start chatting!

## Features

- ✅ Register & Login (JWT + bcrypt)
- ✅ Real-time messaging (Socket.IO)
- ✅ Message persistence (MongoDB)
- ✅ Online/Offline status
- ✅ Typing indicator
- ✅ Message status (Sent → Delivered → Read)
- ✅ Offline message support

## Architecture

```
         React (App.jsx)
               |
      -------------------
      |                 |
   REST API          Socket.IO
      |                 |
   Express           Real-time
      |              Events
      |                 |
      ------ Node -------
           (server.js)
               |
            MongoDB
```

- **REST API:** Register, Login, Get Users, Get Messages
- **Socket.IO:** Send/Receive Messages, Typing, Online Status, Read Receipts
