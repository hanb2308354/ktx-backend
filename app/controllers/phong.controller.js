// app/controllers/phong.controller.js
// Luồng 1: Xem phòng — nhân viên xem trạng thái và giá để tư vấn sinh viên

const db = require('../../config/db');

// GET /api/phong
// Danh sách phòng kèm trạng thái Trống / Còn chỗ / Đã đầy và giá năm hiện tại
// Lọc theo khu: ?khu=KA | theo trạng thái: ?trangThai=con-cho
const layDanhSachPhong = async (req, res) => {
  try {
    const { khu, trangThai } = req.query;

    let query = `
      SELECT p.P_MA, p.P_STT,
             lp.LP_TEN AS loaiPhong, lp.LP_SUCCHUA AS sucChua, lp.LP_MA,
             t.T_STT AS soTang,
             tn.TN_MA, tn.TN_TEN AS tenToaNha,
             k.K_MA, k.K_TEN AS tenKhu, k.K_GIOITINH AS gioiTinhKhu,
             COUNT(hd.HD_MA) AS soSVDangO,
             (lp.LP_SUCCHUA - COUNT(hd.HD_MA)) AS choTrong,
             gp.GP_GIA AS giaThueNamNay
      FROM PHONG p
      JOIN TANG t       ON p.T_MA  = t.T_MA
      JOIN TOANHA tn    ON t.TN_MA = tn.TN_MA
      JOIN KHUKTX k     ON tn.K_MA = k.K_MA
      JOIN LOAIPHONG lp ON p.LP_MA = lp.LP_MA
      LEFT JOIN HOPDONG hd ON p.P_MA = hd.P_MA
        AND hd.HD_TRANGTHAI = 'Hiệu lực'
        AND CURDATE() BETWEEN hd.HD_NGAYBD AND hd.HD_NGAYKT
      LEFT JOIN GIAPHONG gp ON p.LP_MA = gp.LP_MA
        AND gp.NAM = YEAR(CURDATE())
    `;

    const params = [];
    if (khu) {
      query += ' WHERE k.K_MA = ?';
      params.push(khu);
    }

    query += ` GROUP BY p.P_MA, p.P_STT, lp.LP_TEN, lp.LP_SUCCHUA, lp.LP_MA,
                        t.T_STT, tn.TN_MA, tn.TN_TEN, k.K_MA, k.K_TEN, k.K_GIOITINH, gp.GP_GIA`;

    if (trangThai === 'con-cho') query += ' HAVING choTrong > 0';
    else if (trangThai === 'day') query += ' HAVING choTrong = 0';

    query += ' ORDER BY k.K_MA, tn.TN_MA, t.T_STT, p.P_STT';

    const [rows] = await db.execute(query, params);

    const data = rows.map(p => ({
      ...p,
      trangThai: p.choTrong === 0 ? 'Đã đầy' : p.soSVDangO === 0 ? 'Trống' : 'Còn chỗ'
    }));

    return res.status(200).json({ success: true, total: data.length, data });
  } catch (err) {
    console.error('Lỗi lấy danh sách phòng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// GET /api/phong/:maPhong
// Chi tiết một phòng kèm giá năm hiện tại và danh sách sinh viên đang ở
const layChiTietPhong = async (req, res) => {
  const { maPhong } = req.params;
  try {
    const [phongRows] = await db.execute(
      `SELECT p.P_MA, p.P_STT,
              lp.LP_MA, lp.LP_TEN, lp.LP_MOTA, lp.LP_SUCCHUA,
              t.T_STT AS soTang,
              tn.TN_TEN AS tenToaNha,
              k.K_TEN AS tenKhu, k.K_GIOITINH,
              gp.GP_GIA AS giaThueNamNay,
              YEAR(CURDATE()) AS namHienTai
       FROM PHONG p
       JOIN TANG t       ON p.T_MA  = t.T_MA
       JOIN TOANHA tn    ON t.TN_MA = tn.TN_MA
       JOIN KHUKTX k     ON tn.K_MA = k.K_MA
       JOIN LOAIPHONG lp ON p.LP_MA = lp.LP_MA
       LEFT JOIN GIAPHONG gp ON p.LP_MA = gp.LP_MA
         AND gp.NAM = YEAR(CURDATE())
       WHERE p.P_MA = ?`,
      [maPhong]
    );

    if (phongRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phòng.' });
    }

    // Lấy danh sách sinh viên đang có hợp đồng hiệu lực trong phòng này
    const [svRows] = await db.execute(
      `SELECT sv.SV_MA, sv.SV_HOTEN, sv.SV_GIOITINH, sv.SV_NGAYSINH,
              sv.SV_SDT, sv.SV_EMAIL, sv.SV_QUEQUAN,
              l.L_TEN AS tenLop, dv.DV_TEN AS tenDonVi,
              hd.HD_MA, hd.HD_NGAYBD, hd.HD_NGAYKT
       FROM HOPDONG hd
       JOIN SINHVIEN sv ON hd.SV_MA = sv.SV_MA
       JOIN LOP l        ON sv.L_MA  = l.L_MA
       JOIN DONVI dv     ON l.DV_MA  = dv.DV_MA
       WHERE hd.P_MA = ? AND hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() BETWEEN hd.HD_NGAYBD AND hd.HD_NGAYKT`,
      [maPhong]
    );

    return res.status(200).json({
      success: true,
      data: {
        ...phongRows[0],
        soSVDangO: svRows.length,
        choTrong: phongRows[0].LP_SUCCHUA - svRows.length,
        trangThai: svRows.length === 0 ? 'Trống' : svRows.length >= phongRows[0].LP_SUCCHUA ? 'Đã đầy' : 'Còn chỗ',
        danhSachSinhVien: svRows
      }
    });
  } catch (err) {
    console.error('Lỗi lấy chi tiết phòng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

module.exports = { layDanhSachPhong, layChiTietPhong };
