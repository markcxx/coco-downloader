"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Search, Loader2, Play, Pause, Download, Check, Music, Trash2, Flame, Zap, ShieldCheck, Headphones } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { MusicItem } from "@/types/music";
import { PlayerBar } from "@/components/PlayerBar";

export default function Home() {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [results, setResults] = useState<MusicItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Playback State
  const [activeMusic, setActiveMusic] = useState<MusicItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [searched, setSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingCount, setDownloadingCount] = useState(0);

  // Initialize Audio
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      if (playing) audio.play().catch(() => setPlaying(false));
    };
    const handleEnded = () => setPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [playing]);

  // Sync Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setSearched(true);
    setResults([]);
    setSelectedIds(new Set());
    
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&provider=${provider}`);
      const data = await res.json();
      setResults(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (item: MusicItem) => {
    if (activeMusic?.id === item.id) {
      if (playing) {
        audioRef.current?.pause();
        setPlaying(false);
      } else {
        audioRef.current?.play();
        setPlaying(true);
      }
      return;
    }

    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      setActiveMusic(item);
      setPlaying(false); // Wait for load
      setCurrentTime(0);

      const res = await fetch(`/api/url?id=${item.id}&provider=${item.provider || 'gequbao'}`);
      const data = await res.json();
      
      if (data.url && audioRef.current) {
        // 如果返回了封面，更新当前播放歌曲的封面
        if (data.cover) {
          setActiveMusic(prev => prev ? { ...prev, cover: data.cover } : item);
        }
        
        audioRef.current.src = data.url;
        audioRef.current.load();
        audioRef.current.play()
          .then(() => setPlaying(true))
          .catch(e => console.error("Play failed", e));
      } else {
        alert("无法获取播放地址");
        setActiveMusic(null);
      }
    } catch (err) {
      console.error(err);
      alert("播放出错");
      setActiveMusic(null);
    }
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const downloadOne = async (item: MusicItem) => {
    try {
      // 双重保险：再次清理文件名中的多余空白
      const cleanTitle = item.title.replace(/\s+/g, ' ').trim();
      // const cleanArtist = item.artist.replace(/\s+/g, ' ').trim();
      const filename = `${cleanTitle}.mp3`;
      
      const res = await fetch(`/api/download?id=${item.id}&provider=${item.provider || 'gequbao'}&filename=${encodeURIComponent(filename)}`);
      
      if (!res.ok) throw new Error("Download failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.id)));
    }
  };

  const handleBatchDownload = async () => {
    const items = results.filter(r => selectedIds.has(r.id));
    if (items.length === 0) return;
    
    if (items.length > 5) {
      if (!confirm(`即将下载 ${items.length} 首歌曲，可能需要一些时间，是否继续？`)) return;
    }

    setDownloadingCount(items.length);

    // 串行下载避免并发过高
    for (const item of items) {
      await downloadOne(item);
      // 增加延迟，防止浏览器拦截
      await new Promise(r => setTimeout(r, 1000));
      setDownloadingCount(prev => Math.max(0, prev - 1));
    }
    setDownloadingCount(0);
  };

  // Next/Prev logic could be implemented if we track index
  const currentIndex = activeMusic ? results.findIndex(r => r.id === activeMusic.id) : -1;
  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < results.length - 1) {
      handlePlay(results[currentIndex + 1]);
    }
  };
  const handlePrev = () => {
    if (currentIndex > 0) {
      handlePlay(results[currentIndex - 1]);
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans selection:bg-sky-100 dark:selection:bg-sky-900 pb-32 transition-colors duration-300">
      <div className="container mx-auto px-4 py-12 flex flex-col items-center">
        
        {/* Header Area */}
        <motion.div 
          layout
          className={cn(
            "flex flex-col items-center justify-center transition-all duration-500 w-full",
            searched ? "mt-0 mb-8" : "mt-[10vh] mb-12"
          )}
        >
          <div className="flex items-center gap-3 mb-4">
             <span className="px-3 py-1 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-300 text-xs font-bold tracking-wider uppercase">
               v2.0 Beta
             </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-4 text-center">
            COCO音乐下载站
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg mb-8 max-w-lg text-center leading-relaxed hidden md:block">
            您的专属高品质音乐获取助手，支持多平台搜索，
            <br />
            极速解析，批量下载，纯净无广。
          </p>
          
          {/* Provider Selector */}
          <div className="flex justify-center mb-6 gap-3">
            {[
              { id: 'gequbao', name: '歌曲宝' },
              { id: 'gequhai', name: '歌曲海' },
              { id: 'qqmp3', name: 'QQMP3' },
              { id: 'migu', name: '咪咕' },
              { id: 'livepoo', name: '力音' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                  provider === p.id 
                    ? "bg-sky-500 text-white shadow-lg shadow-sky-200 dark:shadow-none ring-2 ring-sky-200 dark:ring-sky-800 ring-offset-2 dark:ring-offset-slate-900" 
                    : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800 hover:border-sky-200 dark:hover:border-sky-700"
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative w-full max-w-2xl group mb-6">
            <div className="absolute inset-0 bg-sky-200 dark:bg-sky-900 rounded-full blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-300"></div>
            <div className="relative bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none rounded-full flex items-center p-2 pr-2 border border-slate-100 dark:border-slate-800 transition-transform duration-300 hover:scale-[1.01]">
              <Search className="w-6 h-6 text-slate-400 dark:text-slate-500 ml-4" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索歌曲、歌手..."
                className="flex-1 bg-transparent border-none outline-none px-4 text-lg text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 h-12"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8 h-12 font-medium transition-all active:scale-95 disabled:opacity-70 flex items-center gap-2 cursor-pointer"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "搜索"}
              </button>
            </div>
          </form>

          {/* Hot Tags */}
          <AnimatePresence>
            {!searched && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap justify-center gap-3 text-sm text-slate-500 dark:text-slate-400"
              >
                <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span>热门搜索:</span>
                </div>
                {["周杰伦", "林俊杰", "抖音热歌", "陈奕迅", "古典音乐"].map((tag) => (
                  <span 
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-full cursor-pointer hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-100 dark:hover:border-sky-900 transition-colors shadow-sm dark:shadow-none"
                  >
                    {tag}
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Features Grid - Only show when not searched */}
        <AnimatePresence>
            {!searched && results.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-8"
              >
                 {[
                   { icon: Headphones, title: "全网聚合", desc: "支持主流音乐平台搜索，海量曲库一网打尽" },
                   { icon: Zap, title: "极速解析", desc: "毫秒级解析响应，多线程并发下载，拒绝等待" },
                   { icon: ShieldCheck, title: "纯净无广", desc: "无任何广告干扰，还原最纯粹的音乐体验" }
                 ].map((feature, i) => (
                   <div key={i} className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-100 dark:border-slate-800 p-6 rounded-2xl flex flex-col items-center text-center hover:bg-white dark:hover:bg-slate-900 hover:shadow-lg hover:shadow-slate-100/50 dark:hover:shadow-none transition-all duration-300 group cursor-default">
                     <div className="w-12 h-12 bg-sky-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-sky-500 dark:text-sky-400 mb-4 group-hover:scale-110 transition-transform duration-300">
                       <feature.icon className="w-6 h-6" />
                     </div>
                     <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">{feature.title}</h3>
                     <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                   </div>
                 ))}
              </motion.div>
            )}
        </AnimatePresence>

        {/* Footer Info - Only show when not searched */}
        <AnimatePresence>
          {!searched && results.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-16 text-center text-slate-400 dark:text-slate-500 text-sm"
            >
              <p>© 2024 COCO Music. Powered by Next.js & React.</p>
              <p className="mt-2 text-xs text-slate-300 dark:text-slate-600">仅供个人学习交流使用，请勿用于商业用途</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results List */}
        <div className="w-full max-w-4xl mx-auto flex-1">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500"
              >
                <Loader2 className="w-10 h-10 animate-spin mb-4 text-sky-400" />
                <p>正在寻找动听旋律...</p>
              </motion.div>
            ) : results.length > 0 ? (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden mb-24"
              >
                {/* List Header */}
                <div className="grid grid-cols-[50px_1fr_1fr_100px] md:grid-cols-[50px_2fr_1.5fr_120px] gap-4 p-4 border-b border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-sm font-medium text-slate-500 dark:text-slate-400">
                  <div className="flex justify-center items-center">
                    <button 
                      onClick={toggleAll}
                      className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer",
                        selectedIds.size === results.length && results.length > 0
                          ? "bg-sky-500 border-sky-500 text-white" 
                          : "border-slate-300 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500"
                      )}
                    >
                      {selectedIds.size === results.length && results.length > 0 && <Check className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div>歌曲</div>
                  <div>歌手</div>
                  <div className="text-right pr-4">操作</div>
                </div>

                {/* List Items */}
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                  {results.map((item) => {
                    const isActive = activeMusic?.id === item.id;
                    const isSelected = selectedIds.has(item.id);
                    
                    return (
                      <motion.div 
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onDoubleClick={() => handlePlay(item)}
                        className={cn(
                          "grid grid-cols-[50px_1fr_1fr_100px] md:grid-cols-[50px_2fr_1.5fr_120px] gap-4 p-4 items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 group cursor-pointer select-none active:scale-[0.99] rounded-xl",
                          isActive && "bg-sky-50/50 dark:bg-sky-900/20"
                        )}
                      >
                        <div className="flex justify-center items-center">
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleSelection(item.id); }}
                            className={cn(
                              "w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer",
                              isSelected 
                                ? "bg-sky-500 border-sky-500 text-white" 
                                : "border-slate-300 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500"
                            )}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        <div className="flex items-center gap-3 overflow-hidden">
                          <div 
                            onClick={(e) => { e.stopPropagation(); handlePlay(item); }}
                            className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex-shrink-0 cursor-pointer relative group/cover"
                          >
                            {item.cover ? (
                              <Image
                                src={item.cover}
                                alt={item.title}
                                fill
                                sizes="40px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
                                <Music className="w-5 h-5" />
                              </div>
                            )}
                            <div className={cn(
                              "absolute inset-0 bg-black/20 flex items-center justify-center transition-opacity",
                              isActive ? "opacity-100" : "opacity-0 group-hover/cover:opacity-100"
                            )}>
                              {isActive && playing ? (
                                <Pause className="w-4 h-4 text-white fill-current" />
                              ) : (
                                <Play className="w-4 h-4 text-white fill-current" />
                              )}
                            </div>
                          </div>
                          <span className={cn(
                            "font-medium truncate",
                            isActive ? "text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-slate-200"
                          )}>
                            {item.title}
                          </span>
                        </div>

                        <div className="text-slate-500 dark:text-slate-400 truncate text-sm">
                          {item.artist}
                        </div>

                        <div className="flex justify-end pr-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadOne(item); }}
                            className="p-2 text-slate-400 dark:text-slate-500 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                            title="下载"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            ) : searched ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 text-slate-400 dark:text-slate-500"
              >
                <p>未找到相关歌曲，换个关键词试试？</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating Batch Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-0 right-0 flex justify-center z-40 pointer-events-none"
          >
            <div className="bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 rounded-full px-6 py-3 flex items-center gap-6 pointer-events-auto">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                已选择 <span className="text-sky-600 dark:text-sky-400 font-bold">{selectedIds.size}</span> 首歌曲
              </span>
              
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>

              <button 
                onClick={handleBatchDownload}
                disabled={downloadingCount > 0}
                className="flex items-center gap-2 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium text-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                {downloadingCount > 0 ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    剩余 {downloadingCount} 首...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    批量下载
                  </>
                )}
              </button>

              <button 
                onClick={() => setSelectedIds(new Set())}
                className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player Bar */}
      <AnimatePresence>
        {activeMusic && (
          <PlayerBar 
            currentMusic={activeMusic}
            isPlaying={playing}
            onPlayPause={() => {
              if (playing) {
                audioRef.current?.pause();
                setPlaying(false);
              } else {
                audioRef.current?.play();
                setPlaying(true);
              }
            }}
            onNext={currentIndex < results.length - 1 ? handleNext : undefined}
            onPrev={currentIndex > 0 ? handlePrev : undefined}
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            volume={volume}
            onVolumeChange={setVolume}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
