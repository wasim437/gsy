import { Check, Crown, History, Minus, Pencil, Power, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Badge, Btn, Card, Kpi, PageHeader, TableWrap } from '../components/ui'
import { PERMISSIONS, ROLES, ROLE_DEFAULTS, can, useStore, type Permission, type Role, type User } from '../data/store'
import type { CountryCode } from '../data/types'
import { fmtDate } from '../lib/dates'

const blank = (by: string): User => ({
  id: `U${Date.now().toString(36)}`, name: '', email: '', role: 'Vice Chairman', permissions: ROLE_DEFAULTS['Vice Chairman'],
  countries: [], status: 'Active', twoStep: true, createdBy: by, createdAt: new Date().toISOString().slice(0, 10), lastSignIn: null,
})

export default function Admin() {
  const { users, user, upsertUser, removeUser, audit, ds } = useStore()
  const [edit, setEdit] = useState<User | null>(null)
  if (!can(user, 'manageUsers')) return <Card><p className="text-sm text-muted">You don’t have access to user management.</p></Card>

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Users & Access"
        subtitle="The Chairman has full control: create users, choose what each person can see and do, limit them to a country, or switch them off."
        actions={<Btn icon={<UserPlus size={15} />} onClick={() => setEdit(blank(user!.name))}>Add user</Btn>}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Users"><span className="num text-2xl font-semibold sm:text-3xl">{users.length}</span></Kpi>
        <Kpi label="Active" accent="good"><span className="num text-2xl font-semibold sm:text-3xl text-good">{users.filter((u) => u.status === 'Active').length}</span></Kpi>
        <Kpi label="Disabled"><span className="num text-2xl font-semibold sm:text-3xl">{users.filter((u) => u.status === 'Disabled').length}</span></Kpi>
        <Kpi label="Country-limited"><span className="num text-2xl font-semibold sm:text-3xl">{users.filter((u) => u.countries.length).length}</span></Kpi>
      </div>

      <Card title="People with access">
        <TableWrap max="">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Role</th><th>Country access</th><th>Permissions</th><th>2-step</th><th>Last sign-in</th><th>Status</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const chair = u.role === 'Chairman'
                return (
                  <tr key={u.id} className={u.status === 'Disabled' ? 'opacity-50' : ''}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className={`grid h-8 w-8 place-items-center rounded-full text-[0.6875rem] font-bold ${chair ? 'bg-gold-500 text-navy-950' : 'bg-navy-900 text-white'}`}>{chair ? <Crown size={14} /> : u.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                        <div><div className="font-medium">{u.name}</div><div className="text-[0.6875rem] text-muted">{u.email}</div></div>
                      </div>
                    </td>
                    <td><Badge tone={chair ? 'gold' : ['Vice Chairman', 'Managing Director'].includes(u.role) ? 'navy' : 'neutral'}>{u.role}</Badge></td>
                    <td>{u.countries.length ? u.countries.map((c) => ds.countries.find((x) => x.code === c)?.name).join(', ') : <span className="text-muted">All countries</span>}</td>
                    <td><span className="num">{chair ? 'All' : `${u.permissions.length} of ${PERMISSIONS.length}`}</span></td>
                    <td>{u.twoStep ? <Badge tone="good">On</Badge> : <Badge tone="bad">Off</Badge>}</td>
                    <td className="text-muted">{u.lastSignIn ? fmtDate(u.lastSignIn.slice(0, 10)) : 'Never'}</td>
                    <td><Badge tone={u.status === 'Active' ? 'good' : 'neutral'}>{u.status}</Badge></td>
                    <td className="r">
                      <div className="inline-flex gap-1">
                        <IconBtn title="Edit" onClick={() => setEdit(u)}><Pencil size={14} /></IconBtn>
                        {!chair && <IconBtn title={u.status === 'Active' ? 'Disable' : 'Enable'} onClick={() => upsertUser({ ...u, status: u.status === 'Active' ? 'Disabled' : 'Active' })}><Power size={14} /></IconBtn>}
                        {!chair && u.id !== user!.id && <IconBtn title="Remove" danger onClick={() => { if (confirm(`Remove ${u.name}?`)) removeUser(u.id) }}><Trash2 size={14} /></IconBtn>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Who can do what" subtitle="Current permissions per user · the Chairman always has everything">
          <TableWrap max="">
            <table className="tbl">
              <thead><tr><th>User</th>{PERMISSIONS.map((p) => <th key={p.id} className="text-center" title={p.hint}>{p.label.replace('View ', '').replace(' & ', '/')}</th>)}</tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}</td>
                    {PERMISSIONS.map((p) => <td key={p.id} className="text-center">{can(u, p.id) ? <Check size={15} className="mx-auto text-good" /> : <Minus size={15} className="mx-auto text-line" />}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card className="xl:col-span-2" title={<span className="flex items-center gap-2"><History size={16} className="text-gold-600" /> Access change log</span>} subtitle="Every user change, who made it and when">
          <div className="flex max-h-80 flex-col divide-y divide-line-2 overflow-y-auto">
            {audit.map((a, i) => (
              <div key={i} className="py-2 text-xs">
                <div className="text-ink">{a.action}</div>
                <div className="text-muted">{a.by} · {new Date(a.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })}</div>
              </div>
            ))}
            {!audit.length && <div className="py-6 text-center text-sm text-muted">No changes yet.</div>}
          </div>
        </Card>
      </div>

      {edit && <UserForm initial={edit} onClose={() => setEdit(null)} onSave={(u) => { upsertUser(u); setEdit(null) }} existing={users} />}
    </div>
  )
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return <button title={title} aria-label={title} onClick={onClick} className={`rounded-lg border border-line p-1.5 ${danger ? 'text-bad hover:bg-bad-bg' : 'text-ink-2 hover:bg-gold-50'}`}>{children}</button>
}

function UserForm({ initial, onClose, onSave, existing }: { initial: User; onClose: () => void; onSave: (u: User) => void; existing: User[] }) {
  const { ds } = useStore()
  const [u, setU] = useState<User>(initial)
  const [err, setErr] = useState('')
  const chair = u.role === 'Chairman'
  const isNew = !existing.some((x) => x.id === u.id)
  const setRole = (role: Role) => setU({ ...u, role, permissions: ROLE_DEFAULTS[role], countries: role === 'Country Head' && !u.countries.length ? ['IN'] : u.countries })
  const togglePerm = (p: Permission) => setU({ ...u, permissions: u.permissions.includes(p) ? u.permissions.filter((x) => x !== p) : [...u.permissions, p] })
  const toggleCountry = (c: CountryCode) => setU({ ...u, countries: u.countries.includes(c) ? u.countries.filter((x) => x !== c) : [...u.countries, c] })
  const submit = () => {
    if (!u.name.trim() || !/^\S+@\S+\.\S+$/.test(u.email)) return setErr('Enter a name and a valid email.')
    if (existing.some((x) => x.email.toLowerCase() === u.email.toLowerCase() && x.id !== u.id)) return setErr('That email already has an account.')
    onSave({ ...u, name: u.name.trim(), email: u.email.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="font-semibold">{isNew ? 'Add user' : `Edit ${initial.name}`}</div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gold-50" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name"><input value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} className="input" placeholder="e.g. Sub Vice Chairman" /></Field>
            <Field label="Email (company account)"><input value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} className="input" placeholder="name@gsy.com" /></Field>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">Role <span className="font-normal">(sets sensible default permissions you can change below)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.filter((r) => r !== 'Chairman' || chair).map((r) => (
                <button key={r} disabled={chair} onClick={() => setRole(r)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${u.role === r ? 'border-navy-900 bg-navy-900 text-white' : 'border-line hover:border-gold-500'}`}>{r}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">Permissions</div>
            {chair ? (
              <div className="flex items-center gap-2 rounded-xl bg-gold-50 p-3 text-sm"><Crown size={16} className="text-gold-600" /> The Chairman always has every permission.</div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {PERMISSIONS.map((p) => {
                  const on = u.permissions.includes(p.id)
                  return (
                    <button key={p.id} onClick={() => togglePerm(p.id)} className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${on ? 'border-navy-900 bg-[#f3f5f9]' : 'border-line hover:border-gold-500'}`}>
                      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-navy-900 bg-navy-900 text-white' : 'border-line'}`}>{on && <Check size={11} />}</span>
                      <span><span className="block text-xs font-semibold">{p.label}</span><span className="block text-[0.6875rem] text-muted">{p.hint}</span></span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {!chair && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted">Country access <span className="font-normal">(none selected = all countries)</span></div>
              <div className="flex flex-wrap gap-1.5">
                {ds.countries.map((c) => {
                  const on = u.countries.includes(c.code)
                  return <button key={c.code} onClick={() => toggleCountry(c.code)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? 'border-navy-900 bg-navy-900 text-white' : 'border-line hover:border-gold-500'}`}>{c.name}</button>
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={u.twoStep} onChange={(e) => setU({ ...u, twoStep: e.target.checked })} className="accent-[#0f1d33]" /> Require 2-step verification</label>
            {!chair && <label className="flex items-center gap-2"><input type="checkbox" checked={u.status === 'Active'} onChange={(e) => setU({ ...u, status: e.target.checked ? 'Active' : 'Disabled' })} className="accent-[#0f1d33]" /> Account active</label>}
          </div>
          {err && <p className="text-sm text-bad">{err}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted"><ShieldCheck size={13} /> The change is logged with your name and time.</span>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={submit}>{isNew ? 'Create user' : 'Save changes'}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-muted">{label}</span>{children}</label>
}
