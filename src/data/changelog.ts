// App updates, newest first. Add an entry with every release: it shows under Admin Portal → History,
// and once to each person after the update reaches them.

export interface Release { version: string; date: string; title: string; items: string[] }

export const CHANGELOG: Release[] = [
  {
    version: '1.5', date: '2026-11-03', title: 'Separate Admin Portal, dark mode and Excel-style entry',
    items: [
      'Two addresses: the dashboard for the Chairman, and the Admin Portal for data entry. Same password on both.',
      'Light and dark mode on every page; your choice is remembered on this device.',
      'Sheet view in the Admin Portal: type straight into rows like Excel, paste rows copied from Excel, save all at once.',
      'Secure sign-in on both sites: press and hold to sign in, a 5-minute lock after 5 wrong passwords, and sign-out after 30 minutes without activity.',
      'History: every change is saved with who made it, when, and the old and new values.',
      'Invite links for new people, ready to copy or send on WhatsApp.',
      'A “new update” notice appears when a newer version is published.',
    ],
  },
  {
    version: '1.4', date: '2026-11-03', title: 'Security check before the Admin Portal',
    items: ['Press and hold to confirm you are not a robot before data entry opens.'],
  },
  {
    version: '1.3', date: '2026-11-03', title: 'Live database, real sign-in and the Admin Portal',
    items: [
      'All data is saved in GSY’s own Supabase database.',
      'Named accounts approved by the Chairman, with roles and country limits.',
      'Admin Portal forms for every sheet of the GSY data-entry Excel.',
    ],
  },
  {
    version: '1.2', date: '2026-11-02', title: 'GSY’s Excel feeds the dashboards',
    items: ['Upload the filled GSY_Data_Entry.xlsx and every dashboard uses it, with a check of missing or mistyped values.'],
  },
  {
    version: '1.1', date: '2026-10-30', title: 'Roles, mobile and advanced visuals',
    items: ['The Chairman creates roles and decides what each can see.', 'Money flow, stress test, portfolio and sales analytics.', 'Phone layout for every page.'],
  },
  {
    version: '1.0', date: '2026-10-30', title: 'First preview of the GSY Investor Monitor',
    items: ['Home, cash flow, investments, payouts, contracts, investors, commissions, reminders and reports.'],
  },
]

export const APP_VERSION = CHANGELOG[0].version
