const express = require('express');
const productRoutes = require('./productRoutes');
const router = express.Router();

/**
 * Product-related routes
 * Base path: /api/products
 */
router.use('/products', productRoutes);

// Add other resource routes here as needed
// For example:
// router.use('/orders', orderRoutes);
// router.use('/customers', customerRoutes);
// router.use('/inventory', inventoryRoutes);

/**
 * @route   GET /api/health
 * @desc    API health check endpoint
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 