import { LeadsView } from "@/components/leads/leads-view";
import { Alert } from "@/components/ui/alert";
import { requireBusinessContext } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Leads · WinBack",
};

export default async function LeadsPage() {
  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Leads</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every customer who got an estimate, and where the conversation stands.
        </p>
      </header>

      {error ? (
        <Alert tone="error">Could not load your leads: {error.message}</Alert>
      ) : (
        <LeadsView leads={leads ?? []} />
      )}
    </div>
  );
}
