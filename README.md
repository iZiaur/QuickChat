<div align="center">
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/65dea6c4eaca7da319e552c09f4cf5a9a8dab2c2/icons/React-Dark.svg" width="40" height="40" alt="React" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/65dea6c4eaca7da319e552c09f4cf5a9a8dab2c2/icons/NodeJS-Dark.svg" width="40" height="40" alt="Node.js" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/65dea6c4eaca7da319e552c09f4cf5a9a8dab2c2/icons/MongoDB.svg" width="40" height="40" alt="MongoDB" />
  
  <h1 align="center">Quick Chat</h1>
  
  <p align="center">
    <strong>A high-performance, real-time messaging application with a premium UI.</strong>
  </p>

  <p align="center">
    <a href="https://vercel.com/">Live Demo</a> (Update with your Vercel URL) • 
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a>
  </p>
</div>

<br/>

> **Note for Interviewers & Reviewers:** 
> Quick Chat was built to demonstrate proficiency in full-stack JavaScript, event-driven WebSocket architecture, and modern CSS design principles. It emphasizes a scalable backend structure and a polished, "Dribbble-quality" frontend user experience.

---

## 🎨 UI Showcase

*(Replace this placeholder with a screenshot or GIF of your beautiful light-theme UI!)*

![Quick Chat UI Screenshot](https://via.placeholder.com/1000x600.png?text=Add+Screenshot+Here)

---

## ✨ Features

- **⚡ Real-Time Messaging:** Instantaneous bi-directional communication powered by Socket.IO.
- **👀 Live Typing Indicators:** See when the other person is typing in real-time.
- **✅ Read Receipts & Status:** Track message delivery status (Sent, Delivered, Read).
- **🟢 Online Presence:** Live tracking of user availability across the platform.
- **💅 Premium UI/UX:** A bespoke, lightweight interface featuring glassmorphism, soft shadows, micro-animations, and a responsive multi-column layout.
- **🔐 Secure Authentication:** JWT-based user authentication and secure password hashing.
- **🔎 Dynamic Search:** Real-time client-side filtering of chat histories.

---

## 🛠️ Tech Stack

### Frontend (Client)
- **React 18:** Functional components & Hooks for reactive state management.
- **Vite:** Next-generation frontend tooling for instantaneous HMR and optimized builds.
- **Socket.IO-Client:** Event-based WebSocket communication.
- **Vanilla CSS3:** Custom CSS variables, Flexbox/Grid layouts, and CSS animations (No bulky UI libraries).

### Backend (Server)
- **Node.js & Express.js:** Robust RESTful API architecture.
- **Socket.IO:** Real-time event handling, room management, and presence tracking.
- **MongoDB & Mongoose:** NoSQL database modeling for users and message schemas.
- **JSON Web Tokens (JWT):** Stateless, secure API authentication.
- **Bcrypt.js:** Secure cryptographic password hashing.

---

## 🏗️ System Architecture

1. **REST API:** Handles authentication (`/register`, `/login`) and initial data fetching (getting user lists, loading chat history).
2. **WebSocket Layer (Socket.IO):** Once authenticated, a persistent duplex connection is established. It handles volatile events that require sub-second latency:
   - `sendMessage` / `receiveMessage`
   - `userOnline` / `getOnlineUsers`
   - `typing` / `stopTyping`
   - `markAsRead`

---

## 🚀 Getting Started

To run this project locally, you will need **Node.js** and a **MongoDB** instance (local or MongoDB Atlas).

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/quick-chat.git
cd quick-chat
```

### 2. Setup the Backend
```bash
cd server
npm install
```
Create a `.env` file in the `server` directory:
```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_super_secret_jwt_key
CLIENT_URL=http://localhost:5173
```
Start the server:
```bash
npm run dev
```

### 3. Setup the Frontend
Open a new terminal window:
```bash
cd client
npm install
```
Create a `.env` file in the `client` directory:
```env
VITE_API_URL=http://localhost:5000
```
Start the Vite development server:
```bash
npm run dev
```

---

## 🌍 Deployment

- **Frontend:** Deployed globally on the Edge via [Vercel](https://vercel.com/).
- **Backend:** Hosted on a Node environment via [Render](https://render.com/).
- **Database:** Hosted on [MongoDB Atlas](https://www.mongodb.com/atlas/database).

*Note: Due to Render's free-tier limitations, the backend may spin down after 15 minutes of inactivity. Initial connection times may take up to 30-50 seconds.*

---
<div align="center">
  <i>Built with ❤️ by (Your Name Here)</i>
</div>
