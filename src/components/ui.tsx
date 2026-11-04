import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  brand: "border-brand bg-brand text-white enabled:hover:bg-brand-dark",
  neutral: "border-slate-700 bg-slate-700 text-white enabled:hover:bg-slate-800",
  outlined: "border-line bg-surface text-ink enabled:hover:bg-slate-100",
  plain: "border-transparent bg-transparent text-ink enabled:hover:bg-slate-200",
  danger: "border-danger bg-danger text-white enabled:hover:bg-red-800",
  "danger-outlined": "border-danger bg-surface text-danger enabled:hover:bg-red-50",
  warning: "border-warning bg-warning text-white enabled:hover:bg-amber-900",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  small?: boolean;
}

export function Button({ variant = "outlined", small, className = "", ...props }: ButtonProps) {
  const size = small ? "min-h-8 px-3 text-sm" : "min-h-10 px-4";
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center justify-center touch-manipulation rounded-control border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function ProgressBar({ id, label, value }: { id: string; label: string; value: number }) {
  return (
    <progress
      id={id}
      aria-label={label}
      max={100}
      value={value}
      className="block h-3 w-full appearance-none overflow-hidden rounded-full bg-slate-200 [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-brand"
    />
  );
}

export function StatusLine({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} role="status" hidden={!text} className="text-muted">
      {text}
    </p>
  );
}
