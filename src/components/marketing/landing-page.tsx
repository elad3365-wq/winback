import Link from "next/link";
import type { ReactNode } from "react";

import { BetaForm } from "@/components/marketing/beta-form";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { SiteNav } from "@/components/marketing/site-nav";
import {
  ArrowRightIcon,
  BoltIcon,
  BuildingIcon,
  CalendarIcon,
  ChatIcon,
  CheckIcon,
  ClockIcon,
  DropletIcon,
  FanIcon,
  HandoffIcon,
  PlugIcon,
  RevenueIcon,
  SendIcon,
  SilenceIcon,
  TrackIcon,
  WrenchIcon,
} from "@/components/marketing/icons";

/* ------------------------------------------------------------------ Hero -- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50/70 via-white to-white" />
      <div className="pointer-events-none absolute -top-24 right-0 -z-10 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:pb-28 lg:pt-20">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Revenue recovery for local service businesses
          </span>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.35rem] lg:leading-[1.05]">
            Turn Lost Estimates Into{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Paying Customers
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            WinBack automatically follows up with customers who went silent after receiving an
            estimate, helping your business recover revenue that would otherwise be lost.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#beta"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
            >
              Start Recovering Revenue
              <ArrowRightIcon className="h-4 w-4" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50"
            >
              See How It Works
            </a>
          </div>

          <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {[
              ["Automatic", "follow-ups"],
              ["Set up in", "minutes"],
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
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Problem -- */

