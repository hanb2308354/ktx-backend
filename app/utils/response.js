// app/utils/response.js
// Chuẩn hóa response toàn hệ thống: mọi API trả về cùng một cấu trúc
// { success, message, data } — giúp frontend xử lý nhất quán

// Trả về thành công
const success = (res, { message = 'Thành công', data = null, total = undefined, statusCode = 200 } = {}) => {
  const body = { success: true, message };
  if (data  !== null)      body.data  = data;
  if (total !== undefined) body.total = total;
  return res.status(statusCode).json(body);
};

// Trả về lỗi (dùng trong controller hoặc error handler)
const error = (res, { message = 'Có lỗi xảy ra', statusCode = 500 } = {}) => {
  return res.status(statusCode).json({ success: false, message });
};

module.exports = { success, error };
