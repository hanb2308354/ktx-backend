// app/controllers/hopdong.controller.js
// Luồng 2: Quản lý hợp đồng — nhân viên thực hiện toàn bộ, không cần duyệt

const db = require('../../config/db');

// Kiểm tra định dạng ngày YYYY-MM-DD
const isValidDate = (str) => /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str));

// Ngay dau thang SAU thang hien tai (YYYY-MM-DD) - dung lam moc som nhat cho phep ket thuc hop dong,
// dam bao hoa don thang hien tai (da hoac sap lap) khong bao gio bi lech voi ngay ket thuc hop dong.
const dauThangSau = () => {
  const d = new Date();
  const nam = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const thang = d.getMonth() === 11 ? 1 : d.getMonth() + 2;
  return `${nam}-${String(thang).padStart(2, '0')}-01`;
};

// ============================================================
// GET /api/hopdong
// Lấy danh sách hợp đồng, lọc theo phòng / sinh viên / trạng thái
// ============================================================
const layDanhSachHopDong = async (req, res) => {
  try {
    const { maPhong, maSV, trangThai } = req.query;

    let query = `
      SELECT hd.HD_MA, hd.HD_NGAYBD, hd.HD_NGAYKT, hd.HD_TRANGTHAI, hd.HD_YEUCAUKETTHUC,
             sv.SV_MA, sv.SV_HOTEN, sv.SV_GIOITINH, sv.SV_SDT,
             l.L_TEN AS tenLop, dv.DV_TEN AS tenDonVi,
             p.P_MA, p.P_STT,
             lp.LP_TEN AS loaiPhong,
             tn.TN_TEN AS tenToaNha, k.K_TEN AS tenKhu,
             nv.NV_HOTEN AS nhanVienLap,
             CASE
               WHEN hd.HD_TRANGTHAI = 'Chờ duyệt' THEN 'Chờ duyệt'
               WHEN hd.HD_TRANGTHAI = 'Từ chối'   THEN 'Từ chối'
               WHEN hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() < hd.HD_NGAYBD THEN 'Sắp hiệu lực'
               WHEN hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() BETWEEN hd.HD_NGAYBD AND hd.HD_NGAYKT THEN 'Còn hiệu lực'
               WHEN hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() > hd.HD_NGAYKT THEN 'Đã hết hạn'
               ELSE hd.HD_TRANGTHAI
             END AS trangThai
      FROM HOPDONG hd
      JOIN SINHVIEN sv ON hd.SV_MA = sv.SV_MA
      JOIN LOP l        ON sv.L_MA  = l.L_MA
      JOIN DONVI dv     ON l.DV_MA  = dv.DV_MA
      JOIN PHONG p      ON hd.P_MA  = p.P_MA
      JOIN LOAIPHONG lp ON p.LP_MA  = lp.LP_MA
      JOIN TANG t       ON p.T_MA   = t.T_MA
      JOIN TOANHA tn    ON t.TN_MA  = tn.TN_MA
      JOIN KHUKTX k     ON tn.K_MA  = k.K_MA
      LEFT JOIN NHANVIEN nv  ON hd.NV_MA = nv.NV_MA
      WHERE 1=1
    `;

    const params = [];
    // Lọc theo mã phòng / mã SV: dùng LIKE + TRIM để bỏ khoảng trắng thừa và tìm gần đúng,
    // không phân biệt hoa thường (utf8mb4_general_ci mặc định đã không phân biệt hoa thường)
    if (maPhong) { query += ' AND hd.P_MA LIKE ?';  params.push(`%${maPhong.trim()}%`); }
    if (maSV)    {
      query += ' AND (hd.SV_MA LIKE ? OR sv.SV_HOTEN LIKE ?)';
      const kw = `%${maSV.trim()}%`;
      params.push(kw, kw);
    }
    if (trangThai === 'hieu-luc') query += " AND hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() BETWEEN hd.HD_NGAYBD AND hd.HD_NGAYKT";
    else if (trangThai === 'sap-hieu-luc') query += " AND hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() < hd.HD_NGAYBD";
    else if (trangThai === 'het-han') query += " AND hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() > hd.HD_NGAYKT";
    else if (trangThai === 'cho-duyet') query += " AND hd.HD_TRANGTHAI = 'Chờ duyệt'";
    else if (trangThai === 'yeu-cau-ket-thuc') query += ' AND hd.HD_YEUCAUKETTHUC IS NOT NULL';

    query += ' ORDER BY hd.HD_NGAYBD DESC';

    const [rows] = await db.execute(query, params);
    return res.status(200).json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    console.error('Lỗi lấy danh sách hợp đồng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// GET /api/hopdong/:maHD
// Lấy chi tiết một hợp đồng
// ============================================================
const layChiTietHopDong = async (req, res) => {
  const { maHD } = req.params;
  try {
    const [rows] = await db.execute(
      `SELECT hd.HD_MA, hd.HD_NGAYBD, hd.HD_NGAYKT, hd.HD_TRANGTHAI,
              hd.SV_MA, hd.NV_MA, hd.P_MA,
              sv.SV_HOTEN, sv.SV_GIOITINH, sv.SV_NGAYSINH, sv.SV_SDT, sv.SV_EMAIL, sv.SV_CCCD,
              l.L_TEN AS tenLop, dv.DV_TEN AS tenDonVi,
              p.P_STT AS soPhong, lp.LP_TEN AS loaiPhong, lp.LP_SUCCHUA,
              t.T_STT AS soTang, tn.TN_TEN AS tenToaNha,
              k.K_TEN AS tenKhu, k.K_GIOITINH,
              nv.NV_HOTEN AS nhanVienLap
       FROM HOPDONG hd
       JOIN SINHVIEN sv ON hd.SV_MA = sv.SV_MA
       JOIN LOP l        ON sv.L_MA  = l.L_MA
       JOIN DONVI dv     ON l.DV_MA  = dv.DV_MA
       JOIN PHONG p      ON hd.P_MA  = p.P_MA
       JOIN LOAIPHONG lp ON p.LP_MA  = lp.LP_MA
       JOIN TANG t       ON p.T_MA   = t.T_MA
       JOIN TOANHA tn    ON t.TN_MA  = tn.TN_MA
       JOIN KHUKTX k     ON tn.K_MA  = k.K_MA
       LEFT JOIN NHANVIEN nv  ON hd.NV_MA = nv.NV_MA
       WHERE hd.HD_MA = ?`,
      [maHD]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng.' });
    }

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Lỗi lấy chi tiết hợp đồng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// POST /api/hopdong
// Luồng 2 - Bước 1→5: Tạo hợp đồng mới cho sinh viên
// Nhân viên đang đăng nhập tự động được gán vào NV_MA (lấy từ JWT token)
// Body: { maSV, maPhong, ngayBatDau, ngayKetThuc }
// ============================================================
const taoHopDong = async (req, res) => {
  const { maSV, maPhong, ngayBatDau, ngayKetThuc } = req.body;
  const maNV = req.nhanvien.maNV;

  if (!maSV || !maPhong || !ngayBatDau || !ngayKetThuc) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin hợp đồng.' });
  }

  if (!isValidDate(ngayBatDau) || !isValidDate(ngayKetThuc)) {
    return res.status(400).json({ success: false, message: 'Định dạng ngày không hợp lệ. Dùng YYYY-MM-DD.' });
  }

  if (new Date(ngayBatDau) >= new Date(ngayKetThuc)) {
    return res.status(400).json({ success: false, message: 'Ngày bắt đầu phải nhỏ hơn ngày kết thúc.' });
  }

  const homNay = new Date().toISOString().slice(0, 10);
  if (ngayBatDau < homNay) {
    return res.status(400).json({ success: false, message: 'Ngày bắt đầu hợp đồng không được ở quá khứ.' });
  }

  try {
    // Bước 1: Kiểm tra sinh viên có tồn tại trong hệ thống không
    const [svCheck] = await db.execute('SELECT SV_MA FROM SINHVIEN WHERE SV_MA = ?', [maSV]);
    if (svCheck.length === 0) {
      return res.status(404).json({ success: false, message: `Không tìm thấy sinh viên "${maSV}".` });
    }

    // Bước 2: Mỗi sinh viên chỉ được có một hợp đồng đang hiệu lực
    // Chặn nếu SV đã có HĐ Hiệu lực hoặc Chờ duyệt mà khoảng ngày chồng lấn HĐ mới
    // 2 khoảng [a1,a2] và [b1,b2] chồng nhau khi: a1 <= b2 AND b1 <= a2
    const [hdTonTai] = await db.execute(
      `SELECT HD_MA FROM HOPDONG
       WHERE SV_MA = ?
         AND HD_TRANGTHAI IN ('Hiệu lực', 'Chờ duyệt')
         AND HD_NGAYBD <= ? AND ? <= HD_NGAYKT`,
      [maSV, ngayKetThuc, ngayBatDau]
    );
    if (hdTonTai.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Sinh viên này đang có hợp đồng hiệu lực (${hdTonTai[0].HD_MA}). Vui lòng kết thúc hợp đồng cũ trước.`
      });
    }

    // Bước 2: Kiểm tra phòng còn chỗ trong KHOẢNG THỜI GIAN của hợp đồng mới
    // Một chỗ chỉ bị chiếm nếu có HĐ Hiệu lực chồng lấn ngày với HĐ đang tạo
    // (không dùng CURDATE vì HĐ có thể bắt đầu ở tương lai)
    const [phongInfo] = await db.execute(
      `SELECT lp.LP_SUCCHUA, COUNT(hd.HD_MA) AS soSVHienTai
       FROM PHONG p
       JOIN LOAIPHONG lp ON p.LP_MA = lp.LP_MA
       LEFT JOIN HOPDONG hd ON p.P_MA = hd.P_MA
         AND hd.HD_TRANGTHAI = 'Hiệu lực'
         AND hd.HD_NGAYBD <= ? AND ? <= hd.HD_NGAYKT
       WHERE p.P_MA = ?
       GROUP BY lp.LP_SUCCHUA`,
      [ngayKetThuc, ngayBatDau, maPhong]
    );

    if (phongInfo.length === 0) {
      return res.status(404).json({ success: false, message: `Không tìm thấy phòng "${maPhong}".` });
    }

    if (phongInfo[0].soSVHienTai >= phongInfo[0].LP_SUCCHUA) {
      return res.status(400).json({ success: false, message: `Phòng "${maPhong}" đã đầy.` });
    }

    // Sinh mã HĐ ngắn gọn dạng HDxxx (nhất quán với dữ liệu sẵn có như HD034, HD045)
    // Lấy số lớn nhất hiện có rồi +1, đệm 3 chữ số.
    const [maxRow] = await db.execute(
      "SELECT MAX(CAST(SUBSTRING(HD_MA, 3) AS UNSIGNED)) AS maxSo FROM HOPDONG WHERE HD_MA REGEXP '^HD[0-9]+$'"
    );
    const soTiepTheo = (maxRow[0].maxSo || 0) + 1;
    const maHD = 'HD' + String(soTiepTheo).padStart(3, '0');

    // Bước 3→4: INSERT vào HOPDONG
    // Trigger trg_KiemTraGioiTinh_HopDong tự chạy tại đây để kiểm tra
    // giới tính sinh viên có khớp với quy định của khu KTX không
    await db.execute(
      'INSERT INTO HOPDONG (HD_MA, HD_NGAYBD, HD_NGAYKT, SV_MA, NV_MA, P_MA) VALUES (?, ?, ?, ?, ?, ?)',
      [maHD, ngayBatDau, ngayKetThuc, maSV, maNV, maPhong]
    );

    // Bước 5: Hợp đồng có hiệu lực ngay, không cần duyệt
    return res.status(201).json({
      success: true,
      message: 'Đã tạo hợp đồng mới.',
      data: { maHD, maSV, maPhong, ngayBatDau, ngayKetThuc, maNV }
    });
  } catch (err) {
    // Bắt lỗi từ trigger MySQL khi giới tính sinh viên không khớp với khu
    if (err.sqlState === '45000') {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('Lỗi tạo hợp đồng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// PUT /api/hopdong/:maHD/ket-thuc
// Luồng 2 - Bước 6: Kết thúc hợp đồng khi sinh viên rời phòng
// Nếu không truyền ngày thì mặc định kết thúc hôm nay
// Body: { ngayKetThucMoi } (tùy chọn)
// ============================================================
const ketThucHopDong = async (req, res) => {
  const { maHD } = req.params;
  const ngayKetThucMoi = req.body.ngayKetThucMoi || new Date().toISOString().split('T')[0];

  if (!isValidDate(ngayKetThucMoi)) {
    return res.status(400).json({ success: false, message: 'Định dạng ngày không hợp lệ. Dùng YYYY-MM-DD.' });
  }

  try {
    const [check] = await db.execute(
      `SELECT HD_MA, HD_TRANGTHAI,
              DATE_FORMAT(HD_NGAYBD, '%Y-%m-%d') AS ngayBD,
              DATE_FORMAT(HD_NGAYKT, '%Y-%m-%d') AS ngayKT
       FROM HOPDONG WHERE HD_MA = ?`,
      [maHD]
    );

    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng.' });
    }

    // Chỉ được kết thúc hợp đồng đang ở trạng thái Hiệu lực
    if (check[0].HD_TRANGTHAI !== 'Hiệu lực') {
      return res.status(400).json({
        success: false,
        message: `Chỉ có thể kết thúc hợp đồng đang hiệu lực. Hợp đồng này đang ở trạng thái "${check[0].HD_TRANGTHAI}".`
      });
    }

    // Ngày kết thúc mới phải nằm trong khoảng hợp đồng: từ ngày bắt đầu đến ngày hết hạn cũ.
    // "Kết thúc sớm" = chấm dứt trước hạn, không thể trước ngày bắt đầu, cũng không kéo dài quá hạn cũ.
    // So sánh bằng chuỗi YYYY-MM-DD (không dùng Date object) để tránh lỗi lệch múi giờ khi
    // trộn ngày lấy từ CSDL (driver tự chuyển local-time) với ngày parse từ chuỗi (theo UTC).
    if (ngayKetThucMoi < check[0].ngayBD) {
      return res.status(400).json({ success: false, message: 'Ngày kết thúc không thể trước ngày bắt đầu hợp đồng.' });
    }
    if (ngayKetThucMoi > check[0].ngayKT) {
      return res.status(400).json({ success: false, message: 'Ngày kết thúc sớm không thể muộn hơn ngày hết hạn ghi trong hợp đồng.' });
    }

    // Chỉ được kết thúc từ đầu tháng SAU trở đi: sinh viên phải đóng đủ hóa đơn tháng hiện tại,
    // tránh trường hợp hóa đơn tháng này đã lập (hoặc sắp lập) mà ngày kết thúc lại rơi vào giữa tháng.
    const ngaySomNhat = dauThangSau();
    if (ngayKetThucMoi < ngaySomNhat) {
      return res.status(400).json({
        success: false,
        message: `Chỉ có thể kết thúc hợp đồng từ ngày ${ngaySomNhat.split('-').reverse().join('/')} trở đi (đầu tháng sau), để sinh viên đóng đủ hóa đơn tháng này.`
      });
    }

    await db.execute('UPDATE HOPDONG SET HD_NGAYKT = ? WHERE HD_MA = ?', [ngayKetThucMoi, maHD]);

    return res.status(200).json({ success: true, message: 'Đã kết thúc hợp đồng.' });
  } catch (err) {
    console.error('Lỗi kết thúc hợp đồng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};



// ============================================================
// PUT /api/hopdong/:maHD/duyet
// Nhân viên duyệt đơn đăng ký của sinh viên → Hiệu lực
// ============================================================
const duyetHopDong = async (req, res) => {
  const { maHD } = req.params;
  const maNV = req.nhanvien.maNV;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [check] = await conn.execute('SELECT HD_MA, HD_TRANGTHAI, P_MA, HD_NGAYBD, HD_NGAYKT FROM HOPDONG WHERE HD_MA = ? FOR UPDATE', [maHD]);

    if (check.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng.' });
    }
    if (check[0].HD_TRANGTHAI !== 'Chờ duyệt') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Đơn đăng ký này đã được xử lý trước đó.' });
    }

    // Khóa các hợp đồng hiệu lực của phòng (FOR UPDATE) để chống tranh chấp khi 2 NV
    // cùng duyệt 2 đơn vào 1 phòng còn 1 chỗ tại cùng thời điểm.
    // Request thứ 2 phải đợi request thứ 1 commit xong mới đọc được số liệu mới nhất.
    const [phongInfo] = await conn.execute(
      `SELECT lp.LP_SUCCHUA, COUNT(hd.HD_MA) AS soSVHienTai
       FROM PHONG p
       JOIN LOAIPHONG lp ON p.LP_MA = lp.LP_MA
       LEFT JOIN HOPDONG hd ON p.P_MA = hd.P_MA
         AND hd.HD_TRANGTHAI = 'Hiệu lực'
         AND hd.HD_NGAYBD <= ? AND ? <= hd.HD_NGAYKT
       WHERE p.P_MA = ?
       GROUP BY lp.LP_SUCCHUA
       FOR UPDATE`,
      [check[0].HD_NGAYKT, check[0].HD_NGAYBD, check[0].P_MA]
    );

    if (phongInfo[0].soSVHienTai >= phongInfo[0].LP_SUCCHUA) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Phòng đã đủ người, không thể duyệt. Vui lòng từ chối và hướng dẫn sinh viên chọn phòng khác.' });
    }

    // Duyệt — gán NV đang đăng nhập và đổi trạng thái
    await conn.execute(
      "UPDATE HOPDONG SET HD_TRANGTHAI = 'Hiệu lực', NV_MA = ? WHERE HD_MA = ?",
      [maNV, maHD]
    );

    await conn.commit();
    return res.status(200).json({ success: true, message: 'Đã duyệt hợp đồng.' });
  } catch (err) {
    await conn.rollback();
    console.error('Lỗi duyệt hợp đồng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  } finally {
    conn.release();
  }
};

// ============================================================
// PUT /api/hopdong/:maHD/tu-choi
// Nhân viên từ chối đơn đăng ký của sinh viên → Từ chối
// ============================================================
const tuChoiHopDong = async (req, res) => {
  const { maHD } = req.params;

  try {
    const [check] = await db.execute('SELECT HD_MA, HD_TRANGTHAI FROM HOPDONG WHERE HD_MA = ?', [maHD]);

    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng.' });
    }
    if (check[0].HD_TRANGTHAI !== 'Chờ duyệt') {
      return res.status(400).json({ success: false, message: 'Hợp đồng này không ở trạng thái Chờ duyệt.' });
    }

    await db.execute("UPDATE HOPDONG SET HD_TRANGTHAI = 'Từ chối' WHERE HD_MA = ?", [maHD]);

    return res.status(200).json({ success: true, message: 'Đã từ chối đơn đăng ký.' });
  } catch (err) {
    console.error('Lỗi từ chối hợp đồng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// PUT /api/hopdong/:maHD/duyet-ket-thuc — NV duyệt yêu cầu kết thúc sớm của SV
// Áp dụng ngày SV xin dọn ra làm ngày kết thúc hợp đồng, xóa cờ yêu cầu.
const duyetKetThucHopDong = async (req, res) => {
  const { maHD } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Khóa dòng để tránh 2 nhân viên cùng xử lý một yêu cầu
    // Lấy các mốc ngày dạng chuỗi YYYY-MM-DD ngay từ SQL (DATE_FORMAT) để so sánh bằng chuỗi —
    // tránh lỗi lệch múi giờ khi MySQL DATE bị driver chuyển thành Date object theo giờ địa phương.
    const [rows] = await conn.execute(
      `SELECT HD_MA, HD_TRANGTHAI,
              DATE_FORMAT(HD_NGAYBD, '%Y-%m-%d') AS ngayBD,
              DATE_FORMAT(HD_NGAYKT, '%Y-%m-%d') AS ngayKT,
              DATE_FORMAT(HD_YEUCAUKETTHUC, '%Y-%m-%d') AS ngayYeuCau
       FROM HOPDONG WHERE HD_MA = ? FOR UPDATE`,
      [maHD]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng.' });
    }
    const hd = rows[0];
    if (!hd.ngayYeuCau) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Hợp đồng này không có yêu cầu kết thúc chờ duyệt.' });
    }
    // Phòng thủ: ngày yêu cầu phải vẫn nằm trong khoảng hợp đồng
    if (hd.ngayYeuCau < hd.ngayBD || hd.ngayYeuCau > hd.ngayKT) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Ngày kết thúc yêu cầu không hợp lệ.' });
    }
    // Kiểm tra lại mốc "đầu tháng sau" TẠI THỜI ĐIỂM DUYỆT (không phải lúc SV gửi đơn) — nếu NV
    // duyệt trễ, ngày SV xin trước đó có thể đã rơi vào tháng hiện tại hoặc quá khứ.
    const ngaySomNhatStr = dauThangSau();
    if (hd.ngayYeuCau < ngaySomNhatStr) {
      await conn.rollback();
      const [d, t, n] = ngaySomNhatStr.split('-').reverse();
      return res.status(400).json({
        success: false,
        message: `Ngày sinh viên xin kết thúc đã không còn hợp lệ do duyệt trễ — chỉ chấp nhận từ ${d}/${t}/${n} trở đi. Vui lòng liên hệ sinh viên gửi lại yêu cầu.`
      });
    }

    // Áp ngày dọn ra làm ngày kết thúc, xóa cờ yêu cầu
    await conn.execute(
      'UPDATE HOPDONG SET HD_NGAYKT = HD_YEUCAUKETTHUC, HD_YEUCAUKETTHUC = NULL WHERE HD_MA = ?',
      [maHD]
    );
    await conn.commit();
    return res.status(200).json({ success: true, message: 'Đã duyệt yêu cầu kết thúc hợp đồng.' });
  } catch (err) {
    await conn.rollback();
    console.error('Lỗi duyệt kết thúc:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  } finally {
    conn.release();
  }
};

// PUT /api/hopdong/:maHD/tu-choi-ket-thuc — NV từ chối yêu cầu kết thúc, HĐ giữ nguyên
const tuChoiKetThucHopDong = async (req, res) => {
  const { maHD } = req.params;
  try {
    const [rows] = await db.execute('SELECT HD_YEUCAUKETTHUC FROM HOPDONG WHERE HD_MA = ?', [maHD]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng.' });
    }
    if (!rows[0].HD_YEUCAUKETTHUC) {
      return res.status(400).json({ success: false, message: 'Hợp đồng này không có yêu cầu kết thúc chờ duyệt.' });
    }
    await db.execute('UPDATE HOPDONG SET HD_YEUCAUKETTHUC = NULL WHERE HD_MA = ?', [maHD]);
    return res.status(200).json({ success: true, message: 'Đã từ chối yêu cầu kết thúc. Hợp đồng vẫn còn hiệu lực.' });
  } catch (err) {
    console.error('Lỗi từ chối kết thúc:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

module.exports = { layDanhSachHopDong, layChiTietHopDong, taoHopDong, ketThucHopDong, duyetHopDong, tuChoiHopDong, duyetKetThucHopDong, tuChoiKetThucHopDong };
