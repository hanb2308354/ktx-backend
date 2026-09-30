// app/routes/hoadon.route.js
const express = require('express');
const router  = express.Router();
const {
  layDanhSachHoaDon, layChiTietHoaDon,
  tinhVaTaoHoaDon, capNhatThanhToan,
  nhapChiSoDongHo, layChiSoGanNhat, thongKeDoanhThu
} = require('../controllers/hoadon.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// ⚠ Route tĩnh phải đặt TRƯỚC route có :param
router.get('/thong-ke',              verifyToken, thongKeDoanhThu);
router.get('/dong-ho/gan-nhat/:maPhong', verifyToken, layChiSoGanNhat);
router.post('/dong-ho',              verifyToken, nhapChiSoDongHo);
router.post('/tinh-toan',            verifyToken, tinhVaTaoHoaDon);
router.get('/',                      verifyToken, layDanhSachHoaDon);
router.get('/:maHDN',                verifyToken, layChiTietHoaDon);
router.put('/:maHDN/thanh-toan',     verifyToken, capNhatThanhToan);

module.exports = router;
