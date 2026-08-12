# Company Operations Platform

Prototype frontend tương tác cho nền tảng quản trị vận hành đa công ty. Cấu hình đầu tiên dành cho Việt Quốc Huy (VQH), nhưng domain và repository đã tách theo `tenantId`/`companyId` để tiếp tục phát triển theo mô hình hybrid.

## Stack hiện tại

- Nuxt 4 SPA, Vue 3 và TypeScript strict
- Nuxt UI 4, Tailwind CSS 4
- Zod kiểm tra dữ liệu giả
- Vitest cho unit test
- Playwright + axe-core cho E2E, mobile và accessibility
- Node.js 24.x, pnpm 10.29.3

## Cài đặt và chạy

```bash
pnpm install
pnpm exec playwright install chromium
pnpm dev
```

Mở `http://127.0.0.1:3000`. Dữ liệu mẫu nằm trong browser local storage và được giới hạn trong phạm vi công ty VQH.

## Kiểm thử và build

```bash
pnpm test:unit
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test` chạy lần lượt unit test và E2E test.

## Khôi phục dữ liệu mẫu

Nút **Khôi phục dữ liệu mẫu** trên header xóa mọi thay đổi cục bộ rồi nạp lại fixture ban đầu. Hệ thống hỏi xác nhận trước khi thực hiện và giữ người dùng ở route hiện tại. Thao tác này khôi phục bản vẽ v1 làm bản lưu hành, mốc khách chốt và trạng thái công việc mẫu.

## Phạm vi prototype

Đã có danh sách dự án, dashboard hành trình, không gian chi tiết giai đoạn, lịch sử bản vẽ, ảnh mục tiêu so với hiện trạng, công việc xuyên dự án, mobile layout và reset dữ liệu.

Chưa có backend/API, đăng nhập thật, phân quyền production, database Supabase, tải file lên Cloudflare R2, thông báo, đồng bộ realtime hoặc APK. Form upload hiện chỉ mô phỏng việc lưu URL và metadata; không nhập hồ sơ, hợp đồng, ảnh hay bản vẽ thật.

## Đường chuyển sang production

```text
Mock repositories now       → HTTP repositories later
Fixed VQH CompanyContext    → Authenticated membership context later
VQH CompanyConfig           → Tenant/company configuration service later
Metadata URL simulation     → R2 signed upload later
Mock user                   → Supabase Auth later
Advisory gate               → Configurable blocking gate later
```

Các component chỉ phụ thuộc repository contracts. Khi dựng backend, thay implementation của repository mà không cần viết lại luồng UI đã được mọi người góp ý.
