import Link from "next/link";
import type { ReactNode } from "react";

import { HeroVisual } from "@/components/marketing/hero-visual";
import { SiteNav } from "@/components/marketing/site-nav";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  BanIcon,
  BoltIcon,
  BuildingIcon,
  CalendarIcon,
  ChartIcon,
  ChatIcon,
  CheckIcon,
  ClockIcon,
  DropletIcon,
  FanIcon,
  HandoffIcon,
  LayersIcon,
  ListIcon,
  PauseIcon,
  PieIcon,
  PlugIcon,
  RevenueIcon,
  RoofIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
  SilenceIcon,
  SparklesIcon,
  ToothIcon,
  TrackIcon,
  UsersIcon,
  WrenchIcon,
} from "@/components/marketing/icons";

/* ---------------------------------------------------------------- shared -- */

function Badge({ status }: { status: "available" | "soon" | "preview" }) {
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available
      </span>
    );
  }
  if (status === "preview") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
        Preview
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Coming Soon
    </span>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{children}</p>;
}

function SectionHead({
  eyebrow,
  title,
  intro,
  center = true,
}: {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {intro ? <p className="mt-4 text-lg leading-relaxed text-slate-600">{intro}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ hero -- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50/70 via-white to-white" />
      <div className="pointer-events-none absolute -top-24 right-0 -z-10 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:pb-28 lg:pt-20">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Revenue recovery for local service businesses
          </span>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.35rem] lg:leading-[1.05]">
            Recover the Revenue{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              You&apos;re Already Losing
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            WinBack helps your business follow up with customers who went silent, track lost
            opportunities, and turn more estimates into paying jobs.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
            >
              Start Recovering Revenue
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50"
            >
              See How It Works
            </a>
          </div>

          <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {[
              ["Track", "unsold estimates"],
              ["Recover", "lost revenue"],
              ["Built for", "the trades"],
            ].map(([a, b]) => (
              <div key={a} className="flex items-center gap-2 text-slate-500">
                <CheckIcon className="h-4 w-4 text-indigo-500" />
                <span>
                  <span className="font-semibold text-slate-900">{a}</span> {b}
                </span>
              </div>
            ))}
          </dl>
        </div>

        <div className="animate-fade-up lg:pl-6" style={{ animationDelay: "120ms" }}>
          <HeroVisual />
          <p className="mt-3 text-center text-xs text-slate-400">Example dashboard data — not real customer results.</p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- problem -- */

function Problem() {
  const flow = [
    { icon: <UsersIcon className="h-5 w-5" />, label: "Lead arrives" },
    { icon: <SendIcon className="h-5 w-5" />, label: "Estimate sent" },
    { icon: <SilenceIcon className="h-5 w-5" />, label: "Customer stops replying" },
    { icon: <ClockIcon className="h-5 w-5" />, label: "No follow-up" },
    { icon: <RevenueIcon className="h-5 w-5" />, label: "Revenue lost" },
  ];

  const reasons = [
    "Receive an estimate and never reply",
    "Say they'll think about it",
    "Postpone the job",
    "Choose a competitor",
    "Miss an appointment",
    "Stop answering",
    "Forget about the quote",
  ];

  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          eyebrow="The problem"
          title="You worked hard to get the customer. Then they disappeared."
          intro="Businesses spend money on advertising, calls, staff, estimates, and sales. But most don't have time to follow up with every opportunity — and that's where revenue quietly slips away."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-2 lg:items-center">
          <ul className="grid gap-3 sm:grid-cols-2">
            {reasons.map((r) => (
              <li
                key={r}
                className="flex items-start gap-2.5 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200"
              >
                <SilenceIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                {r}
              </li>
            ))}
          </ul>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <ol className="space-y-1">
              {flow.map((step, i) => (
                <li key={step.label}>
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        i === flow.length - 1 ? "bg-rose-50 text-rose-500" : "bg-indigo-50 text-indigo-600"
                      }`}
                    >
                      {step.icon}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        i === flow.length - 1 ? "text-rose-600" : "text-slate-800"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < flow.length - 1 && (
                    <span className="ml-4 flex h-5 items-center text-slate-300">
                      <ArrowDownIcon className="h-4 w-4" />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <p className="mt-10 text-center text-lg font-semibold text-slate-900">
          WinBack is built to stop that last step.
        </p>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- how it works -- */

function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Capture the opportunity",
      body: "Add a customer, service, estimate amount, follow-up date, and status — with the customer's phone number and service details.",
      icon: <TrackIcon className="h-6 w-6" />,
      badge: "available" as const,
    },
    {
      n: 2,
      title: "Track the opportunity",
      body: "WinBack keeps every open estimate organized by status: New, Follow-up needed, Contacted, Interested, Recovered, or Lost.",
      icon: <LayersIcon className="h-6 w-6" />,
      badge: "available" as const,
    },
    {
      n: 3,
      title: "Follow up",
      body: "Schedule follow-ups today, with automated SMS and an AI Revenue Recovery Agent in active development to handle conversations for you.",
      icon: <ChatIcon className="h-6 w-6" />,
      badge: "soon" as const,
    },
    {
      n: 4,
      title: "Measure recovered revenue",
      body: "When an opportunity becomes Recovered, WinBack adds its estimate value to your Recovered Revenue total.",
      icon: <RevenueIcon className="h-6 w-6" />,
      badge: "available" as const,
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead
          eyebrow="How WinBack works"
          title="From lost opportunity to recovered customer"
          intro="No new workflow to learn. WinBack runs alongside how you already quote and close jobs."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div key={step.n} className="relative rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  {step.icon}
                </span>
                <span className="text-5xl font-bold text-slate-100">{step.n}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{step.title}</h3>
              <div className="mt-2">
                <Badge status={step.badge} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- dashboard -- */

function DashboardSection() {
  const metrics = [
    ["Total leads", "Every opportunity on the books"],
    ["Active follow-ups", "Deals that still need a touch"],
    ["Recovered customers", "Won back and booked"],
    ["Recovered revenue", "Estimate value of recovered deals"],
    ["Lost opportunities", "Marked lost, with their value"],
    ["Follow-up dates", "What's due, and when"],
  ];

  return (
    <section id="product" className="scroll-mt-20 border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHead
              eyebrow="Business dashboard"
              title="Know exactly where your revenue is going"
              center={false}
              intro="Instead of only counting leads, WinBack focuses on the financial value of every opportunity — what's open, what's at risk, and what you've won back."
            />
            <div className="mt-6"><Badge status="available" /></div>
            <dl className="mt-8 grid gap-4 sm:grid-cols-2">
              {metrics.map(([label, hint]) => (
                <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <dt className="text-sm font-semibold text-slate-900">{label}</dt>
                  <dd className="mt-0.5 text-xs text-slate-500">{hint}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 rounded-xl border-l-4 border-indigo-500 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm">
              WinBack focuses on how much money is still on the table — not just how many leads you have.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Open Opportunities", "$42,850", "slate"],
                ["Revenue at Risk", "$18,400", "amber"],
                ["Recovered Revenue", "$5,720", "indigo"],
                ["Recovered Customers", "11", "emerald"],
              ].map(([label, value, tone]) => {
                const featured = tone === "indigo";
                return (
                  <div
                    key={label}
                    className={`rounded-xl p-4 ring-1 ${featured ? "bg-indigo-600 ring-indigo-500" : "bg-slate-50 ring-slate-200"}`}
                  >
                    <p className={`text-[11px] font-medium ${featured ? "text-indigo-100" : "text-slate-500"}`}>{label}</p>
                    <p className={`mt-1 text-2xl font-semibold tracking-tight ${featured ? "text-white" : "text-slate-900"}`}>
                      {value}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-end gap-1.5">
              {[38, 52, 44, 61, 55, 72, 68, 84, 78, 92].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-indigo-200 to-indigo-500" style={{ height: `${h}px` }} />
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">Example dashboard data</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- lead mgmt UI -- */

function LeadManagement() {
  const rows = [
    ["John Miller", "Roof repair", "$4,200", "Follow-up needed", "Mar 12", "followup"],
    ["Sofia P.", "Drain cleaning", "$380", "Interested", "Mar 10", "interested"],
    ["Ray's Garage", "Transmission", "$2,650", "Recovered", "—", "recovered"],
    ["Alex N.", "Panel upgrade", "$1,900", "Lost", "—", "lost"],
  ] as const;

  const tone: Record<string, string> = {
    followup: "bg-amber-50 text-amber-700 ring-amber-200",
    interested: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    recovered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    lost: "bg-rose-50 text-rose-700 ring-rose-200",
  };

  const actions = [
    "Add a customer, phone, and service",
    "Add the estimate amount",
    "Choose a lead status",
    "Set a follow-up date",
    "Edit lead information",
    "Mark opportunities Recovered",
    "Mark opportunities Lost",
    "Delete leads",
  ];

  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          eyebrow="Lead management"
          title="Every opportunity in one place"
          intro="Add, organize, and update every open estimate — from first quote to final outcome."
        />
        <div className="mt-6 flex justify-center"><Badge status="available" /></div>

        <div className="mt-12 grid gap-8 lg:grid-cols-5 lg:items-center">
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
            {actions.map((a) => (
              <li key={a} className="flex items-center gap-2.5 text-sm text-slate-700">
                <CheckIcon className="h-4 w-4 shrink-0 text-indigo-600" />
                {a}
              </li>
            ))}
          </ul>

          <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200 lg:col-span-3">
            <div className="grid grid-cols-[1.4fr_1.2fr_0.9fr_1.2fr_0.8fr] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Customer</span>
              <span>Service</span>
              <span>Estimate</span>
              <span>Status</span>
              <span>Follow-Up</span>
            </div>
            {rows.map((r) => (
              <div key={r[0]} className="grid grid-cols-[1.4fr_1.2fr_0.9fr_1.2fr_0.8fr] items-center gap-2 border-b border-slate-50 px-4 py-3 text-sm last:border-0">
                <span className="truncate font-medium text-slate-800">{r[0]}</span>
                <span className="truncate text-slate-500">{r[1]}</span>
                <span className="font-semibold text-slate-700">{r[2]}</span>
                <span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${tone[r[5]]}`}>
                    {r[3]}
                  </span>
                </span>
                <span className="text-slate-500">{r[4]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- recovered rev -- */

function RecoveredRevenue() {
  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHead
          eyebrow="Recovered revenue"
          title="Measure the money WinBack brings back"
          intro="When you mark an opportunity as Recovered, WinBack tracks its estimate value so you can see the financial impact."
        />
        <div className="mt-6 flex justify-center"><Badge status="available" /></div>

        <div className="mx-auto mt-12 max-w-lg rounded-2xl bg-white p-7 shadow-lg ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Customer</p>
              <p className="text-lg font-semibold text-slate-900">John Miller</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-slate-400">Estimate</p>
              <p className="text-lg font-semibold text-slate-900">$1,250</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
              Follow-up needed
            </span>
            <ArrowRightIcon className="h-4 w-4 text-slate-400" />
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Recovered
            </span>
          </div>

          <div className="mt-6 rounded-xl bg-emerald-50 px-5 py-4 text-center ring-1 ring-inset ring-emerald-200">
            <p className="text-xs font-medium text-emerald-700">Recovered Revenue</p>
            <p className="mt-0.5 text-2xl font-bold text-emerald-700">+$1,250</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- AI -- */

function AiSection() {
  const rules = [
    "Financing availability",
    "Payment plans",
    "Maximum allowed discount",
    "Whether AI may offer discounts",
    "Business hours",
    "Custom AI instructions",
  ];
  const safety = [
    "Never invent prices",
    "Never invent services",
    "Never invent availability",
    "Never exceed approved discount rules",
    "Escalate when needed",
    "Stop contacting customers who opt out",
    "Allow human takeover",
  ];

  return (
    <section id="ai" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>AI revenue recovery</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            An AI designed around your business rules
          </h2>
          <div className="mt-4 flex justify-center"><Badge status="soon" /></div>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            You already configure your AI rules today. The AI Revenue Recovery Agent that reads and
            acts on them is in active development — here&apos;s how it will work.
          </p>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-2 lg:items-start">
          <div className="rounded-2xl bg-slate-900 p-6 shadow-xl ring-1 ring-slate-800">
            <div className="rounded-xl bg-slate-800/70 px-4 py-3 text-sm text-slate-200 ring-1 ring-slate-700">
              <span className="text-slate-400">Customer:</span> &ldquo;It&apos;s too expensive.&rdquo;
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                ["Objection", "Price"],
                ["Interest", "Medium"],
                ["Recommended action", "Offer financing"],
                ["Human attention", "No"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg bg-slate-800/40 px-4 py-2.5 text-sm">
                  <span className="text-slate-400">{k}</span>
                  <span className="font-semibold text-white">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] text-slate-500">Illustrative AI analysis — feature in development.</p>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-semibold text-slate-900">Uses your business settings</h3>
                <span className="ml-auto"><Badge status="available" /></span>
              </div>
              <p className="mt-1 text-xs text-slate-500">These rules are configurable today in onboarding &amp; settings.</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {rules.map((r) => (
                  <li key={r} className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckIcon className="h-4 w-4 shrink-0 text-indigo-600" /> {r}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <ShieldIcon className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-semibold text-slate-900">Guardrails &amp; safety</h3>
                <span className="ml-auto"><Badge status="soon" /></span>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {safety.map((r) => (
                  <li key={r} className="flex items-center gap-2 text-sm text-slate-600">
                    <ShieldIcon className="h-4 w-4 shrink-0 text-slate-400" /> {r}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm font-medium text-slate-700">You stay in control — always.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- objection intel -- */

function ObjectionIntel() {
  const data = [
    ["Price", 38],
    ["Timing", 24],
    ["Competitor", 17],
    ["Availability", 11],
    ["Other", 10],
  ] as const;

  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Objection intelligence</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Understand why customers don&apos;t buy
          </h2>
          <div className="mt-4 flex justify-center"><Badge status="soon" /></div>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            WinBack is being built to classify objections so you can see the patterns behind lost
            revenue — Price, Timing, Competitor, Financing, Trust, Availability, No interest, Other.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-xl rounded-2xl bg-white p-7 shadow-lg ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieIcon className="h-5 w-5 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-900">Why deals were lost</h3>
            </div>
            <span className="text-[11px] text-slate-400">Sample data</span>
          </div>
          <div className="mt-5 space-y-3">
            {data.map(([label, pct]) => (
              <div key={label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-semibold text-slate-900">{pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- human takeover -- */

function HumanTakeover() {
  const items = [
    { icon: <HandoffIcon className="h-5 w-5" />, label: "Take over a conversation" },
    { icon: <PauseIcon className="h-5 w-5" />, label: "Pause the AI" },
    { icon: <BoltIcon className="h-5 w-5" />, label: "Resume the AI" },
    { icon: <ChatIcon className="h-5 w-5" />, label: "Handle sensitive conversations manually" },
  ];
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Human takeover</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            AI when you want it. Human control when you need it.
          </h2>
          <div className="mt-4 flex justify-center"><Badge status="soon" /></div>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                {it.icon}
              </span>
              <p className="mt-3 text-sm font-medium text-slate-700">{it.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- onboarding -- */

function OnboardingSection() {
  const groups = [
    {
      title: "Business Details",
      items: ["Business name", "Business type", "Phone", "Email", "Website", "Country / State / City"],
    },
    {
      title: "Business Activity",
      items: ["Monthly estimate volume", "Average estimate value", "Currency", "Employees", "Current follow-up method"],
    },
    {
      title: "AI Settings",
      items: ["Financing available", "Payment plans", "Maximum discount", "AI discount permission", "Business hours", "Custom AI instructions"],
    },
  ];

  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          eyebrow="Business onboarding"
          title="WinBack adapts to your business"
          intro="A quick three-step setup captures how your business runs, so WinBack fits your pricing, hours, and rules."
        />
        <div className="mt-6 flex justify-center"><Badge status="available" /></div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {groups.map((g, i) => (
            <div key={g.title} className="relative rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="text-base font-semibold text-slate-900">{g.title}</h3>
              </div>
              <ul className="mt-4 space-y-2">
                {g.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckIcon className="h-4 w-4 shrink-0 text-indigo-500" /> {it}
                  </li>
                ))}
              </ul>
              {i < groups.length - 1 && (
                <span className="absolute -right-3.5 top-1/2 z-10 hidden -translate-y-1/2 text-slate-300 lg:block">
                  <ArrowRightIcon className="h-5 w-5" />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- settings -- */

function SettingsSection() {
  const items = [
    "Business information",
    "Phone number",
    "Business hours",
    "AI rules",
    "Financing settings",
    "Discount rules",
    "Business profile",
  ];

  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHead
          eyebrow="Business settings"
          title="You're always in control"
          intro="Update your business details and AI rules whenever your business changes — everything below is editable today."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((label) => (
            <div key={label} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <SettingsIcon className="h-4 w-4 text-indigo-600" /> {label}
              </span>
              <Badge status="available" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- automation etc -- */

function AutomatedFollowUp() {
  const flow = [
    "Estimate goes cold",
    "WinBack starts follow-up",
    "Customer replies",
    "AI analyzes response",
    "WinBack continues or escalates",
    "Opportunity recovered",
  ];
  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Automated follow-up</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Follow up without chasing every customer yourself
          </h2>
          <div className="mt-4 flex justify-center"><Badge status="soon" /></div>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Planned functionality. Future channels may include SMS and email.
          </p>
        </div>

        <div className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-3">
          {flow.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <span className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
                {step}
              </span>
              {i < flow.length - 1 && <ArrowRightIcon className="h-4 w-4 text-slate-300" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConversationsSection() {
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>Customer conversations</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Keep the entire recovery conversation together
            </h2>
            <div className="mt-4"><Badge status="soon" /></div>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              A unified thread — incoming and outgoing messages, AI and business replies, all
              time-stamped — is planned so nothing about a deal gets lost.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-200">
            <div className="space-y-3">
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
                Can you do the job next week?
                <span className="mt-1 block text-[10px] text-slate-400">Customer · 9:41 AM</span>
              </div>
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                We have Tuesday or Thursday open — which works?
                <span className="mt-1 block text-[10px] text-indigo-200">WinBack AI · 9:42 AM</span>
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
                Thursday, thanks!
                <span className="mt-1 block text-[10px] text-slate-400">Customer · 9:45 AM</span>
              </div>
            </div>
            <p className="mt-4 text-center text-[11px] text-slate-400">Illustrative preview — in development.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SchedulingSection() {
  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Follow-up scheduling</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Follow up at the right time
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Set follow-up dates on any lead today. Automatic, reply-aware scheduling is in development.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
          {[
            ['"Maybe next month."', "Follow up in 30 days"],
            ['"Call me tomorrow."', "Recommended follow-up tomorrow"],
          ].map(([said, action]) => (
            <div key={said} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">Customer says:</p>
              <p className="mt-1 font-medium text-slate-900">{said}</p>
              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-indigo-700">
                <CalendarIcon className="h-4 w-4" /> {action}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm">
          <span className="flex items-center gap-2 text-slate-600"><Badge status="available" /> Manual follow-up dates</span>
          <span className="flex items-center gap-2 text-slate-600"><Badge status="soon" /> Automatic scheduling</span>
        </div>
      </div>
    </section>
  );
}

function DoNotContact() {
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
          <BanIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Respect customer preferences
        </h2>
        <div className="mt-4 flex justify-center"><Badge status="soon" /></div>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          Automated outreach will stop the moment a customer asks. Opt-out handling is in development.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {["STOP", "Don't message me again.", "Unsubscribe"].map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ industries -- */

function Industries() {
  const items = [
    { name: "Auto Repair", icon: <WrenchIcon className="h-6 w-6" />, body: "Recover customers who received repair estimates but never approved the work." },
    { name: "Plumbing", icon: <DropletIcon className="h-6 w-6" />, body: "Recover homeowners who requested quotes but went silent." },
    { name: "HVAC", icon: <FanIcon className="h-6 w-6" />, body: "Follow up on installation, maintenance, and repair estimates." },
    { name: "Electrical", icon: <PlugIcon className="h-6 w-6" />, body: "Track open service quotes so none slip through." },
    { name: "Roofing", icon: <RoofIcon className="h-6 w-6" />, body: "Recover high-value roofing opportunities." },
    { name: "Contractors", icon: <BuildingIcon className="h-6 w-6" />, body: "Stay on top of large project proposals." },
    { name: "Dental", icon: <ToothIcon className="h-6 w-6" />, body: "Follow up on treatment plans and unscheduled procedures." },
    { name: "Other local services", icon: <UsersIcon className="h-6 w-6" />, body: "If you send estimates and wait for a callback, WinBack fits." },
  ];

  return (
    <section id="industries" className="scroll-mt-20 border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead eyebrow="Industries" title="Built for local service businesses" intro="Designed around how the trades quote, follow up, and close." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.name} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-transform hover:-translate-y-0.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">{it.icon}</span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{it.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ why winback -- */

function WhyWinBack() {
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHead eyebrow="Why WinBack" title="More revenue without needing more leads" />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-400">Traditional approach</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex items-center gap-2"><ArrowRightIcon className="h-4 w-4 text-slate-300" /> Spend more money</li>
              <li className="flex items-center gap-2"><ArrowRightIcon className="h-4 w-4 text-slate-300" /> Get more leads</li>
              <li className="flex items-center gap-2"><ArrowRightIcon className="h-4 w-4 text-slate-300" /> Hope more convert</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-indigo-600 p-7 text-white shadow-lg">
            <p className="text-sm font-semibold text-indigo-200">With WinBack</p>
            <ul className="mt-4 space-y-3 text-sm text-indigo-50">
              <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 text-indigo-200" /> Use existing opportunities</li>
              <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 text-indigo-200" /> Follow up better</li>
              <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 text-indigo-200" /> Recover more revenue</li>
            </ul>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-lg font-medium text-slate-900">
          You may not need more leads. You may need to recover the ones you&apos;re already losing.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- benefits -- */

function Benefits() {
  const items = [
    { icon: <SearchIcon className="h-5 w-5" />, title: "More visibility", body: "Know which opportunities are still open.", status: "available" as const },
    { icon: <ClockIcon className="h-5 w-5" />, title: "Less manual follow-up", body: "Reduce repetitive follow-up work.", status: "soon" as const },
    { icon: <RevenueIcon className="h-5 w-5" />, title: "Revenue tracking", body: "See the value of recovered opportunities.", status: "available" as const },
    { icon: <LayersIcon className="h-5 w-5" />, title: "Organized pipeline", body: "Track customers from estimate to outcome.", status: "available" as const },
    { icon: <SparklesIcon className="h-5 w-5" />, title: "AI assistance", body: "Analyze and handle conversations by your rules.", status: "soon" as const },
    { icon: <SettingsIcon className="h-5 w-5" />, title: "Business control", body: "Configure financing, discounts, and AI behavior.", status: "available" as const },
    { icon: <HandoffIcon className="h-5 w-5" />, title: "Human takeover", body: "Step in when a conversation needs a person.", status: "soon" as const },
    { icon: <ChartIcon className="h-5 w-5" />, title: "Better insights", body: "Understand why opportunities are lost.", status: "soon" as const },
  ];

  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead eyebrow="Business owner benefits" title="What WinBack gives the business owner" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{it.icon}</span>
                <Badge status={it.status} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{it.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- feature list -- */

function FeatureList() {
  const groups: { title: string; icon: ReactNode; items: [string, "available" | "soon"][] }[] = [
    {
      title: "Lead management",
      icon: <ListIcon className="h-5 w-5" />,
      items: [
        ["Add leads", "available"],
        ["Edit leads", "available"],
        ["Delete leads", "available"],
        ["Track estimate amount", "available"],
        ["Lead statuses", "available"],
        ["Follow-up dates", "available"],
      ],
    },
    {
      title: "Revenue",
      icon: <RevenueIcon className="h-5 w-5" />,
      items: [
        ["Recovered Revenue", "available"],
        ["Opportunity value tracking", "available"],
        ["Lost opportunity tracking", "available"],
      ],
    },
    {
      title: "Business account",
      icon: <BuildingIcon className="h-5 w-5" />,
      items: [
        ["Signup", "available"],
        ["Login", "available"],
        ["Business onboarding", "available"],
        ["Business profile", "available"],
        ["Business settings", "available"],
      ],
    },
    {
      title: "AI",
      icon: <SparklesIcon className="h-5 w-5" />,
      items: [
        ["AI business rules", "available"],
        ["Objection detection", "soon"],
        ["Interest level", "soon"],
        ["Recommended action", "soon"],
        ["Human escalation", "soon"],
        ["AI conversation replies", "soon"],
      ],
    },
    {
      title: "Automation",
      icon: <BoltIcon className="h-5 w-5" />,
      items: [
        ["Automated follow-up", "soon"],
        ["Follow-up scheduling (auto)", "soon"],
        ["SMS messaging", "soon"],
        ["Customer opt-out handling", "soon"],
      ],
    },
    {
      title: "Analytics",
      icon: <ChartIcon className="h-5 w-5" />,
      items: [
        ["Dashboard metrics", "available"],
        ["Recovered customers", "available"],
        ["Revenue recovery", "available"],
        ["Objection insights", "soon"],
      ],
    },
  ];

  return (
    <section id="features" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead
          eyebrow="Everything inside WinBack"
          title="The full picture — what's live and what's next"
          intro="We keep this honest. Each item is marked Available or Coming Soon based on what's actually built."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">{g.icon}</span>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">{g.title}</h3>
              </div>
              <ul className="mt-4 space-y-2.5">
                {g.items.map(([label, status]) => (
                  <li key={label} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      {status === "available" ? (
                        <CheckIcon className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <ClockIcon className="h-4 w-4 shrink-0 text-amber-500" />
                      )}
                      {label}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] font-semibold uppercase ${
                        status === "available" ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {status === "available" ? "Available" : "Soon"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- pricing -- */

function Pricing() {
  const plans = [
    {
      name: "Starter",
      price: "$49",
      tagline: "For smaller businesses.",
      features: ["Lead tracking", "Revenue dashboard", "Follow-up management"],
    },
    {
      name: "Pro",
      price: "$129",
      tagline: "For growing shops.",
      features: ["Everything in Starter", "AI Revenue Recovery", "Advanced follow-up", "AI insights"],
      featured: true,
    },
    {
      name: "Business",
      price: "$249",
      tagline: "For multi-tech teams.",
      features: ["Everything in Pro", "Multiple users", "Advanced analytics", "Higher usage", "Priority support"],
    },
  ];

  return (
    <section id="pricing" className="scroll-mt-20 border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Simple plans, built to pay for themselves</h2>
          <div className="mt-4 flex justify-center"><Badge status="preview" /></div>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={
                plan.featured
                  ? "relative rounded-2xl bg-slate-900 p-8 shadow-lg ring-1 ring-slate-900"
                  : "relative rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"
              }
            >
              {plan.featured && (
                <span className="absolute -top-3 left-8 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className={plan.featured ? "text-lg font-semibold text-white" : "text-lg font-semibold text-slate-900"}>{plan.name}</h3>
              <p className={plan.featured ? "mt-1 text-sm text-slate-300" : "mt-1 text-sm text-slate-500"}>{plan.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className={plan.featured ? "text-4xl font-bold tracking-tight text-white" : "text-4xl font-bold tracking-tight text-slate-900"}>
                  {plan.price}
                </span>
                <span className={plan.featured ? "text-sm text-slate-400" : "text-sm text-slate-500"}>/month</span>
              </div>
              <ul className="mt-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <CheckIcon className={plan.featured ? "mt-0.5 h-4 w-4 shrink-0 text-indigo-400" : "mt-0.5 h-4 w-4 shrink-0 text-indigo-600"} />
                    <span className={plan.featured ? "text-slate-200" : "text-slate-600"}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={
                  plan.featured
                    ? "mt-8 inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                    : "mt-8 inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50"
                }
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Planned pricing — subject to change during beta. Some Pro/Business features are still in development.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- founding partner -- */

function FoundingPartner() {
  return (
    <section id="founding" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-3xl bg-slate-900 px-6 py-14 text-center sm:px-12">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-indigo-200 ring-1 ring-inset ring-white/15">
            <SparklesIcon className="h-3.5 w-3.5" /> Early access
          </span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Become a WinBack Founding Partner</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">
            We&apos;re inviting selected businesses to test WinBack during development. Founding partners
            get early access in exchange for feedback on what works, what doesn&apos;t, and what would make
            WinBack more useful.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Apply for Early Access
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- faq -- */

function Faq() {
  const items = [
    ["What is WinBack?", "WinBack is a revenue-recovery tool for local service businesses. It helps you track unsold estimates, follow up with customers who went quiet, and measure the revenue you win back."],
    ["Is WinBack a CRM?", "It's focused on revenue recovery rather than being a full CRM. Where a CRM emphasizes lead counts and contact records, WinBack emphasizes the financial value of open, recovered, and lost opportunities."],
    ["Does WinBack generate new leads?", "No. WinBack helps you get more value from the leads and estimates you already have — it isn't a lead-generation platform."],
    ["How does Recovered Revenue work?", "When you mark an opportunity as Recovered, WinBack adds that lead's estimate amount to your Recovered Revenue total on the dashboard. This is available today."],
    ["Can I control what the AI is allowed to say?", "Yes — you can configure financing, payment plans, maximum discount, discount permission, business hours, and custom instructions today. The AI agent that acts on these rules is in development."],
    ["Can I disable AI?", "AI conversation handling isn't live yet, so nothing sends messages on your behalf today. When it ships, you'll be able to turn it off and keep everything manual."],
    ["Can I take over a conversation?", "Human takeover is a planned feature (Coming Soon). Today you manage every lead and follow-up manually."],
    ["Does WinBack send SMS?", "Not yet. Automated SMS is in development and clearly labeled Coming Soon — WinBack does not send text messages today."],
    ["Which businesses is WinBack for?", "Local service businesses that send estimates: auto repair, plumbing, HVAC, electrical, roofing, contractors, dental, and similar."],
    ["Is WinBack available now?", "The core is live: signup, onboarding, lead management, the revenue dashboard, and business/AI settings. AI automation, SMS, conversations, and objection analytics are in active development."],
  ];

  return (
    <section id="faq" className="scroll-mt-20 border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHead eyebrow="FAQ" title="Questions, answered honestly" />
        <div className="mt-10 space-y-3">
          {items.map(([q, a]) => (
            <details key={q} className="group rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-900">
                {q}
                <span className="text-slate-400 transition-transform group-open:rotate-45">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- final CTA -- */

function FinalCta() {
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Stop letting good opportunities disappear.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
          Turn the leads and estimates you already have into more revenue.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
          >
            Get Started
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50"
          >
            Sign In
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- footer -- */

function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
          <div className="max-w-sm">
            <span className="inline-flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">W</span>
              <span className="text-lg font-semibold tracking-tight text-slate-900">WinBack</span>
            </span>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Recover the revenue hiding in the leads and estimates you already have.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
            <div>
              <p className="font-semibold text-slate-900">Product</p>
              <ul className="mt-3 space-y-2 text-slate-500">
                <li><a href="#product" className="transition-colors hover:text-slate-900">Product</a></li>
                <li><a href="#features" className="transition-colors hover:text-slate-900">Features</a></li>
                <li><a href="#industries" className="transition-colors hover:text-slate-900">Industries</a></li>
                <li><a href="#pricing" className="transition-colors hover:text-slate-900">Pricing</a></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Account</p>
              <ul className="mt-3 space-y-2 text-slate-500">
                <li><Link href="/login" className="transition-colors hover:text-slate-900">Login</Link></li>
                <li><Link href="/signup" className="transition-colors hover:text-slate-900">Create Account</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Legal</p>
              <ul className="mt-3 space-y-2 text-slate-500">
                <li><Link href="/privacy" className="transition-colors hover:text-slate-900">Privacy</Link></li>
                <li><Link href="/terms" className="transition-colors hover:text-slate-900">Terms</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-6 text-xs text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} WinBack. All rights reserved.</p>
          <p>Currently in active development.</p>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ page -- */

export function LandingPage({ isAuthed = false }: { isAuthed?: boolean }) {
  return (
    <div className="bg-white">
      <SiteNav isAuthed={isAuthed} />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <DashboardSection />
        <LeadManagement />
        <RecoveredRevenue />
        <AiSection />
        <ObjectionIntel />
        <HumanTakeover />
        <OnboardingSection />
        <SettingsSection />
        <AutomatedFollowUp />
        <ConversationsSection />
        <SchedulingSection />
        <DoNotContact />
        <Industries />
        <WhyWinBack />
        <Benefits />
        <FeatureList />
        <Pricing />
        <FoundingPartner />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
