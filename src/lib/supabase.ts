import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** True when the app is connected to GSY's database (otherwise it runs on sample data). */
export const dbEnabled = Boolean(url && key)

// Browser client: publishable key only. Every table is protected by Row Level Security.
export const supabase = dbEnabled ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } }) : null!
