"use client";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function SongCheckbox({ checked, mixed = false, onChange, label }: { checked: boolean; mixed?: boolean; onChange: () => void; label: string }) {
  return <button type="button" role="checkbox" aria-label={label} aria-checked={mixed ? "mixed" : checked} onClick={event => { event.stopPropagation(); onChange(); }} className={cn("w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer shrink-0", checked || mixed ? "bg-[#005faa] border-[#005faa] text-white" : "border-[#c0c7d4] bg-white hover:border-[#005faa] dark:bg-[#242526]")}>
    {mixed ? <Minus className="w-3.5 h-3.5" /> : checked && <Check className="w-3.5 h-3.5" />}
  </button>;
}
