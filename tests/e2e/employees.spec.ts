import { expect, test, type Page } from './fixtures/authenticated'

function employeeRows(page: Page) {
  return page.getByTestId('employee-table').locator('tbody tr[data-slot="tr"]')
}

function employeeTable(page: Page) {
  return page.getByTestId('employee-table')
}

const approvedEmployees = [
  { name: 'Như', email: 'nhu@vqh.local', department: 'Phòng Nhân sự' },
  { name: 'Long', email: 'long@vqh.local', department: 'Phòng Kỹ thuật' },
  { name: 'Hiếu', email: 'hieu@vqh.local', department: 'Phòng Kỹ thuật' },
  { name: 'Y', email: 'y@vqh.local', department: 'Phòng Kế toán' },
  { name: 'Nhi', email: 'nhi@vqh.local', department: 'Phòng Thiết kế' },
  { name: 'Hậu', email: 'hau@vqh.local', department: 'Phòng Thiết kế' },
]

async function focusWithTab(page: Page, target: ReturnType<Page['getByRole']>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate(element => element === document.activeElement)) return
  }
  throw new Error('Expected control was not reachable with Tab')
}

test.describe('employee directory', () => {
  test('lists the approved employee directory and active roles', async ({ page }) => {
    await page.goto('/employees')

    await expect(page.getByRole('heading', { name: 'Nhân sự' })).toBeVisible()
    await expect(employeeRows(page)).toHaveCount(approvedEmployees.length)
    for (const employee of approvedEmployees) {
      const row = employeeRows(page).filter({ has: page.getByText(employee.name, { exact: true }) })
      await expect(row).toHaveCount(1)
      await expect(row).toContainText(employee.email)
      await expect(row).toContainText(employee.department)
    }

    for (const role of ['Nhân viên', 'Quản lý nhân sự', 'Thu mua', 'Kiểm kê kho']) {
      await expect(employeeRows(page).filter({ hasText: 'Như' }).getByText(role, { exact: true })).toBeVisible()
    }

    for (const name of ['Long', 'Hiếu']) {
      await expect(employeeRows(page).filter({ hasText: name }).getByText('Nhân viên kỹ thuật', { exact: true })).toBeVisible()
    }
    for (const name of ['Nhi', 'Hậu']) {
      await expect(employeeRows(page).filter({ hasText: name }).getByText('Nhân viên thiết kế', { exact: true })).toBeVisible()
    }

    await expect(employeeTable(page).getByText('Hồ sơ chưa đầy đủ', { exact: true })).toHaveCount(6)

    await expect(page.getByRole('button', { name: /mời|thêm|chỉnh sửa|phân quyền/i })).toHaveCount(0)
  })

  test('filters employees by search, department, and status', async ({ page }) => {
    await page.goto('/employees')

    await page.getByRole('searchbox', { name: 'Tìm nhân sự' }).fill('Hiếu')
    await expect(employeeRows(page)).toHaveCount(1)
    await expect(employeeRows(page)).toContainText('Hiếu')

    await page.getByRole('searchbox', { name: 'Tìm nhân sự' }).fill('')
    await page.getByRole('combobox', { name: 'Phòng ban' }).click()
    await page.getByRole('option', { name: 'Phòng Thiết kế', exact: true }).click()
    await expect(employeeRows(page)).toHaveCount(2)
    await expect(employeeRows(page)).toContainText(['Nhi', 'Hậu'])

    await page.getByRole('combobox', { name: 'Phòng ban' }).click()
    await page.getByRole('option', { name: 'Tất cả phòng ban', exact: true }).click()
    await page.getByRole('combobox', { name: 'Trạng thái' }).click()
    await page.getByRole('option', { name: 'Đang làm việc', exact: true }).click()
    await expect(employeeRows(page)).toHaveCount(6)

    await page.getByRole('searchbox', { name: 'Tìm nhân sự' }).fill('không tồn tại')
    await expect(page.getByText('Không tìm thấy nhân sự phù hợp.', { exact: true })).toBeVisible()
  })

  test('reaches and operates directory filters with the keyboard', async ({ page }) => {
    await page.goto('/projects')
    await page.getByRole('link', { name: 'Nhân sự', exact: true }).click()
    await expect(page).toHaveURL(/\/employees$/)

    const search = page.getByRole('searchbox', { name: 'Tìm nhân sự' })
    const department = page.getByRole('combobox', { name: 'Phòng ban' })
    const status = page.getByRole('combobox', { name: 'Trạng thái' })

    await focusWithTab(page, search)
    await expect(search).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(department).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(status).toBeFocused()

    await page.keyboard.press('Enter')
    const activeStatus = page.getByRole('option', { name: 'Đang làm việc', exact: true })
    await expect(activeStatus).toBeVisible()
    await activeStatus.press('Enter')
    await expect(status).toContainText('Đang làm việc')
    await expect(employeeRows(page)).toHaveCount(6)
  })
})
