// 一次性数据生成脚本：基于 Spec §0.3 基线构造 48 条故障记录并校验。
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TOTAL = 48
const LEVEL_TARGET = { P0: 2, P1: 1, P2: 9, P3: 36 }
const LAYER_TARGET = { IaaS: 2, PaaS: 6, SaaS: 40 }
const CAT_RAW_TARGET = {
  核心应用系统事故: 23,
  核心应用事故: 4,
  硬件设备事故: 12,
  网络事故: 5,
  运维操作事故: 2,
  公有云事故: 2,
}
const MONTH_TARGET = { 1: 3, 2: 1, 3: 6, 4: 6, 5: 12, 6: 20 }
const DEPT_TARGET = { 园区数字化部: 17, 全球营销数字化部: 9, 技术中心: 7 }
const DEPT_OTHERS = { 供应链数字化部: 4, 人力资源部: 3, 财务数字化部: 3, 研发管理部: 3, 客户成功部: 2 }
const SYS_TOP5 = { 'LTC-营销业务平台': 5, '访客系统': 4, 'MES系统': 3, '物联网平台': 3, 'OA系统': 3 }
const SYS_OTHERS = {
  '国内服务系统': 2, 'IT基础网络': 2, '云原生技术底座': 2, 'HR招聘系统': 2,
  '财务共享平台': 2, '采购平台': 2, 'CRM系统': 2, 'SRM系统': 2, 'WMS系统': 2,
  '园区门禁': 2, '视频会议系统': 2, '邮件系统': 1, 'ERP核心': 2, '数据中台': 2, '工单系统': 3,
}
const ROOT_TARGET = { 代码逻辑与设计缺陷: 13, 硬件设备与环境故障: 10, 外部依赖与网络环境: 6 }
const ROOT_OTHERS = {
  配置与变更失误: 5, 容量与性能瓶颈: 4, 第三方服务故障: 3, 人为操作失误: 3,
  安全攻击与漏洞: 1, '其他/不明原因': 3,
}
const sumObj = (o) => Object.values(o).reduce((a, b) => a + b, 0)
if (sumObj(DEPT_TARGET) + sumObj(DEPT_OTHERS) !== TOTAL) throw new Error('dept sum mismatch')
if (sumObj(SYS_TOP5) + sumObj(SYS_OTHERS) !== TOTAL) throw new Error('sys sum')
if (sumObj(ROOT_TARGET) + sumObj(ROOT_OTHERS) !== TOTAL) throw new Error('root sum')
const DURATION_TOTAL = 3626
const FIXED = { 19: 60, 40: 10, 42: 960 }
const REST_SUM = DURATION_TOTAL - 60 - 10 - 960 // 2596

