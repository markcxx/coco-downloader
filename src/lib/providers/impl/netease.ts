import axios from 'axios';
import crypto from 'crypto';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';
import { NETEASE_QUALITY_OPTIONS } from '@/lib/music-quality';

const API_DOMAIN = 'https://interface.music.163.com';
const LYRIC_API_URL = 'https://interface3.music.163.com/eapi/song/lyric/v1';
const METING_API_URL = 'https://api.qijieya.cn/meting/';
const REQUEST_TIMEOUT = 15000;
const EAPI_KEY = Buffer.from('e82ckenh8dichen8', 'utf8');
const DEFAULT_LEVEL = 'lossless';
const VALID_LEVELS = new Set([
  'standard',
  'exhigh',
  'lossless',
]);
const METING_BR_BY_LEVEL: Record<string, string> = {
  standard: '128',
  exhigh: '320',
  lossless: '2000',
};
const QUALITY_OPTIONS = NETEASE_QUALITY_OPTIONS;
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 ' +
  'NeteasyMusicDesktop/3.1.19.204510';
const DEFAULT_HEADER = {
  os: 'pc',
  appver: '3.1.19.204510',
  requestId: '0',
  osver: 'Microsoft-Windows-11-Home-China-build-22631-64bit',
};

type NeteaseSong = {
  id?: string | number;
  name?: string;
  ar?: Array<{ name?: string }>;
  artists?: Array<{ name?: string }>;
  al?: { name?: string; picUrl?: string };
  album?: { name?: string; picUrl?: string };
  dt?: number;
  duration?: number;
};

export type LyricLine = {
  time: number;
  text: string;
};

export type NeteaseLyricData = {
  songid: string;
  provider: 'netease';
  lines: LyricLine[];
  lrc: string;
  tlyric?: string;
  yrc?: string;
  romalrc?: string;
};

