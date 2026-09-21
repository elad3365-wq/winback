"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { completeOnboardingAction } from "@/app/onboarding/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  BUSINESS_TYPES,
  CURRENCIES,
  DISCOUNT_OPTIONS,
  EMPTY_ONBOARDING,
  FOLLOW_UP_METHODS,
  validateStep,
  type OnboardingData,
} from "@/lib/onboarding";

const STEPS = [
  { n: 1, title: "Business Details" },
  { n: 2, title: "Business Activity" },
  { n: 3, title: "AI Settings" },
] as const;

const TOTAL_STEPS = STEPS.length;

export function OnboardingWizard({ initial }: { initial?: Partial<OnboardingData> }) {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData>({ ...EMPTY_ONBOARDING, ...initial });
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function goNext() {
    const stepError = validateStep(step, data);
    if (stepError) {
      setError(stepError);
      return;
    }
    setError(null);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction(data);
      if (result.status === "error") {
        setError(result.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  const active = STEPS[step - 1];

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-indigo-600">
            Step {step} of {TOTAL_STEPS}
          </p>
          <p className="text-sm font-semibold text-slate-900">{active.title}</p>
        </div>
        <div className="mt-3 flex gap-2" aria-hidden="true">
          {STEPS.map((s) => (
            <span
              key={s.n}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s.n <= step ? "bg-indigo-600" : "bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        {step === 1 && <StepBusiness data={data} set={set} />}
        {step === 2 && <StepActivity data={data} set={set} />}
        {step === 3 && <StepAi data={data} set={set} />}

        {error ? (
          <div className="mt-5">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={goBack}
            disabled={step === 1 || pending}
          >
            Back
          </Button>

          {step < TOTAL_STEPS ? (
            <Button type="button" onClick={goNext}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Finishing…" : "Finish setup"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- step types -- */

type StepProps = {
  data: OnboardingData;
  set: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
};

function TwoCol({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

/* --------------------------------------------------------------- step one -- */

function StepBusiness({ data, set }: StepProps) {
  return (
    <div>
      <SectionHeading title="Business information" subtitle="Tell us about your business." />
      <div className="space-y-4">
        <Field label="Business name" htmlFor="businessName">
          <Input
            id="businessName"
            value={data.businessName}
            onChange={(e) => set("businessName", e.target.value)}
            placeholder="Rivera Plumbing"
          />
        </Field>

        <TwoCol>
          <Field label="Business type" htmlFor="businessType">
            <Select
              id="businessType"
              value={data.businessType}
              onChange={(e) => set("businessType", e.target.value)}
            >
              <option value="" disabled>
                Select one…
              </option>
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>

          {data.businessType === "Other" ? (
            <Field label="Describe your business" htmlFor="customBusinessType">
              <Input
                id="customBusinessType"
                value={data.customBusinessType}
                onChange={(e) => set("customBusinessType", e.target.value)}
                placeholder="e.g. Landscaping"
              />
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
        </TwoCol>

        <TwoCol>
          <Field
            label="Business phone number"
            htmlFor="phone"
            hint="International format, e.g. +12025550123"
          >
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              value={data.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+1 202 555 0123"
            />
          </Field>
          <Field label="Business email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={data.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="hello@yourbusiness.com"
            />
          </Field>
        </TwoCol>

        <Field label="Website (optional)" htmlFor="website">
          <Input
            id="website"
            value={data.website}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://yourbusiness.com"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Country" htmlFor="country">
            <Input
              id="country"
              value={data.country}
              onChange={(e) => set("country", e.target.value)}
              placeholder="United States"
            />
          </Field>
          <Field label="State / Region" htmlFor="state">
            <Input
              id="state"
              value={data.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="California"
            />
          </Field>
          <Field label="City" htmlFor="city">
            <Input
              id="city"
              value={data.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="San Diego"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- step two -- */

function StepActivity({ data, set }: StepProps) {
  return (
    <div>
      <SectionHeading
        title="Business activity"
        subtitle="This helps WinBack tune follow-ups to your volume."
      />
      <div className="space-y-4">
        <TwoCol>
          <Field label="Estimates sent per month (approx.)" htmlFor="monthlyEstimates">
            <Input
              id="monthlyEstimates"
              type="number"
              min={0}
              value={data.monthlyEstimates}
              onChange={(e) => set("monthlyEstimates", e.target.value)}
              placeholder="40"
            />
          </Field>
          <Field label="Average estimate value" htmlFor="averageEstimateValue">
            <Input
              id="averageEstimateValue"
              type="number"
              min={0}
              value={data.averageEstimateValue}
              onChange={(e) => set("averageEstimateValue", e.target.value)}
              placeholder="850"
            />
          </Field>
        </TwoCol>

        <TwoCol>
          <Field label="Currency" htmlFor="currency">
            <Select
              id="currency"
              value={data.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Number of employees" htmlFor="employeeCount">
            <Input
              id="employeeCount"
              type="number"
              min={0}
              value={data.employeeCount}
              onChange={(e) => set("employeeCount", e.target.value)}
              placeholder="6"
            />
          </Field>
        </TwoCol>

        <Field
          label="Do you currently follow up with customers who don't respond?"
          htmlFor="currentFollowUpMethod"
        >
          <Select
            id="currentFollowUpMethod"
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
    </div>
  );
}

/* ------------------------------------------------------------- step three -- */

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

function StepAi({ data, set }: StepProps) {
  return (
    <div>
      <SectionHeading
        title="WinBack AI settings"
        subtitle="Set the guardrails WinBack follows when it talks to your customers."
      />
      <div className="space-y-5">
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

        <Field label="Maximum discount the AI may offer" htmlFor="discountSetting">
          <Select
            id="discountSetting"
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

        <Field label="Business hours" htmlFor="businessHours">
          <Textarea
            id="businessHours"
            value={data.businessHours}
            onChange={(e) => set("businessHours", e.target.value)}
            placeholder="Mon–Fri 8am–6pm, Sat 9am–1pm"
          />
        </Field>

        <Field
          label="Additional AI instructions"
          htmlFor="additionalRules"
          hint='e.g. "Never offer discounts on diagnostic services."'
        >
          <Textarea
            id="additionalRules"
            value={data.additionalRules}
            onChange={(e) => set("additionalRules", e.target.value)}
            placeholder="Anything WinBack should always or never do…"
          />
        </Field>
      </div>
    </div>
  );
}
