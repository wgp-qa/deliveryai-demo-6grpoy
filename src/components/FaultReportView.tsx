import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, BarChart3, Calendar, ChevronDown, Clock, FilterX,
  RefreshCw, ArrowDownUp, ArrowUpDown, ExternalLink,
} from 'lucide-react'
import {
  getRecords, getLoadError, getDataUpdatedAt, getDataSource,
  defaultFilters, filterRecords, computeKpi, groupByLevel, groupByCategory,
  topNWithOther, groupByTime, longestFaults, uniqueValues, sortRecords,
  formatDateTime, formatDate, formatDuration, toDate, toYMD,
  startOfMonth, endOfMonth, LEVEL_COLORS, MERGED_CATEGORIES,
  type FaultRecord, type FaultFilters, type TimeGrain, type IncidentLevel, type IncidentLayer,
  type SortKey, type SortDir,
} from '@/lib/faults'
import { cn } from '@/lib/utils'

type DrillKey =
  | { dim: 'level'; value: IncidentLevel }
  | { dim: 'layer'; value: IncidentLayer }
  | { dim: 'department'; value: string }
  | { dim: 'system'; value: string }
  | { dim: 'category'; value: string }
  | { dim: 'rootCause'; value: string }
  | { dim: 'id'; value: number }
  | { dim: 'dateRange'; value: { from: string; to: string } }

const LEVELS: IncidentLevel[] = ['P0', 'P1', 'P2', 'P3']
const LAYERS: IncidentLayer[] = ['IaaS', 'PaaS', 'SaaS']

