# HR manual email invitations (DEV pilot)

HR prepares an invitation in Taskovia, copies the email, and sends it privately from their own Gmail. Taskovia does not send the email or claim delivery. No Gmail OAuth or SMTP setup is required for this pilot.

## Application flow

- Both `account.invite` and `employee.create` are required. The tenant and company come from the verified user context, not the form body.
- `GET /api/companies/:companyId/employee-invitations/options` lists active scoped departments/positions through the user's RLS client.
- `POST /api/companies/:companyId/employee-invitations/manual` prepares the invitation. The original automatic email API remains separate.
- The Admin adapter inspects the normalized email, rejects activated/disabled identities, and rejects pending identities without a matching server-written `app_metadata.taskovia_manual_invitation` tenant/company marker. User-editable `user_metadata` is never ownership proof.
- For a new email, Admin `createUser` creates an unconfirmed identity and its server ownership marker in one transaction; duplicate/competing emails fail closed. Then `generateLink(type: invite)` creates the link. Neither operation sends email or issues recovery/magic links.
- The existing user-token onboarding RPC creates the active memberships, employee/private shell, and base employee role. Additional roles are not part of the invitation form.
- A pending employee must match the stored code, email, full name, department, position, and hire date, and must not be terminated. Omitted position/hire date match only stored null values. Reissue is not a profile edit: update the employee through the existing profile-edit flow, then reissue using the stored values. The forward guard migration also rejects terminated employees inside the locked RPC transaction, rolling back membership changes.
- Recheck the pending Auth identity after onboarding before returning the email. The callback is built from configured app origin and `hashed_token`, using `type=invite`. Do not forward the provider `action_link`.
- The recipient verifies the invite and sets their own 8–72 character password. The shared password-setting schema also serves recovery; this patch changes its bounds only. Forgot-password routes, email requests, and routing are unchanged.

## Sensitive handoff

The API response is `Cache-Control: no-store`. The UI holds the prepared email in component memory only and clears it on close, navigation, company change, or loss of invitation permissions. Copying requires an explicit HR click. It never places the token in a Gmail compose URL, logs, analytics, or browser storage. Clipboard and the email HR sends contain a bearer credential; HR must verify the recipient and avoid groups/forwarding.

The status is “Đã chuẩn bị · Chưa xác nhận gửi”. It is not evidence of email delivery or account activation. Supabase controls link expiry; the 15-minute browser recovery marker is not the email link lifetime.

## Retry and limitations

Auth creation with ownership, link generation, and database onboarding are separate transactions. Failed link generation or onboarding leaves an owned unconfirmed draft/pending identity; retry the same company/email/code. An owned draft without invited_at can generate a link, but no credential is returned until invited_at and onboarding are verified. Unknown creation outcomes require retry inspection; unmarked identities remain ineligible. No Auth user is automatically deleted.

Pending invitations from older flows without the marker are intentionally rejected. Activated existing accounts are not reset or linked through this form. Reissuing never generates recovery/magic links. Forgot-password support and recovery delivery are outside this pilot.

The endpoint has an instance-local 5-per-minute actor/company throttle and serializes concurrent preparations for the same email in the same server process. These are not distributed locks. Ownership is atomic with new Auth creation, including against competing legacy invitations. Reissue ordering across instances and activation during onboarding remain non-atomic. Keep the pilot on one instance; final identity checks fail closed before credential release, but Auth and onboarding do not share a transaction. Do not promise that a new invite invalidates all previous links without provider verification.

## Deployment prerequisites and hosted DEV evidence

1. Apply `20261003074553_hr_manual_invitation_terminated_guard.sql` only with separate Cloud DEV migration authorization and verification. Do not release pending reissue without this guard.
2. Configure the server-only service-role key via secure runtime settings. The inspected dev-preview environment lacked it. Never put it in public config, the browser, source, or this runbook.
3. Set the canonical HTTPS preview application origin and authorize its exact `/auth/callback` in Cloud DEV.
4. Hosted Cloud DEV `password_min_length=8` was separately authorized and set on 2026-10-03; a read-only check on 2026-10-04 at 13:47:02 UTC confirmed 8 with no composition rule on `gtgljlnhwvhqdnwrfdfj`. This applies to password creation/change and recovery in that project. Committed config alone does not change hosted Auth; Production remains a separate boundary.
5. Live invitation/account creation and provider link-expiry/reissue testing need separately approved test recipients and mutations. Provider verification uses mocked responses. The bounded synthetic Cloud DEV rollback rehearsal covers the HR database lifecycle and confirms zero retained fixtures; see [the runner checkpoint](../development/hr-invitation-runner-checkpoint.md). Multi-session concurrency and live provider expiry/reissue tests remain deferred.

## Reissue profile consistency release

Apply `20261004140132_hr_invitation_profile_guard.sql` only after separate Cloud DEV migration approval. It preserves onboarding permissions, tenant/role scope, and the terminated guard, while rejecting changed profile values under the existing employee row lock. It also makes the existing onboarding RPC reject mismatched existing profiles in the automatic flow; it does not update them.

The manual service checks the full stored profile before generating a pending reissue, checks the onboarding result, then rereads the scoped employee before releasing the credential. The greeting and recipient come from that persisted row. A preflight mismatch leaves the old link untouched. A concurrent change caught after generation returns no credential, although generation may already have rotated the previous link. Auth and database reads are separate transactions; edits after the last read remain possible.

The corrective migration requires the separately authorized guarded Cloud DEV apply. Unit, browser, and bounded synthetic rollback evidence support this release; multi-session concurrency coverage remains explicitly deferred.
