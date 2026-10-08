# Review đợt 2 — T4 đơn mua và hồ sơ PDF

Trạng thái: SOURCE READY. T4 đã sửa/review/tích hợp; chưa chạy SQL, Storage hay Cloud DEV.
Source SHA đã kiểm tra: `dd8e087c8e19389666ef38169ea9936922dda4f4`. Git `codex/site-engineer-material-request`; InstaCloud `site-engineer-material-request`.

| Phần | Commit | Review/kết quả |
|---|---|---|
| T4 implementation | `add02b4` | Đơn/phân bổ, PDF, đối chiếu số lượng, hủy unsigned order |
| Fix 1 | `0e824a4` | Lazy service role, base material.read, namespace/validation/replay trực tiếp |
| Fix 2 | `1f0124d` | Production factory regression; API reviewer GPT-6 Sol high READY, độc lập 4/4 |
| Fix 3 | `b7d3647` | Đóng workflow array/generic finalizer bypass, max-version overflow; DB reviewer GPT-6 Sol high READY |
| T5 UI | AGY đang làm theo người dùng xác nhận | Chưa nhận diff, chưa review/tích hợp UI |

Worker T4 ban đầu dùng GPT-5.6 Sol ultra; các worker/review mới từ chỉ dẫn tiếp theo dùng GPT-6 Sol high.

## Findings đã đóng ở source

- Service-role capability trước auth: chuyển lazy, chỉ khởi tạo sau user-bound target lookup và byte verification; normal/unauth/bad-hash paths không khởi tạo.
- Financial precheck thiếu material.read: thiếu base hoặc financial permission bị chặn trước repo.
- Material PDF lọt vào generic cost quyền đọc/upload/metadata/link: namespace riêng, legacy rows giữ hành vi cũ.
- Workflow contract-version evidence arrays mở đường generic signed URL: common validator từ chối material IDs và common read helper ưu tiên material financial boundary, không fallthrough.
- Generic cost finalizer bỏ qua material target eligibility: common private finalizer từ chối material trước receipt/replay.
- Finalize full replay đổi verified fields: exact full hoặc expectedVersion-only replay hợp lệ; partial input invalid, changed canonical hash conflict.
- JSON null/unbounded số và max bigint replay: validation có kiểu/null-safe/bounds; phép cộng không tràn.
- Test dùng fake route factory: bổ sung production factory/C1 auth/service/repo/SDK facade chain, mock network/H3, real blob verifier.

## Hành vi cung cấp

Tạo/list/read/cancel order với quyền mua hàng/financial-read đúng scope; 20 chia10+10 theo NCC, giữ reserved quantity đến audited cancellation. Buyer không sửa phiếu; order đã ký không hủy.
PDF unsigned gắn proposal+approved revision; signed quote/contract gắn order theo role bất biến. Upload authenticated vào private bucket, hash/MIME/size được server kiểm tra, read URL60 giây. Không kiểm chứng chữ ký số/nội dung PDF bằng AI.
Order trả current chosen supplierName và canonical material snapshots từ exact approved revision. Không lấy current proposal/master thay lịch sử. Chỉ hỗ trợ đồng tiền mặc định công ty trong tạo đơn, không FX.
recordContract còn unsupported, T6 sở hữu hợp đồng/cam kết/thực chi.

## Verification thật

- Focused **14 files /117 tests PASS**. Một filter cost-workflow-uploader không tồn tại nên không được tính là đã kiểm thử; full unit vẫn chạy toàn bộ suite.
- Full unit: **2616 passed /86 failed**, 13 failed files, exit1.
- Failure identities so với đợt1: 90/90, added0/removed0; chưa gọi full suite green.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: mỗi command exit0 trên source SHA trên.
- Không Cloud/DB/SQL compile/pgTAP/Storage/live browser/deploy/typegen/Production operation.

Các assertion SQL là source-only. T10 cần authorization cụ thể mới xác minh DDL/RLS/Storage/finalization/race thật.

## Bàn giao tiếp theo

T6 backend bắt đầu từ checkpoint này bằng GPT-6 Sol high. T7 prompt mua hàng đã soạn bản nháp, chỉ chốt SHA và bàn giao sau khi T5 UI đã review/tích hợp. T8 UI kế toán và UI báo cáo/thông báo cũng giao AGY qua prompt sau API review.
Task chưa hoàn thành toàn bộ. Parent dev-preview và công việc AGY được giữ nguyên.
