// app/routes/sinhvien.route.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth.middleware');
const {
  layDanhSachSinhVien, layDanhSachLop, layDanhSachKhoa, themKhoa, themLop,
  layChiTietSinhVien, themSinhVien, capNhatSinhVien
} = require('../controllers/sinhvien.controller');

// Tất cả route quản lý sinh viên đều yêu cầu quyền nhân viên
router.get('/lop',    verifyToken, layDanhSachLop);      // danh sách lớp (đặt trước /:maSV để không bị nuốt)
router.get('/khoa',   verifyToken, layDanhSachKhoa);     // danh sách khoa (để thêm lớp mới)
router.post('/khoa',  verifyToken, themKhoa);            // thêm khoa mới
router.post('/lop',   verifyToken, themLop);             // thêm lớp mới
router.get('/',       verifyToken, layDanhSachSinhVien);
router.post('/',      verifyToken, themSinhVien);        // thêm sinh viên mới
router.get('/:maSV',  verifyToken, layChiTietSinhVien);
router.put('/:maSV',  verifyToken, capNhatSinhVien);     // sửa thông tin

module.exports = router;