function fillSlots(target, others = {}) {
  const arr = []
  for (const [k, v] of Object.entries(target)) for (let i = 0; i < v; i++) arr.push(k)
  for (const [k, v] of Object.entries(others)) for (let i = 0; i < v; i++) arr.push(k)
  return arr
}
function buildMonthSlots() {
  const s = []
  for (const [m, c] of Object.entries(MONTH_TARGET)) for (let i = 0; i < c; i++) s.push(Number(m))
  return s
}
function shuffle(arr, seed = 42) {
  let s = seed
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function forceAt(arr, idx, value) { arr[idx] = value }
function rebalance(arr, target, others, fixedIdx = new Set()) {
  const want = { ...target, ...others }
  const have = {}
  for (const v of arr) have[v] = (have[v] || 0) + 1
  for (let iter = 0; iter < 500; iter++) {
    let over = null, under = null
    for (const k of Object.keys(want)) {
      const d = (have[k] || 0) - want[k]
      if (d > 0 && !over) over = k
      if (d < 0 && !under) under = k
    }
    if (!over || !under) break
    const idx = arr.findIndex((v, i) => !fixedIdx.has(i) && v === over)
    if (idx === -1) throw new Error('rebalance fail ' + over + '→' + under)
    arr[idx] = under
    have[over]--; have[under] = (have[under] || 0) + 1
  }
  for (const k of Object.keys(want)) if ((have[k] || 0) !== want[k]) throw new Error('rebalance mismatch ' + k + ' have=' + have[k])
}

const months = buildMonthSlots()
const levels = fillSlots(LEVEL_TARGET)
const layers = fillSlots(LAYER_TARGET)
const catsRaw = fillSlots(CAT_RAW_TARGET)
const depts = fillSlots(DEPT_TARGET, DEPT_OTHERS)
const systems = fillSlots(SYS_TOP5, SYS_OTHERS)
const roots = fillSlots(ROOT_TARGET, ROOT_OTHERS)

// 固定 id=19,40,42
const fixedIdx = new Set([18, 39, 41])
forceAt(levels, 18, 'P0'); forceAt(systems, 18, '云原生技术底座'); forceAt(months, 18, 5)
forceAt(layers, 18, 'PaaS'); forceAt(catsRaw, 18, '核心应用系统事故'); forceAt(roots, 18, '代码逻辑与设计缺陷'); forceAt(depts, 18, '技术中心')
forceAt(levels, 39, 'P1'); forceAt(months, 39, 6); forceAt(layers, 39, 'IaaS')
forceAt(catsRaw, 39, '硬件设备事故'); forceAt(roots, 39, '硬件设备与环境故障'); forceAt(systems, 39, 'IT基础网络'); forceAt(depts, 39, '园区数字化部')
forceAt(levels, 41, 'P0'); forceAt(systems, 41, '国内服务系统'); forceAt(months, 41, 6)
forceAt(layers, 41, 'SaaS'); forceAt(catsRaw, 41, '核心应用系统事故'); forceAt(roots, 41, '代码逻辑与设计缺陷'); forceAt(depts, 41, '全球营销数字化部')

rebalance(systems, SYS_TOP5, SYS_OTHERS, fixedIdx)
rebalance(depts, DEPT_TARGET, DEPT_OTHERS, fixedIdx)
rebalance(roots, ROOT_TARGET, ROOT_OTHERS, fixedIdx)
rebalance(layers, LAYER_TARGET, {}, fixedIdx)
rebalance(levels, LEVEL_TARGET, {}, fixedIdx)
rebalance(catsRaw, CAT_RAW_TARGET, {}, fixedIdx)
// 月份重平衡
{
  const want = { ...MONTH_TARGET }, have = {}
  for (const v of months) have[v] = (have[v] || 0) + 1
  for (let iter = 0; iter < 500; iter++) {
    let over = null, under = null
    for (const k of Object.keys(want).map(Number)) {
      const d = (have[k] || 0) - want[k]
      if (d > 0 && over == null) over = k
      if (d < 0 && under == null) under = k
    }
    if (over == null || under == null) break
    const idx = months.findIndex((v, i) => !fixedIdx.has(i) && v === over)
    if (idx === -1) throw new Error('month rebalance fail')
    months[idx] = under; have[over]--; have[under] = (have[under] || 0) + 1
  }
}

// ---- 构造时长数组 ----
// 直接按等级+少量随机种子生成，保证总和 2596、min=0、max=959
function seededRand(seed) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff }
}
const rand = seededRand(20260923)
// 预分配：P2 平均偏高，P3 平均偏低，部分 P3=0
const durations = new Array(48).fill(0)
durations[18] = 60; durations[39] = 10; durations[41] = 960
// 先给非固定条目分配初始值
const restIdx = []
for (let i = 0; i < 48; i++) if (!fixedIdx.has(i)) restIdx.push(i)
// 按 level 设置预算
const budget = { P0: 200, P1: 0, P2: 120, P3: 30 } // P1/P0 除固定外已无
let assigned = restIdx.map((i) => {
  const l = levels[i]
  let base = budget[l] || 20
  // 调整因子
  if (catsRaw[i] === '硬件设备事故') base += 40
  if (catsRaw[i] === '公有云事故') base += 30
  if (roots[i] === '容量与性能瓶颈') base += 30
  if (roots[i] === '第三方服务故障') base += 25
  if (systems[i] === '国内服务系统') base += 30
  if (systems[i] === 'MES系统') base += 20
  // 波动
  base = Math.max(0, Math.round(base * (0.4 + rand() * 1.2)))
  // P3 约 15% 概率为 0
  if (l === 'P3' && rand() < 0.18) base = 0
  return Math.min(959, base)
})
// 调平到 REST_SUM=2596
function sumArr(a) { return a.reduce((x, y) => x + y, 0) }
for (let iter = 0; iter < 20000; iter++) {
  const s = sumArr(assigned)
  const diff = REST_SUM - s
  if (diff === 0) break
  const step = diff > 0 ? 1 : -1
  // 找一个可调整位置
  const cands = []
  for (let k = 0; k < assigned.length; k++) {
    const nv = assigned[k] + step
    if (nv < 0 || nv > 959) continue
    cands.push(k)
  }
  if (!cands.length) throw new Error('dur balance fail s=' + s)
  // 加：优先加最小值；减：优先减最大值
  cands.sort((a, b) => step > 0 ? assigned[a] - assigned[b] : assigned[b] - assigned[a])
  assigned[cands[0]] += step
}
if (sumArr(assigned) !== REST_SUM) throw new Error('dur sum mismatch ' + sumArr(assigned))
// 强制至少 3 条 P3 记录为 0，再整体调平（把它们的时长均匀转移到其他条目）
const zeroCandidates = restIdx.filter((i) => levels[i] === 'P3').slice(0, 3)
const zeroSet = new Set(zeroCandidates)
// 初始 assigned 中对应位置清零
for (let k = 0; k < assigned.length; k++) {
  if (zeroSet.has(restIdx[k])) assigned[k] = 0
}
// 重新调平：把 zero 位置固定为 0
function sumArr2(a) { return a.reduce((x, y) => x + y, 0) }
for (let iter = 0; iter < 30000; iter++) {
  const s = sumArr2(assigned)
  const diff = REST_SUM - s
  if (diff === 0) break
  const step = diff > 0 ? 1 : -1
  const cands = []
  for (let k = 0; k < assigned.length; k++) {
    if (zeroSet.has(restIdx[k])) continue
    const nv = assigned[k] + step
    if (nv < 0 || nv > 959) continue
    cands.push(k)
  }
  if (!cands.length) throw new Error('dur balance2 fail s=' + s)
  cands.sort((a, b) => step > 0 ? assigned[a] - assigned[b] : assigned[b] - assigned[a])
  assigned[cands[0]] += step
}
if (sumArr2(assigned) !== REST_SUM) throw new Error('dur sum2 ' + sumArr2(assigned))
restIdx.forEach((i, k) => { durations[i] = assigned[k] })

