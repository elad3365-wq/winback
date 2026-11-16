import Link from "next/link";

import { Card } from "@/components/ui/card";
import { requireBusinessContext } from "@/lib/business";

import { switchBusinessAction } from "./actions";

export const metadata = {
  title: "Businesses · WinBack",
};

export default async function BusinessesPage() {
  const { business: active, businesses } = await requireBusinessContext();

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Businesses</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each business has its own leads, AI settings and activity. Switch to see and change
            one at a time.
          </p>
        </div>
        <Link
          href="/businesses/new"
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Create business
        </Link>
      </header>

      <Card className="p-0">
        <ul className="divide-y divide-slate-200">
          {businesses.map((business) => {
            const isActive = business.id === active.id;
            return (
              <li key={business.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{business.name}</p>
                  <p className="text-xs text-slate-500">
                    {business.role === "owner" ? "Owner" : "Member"}
                  </p>
                </div>
                {isActive ? (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    Current
                  </span>
                ) : (
                  <form action={switchBusinessAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
                    >
                      Switch
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
