# Company Operations Platform

Prototype frontend tương tác cho nền tảng quản trị vận hành đa công ty. Cấu hình đầu tiên dành cho Việt Quốc Huy (VQH), nhưng domain và repository đã tách theo `tenantId`/`companyId` để tiếp tục phát triển theo mô hình hybrid.

## Stack hiện tại

- Nuxt 4 SPA, Vue 3 và TypeScript strict
- Nuxt UI 4, Tailwind CSS 4
- Zod kiểm tra dữ liệu giả
- Vitest cho unit test
- Playwright + axe-core cho E2E, mobile và accessibility
- Node.js 24.x, pnpm 10.29.3

## Kiến trúc backend đã chọn

Giai đoạn production đầu tiên cho VQH sẽ dùng TypeScript end-to-end:

- Nuxt Nitro server routes làm API/BFF và giữ một backend deployment
- Supabase PostgreSQL, Auth và Row Level Security
- Zod tại request/response boundary
- Supabase Storage private bucket cho giai đoạn VQH
- Supabase Realtime có chọn lọc cho task/activity
- Vitest, Supabase local và Playwright cho unit, integration/RLS và E2E

Backend được tổ chức như modular monolith. Domain service không phụ thuộc trực tiếp vào Nitro để có thể tách sang NestJS khi mobile/public API, background job hoặc nhu cầu deploy độc lập xuất hiện. Go, Rust, microservices, Kubernetes, Kafka và Redis chưa thuộc giai đoạn đầu.

Thiết kế đầy đủ nằm tại [Backend architecture design](docs/superpowers/specs/2026-08-14-backend-architecture-design.md).

## Cài đặt và chạy

```bash
pnpm install
pnpm exec playwright install chromium
pnpm dev
```

Mở `http://127.0.0.1:3000`. Dữ liệu mẫu nằm trong browser local storage và được giới hạn trong phạm vi công ty VQH.

Backend local cần Docker Desktop và Supabase CLI. Xem [Local backend development](docs/development/backend-local.md) để khởi động, reset migration, chạy RLS test và generate database types.

## Môi trường Supabase

- Development app: Supabase local through `.env.local`.
- Database delivery: local Supabase CLI linked to the VQH Cloud project.
- Production app: Supabase Cloud variables supplied by Vercel Production.

See [Local backend development](docs/development/backend-local.md) and [Supabase Cloud and Vercel production](docs/deployment/supabase-cloud-vercel.md).

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

Đã có nền tảng backend local: migration Supabase cho tenant/company membership, RLS và pgTAP; cùng Nitro API cho health, bearer authentication, session và company context. Frontend hiện vẫn dùng mock repositories. Chưa triển khai tích hợp frontend với dữ liệu production, UI đăng nhập/session, object storage, thông báo, đồng bộ realtime hoặc APK. Form upload hiện chỉ mô phỏng việc lưu URL và metadata; không nhập hồ sơ, hợp đồng, ảnh hay bản vẽ thật.

## Đường chuyển sang production

```text
Mock repositories now       → HTTP repositories later
Fixed VQH CompanyContext    → Authenticated membership context later
VQH CompanyConfig           → Tenant/company configuration service later
Metadata URL simulation     → Supabase Storage signed upload first
Mock user                   → Supabase Auth later
Advisory gate               → Configurable blocking gate later
```

Các component chỉ phụ thuộc repository contracts. Khi dựng backend, thay implementation của repository mà không cần viết lại luồng UI đã được mọi người góp ý. Cloudflare R2 vẫn là lựa chọn sau storage interface khi dung lượng hoặc chi phí egress tạo ra lợi ích đo được.
