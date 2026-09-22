import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

const CONTROL_BASE =
  "block w-full rounded-lg border-0 bg-white text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:bg-slate-50 disabled:text-slate-500";

/**
 * `lg` is for the auth screens: a 48px control that is comfortable to tap and
 * whose 16px text stops iOS Safari zooming in when it gains focus.
 */
const CONTROL_SIZES = {
  md: "px-3 py-2 text-sm",
  lg: "h-12 px-4 text-base",
} as const;

type ControlSize = keyof typeof CONTROL_SIZES;

const CONTROL_CLASSES = cn(CONTROL_BASE, CONTROL_SIZES.md);

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Input({
  className,
  inputSize = "md",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { inputSize?: ControlSize }) {
  return <input className={cn(CONTROL_BASE, CONTROL_SIZES[inputSize], className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL_CLASSES, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL_CLASSES, "min-h-24 resize-y", className)} {...props} />;
}
