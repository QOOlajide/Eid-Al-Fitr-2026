const express = require('express');
const { body, validationResult } = require('express-validator');
const ragService = require('../services/ragService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Search Islamic knowledge
router.post('/search', [
  body('query').trim().isLength({ min: 3, max: 500 }).withMessage('Query must be between 3 and 500 characters'),
  authenticateToken
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { query } = req.body;
    const userId = req.user?.id;

    const result = await ragService.searchIslamicKnowledge(query, userId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('RAG search error:', error);
    res.status(500).json({ 
      message: 'Failed to search Islamic knowledge',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get related questions
router.post('/related', [
  body('topic').trim().isLength({ min: 2, max: 200 }).withMessage('Topic must be between 2 and 200 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { topic } = req.body;
    const questions = await ragService.getRelatedQuestions(topic);
    
    res.json({
      success: true,
      data: questions
    });
  } catch (error) {
    console.error('Related questions error:', error);
    res.status(500).json({ 
      message: 'Failed to get related questions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get search history (authenticated users only)
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { RAGSearch } = require('../models');
    const userId = req.user.id;
    
    const searches = await RAGSearch.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 20,
      attributes: ['id', 'query', 'confidence', 'responseTime', 'createdAt']
    });
    
    res.json({
      success: true,
      data: searches
    });
  } catch (error) {
    console.error('Search history error:', error);
    res.status(500).json({ 
      message: 'Failed to get search history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Clear search cache (admin only)
router.delete('/cache', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    ragService.clearCache();
    
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ 
      message: 'Failed to clear cache',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get RAG statistics (admin only)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { RAGSearch, User } = require('../models');
    
    const totalSearches = await RAGSearch.count();
    const uniqueUsers = await RAGSearch.count({
      distinct: true,
      col: 'userId'
    });
    const avgResponseTime = await RAGSearch.findOne({
      attributes: [
        [sequelize.fn('AVG', sequelize.col('responseTime')), 'avgResponseTime']
      ]
    });
    
    const recentSearches = await RAGSearch.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10,
      include: [{
        model: User,
        attributes: ['name', 'email']
      }]
    });
    
    res.json({
      success: true,
      data: {
        totalSearches,
        uniqueUsers,
        avgResponseTime: avgResponseTime?.dataValues?.avgResponseTime || 0,
        recentSearches
      }
    });
  } catch (error) {
    console.error('RAG stats error:', error);
    res.status(500).json({ 
      message: 'Failed to get RAG statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
