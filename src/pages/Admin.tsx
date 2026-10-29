import { Check, Crown, History, KeyRound, Minus, Pencil, Plus, Power, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge, Btn, Card, Kpi, PageHeader, TableWrap } from '../components/ui'
import { ALL_PERMISSIONS, CHAIRMAN, PERMISSIONS, can, useStore, type Permission, type RoleDef, type User } from '../data/store'
import type { CountryCode } from '../data/types'
import { fmtDate } from '../lib/dates'

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const today = () => new Date().toISOString().slice(0, 10)

/** Starting points the Chairman can pick from when creating a role. Nothing exists until he saves it. */
const ROLE_IDEAS: { name: string; description: string; permissions: Permission[] }[] = [
  { name: 'Vice Chairman', description: 'Full view of the business, no admin rights', permissions: ['viewDashboards', 'viewInvestors', 'viewCommissions', 'downloadStatements', 'useAI', 'exportData'] },
  { name: 'Sub Vice Chairman', description: 'Dashboards and investors, no commissions', permissions: ['viewDashboards', 'viewInvestors', 'downloadStatements', 'useAI'] },
  { name: 'Managing Director', description: 'Runs operations; sees everything financial', permissions: ['viewDashboards', 'viewInvestors', 'viewCommissions', 'downloadStatements', 'useAI', 'exportData'] },
  { name: 'Country Head', description: 'Only their own country', permissions: ['viewDashboards', 'viewInvestors', 'useAI'] },
  { name: 'Accounts', description: 'Uploads data and fixes issues', permissions: ['viewDashboards', 'viewInvestors', 'viewCommissions', 'downloadStatements', 'exportData', 'uploadData', 'reviewData'] },
]

