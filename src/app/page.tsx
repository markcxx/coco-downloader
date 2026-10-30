"use client";
import React, { useRef, useState } from "react";
import { Download, ListChecks, Loader2, Music, Play } from "lucide-react";
import { message } from "antd";
import { SearchField } from "@/components/SearchField";
import { ChannelSelect } from "@/components/ChannelSelect";
import { SongList, SongRowActions, SongListToolbar, SongActionButton } from "@/components/music/SongList";
import { SongBatchBar } from "@/components/music/SongBatchBar";
import { DownloadDrawer } from "@/components/DownloadDrawer";
import { BrowserDownloadNotice } from "@/components/BrowserDownloadNotice";
import { QualitySelectModal } from "@/components/QualitySelectModal";
import { getMusicChannel, getMusicPlatform, supportsBatchDownload } from "@/lib/music-channels";
import { BrowserDirectDownloadError, fetchAudioBlob } from "@/lib/browser-download";
import { PlayerBar } from '@/components/PlayerBar';
import { FullscreenPlayerDrawer } from '@/components/FullscreenPlayerDrawer';
import { useWebPlayer } from '@/hooks/useWebPlayer';
import type { MusicItem } from "@/types/music";
import { useDownloadTasks } from "@/hooks/useDownloadTasks";
import { isDownloadHistory } from "@/lib/download-history";
import type { DownloadTask } from "@/types/download";
async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(35000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '渠道请求失败，请重试或切换渠道');
  return data;
}

function notifyError(error: unknown, fallback: string, key = 'request-error') {
  const content = error instanceof Error && error.name !== 'TimeoutError' ? error.message : fallback;
  void message.error({ key, content, duration: 6 });
}

type QualityOption = {
  value: string;
  label: string;
  quality: string;
  format: string;
};

type ProviderExtra = {
  selectedQuality?: string;
  selectedFormat?: string;
  selectedLevel?: string;
  level?: string;
  selectedParser?: string;
  qualityOptions?: QualityOption[];
};

type QualityModalState = {
  mode: "single" | "batch";
  items: MusicItem[];
  qualityItemCount: number;
  optionKind: "quality" | "downloadSource";
};

function buildQualityValue(extra?: ProviderExtra) {
  if (extra?.selectedParser) {
    return extra.selectedParser;
  }
  if (extra?.selectedLevel) {
    return extra.selectedLevel;
  }
  if (extra?.level) {
    return extra.level;
  }
  if (extra?.selectedQuality && extra?.selectedFormat) {
    return `${extra.selectedQuality}:${extra.selectedFormat}`;
  }
  return extra?.qualityOptions?.[0]?.value || "";
}

function buildDownloadFilename(item: MusicItem) {
  const cleanTitle = item.title.replace(/\s+/g, " ").trim();
  const extra = getProviderExtra(item);
  const extension = extra?.selectedFormat?.toLowerCase() || "mp3";
  return `${cleanTitle}.${extension}`;
}

