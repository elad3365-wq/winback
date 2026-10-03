"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { deleteLeadAction, updateLeadStatusAction } from "@/app/(app)/leads/actions";
import { LeadForm } from "@/components/leads/lead-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import type { Lead, LeadStatus } from "@/lib/database.types";
import { formatDate, formatPhone } from "@/lib/format";
import {
  daysOverdue,
  effectiveFollowUpDate,
  isDueToday,
  isOverdue,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  PIPELINE_STAGES,
  sortLeads,
  stageForStatus,
  type LeadSort,
  type PipelineStageKey,
} from "@/lib/leads";

type DueFilter = "all" | "overdue" | "due_today" | "upcoming";
type ViewMode = "pipeline" | "list";
type DialogState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; lead: Lead };

export function LeadsWorkspace({
  leads,
  initialStatus = "all",
  initialDue = "all",
}: {
  leads: Lead[];
  initialStatus?: LeadStatus | "all";
  initialDue?: DueFilter;
}) {
  const [view, setView] = useState<ViewMode>("pipeline");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">(initialStatus);
  const [dueFilter, setDueFilter] = useState<DueFilter>(initialDue);
  const [sort, setSort] = useState<LeadSort>("newest");
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<Record<string, LeadStatus>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<PipelineStageKey | null>(null);
  const [isPending, startTransition] = useTransition();

  const statusOf = (lead: Lead): LeadStatus => localStatus[lead.id] ?? lead.status;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = leads.filter((lead) => {
      const status = statusOf(lead);
      const date = effectiveFollowUpDate(lead);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (dueFilter === "overdue" && !isOverdue(date, status)) return false;
      if (dueFilter === "due_today" && !isDueToday(date, status)) return false;
      if (dueFilter === "upcoming") {
        const upcoming = date && !isOverdue(date, status) && status !== "recovered" && status !== "lost";
        if (!upcoming) return false;
      }
      if (term) {
        const haystack = `${lead.customer_name} ${lead.phone} ${lead.service}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    return sortLeads(matched, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, search, statusFilter, dueFilter, sort, localStatus]);

  const filtersActive = search !== "" || statusFilter !== "all" || dueFilter !== "all" || sort !== "newest";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setDueFilter("all");
    setSort("newest");
  }

  function changeStatus(lead: Lead, status: LeadStatus) {
    if (status === statusOf(lead)) return;
    setError(null);
    setLocalStatus((current) => ({ ...current, [lead.id]: status }));
    startTransition(async () => {
      const result = await updateLeadStatusAction(lead.id, status);
      if (result.error) {
        setError(result.error);
        setLocalStatus((current) => {
          const next = { ...current };
          delete next[lead.id];
          return next;
        });
      }
    });
  }

  function dropOnStage(stageKey: PipelineStageKey, dropStatus: LeadStatus) {
    setDropStage(null);
    const lead = leads.find((l) => l.id === dragId);
    setDragId(null);
    if (!lead) return;
    // Only reassign when crossing into a different column — keeps an exact
    // follow-up status (followup_2, cold…) intact when rearranging in-column.
    if (stageForStatus(statusOf(lead)) === stageKey) return;
    changeStatus(lead, dropStatus);
  }

  function removeLead(lead: Lead) {
    if (!window.confirm(`Delete the lead for ${lead.customer_name}? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteLeadAction(lead.id);
      if (result.error) setError(result.error);
    });
  }

  const byStage = useMemo(() => {
    const map = new Map<PipelineStageKey, Lead[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage.key, []);
    for (const lead of filtered) map.get(stageForStatus(statusOf(lead)))?.push(lead);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, localStatus]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="View mode">
          {(["pipeline", "list"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                view === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
        <Button onClick={() => setDialog({ mode: "create" })}>Add lead</Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 lg:flex-row lg:flex-wrap lg:items-center">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone or service"
          aria-label="Search leads"
          className="lg:w-64"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}
          aria-label="Filter by status"
          className="lg:w-48"
        >
          <option value="all">All statuses</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LEAD_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
        <Select value={dueFilter} onChange={(e) => setDueFilter(e.target.value as DueFilter)} aria-label="Filter by follow-up" className="lg:w-44">
          <option value="all">Any follow-up</option>
          <option value="overdue">Overdue</option>
          <option value="due_today">Due today</option>
          <option value="upcoming">Upcoming</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as LeadSort)} aria-label="Sort leads" className="lg:w-48">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="follow_up">Next follow-up</option>
          <option value="recent_contact">Recently contacted</option>
        </Select>
        {filtersActive ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
        <span className="text-xs text-slate-500 lg:ml-auto">
          {filtered.length} of {leads.length} {leads.length === 1 ? "lead" : "leads"}
        </span>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {leads.length === 0 ? (
        <EmptyState onAdd={() => setDialog({ mode: "create" })} />
      ) : view === "pipeline" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {PIPELINE_STAGES.map((stage) => {
            const items = byStage.get(stage.key) ?? [];
            return (
              <div
                key={stage.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropStage(stage.key);
                }}
                onDragLeave={() => setDropStage((s) => (s === stage.key ? null : s))}
                onDrop={() => dropOnStage(stage.key, stage.dropStatus)}
                className={cn(
                  "flex flex-col rounded-xl bg-slate-50 p-2 ring-1 ring-inset ring-slate-200 transition-colors",
                  dropStage === stage.key && "ring-2 ring-indigo-400",
                )}
              >
                <div className="flex items-center justify-between px-1 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full", stage.accent)} aria-hidden />
                    <span className="text-xs font-semibold text-slate-700">{stage.label}</span>
                  </div>
                  <span className="text-xs tabular-nums text-slate-400">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((lead) => (
                    <PipelineCard
                      key={lead.id}
                      lead={lead}
                      status={statusOf(lead)}
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => setDragId(null)}
                      onStatusChange={(s) => changeStatus(lead, s)}
                    />
                  ))}
                  {items.length === 0 ? <p className="px-1 py-6 text-center text-xs text-slate-400">No leads</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ListView leads={filtered} statusOf={statusOf} disabled={isPending} onStatusChange={changeStatus} onEdit={(lead) => setDialog({ mode: "edit", lead })} onDelete={removeLead} />
      )}

      {leads.length > 0 && filtered.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          No leads match those filters.{" "}
          <button type="button" onClick={clearFilters} className="font-medium text-indigo-600 hover:text-indigo-500">
            Clear filters
          </button>
        </p>
      ) : null}

      <Modal
        open={dialog.mode !== "closed"}
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
    </div>
  );
}

