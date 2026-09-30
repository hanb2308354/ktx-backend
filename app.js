require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Health check — kiểm tra server sống
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// === Routes nhân viên ===
app.use('/api/auth',     require('./app/routes/auth.route'));
app.use('/api/phong',    require('./app/routes/phong.route'));
app.use('/api/sinhvien', require('./app/routes/sinhvien.route'));
app.use('/api/hopdong',  require('./app/routes/hopdong.route'));
app.use('/api/hoadon',   require('./app/routes/hoadon.route'));
app.use('/api/giaca',    require('./app/routes/giaca.route'));

// === Routes sinh viên portal ===
app.use('/api/sv',       require('./app/routes/sinhvien_portal.route'));

// Route không tồn tại → 404 chuẩn
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Không tìm thấy tài nguyên yêu cầu.' });
});

// === Xử lý lỗi tập trung — PHẢI đặt cuối cùng ===
app.use(require('./app/middlewares/error.middleware'));

module.exports = app;
