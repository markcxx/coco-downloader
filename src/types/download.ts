import { MusicItem } from "./music";

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'error' | 'browser-ready' | 'handed-off';

export interface DownloadTask {
  id: string; // unique task id (e.g. musicId + timestamp)
  musicItem: MusicItem;
  status: DownloadStatus;
  receivedBytes?: number;
  totalBytes?: number;
  progress: number; // 0 to 100
  fileName: string;
  error?: string;
  sourceUrl?: string;
  delivery?: 'audio' | 'source-page';
  notice?: string;
  startTime: number;
}
