export default function SetupNotice() {
  return (
    <div className="mx-auto mt-24 max-w-lg px-6">
      <h1 className="font-display text-3xl">Connect Supabase to get started</h1>
      <p className="mt-3 text-slate-600">
        Copy <code className="rounded bg-slate-100 px-1">.env.example</code> to{' '}
        <code className="rounded bg-slate-100 px-1">.env</code>, add your Supabase URL and anon key, then restart{' '}
        <code className="rounded bg-slate-100 px-1">npm run dev</code>.
      </p>
      <pre className="mt-6 overflow-x-auto rounded-lg bg-ink p-4 text-sm text-slate-100">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
`}
      </pre>
    </div>
  )
}
