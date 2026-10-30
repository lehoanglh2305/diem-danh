# Điểm danh CMC

Hệ thống điểm danh chống gian lận cho các lớp tại CMC University. Chạy trên Google Sheets và Google Apps Script, miễn phí.

## Cách chống gian lận

1. **Mã QR động**: mã đổi sau mỗi 15 giây. Ảnh chụp gửi cho bạn ở nhà sẽ hết hạn trước khi dùng được.
2. **Câu hỏi nhanh**: giáo viên đọc câu hỏi trong lớp, đáp án không hiện trên màn hình.
3. **Kiểm tra wifi trường**: so IP công cộng của điện thoại với IP mạng trường.
4. **Một điện thoại, một sinh viên**: mỗi máy chỉ điểm danh được cho một mã sinh viên trong mỗi buổi.

Các trường hợp đáng ngờ vẫn được ghi lại, kèm lý do trong cột Cần xem lại của sheet Attendance.

## Các file

| File | Vai trò |
| --- | --- |
| `Code.gs` | Backend: tạo mã QR, kiểm tra và ghi dữ liệu vào Google Sheets |
| `Teacher.html` | Trang giáo viên: mở buổi, chiếu QR, xem số người đã điểm danh |
| `Student.html` | Trang sinh viên: form 3 ô (mã SV, họ tên, câu trả lời) |
| `IpCheck.html` | Trang xem IP của mạng đang kết nối |

## Cài đặt

1. Tạo một Google Sheet mới, vào Tiện ích mở rộng, chọn Apps Script.
2. Dán nội dung `Code.gs` vào file Code.gs. Tạo thêm 3 file HTML tên đúng là `Teacher`, `Student`, `IpCheck` rồi dán nội dung tương ứng.
3. Chọn hàm `setup`, bấm Chạy, cấp quyền.
4. Trong sheet Settings: đổi `TEACHER_PIN` thành mã riêng (ít nhất 6 ký tự), điền danh sách lớp vào `CLASSES`.
5. Bấm Triển khai, chọn Ứng dụng web. Thực thi với tư cách: Tôi. Ai có quyền truy cập: Bất kỳ ai. Copy link.
6. Ở trường, nối wifi trường, mở link kèm `?page=ip` và ghi IP vào ô `ALLOWED_IPS`. Nếu IP đổi số cuối giữa các ngày, ghi phần đầu kèm dấu chấm cuối, ví dụ `113.161.20.`
7. Trang giáo viên: link kèm `?page=teacher`.

## Cài đặt trong sheet Settings

| Key | Ý nghĩa |
| --- | --- |
| `TEACHER_PIN` | Mã đăng nhập trang giáo viên |
| `CLASSES` | Danh sách lớp, cách nhau bằng dấu phẩy |
| `ALLOWED_IPS` | IP công cộng của wifi trường |
| `STRICT_IP` | TRUE: chặn sinh viên ngoài mạng trường. FALSE: vẫn ghi nhận nhưng đánh dấu |
| `QR_SECONDS` | Số giây mỗi mã QR có hiệu lực (mặc định 15) |
| `TICKET_MINUTES` | Số phút sinh viên có để điền form sau khi quét (mặc định 3) |

## Giới hạn cần biết

* Trang web không đọc được tên wifi, nên hệ thống kiểm tra qua IP công cộng. Sinh viên dùng 4G sẽ bị đánh dấu ngoài mạng trường.
* IP do điện thoại gửi lên, người rành kỹ thuật có thể làm giả. QR động và câu hỏi nhanh là lớp chặn chính.
* Mã giáo viên và khóa ký QR nằm trong Google Sheet và Script Properties, không nằm trong repo này.

Giao diện theo design system Shelf Pop.