function formatDuration(milliseconds?: number) {
  if (typeof milliseconds !== 'number' || Number.isNaN(milliseconds)) return undefined;
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function joinArtists(items?: Array<{ name?: string }>) {
  if (!Array.isArray(items)) return '';
  return items.map((item) => item.name).filter(Boolean).join(', ');
}

function extractExt(url: string, fallback = 'mp3') {
  const pathname = url.split('?')[0];
  const part = pathname.split('.').pop();
  return part || fallback;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeLevel(value: unknown) {
  const level = String(value || DEFAULT_LEVEL).trim().toLowerCase();
  return VALID_LEVELS.has(level) ? level : DEFAULT_LEVEL;
}

function normalizeLimit(value?: number) {
  return Math.min(Math.max(Math.floor(Number(value) || 20), 1), 50);
}

function normalizeOffset(value?: number) {
  return Math.max(Math.floor(Number(value) || 0), 0);
}

function eapiEncrypt(uri: string, payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  const digestText = `nobody${uri}use${text}md5forencrypt`;
  const digest = crypto.createHash('md5').update(digestText, 'utf8').digest('hex');
  const message = `${uri}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const cipher = crypto.createCipheriv('aes-128-ecb', EAPI_KEY, null);
  return Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]).toString('hex').toUpperCase();
}

function toBuffer(content: ArrayBuffer | Buffer) {
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}

function eapiDecrypt(content: ArrayBuffer | Buffer) {
  const decipher = crypto.createDecipheriv('aes-128-ecb', EAPI_KEY, null);
  const decrypted = Buffer.concat([decipher.update(toBuffer(content)), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted) as unknown;
}

function parseMaybeEncryptedResponse(content: ArrayBuffer | Buffer, contentType: string) {
  const buffer = toBuffer(content);
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(buffer.toString('utf8')) as unknown;
    } catch {
      // NetEase can label encrypted eapi payloads as JSON when requested through axios.
    }
  }
  return eapiDecrypt(buffer);
}

function buildFormBody(params: Record<string, string>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.set(key, value);
  }
  return body.toString();
}

function parseLyricLines(lyric: string) {
  const lines: LyricLine[] = [];
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

export class NeteaseOfficialProvider implements MusicProvider {
  name = 'netease';
  private deviceId = this.generateDeviceId();

  async search(query: string, limit = 20, offset = 0): Promise<MusicItem[]> {
    try {
      const payload = await this.makeRequest('/api/cloudsearch/pc', {
        s: query.trim(),
        type: 1,
        limit: normalizeLimit(limit),
        offset: normalizeOffset(offset),
        total: true,
      });
      const data = payload as { result?: { songs?: NeteaseSong[] } };
      const songs = Array.isArray(data.result?.songs) ? data.result.songs : [];
      return songs.map((song) => this.mapItem(song)).filter((item): item is MusicItem => Boolean(item));
    } catch (error) {
      console.error('Netease official search error:', error);
      throw error;
    }
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    const payload = extra as { cover?: string; level?: string; selectedLevel?: string } | undefined;
    const level = normalizeLevel(payload?.level || payload?.selectedLevel);

    const info = await this.getByMeting(id, level);
    return { url: info.url, type: extractExt(info.url), bitrate: info.bitrate, cover: payload?.cover };
  }

  async getLyric(id: string): Promise<NeteaseLyricData> {
    const songId = Number(id);
    if (!Number.isFinite(songId)) {
      throw new Error('Invalid id');
    }

    const raw = await this.makeLyricRequest({
      id: songId,
      cp: false,
      tv: 0,
      lv: 0,
      rv: 0,
      kv: 0,
      yv: 0,
      ytv: 0,
      yrv: 0,
    });
    const payload = raw as {
      lrc?: { lyric?: string };
      tlyric?: { lyric?: string };
      yrc?: { lyric?: string };
      romalrc?: { lyric?: string };
    };
    const lrc = typeof payload.lrc?.lyric === 'string' ? payload.lrc.lyric : '';

    return {
      songid: id,
      provider: 'netease',
      lines: parseLyricLines(lrc),
      lrc,
      tlyric: typeof payload.tlyric?.lyric === 'string' ? payload.tlyric.lyric : undefined,
      yrc: typeof payload.yrc?.lyric === 'string' ? payload.yrc.lyric : undefined,
      romalrc: typeof payload.romalrc?.lyric === 'string' ? payload.romalrc.lyric : undefined,
    };
  }

  private async makeRequest(uri: string, data: Record<string, unknown>) {
    const url = `${API_DOMAIN}/eapi${uri.slice(4)}`;
    const encrypted = eapiEncrypt(uri, { header: this.buildRequestHeader(), e_r: true, ...data });
    const response = await axios.post(url, buildFormBody({ params: encrypted }), {
      headers: {
        'User-Agent': DEFAULT_UA,
        Cookie: this.buildCookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT,
    });

    return parseMaybeEncryptedResponse(response.data, String(response.headers['content-type'] || ''));
  }

  private async makeLyricRequest(data: Record<string, unknown>) {
    const uri = '/api/song/lyric/v1';
    const encrypted = eapiEncrypt(uri, { header: this.buildRequestHeader(), e_r: true, ...data });
    const response = await axios.post(LYRIC_API_URL, buildFormBody({ params: encrypted }), {
      headers: {
        'User-Agent': DEFAULT_UA,
        Cookie: this.buildCookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT,
    });

    return parseMaybeEncryptedResponse(response.data, String(response.headers['content-type'] || ''));
  }

  private buildRequestHeader() {
    return { ...DEFAULT_HEADER, deviceId: this.deviceId, MUSIC_U: '' };
  }

  private buildCookieHeader() {
    return new URLSearchParams(this.buildRequestHeader()).toString().replace(/&/g, '; ');
  }

  private generateDeviceId() {
    return crypto.randomBytes(16).toString('hex');
  }

  private async getByMeting(id: string, level: string) {
    const br = METING_BR_BY_LEVEL[level] || '320';
    try {
      const response = await axios.get(METING_API_URL, {
        params: { server: 'netease', type: 'url', id, br },
        timeout: REQUEST_TIMEOUT,
        responseType: 'text',
        maxRedirects: 0,
        validateStatus: (status) => status === 302 || (status >= 200 && status < 300),
      });

      // If 302, get URL from Location header
      if (response.status === 302) {
        const url = response.headers.location;
        if (!isHttpUrl(url)) {
          throw new Error('Invalid meting redirect url');
        }
        return { url, bitrate: br };
      }

      // Otherwise try to extract from response body
      const url = this.extractMetingUrl(String(response.data || ''));
      if (!isHttpUrl(url)) {
        throw new Error('Invalid meting url');
      }
      return { url, bitrate: br };
    } catch (error) {
      // axios throws on 3xx when maxRedirects: 0, catch and extract Location
      if (axios.isAxiosError(error) && error.response?.status === 302) {
        const url = error.response.headers.location;
        if (!isHttpUrl(url)) {
          throw new Error('Invalid meting redirect url');
        }
        return { url, bitrate: br };
      }
      throw error;
    }
  }

  private extractMetingUrl(responseText: string) {
    const rawText = responseText.trim();
    if (isHttpUrl(rawText)) return rawText;

    const payload = JSON.parse(rawText) as unknown;
    if (Array.isArray(payload) && payload.length > 0 && typeof payload[0] === 'object') {
      return String((payload[0] as { url?: string }).url || '').trim();
    }
    if (payload && typeof payload === 'object') {
      const value = (payload as { url?: string; data?: string }).url || (payload as { data?: string }).data;
      return String(value || '').trim();
    }
    return '';
  }

  private mapItem(song: NeteaseSong): MusicItem | null {
    if (!song || song.id === undefined || song.id === null) return null;
    const album = song.al || song.album;
    const cover = album?.picUrl;

    return {
      id: String(song.id),
      title: song.name || '未知歌曲',
      artist: joinArtists(song.ar || song.artists) || '未知歌手',
      album: album?.name || undefined,
      cover: cover || undefined,
      duration: formatDuration(song.dt || song.duration),
      provider: this.name,
      extra: {
        cover: cover || undefined,
        selectedLevel: DEFAULT_LEVEL,
        qualityOptions: QUALITY_OPTIONS,
      },
    };
  }
}
