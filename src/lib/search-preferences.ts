import type { MusicItem } from '@/types/music';

export function readPreference(key: string): unknown {
  try {
    if (typeof window === 'undefined') return undefined;
    const saved = window.localStorage.getItem(key);
    return saved === null ? undefined : JSON.parse(saved);
  } catch {
    return undefined;
  }
}

export function savePreference(key: string, value: unknown) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage is optional; keep the current session usable.
  }
}

export function readSearchHistory(): string[] {
  const saved = readPreference('coco-search-history');
  return Array.isArray(saved)
    ? [...new Set(saved.filter((term): term is string => typeof term === 'string').map(term => term.trim()).filter(Boolean))].slice(0, 100)
    : [];
}

export function readSearchProvider(validIds: string[], fallback: string): string {
  try {
    if (typeof window === 'undefined') return fallback;
    // Preserve compatibility with the original PR's unquoted string value.
    const saved = window.localStorage.getItem('coco-search-provider');
    return saved && validIds.includes(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function saveSearchProvider(provider: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem('coco-search-provider', provider);
  } catch {
    // Continue with the selected channel when storage is unavailable.
  }
}

export function samePlaylistSong(a: MusicItem, b: MusicItem) {
  return a.id === b.id && a.provider === b.provider;
}

function isMusicItem(value: unknown): value is MusicItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MusicItem>;
  return typeof item.id === 'string' && typeof item.provider === 'string'
    && typeof item.title === 'string' && typeof item.artist === 'string'
    && (item.cover === undefined || typeof item.cover === 'string');
}

export function readPlaylist(): MusicItem[] {
  const saved = readPreference('coco-playlist');
  if (!Array.isArray(saved)) return [];
  return saved.filter(isMusicItem).filter((item, index, items) =>
    items.findIndex(other => samePlaylistSong(item, other)) === index);
}
