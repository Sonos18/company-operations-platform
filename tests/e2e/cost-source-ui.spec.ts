import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures/authenticated'

const projectId = '10000000-0000-4000-8000-000000000030'
const figureId = '10000000-0000-4000-8000-000000000040'

test('renders synthetic source data, preserves decimal text, and restores focus after provenance closes', async ({ page }) => {
  const costRequests: string[] = []
  page.on('request', request => { if (request.url().includes('/cost-sources')) costRequests.push(request.url()) })
  await page.route('**/api/companies/**/cost-sources', route => route.fulfill({ json: {
    projects: [{ project: { id: projectId, code: 'P-1', name: 'Dự án tổng hợp' }, engagements: [], sourceCount: 1, figureCount: 1, latestObservedAt: '2026-09-14T00:00:00.000Z', openIssueCount: 1, mappingState: 'pending' }],
    unassigned: { sourceCount: 0, figureCount: 0, latestObservedAt: null }, sourceCount: 1, figureCount: 1, openIssueCount: 1,
  } }))
  await page.route('**/api/companies/**/cost-sources/projects/**', route => route.fulfill({ json: { project: { id: projectId, code: 'P-1', name: 'Dự án tổng hợp' }, engagements: [{ engagement: { id: '10000000-0000-4000-8000-000000000031', code: 'E-1', name: 'Nhà thầu tổng hợp' }, contractor: { id: '10000000-0000-4000-8000-000000000032', code: 'C-1', displayName: 'Nhà thầu mẫu' }, figureCount: 1, latestObservedAt: '2026-09-14T00:00:00.000Z' }] } }))
  await page.route('**/api/companies/**/cost-sources/projects/**/figures**', route => route.fulfill({ json: { items: [{ id: figureId, label: 'Giá trị nguồn', rawValueText: '1,234.5600', valueState: 'known', amountText: '1234.5600', currencyCode: null, basis: 'gross', scopeKind: 'whole_project', scopeDescription: 'Nguồn tổng hợp', confirmation: 'unverified', observedAt: '2026-09-14T00:00:00.000Z', mapping: { state: 'pending', projectId, engagementId: '10000000-0000-4000-8000-000000000031', contractorId: '10000000-0000-4000-8000-000000000032' }, source: { id: '10000000-0000-4000-8000-000000000033', code: 'SRC-1', title: 'Sổ nguồn mẫu', sourceSystem: 'xlsx' }, version: { id: '10000000-0000-4000-8000-000000000034', versionNo: 1 }, locator: { kind: 'cell_range', sheetName: 'Sheet1', range: 'D7' } }], nextCursor: null } }))
  await page.route('**/api/companies/**/cost-sources/figures/**', route => route.fulfill({ json: { figure: { id: figureId, label: 'Giá trị nguồn', rawValueText: '1,234.5600', valueState: 'known', amountText: '1234.5600', currencyCode: null, basis: 'gross', scopeKind: 'whole_project', scopeDescription: 'Nguồn tổng hợp', confirmation: 'unverified', observedAt: '2026-09-14T00:00:00.000Z', mapping: { state: 'pending', projectId, engagementId: '10000000-0000-4000-8000-000000000031', contractorId: '10000000-0000-4000-8000-000000000032' }, source: { id: '10000000-0000-4000-8000-000000000033', code: 'SRC-1', title: 'Sổ nguồn mẫu', sourceSystem: 'xlsx' }, version: { id: '10000000-0000-4000-8000-000000000034', versionNo: 1 }, locator: { kind: 'cell_range', sheetName: 'Sheet1', range: 'D7' } }, originalFilename: 'source.synthetic.xlsx', hierarchy: { project: { id: projectId, code: 'P-1', name: 'Dự án tổng hợp' }, engagement: { id: '10000000-0000-4000-8000-000000000031', code: 'E-1', name: 'Nhà thầu tổng hợp' }, contractor: { id: '10000000-0000-4000-8000-000000000032', code: 'C-1', displayName: 'Nhà thầu mẫu' } }, openIssues: [{ issueKind: 'possible_duplicate', impact: 'comparison_only', description: 'Nguồn mẫu có thể chồng lặp' }], duplicateWarning: true } }))

  await page.goto(`/costs/projects/${projectId}`)
  await expect.poll(() => costRequests).toHaveLength(2)
  await expect(page.getByRole('heading', { name: 'Dự án tổng hợp' })).toBeVisible()
  await expect(page.getByText('1234.5600 · Chưa xác định')).toBeVisible()
  const trigger = page.getByRole('button', { name: 'Giá trị nguồn' })
  await trigger.click()
  await expect(page.getByRole('dialog')).toContainText('Nguồn mẫu có thể chồng lặp')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/cost-source-ui-synthetic.png', fullPage: true })
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([])
})