function collectQualityOptions(items: MusicItem[]) {
  const map = new Map<string, QualityOption>();
  for (const item of items) {
    const options = getProviderExtra(item)?.qualityOptions || [];
    for (const option of options) {
      if (!map.has(option.value)) {
        map.set(option.value, option);
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    const aQuality = Number(a.quality);
    const bQuality = Number(b.quality);
    if (!Number.isFinite(aQuality) || !Number.isFinite(bQuality)) return 0;
    return bQuality - aQuality;
  });
}

function applyQualityChoice(item: MusicItem, value: string) {
  const match = getProviderExtra(item)?.qualityOptions?.find(option => option.value === value);
  if (!match) return item;
  if (item.provider === 'qq' || item.provider === 'kugou') return { ...item, extra: { ...(item.extra as Record<string, unknown>), selectedParser: match.value, selectedFormat: match.format } };
  if (item.provider !== 'netease' && item.provider !== 'gdstudio-netease') return item;
  return { ...item, extra: { ...(item.extra as Record<string, unknown>), selectedLevel: match.value, level: match.value } };
}

function getQualityItems(items: MusicItem[]) {
  return items.filter((item) => (getProviderExtra(item)?.qualityOptions || []).length > 0);
}

function getProviderExtra(item: MusicItem): ProviderExtra | undefined {
  if (!item.extra || typeof item.extra !== "object") return undefined;
  return item.extra as ProviderExtra;
}


export default function Home() {
  const { activeMusic, playing, resolvingMusicId, currentTime, duration, volume, playMode, lyricLines, lyricLoading, playerDrawerOpen, setPlayerDrawerOpen, handlePlay, handleSeek, setVolume, togglePlayMode, canPrev, canNext, handlePrev, handleNext } = useWebPlayer();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("gdstudio-netease");
  const [results, setResults] = useState<MusicItem[]>([]);
  const [resultFilter, setResultFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [downloadTasks, setDownloadTasks] = useDownloadTasks();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [downloadingCount, setDownloadingCount] = useState(0);
  const [qualityModal, setQualityModal] = useState<QualityModalState | null>(null);
  const [selectedQualityValue, setSelectedQualityValue] = useState("");
  const requestId = useRef(0);
  const activeChannel = getMusicChannel(provider);
  const activePlatform = getMusicPlatform(provider);
  const batchSupported = supportsBatchDownload(provider);
  const visibleResults = results.filter(item => `${item.title} ${item.artist} ${item.album || ""}`.toLowerCase().includes(resultFilter.trim().toLowerCase()));
  const changeChannel = (id: string) => {
    requestId.current++;
    setProvider(id); setResults([]); setSelectedIds(new Set());
    setHasMoreResults(false); setSearched(false); setResultFilter("");
  };
  const fetchSearchPage = async (offset: number) => {
    const data = await fetchJson(`/api/search?${new URLSearchParams({q:query.trim(),provider,limit:"20",offset:String(offset)})}`);
    return (Array.isArray(data.items) ? data.items : []) as MusicItem[];
  };
  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim() || loading) return;
    const id = ++requestId.current;
    setLoading(true); setSearched(true); setResults([]); setSelectedIds(new Set()); setResultFilter(""); setHasMoreResults(false);
    try {
      const items = await fetchSearchPage(0);
      if (id === requestId.current) { setResults(items); setHasMoreResults(items.length === 20); }
    } catch (error) { notifyError(error, "搜索失败，请重试或切换渠道"); }
    finally { setLoading(false); }
  };
  const handleLoadMore = async () => {
    if (loading || loadingMore || !hasMoreResults) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const items = await fetchSearchPage(results.length);
      if (id === requestId.current) {
        setResults(previous => { const seen=new Set(previous.map(i=>i.id)); return [...previous,...items.filter(i=>!seen.has(i.id))]; });
        setHasMoreResults(items.length === 20 && items.some(i=>!results.some(p=>p.id===i.id)));
      }
    } catch(error) { notifyError(error, "加载失败"); }
    finally { setLoadingMore(false); }
  };
  const executeDownload = async (task: DownloadTask, browserWindow?: Window | null, handoffImmediately = false) => {
    try {
      const downloadItem = task.musicItem;
        // Update status to downloading
        setDownloadTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, status: 'downloading', notice: undefined } : t
        ));

        const params = new URLSearchParams({
          id: downloadItem.id,
          provider: downloadItem.provider || 'netease',
        });
        if (downloadItem.extra !== undefined) params.set('extra', JSON.stringify(downloadItem.extra));
        const response = await fetch(`/api/download?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(35000) });
        const delivery = await response.json();
        if (!response.ok || typeof delivery.url !== 'string') throw new Error(delivery.error || '下载链接获取失败');
        const extension = String(delivery.type || '').toLowerCase();
        const fileName = ['mp3', 'flac', 'm4a', 'aac', 'wav', 'ogg', 'opus'].includes(extension)
          ? task.fileName.replace(/\.[^.]+$/, `.${extension}`)
          : task.fileName;
        const sourcePage = delivery.delivery === 'source-page';
        if (sourcePage || getMusicChannel(downloadItem.provider)?.download === 'browser') {
          if (handoffImmediately) {
            if (browserWindow && !browserWindow.closed) {
              browserWindow.location.replace(delivery.url);
            } else {
              // If popups are blocked or the reserved tab was closed, hand off
              // in this tab so downloading never requires another button click.
              window.location.assign(delivery.url);
            }
          }
          setDownloadTasks(prev => prev.map(t => t.id === task.id ? {
            ...t, fileName, sourceUrl: delivery.url, delivery: sourcePage ? 'source-page' : 'audio',
            status: handoffImmediately ? 'handed-off' : 'browser-ready',
            notice: sourcePage ? '请在源站选择网盘入口保存，网页无法跟踪后续进度。' : '已交给浏览器处理，网页无法跟踪后续进度。',
          } : t));
          return;
        }
        setDownloadTasks(prev => prev.map(t => t.id === task.id ? { ...t, fileName, sourceUrl: delivery.url } : t));
        let blob: Blob;
        try {
          blob = await fetchAudioBlob(delivery.url, (progress, receivedBytes, totalBytes) => {
            setDownloadTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress, receivedBytes, totalBytes } : t));
          });
        } catch (error) {
          if (!(error instanceof BrowserDirectDownloadError)) throw error;
          setDownloadTasks(prev => prev.map(t => t.id === task.id ? {
            ...t, status: 'browser-ready', progress: 0, receivedBytes: undefined, totalBytes: undefined, notice: error.message,
          } : t));
          return;
        }

        // Handle completion
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);

        setDownloadTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, fileName, status: 'completed', progress: 100, notice: undefined, error: undefined } : t
        ));
    } catch (err: unknown) {
      if (browserWindow && !browserWindow.closed) browserWindow.close();
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : '下载失败';
      void message.error({ key: `download-${task.id}`, content: `${task.musicItem.title}：${errorMessage}`, duration: 6 });
      setDownloadTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, status: 'error', error: errorMessage } : t
      ));
    }
  };

  const createTask = (item: MusicItem): DownloadTask => {
    const taskId = `${item.id}-${Date.now()}`;
    return {
      id: taskId,
      musicItem: item,
      status: 'pending',
      progress: 0,
      fileName: buildDownloadFilename(item),
      startTime: Date.now()
    };
  };

  const startSingleDownload = async (item: MusicItem) => {
    const newTask = createTask(item);
    const downloadMode = getMusicChannel(item.provider)?.download;
    const browserDownload = downloadMode === 'browser' || downloadMode === 'source-page';
    // Reserve the tab during the click gesture, before URL resolution awaits
    // the server; opening it afterward can trigger popup blocking.
    const browserWindow = browserDownload ? window.open('about:blank', '_blank') : undefined;
    if (browserWindow) {
      browserWindow.opener = null;
      browserWindow.document.title = '正在准备下载';
      browserWindow.document.body.textContent = '正在获取下载链接，请稍候…';
    }

    setDownloadTasks(prev => [newTask, ...prev]);
    if (!browserDownload) setIsDrawerOpen(true);

    await executeDownload(newTask, browserWindow, browserDownload);
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

  const toggleAll = () => setSelectedIds(previous => {
    const next = new Set(previous), all = visibleResults.every(item => next.has(item.id));
    for (const item of visibleResults) { if (all) next.delete(item.id); else next.add(item.id); }
    return next;
  });

  const openQualityModal = (items: MusicItem[], mode: "single" | "batch") => {
    const qualityItems = getQualityItems(items);
    if (qualityItems.length === 0) return false;
    const options = collectQualityOptions(qualityItems);
    if (options.length === 0) return false;
    const optionKind = "quality" as const;
    setSelectedQualityValue(buildQualityValue(getProviderExtra(qualityItems[0])) || options[0].value);
    setQualityModal({
      mode,
      items,
      qualityItemCount: qualityItems.length,
      optionKind,
    });
    return true;
  };

  const startBatchDownload = async (items: MusicItem[]) => {
    if (items.some(item => !supportsBatchDownload(item.provider))) {
      void message.info('所选渠道需逐首交给浏览器下载，不支持网页自动批量下载；可使用客户端');
      return;
    }
    if (items.length > 5) {
      if (!confirm(`即将下载 ${items.length} 首歌曲，可能需要一些时间，是否继续？`)) return;
    }

    const newTasks: DownloadTask[] = items.map((item) => ({
      ...createTask(item),
      id: `${item.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }));

    setDownloadTasks(prev => [...newTasks, ...prev]);
    setIsDrawerOpen(true);
    setDownloadingCount(items.length);

    const CONCURRENCY_LIMIT = 3;
    const queue = [...newTasks];
    const activePromises: Promise<void>[] = [];

    const processQueue = async () => {
      while (queue.length > 0) {
        if (activePromises.length >= CONCURRENCY_LIMIT) {
          await Promise.race(activePromises);
        }
        
        const task = queue.shift();
        if (task) {
          const promise = executeDownload(task).then(() => {
            setDownloadingCount(prev => Math.max(0, prev - 1));
            // Remove self from active promises
            const index = activePromises.indexOf(promise);
            if (index > -1) activePromises.splice(index, 1);
          });
          activePromises.push(promise);
        }
      }
      // Wait for remaining
      await Promise.all(activePromises);
    };

    await processQueue();
    setDownloadingCount(0);
  };

  const requestDownloadOne = async (item: MusicItem) => {
    const downloadMode = getMusicChannel(item.provider)?.download;
    if (downloadMode !== 'browser' && downloadMode !== 'source-page' && openQualityModal([item], "single")) return;
    await startSingleDownload(item);
  };

  const handleBatchDownload = async () => {
    if (!batchSupported) {
      void message.info('当前渠道不支持网页自动批量下载，请逐首下载或使用客户端');
      return;
    }
    const items = results.filter(r => selectedIds.has(r.id));
    if (items.length === 0) return;
    if (openQualityModal(items, "batch")) return;
    await startBatchDownload(items);
  };

  const confirmQualityDownload = async () => {
    if (!qualityModal) return;
    const items = qualityModal.items.map((item) => applyQualityChoice(item, selectedQualityValue));
    const mode = qualityModal.mode;
    setQualityModal(null);
    if (mode === "single") {
      await startSingleDownload(items[0]);
      return;
    }
    await startBatchDownload(items);
  };


  return <main className="min-h-screen bg-[#fcf9f8] px-4 py-10 pb-28 text-[#1b1b1c] dark:bg-[#111315] dark:text-[#f3f0ef]">
    <div className="mx-auto max-w-[1160px]">
      <header className="mx-auto mb-8 flex max-w-3xl flex-col items-center gap-5">
        <Music size={48} className="text-[#005faa] dark:text-[#a3c9ff]" />
        <h1 className="text-3xl font-bold">COCO音乐下载站</h1>
        <p className="text-center text-sm text-slate-500">选择渠道搜索歌曲，支持单曲和批量下载。渠道可用性以实际返回为准。</p>
        <SearchField value={query} onChange={setQuery} onSubmit={handleSearch} placeholder="输入歌曲名、歌手或专辑" label="搜索歌曲" busy={loading} prefix={<ChannelSelect value={provider} onChange={changeChannel} disabled={loading || loadingMore} />} />
        {activeChannel && <p className="text-sm text-slate-500">{activePlatform?.name} / {activeChannel.name} · {activeChannel.description}</p>}
        {activeChannel?.download === 'browser' && <BrowserDownloadNotice />}
      </header>
      {loading ? <div className="flex justify-center gap-3 py-16"><Loader2 className="animate-spin" />正在搜索歌曲…</div> : results.length > 0 ? <>
        <h2 className="mb-5 text-2xl font-semibold">搜索结果 · {results.length} 首</h2>
        <SongListToolbar query={resultFilter} onQueryChange={setResultFilter}>
          <SongActionButton primary disabled={!visibleResults.some(item => getMusicChannel(item.provider)?.preview !== false)} onClick={() => { const first = visibleResults.find(item => getMusicChannel(item.provider)?.preview !== false); if (first) void handlePlay(first, visibleResults); }}><Play size={16} />播放列表</SongActionButton>
          <SongActionButton primary disabled={!selectedIds.size || downloadingCount > 0 || !batchSupported} onClick={() => void handleBatchDownload()}><Download size={16} />下载所选 {selectedIds.size || ""}</SongActionButton>
          <SongActionButton onClick={toggleAll}><ListChecks size={16} />选择当前列表</SongActionButton>
        </SongListToolbar>
        <SongList activeMusic={activeMusic} playing={playing} resolvingId={resolvingMusicId} onPlay={item => void handlePlay(item, visibleResults)} items={visibleResults} selectedIds={selectedIds} onToggle={toggleSelection} onToggleAll={toggleAll} renderActions={item => <SongRowActions onPlay={() => void handlePlay(item, visibleResults)} playing={activeMusic?.id === item.id && activeMusic?.provider === item.provider && playing} resolving={resolvingMusicId === item.id} previewDisabled={getMusicChannel(item.provider)?.preview === false} item={item} selected={selectedIds.has(item.id)} onToggleSelection={() => toggleSelection(item.id)} onDownload={() => void requestDownloadOne(item)} downloadLabel={getMusicChannel(item.provider)?.download === 'source-page' ? '前往源站下载' : '下载'} />} />
        {hasMoreResults && <div className="mt-6 text-center"><button className="cursor-pointer rounded-full border px-6 py-2" disabled={loadingMore} onClick={() => void handleLoadMore()}>{loadingMore ? '加载中…' : '加载更多'}</button></div>}
      </> : searched ? <p className="py-16 text-center text-slate-500">未找到相关歌曲，请更换关键词或渠道。</p> : null}
    </div>
    <DownloadDrawer isOpen={isDrawerOpen} onOpen={()=>setIsDrawerOpen(true)} onClose={()=>setIsDrawerOpen(false)} tasks={downloadTasks} onBrowserHandoff={id=>setDownloadTasks(prev=>prev.map(t=>t.id===id?{...t,status:'handed-off'}:t))} onRemoveTask={id=>setDownloadTasks(prev=>prev.filter(t=>t.id!==id))} onClearCompleted={()=>setDownloadTasks(prev=>prev.filter(t=>!isDownloadHistory(t)))} />
    <QualitySelectModal isOpen={Boolean(qualityModal)} title="选择下载音质" description="实际音质以渠道返回文件为准。" options={qualityModal ? collectQualityOptions(getQualityItems(qualityModal.items)) : []} value={selectedQualityValue} onChange={setSelectedQualityValue} onClose={()=>setQualityModal(null)} onConfirm={()=>void confirmQualityDownload()} />
    <SongBatchBar count={selectedIds.size} busy={downloadingCount} supported={batchSupported} onDownload={()=>void handleBatchDownload()} onClear={()=>setSelectedIds(new Set())} />
      {/* Player Bar */}

        {activeMusic && (
          <PlayerBar 
            currentMusic={activeMusic}
            isPlaying={playing}
            isResolving={resolvingMusicId === activeMusic.id}
            onPlayPause={() => { void handlePlay(activeMusic); }}
            onNext={canNext ? handleNext : undefined}
            onPrev={canPrev ? handlePrev : undefined}
            playMode={playMode}
            onTogglePlayMode={togglePlayMode}
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            volume={volume}
            onVolumeChange={setVolume}
            onOpenPlayer={() => setPlayerDrawerOpen(true)}
          />
        )}


      <FullscreenPlayerDrawer
        key={activeMusic ? `${activeMusic.provider}:${activeMusic.id}` : "empty"}
        isOpen={playerDrawerOpen}
        music={activeMusic}
        isPlaying={playing}
        lyrics={lyricLines}
        lyricLoading={lyricLoading}
        currentTime={currentTime}
        duration={duration}
        onClose={() => setPlayerDrawerOpen(false)}
        onPlayPause={() => { if (activeMusic) void handlePlay(activeMusic); }}
        onPrev={canPrev ? handlePrev : undefined}
        onNext={canNext ? handleNext : undefined}
        onSeek={handleSeek}
      />
  </main>;
}
