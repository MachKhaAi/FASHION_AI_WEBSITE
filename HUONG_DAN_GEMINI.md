# Chạy FASHION AI WEBSITE với Google Gemini API (Free Tier)

1. Lấy API key miễn phí tại https://aistudio.google.com/apikey (không cần thẻ thanh toán).
2. Vào `backend`, mở `.env` (hoặc tạo từ `.env.example`) và điền cơ sở dữ liệu, JWT, rồi dán khóa vào `GEMINI_API_KEY=` (không dấu nháy, không khoảng trắng).
3. Cài dependencies và chạy backend (`npm install`, `node server.js`). **Mỗi lần sửa `.env` phải khởi động lại backend.**
4. Vào `frontend`, chạy `npm install` và `npm run dev`.
5. Kiểm tra bằng `cd backend && npm run check:gemini`, hoặc mở `http://localhost:5000/api/chat/status?test=1`.

Cấu hình: `GEMINI_MODEL=gemini-2.5-flash`, `GEMINI_TIMEOUT_MS=10000`. Nếu hay gặp lỗi hết hạn mức (429), đổi `GEMINI_MODEL=gemini-2.5-flash-lite`.

Lưu ý Free Tier:
- Có giới hạn số yêu cầu mỗi phút / mỗi ngày (xem hạn mức hiện tại trong Google AI Studio). Khi vượt, chatbot tự chuyển sang bộ phân tích cơ bản nếu `CHAT_LOCAL_FALLBACK=true`.
- Google có thể dùng dữ liệu gửi lên ở Free Tier để cải thiện sản phẩm. Backend chỉ gửi nội dung tin nhắn, tên sản phẩm và số đo; không gửi email, mật khẩu hay token.
- Không đưa `backend/.env` lên GitHub (đã nằm trong `.gitignore`).
