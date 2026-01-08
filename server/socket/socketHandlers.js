const { Update } = require('../models');

const socketHandlers = (io, socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join user to general room
  socket.join('general');

  // Handle user joining specific rooms
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room: ${room}`);
  });

  // Handle user leaving rooms
  socket.on('leave-room', (room) => {
    socket.leave(room);
    console.log(`User ${socket.id} left room: ${room}`);
  });

  // Handle real-time updates
  socket.on('request-updates', async () => {
    try {
      const updates = await Update.findAll({
        where: {
          isActive: true,
          [require('sequelize').Op.or]: [
            { expiresAt: null },
            { expiresAt: { [require('sequelize').Op.gt]: new Date() } }
          ]
        },
        order: [['priority', 'DESC'], ['createdAt', 'DESC']],
        limit: 5
      });

      socket.emit('updates', updates);
    } catch (error) {
      console.error('Error fetching updates:', error);
      socket.emit('error', { message: 'Failed to fetch updates' });
    }
  });

  // Handle forum notifications
  socket.on('new-post', (data) => {
    // Broadcast to all users in general room
    socket.to('general').emit('forum-update', {
      type: 'new-post',
      data: data
    });
  });

  socket.on('new-reply', (data) => {
    // Broadcast to all users in general room
    socket.to('general').emit('forum-update', {
      type: 'new-reply',
      data: data
    });
  });

  // Handle prayer time notifications
  socket.on('prayer-reminder', (data) => {
    // Broadcast to all users
    io.emit('prayer-reminder', data);
  });

  // Handle admin announcements
  socket.on('admin-announcement', (data) => {
    // Only admins can send announcements
    if (data.userRole === 'admin') {
      io.emit('announcement', data);
    }
  });

  // Handle user typing indicators (for forum)
  socket.on('typing-start', (data) => {
    socket.to('forum').emit('user-typing', {
      userId: data.userId,
      userName: data.userName,
      isTyping: true
    });
  });

  socket.on('typing-stop', (data) => {
    socket.to('forum').emit('user-typing', {
      userId: data.userId,
      userName: data.userName,
      isTyping: false
    });
  });

  // Handle connection status
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, reason: ${reason}`);
  });

  // Error handling
  socket.on('error', (error) => {
    console.error(`Socket error for user ${socket.id}:`, error);
  });
};

// Helper function to broadcast updates to all connected users
const broadcastUpdate = (io, update) => {
  io.emit('update', {
    message: update.message,
    priority: update.priority,
    timestamp: new Date()
  });
};

// Helper function to broadcast prayer reminders
const broadcastPrayerReminder = (io, prayerData) => {
  io.emit('prayer-reminder', {
    prayer: prayerData.prayer,
    time: prayerData.time,
    message: prayerData.message
  });
};

module.exports = socketHandlers;
module.exports.broadcastUpdate = broadcastUpdate;
module.exports.broadcastPrayerReminder = broadcastPrayerReminder;
