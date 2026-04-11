import axios from 'axios';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const SEARCH_HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'origin': 'https://y.qq.com',
  'referer': 'https://y.qq.com/',
  'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
};

type VKeysSearchItem = {
  mid?: string;
  song?: string;
  subtitle?: string;
  album?: string;
  singer?: string;
  cover?: string;
};

type VKeysSearchResponse = {
  code?: number;
  data?: VKeysSearchItem[];
};

type VKeysGetUrlResponse = {
  code?: number;
  data?: {
    url?: string;
    quality?: string;
    kbps?: string;
    cover?: string;
  };
};

const QUALITY_PRIORITY = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function extractExt(url: string) {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'mp3';
}

export class QQProvider implements MusicProvider {
  name = 'qq';

  async search(query: string): Promise<MusicItem[]> {
    try {
      const { data } = await axios.get<VKeysSearchResponse>('https://api.vkeys.cn/v2/music/tencent/search/song', {
        headers: SEARCH_HEADERS,
        params: { word: query },
        timeout: 15000,
      });
      const list = data?.data || [];
      return list
        .map((item) => ({
          id: item?.mid || '',
          title: item?.song || '未知歌曲',
          artist: item?.singer || '未知歌手',
          album: item?.album || undefined,
          cover: item?.cover || undefined,
          provider: this.name,
        }))
        .filter((item) => item.id);
    } catch (error) {
      console.error('QQ search error:', error);
      return [];
    }
  }

  async getPlayInfo(id: string, quality?: 'standard' | 'high' | 'lossless'): Promise<PlayInfo> {
    try {
      for (const q of QUALITY_PRIORITY) {
        const { data } = await axios.get<VKeysGetUrlResponse>('https://api.vkeys.cn/v2/music/tencent/geturl', {
          headers: SEARCH_HEADERS,
          params: { mid: id, quality: q },
          timeout: 15000,
        });
        if (data?.code !== 200) {
          continue;
        }
        const url = data?.data?.url;
        if (typeof url === 'string' && url.startsWith('http')) {
          return {
            url,
            type: extractExt(url),
            bitrate: data?.data?.kbps || data?.data?.quality,
            cover: data?.data?.cover || undefined,
          };
        }
      }
      throw new Error('Failed to get play url');
    } catch (error) {
      console.error('QQ getPlayInfo error:', error);
      throw error;
    }
  }
}
