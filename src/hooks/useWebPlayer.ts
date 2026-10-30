"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import type { MusicItem } from '@/types/music';
import { getMusicChannel } from '@/lib/music-channels';
import { adjacentIndex, queueOrder, type PlayMode } from '@/lib/player-queue';

type LyricLine = { time: number; text: string };
const sameSong = (a: MusicItem | null, b: MusicItem) => a?.id === b.id && a.provider === b.provider;

export function useWebPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const lyricRequest = useRef<AbortController | null>(null);
  const request = useRef(0);
  const session = useRef<{ item: MusicItem | null; queue: MusicItem[]; index: number; order: number[]; mode: PlayMode; resolving: boolean }>({ item: null, queue: [], index: -1, order: [], mode: 'order', resolving: false });
  const [activeMusic, setActiveMusic] = useState<MusicItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [resolvingMusicId, setResolvingMusicId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playMode, setPlayMode] = useState<PlayMode>('order');
  const [navigation, setNavigation] = useState({ canPrev: false, canNext: false });
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [lyricLoading, setLyricLoading] = useState(false);
  const [playerDrawerOpen, setPlayerDrawerOpen] = useState(false);

  const syncNavigation = useCallback(() => {
    const state = session.current;
    setNavigation({ canPrev: adjacentIndex(state.order, state.index, -1) >= 0, canNext: adjacentIndex(state.order, state.index, 1) >= 0 });
  }, []);

  const loadLyrics = useCallback((item: MusicItem) => {
    lyricRequest.current?.abort();
    const controller = new AbortController();
    lyricRequest.current = controller;
    setLyricLines([]);
    setLyricLoading(true);
    const params = new URLSearchParams({ id: item.id, provider: item.provider, extra: JSON.stringify(item.extra || {}) });
    void fetch(`/api/lyric?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]) })
      .then(async response => { if (!response.ok) throw new Error('歌词获取失败'); return response.json(); })
      .then(data => {
        if (!controller.signal.aborted) setLyricLines(Array.isArray(data.lines) ? data.lines.filter((line: LyricLine) => Number.isFinite(line.time) && typeof line.text === 'string' && line.text.trim()) : []);
      })
      .catch(() => { /* Lyrics are optional and do not interrupt audio. */ })
      .finally(() => { if (!controller.signal.aborted) setLyricLoading(false); });
  }, []);

  const handlePlay = useCallback(async (item: MusicItem, queue?: MusicItem[], restart = false) => {
    if (getMusicChannel(item.provider)?.preview === false) { void message.info('此渠道仅提供下载入口，不支持播放'); return; }
    const audio = audioRef.current;
    if (!audio) return;
    const state = session.current;
    if (!restart && sameSong(state.item, item) && audio.src && !state.resolving) {
      if (!audio.paused) { audio.pause(); return; }
      try { await audio.play(); } catch { void message.error('播放失败，请重试'); }
      return;
    }
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const token = ++request.current;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    const candidates = queue?.filter(song => getMusicChannel(song.provider)?.preview !== false);
    if (candidates?.length) {
      state.queue = candidates;
      state.index = candidates.findIndex(song => sameSong(song, item));
      state.order = queueOrder(candidates.length, state.index, state.mode);
    } else if (!state.queue.some(song => sameSong(song, item))) {
      state.queue = [item]; state.index = 0; state.order = [0];
    } else state.index = state.queue.findIndex(song => sameSong(song, item));
    state.item = item;
    state.resolving = true;
    setActiveMusic(item);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setResolvingMusicId(item.id);
    syncNavigation();
    loadLyrics(item);
    try {
      const params = new URLSearchParams({ id: item.id, provider: item.provider, extra: JSON.stringify({ ...(item.extra as Record<string, unknown> || {}), usage: 'playback' }) });
      const response = await fetch(`/api/url?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]) });
      const info = await response.json();
      if (controller.signal.aborted || token !== request.current) return;
      if (!response.ok) throw new Error(info.error || '无法获取播放地址');
      if (!/^https?:\/\//i.test(info.url) || info.delivery === 'source-page') throw new Error('此渠道未返回可播放的音频');
      audio.src = info.url;
      audio.load();
      await audio.play();
    } catch (error) {
      if (controller.signal.aborted || token !== request.current) return;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      setPlaying(false);
      void message.error({ key: 'playback', content: error instanceof Error ? error.message : '播放失败，请重试或切换渠道' });
    } finally {
      if (!controller.signal.aborted && token === request.current) { state.resolving = false; setResolvingMusicId(null); }
    }
  }, [syncNavigation, loadLyrics]);

  const navigate = useCallback((direction: 1 | -1) => {
    const state = session.current;
    const next = adjacentIndex(state.order, state.index, direction);
    if (next >= 0) void handlePlay(state.queue[next], undefined, true);
  }, [handlePlay]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const time = () => setCurrentTime(audio.currentTime);
    const metadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    const ended = () => {
      setPlaying(false);
      if (session.current.mode === 'single') {
        audio.currentTime = 0;
        void audio.play().catch(() => setPlaying(false));
      } else navigate(1);
    };
    const error = () => {
      if (!session.current.resolving) { setPlaying(false); void message.error({ key: 'playback', content: '音频无法加载或格式不受支持，请重试或切换渠道' }); }
    };
    audio.addEventListener('timeupdate', time);
    audio.addEventListener('loadedmetadata', metadata);
    audio.addEventListener('durationchange', metadata);
    audio.addEventListener('play', play);
    audio.addEventListener('pause', pause);
    audio.addEventListener('ended', ended);
    audio.addEventListener('error', error);
    return () => {
      pending.current?.abort(); lyricRequest.current?.abort();
      audio.removeEventListener('timeupdate', time); audio.removeEventListener('loadedmetadata', metadata);
      audio.removeEventListener('durationchange', metadata); audio.removeEventListener('play', play);
      audio.removeEventListener('pause', pause); audio.removeEventListener('ended', ended); audio.removeEventListener('error', error);
      audio.pause(); audio.removeAttribute('src'); audio.load(); audioRef.current = null;
    };
  }, [navigate]);

  const handleSeek = (time: number) => {
    if (audioRef.current && Number.isFinite(time)) { audioRef.current.currentTime = Math.max(0, time); setCurrentTime(Math.max(0, time)); }
  };
  const changeVolume = (value: number) => {
    const safe = Math.min(1, Math.max(0, value));
    if (audioRef.current) audioRef.current.volume = safe;
    setVolume(safe);
  };
  const togglePlayMode = () => {
    const state = session.current;
    state.mode = state.mode === 'order' ? 'shuffle' : state.mode === 'shuffle' ? 'single' : 'order';
    state.order = queueOrder(state.queue.length, state.index, state.mode);
    setPlayMode(state.mode); syncNavigation();
  };
  return { activeMusic, playing, resolvingMusicId, currentTime, duration, volume, playMode, lyricLines, lyricLoading,
    playerDrawerOpen, setPlayerDrawerOpen, handlePlay, handleSeek, setVolume: changeVolume, togglePlayMode,
    canPrev: navigation.canPrev, canNext: navigation.canNext, handlePrev: () => navigate(-1), handleNext: () => navigate(1) };
}
