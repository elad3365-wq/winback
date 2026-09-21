"use client";

import { useState, useTransition } from "react";

import { updateBusinessSettingsAction } from "@/app/(app)/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  BUSINESS_TYPES,
  CURRENCIES,
  DISCOUNT_OPTIONS,
  EMPTY_ONBOARDING,
  FOLLOW_UP_METHODS,
  type OnboardingData,
} from "@/lib/onboarding";

function YesNo({
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
              value === opt.v
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsForm({ initial }: { initial: Partial<OnboardingData> }) {
  const [data, setData] = useState<OnboardingData>({ ...EMPTY_ONBOARDING, ...initial });
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      const res = await updateBusinessSettingsAction(data);
      if (res.status === "error") {
        setResult({ tone: "error", text: res.error });
      } else {
        setResult({ tone: "success", text: "Your settings have been saved." });
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Business details</h2>
        <div className="mt-4 space-y-4">
          <Field label="Business name" htmlFor="s-name">
            <Input id="s-name" value={data.businessName} onChange={(e) => set("businessName", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business type" htmlFor="s-type">
              <Select id="s-type" value={data.businessType} onChange={(e) => set("businessType", e.target.value)}>
                <option value="" disabled>
                  Select one…
                </option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            {data.businessType === "Other" ? (
              <Field label="Describe your business" htmlFor="s-custom">
                <Input
                  id="s-custom"
                  value={data.customBusinessType}
                  onChange={(e) => set("customBusinessType", e.target.value)}
                />
              </Field>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business phone number" htmlFor="s-phone" hint="International format, e.g. +12025550123">
              <Input id="s-phone" type="tel" value={data.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Business email" htmlFor="s-email">
              <Input id="s-email" type="email" value={data.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
          <Field label="Website (optional)" htmlFor="s-website">
            <Input id="s-website" value={data.website} onChange={(e) => set("website", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Country" htmlFor="s-country">
              <Input id="s-country" value={data.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
            <Field label="State / Region" htmlFor="s-state">
              <Input id="s-state" value={data.state} onChange={(e) => set("state", e.target.value)} />
            </Field>
            <Field label="City" htmlFor="s-city">
              <Input id="s-city" value={data.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Business activity</h2>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estimates per month" htmlFor="s-monthly">
              <Input
                id="s-monthly"
                type="number"
                min={0}
                value={data.monthlyEstimates}
                onChange={(e) => set("monthlyEstimates", e.target.value)}
              />
            </Field>
            <Field label="Average estimate value" htmlFor="s-avg">
              <Input
                id="s-avg"
                type="number"
                min={0}
                value={data.averageEstimateValue}
                onChange={(e) => set("averageEstimateValue", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" htmlFor="s-currency">
              <Select id="s-currency" value={data.currency} onChange={(e) => set("currency", e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Number of employees" htmlFor="s-emp">
              <Input
                id="s-emp"
                type="number"
                min={0}
                value={data.employeeCount}
                onChange={(e) => set("employeeCount", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Do you currently follow up with non-responders?" htmlFor="s-follow">
            <Select
              id="s-follow"
              value={data.currentFollowUpMethod}
              onChange={(e) => set("currentFollowUpMethod", e.target.value)}
            >
              <option value="" disabled>
                Select one…
              </option>
              {FOLLOW_UP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">AI settings & discount rules</h2>
        <div className="mt-4 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <YesNo
              label="Financing available?"
              value={data.financingAvailable}
              onChange={(v) => set("financingAvailable", v)}
            />
            <YesNo
              label="Payment plans available?"
              value={data.paymentPlansAvailable}
              onChange={(v) => set("paymentPlansAvailable", v)}
            />
          </div>
          <Field label="Maximum discount the AI may offer" htmlFor="s-discount">
            <Select
              id="s-discount"
              value={data.discountSetting}
              onChange={(e) => set("discountSetting", e.target.value)}
            >
              {DISCOUNT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Business hours" htmlFor="s-hours">
            <Textarea
              id="s-hours"
              value={data.businessHours}
              onChange={(e) => set("businessHours", e.target.value)}
            />
          </Field>
          <Field
            label="Additional AI instructions"
            htmlFor="s-rules"
            hint='e.g. "Never offer discounts on diagnostic services."'
          >
            <Textarea
              id="s-rules"
              value={data.additionalRules}
              onChange={(e) => set("additionalRules", e.target.value)}
            />
          </Field>
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
