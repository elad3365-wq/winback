import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireOnboardedContext } from "@/lib/business";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, business, businesses } = await requireOnboardedContext();

  return (
    <AppShell
      businessName={business.name}
      email={user.email ?? ""}
      activeBusinessId={business.id}
      businesses={businesses}
    >
      {children}
    </AppShell>
  );
}
