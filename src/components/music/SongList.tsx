"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Pause, Play, Download, MoreHorizontal, Copy, CheckSquare } from "lucide-react";
import { Dropdown, message } from "antd";
import { cn } from "@/lib/utils";
import type { MusicItem } from "@/types/music";
import { Artwork } from "./Artwork";
import { SongCheckbox } from "./SongCheckbox";
import { SearchField } from "../SearchField";
import styles from "./song-list.module.css";

export function SongList({ items, selectedIds, onToggle, onToggleAll, activeMusic, playing, resolvingId, onPlay, renderActions, showIndex = false, emptyText = "暂无歌曲" }: {
  items: MusicItem[];
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  activeMusic?: MusicItem | null;
  playing?: boolean;
  resolvingId?: string | null;
  onPlay?: (item: MusicItem) => void;
  renderActions?: (item: MusicItem) => ReactNode;
  showIndex?: boolean;
  emptyText?: string;
}) {
  const selectable = Boolean(selectedIds && onToggle);
  const checked = items.filter(item => selectedIds?.has(item.id)).length;
  return <div className={styles.list} role="table" aria-label="歌曲列表">
    <div className={cn(styles.header, styles.row, !selectable && !showIndex && styles.noLeading)} role="row">
      {(selectable || showIndex) && <span role="columnheader" className={styles.leading}>{selectable && onToggleAll ? <SongCheckbox checked={checked === items.length && checked > 0} mixed={checked > 0 && checked < items.length} onChange={onToggleAll} label="全选当前列表" /> : "#"}</span>}
      <span role="columnheader">歌名 / 歌手</span><span role="columnheader" aria-label="歌曲操作" /><span role="columnheader" className={styles.album}>专辑</span><span role="columnheader" className={styles.duration}>时长</span>
    </div>
    {items.map((item, index) => {
      const active = activeMusic?.id === item.id && activeMusic?.provider === item.provider;
      return <div key={`${item.provider}:${item.id}:${index}`} role="row" className={cn(styles.row, styles.song, active && styles.active, !selectable && !showIndex && styles.noLeading)} onDoubleClick={() => onPlay?.(item)}>
        {(selectable || showIndex) && <span role="cell" className={styles.leading}>{selectable ? <SongCheckbox checked={selectedIds!.has(item.id)} onChange={() => onToggle?.(item.id)} label={`选择${item.title}`} /> : String(index + 1).padStart(2, "0")}</span>}
        <span role="cell" className={styles.identity}>
          <button type="button" className={styles.cover} onClick={event => { event.stopPropagation(); onPlay?.(item); }} onDoubleClick={event => event.stopPropagation()} disabled={!onPlay} aria-label={`播放${item.title}`}><Artwork url={item.cover} /><span className={cn(styles.coverOverlay, active && styles.visible)}>{resolvingId === item.id ? <Loader2 size={17} className="animate-spin" /> : active && playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</span></button>
          <span className={styles.names}><strong title={item.title}>{item.title}</strong><span title={item.artist}>{item.artist || "未知歌手"}</span></span>
        </span>
        <span role="cell" className={styles.actions} onDoubleClick={event => event.stopPropagation()}>{renderActions?.(item)}</span><span role="cell" className={styles.album} title={item.album}>{item.album || "—"}</span><span role="cell" className={styles.duration}>{item.duration || "—"}</span>
      </div>;
    })}
    {!items.length && <p className={styles.empty}>{emptyText}</p>}
  </div>;
}

export function SongRowActions({ item, onPlay, onDownload, onToggleSelection, selected = false, playing = false, resolving = false, previewDisabled = false, downloadLabel = "下载", children }: { item: MusicItem; onPlay: () => void; onDownload: () => void; onToggleSelection?: () => void; selected?: boolean; playing?: boolean; resolving?: boolean; previewDisabled?: boolean; downloadLabel?: string; children?: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const playLabel = previewDisabled ? "此渠道不支持试听" : playing ? "暂停" : "播放";
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      void message.success("已复制");
    } catch {
      void message.error("复制失败，请检查浏览器的剪贴板权限");
    }
  }
  return <><button type="button" title={playLabel} aria-label={playLabel} onClick={onPlay} disabled={previewDisabled}>{resolving ? <Loader2 size={22} className="animate-spin" /> : playing ? <Pause size={22} /> : <Play size={22} />}</button>{children}<button type="button" title={downloadLabel} aria-label={downloadLabel} onClick={onDownload}><Download size={22} /></button><Dropdown trigger={["click"]} open={menuOpen} onOpenChange={setMenuOpen} menu={{ items: [
    { key: "copy-info", label: "复制歌曲信息", icon: <Copy size={16} />, onClick: () => { void copy([`${item.title} - ${item.artist || "未知歌手"}`, item.album && `专辑：${item.album}`].filter(Boolean).join("\n")); } },
    { key: "copy-title", label: "复制歌名", icon: <Copy size={16} />, onClick: () => { void copy(item.title); } },
    ...(onToggleSelection ? [{ key: "select", label: selected ? "取消勾选此歌曲" : "勾选此歌曲", icon: <CheckSquare size={16} />, onClick: onToggleSelection }] : []),
  ] }}><button type="button" title="更多操作" aria-label="更多操作" aria-expanded={menuOpen} data-menu-open={menuOpen}><MoreHorizontal size={22} /></button></Dropdown></>;
}

export function SongListToolbar({ children, query, onQueryChange }: { children: ReactNode; query: string; onQueryChange: (value: string) => void }) {
  return <div className={styles.toolbar}><div className={styles.toolbarActions}>{children}</div><SearchField compact className={styles.filter} label="筛选当前歌曲列表" placeholder="搜索当前列表" value={query} onChange={onQueryChange} /></div>;
}

export function SongActionButton({ children, onClick, primary = false, disabled = false }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={cn(styles.actionButton, primary && styles.primary)} onClick={onClick}>{children}</button>;
}
