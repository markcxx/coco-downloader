"use client";

import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";

export function SegmentedControl<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (value: T) => void; label: string;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
}) {
  const id = useId();
  return <div className="mode-switch" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      {value === option.value && <motion.span layoutId={`segment-${id}`} className="mode-indicator" />}
      <span className="relative z-10 flex items-center gap-2">{option.icon}{option.label}</span>
    </button>)}
  </div>;
}
