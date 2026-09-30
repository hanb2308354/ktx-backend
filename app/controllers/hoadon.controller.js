// app/controllers/hoadon.controller.js
// Luồng 3: Quản lý hóa đơn — chạy mỗi tháng cho từng phòng có người ở

const db = require('../../config/db');

// Kiểm tra định dạng ngày YYYY-MM-DD
const isValidDate = (str) => /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str));

// ============================================================
// GET /api/hoadon
// Lấy danh sách hóa đơn, lọc theo phòng / tháng / trạng thái
// ============================================================
const layDanhSachHoaDon = async (req, res) => {
  try {
    const { maPhong, trangThai, thang } = req.query;

    let query = `
      SELECT hdn.HDN_MA, hdn.HDN_SOKWH, hdn.HDN_SONUOC,
             hdn.TIENDIEN, hdn.TIENNUOC, hdn.TIENPHONG,
             hdn.HDN_TONGTIEN, hdn.HDN_TRANGTHAI, hdn.NGAYTHANGNAM,
             hdn.SV_MA, sv.SV_HOTEN AS tenSinhVien,
             p.P_MA, p.P_STT AS soPhong,
             lp.LP_TEN AS loaiPhong,
             tn.TN_TEN AS tenToaNha, k.K_TEN AS tenKhu,
             nv.NV_HOTEN AS nhanVienLap
      FROM HOADON hdn
      JOIN PHONG p      ON hdn.P_MA  = p.P_MA
      JOIN SINHVIEN sv  ON hdn.SV_MA = sv.SV_MA
      JOIN LOAIPHONG lp ON p.LP_MA   = lp.LP_MA
      JOIN TANG t       ON p.T_MA    = t.T_MA
      JOIN TOANHA tn    ON t.TN_MA   = tn.TN_MA
      JOIN KHUKTX k     ON tn.K_MA   = k.K_MA
      JOIN NHANVIEN nv  ON hdn.NV_MA = nv.NV_MA
      WHERE 1=1
    `;

    const params = [];
    // Lọc mã phòng / mã SV linh hoạt: bỏ khoảng trắng thừa, tìm gần đúng, không phân biệt hoa thường
    if (maPhong)        { query += ' AND hdn.P_MA LIKE ?';  params.push(`%${maPhong.trim()}%`); }
    // Lọc theo sinh viên: khớp cả mã SV lẫn họ tên (gõ "SV01" hoặc "Cường" đều tìm được)
    if (req.query.maSV) {
      query += ' AND (hdn.SV_MA LIKE ? OR sv.SV_HOTEN LIKE ?)';
      const kw = `%${req.query.maSV.trim()}%`;
      params.push(kw, kw);
    }
    // Lọc theo tháng: khớp cùng năm + cùng tháng (không phụ thuộc ngày chốt cụ thể).
    // Frontend gửi ngày đầu tháng (vd 2026-06-01), hóa đơn lưu theo ngày chốt thực tế (vd 2026-06-30),
    // nên phải so theo YEAR+MONTH chứ không khớp đúng một ngày.
    if (thang) {
      query += ' AND YEAR(hdn.NGAYTHANGNAM) = YEAR(?) AND MONTH(hdn.NGAYTHANGNAM) = MONTH(?)';
      params.push(thang, thang);
    }
    if (trangThai === 'chua-thanh-toan') query += " AND hdn.HDN_TRANGTHAI = 'Chưa thanh toán'";
    else if (trangThai === 'da-thanh-toan') query += " AND hdn.HDN_TRANGTHAI = 'Đã thanh toán'";

    query += ' ORDER BY hdn.NGAYTHANGNAM DESC, hdn.HDN_MA';

    const [rows] = await db.execute(query, params);
    return res.status(200).json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    console.error('Lỗi lấy danh sách hóa đơn:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// GET /api/hoadon/:maHDN
// Lấy chi tiết một hóa đơn
// ============================================================
const layChiTietHoaDon = async (req, res) => {
  const { maHDN } = req.params;
  try {
    const [rows] = await db.execute(
      `SELECT hdn.*,
              p.P_STT AS soPhong, lp.LP_TEN AS loaiPhong,
              tn.TN_TEN AS tenToaNha, k.K_TEN AS tenKhu,
              nv.NV_HOTEN AS nhanVienLap,
              sv.SV_HOTEN AS tenSinhVien
       FROM HOADON hdn
       JOIN PHONG p      ON hdn.P_MA  = p.P_MA
       JOIN SINHVIEN sv  ON hdn.SV_MA = sv.SV_MA
       JOIN LOAIPHONG lp ON p.LP_MA   = lp.LP_MA
       JOIN TANG t       ON p.T_MA    = t.T_MA
       JOIN TOANHA tn    ON t.TN_MA   = tn.TN_MA
       JOIN KHUKTX k     ON tn.K_MA   = k.K_MA
       JOIN NHANVIEN nv  ON hdn.NV_MA = nv.NV_MA
       WHERE hdn.HDN_MA = ?`,
      [maHDN]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn.' });
    }

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Lỗi lấy chi tiết hóa đơn:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// POST /api/hoadon/dong-ho
// Luồng 3 - Bước 1 & 2: Ghi chỉ số điện nước cho một phòng
// Dùng cho cả đầu kỳ lẫn cuối kỳ, mỗi lần ghi là một bản ghi riêng
// Body: { chiSoDien, chiSoNuoc, maPhong, ngay } — mã bản ghi (DHDN_MA) tự sinh
// ============================================================
// ============================================================
// GET /api/hoadon/dong-ho/gan-nhat/:maPhong
// Trả về chỉ số điện nước lần ghi gần nhất của 1 phòng (nếu có), để giao diện
// hiển thị làm gợi ý trước khi nhân viên nhập chỉ số mới — tránh gõ nhầm số
// nhỏ hơn lần trước (đồng hồ chỉ tăng dần).
// ============================================================
const layChiSoGanNhat = async (req, res) => {
  const { maPhong } = req.params;
  try {
    const [rows] = await db.execute(
      `SELECT CHISODIEN, CHISONUOC, DATE_FORMAT(NGAYTHANGNAM, '%d/%m/%Y') AS ngay
       FROM DONGHODIENNUOC WHERE P_MA = ?
       ORDER BY NGAYTHANGNAM DESC LIMIT 1`,
      [maPhong]
    );
    if (rows.length === 0) {
      return res.status(200).json({ success: true, data: null });
    }
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Lỗi lấy chỉ số gần nhất:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

const nhapChiSoDongHo = async (req, res) => {
  const { chiSoDien, chiSoNuoc, maPhong, ngay } = req.body;

  if (chiSoDien == null || chiSoNuoc == null || !maPhong || !ngay) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin đồng hồ.' });
  }

  if (!isValidDate(ngay)) {
    return res.status(400).json({ success: false, message: 'Định dạng ngày không hợp lệ. Dùng YYYY-MM-DD.' });
  }

  try {
    // Nếu ngày chưa có trong bảng THOIDIEM thì thêm vào trước
    const [thoiDiemCheck] = await db.execute(
      'SELECT NGAYTHANGNAM FROM THOIDIEM WHERE NGAYTHANGNAM = ?', [ngay]
    );
    if (thoiDiemCheck.length === 0) {
      await db.execute('INSERT INTO THOIDIEM (NGAYTHANGNAM) VALUES (?)', [ngay]);
    }

    // Mỗi phòng chỉ được ghi một lần mỗi ngày
    const [dhCheck] = await db.execute(
      'SELECT DHDN_MA FROM DONGHODIENNUOC WHERE P_MA = ? AND NGAYTHANGNAM = ?',
      [maPhong, ngay]
    );
    if (dhCheck.length > 0) {
      return res.status(409).json({ success: false, message: `Phòng "${maPhong}" đã có chỉ số ngày ${ngay} rồi.` });
    }

    // Mỗi phòng chỉ được ghi MỘT chỉ số duy nhất mỗi THÁNG (khớp với luật "1 hóa đơn/tháng"
    // ở bước lập hóa đơn). Tránh trường hợp ghi thêm 1 chỉ số giữa tháng, không lập được
    // hóa đơn cho lần ghi đó (do tháng đã có hóa đơn), rồi bản ghi dư đó lại vô tình bị
    // dùng làm "đầu kỳ" cho hóa đơn của tháng sau, khiến kỳ tính tiền bị lệch ngày.
    const [dhThangCheck] = await db.execute(
      `SELECT DHDN_MA, DATE_FORMAT(NGAYTHANGNAM, '%d/%m/%Y') AS ngayDaGhi
       FROM DONGHODIENNUOC WHERE P_MA = ? AND YEAR(NGAYTHANGNAM) = YEAR(?) AND MONTH(NGAYTHANGNAM) = MONTH(?)`,
      [maPhong, ngay, ngay]
    );
    if (dhThangCheck.length > 0) {
      const ngayDaGhi = dhThangCheck[0].ngayDaGhi;
      return res.status(409).json({
        success: false,
        message: `Phòng "${maPhong}" đã có chỉ số điện nước tháng này rồi (ghi ngày ${ngayDaGhi}). Mỗi phòng chỉ được ghi 1 chỉ số/tháng.`
      });
    }

    // Chặn ghi lùi ngày: không cho ghi chỉ số cho một thời điểm SỚM HƠN chỉ số muộn nhất
    // đã có của phòng này. Chỉ số điện nước có tính lũy kế (chỉ tăng dần theo thời gian),
    // nên nếu phòng đã có chỉ số tháng 8 mà giờ ghi thêm tháng 3, dữ liệu sẽ bị lệch thứ tự
    // thời gian — ảnh hưởng các chỗ khác đọc bảng này (thống kê, suy luận "đầu kỳ gần nhất").
    // Nếu cần bổ sung chỉ số cho tháng bị bỏ sót thật sự, xử lý qua thao tác riêng có xác nhận/log,
    // không đi qua luồng ghi chỉ số thông thường này.
    const [ghiMuonNhat] = await db.execute(
      `SELECT DATE_FORMAT(NGAYTHANGNAM, '%d/%m/%Y') AS ngayMuonNhat
       FROM DONGHODIENNUOC WHERE P_MA = ? AND NGAYTHANGNAM > ?
       ORDER BY NGAYTHANGNAM DESC LIMIT 1`,
      [maPhong, ngay]
    );
    if (ghiMuonNhat.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Phòng "${maPhong}" đã có chỉ số điện nước ở thời điểm muộn hơn (${ghiMuonNhat[0].ngayMuonNhat}). Không thể ghi bổ sung chỉ số cho thời điểm trước đó.`
      });
    }

    // Chỉ số lần này không được nhỏ hơn lần ghi gần nhất trước đó (đồng hồ chỉ tăng dần theo thời gian).
    // Kiểm tra riêng với kiểm tra ngày ở trên: kiểm tra trên chặn NGÀY đi lùi, còn kiểm tra này chặn
    // GIÁ TRỊ đi lùi — cần cả hai vì có thể nhập đúng ngày hợp lệ nhưng gõ nhầm số nhỏ hơn thực tế.
    const [prevRow] = await db.execute(
      `SELECT CHISODIEN, CHISONUOC FROM DONGHODIENNUOC
       WHERE P_MA = ? AND NGAYTHANGNAM < ?
       ORDER BY NGAYTHANGNAM DESC LIMIT 1`,
      [maPhong, ngay]
    );
    if (prevRow.length > 0) {
      const prev = prevRow[0];
      const dienMoi = Number(chiSoDien);
      const nuocMoi = Number(chiSoNuoc);
      if (Number.isNaN(dienMoi) || Number.isNaN(nuocMoi)) {
        return res.status(400).json({ success: false, message: 'Chỉ số điện, nước phải là số hợp lệ.' });
      }
      if (dienMoi < Number(prev.CHISODIEN) || nuocMoi < Number(prev.CHISONUOC)) {
        return res.status(400).json({
          success: false,
          message: `Chỉ số không hợp lệ: phải lớn hơn hoặc bằng lần ghi gần nhất (điện ${prev.CHISODIEN} kWh, nước ${prev.CHISONUOC} m³).`,
        });
      }
    }

    // Tự sinh mã bản ghi theo quy tắc DHDN + số thứ tự (nhất quán với HD_MA, HDN_MA)
    const [maxRow] = await db.execute(
      "SELECT MAX(CAST(SUBSTRING(DHDN_MA, 5) AS UNSIGNED)) AS maxSo FROM DONGHODIENNUOC WHERE DHDN_MA REGEXP '^DHDN[0-9]+$'"
    );
    const maDongHo = 'DHDN' + String((maxRow[0].maxSo || 0) + 1).padStart(3, '0');

    await db.execute(
      'INSERT INTO DONGHODIENNUOC (DHDN_MA, CHISODIEN, CHISONUOC, P_MA, NGAYTHANGNAM) VALUES (?, ?, ?, ?, ?)',
      [maDongHo, chiSoDien, chiSoNuoc, maPhong, ngay]
    );

    return res.status(201).json({ success: true, message: 'Đã lưu chỉ số điện nước.' });
  } catch (err) {
    console.error('Lỗi nhập chỉ số đồng hồ:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// POST /api/hoadon/tinh-toan
// Luồng 3 - Bước 3→6: Tính toán và tạo hóa đơn tháng cho một phòng
// Hệ thống tự lấy chỉ số đầu/cuối kỳ, đơn giá, giá phòng rồi tính tổng tiền
// Body: { maPhong, ngayChot }
// ============================================================
const tinhVaTaoHoaDon = async (req, res) => {
  const { maPhong, ngayChot } = req.body;
  const maNV = req.nhanvien.maNV;

  if (!maPhong || !ngayChot) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mã phòng và ngày chốt.' });
  }

  if (!isValidDate(ngayChot)) {
    return res.status(400).json({ success: false, message: 'Định dạng ngày không hợp lệ. Dùng YYYY-MM-DD.' });
  }
  // Không thể chốt sổ cho một ngày chưa tới — chưa thể đọc chỉ số điện nước của tương lai
  const homNay = new Date(); homNay.setHours(23, 59, 59, 999);
  if (new Date(ngayChot) > homNay) {
    return res.status(400).json({ success: false, message: 'Không thể lập hóa đơn cho ngày trong tương lai. Vui lòng chọn ngày chốt không muộn hơn hôm nay.' });
  }

  try {
    // Bước 3: Đảm bảo ngayChot có trong THOIDIEM (FK constraint)
    const [tdCheck] = await db.execute('SELECT NGAYTHANGNAM FROM THOIDIEM WHERE NGAYTHANGNAM = ?', [ngayChot]);
    if (tdCheck.length === 0) {
      await db.execute('INSERT INTO THOIDIEM (NGAYTHANGNAM) VALUES (?)', [ngayChot]);
    }

    // Bước 3: Lấy chỉ số cuối kỳ theo ngày chốt
    const [cuoiKy] = await db.execute(
      'SELECT CHISODIEN, CHISONUOC FROM DONGHODIENNUOC WHERE P_MA = ? AND NGAYTHANGNAM = ?',
      [maPhong, ngayChot]
    );
    if (cuoiKy.length === 0) {
      return res.status(404).json({ success: false, message: `Chưa có chỉ số đồng hồ phòng "${maPhong}" ngày ${ngayChot}.` });
    }

    // Bước 3: Lấy chỉ số đầu kỳ — bản ghi gần nhất trước ngày chốt.
    // An toàn vì mỗi phòng giờ chỉ được ghi 1 chỉ số/tháng (chặn ở bước ghi chỉ số),
    // nên "bản ghi gần nhất trước đó" luôn chính là chỉ số cuối tháng liền trước.
    const [dauKy] = await db.execute(
      `SELECT CHISODIEN, CHISONUOC, NGAYTHANGNAM FROM DONGHODIENNUOC
       WHERE P_MA = ? AND NGAYTHANGNAM < ?
       ORDER BY NGAYTHANGNAM DESC LIMIT 1`,
      [maPhong, ngayChot]
    );
    // Bước 3: Tính lượng tiêu thụ
    // Nếu chưa có chỉ số đầu kỳ (lần ghi đầu tiên / mới thay đồng hồ) thì lấy
    // chính chỉ số cuối kỳ làm gốc → tiêu thụ kỳ này = 0
    const chiSoDienGoc = dauKy.length > 0 ? dauKy[0].CHISODIEN : cuoiKy[0].CHISODIEN;
    const chiSoNuocGoc = dauKy.length > 0 ? dauKy[0].CHISONUOC : cuoiKy[0].CHISONUOC;

    const soKWH  = cuoiKy[0].CHISODIEN - chiSoDienGoc;
    const soNuoc = cuoiKy[0].CHISONUOC - chiSoNuocGoc;

    if (soKWH < 0 || soNuoc < 0) {
      return res.status(400).json({ success: false, message: 'Chỉ số cuối kỳ không thể nhỏ hơn đầu kỳ.' });
    }

    // Bước 4: Lấy đơn giá điện nước theo năm của kỳ hóa đơn
    const nam = new Date(ngayChot).getFullYear();
    const [donGia] = await db.execute('SELECT DONGIADIEN, DONGIANUOC FROM NAM WHERE NAM = ?', [nam]);
    if (donGia.length === 0) {
      return res.status(404).json({ success: false, message: `Chưa có đơn giá điện nước cho năm ${nam}.` });
    }

    // Bước 5: Lấy giá phòng theo đầu người (giá mỗi sinh viên/tháng) theo loại phòng và năm
    const [giaPhong] = await db.execute(
      `SELECT gp.GP_GIA FROM PHONG p
       JOIN GIAPHONG gp ON p.LP_MA = gp.LP_MA AND gp.NAM = ?
       WHERE p.P_MA = ?`,
      [nam, maPhong]
    );
    if (giaPhong.length === 0) {
      return res.status(404).json({ success: false, message: `Chưa có giá phòng "${maPhong}" năm ${nam}.` });
    }

    // Bước 6: Tính tiền.
    //  - Điện + nước: tổng cả phòng → chia theo số người thực tế đang ở.
    //  - Tiền phòng: GP_GIA là giá NIÊM YẾT mỗi sinh viên/tháng (theo đầu người),
    //    mỗi sinh viên trả đúng số này, không phụ thuộc phòng đông hay vắng.
    const tongTienDien = soKWH  * parseFloat(donGia[0].DONGIADIEN);
    const tongTienNuoc = soNuoc * parseFloat(donGia[0].DONGIANUOC);
    const tienPhongMoiNguoi = parseFloat(giaPhong[0].GP_GIA);


    // Bước 7: Lấy danh sách SV đang ở phòng tại ngày chốt (HĐ Hiệu lực bao trùm ngày chốt)
    const [dsSinhVien] = await db.execute(
      `SELECT SV_MA FROM HOPDONG
       WHERE P_MA = ? AND HD_TRANGTHAI = 'Hiệu lực'
         AND ? BETWEEN HD_NGAYBD AND HD_NGAYKT
       ORDER BY SV_MA`,
      [maPhong, ngayChot]
    );
    if (dsSinhVien.length === 0) {
      return res.status(400).json({ success: false, message: `Phòng "${maPhong}" không có sinh viên nào đang ở tại ngày ${ngayChot}, không thể lập hóa đơn.` });
    }
    const soSV = dsSinhVien.length;

    // Bước 8: Kiểm tra trùng — phòng này đã có hóa đơn trong THÁNG của kỳ chốt chưa.
    // Check theo tháng (không theo ngày cụ thể) để tránh lập 2 hóa đơn cho cùng một tháng
    // dù chọn ngày chốt khác nhau (vd 28/06 và 30/06 đều thuộc tháng 6).
    const [hdnCheck] = await db.execute(
      `SELECT HDN_MA FROM HOADON
       WHERE P_MA = ? AND YEAR(NGAYTHANGNAM) = YEAR(?) AND MONTH(NGAYTHANGNAM) = MONTH(?)`,
      [maPhong, ngayChot, ngayChot]
    );
    if (hdnCheck.length > 0) {
      const thangNam = new Date(ngayChot);
      return res.status(409).json({
        success: false,
        message: `Phòng "${maPhong}" đã có hóa đơn cho tháng ${thangNam.getMonth() + 1}/${thangNam.getFullYear()}.`
      });
    }

    // Bước 8b: Không cho lập hóa đơn cho một kỳ SỚM HƠN kỳ hóa đơn gần nhất đã có của phòng này.
    // Lý do: hóa đơn của kỳ SAU đã lấy "chỉ số gần nhất trước đó" làm đầu kỳ — nếu giữa 2 kỳ có
    // tháng bị bỏ trống (không lập hóa đơn), hóa đơn kỳ sau coi như đã nhảy qua và TÍNH GỘP LUÔN
    // phần tiêu thụ của tháng bị bỏ trống đó rồi. Nếu cho lập bổ sung hóa đơn cho tháng bị bỏ sót
    // này, tiền điện nước của tháng đó sẽ bị tính 2 lần (1 lần trong hóa đơn kỳ sau, 1 lần ở đây).
    const [hdnSauDo] = await db.execute(
      `SELECT HDN_MA, DATE_FORMAT(NGAYTHANGNAM, '%d/%m/%Y') AS ngayChotSau, NGAYTHANGNAM
       FROM HOADON WHERE P_MA = ? AND NGAYTHANGNAM > ?
       ORDER BY NGAYTHANGNAM ASC LIMIT 1`,
      [maPhong, ngayChot]
    );
    if (hdnSauDo.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Phòng "${maPhong}" đã có hóa đơn cho kỳ sau đó (ngày chốt ${hdnSauDo[0].ngayChotSau}). Không thể lập bổ sung hóa đơn cho kỳ trước, vì tiền điện nước của giai đoạn này có thể đã được tính gộp trong hóa đơn đó rồi.`
      });
    }

    // Bước 9: Chia đều cho từng SV — phần dư (làm tròn) dồn vào SV đầu để tổng khớp tuyệt đối
    // Tiền tính bằng "xu" (×100) để chia số nguyên, tránh sai số dấu phẩy động
    const chiaDeu = (tong, n, idx) => {
      const xu = Math.round(tong * 100);
      const coBan = Math.floor(xu / n);
      const du = xu - coBan * n;
      const phan = coBan + (idx === 0 ? du : 0);
      return phan / 100;
    };
    const chiaInt = (tong, n, idx) => {
      const coBan = Math.floor(tong / n);
      const du = tong - coBan * n;
      return coBan + (idx === 0 ? du : 0);
    };

    // Bước 10: Tạo hóa đơn cho từng SV trong transaction (all-or-nothing)
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const hoaDonTao = [];
      for (let i = 0; i < soSV; i++) {
        const svMa     = dsSinhVien[i].SV_MA;
        const svKWH    = chiaInt(soKWH, soSV, i);
        const svNuoc   = chiaInt(soNuoc, soSV, i);
        const svTDien  = chiaDeu(tongTienDien, soSV, i);
        const svTNuoc  = chiaDeu(tongTienNuoc, soSV, i);
        // Tiền phòng = giá niêm yết mỗi sinh viên/tháng (giá theo đầu người)
        // Mỗi SV trả đúng số này, không phụ thuộc phòng đông hay vắng
        const svTPhong = Math.round(tienPhongMoiNguoi);
        const svTong   = +(svTDien + svTNuoc + svTPhong).toFixed(2);
        // Mã HĐN duy nhất, vừa VARCHAR(20): HDN + mã phòng đầy đủ + 4 số cuối timestamp + index
        // Dùng cả chữ (PA/PB) để PA101 và PB101 không trùng nhau. Ví dụ: HDNPA101-8170-0
        const tsNgan = Date.now().toString().slice(-4);
        const maHDN = `HDN${maPhong}${tsNgan}${i}`;

        await conn.execute(
          `INSERT INTO HOADON (HDN_MA, HDN_SONUOC, HDN_SOKWH, HDN_TONGTIEN, NV_MA, P_MA, SV_MA, NGAYTHANGNAM, TIENDIEN, TIENNUOC, TIENPHONG, HDN_TRANGTHAI)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Chưa thanh toán')`,
          [maHDN, svNuoc, svKWH, svTong, maNV, maPhong, svMa, ngayChot, svTDien, svTNuoc, svTPhong]
        );
        hoaDonTao.push({ maHDN, svMa, soKWH: svKWH, soNuoc: svNuoc, tienDien: svTDien, tienNuoc: svTNuoc, tienPhong: svTPhong, tongTien: svTong });
      }

      await conn.commit();

      return res.status(201).json({
        success: true,
        message: `Đã xuất ${soSV} hóa đơn cho phòng ${maPhong} (chia đều cho ${soSV} sinh viên).`,
        data: {
          maPhong, ngayChot, soSinhVien: soSV,
          kyTinh: { tuNgay: dauKy.length > 0 ? (dauKy[0].NGAYTHANGNAM || null) : null, denNgay: ngayChot },
          tongPhong: { soKWH, soNuoc, tienDien: tongTienDien, tienNuoc: tongTienNuoc, tienPhongMoiNguoi },
          hoaDon: hoaDonTao
        }
      });
    } catch (errTx) {
      await conn.rollback();
      throw errTx;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Lỗi tạo hóa đơn:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// PUT /api/hoadon/:maHDN/thanh-toan
// Luồng 3 - Bước 7: Xác nhận đã thu tiền, cập nhật trạng thái hóa đơn
// ============================================================
const capNhatThanhToan = async (req, res) => {
  const { maHDN } = req.params;

  try {
    const [check] = await db.execute('SELECT HDN_MA, HDN_TRANGTHAI FROM HOADON WHERE HDN_MA = ?', [maHDN]);

    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn.' });
    }

    if (check[0].HDN_TRANGTHAI === 'Đã thanh toán') {
      return res.status(400).json({ success: false, message: 'Hóa đơn này đã thanh toán rồi.' });
    }

    await db.execute("UPDATE HOADON SET HDN_TRANGTHAI = 'Đã thanh toán' WHERE HDN_MA = ?", [maHDN]);

    return res.status(200).json({ success: true, message: 'Đã xác nhận thu tiền.' });
  } catch (err) {
    console.error('Lỗi cập nhật thanh toán:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

// ============================================================
// GET /api/hoadon/thong-ke
// Luồng 3 - Bước 7: Thống kê doanh thu theo tháng (đã thu / chưa thu)
// Query: ?nam=2024
// ============================================================
const thongKeDoanhThu = async (req, res) => {
  const { nam } = req.query;
  try {
    let query = `
      SELECT DATE_FORMAT(NGAYTHANGNAM, '%Y-%m-01') AS thang,
             COUNT(HDN_MA) AS soHoaDon,
             SUM(HDN_TONGTIEN) AS tongDoanhThu,
             SUM(TIENDIEN) AS tongTienDien,
             SUM(TIENNUOC) AS tongTienNuoc,
             SUM(TIENPHONG) AS tongTienPhong,
             SUM(CASE WHEN HDN_TRANGTHAI = 'Đã thanh toán'   THEN HDN_TONGTIEN ELSE 0 END) AS daThu,
             SUM(CASE WHEN HDN_TRANGTHAI = 'Chưa thanh toán' THEN HDN_TONGTIEN ELSE 0 END) AS chuaThu
      FROM HOADON
    `;
    const params = [];
    if (nam) { query += ' WHERE YEAR(NGAYTHANGNAM) = ?'; params.push(nam); }
    // Gom nhóm theo tháng (năm-tháng) để hóa đơn cùng tháng dù khác ngày chốt vẫn gộp chung
    query += ` GROUP BY DATE_FORMAT(NGAYTHANGNAM, '%Y-%m-01') ORDER BY thang DESC`;

    const [rows] = await db.execute(query, params);
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('Lỗi thống kê doanh thu:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
};

module.exports = { layDanhSachHoaDon, layChiTietHoaDon, nhapChiSoDongHo, layChiSoGanNhat, tinhVaTaoHoaDon, capNhatThanhToan, thongKeDoanhThu };