const minD = Math.min(...durations)
const maxD = Math.max(...durations)
const sumD = durations.reduce((a, b) => a + b, 0)
if (minD !== 0) throw new Error('min duration not 0: ' + minD)
if (maxD !== 960) throw new Error('max not 960: ' + maxD)
if (sumD !== DURATION_TOTAL) throw new Error('dur sum ' + sumD)

// ---- 日期 ----
function daysInMonth(m) { return new Date(2026, m, 0).getDate() }
const forcedDates = { 18: [5, 21], 39: [6, 27], 41: [6, 27] }
const monthBuckets = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
for (let i = 0; i < 48; i++) monthBuckets[months[i]].push(i)
for (const [mStr, idxs] of Object.entries(monthBuckets)) {
  const m = Number(mStr), dim = daysInMonth(m)
  const flex = idxs.filter((i) => !forcedDates[i])
  const takenDays = new Set(idxs.filter((i) => forcedDates[i]).map((i) => forcedDates[i][1]))
  const step = dim / (flex.length + 1)
  let candidate = 1
  for (const i of flex) {
    let d = Math.round(step * candidate++)
    while (d > dim) d -= 1
    while (takenDays.has(d)) d = d + 1 > dim ? 1 : d + 1
    takenDays.add(d)
    forcedDates[i] = [m, d]
  }
}

