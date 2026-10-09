import Link from "next/link";
import type { ReactNode } from "react";

import { BetaForm } from "@/components/marketing/beta-form";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { SiteNav } from "@/components/marketing/site-nav";
import {
  ArrowRightIcon,
  BuildingIcon,
  ChatIcon,
  CheckIcon,
  FanIcon,
  ListIcon,
  RoofIcon,
  SparklesIcon,
} from "@/components/marketing/icons";

/* ---------------------------------------------------------------- shared -- */

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

/** Every call to action on the page scrolls to the early-access form. */
function ApplyButton({ children }: { children: ReactNode }) {
  return (
    <a
      href="#apply"
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
    >
      {children}
      <ArrowRightIcon className="h-4 w-4" />
    </a>
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
            WinBack Early Access
          </span>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.35rem] lg:leading-[1.05]">
            Stop losing track of{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              potential customers.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            WinBack helps service businesses stay organized and follow up with people who requested a
            quote but haven&apos;t booked yet.
          </p>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-slate-600">
            Use AI to prepare personalized follow-up messages, review them, and keep track of every
            opportunity.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ApplyButton>Join our free 14-day pilot</ApplyButton>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-base font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50"
            >
              How WinBack Works
            </a>
          </div>

          <p className="mt-4 flex items-start gap-2 text-sm text-slate-500">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
            No credit card required. Personal onboarding from the founder.
          </p>
        </div>

        <div className="animate-fade-up lg:pl-6" style={{ animationDelay: "120ms" }}>
          <HeroVisual />
          <p className="mt-3 text-center text-xs text-slate-400">Example dashboard data — not real customer results.</p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- how it works -- */

function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Add your leads",
      body: "Keep track of customers, requested services, estimates, and follow-up status in one place.",
      icon: <ListIcon className="h-6 w-6" />,
    },
    {
      n: 2,
      title: "Get AI-powered follow-up drafts",
      body: "WinBack helps prepare relevant, professional messages based on your business information.",
      icon: <SparklesIcon className="h-6 w-6" />,
    },
    {
      n: 3,
      title: "Review and follow up",
      body: "Stay in control of your customer communication and see which opportunities still need attention.",
      icon: <ChatIcon className="h-6 w-6" />,
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-20 border-y border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead title="How WinBack Works" />

        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <li key={step.n} className="relative rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  {step.icon}
                </span>
                <span className="text-5xl font-bold text-slate-100" aria-hidden="true">
                  {step.n}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">
                <span className="sr-only">{step.n}. </span>
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ industries -- */

function Industries() {
  const items = [
    { name: "HVAC", icon: <FanIcon className="h-5 w-5" /> },
    { name: "Roofing", icon: <RoofIcon className="h-5 w-5" /> },
    { name: "Cleaning", icon: <SparklesIcon className="h-5 w-5" /> },
    { name: "Local services", icon: <BuildingIcon className="h-5 w-5" /> },
  ];

  return (
    <section id="industries" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHead
          title="Built for service businesses"
          intro="Whether you run an HVAC company, roofing business, cleaning service, or another local service company, WinBack is designed to make lead follow-up simpler."
        />
        <ul className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map((it) => (
            <li
              key={it.name}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                {it.icon}
              </span>
              <span className="text-sm font-semibold text-slate-900 sm:text-base">{it.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- founding pilot -- */

function FoundingPilot() {
  const perks = [
    "Free 14-day pilot",
    "No credit card required",
    "Personal onboarding",
    "Direct feedback to the founder",
  ];

  return (
    <section id="apply" className="scroll-mt-20 py-6 lg:py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 overflow-hidden rounded-3xl bg-slate-900 px-5 py-12 sm:px-10 lg:grid-cols-2 lg:items-center lg:px-14 lg:py-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-indigo-200 ring-1 ring-inset ring-white/15">
              <SparklesIcon className="h-3.5 w-3.5" /> Early access
            </span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Join the Founding Pilot</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              We&apos;re inviting a small group of US businesses to try WinBack, share feedback, and help
              shape the product.
            </p>
            <ul className="mt-6 space-y-3">
              {perks.map((perk) => (
                <li key={perk} className="flex items-center gap-3 text-base text-white">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300">
                    <CheckIcon className="h-4 w-4" />
                  </span>
                  {perk}
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

/* -------------------------------------------------------------------- faq -- */

function Faq() {
  const items = [
    ["Is WinBack free?", "The initial 14-day pilot is free for accepted participants."],
    [
      "Will AI send messages without my approval?",
      "The initial pilot uses reviewed message drafts. You remain in control of what gets sent.",
    ],
    ["Do I need to connect my Gmail account?", "Not for the initial product demonstration."],
    [
      "Who is behind WinBack?",
      "WinBack is an early-stage product developed to help small service businesses manage customer follow-ups more effectively. Participants can communicate directly with the founder during the pilot.",
    ],
  ];

  return (
    <section id="faq" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHead title="Frequently Asked Questions" />
        <div className="mt-10 space-y-3">
          {items.map(([q, a]) => (
            <details key={q} className="group rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-900">
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

function FinalCta({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section className="border-t border-slate-100 bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Ready to give it a try?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
          Apply for early access and we&apos;ll contact you about the next available pilot spot.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ApplyButton>Apply for Early Access</ApplyButton>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          {isAuthed ? (
            <Link href="/dashboard" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Go to your dashboard
            </Link>
          ) : (
            <>
              Already in the pilot?{" "}
              <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
                Sign in
              </Link>
            </>
          )}
        </p>
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
              Lead follow-up for service businesses, now in early access.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
            <div>
              <p className="font-semibold text-slate-900">Product</p>
              <ul className="mt-3 space-y-2 text-slate-500">
                <li><a href="#how-it-works" className="transition-colors hover:text-slate-900">How It Works</a></li>
                <li><a href="#apply" className="transition-colors hover:text-slate-900">Founding Pilot</a></li>
                <li><a href="#faq" className="transition-colors hover:text-slate-900">FAQ</a></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Account</p>
              <ul className="mt-3 space-y-2 text-slate-500">
                <li><Link href="/login" className="transition-colors hover:text-slate-900">Login</Link></li>
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
          <p>Early access pilot.</p>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ page -- */

export function LandingPage({ isAuthed = false }: { isAuthed?: boolean }) {
  return (
    <div className="overflow-x-clip bg-white">
      <SiteNav isAuthed={isAuthed} />
      <main>
        <Hero />
        <HowItWorks />
        <Industries />
        <FoundingPilot />
        <Faq />
        <FinalCta isAuthed={isAuthed} />
      </main>
      <SiteFooter />
    </div>
  );
}
