import { expect, test, type Page } from '@playwright/test'

async function mockBackend(page: Page) {
  await page.route('**/api/providers', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        providers: {
          kimi: { serverConfigured: false },
        },
      }),
    })
  })

  await page.route('**/api/projects', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ projects: [] }),
    })
  })

  await page.route('**/api/chat', async (route) => {
    const request = route.request()
    const body = request.postDataJSON() as {
      messages?: Array<{ content?: string | Array<{ type: string; text?: string }> }>
    }
    const lastMessage = body.messages?.at(-1)
    const content =
      typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : lastMessage?.content?.find((part) => part.type === 'text')?.text || ''
    const isSummaryRequest = content.includes('请为下面这段会话生成一个面向后续回顾的中文智能总结')

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        content: isSummaryRequest
          ? '本次会话核心：验证 Twentys1x 的核心聊天流程。\n- 已发送用户消息\n- 已收到模型回复\n- 可继续导出和回顾'
          : '收到，这是一条稳定的 E2E 模拟回复。',
      }),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
  })
  await page.reload()
})

test('covers chat, summary, export, and collapsible settings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop core flow is covered in the chromium project.')

  await expect(page.getByRole('heading', { name: 'Twentys1x AI 工作台' })).toBeVisible()
  await expect(page.getByRole('button', { name: /新会话/ })).toBeVisible()

  await page.getByPlaceholder('sk-...').fill('sk-e2e-test-key')
  await expect(page.getByText('Kimi / Moonshot 已就绪')).toBeVisible()

  const prompt = '请用一句话介绍这个核心流程测试'
  await page.getByPlaceholder(/向 Kimi \/ Moonshot 提问/).fill(prompt)
  const sendButton = page.getByRole('button', { name: /发送/ }).last()
  await expect(sendButton).toBeEnabled()
  const chatResponse = page.waitForResponse('**/api/chat')
  await sendButton.click()
  await chatResponse

  await expect(page.getByRole('heading', { name: prompt })).toBeVisible()
  await expect(page.getByRole('button', { name: /生成/ })).toBeEnabled()

  await page.getByRole('button', { name: /生成/ }).click()
  await expect(page.getByText('本次会话核心：验证 Twentys1x 的核心聊天流程。')).toBeVisible()

  const markdownDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出当前/ }).click()
  await expect((await markdownDownload).suggestedFilename()).toMatch(/\.md$/)

  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出列表/ }).click()
  await expect((await jsonDownload).suggestedFilename()).toBe('twentys1x-sessions.json')

  await page.getByRole('button', { name: /配置/ }).click()
  await expect(page.getByText('AI 供应商')).toBeHidden()
  await page.getByRole('button', { name: /配置/ }).click()
  await expect(page.getByText('AI 供应商')).toBeVisible()
})

test('keeps the mobile shell usable for the primary controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Mobile shell is covered in the mobile project.')

  await expect(page.getByRole('button', { name: /新会话/ })).toBeVisible()
  await expect(page.getByRole('region', { name: '会话管理' })).toBeVisible()

  await page.getByPlaceholder('sk-...').fill('sk-e2e-test-key')
  const mobilePrompt = '移动端核心流程 smoke test'
  await page.getByPlaceholder(/向 Kimi \/ Moonshot 提问/).fill(mobilePrompt)
  const sendButton = page.getByRole('button', { name: /发送/ }).last()
  await expect(sendButton).toBeEnabled()

  const chatResponse = page.waitForResponse('**/api/chat')
  await sendButton.click()
  await chatResponse

  await expect(page.getByRole('heading', { name: mobilePrompt })).toBeVisible()
  await expect(page.getByRole('button', { name: /生成/ })).toBeEnabled()
})
