const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { body, validationResult } = require('express-validator');
const { Payment, User } = require('../models');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Create payment intent for Zakat al-Fitr
router.post('/create-intent', [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least $1'),
  body('donorName').trim().isLength({ min: 2, max: 100 }).withMessage('Donor name is required'),
  body('familySize').isInt({ min: 1, max: 50 }).withMessage('Family size must be between 1 and 50'),
  optionalAuth
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { amount, donorName, familySize, paymentType = 'zakat_al_fitr' } = req.body;
    const userId = req.user?.id;

    // Create payment record
    const payment = await Payment.create({
      amount,
      donorName,
      familySize,
      paymentType,
      userId,
      status: 'pending'
    });

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        paymentId: payment.id,
        donorName,
        familySize,
        paymentType
      },
      description: `Zakat al-Fitr payment - ${donorName} (${familySize} people)`
    });

    // Update payment record with Stripe payment intent ID
    await payment.update({
      stripePaymentIntentId: paymentIntent.id
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentId: payment.id
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ 
      message: 'Failed to create payment intent',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Confirm payment
router.post('/confirm', [
  body('paymentIntentId').notEmpty().withMessage('Payment intent ID is required'),
  optionalAuth
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { paymentIntentId } = req.body;

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // Find and update payment record
      const payment = await Payment.findOne({
        where: { stripePaymentIntentId: paymentIntentId }
      });

      if (payment) {
        await payment.update({ status: 'completed' });
        
        res.json({
          success: true,
          message: 'Payment confirmed successfully',
          payment: {
            id: payment.id,
            amount: payment.amount,
            status: payment.status,
            donorName: payment.donorName,
            familySize: payment.familySize
          }
        });
      } else {
        res.status(404).json({ message: 'Payment record not found' });
      }
    } else {
      res.status(400).json({ 
        message: 'Payment not completed',
        status: paymentIntent.status
      });
    }
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ 
      message: 'Failed to confirm payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get payment history (authenticated users only)
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const payments = await Payment.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'amount', 'status', 'donorName', 'familySize', 'paymentType', 'createdAt']
    });
    
    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ 
      message: 'Failed to get payment history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get payment statistics (admin only)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { Op } = require('sequelize');
    
    const totalPayments = await Payment.count({
      where: { status: 'completed' }
    });
    
    const totalAmount = await Payment.sum('amount', {
      where: { status: 'completed' }
    });
    
    const totalDonors = await Payment.count({
      distinct: true,
      col: 'donorName',
      where: { status: 'completed' }
    });
    
    const recentPayments = await Payment.findAll({
      where: { status: 'completed' },
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
        totalPayments,
        totalAmount: totalAmount || 0,
        totalDonors,
        recentPayments
      }
    });
  } catch (error) {
    console.error('Payment stats error:', error);
    res.status(500).json({ 
      message: 'Failed to get payment statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Webhook for Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent was successful!', paymentIntent.id);
      
      // Update payment status in database
      try {
        await Payment.update(
          { status: 'completed' },
          { where: { stripePaymentIntentId: paymentIntent.id } }
        );
      } catch (error) {
        console.error('Error updating payment status:', error);
      }
      break;
      
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('PaymentIntent failed!', failedPayment.id);
      
      // Update payment status in database
      try {
        await Payment.update(
          { status: 'failed' },
          { where: { stripePaymentIntentId: failedPayment.id } }
        );
      } catch (error) {
        console.error('Error updating payment status:', error);
      }
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
