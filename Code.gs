/**
 * He thong diem danh CMC: QR dong + cau hoi nhanh + kiem tra IP mang truong.
 * Backend: Google Sheets + Apps Script.
 */

var SH = { SETTINGS: 'Settings', SESSIONS: 'Sessions', ATT: 'Attendance', STUDENTS: 'Students' };

/* ======================= CAI DAT BAN DAU ======================= */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var st = ensureSheet_(ss, SH.SETTINGS, ['Key', 'Value', 'Ghi chú']);
  if (st.getLastRow() < 2) {
    st.getRange(2, 1, 6, 3).setValues([
      ['TEACHER_PIN', 'doimanayngay', 'Mã đăng nhập trang giáo viên. Dùng ít nhất 6 ký tự.'],
      ['CLASSES', 'L4', 'Danh sách lớp, cách nhau bằng dấu phẩy. Ví dụ: L4, L3A, L3B'],
      ['ALLOWED_IPS', '', 'IP công cộng của wifi trường, cách nhau bằng dấu phẩy. Kết thúc bằng dấu chấm để cho cả dải, ví dụ 113.161.20.'],
      ['STRICT_IP', 'FALSE', 'TRUE: chặn sinh viên ngoài mạng trường. FALSE: vẫn ghi nhận nhưng đánh dấu.'],
      ['QR_SECONDS', '15', 'Số giây mỗi mã QR có hiệu lực.'],
      ['TICKET_MINUTES', '3', 'Số phút sinh viên có để điền form sau khi quét.']
    ]);
  }
  ensureSheet_(ss, SH.SESSIONS, ['SessionId', 'Lớp', 'Đáp án', 'Bắt đầu', 'Kết thúc', 'Trạng thái']);
  ensureSheet_(ss, SH.ATT, ['Thời gian', 'SessionId', 'Lớp', 'Mã SV', 'Họ tên', 'Câu trả lời',
    'Đúng đáp án', 'IP', 'Mạng trường', 'DeviceId', 'Cần xem lại']);
  var stu = ensureSheet_(ss, SH.STUDENTS, ['Mã SV', 'Họ tên', 'Lớp', 'DeviceId', 'Lần đầu']);
  // Giu mã SV dạng chữ để không mất số 0 đầu
  ss.getSheetByName(SH.ATT).getRange('D:D').setNumberFormat('@');
  stu.getRange('A:A').setNumberFormat('@');
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) {
    props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ======================= TRANG WEB ======================= */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.page === 'ip') {
    return HtmlService.createHtmlOutputFromFile('IpCheck')
      .setTitle('Kiểm tra IP')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var t;
  if (p.page === 'teacher') {
    t = HtmlService.createTemplateFromFile('Teacher');
    t.baseUrl = ScriptApp.getService().getUrl();
  } else {
    t = HtmlService.createTemplateFromFile('Student');
    t.sessionId = clean_(p.s, 40);
    t.token = clean_(p.t, 40);
  }
  return t.evaluate()
    .setTitle('Điểm danh CMC')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ======================= TIEN ICH ======================= */

function clean_(v, max) {
  return String(v || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, max);
}

function getSettings_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.SETTINGS);
  var rows = sh.getDataRange().getValues();
  var s = {};
  for (var i = 1; i < rows.length; i++) s[String(rows[i][0]).trim()] = rows[i][1];
  return {
    pin: String(s.TEACHER_PIN || '').trim(),
    classes: String(s.CLASSES || '').split(',').map(function (x) { return x.trim(); }).filter(String),
    allowedIps: String(s.ALLOWED_IPS || '').split(',').map(function (x) { return x.trim(); }).filter(String),
    strictIp: String(s.STRICT_IP).toUpperCase() === 'TRUE',
    qrSeconds: Math.max(5, Number(s.QR_SECONDS) || 15),
    ticketMinutes: Math.max(1, Number(s.TICKET_MINUTES) || 3)
  };
}

function secret_() {
  var s = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!s) throw new Error('Chưa chạy hàm setup.');
  return s;
}

function sign_(text) {
  var raw = Utilities.computeHmacSha256Signature(text, secret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '').slice(0, 16);
}

