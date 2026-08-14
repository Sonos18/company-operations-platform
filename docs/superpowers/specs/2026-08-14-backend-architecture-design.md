# Thiết kế kiến trúc backend

**Ngày:** 2026-08-14

**Trạng thái:** Đã duyệt

**Phạm vi đầu tiên:** Đưa VQH vào vận hành production

**Định hướng:** Mở rộng thành nền tảng SaaS đa công ty sau khi VQH vận hành ổn định

## 1. Bối cảnh

Ứng dụng hiện là Nuxt 4 SPA dùng TypeScript strict. Dữ liệu prototype nằm trong browser local storage và được truy cập qua các repository contract cho company, project, drawing, task và media. Domain model đã mang `tenantId` và `companyId`, đồng thời có khái niệm deployment `shared` hoặc `dedicated`.

Backend cần giúp một lập trình viên đưa VQH vào sử dụng sớm, giữ chi phí vận hành thấp và không khóa đường phát triển thành SaaS nhiều công ty. Hiệu năng cực hạn chưa phải nút thắt; tốc độ phát triển, cách ly dữ liệu và khả năng thay đổi an toàn quan trọng hơn.

## 2. Mục tiêu

- Thay mock repository bằng HTTP repository mà không viết lại component và luồng UI.
- Cung cấp đăng nhập thật, membership theo tenant/company và phân quyền theo vai trò.
- Lưu dữ liệu nghiệp vụ trong PostgreSQL với cách ly tenant bắt buộc.
- Lưu bản vẽ, hồ sơ và hình ảnh trong private object storage.
- Có audit trail cho các thay đổi nghiệp vụ quan trọng.
- Giữ một codebase và một backend deploy trong giai đoạn VQH.
- Cho phép tách backend sang NestJS sau này mà không đổi domain hoặc API tùy tiện.

## 3. Ngoài phạm vi giai đoạn đầu

- Microservices, Kubernetes, Kafka và event sourcing.
- Go hoặc Rust cho request path chính.
- GraphQL và public developer API.
- Redis hoặc hàng đợi riêng khi chưa có background workload thực tế.
- Đồng bộ realtime cho toàn bộ dữ liệu.
- Dedicated deployment cho từng khách hàng ngay trong bản VQH đầu tiên.

## 4. Stack đã chọn

| Lớp | Công nghệ | Vai trò |
| --- | --- | --- |
| Runtime | Node.js 24, TypeScript strict | Cùng hệ sinh thái với frontend và phù hợp năng lực hiện tại |
| API/BFF | Nuxt 4 Nitro server routes | Một codebase, một deployment, endpoint HTTP rõ ràng |
| Validation | Zod | Kiểm tra request/response và tái sử dụng schema TypeScript |
| Database | Supabase PostgreSQL | Dữ liệu giao dịch, migration SQL và Row Level Security |
| Authentication | Supabase Auth | Đăng nhập, phát hành và làm mới phiên người dùng |
| Authorization | Membership + RBAC + PostgreSQL RLS | Kiểm tra quyền nghiệp vụ và chống rò dữ liệu chéo tenant |
| Data access | `@supabase/supabase-js` với type được generate | Truy cập database theo JWT người dùng để RLS luôn có hiệu lực |
| File giai đoạn VQH | Supabase Storage, private bucket | Ra mắt nhanh, policy cùng hệ thống Auth/RLS |
| File khi mở rộng | Cloudflare R2 phía sau storage interface | Lựa chọn khi dung lượng hoặc chi phí egress tạo lợi ích thực tế |
| Realtime | Supabase Realtime có chọn lọc | Chỉ dùng cho task/activity cần phản hồi trực tiếp |
| Logging | Structured JSON logging; Pino khi cần cấu hình nâng cao | Correlation ID và dữ liệu vận hành có thể truy vấn |
| Error monitoring | Sentry trước production | Theo dõi exception và regression phía client/server |
| Test | Vitest, Supabase local, Playwright | Unit, integration/RLS và end-to-end |

SQL migration do Supabase CLI quản lý và là nguồn sự thật duy nhất của schema. Giai đoạn đầu không thêm ORM; điều này tránh hai cơ chế migration và giữ RLS, trigger, function trong SQL một cách minh bạch.

## 5. Kiến trúc tổng thể

```text
Nuxt SPA
  -> HTTP repository implementations
  -> /api/* Nitro routes
  -> authentication and company-context middleware
  -> framework-neutral domain services
  -> Supabase client carrying the authenticated user's JWT
  -> PostgreSQL tables, policies, functions and audit triggers
  -> private Storage buckets / selected Realtime channels
```

Nitro route chỉ xử lý HTTP: parse input, gọi middleware và chuyển request sang domain service. Domain service chứa rule nghiệp vụ và phụ thuộc vào interface của repository/data gateway, không phụ thuộc trực tiếp vào `H3Event`. Cấu trúc này cho phép chuyển route/controller sang NestJS mà không viết lại logic nghiệp vụ.

Các module ban đầu:

- `auth`: đăng nhập, làm mới phiên và đăng xuất.
- `tenancy`: tenant, company, membership, active company và role.
- `companies`: cấu hình thương hiệu, phòng ban, thuật ngữ và workflow template.
- `projects`: project summary/detail và workflow snapshot.
- `journeys`: stage, step, record, activity và transition rule.
- `tasks`: danh sách công việc và cập nhật trạng thái.
- `drawings`: version, quan hệ giữa file, bản hiện hành và phê duyệt khách hàng.
- `media`: metadata ảnh mục tiêu, tiến độ và bằng chứng.
- `files`: storage provider, signed upload/read URL và kiểm tra quyền.
- `audit`: nhật ký append-only cho mutation quan trọng.

## 6. Tenant context và phân quyền

`tenantId` và `companyId` do server xác định từ membership của người dùng. Client có thể chọn `companyId`, nhưng không được tự khai báo `tenantId` đáng tin cậy. Middleware phải xác minh người dùng là thành viên của company rồi mới tạo request context.

Mọi bảng nghiệp vụ dùng chung phải có `tenant_id` và `company_id`, foreign key phù hợp và index bắt đầu bằng các cột scope thường dùng. Mỗi policy RLS kiểm tra membership của `auth.uid()` trước thao tác đọc hoặc ghi. Test cách ly tenant là điều kiện bắt buộc trước khi release.

RBAC xử lý quyền chi tiết như thay trạng thái task, phát hành bản vẽ hoặc phê duyệt hồ sơ. RLS xử lý invariant về phạm vi dữ liệu. Hai lớp bổ sung cho nhau; RBAC không thay thế RLS.

Supabase `service_role` bypass RLS hoàn toàn. Key này không được đưa vào browser hoặc client bundle và không được dùng trong request path thông thường. Nó chỉ dành cho migration, bootstrap hoặc tác vụ quản trị được cô lập và có audit.

Deployment `shared` dùng chung application/database với RLS. `dedicated` giữ cùng schema và API contract nhưng dùng deployment riêng cho khách hàng có yêu cầu pháp lý hoặc cách ly đặc biệt. Giai đoạn VQH bắt đầu ở chế độ `shared`; không xây cơ chế provisioning dedicated trước khi có khách hàng yêu cầu.

## 7. Phiên đăng nhập

Frontend đăng nhập bằng Supabase Auth. Access token được gửi dưới dạng Bearer token đến Nitro API; Nitro xác minh token và tạo authenticated Supabase client cho từng request. Refresh token được quản lý theo cơ chế session của Supabase và không bao giờ được ghi vào log.

Mọi route có dữ liệu nghiệp vụ đều yêu cầu authenticated context. Public route, nếu có, phải được khai báo tường minh. Secret và service-role key chỉ tồn tại trong server runtime configuration.

Trước production phải bật Content Security Policy phù hợp, HTTPS bắt buộc và scrub token/cookie khỏi error monitoring. Nếu threat model sau này yêu cầu không để access token trong Web Storage, auth adapter sẽ chuyển sang Secure HttpOnly cookie mà không đổi domain service hoặc API nghiệp vụ.

## 8. API và repository contract

HTTP API dùng JSON và endpoint theo resource hiện có, ví dụ:

```text
GET    /api/companies/current
GET    /api/companies/current/config
GET    /api/projects
GET    /api/projects/:projectId
GET    /api/tasks/mine
PATCH  /api/tasks/:taskId/status
GET    /api/stages/:stageId/drawings
POST   /api/stages/:stageId/drawings/versions
PATCH  /api/drawings/:fileId/current
PATCH  /api/drawings/:fileId/customer-approval
GET    /api/stages/:stageId/media
```

Frontend giữ nguyên `RepositoryRegistry`; plugin production cung cấp HTTP implementation thay cho mock implementation. Request và response được kiểm tra bằng Zod tại boundary. API trả stable error code để UI không phụ thuộc vào nội dung message.

Mutation có tính cạnh tranh như đặt bản vẽ hiện hành phải dùng transaction/database function và bảo đảm chỉ một version hiện hành trong mỗi drawing group. API hỗ trợ idempotency key cho upload finalization và các mutation có khả năng retry.

## 9. Luồng dữ liệu chính

### Đọc dữ liệu

1. UI gọi repository contract.
2. HTTP repository gọi Nitro endpoint với session hiện tại.
3. Auth middleware xác minh người dùng; tenancy middleware xác minh company membership.
4. Domain service áp dụng permission và rule nghiệp vụ.
5. Supabase client mang JWT người dùng truy vấn PostgreSQL; RLS giới hạn scope.
6. Response được map về domain type và kiểm tra trước khi trả UI.

### Ghi dữ liệu

1. Nitro kiểm tra payload bằng Zod và tạo correlation ID.
2. Domain service kiểm tra transition/permission.
3. Database transaction cập nhật record và audit event.
4. API trả representation mới hoặc `204` theo contract.
5. Realtime event chỉ phát cho module đã bật subscription.

### Upload file

1. Client gửi metadata dự kiến cho `/api/files/upload-intent`.
2. Server xác minh membership, quyền, MIME type và giới hạn kích thước.
3. Server trả signed upload URL ngắn hạn vào private bucket.
4. Client upload trực tiếp tới storage.
5. Client gọi finalize endpoint với idempotency key.
6. Server kiểm tra object tồn tại rồi ghi metadata và audit event trong database.

