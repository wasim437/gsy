// One build serves two addresses: the Chairman's dashboard and the Admin Portal for data entry.
// The address decides which side opens; on localhost both work (/portal, or admin.localhost:5173).

const env = import.meta.env as Record<string, string | undefined>
const host = typeof location === 'undefined' ? '' : location.hostname

export const DASHBOARD_URL = (env.VITE_DASHBOARD_URL || 'https://gsyinvestorportal.vercel.app').replace(/\/$/, '')
/** Optional own address for the Admin Portal (e.g. https://gsy-admin.vercel.app). Without it the portal lives at /portal. */
export const ADMIN_URL = (env.VITE_ADMIN_URL || '').replace(/\/$/, '')

const adminHost = (() => { try { return ADMIN_URL ? new URL(ADMIN_URL).hostname : '' } catch { return '' } })()

/** True on the Admin Portal's own address (any host with "admin" in its name, e.g. gsy-admin.vercel.app, admin.localhost). */
export const isAdminSite = (adminHost !== '' && host === adminHost) || /(^|[.-])admin([.-]|$)/.test(host)
export const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
/** The dashboard links out to a separate admin address only when one is configured. */
export const adminSeparate = ADMIN_URL !== '' && !isLocal

/** Path prefix of portal pages: the admin address serves them at the root. */
export const PORTAL_BASE = isAdminSite ? '' : '/portal'
export const portalPath = (section = '') => `${PORTAL_BASE}/${section}`.replace(/\/$/, '') || '/'

/** Where the "Admin Portal" link goes from the dashboard, and back. */
export const adminHref = (section = '') => (adminSeparate ? `${ADMIN_URL}/${section}` : isAdminSite ? `/${section}` : `/portal/${section}`)
export const dashboardHref = !isAdminSite ? '/' : isLocal ? `${location.protocol}//localhost:${location.port}/` : `${DASHBOARD_URL}/`
/** Full address of the Admin Portal, for invite messages. */
export const ADMIN_HOME = ADMIN_URL || `${DASHBOARD_URL}/portal`