function normalize_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function ipAllowed_(ip, list) {
  if (!ip) return false;
  for (var i = 0; i < list.length; i++) {
    var rule = list[i];
    if (rule.charAt(rule.length - 1) === '.' ? ip.indexOf(rule) === 0 : ip === rule) return true;
  }
  return false;
}

function slotToken_(sessionId, slot) {
  return sign_('qr|' + sessionId + '|' + slot);
}

/* ======================= DANG NHAP GIAO VIEN ======================= */

function checkPin_(pin) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('pinFails') || 0);
  if (fails >= 10) throw new Error('Nhập sai mã quá nhiều lần. Thử lại sau 10 phút.');
  var cfg = getSettings_();
  if (!cfg.pin || String(pin) !== cfg.pin) {
    cache.put('pinFails', String(fails + 1), 600);
    throw new Error('Mã giáo viên không đúng.');
  }
  return cfg;
}

function teacherLogin(pin) {
  var cfg = checkPin_(pin);
  return { classes: cfg.classes, qrSeconds: cfg.qrSeconds, openSessions: openSessions_() };
}

function openSessions_() {
  var rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.SESSIONS).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][5] === 'OPEN') {
      out.push({ sessionId: rows[i][0], cls: rows[i][1], start: Utilities.formatDate(new Date(rows[i][3]),
        Session.getScriptTimeZone(), 'dd/MM HH:mm') });
    }
  }
  return out;
}

function findSession_(sessionId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.SESSIONS);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === sessionId) {
      return { row: i + 1, sessionId: rows[i][0], cls: rows[i][1], answer: rows[i][2], status: rows[i][5], sheet: sh };
    }
  }
  return null;
}

function startSession(pin, cls, answer) {
  var cfg = checkPin_(pin);
  if (cfg.classes.indexOf(cls) < 0) throw new Error('Lớp không có trong danh sách.');
  answer = String(answer || '').trim();
  if (!answer) throw new Error('Hãy nhập đáp án cho câu hỏi nhanh.');
  var id = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmm') + '_' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 6);
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.SESSIONS)
    .appendRow([id, cls, answer, new Date(), '', 'OPEN']);
  return { sessionId: id, cls: cls };
}

function getQr(pin, sessionId) {
  var cfg = checkPin_(pin);
  var s = findSession_(sessionId);
  if (!s) throw new Error('Không tìm thấy buổi điểm danh.');
  var period = cfg.qrSeconds * 1000;
  var now = Date.now();
  var slot = Math.floor(now / period);
  var token = slotToken_(sessionId, slot);
  return {
    url: ScriptApp.getService().getUrl() + '?s=' + sessionId + '&t=' + token,
    msLeft: period - (now % period),
    count: countAttendance_(sessionId),
    status: s.status,
    cls: s.cls
  };
}

function endSession(pin, sessionId) {
  checkPin_(pin);
  var s = findSession_(sessionId);
  if (!s) throw new Error('Không tìm thấy buổi điểm danh.');
  s.sheet.getRange(s.row, 5, 1, 2).setValues([[new Date(), 'CLOSED']]);
  return { count: countAttendance_(sessionId) };
}

function countAttendance_(sessionId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.ATT);
  if (sh.getLastRow() < 2) return 0;
  return sh.getRange(2, 2, sh.getLastRow() - 1, 1).createTextFinder(sessionId).matchEntireCell(true).findAll().length;
}

/* ======================= PHIA SINH VIEN ======================= */

function openScan(sessionId, token, deviceId) {
  sessionId = clean_(sessionId, 40); token = clean_(token, 40); deviceId = clean_(deviceId, 64);
  var cfg = getSettings_();
  var s = findSession_(sessionId);
  if (!s) throw new Error('Mã QR không hợp lệ.');
  if (s.status !== 'OPEN') throw new Error('Buổi điểm danh này đã kết thúc.');
  var slot = Math.floor(Date.now() / (cfg.qrSeconds * 1000));
  // Cho phep ma cua khung hien tai va khung lien truoc (de bu do tre mang)
  if (token !== slotToken_(sessionId, slot) && token !== slotToken_(sessionId, slot - 1)) {
    throw new Error('Mã QR đã hết hạn. Hãy quét lại mã đang chiếu trên màn hình.');
  }
  var issued = Date.now();
  var ticket = issued + '.' + sign_('tk|' + sessionId + '|' + deviceId + '|' + issued);
  return { cls: s.cls, ticket: ticket, ticketMinutes: cfg.ticketMinutes };
}

