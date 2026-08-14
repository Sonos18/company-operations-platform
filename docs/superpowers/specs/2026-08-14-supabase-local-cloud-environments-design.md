# Thiết kế kết nối Supabase local và Cloud

**Trạng thái:** Đã duyệt
**Ngày:** 2026-08-14

## Mục tiêu

Giữ trải nghiệm phát triển an toàn trên Supabase local, đồng thời cho phép Supabase CLI trên máy phát triển triển khai migration lên một Supabase Cloud duy nhất đang phục vụ VQH. Bản production trên Vercel phải tự dùng cấu hình Cloud do Vercel quản lý, không lưu Cloud URL hoặc key trong Git.

## Phạm vi

Thiết kế này chỉ thay đổi cách chọn biến môi trường, script migration và tài liệu vận hành. Nó không thay đổi schema, RLS, API, frontend repository hoặc dữ liệu hiện có.

## Kiến trúc môi trường

Ba luồng kết nối độc lập:

1. `pnpm dev` đọc `.env.local` và kết nối Supabase local tại `http://127.0.0.1:54321`.
2. Supabase CLI trên máy được link với project Cloud và chỉ dùng kết nối này để kiểm tra hoặc triển khai migration.
3. Vercel Production nhận URL và public/anon key của Supabase Cloud từ Vercel Environment Variables trong scope `Production`.

Ứng dụng không tự phát hiện môi trường bằng điều kiện trong source code. Cùng hai tên biến được dùng ở mọi nơi:

- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_ANON_KEY`

Giá trị đến từ `.env.local` khi chạy dev và từ Vercel khi build/deploy production.

## File và cấu hình

### `.env.local`

File cá nhân, bị Git ignore, chứa URL và anon key do `supabase status` của local stack cung cấp. `pnpm dev` phải gọi Nuxt với `--dotenv .env.local` để lựa chọn file này một cách tường minh.

### `.env.example`

Template được commit với URL local và placeholder cho anon key. Runbook hướng dẫn sao chép thành `.env.local`; không dùng `.env` chung nữa.

### Vercel

Hai biến `NUXT_PUBLIC_*` được cấu hình trong scope `Production`. `pnpm build` không đọc `.env.local`, nên Vercel build tự nhận giá trị Cloud từ môi trường deploy. Preview không được xem là production và chỉ kết nối Cloud khi các biến được cấp rõ ràng cho scope `Preview`.

### Nuxt runtime config

`runtimeConfig.public.supabaseUrl` và `supabaseAnonKey` tiếp tục là giao diện duy nhất cho application code. Giá trị mặc định để trống; Nuxt ghi đè bằng các biến `NUXT_PUBLIC_*` tương ứng. Không thêm service-role key vào public runtime config.

## Quy trình migration Cloud

Repository được link từ máy phát triển bằng `supabase login` và `supabase link --project-ref <project-ref>`. Trạng thái link của CLI và thông tin xác thực không được commit.

Quy trình bắt buộc cho mỗi thay đổi database:

1. Tạo migration bằng `supabase migration new <descriptive_name>`.
2. Áp lại toàn bộ schema local bằng `db:local:reset`.
3. Chạy pgTAP bằng `db:local:test` và release gate backend.
4. So sánh migration local/Cloud bằng `db:cloud:status`.
5. Xem trước thay đổi bằng `db:cloud:dry-run`.
6. Áp migration chưa có lên Cloud bằng `db:cloud:push`.
7. Kiểm tra lại migration list và các API quan trọng sau deploy.

Các script dự kiến:

- `db:local:reset`
- `db:local:test`
- `db:cloud:status`
- `db:cloud:dry-run`
- `db:cloud:push`

Không tạo script `db reset --linked`. Không dùng `--include-seed` với Cloud vì Cloud đang chứa dữ liệu thật.

## Bảo mật và lỗi vận hành

- Chỉ public/anon key được dùng bởi frontend và request-scoped backend client.
- Service-role key, database password và Supabase access token không nằm trong repository hoặc file public.
- Các lệnh Cloud phải dùng cờ `--linked` khi CLI hỗ trợ để làm rõ target; script phải fail nếu project chưa được link hoặc migration không hợp lệ.
- Migration luôn được kiểm thử local trước khi push Cloud.
- Trước migration có rủi ro dữ liệu, người vận hành phải xác nhận backup/recovery phù hợp và triển khai ngoài giờ sử dụng nội bộ.
- `db:cloud:push` chỉ áp migration tiến tới; không tự reset hay seed Cloud.

## Kiểm thử và tiêu chí hoàn thành

- Unit test xác nhận parser/runtime config chấp nhận cấu hình local và Cloud hợp lệ, đồng thời từ chối giá trị thiếu hoặc sai.
- `pnpm dev` dùng `.env.local` theo script và tài liệu.
- `pnpm build` không phụ thuộc `.env.local` và nhận được biến `NUXT_PUBLIC_*` do môi trường cung cấp.
- Các script local vẫn chạy reset/pgTAP/type generation thành công.
- Các script Cloud dùng đúng linked project và có dry-run trước push.
- Runbook mô tả đầy đủ cách lấy local key, link Cloud, cấu hình Vercel và triển khai migration mà không chứa secret.
- Toàn bộ unit test, typecheck, lint, build và database test hiện có vẫn xanh.
