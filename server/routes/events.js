const express = require('express');
const { body, validationResult } = require('express-validator');
const { Event, Update } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all events
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    
    const whereClause = {};
    if (category && category !== 'all') {
      whereClause.category = category;
    }

    const events = await Event.findAll({
      where: whereClause,
      order: [['date', 'ASC'], ['time', 'ASC']]
    });

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ 
      message: 'Failed to get events',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get single event
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findByPk(id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ 
      message: 'Failed to get event',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new event (admin only)
router.post('/', [
  authenticateToken,
  requireRole(['admin']),
  body('name').trim().isLength({ min: 3, max: 200 }).withMessage('Event name is required'),
  body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time is required'),
  body('location').trim().isLength({ min: 3, max: 200 }).withMessage('Location is required'),
  body('category').isIn(['adults', 'children', 'food', 'all']).withMessage('Valid category is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { name, description, date, time, location, category, maxCapacity } = req.body;

    const event = await Event.create({
      name,
      description,
      date,
      time,
      location,
      category,
      maxCapacity
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ 
      message: 'Failed to create event',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update event (admin only)
router.put('/:id', [
  authenticateToken,
  requireRole(['admin']),
  body('name').optional().trim().isLength({ min: 3, max: 200 }),
  body('description').optional().trim().isLength({ min: 10, max: 2000 }),
  body('date').optional().isISO8601(),
  body('time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('location').optional().trim().isLength({ min: 3, max: 200 }),
  body('category').optional().isIn(['adults', 'children', 'food', 'all'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    const event = await Event.findByPk(id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    await event.update(updateData);

    res.json({
      success: true,
      message: 'Event updated successfully',
      data: event
    });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ 
      message: 'Failed to update event',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete event (admin only)
router.delete('/:id', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findByPk(id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    await event.destroy();

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ 
      message: 'Failed to delete event',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get updates
router.get('/updates/all', async (req, res) => {
  try {
    const updates = await Update.findAll({
      where: {
        isActive: true,
        [require('sequelize').Op.or]: [
          { expiresAt: null },
          { expiresAt: { [require('sequelize').Op.gt]: new Date() } }
        ]
      },
      order: [['priority', 'DESC'], ['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: updates
    });
  } catch (error) {
    console.error('Get updates error:', error);
    res.status(500).json({ 
      message: 'Failed to get updates',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create update (admin only)
router.post('/updates', [
  authenticateToken,
  requireRole(['admin']),
  body('message').trim().isLength({ min: 5, max: 500 }).withMessage('Message is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { message, priority = 'medium', expiresAt } = req.body;

    const update = await Update.create({
      message,
      priority,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });

    res.status(201).json({
      success: true,
      message: 'Update created successfully',
      data: update
    });
  } catch (error) {
    console.error('Create update error:', error);
    res.status(500).json({ 
      message: 'Failed to create update',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
