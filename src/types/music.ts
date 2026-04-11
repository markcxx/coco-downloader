export interface MusicItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  duration?: string;
  provider: string; // 标识来源渠道，如 'gequbao'
  extra?: unknown; // 渠道特有的原始数据
}

export interface PlayInfo {
  url: string;
  type: 'mp3' | 'm4a' | 'flac' | string;
  bitrate?: string;
  cover?: string;
}

export interface MusicProvider {
  name: string;
  search(query: string): Promise<MusicItem[]>;
  getPlayInfo(id: string, quality?: 'standard' | 'high' | 'lossless'): Promise<PlayInfo>;
}
