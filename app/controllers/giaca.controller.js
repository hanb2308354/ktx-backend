// app/controllers/giaca.controller.js
// Quản lý giá phòng và đơn giá điện nước theo từng năm.
// Nguyên tắc nghiệp vụ: giá là dữ liệu theo kỳ. Không cho sửa giá của năm
// đã phát sinh hóa đơn (vì sửa sẽ làm sai lệch hóa đơn đã lập).

const db = require('../../config/db');

// Kiểm tra một năm đã có hóa đơn chưa (để khóa việc sửa giá)
const namDaCoHoaDon = async (nam) => {
  const [rows] = await db.execute(
    'SELECT 1 FROM HOADON WHERE YEAR(NGAYTHANGNAM) = ? LIMIT 1', [nam]
  );
  return rows.length > 0;
};

// GET /api/giaca/nam — danh sách các năm + đơn giá điện nước, kèm cờ đã khóa
const layDanhSachNam = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT NAM, DONGIADIEN, DONGIANUOC FROM NAM ORDER BY NAM DESC');
    // Đánh dấu năm nào đã có hóa đơn (khóa sửa)
    const data = [];
    for (const r of rows) {
      const daKhoa = await namDaCoHoaDon(r.NAM);
      data.push({ ...r, daKhoa });
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Lỗi lấy danh sách năm:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// GET /api/giaca/phong?nam=2026 — bảng giá phòng từng loại trong năm
const layGiaPhongTheoNam = async (req, res) => {
  try {
    const { nam } = req.query;
    if (!nam) return res.status(400).json({ success: false, message: 'Thiếu năm.' });
    // Lấy tất cả loại phòng, LEFT JOIN giá của năm đó (loại nào chưa có giá thì null)
    const [rows] = await db.execute(
      `SELECT lp.LP_MA, lp.LP_TEN, lp.LP_SUCCHUA, gp.GP_MA, gp.GP_GIA
       FROM LOAIPHONG lp
       LEFT JOIN GIAPHONG gp ON lp.LP_MA = gp.LP_MA AND gp.NAM = ?
       ORDER BY lp.LP_TEN`,
      [nam]
    );
    const daKhoa = await namDaCoHoaDon(nam);
    return res.status(200).json({ success: true, daKhoa, data: rows });
  } catch (err) {
    console.error('Lỗi lấy giá phòng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// POST /api/giaca/nam — thêm năm mới (kèm đơn giá điện nước), tùy chọn sao chép giá phòng từ năm cũ
const themNam = async (req, res) => {
  const { nam, donGiaDien, donGiaNuoc } = req.body;
  if (!nam || donGiaDien == null || donGiaNuoc == null) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập năm và đơn giá điện, nước.' });
  }
  if (Number(donGiaDien) < 0 || Number(donGiaNuoc) < 0) {
    return res.status(400).json({ success: false, message: 'Đơn giá không được âm.' });
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [trung] = await conn.execute('SELECT NAM FROM NAM WHERE NAM = ?', [nam]);
    if (trung.length > 0) {
      await conn.rollback();
      return res.status(409).json({ success: false, message: `Năm ${nam} đã tồn tại.` });
    }

    await conn.execute('INSERT INTO NAM (NAM, DONGIADIEN, DONGIANUOC) VALUES (?, ?, ?)', [nam, donGiaDien, donGiaNuoc]);

    await conn.commit();
    return res.status(201).json({ success: true, message: `Đã thêm năm ${nam}.` });
  } catch (err) {
    await conn.rollback();
    console.error('Lỗi thêm năm:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  } finally {
    conn.release();
  }
};

// PUT /api/giaca/nam/:nam — cập nhật đơn giá điện nước của năm (chỉ khi chưa có hóa đơn)
const capNhatDonGia = async (req, res) => {
  const { nam } = req.params;
  const { donGiaDien, donGiaNuoc } = req.body;
  if (donGiaDien == null || donGiaNuoc == null) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đơn giá điện và nước.' });
  }
  if (Number(donGiaDien) < 0 || Number(donGiaNuoc) < 0) {
    return res.status(400).json({ success: false, message: 'Đơn giá không được âm.' });
  }
  try {
    if (await namDaCoHoaDon(nam)) {
      return res.status(400).json({ success: false, message: `Năm ${nam} đã phát sinh hóa đơn, không thể sửa đơn giá.` });
    }
    const [kt] = await db.execute('SELECT NAM FROM NAM WHERE NAM = ?', [nam]);
    if (kt.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy năm.' });

    await db.execute('UPDATE NAM SET DONGIADIEN = ?, DONGIANUOC = ? WHERE NAM = ?', [donGiaDien, donGiaNuoc, nam]);
    return res.status(200).json({ success: true, message: 'Đã cập nhật đơn giá điện nước.' });
  } catch (err) {
    console.error('Lỗi cập nhật đơn giá:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// PUT /api/giaca/phong — cập nhật/thêm giá một loại phòng trong năm (chỉ khi chưa có hóa đơn)
const capNhatGiaPhong = async (req, res) => {
  const { maLoaiPhong, nam, gia } = req.body;
  if (!maLoaiPhong || !nam || gia == null) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ loại phòng, năm và giá.' });
  }
  if (Number(gia) < 0) {
    return res.status(400).json({ success: false, message: 'Giá phòng không được âm.' });
  }
  try {
    if (await namDaCoHoaDon(nam)) {
      return res.status(400).json({ success: false, message: `Năm ${nam} đã phát sinh hóa đơn, không thể sửa giá phòng.` });
    }
    // Năm phải tồn tại trong bảng NAM (vì FK)
    const [namKt] = await db.execute('SELECT NAM FROM NAM WHERE NAM = ?', [nam]);
    if (namKt.length === 0) {
      return res.status(400).json({ success: false, message: `Chưa có đơn giá năm ${nam}. Vui lòng thêm đơn giá năm này trước.` });
    }

    const [daCo] = await db.execute('SELECT GP_MA FROM GIAPHONG WHERE LP_MA = ? AND NAM = ?', [maLoaiPhong, nam]);
    if (daCo.length > 0) {
      await db.execute('UPDATE GIAPHONG SET GP_GIA = ? WHERE GP_MA = ?', [gia, daCo[0].GP_MA]);
    } else {
      const maGP = `GP${maLoaiPhong}${nam}`.slice(0, 20);
      await db.execute('INSERT INTO GIAPHONG (GP_MA, GP_GIA, LP_MA, NAM) VALUES (?, ?, ?, ?)', [maGP, gia, maLoaiPhong, nam]);
    }
    return res.status(200).json({ success: true, message: 'Đã cập nhật giá phòng.' });
  } catch (err) {
    console.error('Lỗi cập nhật giá phòng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

module.exports = { layDanhSachNam, layGiaPhongTheoNam, themNam, capNhatDonGia, capNhatGiaPhong };
