// 2026 年故障记录：类型定义、清洗、筛选、聚合、格式化纯函数。
import rawData from '@/data/faults-2026.json'

export type IncidentLevel = 'P0' | 'P1' | 'P2' | 'P3'
export type IncidentLayer = 'IaaS' | 'PaaS' | 'SaaS'

export interface FaultRecord {
  id: number
  year: string
  month: string
  layer: string
  department: string
  system: string
  startTime: string // ISO-like yyyy-MM-ddTHH:mm:ss
  recoverTime: string | null
  durationMin: number | null
  incidentCategory: string
  level: IncidentLevel
  incidentType: string | null
  managementCause: string | null
  technicalCause: string | null
  impact: string | null
  rootCause: string | null
  remark: string | null
}

export interface FaultDataset {
  updatedAt: string
  source: string
  records: FaultRecord[]
}

// ---- 清洗 ----
const VALID_LEVELS: IncidentLevel[] = ['P0', 'P1', 'P2', 'P3']
const VALID_LAYERS: IncidentLayer[] = ['IaaS', 'PaaS', 'SaaS']

function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function cleanString(v: unknown, fallback = '—'): string {
  if (v == null) return fallback
  const s = String(v).trim()
  return s.length ? s : fallback
}

let cleanedCache: FaultRecord[] | null = null
let loadError: string | null = null

export function getDataset(): FaultDataset {
  return rawData as FaultDataset
}

export function getRecords(): FaultRecord[] {
  if (cleanedCache) return cleanedCache
  const ds = getDataset()
  if (!ds || !Array.isArray(ds.records)) {
    loadError = '数据加载失败：records 字段缺失'
    cleanedCache = []
    return cleanedCache
  }
  const out: FaultRecord[] = []
  for (const r of ds.records) {
    const start = parseDate(r.startTime)
    if (!start) {
      console.warn('[faults] skip record without valid startTime', r)
      continue
    }
    let level: IncidentLevel = 'P3'
    const lvRaw = String(r.level || '').toUpperCase()
    if ((VALID_LEVELS as string[]).includes(lvRaw)) level = lvRaw as IncidentLevel
    else console.warn('[faults] invalid level, fallback P3', r)
    const layer = VALID_LAYERS.includes(r.layer as IncidentLayer) ? (r.layer as IncidentLayer) : 'SaaS'

    let duration: number | null = null
    if (typeof r.durationMin === 'number' && r.durationMin >= 0) duration = r.durationMin
    else if (r.recoverTime && start) {
      const rec = parseDate(r.recoverTime)
      if (rec && rec >= start) duration = Math.round((rec.getTime() - start.getTime()) / 60000)
    }

    const rec: FaultRecord = {
      id: Number(r.id),
      year: cleanString(r.year, ''),
      month: cleanString(r.month, ''),
      layer,
      department: cleanString(r.department, '未分类') === '—' ? '未分类' : cleanString(r.department, '未分类'),
      system: cleanString(r.system, '未分类') === '—' ? '未分类' : cleanString(r.system, '未分类'),
      startTime: r.startTime,
      recoverTime: r.recoverTime ?? null,
      durationMin: duration,
      incidentCategory: cleanString(r.incidentCategory, '未分类'),
      level,
      incidentType: r.incidentType ?? null,
      managementCause: r.managementCause ?? null,
      technicalCause: r.technicalCause ?? null,
      impact: r.impact ?? null,
      rootCause: cleanString(r.rootCause, '未分类') === '—' ? '未分类' : cleanString(r.rootCause, '未分类'),
      remark: r.remark ?? null,
    }
    out.push(rec)
  }
  cleanedCache = out
  return out
}

export function getLoadError(): string | null {
  return loadError
}

export function getDataUpdatedAt(): string {
  return getDataset().updatedAt || ''
}

export function getDataSource(): string {
  return getDataset().source || ''
}

// 图表中使用的"合并后故障分类"
export function mergeCategory(cat: string): string {
  if (cat === '核心应用系统事故' || cat === '核心应用事故') return '核心应用事故'
  return cat
}

// ---- 日期工具 ----
export function toDate(s: string): Date {
  // startTime 形如 "2026-01-08T10:11:00"（无时区后缀），按 UTC 解析以避免时区偏移
  const d = new Date(s + 'Z')
  return d
}

