import { useSyncExternalStore } from 'react'
import { applyChartTheme } from '../components/charts'

export type Theme = 'light' | 'dark'
const KEY = 'gsy.theme'
const listeners = new Set<() => void>()

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage blocked */ }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let current: Theme = initial()

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0b1220' : '#0f1d33')
  applyChartTheme(t === 'dark')
}
apply(current)

export function setTheme(t: Theme) {
  current = t
  try { localStorage.setItem(KEY, t) } catch { /* storage blocked */ }
  apply(t)
  listeners.forEach((l) => l())
}

export const toggleTheme = () => setTheme(current === 'dark' ? 'light' : 'dark')

export function useTheme(): Theme {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => current)
}
