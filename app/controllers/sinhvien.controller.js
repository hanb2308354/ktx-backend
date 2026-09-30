// app/controllers/sinhvien.controller.js
// Quản lý sinh viên — thêm mới, tìm kiếm, xem chi tiết, cập nhật thông tin

const db = require('../../config/db');
const bcrypt = require('bcryptjs');

// GET /api/sinhvien?tuKhoa=...
// Tìm kiếm sinh viên theo mã SV, CCCD hoặc họ tên
const layDanhSachSinhVien = async (req, res) => {
  try {
    const { tuKhoa, chuaCoPhong } = req.query;
    let query = `
      SELECT sv.SV_MA, sv.SV_HOTEN, sv.SV_GIOITINH, sv.SV_NGAYSINH,
             sv.SV_SDT, sv.SV_EMAIL, sv.SV_CCCD, sv.SV_QUEQUAN, sv.L_MA,
             l.L_TEN AS tenLop, dv.DV_TEN AS tenDonVi
      FROM SINHVIEN sv
      JOIN LOP l    ON sv.L_MA = l.L_MA
      JOIN DONVI dv ON l.DV_MA = dv.DV_MA
    `;
    const params = [];
    const dieuKien = [];

    if (tuKhoa) {
      dieuKien.push('(sv.SV_MA LIKE ? OR sv.SV_CCCD LIKE ? OR sv.SV_HOTEN LIKE ?)');
      const kw = `%${tuKhoa.trim()}%`;
      params.push(kw, kw, kw);
    }

    // Lọc sinh viên CHƯA có hợp đồng còn hiệu lực (dùng cho dropdown tạo hợp đồng).
    // Loại bỏ SV đang có HĐ 'Hiệu lực' bao trùm ngày hiện tại hoặc đơn 'Chờ duyệt'.
    if (chuaCoPhong === '1' || chuaCoPhong === 'true') {
      dieuKien.push(`sv.SV_MA NOT IN (
        SELECT hd.SV_MA FROM HOPDONG hd
        WHERE (hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() BETWEEN hd.HD_NGAYBD AND hd.HD_NGAYKT)
           OR hd.HD_TRANGTHAI = 'Chờ duyệt'
      )`);
    }

    if (dieuKien.length) query += ' WHERE ' + dieuKien.join(' AND ');
    query += ' ORDER BY sv.SV_MA';
    const [rows] = await db.execute(query, params);
    return res.status(200).json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    console.error('Lỗi lấy danh sách sinh viên:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// GET /api/sinhvien/lop
// Lấy danh sách lớp (để chọn khi thêm/sửa sinh viên)
const layDanhSachLop = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT l.L_MA, l.L_TEN, dv.DV_TEN AS tenDonVi
       FROM LOP l JOIN DONVI dv ON l.DV_MA = dv.DV_MA
       ORDER BY l.L_TEN`
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('Lỗi lấy danh sách lớp:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// Lấy danh sách khoa (để chọn khi thêm lớp mới)
const layDanhSachKhoa = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT DV_MA, DV_TEN FROM DONVI ORDER BY DV_TEN');
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('Lỗi lấy danh sách khoa:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// Thêm khoa mới (khi khoa chưa có trong danh mục)
const themKhoa = async (req, res) => {
  const { maKhoa, tenKhoa } = req.body;
  if (!maKhoa || !tenKhoa) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mã và tên khoa.' });
  }
  try {
    const [daCo] = await db.execute('SELECT DV_MA FROM DONVI WHERE DV_MA = ?', [maKhoa]);
    if (daCo.length > 0) {
      return res.status(409).json({ success: false, message: `Mã khoa "${maKhoa}" đã tồn tại.` });
    }
    await db.execute('INSERT INTO DONVI (DV_MA, DV_TEN) VALUES (?, ?)', [maKhoa, tenKhoa]);
    return res.status(201).json({ success: true, message: 'Đã thêm khoa.' });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: `Mã khoa "${maKhoa}" đã tồn tại.` });
    }
    console.error('Lỗi thêm khoa:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// Thêm lớp mới (khi lớp chưa có trong danh mục) — gắn với một khoa có sẵn
const themLop = async (req, res) => {
  const { maLop, tenLop, maKhoa } = req.body;
  if (!maLop || !tenLop || !maKhoa) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mã lớp, tên lớp và chọn khoa.' });
  }
  try {
    const [daCo] = await db.execute('SELECT L_MA FROM LOP WHERE L_MA = ?', [maLop]);
    if (daCo.length > 0) {
      return res.status(409).json({ success: false, message: `Mã lớp "${maLop}" đã tồn tại.` });
    }
    const [khoaCo] = await db.execute('SELECT DV_MA FROM DONVI WHERE DV_MA = ?', [maKhoa]);
    if (khoaCo.length === 0) {
      return res.status(400).json({ success: false, message: 'Khoa được chọn không tồn tại.' });
    }
    await db.execute('INSERT INTO LOP (L_MA, L_TEN, DV_MA) VALUES (?, ?, ?)', [maLop, tenLop, maKhoa]);
    return res.status(201).json({ success: true, message: 'Đã thêm lớp.' });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: `Mã lớp "${maLop}" đã tồn tại.` });
    }
    console.error('Lỗi thêm lớp:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// Thêm sinh viên mới + tạo tài khoản (mật khẩu mặc định = ngày sinh ddmmyyyy)
const themSinhVien = async (req, res) => {
  const { maSV, hoTen, gioiTinh, ngaySinh, sdt, email, cccd, queQuan, maLop } = req.body;

  if (!maSV || !hoTen || !gioiTinh || !ngaySinh || !maLop) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ: mã SV, họ tên, giới tính, ngày sinh, lớp.' });
  }
  if (!['Nam', 'Nữ'].includes(gioiTinh)) {
    return res.status(400).json({ success: false, message: 'Giới tính phải là "Nam" hoặc "Nữ".' });
  }
  if (!isValidDate(ngaySinh)) {
    return res.status(400).json({ success: false, message: 'Ngày sinh không hợp lệ (YYYY-MM-DD).' });
  }
  // Ngày sinh phải trong quá khứ
  const dNgaySinh = new Date(ngaySinh);
  const homNay = new Date(); homNay.setHours(0, 0, 0, 0);
  if (dNgaySinh >= homNay) {
    return res.status(400).json({ success: false, message: 'Ngày sinh phải là ngày trong quá khứ.' });
  }
  if (sdt && !/^0\d{9}$/.test(sdt)) {
    return res.status(400).json({ success: false, message: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0.' });
  }
  if (cccd && !/^\d{12}$/.test(cccd)) {
    return res.status(400).json({ success: false, message: 'CCCD phải gồm đúng 12 chữ số.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Email không hợp lệ.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [svCo] = await conn.execute('SELECT SV_MA FROM SINHVIEN WHERE SV_MA = ?', [maSV]);
    if (svCo.length > 0) {
      await conn.rollback();
      return res.status(409).json({ success: false, message: `Mã sinh viên "${maSV}" đã tồn tại.` });
    }
    if (cccd) {
      const [ccCo] = await conn.execute('SELECT SV_MA FROM SINHVIEN WHERE SV_CCCD = ?', [cccd]);
      if (ccCo.length > 0) {
        await conn.rollback();
        return res.status(409).json({ success: false, message: 'CCCD này đã được dùng cho sinh viên khác.' });
      }
    }
    if (email) {
      const [emCo] = await conn.execute('SELECT SV_MA FROM SINHVIEN WHERE SV_EMAIL = ?', [email]);
      if (emCo.length > 0) {
        await conn.rollback();
        return res.status(409).json({ success: false, message: 'Email này đã được dùng cho sinh viên khác.' });
      }
    }
    const [lopCo] = await conn.execute('SELECT L_MA FROM LOP WHERE L_MA = ?', [maLop]);
    if (lopCo.length === 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Lớp được chọn không tồn tại.' });
    }
    // Tên đăng nhập trùng (tài khoản cũ còn sót hoặc trùng tài khoản nhân viên)
    const [tkCo] = await conn.execute('SELECT TK_TENDN FROM TAIKHOAN WHERE TK_TENDN = ?', [maSV]);
    if (tkCo.length > 0) {
      await conn.rollback();
      return res.status(409).json({ success: false, message: `Tên đăng nhập "${maSV}" đã tồn tại. Vui lòng dùng mã sinh viên khác.` });
    }

    // Tài khoản: tên đăng nhập = mã SV, mật khẩu = ngày sinh ddmmyyyy
    const [y, m, d] = ngaySinh.split('-');
    const matKhauTho = `${d}${m}${y}`;
    const matKhauHash = await bcrypt.hash(matKhauTho, 10);
    await conn.execute(
      "INSERT INTO TAIKHOAN (TK_TENDN, TK_MATKHAU, LOAI) VALUES (?, ?, 'SV')",
      [maSV, matKhauHash]
    );
    await conn.execute(
      `INSERT INTO SINHVIEN (SV_MA, SV_HOTEN, SV_GIOITINH, SV_NGAYSINH, SV_SDT, SV_EMAIL, SV_CCCD, SV_QUEQUAN, L_MA, TK_TENDN)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [maSV, hoTen, gioiTinh, ngaySinh, sdt || null, email || null, cccd || null, queQuan || null, maLop, maSV]
    );

    await conn.commit();
    return res.status(201).json({ success: true, message: `Đã thêm sinh viên. Mật khẩu đăng nhập là ngày sinh (${matKhauTho}).` });
  } catch (err) {
    await conn.rollback();
    // Lỗi từ trigger cơ sở dữ liệu (SIGNAL 45000) → trả thông báo gốc để người dùng biết sai gì
    if (err && err.sqlState === '45000') {
      return res.status(400).json({ success: false, message: err.sqlMessage || err.message });
    }
    // Trùng khóa chính / khóa duy nhất (mã SV, tài khoản, CCCD)
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Dữ liệu bị trùng (mã sinh viên, tài khoản hoặc CCCD đã tồn tại).' });
    }
    console.error('Lỗi thêm sinh viên:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  } finally {
    conn.release();
  }
};