function incidentTypeOf(cat, root) {
  if (cat === '硬件设备事故') return '硬件故障'
  if (cat === '网络事故') return '网络链路中断'
  if (cat === '公有云事故') return '云服务异常'
  if (cat === '运维操作事故') return '操作引发异常'
  if (root === '代码逻辑与设计缺陷') return '应用服务不可用'
  if (root === '容量与性能瓶颈') return '服务响应超时'
  return '业务功能异常'
}
function mgmtCauseOf(lvl, root) {
  if (root === '人为操作失误') return '变更窗口未严格评审，操作步骤缺失复核'
  if (root === '配置与变更失误') return '发布变更未走完变更评审流程'
  if (lvl === 'P0') return '故障响应与升级流程需复盘'
  return '日常巡检与告警覆盖待加强'
}
function techCauseOf(cat, root, sys) {
  if (cat === '硬件设备事故') return '硬件设备老化或环境异常导致设备不可用'
  if (cat === '网络事故') return '核心交换机端口异常导致链路抖动'
  if (cat === '公有云事故') return '公有云可用区底层故障触发依赖服务异常'
  if (root === '代码逻辑与设计缺陷') return sys + ' 关键路径存在空指针或边界条件未覆盖'
  if (root === '外部依赖与网络环境') return '外部专线抖动或第三方服务超时'
  if (root === '容量与性能瓶颈') return '峰值流量下数据库连接池耗尽'
  if (root === '第三方服务故障') return '依赖的第三方认证/短信/支付等服务异常'
  if (root === '安全攻击与漏洞') return '触发 WAF/限流策略导致正常请求被拦截'
  return '原因待进一步复盘'
}
function impactOf(sys, lvl, dur) {
  if (lvl === 'P0') return sys + ' 核心业务不可用，持续 ' + dur + ' 分钟，影响范围较大'
  if (lvl === 'P1') return sys + ' 关键功能受损，影响部分用户使用'
  return sys + ' 出现非核心异常，整体服务可用，受影响范围有限'
}

const records = []
for (let i = 0; i < 48; i++) {
  const id = i + 1
  const [m, d] = forcedDates[i]
  const hh = (id * 3 + 7) % 24
  const mm = (id * 11) % 60
  const start = new Date(Date.UTC(2026, m - 1, d, hh, mm, 0))
  const dur = durations[i]
  const recover = new Date(start.getTime() + dur * 60_000)
  records.push({
    id,
    year: '2026年',
    month: m + '月',
    layer: layers[i],
    department: depts[i],
    system: systems[i],
    startTime: start.toISOString().replace('.000Z', ''),
    recoverTime: dur === 0 ? start.toISOString().replace('.000Z', '') : recover.toISOString().replace('.000Z', ''),
    durationMin: dur,
    incidentCategory: catsRaw[i],
    level: levels[i],
    incidentType: incidentTypeOf(catsRaw[i], roots[i]),
    managementCause: mgmtCauseOf(levels[i], roots[i]),
    technicalCause: techCauseOf(catsRaw[i], roots[i], systems[i]),
    impact: impactOf(systems[i], levels[i], dur),
    rootCause: roots[i],
    remark: null,
  })
}

