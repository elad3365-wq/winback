"use client";

import { useState, useTransition } from "react";

import { updateAutopilotSettingsAction } from "@/app/(app)/settings/autopilot-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import {
  AI_TONES,
  AI_TONE_LABELS,
  AUTOPILOT_MODES,
  AUTOPILOT_MODE_LABELS,
  type AutopilotSettings,
} from "@/lib/autopilot";

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="block text-sm font-medium text-slate-700">{label}</p>
      <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-300">
        {[
          { v: true, label: "Yes" },
          { v: false, label: "No" },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt.v)}
            aria-pressed={value === opt.v}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              value === opt.v ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AutopilotSettingsForm({ initial }: { initial: AutopilotSettings }) {
  const [data, setData] = useState<AutopilotSettings>(initial);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof AutopilotSettings>(key: K, value: AutopilotSettings[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function num(value: string): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      const res = await updateAutopilotSettingsAction(data);
      setResult(
        res.status === "error"
          ? { tone: "error", text: res.error }
          : { tone: "success", text: "Autopilot settings saved." },
      );
    });
  }

  return (
    <div className="space-y-6">
      <Alert tone="info">
        Sending is not enabled yet. With autopilot on, WinBack only drafts follow-ups on
        schedule — every message still waits for your approval before it could ever go out.
      </Alert>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Autopilot</h2>
        <div className="mt-4 space-y-5">
          <Toggle
            label="Enable AI Autopilot"
            value={data.autopilot_enabled}
            onChange={(v) => set("autopilot_enabled", v)}
          />
          <Field label="Autopilot mode" htmlFor="ap-mode">
            <Select
              id="ap-mode"
              value={data.autopilot_mode}
              onChange={(e) => set("autopilot_mode", e.target.value as AutopilotSettings["autopilot_mode"])}
            >
              {AUTOPILOT_MODES.map((m) => (
                <option key={m} value={m}>
                  {AUTOPILOT_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Message tone" htmlFor="ap-tone">
            <Select
              id="ap-tone"
              value={data.tone}
              onChange={(e) => set("tone", e.target.value as AutopilotSettings["tone"])}
            >
              {AI_TONES.map((t) => (
                <option key={t} value={t}>
                  {AI_TONE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Follow-up schedule</h2>
        <p className="mt-1 text-sm text-slate-500">
          Delays are measured from when a lead becomes due. Typical cadence: first after an
          hour, second after ~24h, third after ~72h.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="1st follow-up delay (minutes)" htmlFor="ap-d1">
            <Input
              id="ap-d1"
              type="number"
              min={0}
              value={String(data.first_followup_delay_minutes)}
              onChange={(e) => set("first_followup_delay_minutes", num(e.target.value))}
            />
          </Field>
          <Field label="2nd follow-up delay (minutes)" htmlFor="ap-d2">
            <Input
              id="ap-d2"
              type="number"
              min={0}
              value={String(data.second_followup_delay_minutes)}
              onChange={(e) => set("second_followup_delay_minutes", num(e.target.value))}
            />
          </Field>
          <Field label="3rd follow-up delay (minutes)" htmlFor="ap-d3">
            <Input
              id="ap-d3"
              type="number"
              min={0}
              value={String(data.third_followup_delay_minutes)}
              onChange={(e) => set("third_followup_delay_minutes", num(e.target.value))}
            />
          </Field>
        </div>
        <div className="mt-4 sm:w-52">
          <Field label="Maximum follow-ups" htmlFor="ap-max" hint="0–10 before a lead goes cold.">
            <Input
              id="ap-max"
              type="number"
              min={0}
              max={10}
              value={String(data.maximum_followups)}
              onChange={(e) => set("maximum_followups", num(e.target.value))}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Approval guardrails</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Toggle
            label="Require approval for discounts"
            value={data.approval_required_for_discounts}
            onChange={(v) => set("approval_required_for_discounts", v)}
          />
          <Toggle
            label="Require approval for custom answers"
            value={data.approval_required_for_custom_answers}
            onChange={(v) => set("approval_required_for_custom_answers", v)}
          />
        </div>
      </Card>

      {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
