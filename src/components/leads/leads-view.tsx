"use client";

import { useMemo, useState, useTransition } from "react";

import { deleteLeadAction, updateLeadStatusAction } from "@/app/(app)/leads/actions";
import { AiFollowup } from "@/components/leads/ai-followup";
import { LeadForm } from "@/components/leads/lead-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Lead, LeadStatus } from "@/lib/database.types";
import { formatCurrency, formatDate, formatPhone } from "@/lib/format";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/leads";

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; lead: Lead }
  | { mode: "ai"; lead: Lead };

export function LeadsView({ leads }: { leads: Lead[] }) {
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<Record<string, LeadStatus>>({});
  const [isPending, startTransition] = useTransition();

  const visibleLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesTerm =
        term === "" ||
        lead.customer_name.toLowerCase().includes(term) ||
        lead.service.toLowerCase().includes(term) ||
        lead.phone.toLowerCase().includes(term);
      return matchesStatus && matchesTerm;
    });
  }, [leads, search, statusFilter]);

  function changeStatus(lead: Lead, status: string) {
    setError(null);
    // Show the new status straight away; the row re-renders from the server
    // once the action resolves.
    setPendingStatus((current) => ({ ...current, [lead.id]: status as LeadStatus }));
    startTransition(async () => {
      const result = await updateLeadStatusAction(lead.id, status);
      if (result.error) setError(result.error);
      // Either the refreshed row now carries the new status, or the update
      // failed — in both cases the local override has done its job.
      setPendingStatus((current) => {
        const next = { ...current };
        delete next[lead.id];
        return next;
      });
    });
  }

  function removeLead(lead: Lead) {
    if (!window.confirm(`Delete the lead for ${lead.customer_name}? This cannot be undone.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteLeadAction(lead.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, service or phone"
            aria-label="Search leads"
            className="sm:w-72"
          />
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as LeadStatus | "all")}
            aria-label="Filter by status"
            className="sm:w-52"
          >
            <option value="all">All statuses</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>

        <Button onClick={() => setDialog({ mode: "create" })}>Add lead</Button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {visibleLeads.length === 0 ? (
          <EmptyState
            hasLeads={leads.length > 0}
            onAdd={() => setDialog({ mode: "create" })}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Customer</Th>
                  <Th>Service</Th>
                  <Th className="text-right">Estimate</Th>
                  <Th>Status</Th>
                  <Th>Follow-up</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleLeads.map((lead) => {
                  const status = pendingStatus[lead.id] ?? lead.status;
                  return (
                  <tr key={lead.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-slate-900">{lead.customer_name}</p>
                      <a
                        href={`tel:${lead.phone.replace(/\s/g, "")}`}
                        className="text-xs text-slate-500 hover:text-indigo-600"
                      >
                        {formatPhone(lead.phone)}
                      </a>
                    </td>
                    <td className="px-4 py-3 align-top text-slate-700">{lead.service}</td>
                    <td className="px-4 py-3 text-right align-top font-medium text-slate-900 tabular-nums">
                      {formatCurrency(Number(lead.estimate_amount), { cents: true })}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-1.5">
                        <StatusBadge status={status} />
                        <Select
                          aria-label={`Change status for ${lead.customer_name}`}
                          value={status}
                          disabled={isPending}
                          onChange={(event) => changeStatus(lead, event.target.value)}
                          className="!py-1 text-xs"
                        >
                          {LEAD_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {LEAD_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap text-slate-700">
                      {formatDate(lead.follow_up_date)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDialog({ mode: "ai", lead })}
                        >
                          AI follow-up
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDialog({ mode: "edit", lead })}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isPending}
                          onClick={() => removeLead(lead)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Showing {visibleLeads.length} of {leads.length} {leads.length === 1 ? "lead" : "leads"}.
      </p>

      <Modal
        open={dialog.mode === "create" || dialog.mode === "edit"}
        onClose={() => setDialog({ mode: "closed" })}
        title={dialog.mode === "edit" ? "Edit lead" : "Add lead"}
        description={
          dialog.mode === "edit"
            ? "Update the details or move this lead to a new status."
            : "Log a customer who received an estimate and went quiet."
        }
      >
        <LeadForm
          key={dialog.mode === "edit" ? dialog.lead.id : "create"}
          lead={dialog.mode === "edit" ? dialog.lead : undefined}
          onSaved={() => setDialog({ mode: "closed" })}
          onCancel={() => setDialog({ mode: "closed" })}
        />
      </Modal>

      <Modal
        open={dialog.mode === "ai"}
        onClose={() => setDialog({ mode: "closed" })}
        title="AI follow-up"
        description="Generate a follow-up message for this lead. Draft only — nothing is sent."
      >
        {dialog.mode === "ai" ? <AiFollowup key={dialog.lead.id} lead={dialog.lead} /> : null}
      </Modal>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function EmptyState({ hasLeads, onAdd }: { hasLeads: boolean; onAdd: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <h3 className="text-sm font-semibold text-slate-900">
        {hasLeads ? "No leads match those filters" : "No leads yet"}
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        {hasLeads
          ? "Try a different search term or status."
          : "Add the customers who received an estimate and never replied. WinBack keeps the follow-up on your radar."}
      </p>
      {hasLeads ? null : (
        <Button className="mt-5" onClick={onAdd}>
          Add your first lead
        </Button>
      )}
    </div>
  );
}
