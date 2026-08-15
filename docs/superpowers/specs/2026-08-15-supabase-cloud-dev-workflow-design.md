# Thiết kế phát triển trực tiếp với Supabase Cloud DEV

**Trạng thái:** Đã duyệt
**Ngày:** 2026-08-15

## Mục tiêu

Thay Supabase local chạy bằng Docker trên máy phát triển bằng một project Supabase Cloud DEV riêng. Ứng dụng Nuxt chạy local dùng Cloud DEV; Vercel Production tiếp tục dùng project Production độc lập. Schema và dữ liệu nền VQH được triển khai bằng migration có kiểm soát, không sao chép dữ liệu kiểm thử hoặc tài khoản giả từ Docker.

Thiết kế này thay thế các phần yêu cầu Supabase local trong `2026-08-14-supabase-local-cloud-environments-design.md`. Các nguyên tắc vẫn giữ nguyên gồm: migration nằm trong Git, Production nhận biến từ Vercel, không commit secret, không reset hoặc seed database Cloud.

## Phạm vi

Bao gồm:

- Tạo `.env.local` bị Git ignore để người phát triển điền URL và public key của Cloud DEV.
- Đổi luồng lệnh hằng ngày sang project DEV được Supabase CLI link.
- Triển khai migration tenancy hiện có lên DEV.
- Tạo dữ liệu nền tenant và company VQH bằng migration.
- Tạo tài khoản DEV thật qua Supabase Auth và gán quyền bằng một thủ tục onboarding có kiểm soát.
- Làm pgTAP độc lập với `seed.sql` để có thể chạy an toàn trên Cloud DEV.
- Giữ Docker local dưới dạng công cụ CI/fallback, không dùng trong luồng hằng ngày.
- Cập nhật runbook và contract tests để phản ánh mô hình mới.

Không bao gồm:

- Đưa migration hoặc dữ liệu lên Production.
- Cấu hình hoặc deploy Vercel.
- Sao chép toàn bộ volume Docker, tenant isolation hay tài khoản có email `.local` lên Cloud.
- Thêm service-role key vào ứng dụng hoặc `.env.local`.
- Xây giao diện đăng nhập hoặc quy trình quản trị người dùng hoàn chỉnh.

## Kiến trúc môi trường

Ba luồng được tách rõ:

1. `pnpm dev` đọc `.env.local` và kết nối Supabase Cloud DEV.
2. Supabase CLI trên máy được link chỉ với project DEV để xem migration, dry-run, push, chạy pgTAP và sinh TypeScript types.
3. Vercel Production tiếp tục nhận URL và public key của project Production từ Vercel Environment Variables.

Application code chỉ đọc hai biến hiện có:

- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_ANON_KEY`

Tên biến `ANON_KEY` được giữ để không mở rộng phạm vi thay đổi application code; giá trị có thể là legacy anon key hoặc publishable key tương thích do Supabase cung cấp. Không có database password, access token hoặc service-role key trong public runtime config.

## File môi trường và secret

### `.env.local`

Tạo file local, không commit, với giá trị trống:

```dotenv
# Supabase Cloud DEV
NUXT_PUBLIC_SUPABASE_URL=
NUXT_PUBLIC_SUPABASE_ANON_KEY=
```

Người dùng tự dán Project URL và Publishable/Anon key. File này không chứa project database password hoặc Supabase personal access token.

### `.env.example`

Template được commit sẽ mô tả Cloud DEV thay vì URL `127.0.0.1`. Nó chỉ chứa placeholder, không chứa project ref hoặc key thật.

### Trạng thái CLI

CLI được xác thực và link bằng:

```powershell
pnpm exec supabase login
pnpm exec supabase link --project-ref <dev-project-ref>
```

Project ref/link state trong `supabase/.temp` và thông tin xác thực phải tiếp tục bị Git ignore. Database password không được ghi vào script, tài liệu có giá trị thật hoặc file môi trường của frontend.

## Giao diện lệnh

Các lệnh Cloud DEV dùng target `--linked` rõ ràng:

- `db:dev:status`: so sánh migration local và DEV.
- `db:dev:dry-run`: hiển thị migration sẽ áp dụng mà không thay đổi DEV.
- `db:dev:push`: chỉ áp migration tiến tới.
- `db:dev:test`: chạy pgTAP trên DEV.
- `db:dev:types`: sinh `shared/types/database.types.ts` từ DEV.

Luồng chuẩn:

1. Tạo migration bằng `supabase migration new <descriptive_name>`.
2. Review SQL và test tĩnh/unit test trên máy.
3. Chạy `db:dev:status`.
4. Chạy `db:dev:dry-run`.
5. Chạy `db:dev:push`.
6. Chạy `db:dev:test` và `db:dev:types`.
7. Chạy unit, typecheck, lint và production build.

Không tạo bất kỳ script nào thực thi `db reset --linked`, remote seed hoặc `db push --include-seed`. Các lệnh `supabase:start`, `supabase:stop` và `db:local:*` có thể được giữ với nhãn CI/fallback, nhưng không còn nằm trong hướng dẫn phát triển hằng ngày.

## Dữ liệu Cloud DEV

### Schema

Migration `20260814000100_create_tenancy_foundation.sql` là nguồn chuẩn cho năm bảng tenancy, enum, indexes, helper functions, grants, RLS và policies. Nó được dry-run trước rồi push lên DEV.

### Dữ liệu nền VQH

Tạo một migration mới bằng Supabase CLI. Migration này chỉ insert idempotent hai record có ID ổn định đang được code/test sử dụng:

- Tenant `10000000-0000-4000-8000-000000000010`, code `vqh`.
- Company `10000000-0000-4000-8000-000000000020`, code `VQH`, thuộc tenant VQH.

Migration không insert vào `auth.users`, `tenant_memberships` hoặc `company_memberships`. Nó cũng không tạo tenant/company isolation.

### Tài khoản DEV và membership

Tài khoản đăng nhập DEV phải được tạo bằng Supabase Auth để có identity và credential hợp lệ. Sau khi có user, một SQL onboarding riêng nhận user UUID hoặc email đã xác minh và insert idempotent:

- `tenant_memberships` với role `tenant_admin` cho tenant VQH.
- `company_memberships` với role `director` cho company VQH.

Onboarding không phải migration vì user ID khác nhau giữa DEV và Production. Tài liệu cung cấp câu SQL mẫu có placeholder; người vận hành thay placeholder và chạy một lần trong SQL Editor bằng quyền quản trị. Không commit email thật hoặc user UUID.

### Seed local

`supabase/seed.sql` tiếp tục là fixture cho CI/fallback local. Nó không được triển khai lên Cloud. Contract tests phải chặn cả chuỗi chính xác lẫn biến thể remote reset/seed có thêm flags hoặc alias mới.

## pgTAP trên Cloud DEV

Các test schema chỉ đọc catalog nên có thể chạy trực tiếp trên DEV.

Test RLS hiện phụ thuộc các row trong `seed.sql`. Test sẽ được đổi để tự tạo user, tenant, company và membership fixture ở đầu transaction. Mọi assertion vẫn chạy dưới `authenticated` với JWT claims giả lập; `rollback` ở cuối test đảm bảo Cloud DEV không giữ fixture hoặc dữ liệu isolation.

Mỗi file test phải:

- Bắt đầu bằng `begin`.
- Tạo đúng fixture tối thiểu cần thiết và dùng ID dành riêng cho test.
- Không phụ thuộc dữ liệu VQH thật ngoài schema contract.
- Kết thúc bằng `rollback`, kể cả luồng assertion bình thường.

Không chạy remote pgTAP nếu test file mới thiếu transaction wrapper hoặc có thao tác không rollback được.

## Xử lý lỗi và hàng rào an toàn

- Nếu `.env.local` thiếu URL/key, ứng dụng phải báo lỗi cấu hình rõ ràng thay vì âm thầm trỏ về localhost.
- Nếu CLI chưa link hoặc link sai project, dừng trước `db:dev:push`; runbook yêu cầu đối chiếu project ref từ output/status.
- Nếu `db:dev:dry-run` hiển thị migration ngoài dự kiến, không push và xử lý migration history trước.
- Nếu remote migration history không khớp, chỉ chẩn đoán bằng `migration list`; không tự động chạy `migration repair`.
- Nếu push thất bại giữa chừng, kiểm tra migration history và trạng thái schema trước khi thử lại.
- Không reset Cloud DEV, không push seed, không copy dữ liệu Auth nội bộ từ Docker.
- Không dùng service-role key ở frontend. Public key chỉ cho phép truy cập trong phạm vi grants và RLS đã kiểm chứng.

## Kiểm thử và tiêu chí hoàn thành

Thay đổi hoàn thành khi:

- `.env.local` tồn tại với placeholder trống, bị Git ignore và không được stage.
- `.env.example`, README và runbook mô tả Cloud DEV là môi trường local-app mặc định.
- Contract tests xác nhận `pnpm dev` đọc `.env.local`, các script DEV dùng `--linked`, và không có remote reset/seed dưới bất kỳ alias hoặc biến thể flags nào.
- Migration bootstrap chỉ tạo tenant/company VQH và idempotent.
- pgTAP tự tạo fixture trong transaction và rollback; không phụ thuộc Cloud seed.
- Sau khi người dùng điền biến và link project: status, dry-run, push, pgTAP và type generation trên DEV đều thành công.
- Generated types không tạo diff ngoài dự kiến.
- Unit tests, typecheck, lint và production build đều thành công mà không khởi động Docker trên máy.
- Cloud DEV có đúng schema tenancy, tenant/company VQH, không có tenant isolation và không có user `.local`.
- Sau khi tạo user DEV thật và chạy onboarding, user đó đọc được tenant/company VQH qua RLS; một user không có membership không đọc được dữ liệu VQH.

## Trình tự triển khai có điểm dừng

1. Cập nhật file mẫu, scripts, tests, migration bootstrap và tài liệu mà chưa kết nối Cloud.
2. Tạo `.env.local` bị ignore với hai biến trống.
3. Dừng để người dùng điền URL/key, đăng nhập Supabase CLI và cung cấp/chọn project DEV khi được nhắc.
4. Xác minh link và chạy status/dry-run; chỉ push sau khi target đúng.
5. Chạy kiểm chứng Cloud DEV, tạo tài khoản Auth thật và onboarding membership.
6. Kiểm tra Git không chứa secret hoặc link state rồi commit các thay đổi có thể version-control.
