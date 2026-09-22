export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