export function formatDateTime(s: string | null): string {
  if (!s) return '—'
  const d = toDate(s)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${y}-${mo}-${da} ${hh}:${mm}`
}

export function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = toDate(s)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

export function formatDuration(min: number | null): string {
  if (min == null) return '—'
  if (min < 60) return `${min}分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}小时` : `${h}小时${m}分`
}

export function formatDurationShort(min: number | null): string {
  if (min == null) return '—'
  if (min < 60) return `${min}m`
  const h = min / 60
  return `${h.toFixed(1)}h`
}

// ---- 筛选条件 ----
export type TimeGrain = 'month' | 'week' | 'day'

export interface FaultFilters {
  dateFrom: string // yyyy-MM-dd
  dateTo: string   // yyyy-MM-dd（inclusive）
  levels: IncidentLevel[] // 空表示全部
  layers: IncidentLayer[]
  departments: string[]
  systems: string[]
  categories: string[] // 合并后分类（核心应用事故 / 硬件设备事故 / ...）
  rootCauses: string[]
  ids?: number[]      // 下钻到某条记录时使用
}

export function defaultFilters(): FaultFilters {
  const records = getRecords()
  const dates = records.map((r) => toDate(r.startTime))
  const min = dates.reduce((a, b) => (a < b ? a : b), dates[0])
  const max = dates.reduce((a, b) => (a > b ? a : b), dates[0])
  const yStart = new Date(Date.UTC(max.getUTCFullYear(), 0, 1))
  const from = min < yStart ? min : yStart
  return {
    dateFrom: toYMD(from),
    dateTo: toYMD(max),
    levels: [],
    layers: [],
    departments: [],
    systems: [],
    categories: [],
    rootCauses: [],
    ids: [],
  }
}

export function toYMD(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000)
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}
export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
}

export function filterRecords(records: FaultRecord[], f: FaultFilters): FaultRecord[] {
  const from = new Date(f.dateFrom + 'T00:00:00Z')
  const to = new Date(f.dateTo + 'T23:59:59Z')
  return records.filter((r) => {
    const d = toDate(r.startTime)
    if (d < from || d > to) return false
    if (f.levels.length && !f.levels.includes(r.level)) return false
    if (f.layers.length && !f.layers.includes(r.layer as IncidentLayer)) return false
    if (f.departments.length && !f.departments.includes(r.department)) return false
    if (f.systems.length && !f.systems.includes(r.system)) return false
    if (f.categories.length && !f.categories.includes(mergeCategory(r.incidentCategory))) return false
    if (f.rootCauses.length && !f.rootCauses.includes(r.rootCause || '未分类')) return false
    if (f.ids && f.ids.length && !f.ids.includes(r.id)) return false
    return true
  })
}

// ---- 聚合 ----
export interface Kpi {
  total: number
  p0: number
  p1: number
  avgMttrMin: number | null
  thisMonthNew: number
}

export function computeKpi(records: FaultRecord[], filtered: FaultRecord[]): Kpi {
  const total = filtered.length
  const p0 = filtered.filter((r) => r.level === 'P0').length
  const p1 = filtered.filter((r) => r.level === 'P1').length
  const withDur = filtered.filter((r) => typeof r.durationMin === 'number')
  const avgMttrMin = withDur.length ? withDur.reduce((s, r) => s + (r.durationMin as number), 0) / withDur.length : null
  // 本月新增：浏览器当前自然月（本地时区），不受时间筛选影响
  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth()
  const thisMonthNew = records.filter((r) => {
    const d = toDate(r.startTime)
    return d.getUTCFullYear() === curY && d.getUTCMonth() === curM
  }).length
  return { total, p0, p1, avgMttrMin, thisMonthNew }
}

export interface LevelBucket { level: IncidentLevel; count: number }
export function groupByLevel(records: FaultRecord[]): LevelBucket[] {
  const m: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const r of records) m[r.level]++
  return (['P0', 'P1', 'P2', 'P3'] as IncidentLevel[]).map((l) => ({ level: l, count: m[l] }))
}

export interface CategoryBucket { category: string; count: number; rawCategories: string[] }
export function groupByCategory(records: FaultRecord[]): CategoryBucket[] {
  const map = new Map<string, { count: number; raws: Set<string> }>()
  for (const r of records) {
    const k = mergeCategory(r.incidentCategory)
    let v = map.get(k)
    if (!v) { v = { count: 0, raws: new Set() }; map.set(k, v) }
    v.count++
    v.raws.add(r.incidentCategory)
  }
  return Array.from(map.entries())
    .map(([category, v]) => ({ category, count: v.count, rawCategories: Array.from(v.raws) }))
    .sort((a, b) => b.count - a.count)
}

export interface KeyBucket { key: string; count: number; merged?: { key: string; count: number }[] }
export function topNWithOther(records: FaultRecord[], pick: (r: FaultRecord) => string, n: number): KeyBucket[] {
  const m = new Map<string, number>()
  for (const r of records) {
    const k = pick(r)
    m.set(k, (m.get(k) || 0) + 1)
  }
  const arr: KeyBucket[] = Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
  if (arr.length <= n) return arr
  const top = arr.slice(0, n)
  const rest = arr.slice(n)
  const otherCount = rest.reduce((s, x) => s + x.count, 0)
  if (otherCount > 0) top.push({ key: '其他', count: otherCount, merged: rest })
  return top
}

// 时间分桶
export interface TimeBucket { key: string; label: string; start: Date; end: Date; byLevel: Record<IncidentLevel, number>; total: number; avgMttrMin: number | null }

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

export function groupByTime(records: FaultRecord[], grain: TimeGrain): TimeBucket[] {
  if (!records.length) return []
  const min = records.map((r) => toDate(r.startTime)).reduce((a, b) => (a < b ? a : b))
  const max = records.map((r) => toDate(r.startTime)).reduce((a, b) => (a > b ? a : b))
  const buckets: TimeBucket[] = []
  if (grain === 'month') {
    let cur = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1))
    const end = new Date(Date.UTC(max.getUTCFullYear(), max.getUTCMonth(), 1))
    while (cur <= end) {
      const start = cur
      const stop = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0, 23, 59, 59))
      buckets.push(mkBucket(records, start, stop, `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`, `${cur.getUTCMonth() + 1}月`))
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
    }
  } else if (grain === 'week') {
    // 以周一为起点对齐
    const day = min.getUTCDay()
    const monday = new Date(min)
    monday.setUTCDate(min.getUTCDate() - ((day + 6) % 7))
    monday.setUTCHours(0, 0, 0, 0)
    let cur = new Date(monday)
    while (cur <= max) {
      const stop = new Date(cur.getTime() + 6 * 86400000)
      stop.setUTCHours(23, 59, 59, 0)
      const label = `${cur.getUTCMonth() + 1}/${cur.getUTCDate()}`
      buckets.push(mkBucket(records, cur, stop, isoDate(cur), label))
      cur = new Date(cur.getTime() + 7 * 86400000)
    }
  } else {
    // day
    let cur = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), min.getUTCDate()))
    const end = new Date(Date.UTC(max.getUTCFullYear(), max.getUTCMonth(), max.getUTCDate(), 23, 59, 59))
    while (cur <= end) {
      const stop = new Date(cur)
      stop.setUTCHours(23, 59, 59)
      const label = `${cur.getUTCMonth() + 1}/${cur.getUTCDate()}`
      buckets.push(mkBucket(records, cur, stop, isoDate(cur), label))
      cur = addDays(cur, 1)
    }
  }
  return buckets
}

function mkBucket(records: FaultRecord[], start: Date, end: Date, key: string, label: string): TimeBucket {
  const inRange = records.filter((r) => {
    const d = toDate(r.startTime)
    return d >= start && d <= end
  })
  const byLevel: Record<IncidentLevel, number> = { P0: 0, P1: 0, P2: 0, P3: 0 }
  let durSum = 0, durCnt = 0
  for (const r of inRange) {
    byLevel[r.level]++
    if (typeof r.durationMin === 'number') { durSum += r.durationMin; durCnt++ }
  }
  return {
    key, label, start, end, byLevel, total: inRange.length,
    avgMttrMin: durCnt ? durSum / durCnt : null,
  }
}

// 长耗时 TopN
export function longestFaults(records: FaultRecord[], n = 10): FaultRecord[] {
  return [...records]
    .filter((r) => typeof r.durationMin === 'number')
    .sort((a, b) => (b.durationMin as number) - (a.durationMin as number))
    .slice(0, n)
}

// 枚举值（来自数据）
export function uniqueValues(records: FaultRecord[], pick: (r: FaultRecord) => string): string[] {
  const s = new Set<string>()
  for (const r of records) { const v = pick(r); if (v && v !== '—') s.add(v) }
  return Array.from(s).sort()
}

// 排序（明细）
export type SortKey = 'id' | 'startTime' | 'recoverTime' | 'durationMin'
export type SortDir = 'asc' | 'desc' | null
export function sortRecords(records: FaultRecord[], key: SortKey, dir: SortDir): FaultRecord[] {
  if (!dir) return [...records].sort((a, b) => a.id - b.id)
  const arr = [...records].sort((a, b) => {
    let av: number | string, bv: number | string
    if (key === 'id') { av = a.id; bv = b.id }
    else if (key === 'startTime') { av = toDate(a.startTime).getTime(); bv = toDate(b.startTime).getTime() }
    else if (key === 'recoverTime') {
      av = a.recoverTime ? toDate(a.recoverTime).getTime() : Number.NEGATIVE_INFINITY
      bv = b.recoverTime ? toDate(b.recoverTime).getTime() : Number.NEGATIVE_INFINITY
    } else {
      av = a.durationMin ?? Number.NEGATIVE_INFINITY
      bv = b.durationMin ?? Number.NEGATIVE_INFINITY
    }
    if (av < bv) return -1
    if (av > bv) return 1
    return a.id - b.id
  })
  return dir === 'desc' ? arr.reverse() : arr
}

// 等级配色（Tailwind 类名映射）
export const LEVEL_COLORS: Record<IncidentLevel, { hex: string; bg: string; text: string; ring: string; dot: string }> = {
  P0: { hex: '#c92f21', bg: 'bg-chili-600', text: 'text-chili-600', ring: 'ring-chili-600', dot: 'bg-chili-600' },
  P1: { hex: '#e13b2b', bg: 'bg-chili-500', text: 'text-chili-500', ring: 'ring-chili-500', dot: 'bg-chili-500' },
  P2: { hex: '#e69b18', bg: 'bg-amber-500', text: 'text-amber-500', ring: 'ring-amber-500', dot: 'bg-amber-500' },
  P3: { hex: '#5f5b55', bg: 'bg-charcoal-500', text: 'text-charcoal-500', ring: 'ring-charcoal-500', dot: 'bg-charcoal-500' },
}

export const MERGED_CATEGORIES = ['核心应用事故', '硬件设备事故', '网络事故', '运维操作事故', '公有云事故'] as const
