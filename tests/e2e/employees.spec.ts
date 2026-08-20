import { expect, test, type Page } from '@playwright/test'

function employeeRows(page: Page) {
  return page.getByTestId('employee-table').locator('tbody tr[data-slot="tr"]')
}

function employeeTable(page: Page) {
  return page.getByTestId('employee-table')
}

test.describe('employee directory', () => {
  test('lists the approved employee directory and active roles', async ({ page }) => {
    await page.goto('/employees')

    await expect(page.getByRole('heading', { name: 'Nhân sự' })).toBeVisible()
    await expect(employeeTable(page).getByText('Như', { exact: true })).toBeVisible()
    await expect(employeeRows(page).filter({ hasText: 'Như' }).getByText('nhu@vqh.local', { exact: true })).toHaveCount(2)

    for (const role of ['Nhân viên', 'Quản lý nhân sự', 'Thu mua', 'Kiểm kê kho']) {
      await expect(employeeRows(page).filter({ hasText: 'Như' }).getByText(role, { exact: true })).toBeVisible()
    }

    for (const name of ['Long', 'Hiếu']) {
      await expect(employeeRows(page).filter({ hasText: name }).getByText('Nhân viên kỹ thuật', { exact: true })).toBeVisible()
    }
    for (const name of ['Nhi', 'Hậu']) {
      await expect(employeeRows(page).filter({ hasText: name }).getByText('Nhân viên thiết kế', { exact: true })).toBeVisible()
    }

    for (const name of ['Long', 'Hiếu', 'Nhi', 'Hậu', 'Y']) {
      await expect(employeeTable(page).getByText(name, { exact: true })).toBeVisible()
    }
    await expect(employeeTable(page).getByText('Phòng Kỹ thuật', { exact: true })).toHaveCount(2)
    await expect(employeeTable(page).getByText('Phòng Thiết kế', { exact: true })).toHaveCount(2)
    await expect(employeeTable(page).getByText('Phòng Kế toán', { exact: true })).toHaveCount(1)
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

  test('links to the directory from the sidebar and supports keyboard filtering', async ({ page }) => {
    await page.goto('/projects')
    await page.getByRole('link', { name: 'Nhân sự', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/employees$/)

    const search = page.getByRole('searchbox', { name: 'Tìm nhân sự' })
    await search.focus()
    await page.keyboard.type('Long')
    await expect(employeeRows(page)).toHaveCount(1)
  })
})
