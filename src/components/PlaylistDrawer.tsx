'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ListMusic, Play, Trash2, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MusicItem } from '@/types/music';
import Image from 'next/image';

interface PlaylistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: MusicItem[];
  onPlay: (item: MusicItem) => void;
  onRemove: (itemId: string) => void;
}

export function PlaylistDrawer({
  isOpen,
  onClose,
  items,
  onPlay,
  onRemove,
}: PlaylistDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-[#1b1b1c]/20 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-[380px] flex-col gap-4 border-l border-white/10 bg-[#eae7e7]/95 p-4 shadow-[0_0_40px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:bg-[#242526]/95"
          >
            <div className="mt-4 flex items-start justify-between">
              <div>
                <h2 className="text-[28px] font-bold leading-9 text-[#1b1b1c] dark:text-[#f3f0ef]">我的歌单</h2>
                <p className="mt-1 text-sm leading-5 text-[#404752] dark:text-[#c6c6c7]">
                  {items.length > 0 ? `${items.length} 首歌` : '还没有添加歌曲'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="cursor-pointer rounded-full p-2 text-[#404752] transition-colors hover:bg-[#e5e2e1] dark:text-[#c6c6c7] dark:hover:bg-white/10"
                aria-label="关闭歌单"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-[#404752] dark:text-[#c6c6c7]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white dark:bg-white/10">
                    <ListMusic className="h-8 w-8 text-[#717783] dark:text-[#c6c6c7]" />
                  </div>
                  <p>歌单是空的</p>
                  <p className="text-xs">在搜索结果中点击 ♡ 添加歌曲</p>
                </div>
              ) : (
                items.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="group flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-[1px] dark:border-white/10 dark:bg-[#303030]"
                  >
                    <div
                      onClick={() => onPlay(item)}
                      className="relative h-11 w-11 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg bg-[#f0eded] dark:bg-[#303030]"
                    >
                      {item.cover ? (
                        <Image src={item.cover} alt={item.title} fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#404752]">
                          <Music className="w-5 h-5" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-5 w-5 fill-current text-white" />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium leading-5 text-[#1b1b1c] dark:text-[#f3f0ef]">
                        {item.title}
                      </h3>
                      <p className="truncate text-xs text-[#404752] dark:text-[#c6c6c7]">
                        {item.artist}
                      </p>
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                      className="cursor-pointer rounded-full p-1.5 text-[#ba1a1a] opacity-0 transition-all hover:bg-[#ffdad6]/50 group-hover:opacity-100"
                      title="从歌单移除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
