import axios from 'axios';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';
import { validateAudioLink } from '@/lib/providers/audio-link';

const SEARCH_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const SEARCH_REQUEST_KEY = 'music.search.SearchCgiService.DoSearchForQQMusicMobile';

const SEARCH_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/131.0.0.0',
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

type QQOfficialSearchSong = {
  id?: string | number;
  mid?: string;
  name?: string;
  singer?: Array<{ name?: string }>;
  album?: { name?: string; title?: string; mid?: string };
  interval?: number;
};

type QQOfficialSearchResponse = {
  code?: number;
  message?: string;
  'music.search.SearchCgiService.DoSearchForQQMusicMobile'?: {
    code?: number;
    data?: {
      body?: {
        item_song?: QQOfficialSearchSong[];
        song?: {
          list?: QQOfficialSearchSong[];
        };
      };
    };
  };
};

type QQExtra = {
  usage?: string;
  selectedParser?: string;
  selectedFormat?: string;
  cover?: string;
};

export type QQLyricData = {
  songid: string;
  provider: 'qq';
  lines: Array<{ time: number; text: string }>;
  lrc: string;
};

const QUALITY_PRIORITY = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
function extractExt(url: string) {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'mp3';
}

function normalizeLimit(value?: number) {
  return Math.min(Math.max(Math.floor(Number(value) || 20), 1), 30);
}

function normalizeOffset(value?: number) {
  return Math.max(Math.floor(Number(value) || 0), 0);
}

function formatDuration(seconds?: number) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return undefined;
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function decodeBase64(value: string) {
  return Buffer.from(value, 'base64').toString('utf8');
}

function parseLyricLines(lyric: string) {
  const lines: Array<{ time: number; text: string }> = [];
  const timePattern = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lyric.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(timePattern)];
    if (matches.length === 0) continue;

    const text = rawLine.replace(timePattern, '').trim();
    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(match[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0;
      lines.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }

  return lines
    .filter((line) => line.text)
    .sort((a, b) => a.time - b.time);
}

export class QQProvider implements MusicProvider {
  name = 'qq';

  async search(query: string, limit = 20, offset = 0): Promise<MusicItem[]> {
    try {
      const normalizedLimit = normalizeLimit(limit);
      const pageNum = Math.floor(normalizeOffset(offset) / normalizedLimit) + 1;
      const { data } = await axios.post<QQOfficialSearchResponse>(SEARCH_URL, {
        comm: {
          ct: '19',
          cv: '1859',
          uin: '0',
        },
        [SEARCH_REQUEST_KEY]: {
          method: 'DoSearchForQQMusicMobile',
          module: 'music.search.SearchCgiService',
          param: {
            grp: 1,
            num_per_page: normalizedLimit,
            page_num: pageNum,
            query: query.trim(),
            search_type: 0,
          },
        },
      }, {
        headers: SEARCH_HEADERS,
        timeout: 15000,
      });
      if (data?.code !== 0) {
        throw new Error(data?.message || 'QQ official search failed');
      }
      const searchResult = data?.[SEARCH_REQUEST_KEY];
      if (searchResult?.code !== 0) {
        throw new Error('QQ mobile search request failed');
      }
      const body = searchResult?.data?.body;
      const list = body?.item_song || body?.song?.list || [];
      return list
        .map((item) => {
          const albumMid = item.album?.mid || '';
          const cover = albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : undefined;
          return {
            id: item.mid || '',
            title: item.name || '未知歌曲',
            artist: (item.singer || []).map((singer) => singer.name).filter(Boolean).join(', ') || '未知歌手',
            album: item.album?.name || item.album?.title || undefined,
            cover,
            duration: formatDuration(item.interval),
            provider: this.name,
            extra: {
              cover,
              selectedParser: 'vkeys',
              selectedFormat: 'flac',
            },
          };
        })
        .filter((item) => item.id);
    } catch (error) {
      console.error('QQ search error:', error);
      throw error;
    }
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    const payload = extra as QQExtra | undefined;
    if (payload?.selectedParser && payload.selectedParser !== 'vkeys') {
      throw new Error('该 QQ 音乐解析线路已下架，请重新搜索并选择可用渠道');
    }
    return this.getByVkeys(id, payload?.usage === 'playback' ? [8, 6] : QUALITY_PRIORITY);
  }

  async getLyric(id: string): Promise<QQLyricData> {
    const { data } = await axios.get('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
      headers: {
        'Referer': 'https://y.qq.com/portal/player.html',
        'User-Agent': SEARCH_HEADERS['User-Agent'],
      },
      params: {
        songmid: id,
        g_tk: '5381',
        loginUin: '0',
        hostUin: '0',
        format: 'json',
        inCharset: 'utf8',
        outCharset: 'utf-8',
        platform: 'yqq',
      },
      timeout: 15000,
    });
    const encoded = typeof data?.lyric === 'string' ? data.lyric : '';
    const lrc = encoded ? decodeBase64(encoded) : '';
    return {
      songid: id,
      provider: 'qq',
      lines: parseLyricLines(lrc),
      lrc,
    };
  }

  private async getByVkeys(id: string, qualities = QUALITY_PRIORITY): Promise<PlayInfo> {
    for (const quality of qualities) {
      const { data } = await axios.get<VKeysGetUrlResponse>('https://api.vkeys.cn/music/tencent/song/link', {
        headers: SEARCH_HEADERS,
        params: { mid: id, quality },
        timeout: 15000,
      });
      if (data?.code !== 0 && data?.code !== 200) {
        continue;
      }
      const url = data?.data?.url;
      if (typeof url === 'string' && url.startsWith('http')) {
        try {
          const verified = await validateAudioLink(url, { headers: SEARCH_HEADERS });
          return {
            url: verified.url,
            type: extractExt(verified.url),
            bitrate: data?.data?.kbps || data?.data?.quality,
            cover: data?.data?.cover || undefined,
          };
        } catch {
          continue;
        }
      }
    }
    throw new Error('Failed to get play url');
  }

}
