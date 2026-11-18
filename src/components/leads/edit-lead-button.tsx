"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { LeadForm } from "@/components/leads/lead-form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { Lead } from "@/lib/database.types";

/** Edit a lead's name, phone, service, amount, date and status from its own page. */
export function EditLeadButton({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const saved = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit details
      </Button>
      <Modal open={open} onClose={close} title="Edit lead" description="Update the details or move this lead to a new status.">
        {open ? <LeadForm key={lead.updated_at} lead={lead} onSaved={saved} onCancel={close} /> : null}
      </Modal>
    </>
  );
}
