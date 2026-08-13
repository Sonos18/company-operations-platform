import { expect, test } from '@playwright/test'

test('lists only VQH projects and opens the selected project', async ({ page }) => {
  await page.goto('/projects')
  await expect(page.getByText('Việt Quốc Huy', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dự án' })).toBeVisible()
  await expect(page.getByText('Nhà phố Thảo Điền')).toBeVisible()
  await expect(page.getByText('Công ty kiểm thử cách ly')).toHaveCount(0)
  await page.getByRole('link', { name: /Mở dự án Nhà phố Thảo Điền/ }).click()
  await expect(page).toHaveURL(/\/projects\/project-thao-dien$/)
})

test('shows the journey loading skeleton during project navigation', async ({ page }) => {
  await page.addInitScript(() => {
    const clone = window.structuredClone.bind(window)

    window.structuredClone = ((value: unknown, options?: StructuredSerializeOptions) => {
      const result = clone(value, options)
      const project = value as { id?: unknown, stages?: unknown }

      if (project?.id === 'project-thao-dien' && Array.isArray(project.stages)) {
        return new Promise(resolve => window.setTimeout(() => resolve(result), 1_500))
      }

      return result
    }) as typeof window.structuredClone
  })

  await page.goto('/projects')
  await page.getByRole('link', { name: /Mở dự án Nhà phố Thảo Điền/ }).click({ noWaitAfter: true })

  await expect(page.getByTestId('journey-loading')).toBeVisible({ timeout: 1_000 })
  await expect(page.getByTestId('project-journey')).toBeVisible()
})

test('loads the approved project cover imagery', async ({ page }) => {
  await page.goto('/projects')

  const expectedCovers = [
    '/mock/journey/thao-dien-04-design-approved.webp',
    '/mock/journey/vinhomes-03-design.webp',
  ]
  const covers = page.locator('.project-card__visual img')
  await expect(covers).toHaveCount(2)
  const loaded = await covers.evaluateAll(images => images.map((image) => {
    const element = image as HTMLImageElement
    return {
      complete: element.complete,
      width: element.naturalWidth,
      height: element.naturalHeight,
      pathname: new URL(element.currentSrc).pathname,
    }
  }))

  expect(loaded.map(image => image.pathname)).toEqual(expectedCovers)
  expect(loaded.every(image => image.complete && image.width === 1600 && image.height === 900)).toBe(true)
})
