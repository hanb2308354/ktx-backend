// app/utils/AppError.js
// Lớp lỗi nghiệp vụ — mang theo HTTP status code
// Controller throw lỗi này, error handler trung tâm bắt và trả response chuẩn
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // lỗi nghiệp vụ đã lường trước, không phải bug
  }
}

module.exports = AppError;