function FollowUpTag({ lead, status }: { lead: Lead; status: LeadStatus }) {
  const date = effectiveFollowUpDate(lead);
  if (isOverdue(date, status)) {
    return (
      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
        {daysOverdue(date)}d overdue
      </span>
    );
  }
  if (isDueToday(date, status)) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
        Due today
      </span>
    );
  }
  if (date) return <span className="text-[11px] text-slate-500">Follow-up {formatDate(date)}</span>;
  return null;
}

function PipelineCard({
  lead,
  status,
  onDragStart,
  onDragEnd,
  onStatusChange,
}: {
  lead: Lead;
  status: LeadStatus;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStatusChange: (status: LeadStatus) => void;
}) {
  const date = effectiveFollowUpDate(lead);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="cursor-grab rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/leads/${lead.id}`} className="truncate text-sm font-medium text-slate-900 hover:text-indigo-600">
          {lead.customer_name}
        </Link>
        {isOverdue(date, status) ? (
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" title="Overdue follow-up" aria-hidden />
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-xs text-slate-500">{lead.service}</p>
      <p className="truncate text-xs text-slate-400">{formatPhone(lead.phone)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <FollowUpTag lead={lead} status={status} />
        {lead.follow_up_count > 0 ? <span className="text-[11px] text-slate-400">{lead.follow_up_count}×</span> : null}
      </div>
      <Select
        aria-label={`Change status for ${lead.customer_name}`}
        value={status}
        onChange={(e) => onStatusChange(e.target.value as LeadStatus)}
        className="mt-2 !py-1 text-xs"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ListView({
  leads,
  statusOf,
  disabled,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  leads: Lead[];
  statusOf: (lead: Lead) => LeadStatus;
  disabled: boolean;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <Th>Customer</Th>
              <Th>Contact</Th>
              <Th>Status</Th>
              <Th className="text-right">Follow-ups</Th>
              <Th>Created</Th>
              <Th>Last contact</Th>
              <Th>Next follow-up</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => {
              const status = statusOf(lead);
              return (
                <tr key={lead.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 align-top">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                      {lead.customer_name}
                    </Link>
                    <p className="text-xs text-slate-500">{lead.service}</p>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="hover:text-indigo-600">
                      {formatPhone(lead.phone)}
                    </a>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-1.5">
                      <StatusBadge status={status} />
                      <Select
                        aria-label={`Change status for ${lead.customer_name}`}
                        value={status}
                        disabled={disabled}
                        onChange={(e) => onStatusChange(lead, e.target.value as LeadStatus)}
                        className="!py-1 text-xs"
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {LEAD_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-slate-700">{lead.follow_up_count}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-slate-700">{formatDate(lead.created_at.slice(0, 10))}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-slate-700">
                    {lead.last_follow_up_at ? formatDate(lead.last_follow_up_at.slice(0, 10)) : "—"}
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    <FollowUpTag lead={lead} status={status} />
                    {effectiveFollowUpDate(lead) ? null : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex justify-end gap-2">
                      <Link href={`/leads/${lead.id}`}>
                        <Button variant="secondary" size="sm">
                          Open
                        </Button>
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => onEdit(lead)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" disabled={disabled} onClick={() => onDelete(lead)}>
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
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase", className)}>
      {children}
    </th>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-200">
      <h3 className="text-sm font-semibold text-slate-900">No leads yet</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        Add the customers who received an estimate and never replied. WinBack keeps the follow-up on your
        radar and drafts the message for you.
      </p>
      <Button className="mt-5" onClick={onAdd}>
        Add your first lead
      </Button>
    </div>
  );
}
