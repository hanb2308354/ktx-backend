// app/routes/hopdong.route.js
const express = require('express');
const router = express.Router();
const { layDanhSachHopDong, layChiTietHopDong, taoHopDong, ketThucHopDong, duyetHopDong, tuChoiHopDong, duyetKetThucHopDong, tuChoiKetThucHopDong } = require('../controllers/hopdong.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

router.get('/',                    verifyToken, layDanhSachHopDong);
router.get('/:maHD',               verifyToken, layChiTietHopDong);
router.post('/',                   verifyToken, taoHopDong);
router.put('/:maHD/ket-thuc',      verifyToken, ketThucHopDong);
router.put('/:maHD/duyet',         verifyToken, duyetHopDong);
router.put('/:maHD/tu-choi',       verifyToken, tuChoiHopDong);
router.put('/:maHD/duyet-ket-thuc',   verifyToken, duyetKetThucHopDong);
router.put('/:maHD/tu-choi-ket-thuc', verifyToken, tuChoiKetThucHopDong);

module.exports = router;
