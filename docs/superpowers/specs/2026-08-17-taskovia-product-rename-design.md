# Thiết kế đổi tên sản phẩm thành TASKOVIA

**Ngày:** 2026-08-17

**Trạng thái:** Đã duyệt thiết kế hội thoại, chờ duyệt spec

**Phạm vi:** Nhận diện tên sản phẩm trong codebase hiện tại

## Bối cảnh

Repository hiện dùng tên kỹ thuật `company-operations-platform` và tiêu đề “Company Operations Platform”, trong khi giao diện header lấy tên công ty đang hoạt động làm nhận diện chính. Cách hiển thị này khiến thương hiệu nền tảng và danh tính tenant/company bị trộn lẫn.

Sản phẩm được chốt tên **TASKOVIA** và phải dùng tên này xuyên suốt các bề mặt nhận diện đang hoạt động. `Taskora` không tồn tại trong source hiện tại; mọi kiểm tra hồi quy vẫn phải bảo đảm tên đó không được đưa vào khi đổi thương hiệu.

## Mục tiêu

- Dùng **TASKOVIA** làm tên sản phẩm duy nhất trong giao diện, metadata và tài liệu hiện hành.
- Tách rõ thương hiệu sản phẩm khỏi tenant/company đang được chọn.
- Tạo một nguồn cấu hình nhận diện dùng chung cho code runtime.
- Đổi namespace dữ liệu prototype sang `taskovia` mà không làm mất dữ liệu browser hợp lệ đang có.
- Không thay đổi màu sắc, layout, phân quyền, dữ liệu công ty hoặc business logic.

## Không thuộc phạm vi

- Không đổi tên tenant/company Việt Quốc Huy, code `VQH`, ID hoặc fixture nghiệp vụ.
- Không sửa lịch sử migration Supabase đã áp dụng.
- Không viết lại các design spec và implementation plan lịch sử chỉ để thay tên.
- Không đổi tên thư mục workspace, remote repository, Supabase project hoặc Vercel project.
- Không triển khai trang đăng nhập trong thay đổi này; trang đăng nhập tương lai sẽ dùng cấu hình TASKOVIA.
- Không refactor color theme theo palette tham khảo trong tài liệu đính kèm. Theme là một task độc lập, bắt đầu bằng audit riêng.

## Quyết định thiết kế

### 1. Ranh giới thương hiệu

TASKOVIA là thương hiệu của nền tảng. Công ty là workspace nghiệp vụ mà người dùng đang truy cập.

Header luôn hiển thị:

- Nhận diện chính: `TASKOVIA` và monogram `TV`.
- Ngữ cảnh phụ: tên đầy đủ của công ty đang hoạt động.

Khi chưa tải được company context, TASKOVIA vẫn hiển thị ổn định và dòng phụ dùng trạng thái “Đang tải công ty”. Việc thu gọn header chỉ ẩn phần chữ như hiện tại; monogram `TV` vẫn còn để giữ nhận diện sản phẩm.

### 2. Nguồn cấu hình runtime

Tạo một module nhận diện dùng chung trong `shared/constants/product-brand.ts`. Module xuất một object bất biến chứa tối thiểu:

```ts
export const PRODUCT_BRAND = {
  name: 'TASKOVIA',
  mark: 'TV',
  tagline: 'Nền tảng vận hành đa công ty',
  description: 'Nền tảng quản trị công việc và hành trình dự án cho nhiều công ty.',
  storageNamespace: 'taskovia',
} as const
```

Nuxt metadata và các component giao diện phải đọc tên, monogram, tagline và description từ module này thay vì lặp chuỗi trong nhiều file. `package.json` và README không thể import module runtime, nên test contract sẽ kiểm tra chúng khớp với tên chuẩn.

### 3. Metadata và tài liệu hiện hành

- Đổi package name từ `company-operations-platform` thành `taskovia`.
- Đổi README heading thành `# TASKOVIA` và mô tả mở đầu thành nền tảng vận hành đa công ty, không mô tả VQH như thương hiệu sản phẩm.
- Đổi document title thành `TASKOVIA — Nền tảng vận hành đa công ty`.
- Đổi meta description thành mô tả trung tính cho nền tảng đa công ty.
- Giữ nguyên `theme-color` trong task đổi tên; thay đổi màu thuộc theme refactor riêng.

Trong phạm vi đổi tên này, README là tài liệu hiện hành duy nhất cần đổi nhận diện sản phẩm. Các tài liệu triển khai đề cập VQH với vai trò tenant bootstrap, dữ liệu DEV hoặc phạm vi rollout vẫn giữ nguyên. Tài liệu lịch sử trong `docs/superpowers/specs` và `docs/superpowers/plans` không bị thay hàng loạt.

### 4. Namespace local storage

Khóa canonical mới có dạng:

```text
taskovia:tenant-vqh:company-vqh:prototype:v1
```