function Problem() {
  const steps = [
    { icon: <SendIcon className="h-5 w-5" />, title: "Estimate sent", note: "You quote the job and move on." },
    { icon: <SilenceIcon className="h-5 w-5" />, title: "Customer goes quiet", note: "No reply. No booking. No reason given." },
    { icon: <ClockIcon className="h-5 w-5" />, title: "Follow-up forgotten", note: "You're busy on the next job." },
    { icon: <RevenueIcon className="h-5 w-5" />, title: "Revenue lost", note: "The work goes to someone else." },
  ];

  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Your business is already losing money.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            You send quotes and estimates every day — but plenty of customers never respond. Most
            businesses either forget to follow up, or only try once and give up. Every one of those
            is revenue quietly walking out the door.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.title} className="relative">
              <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  {step.icon}
                </span>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Step {i + 1}
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{step.note}</p>
              </div>
              {i < steps.length - 1 && (
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

/* ----------------------------------------------------------- How it works -- */

function HowItWorks() {
  const steps = [
    {
      title: "Add or import your estimates",
      body: "Drop in the customers who received a quote and never got back to you — one at a time or in bulk.",
      icon: <TrackIcon className="h-6 w-6" />,
    },
    {
      title: "WinBack follows up automatically",
      body: "WinBack reaches out on a smart schedule so no lead ever slips through the cracks again.",
      icon: <BoltIcon className="h-6 w-6" />,
    },
    {
      title: "Interested customers come back",
      body: "Replies land back in your dashboard as warm leads — ready for you to close the job.",
      icon: <RevenueIcon className="h-6 w-6" />,
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Three steps to recovered revenue
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            No new workflow to learn. WinBack runs quietly in the background while you run the shop.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.title} className="relative rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  {step.icon}
                </span>
                <span className="text-5xl font-bold text-slate-100">{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Features -- */

function Features() {
  const features = [
    {
      icon: <BoltIcon className="h-5 w-5" />,
      title: "Automatic follow-ups",
      body: "Every quiet estimate gets a persistent, professional follow-up — without you lifting a finger.",
    },
    {
      icon: <ChatIcon className="h-5 w-5" />,
      title: "AI-powered conversations",
      body: "Natural back-and-forth replies that answer questions and nudge customers toward booking.",
      soon: true,
    },
    {
      icon: <SendIcon className="h-5 w-5" />,
      title: "Automated SMS",
      body: "Reach customers where they actually reply — text messages sent on your behalf.",
      soon: true,
    },
    {
      icon: <TrackIcon className="h-5 w-5" />,
      title: "Lead status tracking",
      body: "See every lead's stage at a glance — new, contacted, interested, recovered or lost.",
    },
    {
      icon: <RevenueIcon className="h-5 w-5" />,
      title: "Recovered revenue tracking",
      body: "Watch exactly how much revenue WinBack has brought back to your business.",
    },
    {
      icon: <HandoffIcon className="h-5 w-5" />,
      title: "Human takeover",
      body: "Jump into any conversation the moment a lead is ready for a personal touch.",
    },
    {
      icon: <CalendarIcon className="h-5 w-5" />,
      title: "Scheduled follow-ups",
      body: "Set the cadence and timing that fits your trade — WinBack handles the rest.",
    },
  ];

  return (
    <section id="features" className="scroll-mt-20 border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Features</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to win the job back
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Built around how service businesses actually chase down estimates.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  {feature.icon}
                </span>
                {feature.soon && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                    Coming soon
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Revenue -- */

function Revenue() {
  const stats = [
    { value: "$18,450", label: "Lost opportunities", tone: "text-slate-900", sub: "Estimates sitting unanswered" },
    { value: "$5,720", label: "Revenue recovered", tone: "text-indigo-600", sub: "Won back with follow-ups", highlight: true },
    { value: "11", label: "Customers recovered", tone: "text-slate-900", sub: "Booked jobs that came back" },
  ];

  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-3xl bg-slate-900 px-6 py-14 sm:px-12 lg:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">See the impact</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              What recovery looks like
            </h2>
            <p className="mt-4 text-lg text-slate-300">
              A snapshot of how the numbers move once you stop letting estimates go cold.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={
                  stat.highlight
                    ? "rounded-2xl bg-indigo-600 p-7 text-center ring-1 ring-indigo-400"
                    : "rounded-2xl bg-slate-800/70 p-7 text-center ring-1 ring-slate-700"
                }
              >
                <p className={stat.highlight ? "text-4xl font-bold tracking-tight text-white sm:text-5xl" : "text-4xl font-bold tracking-tight text-white sm:text-5xl"}>
                  {stat.value}
                </p>
                <p className="mt-2 text-sm font-semibold text-white">{stat.label}</p>
                <p className={stat.highlight ? "mt-1 text-xs text-indigo-100" : "mt-1 text-xs text-slate-400"}>
                  {stat.sub}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">
            Illustrative product demonstration — not real customer results.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Audience -- */

function Audience() {
  const industries = [
    { name: "Auto Repair", icon: <WrenchIcon className="h-6 w-6" /> },
    { name: "Plumbing", icon: <DropletIcon className="h-6 w-6" /> },
    { name: "HVAC", icon: <FanIcon className="h-6 w-6" /> },
    { name: "Electrical", icon: <PlugIcon className="h-6 w-6" /> },
    { name: "Contractors", icon: <BuildingIcon className="h-6 w-6" /> },
  ];

  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Who it&apos;s for</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Made for local service businesses
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            If you send estimates and wait for a callback, WinBack is built for you.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {industries.map((industry) => (
            <div
              key={industry.name}
              className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
                {industry.icon}
              </span>
              <span className="text-sm font-semibold text-slate-800">{industry.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Pricing -- */

function Pricing() {
  const plans = [
    {
      name: "Starter",
      price: "$49",
      tagline: "For the solo operator getting started.",
      features: ["Automatic follow-ups", "Lead status tracking", "Recovered revenue dashboard", "Email support"],
    },
    {
      name: "Pro",
      price: "$129",
      tagline: "For growing shops chasing every lead.",
      features: ["Everything in Starter", "Scheduled follow-up cadences", "Human takeover", "Priority support"],
      featured: true,
    },
    {
      name: "Business",
      price: "$249",
      tagline: "For multi-tech teams at volume.",
      features: ["Everything in Pro", "Higher lead volume", "Team seats", "Onboarding help"],
    },
  ];

  return (
    <section id="pricing" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Pricing</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Simple plans that pay for themselves
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            One recovered estimate usually covers the month.
          </p>
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
              <h3 className={plan.featured ? "text-lg font-semibold text-white" : "text-lg font-semibold text-slate-900"}>
                {plan.name}
              </h3>
              <p className={plan.featured ? "mt-1 text-sm text-slate-300" : "mt-1 text-sm text-slate-500"}>
                {plan.tagline}
              </p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className={plan.featured ? "text-4xl font-bold tracking-tight text-white" : "text-4xl font-bold tracking-tight text-slate-900"}>
                  {plan.price}
                </span>
                <span className={plan.featured ? "text-sm text-slate-400" : "text-sm text-slate-500"}>/month</span>
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <CheckIcon className={plan.featured ? "mt-0.5 h-4 w-4 shrink-0 text-indigo-400" : "mt-0.5 h-4 w-4 shrink-0 text-indigo-600"} />
                    <span className={plan.featured ? "text-slate-200" : "text-slate-600"}>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#beta"
                className={
                  plan.featured
                    ? "mt-8 inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                    : "mt-8 inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50"
                }
              >
                Join the Beta
              </a>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">Pricing subject to change during beta.</p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Final CTA -- */

function FinalCta() {
  return (
    <section id="beta" className="scroll-mt-20 border-t border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Stop letting good customers disappear.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              Join the WinBack beta and start turning silent estimates back into booked, paying jobs.
              Tell us a little about your business and we&apos;ll be in touch with early access.
            </p>
            <ul className="mt-6 space-y-2.5">
              {["Early access pricing", "Hands-on onboarding", "Shape the product roadmap"].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-slate-600">
                  <CheckIcon className="h-4 w-4 text-indigo-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <BetaForm />
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Footer -- */

function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
          <div className="max-w-sm">
            <span className="inline-flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                W
              </span>
              <span className="text-lg font-semibold tracking-tight text-slate-900">WinBack</span>
            </span>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Recover the revenue hiding in your unanswered estimates.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 text-sm">
            <div>
              <p className="font-semibold text-slate-900">Product</p>
              <ul className="mt-3 space-y-2 text-slate-500">
                <li><FooterLink href="#how-it-works">How It Works</FooterLink></li>
                <li><FooterLink href="#features">Features</FooterLink></li>
                <li><FooterLink href="#pricing">Pricing</FooterLink></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Account</p>
              <ul className="mt-3 space-y-2 text-slate-500">
                <li><Link href="/login" className="transition-colors hover:text-slate-900">Sign In</Link></li>
                <li><Link href="/signup" className="transition-colors hover:text-slate-900">Create account</Link></li>
                <li><FooterLink href="#beta">Join Beta</FooterLink></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-6 text-xs text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} WinBack. All rights reserved.</p>
          <p>Currently in private beta.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="transition-colors hover:text-slate-900">
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ Page -- */

export function LandingPage({ isAuthed = false }: { isAuthed?: boolean }) {
  return (
    <div className="bg-white">
      <SiteNav isAuthed={isAuthed} />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Revenue />
        <Audience />
        <Pricing />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