function submitAttendance(d) {
  d = d || {};
  var sessionId = clean_(d.sessionId, 40);
  var deviceId = clean_(d.deviceId, 64);
  var studentId = String(d.studentId || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  var name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  var answer = String(d.answer || '').trim().slice(0, 100);
  var ip = String(d.ip || '').replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45);

  if (!studentId) throw new Error('Hãy nhập mã sinh viên.');
  if (!name) throw new Error('Hãy nhập họ tên.');
  if (!answer) throw new Error('Hãy nhập câu trả lời.');
  if (!deviceId) throw new Error('Trình duyệt không hỗ trợ. Hãy tắt chế độ ẩn danh rồi quét lại.');

  var cfg = getSettings_();
  var s = findSession_(sessionId);
  if (!s) throw new Error('Buổi điểm danh không hợp lệ.');
  if (s.status !== 'OPEN') throw new Error('Buổi điểm danh này đã kết thúc.');

  // Kiem tra ve (ticket) cap luc quet QR
  var parts = String(d.ticket || '').split('.');
  var issued = Number(parts[0]);
  if (parts.length !== 2 || !issued || parts[1] !== sign_('tk|' + sessionId + '|' + deviceId + '|' + issued)) {
    throw new Error('Phiên không hợp lệ. Hãy quét lại mã QR.');
  }
  if (Date.now() - issued > cfg.ticketMinutes * 60000) {
    throw new Error('Hết thời gian điền form. Hãy quét lại mã QR.');
  }

  var inNet = ipAllowed_(ip, cfg.allowedIps);
  var netLabel = cfg.allowedIps.length === 0 ? 'Chưa cấu hình' : (inNet ? 'Có' : 'Không');
  if (cfg.strictIp && cfg.allowedIps.length && !inNet) {
    throw new Error('Bạn cần kết nối wifi của trường để điểm danh.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var att = ss.getSheetByName(SH.ATT);
    var flags = [];

    if (att.getLastRow() > 1) {
      var rows = att.getRange(2, 1, att.getLastRow() - 1, 11).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][1] !== sessionId) continue;
        if (String(rows[i][3]) === studentId) throw new Error('Mã sinh viên này đã điểm danh buổi hôm nay.');
        if (rows[i][9] === deviceId) throw new Error('Điện thoại này đã điểm danh cho sinh viên khác.');
      }
    }

    // So dang ky thiet bi
    var stu = ss.getSheetByName(SH.STUDENTS);
    var srows = stu.getLastRow() > 1 ? stu.getRange(2, 1, stu.getLastRow() - 1, 4).getValues() : [];
    var known = false;
    for (var j = 0; j < srows.length; j++) {
      if (String(srows[j][0]) === studentId) {
        known = true;
        if (srows[j][3] !== deviceId) flags.push('Đổi thiết bị');
      } else if (srows[j][3] === deviceId) {
        flags.push('Thiết bị đã đăng ký cho SV ' + srows[j][0]);
      }
    }
    if (!known) stu.appendRow([studentId, name, s.cls, deviceId, new Date()]);

    var correct = normalize_(answer) === normalize_(s.answer);
    if (!correct) flags.push('Sai đáp án');
    if (netLabel === 'Không') flags.push('Ngoài mạng trường');
    if (!ip) flags.push('Không lấy được IP');
    if (deviceId.indexOf('tmp') === 0) flags.push('Trình duyệt không lưu thiết bị');

    att.appendRow([new Date(), sessionId, s.cls, studentId, name, answer,
      correct ? 'Đúng' : 'Sai', ip, netLabel, deviceId, flags.join('; ')]);

    return { ok: true, review: flags.length > 0, cls: s.cls };
  } finally {
    lock.releaseLock();
  }
}
