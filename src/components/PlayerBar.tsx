"use client";

import Image from "next/image";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MusicItem } from "@/types/music";
import { ConfigProvider, Slider } from "antd";

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
  const formatTime = (time?: number) => {
    const t = typeof time === "number" ? time : 0;
    if (isNaN(t)) return "00:00";
    const minutes = Math.floor(t / 60);
    const seconds = Math.floor(t % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  if (!currentMusic) return null;

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#0ea5e9",
        },
      }}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-4 py-3 z-50 shadow-2xl shadow-slate-200/50 dark:shadow-none pb-safe"
      >
        {/* Mobile Progress Bar */}
        <div className="absolute top-0 left-0 right-0 md:hidden -mt-3 px-0">
           <Slider
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={onSeek}
              tooltip={{ formatter: formatTime }}
              styles={{
                track: { background: "#0ea5e9" },
                rail: { background: "rgba(0,0,0,0.05)" },
                handle: { display: "none" }
              }}
              style={{ margin: 0, padding: 0, height: 4 }}
            />
        </div>

        <div className="container mx-auto max-w-5xl flex items-center justify-between gap-4">
          {/* Track Info */}
          <div className="flex items-center gap-3 md:gap-4 flex-1 md:w-1/4 md:min-w-[200px] min-w-0">
            <div className={cn(
              "w-10 h-10 md:w-12 md:h-12 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden relative flex-shrink-0",
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
            <div className="flex flex-col overflow-hidden min-w-0">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate text-sm">{currentMusic.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{currentMusic.artist}</p>
            </div>
          </div>

          {/* Mobile Play Button */}
          <div className="md:hidden flex items-center gap-4">
            <button 
              onClick={onPlayPause}
              className="w-9 h-9 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-transform"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <button 
              onClick={onNext}
              disabled={!onNext}
              className="text-slate-400 dark:text-slate-500 active:text-sky-500"
            >
               <SkipForward className="w-6 h-6" />
            </button>
          </div>

          {/* Desktop Controls */}
          <div className="hidden md:flex flex-col items-center flex-1 max-w-lg">
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
              <div className="flex-1 px-2">
                <Slider
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={onSeek}
                  tooltip={{ formatter: formatTime }}
                  styles={{
                    track: { background: "#0ea5e9" },
                    handle: { borderColor: "#0ea5e9" }
                  }}
                />
              </div>
              <span className="w-10 tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Volume & Extras (Desktop Only) */}
          <div className="hidden md:flex w-1/4 justify-end items-center gap-4 min-w-[150px]">
            <div className="flex items-center gap-2 group w-32">
              <button 
                onClick={() => onVolumeChange(volume === 0 ? 1 : 0)}
                className="text-slate-400 dark:text-slate-500 hover:text-sky-500 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <div className="flex-1 w-24">
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={onVolumeChange}
                  tooltip={{ formatter: (val) => `${Math.round((val || 0) * 100)}%` }}
                  styles={{
                    track: { background: "#0ea5e9" },
                    handle: { borderColor: "#0ea5e9" }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </ConfigProvider>
  );
}
