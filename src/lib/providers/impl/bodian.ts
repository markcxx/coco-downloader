import axios from 'axios';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const SEARCH_API_URL = 'https://bd-api.kuwo.cn/api/search/music/list';
const TIANBAO_API_URL = 'https://mobi.kuwo.cn/mobi.s';
const REQUEST_TIMEOUT = 20000;

const SEARCH_HEADERS = {
  'user-agent': 'Dart/3.3 (dart:io)',
  'plat': 'win',
  'accept-encoding': 'gzip',
  'api-ver': 'application/json',
  'channel': 'W1',
  'brand': 'Windows 11 Pro for Workstations',
  'net': 'wifi',
  'content-type': 'application/json',
  'ver': '1.1.5',
  'svrver': '13',
  'devid': 'coco-bodian',
  'qimei36': 'coco-bodian',
};

type BodianSearchItem = {
  id?: string | number;
  name?: string;
  artist?: string;
  album?: string;
  albumPic?: string;
  freeSign?: string;
  fsig?: string;
};

export type BodianLyricData = {
  songid: string;
  provider: 'bodian';
  lines: Array<{ time: number; text: string }>;
  lrc: string;
};

function extractExt(url: string, fallback = 'mp3') {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : fallback;
}

function cleanLyric(value: string) {
  return value
    .replace(/<-?\d+,-?\d+>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function normalizeCover(value?: string) {
  return value || undefined;
}

export class BodianProvider implements MusicProvider {
  name = 'bodian';

  async search(query: string): Promise<MusicItem[]> {
    try {
      const { data } = await axios.get(SEARCH_API_URL, {
        headers: SEARCH_HEADERS,
        params: {
          pn: '0',
          rn: '10',
          keyword: query.trim(),
          correct: '1',
          uid: '-1',
          token: '',
        },
        timeout: REQUEST_TIMEOUT,
      });

      const list = (((data || {}).data || {}).resultList || []) as BodianSearchItem[];
      return list
        .map((item) => ({
          id: String(item.id || ''),
          title: String(item.name || '').trim(),
          artist: item.artist || '未知歌手',
          album: item.album || undefined,
          cover: normalizeCover(item.albumPic),
          provider: this.name,
          extra: {
            albumPic: item.albumPic || undefined,
            freeSign: item.freeSign || item.fsig || undefined,
          },
        }))
        .filter((item) => item.id && item.title);
    } catch (error) {
      console.error('Bodian search error:', error);
      throw error;
    }
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    const info = await this.getByTianbao(id);
    return { url: info.url, type: extractExt(info.url, 'flac'), cover: this.extractCover(extra), bitrate: info.bitrate };
  }

  async getLyric(id: string): Promise<BodianLyricData> {
    const content = await this.getLyricByOfficialApi(id);
    const lrc = cleanLyric(content);
    return { songid: id, provider: 'bodian', lines: parseLyricLines(lrc), lrc };
  }

  private extractCover(extra: unknown) {
    const payload = extra as { albumPic?: string } | undefined;
    return payload?.albumPic || undefined;
  }

  private async getLyricByOfficialApi(id: string) {
    const query = `type=lyric&req=2&lrcx=1&rid=${id}&songname=&artist=&corp=kuwo&fromchannel=bodian`;
    const q = Buffer.from(query, 'utf8').toString('base64');
    const { data } = await axios.get('http://mlyric.kuwo.cn/mobi.s', {
      params: {
        f: 'bodian',
        q,
        uid: '-1',
        token: '',
      },
      timeout: REQUEST_TIMEOUT,
    });
    const content = data?.data?.content;
    if (typeof content !== 'string' || !content) {
      throw new Error('Invalid bodian lyric');
    }
    return Buffer.from(content, 'base64').toString('utf8');
  }

  private async getByTianbao(id: string) {
    const { data } = await axios.get(TIANBAO_API_URL, {
      headers: {
        'User-Agent': 'Dart/2.19 (dart:io)',
        'plat': 'ar',
        'channel': 'aliopen',
      },
      params: {
        f: 'web',
        user: '2333333',
        source: 'kwplayerhd_ar_4.3.0.8_tianbao_T1A_qirui.apk',
        type: 'convert_url_with_sign',
        br: '2000kflac',
        rid: id,
      },
      timeout: REQUEST_TIMEOUT,
    });

    const payload = (data || {}).data || {};
    const url = String(payload.url || '').trim();
    if (!url.startsWith('http')) {
      throw new Error('Invalid tianbao url');
    }

    return {
      url,
      bitrate: '2000kflac',
    };
  }
}