Object key có prefix tenant/company nhưng authorization không dựa riêng vào tên đường dẫn. Signed read URL chỉ được phát sau khi API kiểm tra quyền đối với metadata tương ứng.

## 10. Error handling

API dùng một envelope lỗi thống nhất:

```json
{
  "error": {
    "code": "TASK_STATUS_TRANSITION_INVALID",
    "message": "Không thể chuyển công việc sang trạng thái yêu cầu.",
    "requestId": "...",
    "details": {}
  }
}
```

- `400`: request sai cấu trúc hoặc rule nghiệp vụ không hợp lệ.
- `401`: chưa đăng nhập hoặc session hết hạn.
- `403`: đã đăng nhập nhưng không có membership/quyền.
- `404`: resource không tồn tại trong scope hiện tại; không tiết lộ resource của tenant khác.
- `409`: conflict phiên bản, idempotency hoặc trạng thái cạnh tranh.
- `429`: vượt rate limit.
- `500`: lỗi không dự kiến; message ra ngoài không chứa secret hoặc chi tiết database.

Log server chứa request ID, actor ID, tenant/company scope, route, latency và stable error code. Không log access token, refresh token, signed URL đầy đủ hoặc nội dung file.

## 11. Audit và quan sát hệ thống

Audit log là append-only và ghi tối thiểu: actor, tenant/company, action, resource type/id, thời gian, request ID và before/after summary đã loại dữ liệu nhạy cảm. Các thao tác bắt buộc audit gồm đổi trạng thái task, đổi stage, upload/phát hành bản vẽ, đặt bản hiện hành, phê duyệt khách hàng, đổi membership/role và thay cấu hình company.

Health endpoint kiểm tra application process; readiness check có thể kiểm tra database. Dashboard production theo dõi error rate, p95 latency, auth failure, database/storage failure và số mutation bị từ chối bởi permission hoặc conflict.

## 12. Kiểm thử

- Unit test domain service và permission rule bằng Vitest.
- Contract test bảo đảm HTTP repository tương thích với repository interface hiện tại.
- Integration test chạy trên Supabase local cho migration, function, trigger và storage policy.
- RLS test tạo ít nhất hai tenant và chứng minh không thể đọc, ghi hoặc suy đoán resource chéo tenant.
- Concurrency test cho bản vẽ hiện hành, workflow transition và idempotent upload finalization.
- Playwright kiểm tra login, project journey, task update, drawing upload và logout.
- Existing typecheck, lint, unit, E2E, accessibility và production build tiếp tục là release gate.

## 13. Triển khai và rollout

Giai đoạn VQH dùng một Nuxt Node deployment và một Supabase project production. Staging dùng Supabase project riêng; không dùng chung database hoặc storage bucket với production. Migration chạy theo thứ tự và phải có kế hoạch rollback/forward-fix trước khi deploy.

Rollout theo lát dọc:

1. Nền tảng: local Supabase, schema cơ sở, Auth, membership, RLS và audit.
2. Company/project read path: thay repository đọc mock bằng HTTP theo feature flag.
3. Task mutation và workflow rules.
4. Drawing/media private upload.
5. Realtime có chọn lọc, monitoring, backup/restore drill và production hardening.
6. Chuyển VQH khỏi local storage sau migration/seed được kiểm chứng.

Mock repository tiếp tục tồn tại cho demo và test cho đến khi mọi contract production tương ứng đã qua integration test.

## 14. Khi nào tách sang NestJS

Không tách chỉ vì số lượng người dùng tăng. Chỉ cân nhắc NestJS service riêng khi xuất hiện ít nhất một nhu cầu cụ thể:

- Mobile app, đối tác hoặc public API cần backend deploy độc lập.
- Background job, scheduler hoặc integration dài hạn vượt phạm vi hợp lý của Nitro deployment.
- Backend cần scale, release hoặc failure domain độc lập với frontend.
- Có thêm lập trình viên backend và module ownership cần ranh giới framework rõ hơn.
- Hạ tầng hiện tại gây giới hạn đo được về runtime, connection hoặc observability.

Khi tách, giữ nguyên domain service, Zod contract, SQL migration, Supabase Auth/PostgreSQL và storage interface. Nitro route được thay bằng NestJS controller/module; đây là thay đổi adapter, không phải viết lại sản phẩm.

## 15. Tiêu chí thành công

- Người dùng VQH đăng nhập và chỉ thấy dữ liệu company được cấp quyền.
- Không có đường request thông thường nào dùng service-role để truy vấn dữ liệu người dùng.
- Repository HTTP vượt cùng contract test với mock repository.
- RLS test chéo tenant vượt trên local và staging.
- Task, drawing và workflow mutation có audit record cùng request ID.
- Upload thật dùng private storage và signed URL ngắn hạn.
- Có thể deploy/rollback application và migration theo quy trình được ghi lại.
- Kiến trúc phục vụ VQH mà không cần Go, Rust, microservices hoặc hạ tầng tự quản bổ sung.
