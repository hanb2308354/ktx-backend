// app/controllers/sinhvien_portal.controller.js
// Cổng thông tin sinh viên — xem thông tin cá nhân, đăng ký phòng, xem hợp đồng, xem hóa đơn

const db = require('../../config/db');

// Kiểm tra định dạng ngày YYYY-MM-DD
const isValidDate = (str) => /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str));

// Ngay dau thang SAU thang hien tai (YYYY-MM-DD) - moc som nhat cho phep xin ket thuc hop dong,
// dam bao hoa don thang hien tai khong bao gio bi lech voi ngay ket thuc hop dong.
const dauThangSau = () => {
  const d = new Date();
  const nam = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const thang = d.getMonth() === 11 ? 1 : d.getMonth() + 2;
  return `${nam}-${String(thang).padStart(2, '0')}-01`;
};

// ============================================================
// GET /api/sv/thong-tin
// Luồng SV1: Sinh viên xem thông tin cá nhân của mình
// ============================================================
const xemThongTin = async (req, res) => {
  const maSV = req.sinhvien.maSV;
  try {
    const [rows] = await db.execute(
      `SELECT sv.SV_MA, sv.SV_HOTEN, sv.SV_GIOITINH, sv.SV_NGAYSINH,
              sv.SV_SDT, sv.SV_EMAIL, sv.SV_CCCD, sv.SV_QUEQUAN,
              l.L_TEN AS tenLop, dv.DV_TEN AS tenDonVi
       FROM SINHVIEN sv
       JOIN LOP l    ON sv.L_MA = l.L_MA
       JOIN DONVI dv ON l.DV_MA = dv.DV_MA
       WHERE sv.SV_MA = ?`,
      [maSV]
    );
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// GET /api/sv/phong
// Luồng SV2 - Bước 1: Xem danh sách phòng chưa đầy đúng giới tính
// Hệ thống tự lọc theo giới tính SV, chỉ hiển thị Trống hoặc Còn chỗ
// ============================================================
const xemPhongConCho = async (req, res) => {
  const maSV = req.sinhvien.maSV;
  try {
    // Lấy giới tính sinh viên để lọc phòng đúng khu
    const [svRows] = await db.execute('SELECT SV_GIOITINH FROM SINHVIEN WHERE SV_MA = ?', [maSV]);
    const gioiTinh = svRows[0].SV_GIOITINH;

    const [rows] = await db.execute(
      `SELECT p.P_MA, p.P_STT,
              lp.LP_TEN AS loaiPhong, lp.LP_SUCCHUA AS sucChua,
              t.T_STT AS soTang, tn.TN_TEN AS tenToaNha,
              k.K_TEN AS tenKhu,
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
       WHERE k.K_GIOITINH = ?
       GROUP BY p.P_MA, p.P_STT, lp.LP_TEN, lp.LP_SUCCHUA,
                t.T_STT, tn.TN_TEN, k.K_TEN, gp.GP_GIA
       HAVING choTrong > 0
       ORDER BY k.K_MA, tn.TN_MA, t.T_STT, p.P_STT`,
      [gioiTinh]
    );

    return res.status(200).json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// POST /api/sv/dang-ky
// Luồng SV2 - Bước 2 & 3: Sinh viên gửi đơn đăng ký phòng
// Hệ thống kiểm tra điều kiện rồi tạo hợp đồng trạng thái "Chờ duyệt"
// NV_MA = NULL vì chưa có nhân viên duyệt
// Body: { maPhong, ngayBatDau, ngayKetThuc }
// ============================================================
const dangKyPhong = async (req, res) => {
  const maSV = req.sinhvien.maSV;
  const { maPhong, ngayBatDau, ngayKetThuc } = req.body;

  if (!maPhong || !ngayBatDau || !ngayKetThuc) {
    return res.status(400).json({ success: false, message: 'Cần: maPhong, ngayBatDau, ngayKetThuc.' });
  }

  if (!isValidDate(ngayBatDau) || !isValidDate(ngayKetThuc)) {
    return res.status(400).json({ success: false, message: 'Định dạng ngày không hợp lệ. Dùng YYYY-MM-DD.' });
  }

  if (ngayBatDau >= ngayKetThuc) {
    return res.status(400).json({ success: false, message: 'Ngày bắt đầu phải nhỏ hơn ngày kết thúc.' });
  }

  const homNay = new Date().toISOString().slice(0, 10);
  if (ngayBatDau < homNay) {
    return res.status(400).json({ success: false, message: 'Ngày bắt đầu không được ở quá khứ.' });
  }

  try {
    // Bước 2: Kiểm tra đã có hợp đồng hiệu lực hoặc đang chờ duyệt chưa
    // Chặn nếu SV đã có HĐ Hiệu lực hoặc Chờ duyệt mà khoảng ngày chồng lấn đơn mới
    const [hdCheck] = await db.execute(
      `SELECT HD_MA, HD_TRANGTHAI FROM HOPDONG
       WHERE SV_MA = ?
         AND HD_TRANGTHAI IN ('Hiệu lực', 'Chờ duyệt')
         AND HD_NGAYBD <= ? AND ? <= HD_NGAYKT`,
      [maSV, ngayKetThuc, ngayBatDau]
    );

    if (hdCheck.length > 0) {
      const trangThai = hdCheck[0].HD_TRANGTHAI;
      if (trangThai === 'Chờ duyệt') {
        return res.status(409).json({ success: false, message: 'Bạn đang có đơn đăng ký chờ duyệt. Vui lòng chờ nhân viên xử lý.' });
      }
      return res.status(409).json({ success: false, message: 'Bạn đang có hợp đồng hiệu lực. Không thể đăng ký thêm.' });
    }

    // Bước 2: Kiểm tra phòng còn chỗ trong KHOẢNG THỜI GIAN đăng ký
    // Đếm HĐ Hiệu lực chồng lấn ngày với đơn mới (không dùng CURDATE vì có thể đăng ký cho tương lai)
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
      return res.status(404).json({ success: false, message: 'Không tìm thấy phòng.' });
    }
    if (phongInfo[0].soSVHienTai >= phongInfo[0].LP_SUCCHUA) {
      return res.status(400).json({ success: false, message: 'Phòng đã đầy.' });
    }

    // Bước 3: Tạo hợp đồng Chờ duyệt, trigger kiểm tra giới tính tự chạy
    // Sinh mã HĐ ngắn gọn dạng HDxxx, nhất quán với dữ liệu sẵn có (HD034, HD045...)
    const [maxRow] = await db.execute(
      "SELECT MAX(CAST(SUBSTRING(HD_MA, 3) AS UNSIGNED)) AS maxSo FROM HOPDONG WHERE HD_MA REGEXP '^HD[0-9]+$'"
    );
    const maHD = 'HD' + String((maxRow[0].maxSo || 0) + 1).padStart(3, '0');
    await db.execute(
      `INSERT INTO HOPDONG (HD_MA, HD_NGAYBD, HD_NGAYKT, SV_MA, NV_MA, P_MA, HD_TRANGTHAI)
       VALUES (?, ?, ?, ?, NULL, ?, 'Chờ duyệt')`,
      [maHD, ngayBatDau, ngayKetThuc, maSV, maPhong]
    );

    return res.status(201).json({
      success: true,
      message: 'Đã gửi đơn đăng ký. Vui lòng chờ nhân viên duyệt.',
      data: { maHD, maPhong, ngayBatDau, ngayKetThuc, trangThai: 'Chờ duyệt' }
    });
  } catch (err) {
    if (err.sqlState === '45000') {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('Lỗi đăng ký phòng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// GET /api/sv/hop-dong
// Luồng SV3: Sinh viên xem danh sách hợp đồng của mình
// Hiển thị trạng thái: Chờ duyệt / Hiệu lực / Từ chối
// ============================================================
const xemHopDong = async (req, res) => {
  const maSV = req.sinhvien.maSV;
  try {
    const [rows] = await db.execute(
      `SELECT hd.HD_MA, hd.HD_NGAYBD, hd.HD_NGAYKT, hd.HD_TRANGTHAI, hd.HD_YEUCAUKETTHUC,
              CASE
                WHEN hd.HD_TRANGTHAI = 'Chờ duyệt' THEN 'Chờ duyệt'
                WHEN hd.HD_TRANGTHAI = 'Từ chối'   THEN 'Từ chối'
                WHEN hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() < hd.HD_NGAYBD THEN 'Sắp hiệu lực'
                WHEN hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() BETWEEN hd.HD_NGAYBD AND hd.HD_NGAYKT THEN 'Còn hiệu lực'
                WHEN hd.HD_TRANGTHAI = 'Hiệu lực' AND CURDATE() > hd.HD_NGAYKT THEN 'Đã hết hạn'
                ELSE hd.HD_TRANGTHAI
              END AS trangThai,
              p.P_MA, p.P_STT AS soPhong,
              lp.LP_TEN AS loaiPhong,
              tn.TN_TEN AS tenToaNha, k.K_TEN AS tenKhu,
              nv.NV_HOTEN AS nhanVienDuyet
       FROM HOPDONG hd
       JOIN PHONG p      ON hd.P_MA  = p.P_MA
       JOIN LOAIPHONG lp ON p.LP_MA  = lp.LP_MA
       JOIN TANG t       ON p.T_MA   = t.T_MA
       JOIN TOANHA tn    ON t.TN_MA  = tn.TN_MA
       JOIN KHUKTX k     ON tn.K_MA  = k.K_MA
       LEFT JOIN NHANVIEN nv ON hd.NV_MA = nv.NV_MA
       WHERE hd.SV_MA = ?
       ORDER BY hd.HD_NGAYBD DESC`,
      [maSV]
    );
    return res.status(200).json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// GET /api/sv/hoa-don
// Luồng SV5: Sinh viên xem hóa đơn phòng mình đã hoặc đang ở
// Lấy từ hợp đồng Hiệu lực gần nhất (kể cả đã hết ngày)
// ============================================================
const xemHoaDon = async (req, res) => {
  const maSV = req.sinhvien.maSV;
  try {
    // Mỗi sinh viên có hóa đơn riêng — lấy trực tiếp theo SV_MA
    const [rows] = await db.execute(
      `SELECT hdn.HDN_MA, hdn.HDN_SOKWH, hdn.HDN_SONUOC,
              hdn.TIENDIEN, hdn.TIENNUOC, hdn.TIENPHONG,
              hdn.HDN_TONGTIEN, hdn.HDN_TRANGTHAI, hdn.NGAYTHANGNAM,
              p.P_MA, p.P_STT AS soPhong, lp.LP_TEN AS loaiPhong,
              k.K_TEN AS tenKhu, tn.TN_TEN AS tenToaNha
       FROM HOADON hdn
       JOIN PHONG p      ON hdn.P_MA  = p.P_MA
       JOIN LOAIPHONG lp ON p.LP_MA   = lp.LP_MA
       JOIN TANG t       ON p.T_MA    = t.T_MA
       JOIN TOANHA tn    ON t.TN_MA   = tn.TN_MA
       JOIN KHUKTX k     ON tn.K_MA   = k.K_MA
       WHERE hdn.SV_MA = ?
       ORDER BY hdn.NGAYTHANGNAM DESC`,
      [maSV]
    );

    return res.status(200).json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    console.error('Lỗi xem hóa đơn:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// GET /api/sv/phong-dang-o
// Luồng SV4: Sinh viên xem thông tin phòng đang ở + bạn cùng phòng
// Chỉ hiển thị họ tên và lớp của bạn cùng phòng, ẩn SĐT/CCCD/email
// ============================================================
const xemPhongDangO = async (req, res) => {
  const maSV = req.sinhvien.maSV;
  try {
    // Lấy phòng đang có hợp đồng Hiệu lực trong khoảng ngày hiện tại
    const [hdHienTai] = await db.execute(
      `SELECT P_MA FROM HOPDONG
       WHERE SV_MA = ? AND HD_TRANGTHAI = 'Hiệu lực'
       AND CURDATE() BETWEEN HD_NGAYBD AND HD_NGAYKT
       LIMIT 1`,
      [maSV]
    );

    if (hdHienTai.length === 0) {
      return res.status(404).json({ success: false, message: 'Bạn hiện không có hợp đồng hiệu lực.' });
    }

    const maPhong = hdHienTai[0].P_MA;

    // Thông tin phòng kèm giá năm hiện tại
    const [phongRows] = await db.execute(
      `SELECT p.P_MA, p.P_STT,
              lp.LP_TEN AS loaiPhong, lp.LP_SUCCHUA AS sucChua,
              t.T_STT AS soTang, tn.TN_TEN AS tenToaNha,
              k.K_TEN AS tenKhu, gp.GP_GIA AS giaThueNamNay
       FROM PHONG p
       JOIN LOAIPHONG lp ON p.LP_MA = lp.LP_MA
       JOIN TANG t       ON p.T_MA  = t.T_MA
       JOIN TOANHA tn    ON t.TN_MA = tn.TN_MA
       JOIN KHUKTX k     ON tn.K_MA = k.K_MA
       LEFT JOIN GIAPHONG gp ON p.LP_MA = gp.LP_MA AND gp.NAM = YEAR(CURDATE())
       WHERE p.P_MA = ?`,
      [maPhong]
    );

    // Bạn cùng phòng — ẩn SĐT, CCCD, email để bảo mật thông tin cá nhân
    const [banCungPhong] = await db.execute(
      `SELECT sv.SV_MA, sv.SV_HOTEN, sv.SV_GIOITINH, l.L_TEN AS tenLop
       FROM HOPDONG hd
       JOIN SINHVIEN sv ON hd.SV_MA = sv.SV_MA
       JOIN LOP l        ON sv.L_MA  = l.L_MA
       WHERE hd.P_MA = ?
         AND hd.HD_TRANGTHAI = 'Hiệu lực'
         AND CURDATE() BETWEEN hd.HD_NGAYBD AND hd.HD_NGAYKT
         AND hd.SV_MA != ?`,
      [maPhong, maSV]
    );

    return res.status(200).json({
      success: true,
      data: {
        ...phongRows[0],
        soSVDangO: banCungPhong.length + 1,
        choTrong: phongRows[0].sucChua - banCungPhong.length - 1,
        banCungPhong
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// POST /api/sv/hop-dong/:maHD/xin-ket-thuc
// Sinh viên gửi yêu cầu kết thúc hợp đồng sớm (chờ nhân viên duyệt)
// Body: { ngayDonRa }
// ============================================================
const xinKetThucHopDong = async (req, res) => {
  const maSV = req.sinhvien.maSV;
  const { maHD } = req.params;
  const { ngayDonRa } = req.body;

  if (!ngayDonRa) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ngày dự kiến dọn ra.' });
  }
  if (!isValidDate(ngayDonRa)) {
    return res.status(400).json({ success: false, message: 'Định dạng ngày không hợp lệ.' });
  }

  try {
    // Lấy hợp đồng và xác nhận thuộc về chính sinh viên này (chống thao tác chéo).
    // Lấy các mốc ngày dạng chuỗi YYYY-MM-DD ngay từ SQL để so sánh bằng chuỗi — tránh lỗi lệch
    // múi giờ khi trộn Date object (từ CSDL, driver tự chuyển local-time) với chuỗi (parse theo UTC).
    const [rows] = await db.execute(
      `SELECT HD_MA, HD_TRANGTHAI,
              DATE_FORMAT(HD_NGAYBD, '%Y-%m-%d') AS ngayBD,
              DATE_FORMAT(HD_NGAYKT, '%Y-%m-%d') AS ngayKT,
              DATE_FORMAT(HD_YEUCAUKETTHUC, '%Y-%m-%d') AS ngayYeuCauCu
       FROM HOPDONG WHERE HD_MA = ? AND SV_MA = ?`,
      [maHD, maSV]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng của bạn.' });
    }
    const hd = rows[0];

    // Chỉ xin kết thúc được hợp đồng đang CÒN HIỆU LỰC (đã bắt đầu, chưa hết hạn)
    const homNay = new Date().toISOString().slice(0, 10);
    if (hd.HD_TRANGTHAI !== 'Hiệu lực' || homNay < hd.ngayBD || homNay > hd.ngayKT) {
      return res.status(400).json({ success: false, message: 'Chỉ có thể xin kết thúc hợp đồng đang còn hiệu lực.' });
    }

    // Đã có yêu cầu chờ duyệt thì không gửi thêm
    if (hd.ngayYeuCauCu) {
      return res.status(409).json({ success: false, message: 'Bạn đã gửi yêu cầu kết thúc cho hợp đồng này, vui lòng chờ nhân viên duyệt.' });
    }

    // Ngày dọn ra phải từ đầu tháng SAU trở đi (không phải chỉ cần >= hôm nay) — sinh viên phải
    // đóng đủ hóa đơn tháng hiện tại, tránh lệch với hóa đơn tháng này đã hoặc sắp được lập.
    const ngaySomNhat = dauThangSau();
    if (ngayDonRa < ngaySomNhat) {
      const [nam, thang, ngay] = ngaySomNhat.split('-');
      return res.status(400).json({ success: false, message: `Ngày dọn ra chỉ được chọn từ ${ngay}/${thang}/${nam} trở đi (đầu tháng sau), để đóng đủ hóa đơn tháng này.` });
    }
    if (ngayDonRa > hd.ngayKT) {
      return res.status(400).json({ success: false, message: 'Ngày dọn ra không thể muộn hơn ngày hết hạn hợp đồng.' });
    }

    await db.execute('UPDATE HOPDONG SET HD_YEUCAUKETTHUC = ? WHERE HD_MA = ?', [ngayDonRa, maHD]);
    return res.status(200).json({ success: true, message: 'Đã gửi yêu cầu kết thúc hợp đồng. Vui lòng chờ nhân viên duyệt.' });
  } catch (err) {
    console.error('Lỗi xin kết thúc hợp đồng:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

module.exports = { xemThongTin, xemPhongConCho, dangKyPhong, xemHopDong, xemHoaDon, xemPhongDangO, xinKetThucHopDong };
