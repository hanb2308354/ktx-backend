// app/controllers/auth.controller.js
// Đăng nhập / đăng xuất cho cả nhân viên (NV) và sinh viên (SV)
// Phân biệt qua cột LOAI trong TAIKHOAN: 'NV' hoặc 'SV'
// Token có hiệu lực 120 ngày để dễ test và báo cáo

const db = require('../../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// POST /api/auth/login
// Body: { tenDangNhap, matKhau }
const dangNhap = async (req, res) => {
  const { tenDangNhap, matKhau } = req.body;

  if (!tenDangNhap || !matKhau) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
  }

  try {
    const [tkRows] = await db.execute(
      'SELECT TK_TENDN, TK_MATKHAU, LOAI FROM TAIKHOAN WHERE TK_TENDN = ?',
      [tenDangNhap]
    );

    if (tkRows.length === 0) {
      return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    const taiKhoan = tkRows[0];

    // Hỗ trợ cả mật khẩu plain text lẫn đã hash bcrypt
    const isHashed = taiKhoan.TK_MATKHAU.startsWith('$2');
    const matKhauDung = isHashed
      ? await bcrypt.compare(matKhau, taiKhoan.TK_MATKHAU)
      : matKhau === taiKhoan.TK_MATKHAU;

    if (!matKhauDung) {
      return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    // --- Đăng nhập nhân viên ---
    if (taiKhoan.LOAI === 'NV') {
      const [nvRows] = await db.execute(
        'SELECT NV_MA, NV_HOTEN, NV_EMAIL, NV_GIOITINH FROM NHANVIEN WHERE TK_TENDN = ?',
        [tenDangNhap]
      );

      // Token 120 ngày, kèm loai='NV' để middleware phân quyền
      const token = jwt.sign(
        { tenDN: taiKhoan.TK_TENDN, maNV: nvRows[0].NV_MA, hoTen: nvRows[0].NV_HOTEN, loai: 'NV' },
        process.env.JWT_SECRET,
        { expiresIn: '120d' }
      );

      return res.status(200).json({
        success: true,
        message: `Chào mừng ${nvRows[0].NV_HOTEN}!`,
        token,
        loai: 'NV',
        nhanVien: {
          maNV: nvRows[0].NV_MA,
          hoTen: nvRows[0].NV_HOTEN,
          tenDN: taiKhoan.TK_TENDN,
          email: nvRows[0].NV_EMAIL,
          gioiTinh: nvRows[0].NV_GIOITINH
        }
      });
    }

    // --- Đăng nhập sinh viên ---
    // Lấy thông tin SV qua TK_TENDN trong bảng SINHVIEN (giống NV dùng TK_TENDN)
    if (taiKhoan.LOAI === 'SV') {
      const [svRows] = await db.execute(
        `SELECT sv.SV_MA, sv.SV_HOTEN, sv.SV_GIOITINH, sv.SV_EMAIL,
                l.L_TEN AS tenLop, dv.DV_TEN AS tenDonVi
         FROM SINHVIEN sv
         JOIN LOP l    ON sv.L_MA = l.L_MA
         JOIN DONVI dv ON l.DV_MA = dv.DV_MA
         WHERE sv.TK_TENDN = ?`,
        [tenDangNhap]
      );

      if (svRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin sinh viên.' });
      }

      // Token 120 ngày, kèm loai='SV' để middleware phân quyền
      const token = jwt.sign(
        { tenDN: taiKhoan.TK_TENDN, maSV: svRows[0].SV_MA, hoTen: svRows[0].SV_HOTEN, loai: 'SV' },
        process.env.JWT_SECRET,
        { expiresIn: '120d' }
      );

      return res.status(200).json({
        success: true,
        message: `Chào mừng ${svRows[0].SV_HOTEN}!`,
        token,
        loai: 'SV',
        sinhVien: {
          maSV: svRows[0].SV_MA,
          hoTen: svRows[0].SV_HOTEN,
          tenDN: taiKhoan.TK_TENDN,
          gioiTinh: svRows[0].SV_GIOITINH,
          email: svRows[0].SV_EMAIL,
          tenLop: svRows[0].tenLop,
          tenDonVi: svRows[0].tenDonVi
        }
      });
    }

  } catch (err) {
    console.error('Lỗi đăng nhập:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// POST /api/auth/logout
// JWT stateless — server không lưu trạng thái, frontend tự xóa token
const dangXuat = (req, res) => {
  return res.status(200).json({ success: true, message: 'Đã đăng xuất.' });
};

// GET /api/auth/me — Nhân viên xem thông tin cá nhân (yêu cầu token NV)
const layThongTinCaNhan = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT NV_MA, NV_HOTEN, NV_GIOITINH, NV_NGAYSINH, NV_SDT, NV_EMAIL, NV_QUEQUAN, TK_TENDN
       FROM NHANVIEN WHERE NV_MA = ?`,
      [req.nhanvien.maNV]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên.' });
    }
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Lỗi lấy thông tin cá nhân:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

module.exports = { dangNhap, dangXuat, layThongTinCaNhan };
