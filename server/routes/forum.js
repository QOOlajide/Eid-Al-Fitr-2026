const express = require('express');
const { body, validationResult } = require('express-validator');
const { ForumPost, ForumReply, User } = require('../models');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get all forum posts
router.get('/posts', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, category } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (category && category !== 'all') {
      whereClause.category = category;
    }

    const posts = await ForumPost.findAndCountAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'name', 'email']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        posts: posts.rows,
        total: posts.count,
        page: parseInt(page),
        totalPages: Math.ceil(posts.count / limit)
      }
    });
  } catch (error) {
    console.error('Get forum posts error:', error);
    res.status(500).json({ 
      message: 'Failed to get forum posts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get single forum post with replies
router.get('/posts/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const post = await ForumPost.findByPk(id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email']
        },
        {
          model: ForumReply,
          as: 'replies',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'name', 'email']
          }],
          order: [['createdAt', 'ASC']]
        }
      ]
    });

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Increment view count
    await post.increment('views');

    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('Get forum post error:', error);
    res.status(500).json({ 
      message: 'Failed to get forum post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new forum post
router.post('/posts', [
  authenticateToken,
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('content').trim().isLength({ min: 10, max: 5000 }).withMessage('Content must be between 10 and 5000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { title, content, category = 'general' } = req.body;
    const userId = req.user.id;

    const post = await ForumPost.create({
      title,
      content,
      category,
      userId
    });

    // Get the post with author information
    const postWithAuthor = await ForumPost.findByPk(post.id, {
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'name', 'email']
      }]
    });

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: postWithAuthor
    });
  } catch (error) {
    console.error('Create forum post error:', error);
    res.status(500).json({ 
      message: 'Failed to create forum post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create reply to forum post
router.post('/posts/:id/replies', [
  authenticateToken,
  body('content').trim().isLength({ min: 5, max: 2000 }).withMessage('Content must be between 5 and 2000 characters')
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
    const { content } = req.body;
    const userId = req.user.id;

    // Check if post exists
    const post = await ForumPost.findByPk(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const reply = await ForumReply.create({
      content,
      postId: id,
      userId
    });

    // Get the reply with author information
    const replyWithAuthor = await ForumReply.findByPk(reply.id, {
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'name', 'email']
      }]
    });

    res.status(201).json({
      success: true,
      message: 'Reply created successfully',
      data: replyWithAuthor
    });
  } catch (error) {
    console.error('Create forum reply error:', error);
    res.status(500).json({ 
      message: 'Failed to create forum reply',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Mark reply as accepted (post author only)
router.put('/replies/:id/accept', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const reply = await ForumReply.findByPk(id, {
      include: [{
        model: ForumPost,
        as: 'post'
      }]
    });

    if (!reply) {
      return res.status(404).json({ message: 'Reply not found' });
    }

    // Check if user is the post author
    if (reply.post.userId !== userId) {
      return res.status(403).json({ message: 'Only the post author can accept replies' });
    }

    // Unaccept all other replies for this post
    await ForumReply.update(
      { isAccepted: false },
      { where: { postId: reply.postId } }
    );

    // Accept this reply
    await reply.update({ isAccepted: true });

    // Mark post as answered
    await reply.post.update({ isAnswered: true });

    res.json({
      success: true,
      message: 'Reply accepted successfully'
    });
  } catch (error) {
    console.error('Accept reply error:', error);
    res.status(500).json({ 
      message: 'Failed to accept reply',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete forum post (author or admin only)
router.delete('/posts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const post = await ForumPost.findByPk(id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user is the author or admin
    if (post.userId !== userId && userRole !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }

    await post.destroy();

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Delete forum post error:', error);
    res.status(500).json({ 
      message: 'Failed to delete forum post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete forum reply (author or admin only)
router.delete('/replies/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const reply = await ForumReply.findByPk(id);

    if (!reply) {
      return res.status(404).json({ message: 'Reply not found' });
    }

    // Check if user is the author or admin
    if (reply.userId !== userId && userRole !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this reply' });
    }

    await reply.destroy();

    res.json({
      success: true,
      message: 'Reply deleted successfully'
    });
  } catch (error) {
    console.error('Delete forum reply error:', error);
    res.status(500).json({ 
      message: 'Failed to delete forum reply',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
