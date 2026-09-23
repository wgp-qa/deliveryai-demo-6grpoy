import { useEffect } from 'react'
import type { ViewName } from '@/types'

// 主流程视图与 URL hash 的一一映射：home → welcome → menu → order → checkout。
// 用 hash 路由（而非 History 路由）以兼容 Vite base './' 与 GitHub Pages 子路径部署：
// hash 不会发往服务器，静态托管只需返回 index.html，dist 直接 file:// 打开也能路由。
// 附加：fault-report-2026 为公开静态报表页，无需桌台即可访问。
const VIEWS: ViewName[] = ['home', 'welcome', 'menu', 'order', 'checkout', 'fault-report-2026']

export const PUBLIC_VIEWS: ViewName[] = ['home', 'fault-report-2026']

export const viewToHash = (view: ViewName) => `#/${view}`

export const hashToView = (hash: string): ViewName | null => {
  const name = hash.replace(/^#\/?/, '')
  return (VIEWS as string[]).includes(name) ? (name as ViewName) : null
}

/** 读取 URL hash 请求的初始视图；无有效 hash 时返回 null。 */
export function initialViewFromHash(): ViewName | null {
  if (typeof window === 'undefined') return null
  return hashToView(window.location.hash)
}

interface UseViewRouteOptions {
  /** 将 hash 驱动的导航（浏览器前进/后退或手动改地址）应用到应用状态。 */
  onNavigate: (view: ViewName) => void
  /** 当前状态下某视图是否可达；不可达的请求回落到 home（内存态应用无桌台时无法进入点餐流程）。 */
  canView?: (view: ViewName) => boolean
}

/**
 * 保持当前视图与 URL hash 双向同步。
 */
export function useViewRoute(view: ViewName, { onNavigate, canView }: UseViewRouteOptions) {
  useEffect(() => {
    const target = viewToHash(view)
    if (window.location.hash === target) return
    if (hashToView(window.location.hash)) {
      window.location.hash = target
    } else {
      window.history.replaceState(null, '', target)
    }
  }, [view])

  useEffect(() => {
    const handler = () => {
      const requested = hashToView(window.location.hash)
      const target = requested && (!canView || canView(requested)) ? requested : 'home'
      if (target !== requested) {
        window.history.replaceState(null, '', viewToHash(target))
      }
      if (target !== view) onNavigate(target)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [view, onNavigate, canView])
}
