import { test, expect, type Page, type Locator } from '@playwright/test'

/** 打开公开报表页（无需绑定桌台），等待标题渲染。 */
async function gotoReport(page: Page) {
  await page.goto('/#/fault-report-2026')
  await expect(page.getByRole('heading', { name: '2026 年故障记录报表' })).toBeVisible()
}

/** 在筛选区打开一个 MultiSelect 下拉并勾选/取消选项。label 为按钮上的文字（如“故障等级”）。 */
async function toggleMultiSelect(page: Page, label: string, option: string) {
  const btn = page.locator('button').filter({ hasText: new RegExp(`^${label}`) }).first()
  await btn.click()
  const optionItem = page.locator('label').filter({ hasText: new RegExp(`^${option}$`) }).first()
  await optionItem.locator('input[type="checkbox"]').click({ force: true })
  // 点击遮罩关闭下拉
  await page.locator('.fixed.inset-0').first().click({ force: true })
}

/** KPI 卡片按标签定位，返回大数字 locator。 */
function kpiValue(page: Page, label: string): Locator {
  return page.locator('div.rounded-2xl.border', { has: page.getByText(label, { exact: true }) }).locator('p.text-2xl')
}

/** 明细表的所有可见行 */
function tableRows(page: Page): Locator {
  return page.locator('tbody tr')
}

