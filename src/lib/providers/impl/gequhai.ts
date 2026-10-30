import axios from 'axios';
import { validateAudioLink } from '@/lib/providers/audio-link';
import * as cheerio from 'cheerio';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const SITE_URL = 'https://www.gequhai.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const SEARCH_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'user-agent': USER_AGENT,
  'referer': `${SITE_URL}/`,
};

const API_HEADERS = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'origin': SITE_URL,
  'x-custom-header': 'SecretKey',
  'x-requested-with': 'XMLHttpRequest',
  'user-agent': USER_AGENT,
};

const REQUEST_TIMEOUT = 15000;

type GequhaiItem = {
  id?: string;
  title?: string;
  artist?: string;
  playUrl?: string;
};

export type GequhaiLyricData = {
  songid: string;
  provider: 'gequhai';
  lines: Array<{ time: number; text: string }>;
  lrc: string;
};

function decodeQuarkUrl(quarkUrl: string) {
  try {
    const b64 = quarkUrl.replace(/#/g, 'H');
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractAppData(html: string) {
  const out: Record<string, unknown> = {};
  const appDataMatch = /window\.appData\s*=\s*(\{.*?\})\s*;/.exec(html);
  if (appDataMatch) {
    try {
      Object.assign(out, JSON.parse(appDataMatch[1]));
    } catch {
    }
  }
  const singleQuoteVars = html.matchAll(/window\.(\w+)\s*=\s*'([^']*)'\s*;/g);
  for (const match of singleQuoteVars) {
    out[match[1]] = match[2];
  }
  const doubleQuoteVars = html.matchAll(/window\.(\w+)\s*=\s*"([^"]*)"\s*;/g);
  for (const match of doubleQuoteVars) {
    out[match[1]] = match[2];
  }
  const numberVars = html.matchAll(/window\.(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g);
  for (const match of numberVars) {
    if (out[match[1]] !== undefined) continue;
    out[match[1]] = match[2];
  }
  const boolVars = html.matchAll(/window\.(\w+)\s*=\s*(true|false|null)\s*;/gi);
  for (const match of boolVars) {
    if (out[match[1]] !== undefined) continue;
    out[match[1]] = match[2].toLowerCase();
  }
  const mp3Title = out['mp3_title'];
  const mp3Author = out['mp3_author'];
  if (mp3Title && mp3Author && !out['mp3_name']) {
    out['mp3_name'] = `${mp3Title}-${mp3Author}`;
  }
  const extraUrl = out['mp3_extra_url'];
  if (typeof extraUrl === 'string') {
    out['mp3_extra_url_decoded'] = decodeQuarkUrl(extraUrl);
  }
  return out;
}

function parseSearchHtml(html: string): GequhaiItem[] {
  const $ = cheerio.load(html);
  const table = $('table#myTables');
  if (!table.length) return [];
  const items: GequhaiItem[] = [];
  table.find('tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 3) return;
    const titleCell = tds.eq(1);
    const singerCell = tds.eq(2);
    const link = titleCell.find('a').first();
    const title = link.length ? link.text().trim() : titleCell.text().trim();
    const href = link.attr('href') || '';
    const playUrl = href ? new URL(href, 'https://www.gequhai.com').toString() : '';
    const artist = singerCell.text().trim();
    const match = href.match(/\/play\/(\d+)/);
    const id = match ? match[1] : '';
    if (!id) return;
    items.push({ id, title, artist, playUrl });
  });
  return items;
}

function extractExt(url: string) {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'mp3';
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
    .filter((line) => line.text && !line.text.includes('歌词获取失败'))
    .sort((a, b) => a.time - b.time);
}

function cleanLyric(value: string) {
  const lyric = value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return lyric && !lyric.includes('歌词获取失败') ? lyric : '';
}

export class GequhaiProvider implements MusicProvider {
  name = 'gequhai';
  private readonly cookies = new Map<string, string>();

  private cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  private rememberCookies(values: string[] | undefined) {
    for (const cookie of values || []) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator < 1) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1);
      if (!value || /;\s*max-age=0(?:;|$)/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private async fetchPage(url: string) {
    if (new URL(url).origin !== SITE_URL) throw new Error('Invalid Gequhai page URL');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await axios.get<string>(url, {
        headers: { ...SEARCH_HEADERS, Cookie: this.cookieHeader() },
        responseType: 'text',
        timeout: REQUEST_TIMEOUT,
        validateStatus: (status) => (status >= 200 && status < 300) || status === 403,
      });
      const cookies = response.headers['set-cookie'];
      this.rememberCookies(cookies);
      // A first visit may establish a session using a 403 reload page.
      if (response.status === 403 && cookies?.length && attempt === 0) continue;
      if (response.status === 403) throw new Error('Gequhai rejected the search session');
      return response.data;
    }
    throw new Error('Failed to establish Gequhai session');
  }

  async search(query: string, limit = 20, offset = 0): Promise<MusicItem[]> {
    try {
      const keyword = query.trim();
      if (!keyword) return [];
      if (this.cookies.size === 0) await this.fetchPage(`${SITE_URL}/`);
      const url = new URL('/search', SITE_URL);
      url.searchParams.set('s', keyword);
      const html = await this.fetchPage(url.href);
      const start = Math.max(0, Math.floor(offset));
      const size = Math.min(50, Math.max(1, Math.floor(limit)));
      const results = parseSearchHtml(html).slice(start, start + size);
      return results.map((item) => ({
        id: item.id as string,
        title: item.title || '未知歌曲',
        artist: item.artist || '未知歌手',
        provider: this.name,
        extra: {
          playUrl: item.playUrl,
        },
      }));
    } catch (error) {
      console.error('Gequhai search error:', error);
      throw error;
    }
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    try {
      const playUrl = this.getPlayUrl(id, extra);
      const html = await this.fetchPage(playUrl);
      const appData = extractAppData(html);
      const playId = String(appData.play_id || appData.mp3_id || id || '');
      let downloadUrl = '';
      if (playId) {
        const params = new URLSearchParams({ id: playId, type: '0' });
        const { data: apiData } = await axios.post('https://www.gequhai.com/api/music', params, {
          headers: { ...API_HEADERS, Referer: playUrl, Cookie: this.cookieHeader() },
          timeout: REQUEST_TIMEOUT,
        });
        const apiUrl = apiData?.data?.url;
        if (typeof apiUrl === 'string' && apiUrl.startsWith('http')) {
          downloadUrl = apiUrl;
        }
      }
      if (!downloadUrl) {
        const extraUrl = appData.mp3_extra_url_decoded;
        if (typeof extraUrl === 'string' && extraUrl.startsWith('http')) {
          downloadUrl = extraUrl;
        }
      }
      if (!downloadUrl) {
        throw new Error('Failed to resolve download url');
      }
      const verified = await validateAudioLink(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const cover = typeof appData.mp3_cover === 'string' ? appData.mp3_cover : undefined;
      return {
        url: verified.url,
        type: extractExt(downloadUrl),
        cover,
      };
    } catch (error) {
      console.error('Gequhai getPlayInfo error:', error);
      throw error;
    }
  }

  async getLyric(id: string, extra?: unknown): Promise<GequhaiLyricData> {
    const playUrl = this.getPlayUrl(id, extra);
    const html = await this.fetchPage(playUrl);
    const $ = cheerio.load(html);
    const lrc = cleanLyric($('#content-lrc2').text().trim());

    return {
      songid: id,
      provider: 'gequhai',
      lines: parseLyricLines(lrc),
      lrc,
    };
  }

  private getPlayUrl(id: string, extra?: unknown) {
    const candidate = (extra as { playUrl?: unknown } | undefined)?.playUrl;
    if (typeof candidate === 'string' && candidate.trim()) {
      const url = new URL(candidate, SITE_URL);
      if (url.origin === SITE_URL && /^\/play\/\d+\/?$/.test(url.pathname)) return url.href;
    }
    return `${SITE_URL}/play/${encodeURIComponent(id)}`;
  }
}