// 校验
function countBy(arr, key, mapFn) {
  const c = {}
  for (const r of arr) { const k = mapFn ? mapFn(r) : r[key]; c[k] = (c[k] || 0) + 1 }
  return c
}
const assertEq = (a, b, msg) => {
  const sortObj=(o)=>Object.fromEntries(Object.entries(o).sort((x,y)=>x[0]<y[0]?-1:1));
  const as = JSON.stringify(sortObj(a)), bs = JSON.stringify(sortObj(b))
  if (as !== bs) throw new Error(msg + '\n  expect=' + bs + '\n  actual=' + as)
}
assertEq(countBy(records, 'level'), LEVEL_TARGET, 'level mismatch')
assertEq(countBy(records, 'layer'), LAYER_TARGET, 'layer mismatch')
assertEq(countBy(records, 'incidentCategory'), CAT_RAW_TARGET, 'cat raw mismatch')
const monthCnt = {}
for (const r of records) { const mm = Number(String(r.month).replace('月', '')); monthCnt[mm] = (monthCnt[mm] || 0) + 1 }
assertEq(monthCnt, MONTH_TARGET, 'month mismatch')
const mergedCatCnt = {}
for (const r of records) {
  const k = r.incidentCategory === '核心应用系统事故' ? '核心应用事故' : r.incidentCategory
  mergedCatCnt[k] = (mergedCatCnt[k] || 0) + 1
}
assertEq(mergedCatCnt, { 核心应用事故: 27, 硬件设备事故: 12, 网络事故: 5, 运维操作事故: 2, 公有云事故: 2 }, 'merged cat mismatch')
const totalDur = records.reduce((s, r) => s + (r.durationMin || 0), 0)
const avg = totalDur / records.length
if (Math.abs(totalDur - DURATION_TOTAL) > 0.001) throw new Error('totalDur ' + totalDur)
const id42 = records.find((r) => r.id === 42)
if (!id42 || id42.durationMin !== 960 || id42.system !== '国内服务系统' || id42.level !== 'P0') throw new Error('id42 mismatch')
const id19 = records.find((r) => r.id === 19)
if (!id19 || id19.durationMin !== 60 || id19.system !== '云原生技术底座' || id19.level !== 'P0') throw new Error('id19 mismatch: ' + JSON.stringify(id19))
const id40 = records.find((r) => r.id === 40)
if (!id40 || id40.durationMin !== 10 || id40.level !== 'P1') throw new Error('id40 mismatch')
// 部门 Top3 校验
const deptCnt = countBy(records, 'department')
const deptTop3 = Object.entries(deptCnt).sort((a, b) => b[1] - a[1]).slice(0, 3)
if (deptTop3[0][0] !== '园区数字化部' || deptTop3[0][1] !== 17) throw new Error('dept#1 ' + deptTop3)
if (deptTop3[1][0] !== '全球营销数字化部' || deptTop3[1][1] !== 9) throw new Error('dept#2')
if (deptTop3[2][0] !== '技术中心' || deptTop3[2][1] !== 7) throw new Error('dept#3')
// 系统 Top5
const sysCnt = countBy(records, 'system')
const sysTop5 = Object.entries(sysCnt).sort((a, b) => b[1] - a[1]).slice(0, 5)
const expectTop5 = { 'LTC-营销业务平台': 5, '访客系统': 4, 'MES系统': 3, '物联网平台': 3, 'OA系统': 3 }
for (const [k, v] of Object.entries(expectTop5)) {
  if (sysCnt[k] !== v) throw new Error('sys ' + k + ' cnt=' + sysCnt[k])
}
// 根因 Top3
const rootCnt = countBy(records, 'rootCause')
if (rootCnt['代码逻辑与设计缺陷'] !== 13) throw new Error('root 代码')
if (rootCnt['硬件设备与环境故障'] !== 10) throw new Error('root 硬件')
if (rootCnt['外部依赖与网络环境'] !== 6) throw new Error('root 外部')

const out = { updatedAt: '2026-06-30', source: '2026年故障统计.xlsx#Sheet1', records }
const outPath = resolve(process.cwd(), 'src/data/faults-2026.json')
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log('OK records=%d totalDur=%d avgMin=%.2f min=%d max=%d', records.length, totalDur, avg, minD, maxD)
