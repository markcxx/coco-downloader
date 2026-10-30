"use client";

import type { FormEventHandler, ReactNode } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./search-field.module.css";

export function SearchField({ value, onChange, onSubmit, placeholder, label, submitLabel = "搜索", busy = false, compact = false, prefix, icon, className }: {
  value: string; onChange: (value: string) => void; onSubmit?: FormEventHandler<HTMLFormElement>;
  placeholder: string; label: string; submitLabel?: string; busy?: boolean; compact?: boolean;
  prefix?: ReactNode; icon?: ReactNode; className?: string;
}) {
  return <form className={cn(styles.form, compact && styles.compact, className)} onSubmit={event => { event.preventDefault(); onSubmit?.(event); }} aria-busy={busy} role="search" aria-label={label}>
    {prefix && <div className={styles.prefix}>{prefix}</div>}
    <div className={styles.field}>
      <span className={styles.icon} aria-hidden="true">{icon || <Search size={20} />}</span>
      <input type="text" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={label} />
      <button type="submit" disabled={busy} aria-label={busy ? "正在处理" : submitLabel}>{busy ? <Loader2 size={17} className="animate-spin" /> : <>{submitLabel}<ArrowRight size={16} /></>}</button>
    </div>
  </form>;
}
