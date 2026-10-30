import axios from 'axios';
import * as cheerio from 'cheerio';
import type { MusicItem, MusicProvider, PlayInfo } from '@/types/music';
import { validateAudioLink } from '@/lib/providers/audio-link';

const SITE = 'https://www.gequke.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: `${SITE}/` };

// A page's play_id belongs to its PHP session. Keep each operation's cookies
// isolated, including the initial 403 response that establishes a visit cookie.
class GequkeSession {
  private readonly cookies = new Map<string, string>();
  private readonly signal = AbortSignal.timeout(28000);
  private referer = `${SITE}/`;

  async request(path: string, data?: Record<string, string>, music = false) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await axios.request<string>({
        url: `${SITE}${path}`, method: data ? 'POST' : 'GET',
        data: data ? new URLSearchParams(data) : undefined,
        headers: {
          ...HEADERS, Referer: this.referer, Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
          ...(data ? { Origin: SITE, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': music ? 'Http' : 'XMLHttpRequest' } : {}),
          ...(music ? { 'X-Custom-Header': 'Key' } : {}),
        },
        responseType: 'text', timeout: 10000, signal: this.signal,
        maxContentLength: 2 * 1024 * 1024,
        validateStatus: status => status === 200 || status === 403 || status === 429,
      });
      const values = response.headers['set-cookie'] as string[] | undefined;
      for (const cookie of values || []) {
        const pair = cookie.split(';', 1)[0], separator = pair.indexOf('=');
        if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      if (response.status === 403 && values?.length && attempt === 0) continue;
      if (response.status === 403) throw new Error('歌曲客拒绝了当前访问，请稍后重试或切换渠道');
      if (response.status === 429) throw new Error('歌曲客请求过于频繁，请稍后重试');
      if (!data) this.referer = `${SITE}${path}`;
      return response.data;
    }
    throw new Error('歌曲客会话建立失败，请稍后重试');
  }

  async json(path: string, data: Record<string, string>, music = false) {
    const text = await this.request(path, data, music);
    try {
      const result = JSON.parse(text);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
      return result as { code?: number; msg?: string; data?: { url?: string } };
    }
    catch { throw new Error('歌曲客未返回有效数据，请稍后重试'); }
  }
}

function pageValue(html: string, name: string) {
  return html.match(new RegExp(`window\\.${name}\\s*=\\s*['"]([^'"]*)['"]`))?.[1] || '';
}

function songPath(id: string) {
  if (!/^\d+$/.test(id)) throw new Error('歌曲客歌曲 ID 无效，请重新搜索');
  return `/song/${id}`;
}

function audioUrl(value: string) {
  const url = new URL(value, SITE);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.endsWith('.kuwo.cn')) {
    throw new Error('歌曲客暂未提供此歌曲的酷我音频直链，请更换渠道');
  }
  return url;
}

export class GequkeProvider implements MusicProvider {
  readonly name = 'gequke';

  async search(query: string, limit = 20, offset = 0): Promise<MusicItem[]> {
    const keyword = query.trim();
    if (!keyword) return [];
    if (keyword.length > 50) throw new Error('歌曲客搜索关键词不能超过 50 个字');
    const session = new GequkeSession();
    await session.request('/');
    let state = await session.json('/api/s', { keyword });
    if (state.code === 2) {
      for (let attempt = 0; state.code !== 1 && attempt < 4; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        state = await session.json('/api/query-map', { keyword });
      }
      if (state.code !== 1) throw new Error('歌曲客正在整理搜索结果，请稍后重新搜索');
    }
    if (state.code !== 1) throw new Error(state.msg || '歌曲客搜索失败，请稍后重试');
    const html = await session.request(`/search?${new URLSearchParams({ s: keyword })}`);
    const $ = cheerio.load(html), items: MusicItem[] = [], seen = new Set<string>();
    $('#myTables tbody tr').each((_, row) => {
      const cells = $(row).find('td'), link = cells.eq(1).find('a').first();
      const id = link.attr('href')?.match(/^\/song\/(\d+)\/?$/)?.[1];
      const title = link.text().trim();
      if (!id || !title || seen.has(id)) return;
      seen.add(id);
      items.push({ id, title, artist: cells.eq(2).text().trim() || '未知歌手', provider: this.name });
    });
    const start = Math.max(0, Math.floor(offset)), count = Math.min(50, Math.max(1, Math.floor(limit)));
    return items.slice(start, start + count);
  }

  async getPlayInfo(id: string): Promise<PlayInfo> {
    const path = songPath(id), session = new GequkeSession();
    const html = await session.request(path), playId = pageValue(html, 'play_id');
    if (!playId) throw new Error('歌曲客未提供播放标识，请重新搜索');
    const result = await session.json('/api/music', { id: playId, type: '0' }, true);
    if (result.code !== 200 || typeof result.data?.url !== 'string' || !result.data.url) {
      throw new Error(result.code === 430 ? '歌曲客暂未提供此歌曲的在线音源，请更换渠道' : result.msg || '歌曲客音频解析失败，请稍后重试');
    }
    let url = audioUrl(result.data.url);
    if (url.hostname === 'antiserver.kuwo.cn') {
      url.searchParams.set('type', 'convert_url3');
      url.searchParams.set('callback', 'gequkeCallback');
      const response = await axios.get<string>(url.href, { headers: HEADERS, responseType: 'text', timeout: 10000 });
      const text = response.data.trim().replace(/^gequkeCallback\(/, '').replace(/\);?$/, '');
      try {
        const resolved = JSON.parse(text) as { code?: number; url?: string };
        if (resolved.code !== 200 || !resolved.url) throw new Error();
        url = audioUrl(resolved.url);
      } catch { throw new Error('歌曲客的酷我音频转换失败，请稍后重试'); }
    }
    const verified = await validateAudioLink(url.href, { timeout: 10000, verifyMislabeledAudio: true });
    audioUrl(verified.url);
    return {
      url: verified.url, type: new URL(verified.url).pathname.match(/\.(mp3|flac|m4a|aac|ogg|wav)$/i)?.[1]?.toLowerCase() || 'mp3',
      cover: pageValue(html, 'mp3_cover') || undefined,
    };
  }

  // The shared lyric route first tries the official Kuwo match. This embedded
  // lyric is only a fallback; the site's numeric IDs are never official IDs.
  async getLyric(id: string) {
    const html = await new GequkeSession().request(songPath(id));
    const $ = cheerio.load(html), lrc = $('#content-lrc2').text().trim();
    const lines: Array<{ time: number; text: string }> = [];
    for (const row of lrc.split(/\r?\n/)) {
      const pattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
      const text = row.replace(pattern, '').trim();
      for (const match of row.matchAll(pattern)) {
        if (text) lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + Number((match[3] || '').padEnd(3, '0')) / 1000, text });
      }
    }
    return { songid: id, provider: this.name, lrc, lines: lines.sort((a, b) => a.time - b.time) };
  }
}
