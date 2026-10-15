import { expect, test } from '@playwright/test'
import { createAuthTestState, createCompany, installAuthRoutes } from './fixtures/auth-routes'
import { installEmployeeRoutes } from './fixtures/employee-routes'
const departmentId = '10000000-0000-4000-8000-000000000201'
const token = '[REDACTED_SECRET]'
test.beforeEach(async ({ page }) => {
 await installAuthRoutes(page, createAuthTestState({ sessionCompanies: [createCompany({ permissions: ['employee.read_directory', 'employee.create', 'account.invite'] })] }))
 await installEmployeeRoutes(page)
 await page.route('**/employee-invitations/options', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ departments: [{ id: departmentId, code: 'HR', name: 'Nhân sự' }], positions: [] }) }))
})
test('HR copies a prepared invitation when SMTP is not configured', async ({ page, context }) => {
 await context.grantPermissions(['clipboard-read', 'clipboard-write'])
 let input: unknown
 const requests: string[] = []
 page.on('request', request => requests.push(request.url()))
 await page.route('**/employee-invitations/manual', route => {
  input = route.request().postDataJSON()
  return route.fulfill({ contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ status: 'prepared', delivery: 'manual', recipient: 'pilot@example.test', subject: 'Lời mời tham gia Taskovia', body: 'Mở link riêng: https://pilot.taskovia.test/auth/callback?token_hash=' + token + '&type=invite' }) })
 })
 await page.goto('/employees')
 await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click()
 await page.getByLabel('Mã nhân viên', { exact: true }).fill('PILOT-1')
 await page.getByLabel('Họ và tên', { exact: true }).fill('Pilot User')
 await page.getByLabel('Email nhận lời mời').fill('pilot@example.test')
 await page.getByLabel('Phòng ban nhân viên').selectOption(departmentId)
 await page.getByRole('button', { name: 'Gửi lời mời', exact: true }).click()
 await expect(page.getByText('Đã chuẩn bị · Chưa xác nhận gửi', { exact: true })).toBeVisible()
 expect(input).toMatchObject({ employeeCode: 'PILOT-1', workEmail: 'pilot@example.test', departmentId })
 await page.getByRole('button', { name: 'Sao chép lời mời', exact: true }).click()
 expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(token)
 expect(await page.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }))).not.toContain(token)
 expect(requests.some(url => url.includes(token) || url.includes('mail.google.com'))).toBe(false)
 await page.getByRole('button', { name: 'Đóng lời mời', exact: true }).click()
 await expect(page.getByLabel('Nội dung email', { exact: true })).toHaveCount(0)
})
test('HR sees a sent invitation without the link reaching the browser', async ({ page }) => {
 await page.route('**/employee-invitations/manual', route => route.fulfill({ contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ status: 'sent', recipient: 'pilot@example.test', subject: 'Lời mời tham gia Taskovia' }) }))
 await page.goto('/employees')
 await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click()
 await page.getByLabel('Mã nhân viên', { exact: true }).fill('PILOT-1')
 await page.getByLabel('Họ và tên', { exact: true }).fill('Pilot User')
 await page.getByLabel('Email nhận lời mời').fill('pilot@example.test')
 await page.getByLabel('Phòng ban nhân viên').selectOption(departmentId)
 await page.getByRole('button', { name: 'Gửi lời mời', exact: true }).click()
 await expect(page.getByText('Đã gửi email mời · Máy chủ email đã nhận', { exact: true })).toBeVisible()
 await expect(page.getByLabel('Người nhận', { exact: true })).toHaveValue('pilot@example.test')
 await expect(page.getByLabel('Nội dung email', { exact: true })).toHaveCount(0)
 await expect(page.getByRole('button', { name: 'Sao chép lời mời', exact: true })).toHaveCount(0)
})
test('HR falls back to copying when automatic sending fails', async ({ page }) => {
 await page.route('**/employee-invitations/manual', route => route.fulfill({ contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ status: 'prepared', delivery: 'failed', recipient: 'pilot@example.test', subject: 'Lời mời tham gia Taskovia', body: 'Mở link riêng: https://pilot.taskovia.test/auth/callback?token_hash=' + token + '&type=invite' }) }))
 await page.goto('/employees')
 await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click()
 await page.getByLabel('Mã nhân viên', { exact: true }).fill('PILOT-1')
 await page.getByLabel('Họ và tên', { exact: true }).fill('Pilot User')
 await page.getByLabel('Email nhận lời mời').fill('pilot@example.test')
 await page.getByLabel('Phòng ban nhân viên').selectOption(departmentId)
 await page.getByRole('button', { name: 'Gửi lời mời', exact: true }).click()
 await expect(page.getByRole('alert')).toHaveText('Không gửi được email tự động. Hãy sao chép và gửi thủ công cho đúng người nhận.')
 await expect(page.getByText('Đã chuẩn bị · Chưa xác nhận gửi', { exact: true })).toBeVisible()
 await expect(page.getByRole('button', { name: 'Sao chép lời mời', exact: true })).toBeVisible()
})
test('employees without both invitation permissions cannot open the form', async ({ page }) => {
 await installAuthRoutes(page, createAuthTestState({ sessionCompanies: [createCompany({ permissions: ['employee.read_directory'] })] }))
 await page.goto('/employees')
 await expect(page.getByRole('heading', { name: 'Nhân sự', exact: true })).toBeVisible()
 await expect(page.getByRole('button', { name: 'Mời nhân viên', exact: true })).toHaveCount(0)
})
