// app/routes/giaca.route.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth.middleware');
const {
  layDanhSachNam, layGiaPhongTheoNam, themNam, capNhatDonGia, capNhatGiaPhong
} = require('../controllers/giaca.controller');

// Tất cả thao tác giá đều yêu cầu quyền nhân viên
router.get('/nam',        verifyToken, layDanhSachNam);        // danh sách năm + đơn giá điện nước
router.get('/phong',      verifyToken, layGiaPhongTheoNam);    // giá phòng theo năm
router.post('/nam',       verifyToken, themNam);               // thêm năm mới
router.put('/nam/:nam',   verifyToken, capNhatDonGia);         // sửa đơn giá điện nước
router.put('/phong',      verifyToken, capNhatGiaPhong);       // sửa giá phòng

module.exports = router;
