/**
 * Dual-mode Express entrypoint
 *
 * PSEUDOCODE
 * ----------
 * 1. Load env + create Express `app`
 * 2. Attach middleware (helmet, cors, rate limit, json, …)
 * 3. Mount API routes (/api/auth, /api/rag, …)
 * 4. Attach error + 404 handlers
 * 5. ALWAYS: module.exports = app
 *      → Vercel imports this and invokes Express per HTTP request
 *      → Jest/supertest does the same: request(app).post(...)
 * 6. ONLY when this file is the process entry (node index.js):
 *      a. create HTTP server wrapping `app`
 *      b. attach Socket.IO (long-lived connections; local/always-on only for now)
 *      c. connect DB (optional in dev)
 *      d. server.listen(PORT)
 *      e. start ingestion scheduler (background job — not for serverless boot)
 *      f. register SIGTERM/SIGINT shutdown
 *
 * Why gate listen/Socket/scheduler?
 * - Vercel loads this module as a Function; it must NOT call listen() or start
 *   forever-running timers on import.
 * - handleSearch in the browser → HTTP POST → Vercel invokes exported `app`
 *   → Express router → ragService. listen() is never involved there.
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Always load env relative to /server, regardless of where node is launched from.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/auth');
const ragRoutes = require('./routes/rag');
const paymentRoutes = require('./routes/payment');
const forumRoutes = require('./routes/forum');
const eventRoutes = require('./routes/events');

const { sequelize } = require('./config/database');
const socketHandlers = require('./socket/socketHandlers');
const { startIngestionScheduler } = require('./services/ingestionScheduler');

const app = express();

// CORS: local fallback only in non-production. Prod must set CLIENT_URL.
// Trailing slashes break origin matching — strip them.
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
let clientUrl = (process.env.CLIENT_URL || '').replace(/\/$/, '');
if (!clientUrl) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CLIENT_URL is required when NODE_ENV=production');
  }
  clientUrl = 'http://localhost:3000';
}

// Explicit headers first (preflight + ACAO). Do not rely on cors() alone.
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', clientUrl);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(cors({
  origin: clientUrl,
  credentials: true,
}));

// Helmet default CORP is same-origin and can interfere with cross-origin API use.
// https://helmetjs.github.io/#cross-origin-resource-policy
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Routes ---
function healthPayload() {
  return {
    status: 'OK',
    timestamp: new Date().toISOString(),
  };
}

// Root and /health both report liveness (browsers often open `/` first).
app.get('/', (req, res) => {
  res.json(healthPayload());
});

app.get('/health', (req, res) => {
  res.json(healthPayload());
});

app.use('/api/auth', authRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/events', eventRoutes);

// --- 404 then 500 (error handler last) ---
// Express docs: define error-handling middleware last
// https://expressjs.com/en/guide/error-handling.html
// Express 5 (path-to-regexp v6) does not accept "*" as a path pattern here.
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {},
  });
});

const PORT = process.env.PORT || 5000;

/**
 * Long-running process mode (local / Railway-style).
 * Not used when Vercel or Jest only `require` this module.
 */
async function startServer() {
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: clientUrl,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socketHandlers(io, socket);
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  try {
    const requireDb = (process.env.REQUIRE_DB || '').toLowerCase() === 'true'
      ? true
      : (process.env.NODE_ENV === 'production');

    try {
      await sequelize.authenticate();
      console.log('Database connection established successfully.');

      if (process.env.NODE_ENV === 'development') {
        await sequelize.sync({ alter: true });
        console.log('Database models synchronized.');
      }
    } catch (dbError) {
      if (requireDb) {
        throw dbError;
      }
      console.warn('Database connection unavailable; continuing without DB (set REQUIRE_DB=true to enforce).');
    }

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

      // Background crawl → embed → Qdrant. Keep off serverless cold-start path.
      startIngestionScheduler(console);
    });

    const shutdown = async (signal) => {
      console.log(`${signal} received, shutting down gracefully`);
      await sequelize.close();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
}

// Vercel / tests: import the app. Local CLI: node index.js → listen.
module.exports = app;

if (require.main === module) {
  startServer();
}
