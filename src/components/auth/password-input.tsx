"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

import { Input } from "@/components/ui/field";

/**
 * A single password box with a show/hide toggle. The toggle is what lets the
 * auth screens drop the "confirm password" field without risking a typo
 * locking someone out of their own account.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const describedBy = useId();

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        inputSize="lg"
        className={`pr-16 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        aria-pressed={visible}
        aria-describedby={describedBy}
        className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-4 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600"
      >
        {visible ? "Hide" : "Show"}
      </button>
      <span id={describedBy} className="sr-only">
        Show or hide your password
      </span>
    </div>
  );
}
