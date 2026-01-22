"use client";

import Image from "next/image";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MusicItem } from "@/types/music";

interface PlayerBarProps {
  currentMusic: MusicItem | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
}

export function PlayerBar({
  currentMusic,
  isPlaying,
  onPlayPause,
  onNext,
  onPrev,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange
}: PlayerBarProps) {
  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  if (!currentMusic) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-4 py-3 z-50 shadow-2xl shadow-slate-200/50 dark:shadow-none"
    >
      <div className="container mx-auto max-w-5xl flex items-center justify-between gap-4">
        {/* Track Info */}
        <div className="flex items-center gap-4 w-1/4 min-w-[200px]">
          <div className={cn(
            "w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden relative flex-shrink-0",
            isPlaying && "animate-spin-slow"
          )} style={{ animationDuration: '8s' }}>
            {currentMusic.cover ? (
              <Image
                src={currentMusic.cover}
                alt={currentMusic.title}
                fill
                sizes="48px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-sky-100 dark:bg-sky-900 text-sky-500 dark:text-sky-400 font-bold">
                {currentMusic.title[0]}
              </div>
            )}
          </div>
          <div className="flex flex-col overflow-hidden">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate text-sm">{currentMusic.title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{currentMusic.artist}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center flex-1 max-w-lg">
          <div className="flex items-center gap-6 mb-1">
            <button 
              onClick={onPrev}
              disabled={!onPrev}
              className="text-slate-400 dark:text-slate-500 hover:text-sky-500 dark:hover:text-sky-400 transition-colors disabled:opacity-30 cursor-pointer"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            
            <button 
              onClick={onPlayPause}
              className="w-10 h-10 rounded-full bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center transition-transform active:scale-95 shadow-lg shadow-sky-500/30 dark:shadow-none cursor-pointer"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            
            <button 
              onClick={onNext}
              disabled={!onNext}
              className="text-slate-400 dark:text-slate-500 hover:text-sky-500 dark:hover:text-sky-400 transition-colors disabled:opacity-30 cursor-pointer"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
          
          <div className="w-full flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 font-medium">
            <span className="w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
            <div 
              className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full relative cursor-pointer group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                onSeek(percent * duration);
              }}
            >
              <div 
                className="absolute top-0 left-0 h-full bg-sky-400 dark:bg-sky-500 rounded-full group-hover:bg-sky-500 dark:group-hover:bg-sky-400 transition-colors"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              {/* Thumb */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-slate-200 border border-slate-300 dark:border-slate-600 shadow-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${(currentTime / duration) * 100}%`, marginLeft: '-6px' }}
              />
            </div>
            <span className="w-10 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume & Extras */}
        <div className="w-1/4 flex justify-end items-center gap-4 min-w-[150px]">
          <div className="flex items-center gap-2 group w-32">
            <button 
              onClick={() => onVolumeChange(volume === 0 ? 1 : 0)}
              className="text-slate-400 dark:text-slate-500 hover:text-sky-500 dark:hover:text-sky-400 transition-colors cursor-pointer"
            >
              {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <div 
              className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full cursor-pointer relative overflow-hidden"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                onVolumeChange(percent);
              }}
            >
              <div 
                className="absolute top-0 left-0 h-full bg-sky-400 dark:bg-sky-500 rounded-full"
                style={{ width: `${volume * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
