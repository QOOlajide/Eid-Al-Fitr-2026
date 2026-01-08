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

// Import routes
const authRoutes = require('./routes/auth');
const ragRoutes = require('./routes/rag');
const paymentRoutes = require('./routes/payment');
const forumRoutes = require('./routes/forum');
const eventRoutes = require('./routes/events');

// Import database
const { sequelize } = require('./config/database');

// Import socket handlers
const socketHandlers = require('./socket/socketHandlers');
const { startIngestionScheduler } = require('./services/ingestionScheduler');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/events', eventRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socketHandlers(io, socket);
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
// Express 5 (path-to-regexp v6) does not accept "*" as a path pattern here.
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Database connection and server start
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    const requireDb = (process.env.REQUIRE_DB || '').toLowerCase() === 'true'
      ? true
      : (process.env.NODE_ENV === 'production');

    // Test database connection (optional in dev for easier local testing)
    try {
      await sequelize.authenticate();
      console.log('Database connection established successfully.');

      // Sync database models
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
    
    // Start server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

      // Background RAG indexing (crawl -> chunk -> embed -> Qdrant) on startup + schedule
      startIngestionScheduler(console);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await sequelize.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await sequelize.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

startServer();