export default function Admin() {
  const { users, roles, user, upsertUser, removeUser, upsertRole, removeRole, audit, ds } = useStore()
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editRole, setEditRole] = useState<RoleDef | null>(null)
  const [msg, setMsg] = useState('')
  if (!can(user, 'manageUsers')) return <Card><p className="text-sm text-muted">You don’t have access to user management.</p></Card>

  const newRole = (seed?: (typeof ROLE_IDEAS)[number]): RoleDef => ({
    id: uid('R'), name: seed?.name ?? '', description: seed?.description ?? '', permissions: seed?.permissions ?? ['viewDashboards'],
    countries: [], createdBy: user!.name, createdAt: today(),
  })
  const newUser = (): User | null => {
    if (!roles.length) {
      setMsg('Create a role first, then add people to it.')
      return null
    }
    const r = roles[0]
    return { id: uid('U'), name: '', email: '', role: r.name, permissions: r.permissions, countries: r.countries, status: 'Active', twoStep: true, createdBy: user!.name, createdAt: today(), lastSignIn: null }
  }
  const unusedIdeas = ROLE_IDEAS.filter((i) => !roles.some((r) => r.name.toLowerCase() === i.name.toLowerCase()))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Users & Access"
        subtitle="Only the Chairman decides who gets in. Step 1: create a role and choose what it can access. Step 2: add people to that role."
        actions={<>
          <Btn variant="ghost" icon={<Plus size={15} />} onClick={() => setEditRole(newRole())}>New role</Btn>
          <Btn icon={<UserPlus size={15} />} onClick={() => { const u = newUser(); if (u) setEditUser(u) }}>Add person</Btn>
        </>}
      />
      {msg && (
        <div className="flex items-center justify-between rounded-xl border border-warn/30 bg-warn-bg px-4 py-2.5 text-sm text-warn">
          {msg}<button onClick={() => setMsg('')} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Kpi label="Roles created" icon={<KeyRound size={16} />}><span className="num text-2xl font-semibold sm:text-3xl">{roles.length}</span></Kpi>
        <Kpi label="People with access" icon={<Users size={16} />}><span className="num text-2xl font-semibold sm:text-3xl">{users.length}</span></Kpi>
        <Kpi label="Active" accent="good"><span className="num text-2xl font-semibold text-good sm:text-3xl">{users.filter((u) => u.status === 'Active').length}</span></Kpi>
        <Kpi label="Country-limited"><span className="num text-2xl font-semibold sm:text-3xl">{users.filter((u) => u.countries.length).length}</span></Kpi>
      </div>

      {/* ---------------- Roles ---------------- */}
      <Card title={<span className="flex items-center gap-2"><KeyRound size={16} className="text-gold-600" /> Roles</span>} subtitle="A role is a name plus what it can see and do. Changing a role updates everyone who has it.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col justify-between rounded-2xl border border-gold-500/40 bg-gold-50 p-4">
            <div>
              <div className="flex items-center gap-2 font-semibold"><Crown size={16} className="text-gold-600" /> Chairman</div>
              <p className="mt-1 text-xs text-ink-2">Owner of the system. Always has every permission, can create roles and people. Cannot be removed.</p>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs"><Badge tone="gold">All {ALL_PERMISSIONS.length} permissions</Badge><span className="text-muted">{users.filter((u) => u.role === CHAIRMAN).length} person</span></div>
          </div>
          {roles.map((r) => {
            const holders = users.filter((u) => u.role === r.name).length
            return (
              <div key={r.id} className="flex flex-col justify-between rounded-2xl border border-line p-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{r.name}</div>
                    <div className="flex gap-1">
                      <IconBtn title="Edit role" onClick={() => setEditRole(r)}><Pencil size={13} /></IconBtn>
                      <IconBtn title="Delete role" danger onClick={() => { const e = removeRole(r.id); setMsg(e ?? '') }}><Trash2 size={13} /></IconBtn>
                    </div>
                  </div>
                  {r.description && <p className="mt-1 text-xs text-muted">{r.description}</p>}
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {PERMISSIONS.filter((p) => r.permissions.includes(p.id)).map((p) => <span key={p.id} className="rounded-md bg-page px-1.5 py-0.5 text-[0.625rem] text-ink-2">{p.label}</span>)}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted">{r.countries.length ? `Limited to ${r.countries.join(', ')}` : 'All countries'}</span>
                  <span className="text-muted">{holders} {holders === 1 ? 'person' : 'people'}</span>
                </div>
              </div>
            )
          })}
          <button onClick={() => setEditRole(newRole())} className="grid min-h-36 place-items-center rounded-2xl border-2 border-dashed border-line text-sm text-muted transition hover:border-gold-500 hover:text-ink">
            <span className="flex flex-col items-center gap-1.5"><Plus size={20} /> Create a role</span>
          </button>
        </div>
        {unusedIdeas.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Quick start:</span>
            {unusedIdeas.map((i) => (
              <button key={i.name} onClick={() => setEditRole(newRole(i))} className="rounded-full border border-line bg-surface px-2.5 py-1 hover:border-gold-500">+ {i.name}</button>
            ))}
          </div>
        )}
      </Card>

      {/* ---------------- People ---------------- */}
      <Card title={<span className="flex items-center gap-2"><Users size={16} className="text-gold-600" /> People with access</span>} action={<Btn icon={<UserPlus size={14} />} onClick={() => { const u = newUser(); if (u) setEditUser(u) }}>Add person</Btn>}>
        <TableWrap max="">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Role</th><th>Country access</th><th>Permissions</th><th>2-step</th><th>Last sign-in</th><th>Status</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const chair = u.role === CHAIRMAN
                return (
                  <tr key={u.id} className={u.status === 'Disabled' ? 'opacity-50' : ''}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className={`grid h-8 w-8 place-items-center rounded-full text-[0.6875rem] font-bold ${chair ? 'bg-gold-500 text-navy-950' : 'bg-navy-900 text-white'}`}>{chair ? <Crown size={14} /> : u.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                        <div><div className="font-medium">{u.name}</div><div className="text-[0.6875rem] text-muted">{u.email}</div></div>
                      </div>
                    </td>
                    <td><Badge tone={chair ? 'gold' : 'navy'}>{u.role}</Badge></td>
                    <td>{u.countries.length ? u.countries.map((c) => ds.countries.find((x) => x.code === c)?.name).join(', ') : <span className="text-muted">All countries</span>}</td>
                    <td><span className="num">{chair ? 'All' : `${u.permissions.length} of ${PERMISSIONS.length}`}</span></td>
                    <td>{u.twoStep ? <Badge tone="good">On</Badge> : <Badge tone="bad">Off</Badge>}</td>
                    <td className="text-muted">{u.lastSignIn ? fmtDate(u.lastSignIn.slice(0, 10)) : 'Never'}</td>
                    <td><Badge tone={u.status === 'Active' ? 'good' : 'neutral'}>{u.status}</Badge></td>
                    <td className="r">
                      <div className="inline-flex gap-1">
                        <IconBtn title="Edit" onClick={() => setEditUser(u)}><Pencil size={14} /></IconBtn>
                        {!chair && <IconBtn title={u.status === 'Active' ? 'Disable' : 'Enable'} onClick={() => upsertUser({ ...u, status: u.status === 'Active' ? 'Disabled' : 'Active' })}><Power size={14} /></IconBtn>}
                        {!chair && <IconBtn title="Remove" danger onClick={() => { if (confirm(`Remove ${u.name}?`)) removeUser(u.id) }}><Trash2 size={14} /></IconBtn>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
        {users.length === 1 && <p className="mt-3 text-sm text-muted">Only the Chairman has access so far. {roles.length ? 'Add people to the roles above.' : 'Create a role above, then add people to it.'}</p>}
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Who can do what" subtitle="Current permissions per person">
          <TableWrap max="">
            <table className="tbl">
              <thead><tr><th>Person</th>{PERMISSIONS.map((p) => <th key={p.id} className="text-center" title={p.hint}>{p.label.replace('View ', '').replace(' & ', '/')}</th>)}</tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}<div className="text-[0.6875rem] font-normal text-muted">{u.role}</div></td>
                    {PERMISSIONS.map((p) => <td key={p.id} className="text-center">{can(u, p.id) ? <Check size={15} className="mx-auto text-good" /> : <Minus size={15} className="mx-auto text-line" />}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card className="xl:col-span-2" title={<span className="flex items-center gap-2"><History size={16} className="text-gold-600" /> Access change log</span>} subtitle="Every change, who made it and when">
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

      {editRole && <RoleForm initial={editRole} roles={roles} onClose={() => setEditRole(null)} onSave={(r) => { upsertRole(r); setEditRole(null); setMsg('') }} />}
      {editUser && <UserForm initial={editUser} roles={roles} existing={users} onClose={() => setEditUser(null)} onSave={(u) => { upsertUser(u); setEditUser(null) }} />}
    </div>
  )
}

// ---------------------------------------------------------------- shared bits

function IconBtn({ children, title, onClick, danger }: { children: ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return <button title={title} aria-label={title} onClick={onClick} className={`rounded-lg border border-line p-1.5 ${danger ? 'text-bad hover:bg-bad-bg' : 'text-ink-2 hover:bg-gold-50'}`}>{children}</button>
}

function Modal({ title, children, footer, onClose }: { title: string; children: ReactNode; footer: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gold-50" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-5">{children}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">{footer}</div>
      </div>
    </div>
  )
}

function PermissionPicker({ value, onChange }: { value: Permission[]; onChange: (v: Permission[]) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold text-muted">What can this role access?</span>
        <span className="flex gap-2"><button onClick={() => onChange(ALL_PERMISSIONS.filter((p) => p !== 'manageUsers'))} className="text-gold-600 hover:underline">All (except users)</button><button onClick={() => onChange([])} className="text-muted hover:underline">None</button></span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {PERMISSIONS.map((p) => {
          const on = value.includes(p.id)
          return (
            <button key={p.id} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])} className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${on ? 'border-navy-900 bg-[#f3f5f9]' : 'border-line hover:border-gold-500'}`}>
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-navy-900 bg-navy-900 text-white' : 'border-line'}`}>{on && <Check size={11} />}</span>
              <span><span className="block text-xs font-semibold">{p.label}</span><span className="block text-[0.6875rem] text-muted">{p.hint}</span></span>
            </button>
          )
        })}
      </div>
      {value.includes('manageUsers') && <p className="mt-2 text-[0.6875rem] text-warn">⚠ This role will be able to create people and change access. Give it only to someone you fully trust.</p>}
    </div>
  )
}

