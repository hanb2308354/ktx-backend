// app/routes/sinhvien_portal.route.js
const express = require('express');
const router = express.Router();
const { xemThongTin, xemPhongConCho, dangKyPhong, xemHopDong, xemHoaDon, xemPhongDangO, xinKetThucHopDong } = require('../controllers/sinhvien_portal.controller');
const { verifyTokenSV } = require('../middlewares/auth.middleware');

router.get('/thong-tin',   verifyTokenSV, xemThongTin);
router.get('/phong',       verifyTokenSV, xemPhongConCho);
router.post('/dang-ky',    verifyTokenSV, dangKyPhong);
router.get('/hop-dong',    verifyTokenSV, xemHopDong);
router.post('/hop-dong/:maHD/xin-ket-thuc', verifyTokenSV, xinKetThucHopDong);
router.get('/hoa-don',     verifyTokenSV, xemHoaDon);
router.get('/phong-dang-o',verifyTokenSV, xemPhongDangO);

module.exports = router;
