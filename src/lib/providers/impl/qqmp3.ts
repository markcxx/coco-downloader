import axios from 'axios';
import { validateAudioLink } from '@/lib/providers/audio-link';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const HEADERS = {
  'accept': '*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'origin': 'https://www.qqmp3.vip',
  'priority': 'u=1, i',
  'referer': 'https://www.qqmp3.vip/',
  'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
};

const API_BASE_URLS = [
  'https://www.qqmp3.vip',
  'https://bb.qqmp3.vip',
  'https://api.qqmp3.vip',
];

function extractExt(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const extension = pathname.split('.').pop()?.toLowerCase();
    return extension && extension !== pathname ? extension : 'mp3';
  } catch {
    return 'mp3';
  }
}

interface SearchResponseItem {
  artist: string;
  downurl: string[];
  name: string;
  pic: string;
  rid: string;
}

interface DetailResponse {
  code: number;
  data: {
    lrc: string;
    url: string;
    processing_time: string;
  };
  msg: string;
}

export class QQMp3Provider implements MusicProvider {
  name: string;

  constructor(name = 'qqmp3') {
    this.name = name;
  }

  async search(query: string, limit = 20, offset = 0): Promise<MusicItem[]> {
    let lastError: unknown;
    for (const baseUrl of API_BASE_URLS) {
      try {
        const { data } = await axios.get(`${baseUrl}/api/songs.php`, {
          headers: HEADERS,
          params: { type: 'search', keyword: query },
          timeout: 15000,
        });
        const list = data?.data;
        if (data?.code !== 200 || !Array.isArray(list)) {
          throw new Error(String(data?.message || data?.msg || 'Invalid search response'));
        }
        return list.slice(offset, offset + limit).map((item: SearchResponseItem) => ({
          id: item.rid,
          title: item.name,
          artist: item.artist,
          cover: item.pic,
          provider: this.name,
          extra: { lrc: null },
        }));
      } catch (error) {
        lastError = error;
      }
    }
    console.error('QQMp3 search error:', lastError);
    throw lastError || new Error('QQMP3 搜索服务暂不可用');
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    void extra;
    let lastError: unknown;
    for (const baseUrl of API_BASE_URLS) {
      try {
        const { data } = await axios.get<DetailResponse>(`${baseUrl}/api/kw.php`, {
          headers: HEADERS,
          params: { rid: id, type: 'json', level: 'exhigh', lrc: 'true' },
          timeout: 15000,
        });
        if (data.code === 200 && data.data?.url) {
          const verified = await validateAudioLink(data.data.url);
          return {
            url: verified.url,
            type: extractExt(data.data.url),
            cover: (data.data as { pic?: string }).pic,
          };
        }
        throw new Error(data.msg || 'Failed to get play info');
      } catch (error) {
        lastError = error;
      }
    }
    console.error('QQMp3 getPlayInfo error:', lastError);
    throw lastError instanceof Error ? lastError : new Error('Failed to get play info');
  }
}
