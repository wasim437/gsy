// One build serves two addresses: the Chairman's dashboard and the Admin Portal for data entry.
// The address decides which side opens; on localhost both work (/portal, or admin.localhost:5173).

const env = import.meta.env as Record<string, string | undefined>
const host = typeof location === 'undefined' ? '' : location.hostname

export const DASHBOARD_URL = (env.VITE_DASHBOARD_URL || 'https://gsy-monitor.vercel.app').replace(/\/$/, '')
export const ADMIN_URL = (env.VITE_ADMIN_URL || 'https://gsy-admin.vercel.app').replace(/\/$/, '')

const adminHost = (() => { try { return new URL(ADMIN_URL).hostname } catch { return '' } })()

/** True on the Admin Portal address (gsy-admin…, admin.localhost). */
export const isAdminSite = host === adminHost || /(^|[.-])admin([.-]|$)/.test(host)
export const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')

/** Path prefix of portal pages: the admin address serves them at the root. */
export const PORTAL_BASE = isAdminSite ? '' : '/portal'
export const portalPath = (section = '') => `${PORTAL_BASE}/${section}`.replace(/\/$/, '') || '/'

/** Where the "Admin Portal" link goes from the dashboard, and back. */
export const adminHref = (section = '') => (isLocal && !isAdminSite ? `/portal/${section}` : `${ADMIN_URL}/${section}`)
export const dashboardHref = !isLocal ? `${DASHBOARD_URL}/` : isAdminSite ? `${location.protocol}//localhost:${location.port}/` : '/'
