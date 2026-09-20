import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireBusinessContext } from "@/lib/business";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, business } = await requireBusinessContext();

  return (
    <AppShell businessName={business.name} email={user.email ?? ""}>
      {children}
    </AppShell>
  );
}
