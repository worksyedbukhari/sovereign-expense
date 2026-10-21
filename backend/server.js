require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const jwt = require('jsonwebtoken');
const { configuredOrigins, permittedOrigin } = require('./utils/originPolicy');
const { get } = require('./database');
const { initDatabase } = require('./database');

const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const expenseRoutes = require('./routes/expenses');
const settlementRoutes = require('./routes/settlements');
const chatRoutes = require('./routes/chat');
const analyticsRoutes = require('./routes/analytics');
const emailRoutes = require('./routes/email');
const contactRoutes = require('./routes/contacts');
const notificationRoutes = require('./routes/notifications');
const { startScheduler } = require('./utils/scheduler');

async function startServer() {
  await initDatabase();
  console.log('Database initialized');

  const app = express();
  const server = http.createServer(app);
  const origins = configuredOrigins();
  const io = new Server(server, {
    cors: {
      origin: (origin, next) => next(null, !origin || origins.has(origin)),
      methods: ['GET', 'POST']
    },
    // WebSocket handshakes are not protected by browser CORS checks.
    allowRequest: (request, next) => next(
      null, permittedOrigin(request.headers.origin, request.headers.host, origins)
    )
  });

  app.set('io', io);

  app.use(cors((req, next) => {
    const origin = req.headers.origin;
    const allowed = permittedOrigin(origin, req.headers.host, origins);
    next(null, { origin: allowed && origin ? origin : false });
  }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/settlements', settlementRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/email', emailRoutes);
  app.use('/api/contacts', contactRoutes);
  app.use('/api/notifications', notificationRoutes);

  // Socket subscriptions require an authenticated account and active group membership.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token || !process.env.JWT_SECRET) return next(new Error('Authentication required'));
      const user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (!Number.isInteger(user.id) || user.id <= 0) return next(new Error('Invalid identity'));
      socket.data.userId = user.id;
      socket.data.userName = typeof user.name === 'string' ? user.name : 'Member';
      next();
    } catch (error) {
      next(new Error('Invalid authentication'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user_${socket.data.userId}`);
    const canAccessGroup = async (groupId) => {
      if (!Number.isSafeInteger(Number(groupId)) || Number(groupId) <= 0) return false;
      const member = await get(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, socket.data.userId]
      );
      return Boolean(member);
    };

    socket.on('join_group', async (groupId, ack) => {
      try {
        if (!(await canAccessGroup(groupId))) {
          if (typeof ack === 'function') ack({ error: 'Group access denied' });
          return;
        }
        socket.join(`group_${Number(groupId)}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (error) {
        if (typeof ack === 'function') ack({ error: 'Unable to join group' });
      }
    });

    socket.on('leave_group', (groupId) => {
      if (Number.isSafeInteger(Number(groupId)) && Number(groupId) > 0) {
        socket.leave(`group_${Number(groupId)}`);
      }
    });

    // Messages are persisted and broadcast only by the authenticated REST endpoint;
    // never relay arbitrary client-supplied message payloads.
    const relayTyping = async (event, groupId) => {
      try {
        if (!socket.rooms.has(`group_${Number(groupId)}`) || !(await canAccessGroup(groupId))) {
          socket.leave(`group_${Number(groupId)}`);
          return;
        }
        socket.to(`group_${Number(groupId)}`).emit(event, { username: socket.data.userName });
      } catch (_) { /* Do not relay on database failure. */ }
    };
    socket.on('typing', (data) => relayTyping('user_typing', data && data.groupId));
    socket.on('stop_typing', (data) => relayTyping('user_stop_typing', data && data.groupId));
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (process.env.NODE_ENV === 'production' || process.env.SERVE_FRONTEND === 'true') {
    app.use(express.static(path.join(__dirname, '../frontend/build')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
    });
  }

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`WebSocket server ready`);
    startScheduler();
  });

  module.exports = { app, server, io };
}

startServer().catch(console.error);