export function FaultReportView() {
  const { t } = useTranslation()
  const all = useMemo(() => getRecords(), [])
  const error = useMemo(() => getLoadError(), [])
  const updatedAt = getDataUpdatedAt()
  const source = getDataSource()

  const [filters, setFilters] = useState<FaultFilters>(() => defaultFilters())
  const [grain, setGrain] = useState<TimeGrain>('month')
  const [sortKey, setSortKey] = useState<SortKey>('id')
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [openSelect, setOpenSelect] = useState<string | null>(null)

  const filtered = useMemo(() => filterRecords(all, filters), [all, filters])
  const kpi = useMemo(() => computeKpi(all, filtered), [all, filtered])
  const timeBuckets = useMemo(() => groupByTime(filtered, grain), [filtered, grain])
  const levelBuckets = useMemo(() => groupByLevel(filtered), [filtered])
  const catBuckets = useMemo(() => groupByCategory(filtered), [filtered])
  const deptBuckets = useMemo(() => topNWithOther(filtered, (r) => r.department, 10), [filtered])
  const rootBuckets = useMemo(() => topNWithOther(filtered, (r) => r.rootCause || '未分类', 10), [filtered])
  const sysBuckets = useMemo(() => topNWithOther(filtered, (r) => r.system, 10), [filtered])
  const longTop = useMemo(() => longestFaults(filtered, 10), [filtered])

  const pageSize = 20
  const sorted = useMemo(() => sortRecords(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  useEffect(() => { if (page > totalPages) setPage(1) }, [page, totalPages])
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize)

  // 枚举选项（来自全量数据）
  const deptOpts = useMemo(() => uniqueValues(all, (r) => r.department), [all])
  const sysOpts = useMemo(() => uniqueValues(all, (r) => r.system), [all])
  const rootOpts = useMemo(() => uniqueValues(all, (r) => r.rootCause || '未分类'), [all])

  const minDate = useMemo(() => {
    const ds = all.map((r) => toDate(r.startTime))
    return toYMD(ds.reduce((a, b) => (a < b ? a : b), ds[0]))
  }, [all])
  const maxDate = useMemo(() => {
    const ds = all.map((r) => toDate(r.startTime))
    return toYMD(ds.reduce((a, b) => (a > b ? a : b), ds[0]))
  }, [all])

  function reset() { setFilters(defaultFilters()); setGrain('month'); setSortKey('id'); setSortDir(null); setPage(1) }

  function drill(d: DrillKey) {
    setFilters((prev) => {
      const next = { ...prev, ids: prev.ids ? [...prev.ids] : [] }
      switch (d.dim) {
        case 'level': next.levels = [d.value]; break
        case 'layer': next.layers = [d.value]; break
        case 'department': next.departments = [d.value]; break
        case 'system': next.systems = [d.value]; break
        case 'category': next.categories = [d.value]; break
        case 'rootCause': next.rootCauses = [d.value]; break
        case 'id': next.ids = [d.value]; break
        case 'dateRange': next.dateFrom = d.value.from; next.dateTo = d.value.to; break
      }
      return next
    })
    setPage(1)
  }

  function removeFilter(tag: FilterTag) {
    setFilters((prev) => {
      const next = { ...prev }
      switch (tag.kind) {
        case 'level': next.levels = prev.levels.filter((x) => x !== tag.value); break
        case 'layer': next.layers = prev.layers.filter((x) => x !== tag.value); break
        case 'department': next.departments = prev.departments.filter((x) => x !== tag.value); break
        case 'system': next.systems = prev.systems.filter((x) => x !== tag.value); break
        case 'category': next.categories = prev.categories.filter((x) => x !== tag.value); break
        case 'rootCause': next.rootCauses = prev.rootCauses.filter((x) => x !== tag.value); break
        case 'id': next.ids = (prev.ids || []).filter((x) => x !== tag.value); break
        case 'dateRange': {
          const d = defaultFilters(); next.dateFrom = d.dateFrom; next.dateTo = d.dateTo; break
        }
      }
      return next
    })
    setPage(1)
  }

  // 点击长耗时 TopN 跳转明细
  function jumpToRow(id: number) {
    const idx = sorted.findIndex((r) => r.id === id)
    if (idx < 0) return
    const p = Math.floor(idx / pageSize) + 1
    setPage(p)
    setHighlightId(id)
    setTimeout(() => {
      const el = document.getElementById(`fault-row-${id}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => setHighlightId(null), 3000)
      }
    }, 50)
  }

  const tags = activeTags(filters)
  const dateRangeLabel = `${formatDate(filters.dateFrom)} ~ ${formatDate(filters.dateTo)}`

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rice-100 p-6">
        <div className="max-w-md rounded-2xl border border-charcoal-900/5 bg-white p-8 text-center shadow-card">
          <AlertTriangle className="mx-auto text-chili-600" size={36} />
          <h2 className="mt-4 text-lg font-bold text-charcoal-900">数据加载失败</h2>
          <p className="mt-2 text-sm text-charcoal-500">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-chili-600 px-5 py-2 text-sm font-semibold text-white shadow">
            <RefreshCw size={14} />重新加载
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-rice-100 paper-noise">
      <div className="bg-charcoal-900 px-4 py-2 text-center text-xs font-semibold tracking-wide text-rice-100">
        2026 年故障记录可视化报表 · 公开静态页
      </div>
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
        {/* 标题区 */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-charcoal-900 lg:text-3xl">
              <BarChart3 className="text-chili-600" size={26} />
              {t('faultReport.title')}
            </h1>
            <p className="mt-1 text-sm text-charcoal-500">
              {t('faultReport.subtitle', { total: all.length, from: formatDate(minDate), to: formatDate(maxDate) })}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-charcoal-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm"><Calendar size={14} />{t('faultReport.data_updated', { date: updatedAt })}</span>
            <a className="hidden items-center gap-1 rounded-full border border-charcoal-900/10 bg-white px-3 py-1 text-charcoal-700 hover:bg-rice-50 sm:inline-flex" href="#/home"><ExternalLink size={13} />{t('faultReport.back_to_demo')}</a>
          </div>
        </header>

        {/* KPI */}
        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label={t('faultReport.kpi.total')} value={String(kpi.total)} sub={dateRangeLabel} />
          <KpiCard label={t('faultReport.kpi.p0')} value={String(kpi.p0)} sub={t('faultReport.kpi.p0_sub')} accent={kpi.p0 > 0 ? 'chili600' : undefined} />
          <KpiCard label={t('faultReport.kpi.p1')} value={String(kpi.p1)} sub={t('faultReport.kpi.p1_sub')} accent={kpi.p1 > 0 ? 'chili500' : undefined} />
          <KpiCard label={t('faultReport.kpi.mttr')} value={kpi.avgMttrMin == null ? '—' : (kpi.avgMttrMin / 60).toFixed(1) + 'h'} sub={t('faultReport.kpi.mttr_sub', { min: kpi.avgMttrMin == null ? 0 : Math.round(kpi.avgMttrMin) })} />
          <KpiCard label={t('faultReport.kpi.this_month')} value={String(kpi.thisMonthNew)} sub={t('faultReport.kpi.this_month_sub', { month: updatedAt.slice(0, 7) })} />
        </section>

        {/* 筛选条 */}
        <section className="mt-5 rounded-2xl border border-charcoal-900/5 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeQuick filters={filters} setFilters={setFilters} minDate={minDate} maxDate={maxDate} />
            <GrainSwitch grain={grain} setGrain={setGrain} />
            <MultiSelect label={t('faultReport.filter.level')} options={LEVELS.map((l) => ({ value: l, label: l }))} value={filters.levels as string[]} onChange={(v) => setFilters({ ...filters, levels: v as IncidentLevel[] })} openKey="level" openSelect={openSelect} setOpenSelect={setOpenSelect} />
            <MultiSelect label={t('faultReport.filter.layer')} options={LAYERS.map((l) => ({ value: l, label: l }))} value={filters.layers as string[]} onChange={(v) => setFilters({ ...filters, layers: v as IncidentLayer[] })} openKey="layer" openSelect={openSelect} setOpenSelect={setOpenSelect} />
            <MultiSelect label={t('faultReport.filter.department')} options={deptOpts.map((v) => ({ value: v, label: v }))} value={filters.departments} onChange={(v) => setFilters({ ...filters, departments: v })} withSearch openKey="dept" openSelect={openSelect} setOpenSelect={setOpenSelect} />
            <MultiSelect label={t('faultReport.filter.system')} options={sysOpts.map((v) => ({ value: v, label: v }))} value={filters.systems} onChange={(v) => setFilters({ ...filters, systems: v })} withSearch openKey="sys" openSelect={openSelect} setOpenSelect={setOpenSelect} />
            <MultiSelect label={t('faultReport.filter.category')} options={MERGED_CATEGORIES.map((v) => ({ value: v, label: v }))} value={filters.categories} onChange={(v) => setFilters({ ...filters, categories: v })} openKey="cat" openSelect={openSelect} setOpenSelect={setOpenSelect} />
            <MultiSelect label={t('faultReport.filter.root_cause')} options={rootOpts.map((v) => ({ value: v, label: v }))} value={filters.rootCauses} onChange={(v) => setFilters({ ...filters, rootCauses: v })} withSearch openKey="root" openSelect={openSelect} setOpenSelect={setOpenSelect} />
            <button onClick={reset} className="inline-flex items-center gap-1 rounded-full border border-charcoal-900/10 bg-white px-3 py-2 text-sm font-semibold text-charcoal-700 hover:bg-rice-50"><FilterX size={15} />{t('faultReport.filter.reset')}</button>
          </div>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-rice-100 px-3 py-1 text-xs text-charcoal-700">
                  <span className="text-charcoal-500">{tag.label}:</span><strong>{tag.valueLabel}</strong>
                  <button onClick={() => removeFilter(tag)} className="ml-1 rounded-full text-charcoal-500 hover:text-chili-600" aria-label="remove">×</button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 第一行 3 张图：时间趋势 / 等级 / 分类 */}
        <section className="mt-5 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title={t('faultReport.chart.trend')}>
            <TimeTrendChart buckets={timeBuckets} onDrill={(b) => drill({ dim: 'dateRange', value: { from: b.key, to: toYMD(b.end) } })} />
          </Card>
          <Card title={t('faultReport.chart.level')}>
            <LevelDonut buckets={levelBuckets} onDrill={(l) => drill({ dim: 'level', value: l })} />
          </Card>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t('faultReport.chart.category')}>
            <HBarChart items={catBuckets.map((c) => ({ key: c.category, label: c.category, count: c.count }))} onDrill={(k) => drill({ dim: 'category', value: k })} />
          </Card>
          <Card title={t('faultReport.chart.department')}>
            <HBarChart items={deptBuckets.map((c) => ({ key: c.key, label: c.key, count: c.count, merged: c.merged }))} onDrill={(k) => k !== '其他' && drill({ dim: 'department', value: k })} />
          </Card>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t('faultReport.chart.root_cause')}>
            <HBarChart items={rootBuckets.map((c) => ({ key: c.key, label: c.key, count: c.count, merged: c.merged }))} onDrill={(k) => k !== '其他' && drill({ dim: 'rootCause', value: k })} />
          </Card>
          <Card title={t('faultReport.chart.system')}>
            <HBarChart items={sysBuckets.map((c) => ({ key: c.key, label: c.key, count: c.count, merged: c.merged }))} onDrill={(k) => k !== '其他' && drill({ dim: 'system', value: k })} />
          </Card>
        </section>

        <section className="mt-4">
          <Card title={t('faultReport.chart.longest')}>
            <LongestList items={longTop} onJump={jumpToRow} />
          </Card>
        </section>

        {/* 明细表格 */}
        <section className="mt-4 rounded-2xl border border-charcoal-900/5 bg-white shadow-card">
          <div className="flex items-center justify-between p-4 pb-2">
            <h3 className="text-base font-bold text-charcoal-900">{t('faultReport.detail.title')}</h3>
            <span className="text-xs text-charcoal-500">{t('faultReport.detail.hit', { count: filtered.length })} · {t('faultReport.detail.page_size', { size: pageSize })}</span>
          </div>
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[1280px] w-full text-sm">
              <thead className="bg-rice-50 text-charcoal-500">
                <tr className="text-left">
                  <Th onSort={() => toggleSort("id", sortDir, setSortKey, setSortDir)} sortDir={sortKey === 'id' ? sortDir : null}>{t('faultReport.col.id')}</Th>
                  <Th onSort={() => toggleSort("startTime", sortDir, setSortKey, setSortDir)} sortDir={sortKey === 'startTime' ? sortDir : null}>{t('faultReport.col.start')}</Th>
                  <Th onSort={() => toggleSort("recoverTime", sortDir, setSortKey, setSortDir)} sortDir={sortKey === 'recoverTime' ? sortDir : null}>{t('faultReport.col.recover')}</Th>
                  <Th onSort={() => toggleSort("durationMin", sortDir, setSortKey, setSortDir)} sortDir={sortKey === 'durationMin' ? sortDir : null}>{t('faultReport.col.duration')}</Th>
                  <th className="px-3 py-2 font-medium">{t('faultReport.col.layer')}</th>
                  <th className="px-3 py-2 font-medium">{t('faultReport.col.department')}</th>
                  <th className="px-3 py-2 font-medium">{t('faultReport.col.system')}</th>
                  <th className="px-3 py-2 font-medium">{t('faultReport.col.category')}</th>
                  <th className="px-3 py-2 font-medium">{t('faultReport.col.level')}</th>
                  <th className="px-3 py-2 font-medium">{t('faultReport.col.root_cause')}</th>
                  <th className="px-3 py-2 font-medium max-w-[240px]">{t('faultReport.col.impact')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-charcoal-500">{t('faultReport.detail.empty')}</td></tr>
                ) : pageRows.map((r) => (
                  <tr key={r.id} id={`fault-row-${r.id}`} className={cn('border-t border-charcoal-900/5 transition-colors', highlightId === r.id ? 'bg-amber-100' : 'hover:bg-rice-50')}>
                    <td className="px-3 py-2 font-mono text-charcoal-700">{r.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.startTime)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.recoverTime)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-semibold text-charcoal-900">{r.durationMin ?? '—'}</span>
                      <span className="ml-1 text-xs text-charcoal-500">{r.durationMin != null ? `(${formatDuration(r.durationMin)})` : ''}</span>
                    </td>
                    <td className="px-3 py-2"><LayerBadge layer={r.layer as IncidentLayer} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.department}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.system}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.incidentCategory}</td>
                    <td className="px-3 py-2"><LevelBadge level={r.level} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.rootCause}</td>
                    <td className="px-3 py-2 max-w-[260px]">
                      <div className="truncate" title={r.impact ?? ''}>{r.impact || '—'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 分页 */}
          <div className="flex items-center justify-between p-3 text-sm text-charcoal-500">
            <span>{t('faultReport.pager.total', { total: sorted.length })}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-full border border-charcoal-900/10 px-3 py-1 disabled:opacity-40">{t('faultReport.pager.prev')}</button>
              <span>{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-full border border-charcoal-900/10 px-3 py-1 disabled:opacity-40">{t('faultReport.pager.next')}</button>
            </div>
          </div>
        </section>

        <footer className="mt-6 rounded-2xl border border-charcoal-900/5 bg-white p-4 text-xs text-charcoal-500 shadow-sm">
          {t('faultReport.footer', { source })}
        </footer>
      </div>
    </div>
  )
}

// ---- helpers ----
type FilterTag = { kind: 'level' | 'layer' | 'department' | 'system' | 'category' | 'rootCause' | 'id' | 'dateRange'; value: string | number; label: string; valueLabel: string }

function activeTags(f: FaultFilters): FilterTag[] {
  const tags: FilterTag[] = []
  const df = defaultFilters()
  if (!(f.dateFrom === df.dateFrom && f.dateTo === df.dateTo)) {
    tags.push({ kind: 'dateRange', value: `${f.dateFrom}~${f.dateTo}`, label: '时间范围', valueLabel: `${f.dateFrom} ~ ${f.dateTo}` })
  }
  const add = (kind: FilterTag['kind'], vals: (string | number)[], label: string) => {
    for (const v of vals) tags.push({ kind, value: v, label, valueLabel: String(v) })
  }
  add('level', f.levels, '等级')
  add('layer', f.layers, '层级')
  add('department', f.departments, '部门')
  add('system', f.systems, '系统')
  add('category', f.categories, '分类')
  add('rootCause', f.rootCauses, '根因')
  if (f.ids) add('id', f.ids, '故障ID')
  return tags
}

function toggleSort(key: SortKey, currentDir: SortDir, setKey: (k: SortKey) => void, setDir: (d: SortDir) => void) {
  setKey(key)
  setDir(currentDir == null ? "asc" : currentDir === "asc" ? "desc" : null)
}

// ---- 子组件 ----
function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-charcoal-900/5 bg-white p-4 shadow-card', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-charcoal-900">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'chili600' | 'chili500' }) {
  const accentCls = accent === 'chili600' ? 'text-chili-600' : accent === 'chili500' ? 'text-chili-500' : 'text-charcoal-900'
  return (
    <div className="rounded-2xl border border-charcoal-900/5 bg-white p-4 shadow-card">
      <p className="text-xs text-charcoal-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-black', accentCls)}>{value}</p>
      {sub && <p className="mt-1 truncate text-[11px] text-charcoal-500">{sub}</p>}
    </div>
  )
}

function GrainSwitch({ grain, setGrain }: { grain: TimeGrain; setGrain: (g: TimeGrain) => void }) {
  const opts: { k: TimeGrain; label: string }[] = [{ k: 'month', label: '月' }, { k: 'week', label: '周' }, { k: 'day', label: '日' }]
  return (
    <div className="inline-flex rounded-full border border-charcoal-900/10 bg-rice-50 p-1 text-xs">
      {opts.map((o) => (
        <button key={o.k} onClick={() => setGrain(o.k)} className={cn('rounded-full px-3 py-1 font-semibold', grain === o.k ? 'bg-charcoal-900 text-white' : 'text-charcoal-700')}>{o.label}</button>
      ))}
    </div>
  )
}

function DateRangeQuick({ filters, setFilters, minDate, maxDate }: { filters: FaultFilters; setFilters: (f: FaultFilters) => void; minDate: string; maxDate: string }) {
  const apply = (from: string, to: string) => setFilters({ ...filters, dateFrom: from, dateTo: to })
  const today = new Date()
  const ytdStart = `${today.getFullYear()}-01-01`
  const qStartMonth = Math.floor(today.getMonth() / 3) * 3
  const qStart = toYMD(new Date(today.getFullYear(), qStartMonth, 1))
  const qEnd = toYMD(endOfMonth(today))
  const mStart = toYMD(startOfMonth(today))
  const mEnd = toYMD(endOfMonth(today))
  const presets: { label: string; from: string; to: string }[] = [
    { label: 'YTD', from: ytdStart, to: maxDate },
    { label: '本季度', from: qStart > maxDate ? minDate : qStart, to: qEnd > maxDate ? maxDate : qEnd },
    { label: '本月', from: mStart > maxDate ? minDate : mStart, to: mEnd > maxDate ? maxDate : mEnd },
  ]
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-full border border-charcoal-900/10 bg-white px-3 py-2 text-sm text-charcoal-700 hover:bg-rice-50">
        <Calendar size={14} />{filters.dateFrom} ~ {filters.dateTo}<ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-2 w-[280px] rounded-xl border border-charcoal-900/10 bg-white p-3 shadow-card">
            <div className="mb-2 flex gap-1">
              {presets.map((p) => (
                <button key={p.label} onClick={() => { apply(p.from, p.to); setOpen(false) }} className="flex-1 rounded-full border border-charcoal-900/10 px-2 py-1 text-xs hover:bg-rice-50">{p.label}</button>
              ))}
            </div>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2"><span className="w-14 text-charcoal-500">起</span><input type="date" min={minDate} max={maxDate} value={filters.dateFrom} onChange={(e) => apply(e.target.value, filters.dateTo)} className="flex-1 rounded border border-charcoal-900/10 px-2 py-1" /></label>
              <label className="flex items-center gap-2"><span className="w-14 text-charcoal-500">止</span><input type="date" min={minDate} max={maxDate} value={filters.dateTo} onChange={(e) => apply(filters.dateFrom, e.target.value)} className="flex-1 rounded border border-charcoal-900/10 px-2 py-1" /></label>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MultiSelect({ label, options, value, onChange, withSearch, openKey, openSelect, setOpenSelect }: {
  label: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; withSearch?: boolean;
  openKey: string; openSelect: string | null; setOpenSelect: (k: string | null) => void;
}) {
  const [q, setQ] = useState('')
  const open = openSelect === openKey
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v))
    else onChange([...value, v])
  }
  const filtered = withSearch ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options
  return (
    <div className="relative">
      <button onClick={() => setOpenSelect(open ? null : openKey)} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-2 text-sm', value.length ? 'border-chili-500/40 bg-chili-50 text-chili-700' : 'border-charcoal-900/10 bg-white text-charcoal-700 hover:bg-rice-50')}>
        {label}{value.length > 0 && <span className="rounded-full bg-chili-500 px-1.5 text-[10px] font-bold text-white">{value.length}</span>}<ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpenSelect(null)} />
          <div className="absolute left-0 top-full z-20 mt-2 w-[220px] max-h-[320px] overflow-auto rounded-xl border border-charcoal-900/10 bg-white p-2 shadow-card">
            {withSearch && <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索" className="mb-1 w-full rounded border border-charcoal-900/10 px-2 py-1 text-xs" />}
            {filtered.length === 0 && <p className="px-2 py-2 text-xs text-charcoal-500">无匹配项</p>}
            {filtered.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-rice-50">
                <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="accent-chili-600" />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Th({ children, onSort, sortDir }: { children: React.ReactNode; onSort: () => void; sortDir: SortDir }) {
  return (
    <th className="px-3 py-2 font-medium">
      <button onClick={onSort} className="inline-flex items-center gap-1 hover:text-chili-600">
        {children}
        {sortDir === 'asc' ? <ArrowUpDown size={12} /> : sortDir === 'desc' ? <ArrowDownUp size={12} /> : <ArrowUpDown size={12} className="opacity-30" />}
      </button>
    </th>
  )
}

function LevelBadge({ level }: { level: IncidentLevel }) {
  const c = LEVEL_COLORS[level]
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white', c.bg)}><span className="h-1.5 w-1.5 rounded-full bg-white/80" />{level}</span>
}

function LayerBadge({ layer }: { layer: IncidentLayer }) {
  const map: Record<IncidentLayer, string> = {
    IaaS: 'bg-charcoal-700 text-white',
    PaaS: 'bg-amber-500 text-white',
    SaaS: 'bg-rice-200 text-charcoal-900',
  }
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', map[layer])}>{layer}</span>
}

// ---- 图表：时间趋势堆叠柱 ----
function TimeTrendChart({ buckets, onDrill }: { buckets: ReturnType<typeof groupByTime>; onDrill: (b: ReturnType<typeof groupByTime>[number]) => void }) {
  if (!buckets.length) return <EmptyChart />
  const W = 640, H = 240, P = { t: 16, r: 12, b: 28, l: 32 }
  const iw = W - P.l - P.r, ih = H - P.t - P.b
  const max = Math.max(1, ...buckets.map((b) => b.total))
  const bw = iw / buckets.length * 0.7
  const gap = iw / buckets.length * 0.3
  const yTicks = 4
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {[...Array(yTicks + 1)].map((_, i) => {
          const y = P.t + ih - (ih * i) / yTicks
          return <g key={i}><line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="#e8dfce" strokeDasharray="3 3" /><text x={P.l - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#5f5b55">{Math.round((max * i) / yTicks)}</text></g>
        })}
        {buckets.map((b, i) => {
          const x0 = P.l + gap / 2 + i * (bw + gap)
          const totalH = (b.total / max) * ih
          let yCur = P.t + ih - totalH
          const segs: { lvl: IncidentLevel; h: number; y: number }[] = []
          for (const lvl of LEVELS) {
            const h = (b.byLevel[lvl] / max) * ih
            if (h > 0) { segs.push({ lvl, h, y: yCur }); yCur += h }
          }
          return (
            <g key={b.key} className="cursor-pointer" onClick={() => onDrill(b)}>
              {segs.map((s, k) => <rect key={k} x={x0} y={s.y} width={bw} height={s.h} fill={LEVEL_COLORS[s.lvl].hex} rx={2}>
                <title>{b.label}：{s.lvl} {b.byLevel[s.lvl]} 条；合计 {b.total} 条；平均 MTTR {b.avgMttrMin == null ? '—' : formatDuration(Math.round(b.avgMttrMin))}</title>
              </rect>)}
              <text x={x0 + bw / 2} y={P.t + ih - totalH - 4} textAnchor="middle" fontSize={10} fill="#34312d">{b.total || ''}</text>
              <text x={x0 + bw / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#5f5b55">{b.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-charcoal-500">
        {LEVELS.map((l) => <span key={l} className="inline-flex items-center gap-1"><span className={cn('inline-block h-2 w-2 rounded-sm', LEVEL_COLORS[l].dot)} />{l}</span>)}
        <span className="ml-auto text-[11px] text-charcoal-500">点击柱子按时间下钻</span>
      </div>
    </div>
  )
}

// ---- 环图：等级 ----
function LevelDonut({ buckets, onDrill }: { buckets: ReturnType<typeof groupByLevel>; onDrill: (l: IncidentLevel) => void }) {
  const total = buckets.reduce((s, b) => s + b.count, 0)
  const [hover, setHover] = useState<IncidentLevel | null>(null)
  if (total === 0) return <EmptyChart />
  const size = 200, cx = size / 2, cy = size / 2, r = 78, rInner = 52
  let acc = 0
  const segs: { level: IncidentLevel; count: number; d: string; pct: number }[] = buckets.map((b) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2
    acc += b.count
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2
    const large = end - start > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end)
    const xi1 = cx + rInner * Math.cos(end), yi1 = cy + rInner * Math.sin(end)
    const xi2 = cx + rInner * Math.cos(start), yi2 = cy + rInner * Math.sin(start)
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${rInner} ${rInner} 0 ${large} 0 ${xi2} ${yi2} Z`
    return { ...b, d, pct: (b.count / total) * 100 }
  })
  const focus = hover != null ? buckets.find((b) => b.level === hover) : null
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-around">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {segs.map((s) => (
          <path key={s.level} d={s.d} fill={LEVEL_COLORS[s.level].hex} className="cursor-pointer transition-opacity hover:opacity-80"
            onMouseEnter={() => setHover(s.level)} onMouseLeave={() => setHover(null)} onClick={() => onDrill(s.level)}>
            <title>{s.level}：{s.count}（{s.pct.toFixed(1)}%）</title>
          </path>
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={12} fill="#5f5b55">{focus ? focus.level : '总数'}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={24} fontWeight={800} fill="#211f1c">{focus ? focus.count : total}</text>
        {focus && <text x={cx} y={cy + 34} textAnchor="middle" fontSize={11} fill="#5f5b55">{((focus.count / total) * 100).toFixed(1)}%</text>}
      </svg>
      <ul className="w-full space-y-2 text-sm sm:w-auto">
        {segs.map((s) => (
          <li key={s.level}>
            <button onClick={() => onDrill(s.level)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 hover:bg-rice-50">
              <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', LEVEL_COLORS[s.level].dot)} />
              <span className="font-semibold text-charcoal-900">{s.level}</span>
              <span className="ml-auto text-charcoal-500">{s.count} <span className="text-xs">({s.pct.toFixed(1)}%)</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- 水平柱图 ----
function HBarChart({ items, onDrill }: { items: { key: string; label: string; count: number; merged?: { key: string; count: number }[] }[]; onDrill: (k: string) => void }) {
  if (!items.length) return <EmptyChart />
  const max = Math.max(...items.map((i) => i.count))
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const pct = (it.count / max) * 100
        const isOther = it.key === '其他'
        const title = it.merged ? `${it.label}：${it.count}（含 ${it.merged.map((m) => `${m.key}×${m.count}`).join('，')}）` : `${it.label}：${it.count}`
        return (
          <li key={it.key}>
            <button onClick={() => onDrill(it.key)} disabled={isOther} className={cn('group flex w-full items-center gap-2 text-left', isOther ? 'cursor-default' : 'cursor-pointer hover:opacity-80')}>
              <span className="w-32 shrink-0 truncate text-xs text-charcoal-700" title={title}>{it.label}</span>
              <span className="relative h-6 flex-1 overflow-hidden rounded bg-rice-50">
                <span className={cn('absolute left-0 top-0 h-full', isOther ? 'bg-charcoal-500/50' : 'bg-charcoal-700 group-hover:bg-chili-600')} style={{ width: `${pct}%` }} />
                <span className="absolute inset-y-0 right-2 inline-flex items-center text-xs font-semibold text-charcoal-900">{it.count}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ---- 长耗时 TopN ----
function LongestList({ items, onJump }: { items: FaultRecord[]; onJump: (id: number) => void }) {
  if (!items.length) return <EmptyChart />
  const max = Math.max(...items.map((i) => i.durationMin as number))
  return (
    <ul className="divide-y divide-charcoal-900/5">
      {items.map((r, idx) => {
        const w = ((r.durationMin as number) / max) * 100
        return (
          <li key={r.id}>
            <button onClick={() => onJump(r.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-rice-50">
              <span className="w-6 text-center text-xs font-bold text-charcoal-500">#{idx + 1}</span>
              <span className="w-16 shrink-0">{<LevelBadge level={r.level} />}</span>
              <span className="w-40 shrink-0 truncate text-sm font-semibold text-charcoal-900" title={r.system}>{r.system}</span>
              <span className="w-24 shrink-0 text-xs text-charcoal-500">{formatDate(r.startTime)}</span>
              <span className="relative h-5 flex-1 overflow-hidden rounded bg-rice-50">
                <span className="absolute left-0 top-0 h-full bg-chili-500/80" style={{ width: `${w}%` }} />
              </span>
              <span className="w-24 shrink-0 text-right text-sm font-bold text-chili-600">{formatDuration(r.durationMin)}</span>
            </button>
            <p className="ml-14 truncate pr-2 pb-1 text-[11px] text-charcoal-500" title={r.impact ?? ''}>{r.impact || '—'}</p>
          </li>
        )
      })}
    </ul>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-charcoal-900/10 bg-rice-50 text-sm text-charcoal-500">
      <Clock className="mr-2" size={16} />当前筛选下暂无数据
    </div>
  )
}
