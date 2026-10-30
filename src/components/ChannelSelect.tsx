"use client";

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { MUSIC_PLATFORMS, getMusicPlatform } from '@/lib/music-channels';
import { cn } from '@/lib/utils';

export function ChannelSelect({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submenuId, setSubmenuId] = useState<string | null>(null);
  const [placement, setPlacement] = useState({ above: false, maxHeight: 440 });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const activePlatform = getMusicPlatform(value);
  const submenu = MUSIC_PLATFORMS.find(item => item.id === submenuId);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('focusin', closeOutside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('focusin', closeOutside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const openSubmenu = (id: string, focus = false) => {
    setSubmenuId(id);
    if (focus) requestAnimationFrame(() => document.getElementById('music-channel-submenu')?.querySelector<HTMLButtonElement>('button')?.focus());
  };

  const moveFocus = (event: React.KeyboardEvent, selector: string) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>(selector) || [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(current + direction + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div ref={root} className="relative min-w-[152px] shrink-0">
      <button
        type="button" ref={trigger} disabled={disabled}
        aria-label="选择音乐平台与搜索渠道" aria-haspopup="menu" aria-expanded={open} aria-controls="music-platform-menu"
        onClick={() => {
          const rect = root.current?.getBoundingClientRect();
          if (rect) {
            const below = window.innerHeight - rect.bottom - 20;
            const above = rect.top - 20;
            const useAbove = below < 280 && above > below;
            setPlacement({ above: useAbove, maxHeight: Math.max(160, Math.min(440, useAbove ? above : below)) });
          }
          setSubmenuId(null); setOpen(!open);
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) trigger.current?.click();
            requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[data-platform]')?.focus());
          }
        }}
        className={cn('flex h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border bg-white px-4 text-left text-sm font-medium text-[#1b1b1c] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#005faa] disabled:cursor-wait disabled:opacity-60 dark:bg-[#303030] dark:text-[#f3f0ef]', open ? 'border-[#005faa]/45' : 'border-white/10')}
      >
        <span>{activePlatform?.name || '选择音乐平台'}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className={cn('absolute left-0 z-40 w-36 pt-1', placement.above ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]')} onMouseLeave={() => setSubmenuId(null)}>
          <div id="music-platform-menu" role="menu" aria-label="音乐平台" style={{ maxHeight: placement.maxHeight }} className="overflow-y-auto rounded-xl border border-[#c0c7d4]/40 bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.14)] dark:border-white/10 dark:bg-[#303030]" onKeyDown={event => moveFocus(event, '[data-platform]')}>
            {MUSIC_PLATFORMS.map(item => (
              <button key={item.id} id={`platform-${item.id}`} data-platform type="button" role="menuitem" aria-haspopup="menu" aria-expanded={item.id === submenuId} aria-controls={item.id === submenuId ? 'music-channel-submenu' : undefined}
                onMouseEnter={() => openSubmenu(item.id)} onFocus={() => openSubmenu(item.id)} onClick={() => openSubmenu(item.id)}
                onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); openSubmenu(item.id, true); } }}
                className={cn('flex min-h-10 w-full cursor-pointer items-center justify-between gap-1 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#005faa]', item.id === submenuId ? 'bg-[#d3e3ff] text-[#005faa] dark:bg-[#003f6d] dark:text-[#a3c9ff]' : 'text-[#1b1b1c] hover:bg-black/5 dark:text-[#f3f0ef] dark:hover:bg-white/10')}>
                <span>{item.name}</span><ChevronRight className="h-3.5 w-3.5 shrink-0" />
              </button>
            ))}
          </div>
          {submenu && (
            <div className="absolute left-full top-1 w-[min(300px,calc(100vw-180px))] pl-1">
              <div id="music-channel-submenu" role="menu" aria-label={`${submenu.name}搜索渠道`} style={{ maxHeight: placement.maxHeight }} className="overflow-y-auto rounded-xl border border-[#c0c7d4]/40 bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.14)] dark:border-white/10 dark:bg-[#303030]"
                onKeyDown={event => {
                  moveFocus(event, '#music-channel-submenu button');
                  if (event.key === 'ArrowLeft') { event.preventDefault(); document.getElementById(`platform-${submenu.id}`)?.focus(); }
                }}>
                {submenu.channels.map(item => (
                  <button key={item.id} type="button" role="menuitemradio" aria-checked={value === item.id} onClick={() => { onChange(item.id); setOpen(false); trigger.current?.focus(); }} className={cn('block w-full cursor-pointer rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#005faa]', value === item.id ? 'bg-[#d3e3ff]/60 dark:bg-[#003f6d]/60' : 'hover:bg-[#f6f3f2] dark:hover:bg-white/5')}>
                    <span className="flex items-center justify-between gap-1 text-sm font-semibold text-[#1b1b1c] dark:text-[#f3f0ef]">{item.name}{value === item.id && <Check className="h-4 w-4 shrink-0 text-[#005faa] dark:text-[#a3c9ff]" />}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1">{item.badges.map(badge => <span key={badge} className="rounded bg-[#005faa]/10 px-1.5 py-0.5 text-[10px] text-[#005faa] dark:bg-[#a3c9ff]/15 dark:text-[#a3c9ff]">{badge}</span>)}</span>
                    <span className="mt-1.5 block text-xs leading-5 text-[#404752] dark:text-[#c6c6c7]">{item.description}</span>
                  </button>
                ))}
                {submenu.unavailableReason && <p className="px-3 py-3 text-xs leading-5 text-[#404752] dark:text-[#c6c6c7]">{submenu.unavailableReason}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
