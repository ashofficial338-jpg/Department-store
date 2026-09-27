import ApiError from '../utils/ApiError.js';

export function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, req, res, next) {
  let { statusCode, message } = err;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `A record with this ${field} already exists.` : 'Duplicate record.';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid identifier supplied.';
  }

  if (!statusCode) statusCode = 500;
  if (!message || statusCode === 500) message = err.isOperational ? err.message : 'Something went wrong. Please try again.';

  if (statusCode === 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.details ? { details: err.details } : {}),
  });
}

export default { notFound, errorHandler };
