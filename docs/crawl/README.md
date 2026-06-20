# Crawl (RSS) & Data Repo

Tài liệu này mô tả cơ chế crawler RSS của dự án SportNews: cách crawl dữ liệu, cấu trúc lưu trữ `data/`, cách chạy local, và GitHub Actions tự động cập nhật data repo.

## Tổng quan kiến trúc

- **Code repo**: `BE/SportNews` (repo này)
- **Data repo**: repo riêng để lưu JSON dữ liệu bài viết (mặc định `TuanVuuuu/vn-sport-news-data`)
- **API server** (`server.js`): chỉ **đọc JSON từ GitHub Raw của data repo** và trả cho mobile qua các endpoint như `/api/news`, `/api/discover`, `/api/news/search`.
- **Crawler** (`src/index.js`): chạy theo lịch (GitHub Actions) hoặc chạy local, lấy RSS của từng category, parse, lọc trùng, rồi **append-only** vào `data/<category>/chunks/*.json` và cập nhật `data/<category>/meta/metadata.json`.

## Luồng crawl chi tiết

### 1) Danh mục & nguồn RSS

Danh mục được khai báo trong `src/config/categories.js`.

- Mỗi category có:
  - `id`: dùng làm tên thư mục trong `data/` và query param `category` của API
  - `name`: tên hiển thị
  - `rssUrl`: feed RSS
  - `provider`: cấu hình parse tương ứng (xem `src/config/rssProviders.js`)

Crawler duyệt qua tất cả category theo thứ tự cấu hình.

### 2) Fetch RSS

`src/services/rssService.js` tải XML RSS bằng `axios`:

- set `User-Agent`
- timeout 15s

### 3) Parse RSS → chuẩn hóa item

`src/services/parseService.js` parse XML bằng `xml2js`, sau đó map thành item chuẩn hóa:

- `id`
- `category_id`, `category_name`
- `source`
- `title`, `description` (đã clean HTML)
- `thumbnail_url`
- `link`
- `published_at` (chuỗi pubDate gốc)
- `createAt` (ISO string nếu parse được)

### 4) Lọc trùng & sắp xếp

Trong `src/index.js`:

- đọc `metadata.json`
- đọc toàn bộ ID đã có trong các chunks hiện tại để tạo `existingIds`
- `itemsToAdd = newItems.filter(item => !existingIds.has(item.id))`
- sort `itemsToAdd` theo ngày tăng dần (cũ → mới) để append.

### 5) Lưu dữ liệu theo cơ chế append-only chunks

`src/utils/fileHelper.js` quản lý file:

- `data/<category>/meta/metadata.json`
- `data/<category>/chunks/chunk_1.json`, `chunk_2.json`, ...

Quy tắc:

- **append-only**: không sửa lại chunk cũ (chỉ ghi đè chunk đang active nếu cần)
- mỗi chunk tối đa `CHUNK_SIZE = 100` item
- `metadata.total_articles` tăng theo số item append
- `metadata.files` chứa danh sách file chunk theo thứ tự tạo
- `metadata.channel` lưu thông tin channel RSS
- `metadata.last_updated` cập nhật thời gian crawler chạy xong category

## Data repo và biến môi trường

### Data repo config

`src/config/dataRepo.js`:

- `DATA_REPO_OWNER` (default `TuanVuuuu`)
- `DATA_REPO_NAME` (default `vn-sport-news-data`)
- `DATA_REPO_BRANCH` (default `main`)

### Local setup data repo

Chạy:

```bash
npm run setup:data
```

Script `scripts/setup-data-repo.sh` sẽ clone data repo vào thư mục `data/` (hoặc pull nếu `data/` đã là git repo).

## Chạy crawler local

1) Cài dependency:

```bash
npm install
```

2) Chuẩn bị `data/`:

```bash
npm run setup:data
```

3) Chạy crawler:

```bash
npm run crawl
```

Kết quả:

- tạo/cập nhật file dưới `data/<category>/...`
- nếu bạn clone đúng data repo thì có thể commit/push thủ công (workflow CI sẽ tự làm việc này trên GitHub Actions).

## GitHub Actions: auto crawl + commit data

Workflow: `.github/workflows/crawler.yml`

Luồng CI:

- checkout code repo
- checkout data repo vào `data/` bằng `DATA_REPO_TOKEN`
- `npm install`
- chạy crawler: `node src/index.js`
- nếu `data/` có thay đổi → commit & push lên data repo

## Cấu trúc file trong data repo (ví dụ)

```
data/
  sports/
    meta/
      metadata.json
    chunks/
      chunk_1.json
      chunk_2.json
```

Trong đó:

- `metadata.json` (ví dụ field chính):
  - `total_articles`
  - `files` (mảng tên chunk)
  - `channel` (info RSS)
  - `last_updated`
- `chunks/chunk_N.json`: mảng item JSON như đã mô tả ở phần “Parse RSS”.

## Ghi chú về API đọc dữ liệu

API server (`server.js`) dùng `src/utils/apiDataHelper.js` để đọc JSON từ GitHub Raw URL (qua `src/utils/remoteDataReader.js`).

Vì vậy:

- dữ liệu trả về API phụ thuộc trực tiếp vào format item trong data repo
- thêm field mới ở crawler (ví dụ `thumbnail_blurhash`) sẽ tự động được trả ra API (vì `formatArticle()` spread `...item`).

## Kế hoạch: `thumbnail_blurhash` + backfill (mobile placeholder blur)

Mục tiêu: mobile hiển thị ảnh mờ (blur placeholder) trong lúc tải ảnh thật, bằng cách trả thêm field:

- `thumbnail_blurhash` (string | null) — blurhash tương ứng `thumbnail_url`

### Nguyên tắc triển khai

- **Tính blurhash ở crawler** (không tính lúc API request).
- Chỉ compute cho item **mới** hoặc item **thiếu blurhash**.
- Lỗi download/decode/encode ảnh → set `thumbnail_blurhash: null`, không làm fail cả job.
- Giới hạn concurrency để tránh quá tải network/CPU trong GitHub Actions.
- Cache theo `thumbnail_url` trong một run để tránh encode trùng.

### Backfill bài cũ

Vì storage là append-only, bài cũ sẽ chưa có `thumbnail_blurhash`. Nên có 1 script backfill chạy 1 lần (hoặc chạy theo batch) để:

- duyệt tất cả `data/<category>/chunks/*.json`
- nếu item chưa có `thumbnail_blurhash` và có `thumbnail_url` hợp lệ → compute và ghi lại chunk

Khuyến nghị tách backfill thành workflow `workflow_dispatch` riêng để kiểm soát thời gian chạy và tránh làm nặng job crawl hằng ngày.

