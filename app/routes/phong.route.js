// app/routes/phong.route.js
const express = require('express');
const router = express.Router();
const { layDanhSachPhong, layChiTietPhong } = require('../controllers/phong.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

router.get('/',         verifyToken, layDanhSachPhong);
router.get('/:maPhong', verifyToken, layChiTietPhong);

module.exports = router;
