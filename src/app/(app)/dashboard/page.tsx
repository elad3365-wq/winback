import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { requireBusinessContext } from "@/lib/business";
import { formatCurrency, formatDate, formatPhone } from "@/lib/format";
import { ACTIVE_FOLLOW_UP_STATUSES, calculateLeadStats } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard · WinBack",
};

export default async function DashboardPage() {
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] || user.email?.split("@")[0] || "there";

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) {
    return <Alert tone="error">Could not load your dashboard: {error.message}</Alert>;
  }

  const allLeads = leads ?? [];
  const stats = calculateLeadStats(allLeads);

  const upcoming = allLeads
    .filter(
      (lead) => lead.follow_up_date && ACTIVE_FOLLOW_UP_STATUSES.includes(lead.status),
    )
    .sort((a, b) => (a.follow_up_date ?? "").localeCompare(b.follow_up_date ?? ""))
    .slice(0, 5);

  const recent = allLeads.slice(0, 5);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Welcome, {firstName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {business.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Revenue you have already won back, and what is still open.
          </p>
        </div>
        <Link
          href="/leads"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Go to leads →
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Leads"
          value={String(stats.totalLeads)}
          hint="Every lead on the books"
          icon={<IconUsers />}
        />
        <StatCard
          label="Active Follow-ups"
          value={String(stats.activeFollowUps)}
          hint="Follow-up needed, contacted or interested"
          icon={<IconClock />}
        />
        <StatCard
          label="Recovered Customers"
          value={String(stats.recoveredCustomers)}
          hint="Leads marked Recovered"
          icon={<IconCheck />}
        />
        <StatCard
          label="Recovered Revenue"
          value={formatCurrency(stats.recoveredRevenue)}
          hint="Estimate total of Recovered leads"
          icon={<IconDollar />}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Next follow-ups</h2>
            <Link href="/leads" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
              View all
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Nothing scheduled. Add a follow-up date to a lead and it shows up here.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {upcoming.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {lead.customer_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {lead.service} · {formatPhone(lead.phone)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-600">
                    {formatDate(lead.follow_up_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent leads</h2>
            <Link href="/leads" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No leads yet. Add your first one from the Leads page.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {recent.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {lead.customer_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {formatCurrency(Number(lead.estimate_amount))} · {lead.service}
                    </p>
                  </div>
                  <StatusBadge status={lead.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function IconUsers() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

function IconClock() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function IconDollar() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}
