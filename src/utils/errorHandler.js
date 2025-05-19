/**
 * Custom error response class
 */
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errorDetails = undefined;
  
  // Handle Shopify API errors (typically from GraphQL responses)
  if (err.message && err.message.includes('userErrors')) {
    try {
      const shopifyErrors = JSON.parse(err.message);
      if (Array.isArray(shopifyErrors)) {
        message = shopifyErrors.map(e => e.message).join('; ');
        errorDetails = shopifyErrors;
        statusCode = 400; // Bad Request
      }
    } catch (e) {
      // Not a JSON string, use the original error
    }
  }
  
  // Only include stack trace in development
  const stack = process.env.NODE_ENV === 'development' ? err.stack : undefined;
  
  res.status(statusCode).json({
    success: false,
    message,
    errorDetails,
    stack,
  });
}

module.exports = {
  errorHandler,
  ApiError
}; 