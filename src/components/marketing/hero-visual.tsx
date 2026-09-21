import { RevenueIcon, SendIcon } from "@/components/marketing/icons";

/**
 * A stylised WinBack dashboard, built entirely from markup so it looks like a
 * real product screenshot without shipping an image. Purely decorative.
 */
export function HeroVisual() {
  const leads = [
    { name: "Marcus T.", service: "Brake replacement", amount: "$780", status: "Recovered", tone: "recovered" },
    { name: "Dana R.", service: "Water heater install", amount: "$1,240", status: "Interested", tone: "interested" },
    { name: "Priya S.", service: "AC tune-up", amount: "$320", status: "Follow-up sent", tone: "sent" },
    { name: "Leon K.", service: "Panel upgrade", amount: "$2,100", status: "Contacted", tone: "contacted" },
  ] as const;

  const toneClass: Record<string, string> = {
    recovered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    interested: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    sent: "bg-amber-50 text-amber-700 ring-amber-200",
    contacted: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return (
    <div aria-hidden="true" className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-indigo-200/40 via-violet-200/30 to-transparent blur-2xl" />

      <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
        {/* window chrome */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-400 ring-1 ring-slate-200">
            app.winback.io/dashboard
          </span>
        </div>

        <div className="p-5">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-indigo-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-indigo-100">Revenue recovered</p>
                <RevenueIcon className="h-4 w-4 text-indigo-100" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight">$5,720</p>
              <p className="mt-0.5 text-[11px] text-indigo-100">this month</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">Follow-ups sent</p>
                <SendIcon className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">128</p>
              <p className="mt-0.5 text-[11px] text-slate-400">automatically</p>
            </div>
          </div>

          {/* mini chart */}
          <div className="mt-4 flex items-end gap-1.5">
            {[38, 52, 44, 61, 55, 72, 68, 84, 78, 92].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm bg-gradient-to-t from-indigo-200 to-indigo-500"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>

          {/* lead list */}
          <div className="mt-5 space-y-2">
            {leads.map((lead) => (
              <div
                key={lead.name}
                className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-100"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                    {lead.name.charAt(0)}
                  </span>
                  <div>
                    <p className="text-sm font-medium leading-tight text-slate-800">{lead.name}</p>
                    <p className="text-[11px] leading-tight text-slate-400">{lead.service}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700">{lead.amount}</span>
                  <span
                    className={`hidden rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset sm:inline ${toneClass[lead.tone]}`}
                  >
                    {lead.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* floating chip */}
      <div className="absolute -bottom-4 -left-4 hidden rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200 sm:block">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="text-xs font-semibold leading-tight text-slate-800">Marcus replied</p>
            <p className="text-[11px] leading-tight text-slate-400">Booked · +$780</p>
          </div>
        </div>
      </div>
    </div>
  );
}
