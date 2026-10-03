# HR manual email invitations (DEV pilot)

HR prepares an invitation in Taskovia, copies the email, and sends it privately from their own Gmail. Taskovia does not send the email or claim delivery. No Gmail OAuth or SMTP setup is required for this pilot.

## Application flow

- Both `account.invite` and `employee.create` are required. The tenant and company come from the verified user context, not the form body.
- `GET /api/companies/:companyId/employee-invitations/options` lists active scoped departments/positions through the user's RLS client.
- `POST /api/companies/:companyId/employee-invitations/manual` prepares the invitation. The original automatic email API remains separate.
- The Admin adapter inspects the normalized email, rejects activated/disabled identities, and rejects pending identities without a matching server-written `app_metadata.taskovia_manual_invitation` tenant/company marker. User-editable `user_metadata` is never ownership proof.
- For a new email, Admin `createUser` creates an unconfirmed identity and its server ownership marker in one transaction; duplicate/competing emails fail closed. Then `generateLink(type: invite)` creates the link. Neither operation sends email or issues recovery/magic links.
- The existing user-token onboarding RPC creates the active memberships, employee/private shell, and base employee role. Additional roles are not part of the invitation form.
- A pending employee must have matching code/email and must not be terminated. The forward guard migration also rejects terminated employees inside the locked RPC transaction, rolling back membership changes.
- Recheck the pending Auth identity after onboarding before returning the email. The callback is built from configured app origin and `hashed_token`, using `type=invite`. Do not forward the provider `action_link`.
- The recipient verifies the invite and sets their own 8–72 character password. The shared password-setting schema also serves recovery; this patch changes its bounds only. Forgot-password routes, email requests, and routing are unchanged.

## Sensitive handoff

The API response is `Cache-Control: no-store`. The UI holds the prepared email in component memory only and clears it on close, navigation, company change, or loss of invitation permissions. Copying requires an explicit HR click. It never places the token in a Gmail compose URL, logs, analytics, or browser storage. Clipboard and the email HR sends contain a bearer credential; HR must verify the recipient and avoid groups/forwarding.

The status is “Đã chuẩn bị · Chưa xác nhận gửi”. It is not evidence of email delivery or account activation. Supabase controls link expiry; the 15-minute browser recovery marker is not the email link lifetime.

## Retry and limitations

Auth creation with ownership, link generation, and database onboarding are separate transactions. Failed link generation or onboarding leaves an owned unconfirmed draft/pending identity; retry the same company/email/code. An owned draft without invited_at can generate a link, but no credential is returned until invited_at and onboarding are verified. Unknown creation outcomes require retry inspection; unmarked identities remain ineligible. No Auth user is automatically deleted.

Pending invitations from older flows without the marker are intentionally rejected. Activated existing accounts are not reset or linked through this form. Reissuing never generates recovery/magic links. Forgot-password support and recovery delivery are outside this pilot.

The endpoint has an instance-local 5-per-minute actor/company throttle and serializes concurrent preparations for the same email in the same server process. These are not distributed locks. Ownership is atomic with new Auth creation, including against competing legacy invitations. Reissue ordering across instances and activation during onboarding remain non-atomic. Keep the pilot on one instance; final identity checks fail closed before credential release, but Auth and onboarding do not share a transaction. Do not promise that a new invite invalidates all previous links without provider verification.

## Deployment prerequisites (not applied by this patch)

1. Apply `20261003074553_hr_manual_invitation_terminated_guard.sql` only with separate Cloud DEV migration authorization and verification. Do not release pending reissue without this guard.
2. Configure the server-only service-role key via secure runtime settings. The inspected dev-preview environment lacked it. Never put it in public config, the browser, source, or this runbook.
3. Set the canonical HTTPS preview application origin and authorize its exact `/auth/callback` in Cloud DEV.
4. Separately authorize and set hosted Cloud DEV `password_min_length=8`. This policy affects all password creation/change operations in that project, including recovery. The committed config alone does not change hosted Auth. The patch does not change Production.
5. Live invitation/account creation and provider link-expiry/reissue testing need separately approved test recipients and mutations. Current verification uses mocked provider responses and static migration checks only.
