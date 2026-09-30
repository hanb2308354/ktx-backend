// app/utils/asyncHandler.js
// Bọc hàm controller async — tự động bắt lỗi và chuyển về error handler trung tâm
// Nhờ đó controller không cần try/catch lặp lại ở mọi hàm
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
