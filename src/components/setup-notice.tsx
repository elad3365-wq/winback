export function SetupNotice() {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Finish setup</h1>
      <p className="mt-2 text-sm text-slate-600">
        WinBack needs a Supabase project before you can sign in. Copy{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.env.example</code> to{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.env.local</code> and set:
      </p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        <li>
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code>
        </li>
        <li>
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>
        </li>
      </ul>
      <p className="mt-4 text-sm text-slate-600">
        Both come from your Supabase dashboard under Project Settings → API. Then run the SQL files
        in <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">supabase/migrations</code> and
        restart the dev server.
      </p>
    </div>
  );
}
