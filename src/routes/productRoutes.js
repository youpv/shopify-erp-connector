const express = require('express');
const productController = require('../controllers/productController');
const router = express.Router();

/**
 * @route   POST /api/products/sync
 * @desc    Initiate product synchronization
 * @access  Private
 */
router.post('/sync', productController.syncProducts);

/**
 * @route   GET /api/products/configs
 * @desc    Get all product sync configurations
 * @access  Private
 */
router.get('/configs', productController.getConfigurations);

/**
 * @route   POST /api/products/configs
 * @desc    Create a new product sync configuration
 * @access  Private
 */
router.post('/configs', productController.createConfiguration);

/**
 * @route   GET /api/products/configs/:id
 * @desc    Get a specific product sync configuration
 * @access  Private
 */
router.get('/configs/:id', productController.getConfiguration);

/**
 * @route   PUT /api/products/configs/:id
 * @desc    Update a specific product sync configuration
 * @access  Private
 */
router.put('/configs/:id', productController.updateConfiguration);

/**
 * @route   DELETE /api/products/configs/:id
 * @desc    Delete a specific product sync configuration
 * @access  Private
 */
router.delete('/configs/:id', productController.deleteConfiguration);

/**
 * @route   GET /api/products/configs/:id/logs
 * @desc    Get sync logs for a specific configuration
 * @access  Private
 */
router.get('/configs/:id/logs', productController.getSyncLogs);

/**
 * @route   POST /api/products/cleanup-duplicates
 * @desc    Clean up duplicate products in Shopify based on SKU
 * @access  Private
 */
router.post('/cleanup-duplicates', productController.cleanupDuplicates);

module.exports = router; 