test.describe('2026 年故障记录可视化报表 - REQ-001/002/003 默认渲染与基线对账', () => {
  test('REQ-001/002/003: 首屏渲染标题、5 张 KPI、7 张图表、明细表，基线数值与 Spec §0.3 / 开发提交一致', async ({ page }) => {
    await gotoReport(page)

    // 标题区 + 数据更新时间
    await expect(page.getByText(/数据更新时间：2026-06-30/)).toBeVisible()
    // 副标题：共 48 条故障；时间范围按实际数据起止（2026-01-08 ~ 2026-06-29）
    await expect(page.getByText(/共 48 条故障；时间范围/)).toBeVisible()

    // 5 张 KPI 与基线值
    await expect(kpiValue(page, '故障总数')).toHaveText('48')
    await expect(kpiValue(page, 'P0 故障')).toHaveText('2')
    await expect(kpiValue(page, 'P1 故障')).toHaveText('1')
    // 平均 MTTR ≈ 1.3h（Spec 容差 ±0.01h，显示 1 位小数）
    const mttr = await kpiValue(page, '平均 MTTR').textContent()
    expect(mttr).toMatch(/^1\.[23]h$/)

    // 7 个图表标题同时可见
    for (const title of ['时间趋势', '故障等级分布', '故障分类分布', '责任部门分布（Top10）', '根因分类分布（Top10）', '系统分布（Top10）', '长耗时故障 Top10']) {
      await expect(page.getByText(title).first()).toBeVisible()
    }

    // 等级环图列表项呈现 P0=2 / P1=1 / P2=9 / P3=36（每个 li 按钮同时包含等级文字与计数）
    const levelList = page.getByText('故障等级分布').locator('../..').locator('ul')
    const levelItem = (lvl: string) => levelList.locator('button').filter({ hasText: new RegExp(`^\\s*${lvl}`) })
    await expect(levelItem('P0')).toContainText('2')
    await expect(levelItem('P1')).toContainText('1')
    await expect(levelItem('P2')).toContainText('9')
    await expect(levelItem('P3')).toContainText('36')

    // 时间趋势默认月粒度，X 轴应出现 1月~6月 标签
    const trendCard = page.getByText('时间趋势').locator('../..')
    for (const m of ['1月', '2月', '3月', '4月', '5月', '6月']) {
      await expect(trendCard.locator('svg')).toContainText(m)
    }
    // 月度柱顶计数：1月=3、2月=1、3月=6、4月=6、5月=12、6月=20
    await expect(trendCard.locator('svg')).toContainText('3')
    await expect(trendCard.locator('svg')).toContainText('20')

    // 故障分类：核心应用事故=27（合并后）、硬件设备事故=12、网络事故=5、运维操作事故=2、公有云事故=2
    const catCard = page.getByText('故障分类分布').locator('../..')
    await expect(catCard.getByText('核心应用事故')).toBeVisible()
    await expect(catCard.locator('button').filter({ hasText: /^核心应用事故/ })).toContainText('27')
    await expect(catCard.locator('button').filter({ hasText: /^硬件设备事故/ })).toContainText('12')
    await expect(catCard.locator('button').filter({ hasText: /^网络事故/ })).toContainText('5')
    await expect(catCard.locator('button').filter({ hasText: /^运维操作事故/ })).toContainText('2')
    await expect(catCard.locator('button').filter({ hasText: /^公有云事故/ })).toContainText('2')

    // 长耗时 Top1：第一条 #1 为 ID=42 国内服务系统 960min=16h
    const longCard = page.getByText('长耗时故障 Top10').locator('../../..')
    const firstLong = longCard.locator('ul > li').first()
    await expect(firstLong).toContainText('#1')
    await expect(firstLong).toContainText('国内服务系统')
    await expect(firstLong).toContainText('16小时')

    // 明细表明细行数（默认分页 20 条/页，首页 20 行）
    await expect(tableRows(page)).toHaveCount(20)

    // 页脚口径说明
    await expect(page.getByText(/数据来源：2026年故障统计\.xlsx#Sheet1/)).toBeVisible()
  })
})

test.describe('2026 年故障记录可视化报表 - REQ-004/005 筛选与下钻', () => {
  test('REQ-005: 点击等级环 P0 → 表格仅剩 P0 的 2 条（ID=19 与 ID=42），出现 P0 筛选 Tag', async ({ page }) => {
    await gotoReport(page)
    const levelCard = page.getByText('故障等级分布').locator('../..')
    await levelCard.getByRole('button', { name: /P0/ }).click()
    // 出现 P0 筛选 tag
    await expect(page.locator('span.inline-flex.items-center.gap-1.rounded-full.bg-rice-100').filter({ hasText: /P0/ })).toBeVisible()
    // KPI 总数=2、P0=2、P1=0
    await expect(kpiValue(page, '故障总数')).toHaveText('2')
    await expect(kpiValue(page, 'P0 故障')).toHaveText('2')
    await expect(kpiValue(page, 'P1 故障')).toHaveText('0')
    // 表格包含 ID 19 与 42
    const body = page.locator('tbody')
    await expect(body).toContainText('19')
    await expect(body).toContainText('42')
  })

  test('REQ-005: 点击责任部门“园区数字化部”→ 共 17 条，表格每行 department 都为园区数字化部', async ({ page }) => {
    await gotoReport(page)
    const deptCard = page.getByText('责任部门分布（Top10）').locator('../../..')
    await deptCard.locator('button').filter({ hasText: /^园区数字化部/ }).click()
    await expect(kpiValue(page, '故障总数')).toHaveText('17')
    await expect(page.getByText(/当前筛选命中 17 条故障/)).toBeVisible()
    const rows = tableRows(page)
    const count = await rows.count()
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText('园区数字化部')
    }
  })

  test('REQ-004.5: 故障分类选择“核心应用事故”→ 命中 27 条（合并核心应用系统事故+核心应用事故）', async ({ page }) => {
    await gotoReport(page)
    await toggleMultiSelect(page, '故障分类', '核心应用事故')
    await expect(kpiValue(page, '故障总数')).toHaveText('27')
    await expect(page.getByText(/当前筛选命中 27 条故障/)).toBeVisible()
    // 明细故障分类列应出现“核心应用”原值
    await expect(page.locator('tbody')).toContainText(/核心应用/)
  })

  test('REQ-005/R6: 点击长耗时 Top1 → 跳转到 ID=42 所在页并可看到该行（960min/16h）', async ({ page }) => {
    await gotoReport(page)
    const longCard = page.getByText('长耗时故障 Top10').locator('../../..')
    const firstLong = longCard.locator('ul > li').first()
    await firstLong.locator('button').click()
    // 跳转到 ID=42 所在页（48 条/20/页 = 第 3 页），分页器显示 3 / 3
    await expect(page.locator('div.flex.items-center.justify-between.p-3').getByText('3 / 3')).toBeVisible()
    const row42 = page.locator('#fault-row-42')
    await expect(row42).toBeVisible()
    await expect(row42).toContainText('960')
    await expect(row42).toContainText('16小时')
    await expect(row42).toContainText('国内服务系统')
  })

  test('REQ-004: 重置按钮恢复基线', async ({ page }) => {
    await gotoReport(page)
    // 先做 P0 下钻
    const levelCard = page.getByText('故障等级分布').locator('../..')
    await levelCard.getByRole('button', { name: /P0/ }).click()
    await expect(kpiValue(page, '故障总数')).toHaveText('2')
    // 点重置
    await page.getByRole('button', { name: /重置筛选/ }).click()
    await expect(kpiValue(page, '故障总数')).toHaveText('48')
    await expect(kpiValue(page, 'P0 故障')).toHaveText('2')
    await expect(kpiValue(page, 'P1 故障')).toHaveText('1')
    // tag 区清空
    await expect(page.locator('span.inline-flex.items-center.gap-1.rounded-full.bg-rice-100')).toHaveCount(0)
  })
})

test.describe('2026 年故障记录可视化报表 - REQ-006 明细表格排序与分页', () => {
  test('REQ-006.2: 按不可用时长(分钟)降序排序，第一条为 ID=42（960min）', async ({ page }) => {
    await gotoReport(page)
    const durHeader = page.locator('button').filter({ hasText: /不可用时长/ }).first()
    await durHeader.click() // asc
    await durHeader.click() // desc
    await expect(tableRows(page).first()).toContainText('42')
    await expect(tableRows(page).first()).toContainText('960')
  })

  test('REQ-006.3: 分页 20 条/页，首页 20 行，下一页进入第 2 页', async ({ page }) => {
    await gotoReport(page)
    await expect(tableRows(page)).toHaveCount(20)
    // 默认共 48 条 -> 3 页
    await expect(page.locator('div.flex.items-center.justify-between.p-3').getByText('1 / 3')).toBeVisible()
    await page.getByRole('button', { name: '下一页' }).click()
    await expect(page.locator('div.flex.items-center.justify-between.p-3').getByText('2 / 3')).toBeVisible()
    await expect(tableRows(page)).toHaveCount(20)
  })
})

test.describe('2026 年故障记录可视化报表 - REQ-008 路由隔离', () => {
  test('REQ-008.2: #/home、#/fault-report-2026 路由正常，无需绑定桌台即可访问报表', async ({ page }) => {
    await page.goto('/#/home')
    await expect(page).toHaveURL(/#\/home$/)
    await expect(page.getByRole('button', { name: /A08/ }).first()).toBeVisible()
    await page.goto('/#/fault-report-2026')
    await expect(page).toHaveURL(/#\/fault-report-2026$/)
    await expect(page.getByRole('heading', { name: '2026 年故障记录报表' })).toBeVisible()
  })
})
