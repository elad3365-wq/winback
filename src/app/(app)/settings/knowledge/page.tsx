import { KnowledgeManager } from "@/components/settings/knowledge-manager";
import { requireBusinessContext } from "@/lib/business";
import type { BusinessKnowledge } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Knowledge base · WinBack",
};

export default async function KnowledgePage() {
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const [{ data: entries }, { data: settings }] = await Promise.all([
    supabase
      .from("business_knowledge")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("business_ai_settings")
      .select("business_hours, financing_available, payment_plans_available, ai_can_offer_discounts, maximum_discount_percent")
      .eq("business_id", business.id)
      .maybeSingle(),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Knowledge base</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          The facts WinBack&apos;s AI is allowed to use in follow-ups: your services and prices,
          warranties, cancellation policy, service area. The AI never states a price, guarantee or
          policy that isn&apos;t here (or the lead&apos;s own estimate) — and any draft that does is
          flagged for you before you send it.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-900">Also used from Settings</h2>
        <ul className="mt-2 space-y-1">
          <li>Business hours: {settings?.business_hours?.trim() || "not set"}</li>
          <li>Financing: {settings?.financing_available ? "offered" : "not offered"}</li>
          <li>Payment plans: {settings?.payment_plans_available ? "offered" : "not offered"}</li>
          <li>
            Discounts:{" "}
            {settings?.ai_can_offer_discounts && (settings?.maximum_discount_percent ?? 0) > 0
              ? `AI may offer up to ${settings.maximum_discount_percent}%`
              : "AI never offers discounts"}
          </li>
        </ul>
      </section>

      <KnowledgeManager
        entries={(entries as BusinessKnowledge[]) ?? []}
        canEdit={business.owner_id === user.id}
      />
    </div>
  );
}
