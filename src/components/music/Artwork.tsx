"use client";
import Image from "next/image";
import { useState } from "react";
import { Music2 } from "lucide-react";
import styles from "./artwork.module.css";

export function Artwork({ url, className = "" }: { url?: string; className?: string }) {
  const source = url;
  const [failure, setFailure] = useState({ source: "", attempt: 0 });
  const attempt = failure.source === source ? failure.attempt : 0;
  const direct = url?.replace(/^http:/, "https:");
  // Retry HTTP artwork over HTTPS. A changed URL starts with a fresh attempt.
  const sources = [...new Set([source, direct].filter((value): value is string => Boolean(value)))];
  const current = sources[attempt];
  return <span className={`${styles.artwork} ${className}`}>
    {current ? <Image key={current} src={current} width={400} height={400} alt="" unoptimized referrerPolicy="no-referrer" onError={() => setFailure({ source: source ?? "", attempt: attempt + 1 })} /> : <Music2 size={24} strokeWidth={1.3} />}
  </span>;
}
