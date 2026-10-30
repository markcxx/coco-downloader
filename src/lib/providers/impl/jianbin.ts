import axios from 'axios';
import { createJbsouSession } from '@/lib/providers/jbsou-session';
import { validateAudioLink } from '@/lib/providers/audio-link';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const BASE_URL = 'https://www.jbsou.cn/';
const REQUEST_TIMEOUT = 30000;

const SEARCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'origin': 'https://www.jbsou.cn',
  'x-requested-with': 'XMLHttpRequest',
  'referer': 'https://www.jbsou.cn/',
};

type JbsouSearchItem = {
  songid?: string | number;
  name?: string;
  artist?: string;
  album?: string;
  url?: string;
  cover?: string;
};

type JbsouSearchResponse = {
  code?: number;
  data?: JbsouSearchItem[] | string;
  error?: string;
};

function toAbsoluteUrl(value?: string) {
  if (!value) return '';
  try {
    return new URL(value, BASE_URL).toString();
  } catch {
    return value;
  }
}

function extractExt(url: string) {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'mp3';
}

function normalizeSearchResponse(payload: unknown): JbsouSearchResponse {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as JbsouSearchResponse;
    } catch {
      return {};
    }
  }
  return payload as JbsouSearchResponse;
}

function isJbsouUrl(value: string) {
  try {
    return new URL(value).hostname === new URL(BASE_URL).hostname;
  } catch {
    return false;
  }
}

async function resolveFinalUrl(url: string, cookie?: string) {
  const verified = await validateAudioLink(url, {
    headers: {
      'User-Agent': SEARCH_HEADERS['user-agent'],
      ...(cookie && isJbsouUrl(url) ? { Cookie: cookie } : {}),
    },
    timeout: REQUEST_TIMEOUT,
  });
  if (isJbsouUrl(url) && isJbsouUrl(verified.url)) {
    throw new Error('煎饼未返回可用的音频直链');
  }
  return verified.url;
}

function normalizeIdToUrl(id: string) {
  const value = (id || '').trim();
  if (!value) return '';
  const decodedOnce = value.includes('%') ? safeDecode(value) : value;
  const decoded = decodedOnce.includes('%') ? safeDecode(decodedOnce) : decodedOnce;
  if (decoded.startsWith('http')) return decoded;
  return toAbsoluteUrl(decoded);
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export class JianbinProvider implements MusicProvider {
  name: string;
  private source: string;

  constructor(name: string, source: string) {
    this.name = name;
    this.source = source;
  }

  private async bootstrapSession() {
    return createJbsouSession();
  }

  private async requestSearch(query: string, cookie: string, filter = 'name') {
    const params = new URLSearchParams({
      input: query,
      filter,
      type: this.source,
      page: '1',
    });
    const { data } = await axios.post<JbsouSearchResponse>(BASE_URL, params, {
      headers: { ...SEARCH_HEADERS, cookie },
      timeout: REQUEST_TIMEOUT,
    });
    return normalizeSearchResponse(data);
  }

  async search(query: string): Promise<MusicItem[]> {
    try {
      let payload: JbsouSearchResponse = {};
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const cookie = await this.bootstrapSession();
        payload = await this.requestSearch(query, cookie);
        if (payload.code === 200 || Array.isArray(payload.data)) {
          break;
        }
      }
      if (!Array.isArray(payload.data)) throw new Error(payload.error || "煎饼搜索响应异常，请稍后重试");
      const list = payload.data;
      return list
        .map((item) => {
          const downloadUrl = toAbsoluteUrl(item?.url);
          const signedCoverUrl = toAbsoluteUrl(item?.cover);
          const coverUrl = signedCoverUrl
            ? `/api/jbsou/asset?url=${encodeURIComponent(signedCoverUrl)}`
            : '';
          return {
            id: downloadUrl ? encodeURIComponent(downloadUrl) : '',
            title: item?.name || '未知歌曲',
            artist: item?.artist || '未知歌手',
            album: item?.album || undefined,
            cover: coverUrl || undefined,
            provider: this.name,
          };
        })
        .filter((item) => item.id);
    } catch (error) {
      console.error('Jianbin search error:', error);
      throw error;
    }
  }

  async getPlayInfo(id: string): Promise<PlayInfo> {
    try {
      const url = normalizeIdToUrl(id);
      if (!url) throw new Error('Invalid id');
      if (!isJbsouUrl(url)) {
        const finalUrl = await resolveFinalUrl(url);
        return {
          url: finalUrl,
          type: extractExt(finalUrl),
        };
      }

      let finalUrl = '';
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const cookie = await this.bootstrapSession();
          finalUrl = await resolveFinalUrl(url, cookie);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!finalUrl) throw lastError || new Error('Failed to resolve JBSou play url');
      if (!finalUrl.startsWith('http')) throw new Error('Invalid play url');
      return {
        url: finalUrl,
        type: extractExt(finalUrl),
      };
    } catch (error) {
      console.error('Jianbin getPlayInfo error:', error);
      throw error;
    }
  }
}
