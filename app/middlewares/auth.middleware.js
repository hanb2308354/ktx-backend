// app/middlewares/auth.middleware.js
// Kiểm tra JWT token cho mọi request
// verifyToken     — dùng cho nhân viên
// verifyTokenSV   — dùng cho sinh viên
// verifyTokenBoth — dùng cho API cả 2 đều truy cập được

const jwt = require('jsonwebtoken');
require('dotenv').config();

// Middleware cho nhân viên — chặn nếu không phải tài khoản NV
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Bạn chưa đăng nhập.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.loai !== 'NV') {
      return res.status(403).json({ success: false, message: 'Chỉ nhân viên mới có quyền thực hiện.' });
    }
    req.nhanvien = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' });
  }
};

// Middleware cho sinh viên — chặn nếu không phải tài khoản SV
const verifyTokenSV = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Bạn chưa đăng nhập.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.loai !== 'SV') {
      return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới có quyền thực hiện.' });
    }
    req.sinhvien = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' });
  }
};

module.exports = { verifyToken, verifyTokenSV };
