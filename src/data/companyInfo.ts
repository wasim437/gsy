// The Company Info questions (same as the Excel's "Company Info" sheet). Answers are saved in the settings table.

export interface Question {
  topic: string
  q: string
  kind: 'text' | 'list' | 'number' | 'money' | 'month'
  options?: string[]
  required: boolean
  help: string
  suggested?: string
}

export const QUESTIONS: Question[] = [
  { topic: 'Contacts', q: 'Chairman – full name', kind: 'text', required: true, help: 'As it should appear in the app.' },
  { topic: 'Contacts', q: 'Chairman – email', kind: 'text', required: true, help: 'Used to sign in to the app.' },
  { topic: 'Contacts', q: 'Chairman – mobile number', kind: 'text', required: true, help: 'Include country code.' },
  { topic: 'Contacts', q: 'Main contact for this data – name and mobile', kind: 'text', required: true, help: 'The person we can ask about the figures.' },
  { topic: 'Contacts', q: 'IT contact – name and email', kind: 'text', required: false, help: 'For the folder and email setup.' },
  { topic: 'System accounts', q: 'Project email for the system accounts', kind: 'text', required: true, help: 'The database, hosting and Google Cloud accounts are created on this email.' },
  { topic: 'System accounts', q: 'Where will this Excel file be kept?', kind: 'list', options: ['SharePoint', 'OneDrive', 'Google Drive', 'On a computer (we upload it)'], required: false, help: 'Only needed if you still use the Excel.' },
  { topic: 'System accounts', q: 'Link to that folder', kind: 'text', required: false, help: '' },
  { topic: 'System accounts', q: 'Web address for the app (optional)', kind: 'text', required: false, help: 'e.g. monitor.yourcompany.com' },
  { topic: 'Your systems', q: 'CRM software name', kind: 'text', required: true, help: 'The system the sales team uses.' },
  { topic: 'Your systems', q: 'Can the CRM export to Excel?', kind: 'list', options: ['Yes', 'No', 'Not sure'], required: true, help: '' },
  { topic: 'Your systems', q: 'Does the CRM have an API (automatic connection)?', kind: 'list', options: ['Yes', 'No', 'Not sure'], required: true, help: 'Ask the CRM provider if unsure.' },
  { topic: 'Your systems', q: 'Accounting software name', kind: 'text', required: true, help: 'Used for expenses.' },
  { topic: 'Your systems', q: 'Banks you use', kind: 'text', required: true, help: 'e.g. Bank A, Bank B' },
  { topic: 'Your systems', q: 'Can you download bank statements as Excel or CSV?', kind: 'list', options: ['Yes', 'No', 'Not sure'], required: true, help: '' },
  { topic: 'Payout rules', q: 'On which day is the monthly profit paid?', kind: 'list', options: ['Same date as the contract start', 'A fixed day every month'], required: true, help: '' },
  { topic: 'Payout rules', q: 'If a fixed day, which day of the month?', kind: 'number', required: false, help: 'A number from 1 to 28.' },
  { topic: 'Payout rules', q: 'How many days late before a payout is "overdue"?', kind: 'number', required: true, help: 'Suggested: 2', suggested: '2' },
  { topic: 'Commission rules', q: 'Is the company commission charged on the full invested amount every month?', kind: 'list', options: ['Yes', 'No'], required: true, help: '' },
  { topic: 'Commission rules', q: 'If No, how is the company commission charged?', kind: 'text', required: false, help: 'Explain in a few words.' },
  { topic: 'Commission rules', q: 'If a contract closes early, does the investor pay a penalty?', kind: 'list', options: ['Yes', 'No'], required: true, help: '' },
  { topic: 'Commission rules', q: 'If yes, how is the penalty calculated?', kind: 'text', required: false, help: 'e.g. 2% of the amount' },
  { topic: 'Commission rules', q: 'If a contract closes early, is the salesperson’s commission taken back?', kind: 'list', options: ['Yes – fully', 'Yes – partly', 'No'], required: true, help: '' },
  { topic: 'Commission rules', q: 'Is salesperson commission paid again when an investor renews a contract?', kind: 'list', options: ['Yes', 'No'], required: true, help: '' },
  { topic: 'Commission rules', q: 'Can one investment pay commission to two salespeople (e.g. a staff member and a freelancer)?', kind: 'list', options: ['No', 'Yes'], required: true, help: '' },
  { topic: 'Commission rules', q: 'If yes, how is the commission split between them?', kind: 'text', required: false, help: 'e.g. 50% each' },
  { topic: 'Exchange rates', q: 'Which exchange rate do you use?', kind: 'list', options: ['Bank rate', 'Central bank rate', 'Accounting system rate', 'Other'], required: true, help: '' },
  { topic: 'Exchange rates', q: 'Who updates the exchange rates each month?', kind: 'text', required: true, help: 'Name of the person.' },
  { topic: 'Alerts', q: 'Warn the Chairman when cash covers less than … times the next 3 months of payouts', kind: 'number', required: true, help: 'Suggested: 1.2', suggested: '1.2' },
  { topic: 'Alerts', q: 'Alert when a single payout is above (AED)', kind: 'money', required: true, help: 'Suggested: 2,000,000', suggested: '2000000' },
  { topic: 'Alerts', q: 'Alert when a new investment is above (AED)', kind: 'money', required: true, help: 'Suggested: 500,000', suggested: '500000' },
  { topic: 'Alerts', q: 'Platinum investor = total invested above (AED)', kind: 'money', required: true, help: 'Suggested: 1,000,000', suggested: '1000000' },
  { topic: 'Alerts', q: 'Gold investor = total invested above (AED)', kind: 'money', required: true, help: 'Suggested: 300,000', suggested: '300000' },
  { topic: 'Reports', q: 'Time for the daily report', kind: 'text', required: true, help: 'Suggested: 9:00 PM', suggested: '9:00 PM' },
  { topic: 'Reports', q: 'Time for the morning brief', kind: 'text', required: true, help: 'Suggested: 8:00 AM', suggested: '8:00 AM' },
  { topic: 'Reports', q: 'Also send reports on WhatsApp?', kind: 'list', options: ['No – email only', 'Yes – extra cost applies'], required: true, help: '', suggested: 'No – email only' },
  { topic: 'Investor statements', q: 'Company name to show on statements', kind: 'text', required: true, help: 'Printed at the top of every investor statement.' },
  { topic: 'Investor statements', q: 'Address, phone and email to show on statements', kind: 'text', required: true, help: '' },
  { topic: 'Investor statements', q: 'Licence or TRN number to show on statements', kind: 'text', required: false, help: 'Optional.' },
  { topic: 'Investor statements', q: 'Logo for statements', kind: 'list', options: ['Use the logo from our website', 'We will send a high-quality logo'], required: true, help: '', suggested: 'Use the logo from our website' },
  { topic: 'Investor statements', q: 'Signature area on statements', kind: 'list', options: ['Signature line only', 'Stamp and signature', 'None'], required: true, help: '', suggested: 'Stamp and signature' },
  { topic: 'Testing', q: 'A month that Accounts has already checked', kind: 'month', required: true, help: 'We compare the app’s totals with this month before approval.' },
]

/** Stable settings key for a question (works for the Excel text too, which may add " (optional)"). */
export const qkey = (q: string) =>
  q.replace(/\s*\(optional\)\s*$/i, '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
