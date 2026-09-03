class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {Array<{field?: string, message: string}>} errors  field-level details (e.g. validation)
   */
  constructor(statusCode, message, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true; // distinguishes expected errors from programming bugs
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Not authenticated') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Not authorized to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static unprocessable(message, errors = []) {
    return new ApiError(422, message, errors);
  }

  static badGateway(message = 'Upstream service failed') {
    return new ApiError(502, message);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, message);
  }
}

module.exports = ApiError;
