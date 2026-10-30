"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Trash2 } from "lucide-react";
import { SelectMenu } from "../SelectMenu";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function SongBatchBar({ count, busy = 0, supported = true, onDownload, onClear, quality, qualityOptions, onQualityChange }: {
  count: number; busy?: number; supported?: boolean; onDownload: () => void; onClear: () => void;
  quality?: string; qualityOptions?: Array<{ value: string; label: string }>; onQualityChange?: (value: string) => void;
}) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  if (!mounted) return null;
  return createPortal(<AnimatePresence>{count > 0 && <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="pointer-events-none fixed bottom-24 left-0 right-0 z-40 flex justify-center px-3">
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-3xl bg-[#303030]/95 px-5 py-3 text-[#f3f0ef] shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:gap-6 sm:rounded-full">
      <span className="text-sm font-medium">已选择 <span className="font-bold text-[#a3c9ff]">{count}</span> 首歌曲</span>
      {qualityOptions && onQualityChange && <SelectMenu label="批量下载默认音质" value={quality ?? "default"} options={qualityOptions} onChange={onQualityChange} disabled={busy > 0} />}
      <button type="button" onClick={onDownload} disabled={busy > 0 || !supported} title={supported ? "批量下载所选歌曲" : "当前渠道需逐首下载，可使用客户端进行批量下载"} className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-50">
        {busy > 0 ? <><Loader2 size={18} className="animate-spin" />剩余 {busy} 首…</> : <><Download size={18} />{supported ? "批量下载" : "仅支持逐首下载"}</>}
      </button>
      <button type="button" onClick={onClear} className="cursor-pointer rounded-full p-2 text-[#f3f0ef]/75 transition-colors hover:bg-white/10 hover:text-[#ffdad6]" title="取消选择" aria-label="取消选择"><Trash2 size={18} /></button>
    </div>
  </motion.div>}</AnimatePresence>, document.body);
}
