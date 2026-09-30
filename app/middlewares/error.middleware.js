// app/middlewares/error.middleware.js
// Xử lý exception tập trung — đặt CUỐI CÙNG trong chuỗi middleware của app
// Mọi lỗi từ controller (qua next(err) hoặc throw trong async wrapper) đổ về đây

const AppError = require('../utils/AppError');

const errorHandler = (err, req, res, next) => {
  // Lỗi nghiệp vụ đã lường trước (AppError) → trả đúng status code
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }

  // Lỗi từ trigger MySQL (SIGNAL SQLSTATE '45000') → 400 với message gốc
  if (err && err.sqlState === '45000') {
    return res.status(400).json({ success: false, message: err.message });
  }

  // Lỗi vi phạm ràng buộc trùng lặp (UNIQUE) → 409
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Dữ liệu đã tồn tại (trùng khóa duy nhất).' });
  }

  // Lỗi không lường trước → log ra server, trả 500 chung chung (không lộ chi tiết)
  console.error('[Unhandled Error]', err);
  return res.status(500).json({ success: false, message: 'Lỗi hệ thống. Vui lòng thử lại sau.' });
};

module.exports = errorHandler;
