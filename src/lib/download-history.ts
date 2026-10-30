import type { DownloadTask } from '@/types/download';

const STORAGE_KEY = 'coco-download-tasks';

export function isActiveDownload(task: DownloadTask) {
  return task.status === 'pending' || task.status === 'downloading' || task.status === 'browser-ready';
}

export function isDownloadHistory(task: DownloadTask) {
  return task.status === 'completed' || task.status === 'error' || task.status === 'handed-off';
}

function isSavedTask(value: unknown): value is DownloadTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<DownloadTask>;
  const item = task.musicItem;
  return typeof task.id === 'string' && typeof task.fileName === 'string'
    && typeof task.startTime === 'number' && Number.isFinite(task.startTime)
    && typeof task.progress === 'number' && Number.isFinite(task.progress)
    && !!item && typeof item === 'object'
    && typeof item.id === 'string' && typeof item.title === 'string'
    && typeof item.artist === 'string' && typeof item.provider === 'string'
    && (item.cover === undefined || typeof item.cover === 'string')
    && (task.error === undefined || typeof task.error === 'string')
    && (task.notice === undefined || typeof task.notice === 'string')
    && (task.sourceUrl === undefined || typeof task.sourceUrl === 'string')
    && (task.status === 'completed' || task.status === 'error'
      || task.status === 'browser-ready' || task.status === 'handed-off');
}

export function readDownloadTasks(): DownloadTask[] {
  try {
    if (typeof window === 'undefined') return [];
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(isSavedTask) : [];
  } catch {
    return [];
  }
}

export function saveDownloadTasks(tasks: DownloadTask[]): void {
  try {
    if (typeof window === 'undefined') return;
    // Active transfers cannot resume after a refresh; browser links can still be used.
    const saved = tasks.filter(task => isDownloadHistory(task) || task.status === 'browser-ready');
    if (saved.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is optional: denied access or exhausted quota must not interrupt downloads.
  }
}
