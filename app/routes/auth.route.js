// app/routes/auth.route.js
const express = require('express');
const router  = express.Router();
const { dangNhap, dangXuat, layThongTinCaNhan } = require('../controllers/auth.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

router.post('/login',  dangNhap);                        // Không cần token
router.post('/logout', verifyToken, dangXuat);           // Cần token
router.get('/me',      verifyToken, layThongTinCaNhan);  // Cần token

module.exports = router;
