require('dotenv').config();

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');

const app = express();

app.set('trust proxy', 1);

const server = http.createServer(app);

const io = new Server(server, {
  path: '/socket.io',
  cors: {
    origin: [
      'https://www.swadmart.shop',
      'http://localhost:3000',
      'http://localhost:4028'
    ],
    credentials: true,
  },

  // Better for Render free tier
  transports: ['websocket'],

  pingTimeout: 60000,
  pingInterval: 25000,
});

function getUserFromCookie(header) {
  const parsed = cookie.parse(header || '');

  const token = parsed.swadmart_auth_token;

  if (!token) {
    throw new Error('No token');
  }

  const payload = jwt.verify(
    token,
    process.env.AUTH_JWT_SECRET,
    {
      issuer: 'swadmart-auth',
      audience: 'swadmart-web',
    }
  );

  return {
    userId: payload.sub,
    role: payload.role || 'user',
  };
}

io.use((socket, next) => {
  try {
    const user = getUserFromCookie(
      socket.request.headers.cookie
    );

    socket.data.userId = user.userId;
    socket.data.role = user.role;

    next();
  } catch (err) {
    console.error('Socket auth failed');

    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log(
    `User connected: ${socket.data.userId}`
  );

  // Personal room
  socket.join(`user:${socket.data.userId}`);

  // Admin room
  if (
    ['admin', 'super_admin'].includes(
      socket.data.role
    )
  ) {
    socket.join('admin:dashboard');
  }

  // Join order room
  socket.on('orders:join', ({ orderId }) => {
    if (!orderId) return;

    socket.join(`order:${orderId}`);

    console.log(
      `Joined order room: ${orderId}`
    );
  });

  // Leave order room
  socket.on('orders:leave', ({ orderId }) => {
    if (!orderId) return;

    socket.leave(`order:${orderId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Health route
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(
    `Socket server running on port ${PORT}`
  );
});