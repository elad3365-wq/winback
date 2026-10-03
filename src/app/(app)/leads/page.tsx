import { LeadsWorkspace } from "@/components/leads/leads-workspace";
import { Alert } from "@/components/ui/alert";
import { requireBusinessContext } from "@/lib/business";
import type { LeadStatus } from "@/lib/database.types";
import { isLeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Leads · WinBack",
};

type DueFilter = "all" | "overdue" | "due_today" | "upcoming";
const DUE_FILTERS: DueFilter[] = ["all", "overdue", "due_today", "upcoming"];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { business } = await requireBusinessContext();
  const supabase = await createClient();
  const sp = (await searchParams) ?? {};

  const statusParam = typeof sp.status === "string" && isLeadStatus(sp.status) ? (sp.status as LeadStatus) : "all";
  const dueParam =
    typeof sp.due === "string" && (DUE_FILTERS as string[]).includes(sp.due) ? (sp.due as DueFilter) : "all";

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(2000);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Leads</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your pipeline — drag a lead between stages, or open one to follow up.
        </p>
      </header>

      {error ? (
        <Alert tone="error">Could not load your leads: {error.message}</Alert>
      ) : (
        <LeadsWorkspace leads={leads ?? []} initialStatus={statusParam} initialDue={dueParam} />
      )}
    </div>
  );
}