// GET /api/sinhvien/:maSV — chi tiết + lịch sử hợp đồng
const layChiTietSinhVien = async (req, res) => {
  const { maSV } = req.params;
  try {
    const [svRows] = await db.execute(
      `SELECT sv.SV_MA, sv.SV_HOTEN, sv.SV_GIOITINH, sv.SV_NGAYSINH,
              sv.SV_SDT, sv.SV_EMAIL, sv.SV_CCCD, sv.SV_QUEQUAN, sv.L_MA,
              l.L_TEN AS tenLop, dv.DV_TEN AS tenDonVi
       FROM SINHVIEN sv
       JOIN LOP l    ON sv.L_MA = l.L_MA
       JOIN DONVI dv ON l.DV_MA = dv.DV_MA
       WHERE sv.SV_MA = ?`,
      [maSV]
    );
    if (svRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên.' });
    }
    const [hdRows] = await db.execute(
      `SELECT hd.HD_MA, hd.HD_NGAYBD, hd.HD_NGAYKT,
              p.P_MA, p.P_STT AS soPhong, lp.LP_TEN AS loaiPhong,
              tn.TN_TEN AS tenToaNha, k.K_TEN AS tenKhu,
              CASE
                WHEN hd.HD_TRANGTHAI = 'Chờ duyệt' THEN 'Chờ duyệt'
                WHEN hd.HD_TRANGTHAI = 'Từ chối'   THEN 'Từ chối'
                WHEN hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() BETWEEN hd.HD_NGAYBD AND hd.HD_NGAYKT THEN 'Còn hiệu lực'
                WHEN hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() > hd.HD_NGAYKT THEN 'Đã hết hạn'
                ELSE 'Chưa bắt đầu'
              END AS trangThai
       FROM HOPDONG hd
       JOIN PHONG p      ON hd.P_MA  = p.P_MA
       JOIN LOAIPHONG lp ON p.LP_MA  = lp.LP_MA
       JOIN TANG t       ON p.T_MA   = t.T_MA
       JOIN TOANHA tn    ON t.TN_MA  = tn.TN_MA
       JOIN KHUKTX k     ON tn.K_MA  = k.K_MA
       WHERE hd.SV_MA = ?
       ORDER BY hd.HD_NGAYBD DESC`,
      [maSV]
    );
    return res.status(200).json({ success: true, data: { ...svRows[0], lichSuHopDong: hdRows } });
  } catch (err) {
    console.error('Lỗi lấy chi tiết sinh viên:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// Kiểm tra định dạng cơ bản
const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());

// POST /api/sinhvien
// Thêm sinh viên mới — tạo đồng thời tài khoản đăng nhập (transaction)
// Body: { maSV, hoTen, gioiTinh, ngaySinh, sdt, email, cccd, queQuan, maLop }

// PUT /api/sinhvien/:maSV
// Cập nhật thông tin sinh viên — sửa được tất cả trường (trừ mã SV là khóa chính)
// Body: { hoTen, gioiTinh, ngaySinh, sdt, email, cccd, queQuan, maLop }
const capNhatSinhVien = async (req, res) => {
  const { maSV } = req.params;
  const { hoTen, gioiTinh, ngaySinh, sdt, email, cccd, queQuan, maLop } = req.body;

  if (!hoTen || !gioiTinh || !maLop) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ: họ tên, giới tính, lớp.' });
  }
  if (!['Nam', 'Nữ'].includes(gioiTinh)) {
    return res.status(400).json({ success: false, message: 'Giới tính phải là "Nam" hoặc "Nữ".' });
  }
  if (ngaySinh && !isValidDate(ngaySinh)) {
    return res.status(400).json({ success: false, message: 'Ngày sinh không hợp lệ (YYYY-MM-DD).' });
  }
  // Ngày sinh phải trong quá khứ
  if (ngaySinh) {
    const dNS = new Date(ngaySinh);
    const hn = new Date(); hn.setHours(0, 0, 0, 0);
    if (dNS >= hn) {
      return res.status(400).json({ success: false, message: 'Ngày sinh phải là ngày trong quá khứ.' });
    }
  }
  // Validate định dạng liên hệ (defense in depth — không tin tưởng chỉ mỗi frontend)
  if (sdt && !/^0\d{9}$/.test(sdt)) {
    return res.status(400).json({ success: false, message: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0.' });
  }
  if (cccd && !/^\d{12}$/.test(cccd)) {
    return res.status(400).json({ success: false, message: 'CCCD phải gồm đúng 12 chữ số.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Email không hợp lệ.' });
  }

  try {
    const [check] = await db.execute('SELECT SV_MA, SV_GIOITINH FROM SINHVIEN WHERE SV_MA = ?', [maSV]);
    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên.' });
    }

    // Nếu đổi giới tính, chặn khi SV đang có hợp đồng hiệu lực (vì phòng phân theo giới tính)
    if (gioiTinh !== check[0].SV_GIOITINH) {
      const [hdHieuLuc] = await db.execute(
        "SELECT HD_MA FROM HOPDONG WHERE SV_MA = ? AND HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() <= HD_NGAYKT",
        [maSV]
      );
      if (hdHieuLuc.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Không thể đổi giới tính khi sinh viên đang có hợp đồng ở phòng. Vui lòng kết thúc hợp đồng trước.'
        });
      }
    }

    // CCCD nếu đổi thì không được trùng người khác
    if (cccd) {
      const [tCccd] = await db.execute('SELECT SV_MA FROM SINHVIEN WHERE SV_CCCD = ? AND SV_MA <> ?', [cccd, maSV]);
      if (tCccd.length > 0) {
        return res.status(409).json({ success: false, message: `CCCD "${cccd}" đã được dùng cho sinh viên khác.` });
      }
    }

    // Email nếu đổi thì không được trùng người khác
    if (email) {
      const [tEmail] = await db.execute('SELECT SV_MA FROM SINHVIEN WHERE SV_EMAIL = ? AND SV_MA <> ?', [email, maSV]);
      if (tEmail.length > 0) {
        return res.status(409).json({ success: false, message: `Email "${email}" đã được dùng cho sinh viên khác.` });
      }
    }

    // Lớp tồn tại?
    const [lop] = await db.execute('SELECT L_MA FROM LOP WHERE L_MA = ?', [maLop]);
    if (lop.length === 0) {
      return res.status(400).json({ success: false, message: 'Lớp không tồn tại.' });
    }

    await db.execute(
      `UPDATE SINHVIEN
       SET SV_HOTEN = ?, SV_GIOITINH = ?, SV_NGAYSINH = ?, SV_SDT = ?,
           SV_EMAIL = ?, SV_CCCD = ?, SV_QUEQUAN = ?, L_MA = ?
       WHERE SV_MA = ?`,
      [hoTen, gioiTinh, ngaySinh || null, sdt || null, email || null, cccd || null, queQuan || null, maLop, maSV]
    );

    return res.status(200).json({ success: true, message: 'Đã cập nhật thông tin sinh viên.' });
  } catch (err) {
    if (err.sqlState === '45000') {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('Lỗi cập nhật sinh viên:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

module.exports = { layDanhSachSinhVien, layDanhSachLop, layDanhSachKhoa, themKhoa, themLop, layChiTietSinhVien, themSinhVien, capNhatSinhVien };
