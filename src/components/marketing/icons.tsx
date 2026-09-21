import type { SVGProps } from "react";

/**
 * Small, consistent stroke icons for the marketing site. Everything is inline
 * SVG so the landing page ships no image requests and stays crisp on any
 * screen — no stock photography anywhere.
 */

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function BoltIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
    </svg>
  );
}

export function TrackIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 5h16M4 12h10M4 19h7" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export function RevenueIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5 9.2 9.5 12 10s5 1.1 5 3-2.2 3.5-5 3.5-5-1.1-5-3" />
    </svg>
  );
}

export function HandoffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 11l2 2 4-4" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4M8 13h2M14 13h2M8 17h2" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function WrenchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.7 6.3a4 4 0 0 1-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.5-.6-.6-2.5 2.5-2.3Z" />
    </svg>
  );
}

export function DropletIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2.5s6 6.2 6 10.5a6 6 0 0 1-12 0C6 8.7 12 2.5 12 2.5Z" />
    </svg>
  );
}

export function FanIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10c0-4 1-7 3-7s2 4-1 6M14 12c4 0 7 1 7 3s-4 2-6-1M12 14c0 4-1 7-3 7s-2-4 1-6M10 12c-4 0-7-1-7-3s4-2 6 1" />
    </svg>
  );
}

export function PlugIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 2v5M15 2v5M6 7h12v3a6 6 0 0 1-12 0V7ZM12 16v6" />
    </svg>
  );
}

export function BuildingIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 21V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15M16 21V10h3a1 1 0 0 1 1 1v10M8 8h2M8 12h2M8 16h2" />
      <path d="M3 21h18" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function SilenceIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m3 3 18 18M18.5 8.5a8 8 0 0 1-.6 8.3l-2-2M15.5 5.5A8 8 0 0 0 6.2 6M4.5 9a8 8 0 0 0 1.9 8l-2 1 5 .5" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
    </svg>
  );
}
