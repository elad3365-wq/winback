import { cn } from "@/lib/cn";
import type { LeadStatus } from "@/lib/database.types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_STYLES } from "@/lib/leads";

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        LEAD_STATUS_STYLES[status],
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}