function CountryPicker({ value, onChange, label }: { value: CountryCode[]; onChange: (v: CountryCode[]) => void; label: string }) {
  const { ds } = useStore()
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-muted">{label} <span className="font-normal">(none selected = all countries)</span></div>
      <div className="flex flex-wrap gap-1.5">
        {ds.countries.map((c) => {
          const on = value.includes(c.code)
          return <button key={c.code} onClick={() => onChange(on ? value.filter((x) => x !== c.code) : [...value, c.code])} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? 'border-navy-900 bg-navy-900 text-white' : 'border-line hover:border-gold-500'}`}>{c.name}</button>
        })}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-muted">{label}</span>{children}</label>
}

// ---------------------------------------------------------------- role form

function RoleForm({ initial, roles, onClose, onSave }: { initial: RoleDef; roles: RoleDef[]; onClose: () => void; onSave: (r: RoleDef) => void }) {
  const { users } = useStore()
  const [r, setR] = useState<RoleDef>(initial)
  const [err, setErr] = useState('')
  const isNew = !roles.some((x) => x.id === r.id)
  const holders = users.filter((u) => u.role === initial.name).length
  const submit = () => {
    const name = r.name.trim()
    if (!name) return setErr('Give the role a name, e.g. "Sub Vice Chairman".')
    if (name.toLowerCase() === CHAIRMAN.toLowerCase()) return setErr('“Chairman” is reserved.')
    if (roles.some((x) => x.id !== r.id && x.name.toLowerCase() === name.toLowerCase())) return setErr('A role with that name already exists.')
    if (!r.permissions.length) return setErr('Choose at least one thing this role can access.')
    onSave({ ...r, name, description: r.description.trim() })
  }
  return (
    <Modal
      title={isNew ? 'Create a role' : `Edit role: ${initial.name}`}
      onClose={onClose}
      footer={<>
        <span className="text-[0.6875rem] text-muted">{!isNew && holders ? `Saving updates ${holders} ${holders === 1 ? 'person' : 'people'} with this role.` : 'You can add people to this role after saving.'}</span>
        <div className="flex gap-2"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit}>{isNew ? 'Create role' : 'Save role'}</Btn></div>
      </>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Role name"><input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} className="input" placeholder="e.g. Sub Vice Chairman" autoFocus /></Field>
        <Field label="Short description (optional)"><input value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} className="input" placeholder="What is this role for?" /></Field>
      </div>
      <PermissionPicker value={r.permissions} onChange={(permissions) => setR({ ...r, permissions })} />
      <CountryPicker label="Limit this role to countries" value={r.countries} onChange={(countries) => setR({ ...r, countries })} />
      {err && <p className="text-sm text-bad">{err}</p>}
    </Modal>
  )
}

// ---------------------------------------------------------------- person form

function UserForm({ initial, roles, existing, onClose, onSave }: { initial: User; roles: RoleDef[]; existing: User[]; onClose: () => void; onSave: (u: User) => void }) {
  const [u, setU] = useState<User>(initial)
  const [err, setErr] = useState('')
  const chair = u.role === CHAIRMAN
  const isNew = !existing.some((x) => x.id === u.id)
  const role = roles.find((r) => r.name === u.role)
  const custom = !chair && role && (role.permissions.length !== u.permissions.length || role.permissions.some((p) => !u.permissions.includes(p)))
  const pickRole = (r: RoleDef) => setU({ ...u, role: r.name, permissions: r.permissions, countries: r.countries })
  const submit = () => {
    if (!u.name.trim() || !/^\S+@\S+\.\S+$/.test(u.email)) return setErr('Enter a name and a valid email.')
    if (existing.some((x) => x.email.toLowerCase() === u.email.toLowerCase() && x.id !== u.id)) return setErr('That email already has an account.')
    onSave({ ...u, name: u.name.trim(), email: u.email.trim() })
  }
  return (
    <Modal
      title={isNew ? 'Add a person' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={<>
        <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted"><ShieldCheck size={13} /> {isNew ? 'They receive a sign-in invite by email (live version).' : 'The change is logged with your name and time.'}</span>
        <div className="flex gap-2"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit}>{isNew ? 'Add person' : 'Save changes'}</Btn></div>
      </>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name"><input value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} className="input" placeholder="Full name" autoFocus /></Field>
        <Field label="Email (company account)"><input value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} className="input" placeholder="name@company.com" /></Field>
      </div>

      {chair ? (
        <div className="flex items-center gap-2 rounded-xl bg-gold-50 p-3 text-sm"><Crown size={16} className="text-gold-600" /> The Chairman always has every permission and access to all countries.</div>
      ) : (
        <>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">Role</div>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <button key={r.id} onClick={() => pickRole(r)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${u.role === r.name ? 'border-navy-900 bg-navy-900 text-white' : 'border-line hover:border-gold-500'}`}>{r.name}</button>
              ))}
            </div>
            {role?.description && <p className="mt-1.5 text-[0.6875rem] text-muted">{role.description}</p>}
          </div>
          <details className="rounded-xl border border-line p-3" open={!!custom}>
            <summary className="cursor-pointer text-xs font-semibold text-ink-2">Fine-tune this person’s access {custom && <Badge tone="warn">Custom</Badge>}</summary>
            <div className="mt-3 space-y-4">
              <PermissionPicker value={u.permissions} onChange={(permissions) => setU({ ...u, permissions })} />
              <CountryPicker label="Country access" value={u.countries} onChange={(countries) => setU({ ...u, countries })} />
            </div>
          </details>
        </>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={u.twoStep} onChange={(e) => setU({ ...u, twoStep: e.target.checked })} className="accent-[#0f1d33]" /> Require 2-step verification</label>
        {!chair && <label className="flex items-center gap-2"><input type="checkbox" checked={u.status === 'Active'} onChange={(e) => setU({ ...u, status: e.target.checked ? 'Active' : 'Disabled' })} className="accent-[#0f1d33]" /> Account active</label>}
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
    </Modal>
  )
}