`BrowserStateStore` thực hiện migration một lần:

1. Đọc khóa TASKOVIA trước.
2. Nếu chưa có, đọc khóa legacy `company-operations-platform:tenant-vqh:company-vqh:prototype:v1`.
3. Nếu dữ liệu legacy parse và validate thành công, ghi sang khóa TASKOVIA; chỉ xóa khóa legacy sau khi thao tác ghi mới thành công.
4. Nếu dữ liệu legacy không hợp lệ, bỏ qua và nạp fixture mặc định theo cơ chế hiện tại.

`clear()` xóa cả khóa canonical lẫn khóa legacy để hành vi “Khôi phục dữ liệu mẫu” không làm dữ liệu cũ xuất hiện lại. Migration chỉ áp dụng cho dữ liệu prototype trong browser, không đụng tới Supabase hoặc dữ liệu tenant production.

### 5. Phân tách product và company trong component

`default.vue` tiếp tục tải company config qua repository. `AppHeader.vue` nhận product brand riêng với company context, thay vì dùng `shortName` của company để tạo brand mark.

Luồng dữ liệu:

```text
PRODUCT_BRAND ────────────────> AppHeader product name/mark
CompanyRepository.getConfig() ─> AppHeader company context
```

Việc chọn company, membership và role không thay đổi. TASKOVIA không được ghi vào tenant/company record và VQH không được dùng làm tên sản phẩm.

## Xử lý lỗi và trạng thái biên

- Company config đang tải: hiển thị TASKOVIA và “Đang tải công ty”.
- Company config thiếu `shortName`: không ảnh hưởng monogram vì monogram luôn lấy từ `PRODUCT_BRAND.mark`.
- Dữ liệu local storage cũ không hợp lệ: không migrate; dùng fixture mặc định.
- Dữ liệu local storage mới hợp lệ: không đọc hoặc ghi đè từ khóa legacy.
- Không thay đổi hành vi reset prototype, route hiện tại hoặc trạng thái thu gọn navigation.

## Accessibility

- Link thương hiệu có accessible name chứa TASKOVIA và vẫn mô tả đúng đích đến.
- Monogram `TV` là trang trí khi tên TASKOVIA đã có trong accessible name.
- Việc thu gọn header không làm mất tên truy cập của link hoặc nút điều hướng.
- Không thay đổi màu nên contrast được kiểm tra lại trong task theme riêng, không trộn vào phạm vi đổi tên.

## Kiểm thử

### Unit/contract

- `PRODUCT_BRAND` chứa đúng `TASKOVIA`, `TV`, tagline và namespace.
- `package.json`, README và Nuxt metadata khớp tên chuẩn.
- Không có chuỗi `Taskora` trong `app`, `server`, `shared`, `package.json`, `nuxt.config.ts` hoặc README. Tài liệu spec này được loại khỏi phép kiểm tra vì cần ghi lại quyết định loại bỏ tên cũ.
- Header hiển thị TASKOVIA độc lập với tên công ty.
- Header thu gọn vẫn giữ monogram `TV` và accessible name.
- State store ưu tiên khóa mới, migrate dữ liệu legacy hợp lệ, chỉ xóa khóa cũ sau khi ghi thành công, bỏ qua dữ liệu legacy lỗi và xóa cả hai khóa khi reset.

### Regression

- Chạy unit test, typecheck, lint và build.
- Chạy các E2E đại diện cho app shell trên desktop và mobile.
- Xác nhận tên công ty VQH vẫn xuất hiện như company context tại các màn hình cần thiết.
- Xác nhận không có thay đổi tới migration, RLS, membership hoặc role.

## File dự kiến thay đổi

- `shared/constants/product-brand.ts` — nguồn nhận diện runtime.
- `package.json` — package name.
- `nuxt.config.ts` — title và meta description.
- `README.md` — tên và mô tả sản phẩm hiện hành.
- `app/layouts/default.vue` — truyền product brand và company context riêng.
- `app/components/app/AppHeader.vue` — hiển thị TASKOVIA/TV.
- `app/repositories/mock/state-store.ts` — namespace mới và migration legacy.
- Các unit/E2E test liên quan tới brand, header và state store.

Không có file migration Supabase nào thuộc danh sách thay đổi.

## Tiêu chí hoàn thành

1. TASKOVIA là tên sản phẩm duy nhất trên mọi bề mặt đang hoạt động trong phạm vi codebase.
2. Không còn nhận diện sản phẩm “Company Operations Platform” ở package, README hoặc metadata.
3. Không có chuỗi `Taskora` trong source đang hoạt động.
4. Header luôn phân biệt TASKOVIA với company context.
5. Dữ liệu VQH, tenant IDs, company IDs, role và RLS không thay đổi.
6. Dữ liệu prototype hợp lệ ở namespace cũ được migrate an toàn.
7. Unit test, typecheck, lint, build và E2E app shell liên quan đều vượt qua.
