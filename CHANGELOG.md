# Changelog

Tất cả thay đổi quan trọng của project SportNews sẽ được ghi lại trong file này.

## [1.0.0] - 2026-05-31

### Added

- Khởi tạo backend SportNews bằng Node.js và Express.
- Thêm script `npm start` để chạy API server và `npm run crawl` để chạy crawler RSS.
- Thêm cấu hình danh mục tin tức qua `src/config/categories.js`, bắt đầu với danh mục `sports`.
- Thêm RSS crawler để lấy dữ liệu bài viết từ nguồn RSS theo từng danh mục.
- Thêm service tải RSS với `axios`, custom `User-Agent` và timeout request.
- Thêm service parse XML RSS bằng `xml2js`.
- Chuẩn hóa dữ liệu bài viết gồm:
  - `id`
  - `title`
  - `description`
  - `thumbnail_url`
  - `link`
  - `published_at`
  - `createAt`
- Làm sạch HTML trong phần mô tả bài viết trước khi lưu và trả về API.
- Tự động trích xuất ảnh thumbnail từ `enclosure` hoặc thẻ `img` trong RSS description.
- Thêm trường `createAt` dạng ISO string để mobile dễ parse và hiển thị thời gian phát hành bài viết.
- Lưu metadata theo từng danh mục, gồm tổng số bài viết, danh sách chunk file, thông tin channel và thời điểm cập nhật cuối.
- Lưu bài viết theo cơ chế append-only chunk file, mỗi chunk tối đa 100 bài viết.
- Tự động tạo thư mục `data/<category>/meta` và `data/<category>/chunks` khi crawler chạy.
- Tự động lọc bài viết trùng dựa trên `id` đã tồn tại trong dữ liệu.
- Sắp xếp bài viết mới theo thứ tự cũ đến mới trước khi append vào storage.
- Thêm API `GET /api/news` để lấy danh sách tin tức theo danh mục.
- Hỗ trợ phân trang cho API danh sách tin tức qua `page` và `limit`.
- Giới hạn `limit` tối đa 100 item mỗi request để khớp với kích thước chunk.
- API danh sách tin tức trả bài mới nhất lên đầu.
- Thêm API `GET /api/news/search` để tìm kiếm và lọc bài viết.
- Hỗ trợ search bài viết theo `link`.
- Hỗ trợ search bài viết theo `published_at`.
- Hỗ trợ lọc bài viết theo `day`, `month`, `year` dựa trên ngày phát hành.
- API search hỗ trợ phân trang qua `page` và `limit`.
- API tự bổ sung `createAt` cho cả dữ liệu cũ chưa có trường này.
- Thêm API `GET /api/ping` để kiểm tra trạng thái server và trả thông tin runtime cơ bản.
- Thêm API `GET /api/categories` để trả về danh sách danh mục hiện có.
- Bật CORS cho API server để client/mobile có thể gọi API.
- Chuẩn hóa response API với `status`, `data`, `pagination` hoặc `message`.
- Thêm GitHub Actions workflow tự động chạy crawler định kỳ mỗi 10 phút.
- Workflow tự động commit và push dữ liệu mới trong thư mục `data/` khi có bài viết mới.

