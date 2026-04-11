import axios from 'axios';
import https from 'https';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const SEARCH_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  origin: 'https://buguyy.top',
  priority: 'u=1, i',
  referer: 'https://buguyy.top/',
  'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
};

const REQUEST_TIMEOUT = 20000;
const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

type BuguSearchItem = {
  id?: string | number;
  title?: string;
  singer?: string;
  album?: string;
  picurl?: string;
  duration?: string | number;
};

type BuguSearchResponse = {
  data?: {
    list?: BuguSearchItem[];
  };
};

type BuguDetailResponse = {
  data?: {
    url?: string;
    lrc?: string;
    duration?: string | number;
    album?: string;
  };
};

function normalizeDuration(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const parts = String(value).match(/\d+/g) || [];
  if (!parts.length) return undefined;
  const numbers = parts.map((part) => Number(part)).filter((n) => Number.isFinite(n));
  if (!numbers.length) return undefined;
  const lastThree = numbers.slice(-3);
  while (lastThree.length < 3) {
    lastThree.unshift(0);
  }
  const [hours, minutes, seconds] = lastThree;
  if (hours === 0 && minutes === 0 && seconds === 0) return undefined;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function extractExt(url: string) {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'mp3';
}

export class BuguProvider implements MusicProvider {
  name = 'bugu';

  async search(query: string): Promise<MusicItem[]> {
    try {
      const { data } = await axios.get<BuguSearchResponse>('https://a.buguyy.top/newapi/search.php', {
        headers: SEARCH_HEADERS,
        params: { keyword: query },
        timeout: REQUEST_TIMEOUT,
        httpsAgent: HTTPS_AGENT,
      });
      const list = data?.data?.list || [];
      return list
        .map((item) => ({
          id: String(item?.id ?? ''),
          title: item?.title || '未知歌曲',
          artist: item?.singer || '未知歌手',
          album: item?.album || undefined,
          cover: item?.picurl || undefined,
          duration: normalizeDuration(item?.duration),
          provider: this.name,
          extra: {
            cover: item?.picurl || undefined,
          },
        }))
        .filter((item) => item.id);
    } catch (error) {
      console.error('Bugu search error:', error);
      return [];
    }
  }

  async getPlayInfo(id: string, quality?: 'standard' | 'high' | 'lossless', extra?: unknown): Promise<PlayInfo> {
    try {
      const { data } = await axios.get<BuguDetailResponse>('https://a.buguyy.top/newapi/geturl2.php', {
        headers: SEARCH_HEADERS,
        params: { id },
        timeout: REQUEST_TIMEOUT,
        httpsAgent: HTTPS_AGENT,
      });
      const url = data?.data?.url;
      if (typeof url !== 'string' || !url.startsWith('http')) {
        throw new Error('Failed to get play url');
      }
      const coverCandidate = (extra as { cover?: unknown } | undefined)?.cover;
      return {
        url,
        type: extractExt(url),
        cover: typeof coverCandidate === 'string' ? coverCandidate : undefined,
      };
    } catch (error) {
      console.error('Bugu getPlayInfo error:', error);
      throw error;
    }
  }
}
