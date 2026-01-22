import axios from 'axios';
import * as cheerio from 'cheerio';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const SEARCH_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'cache-control': 'max-age=0',
  'priority': 'u=0, i',
  'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
};

const API_HEADERS = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'origin': 'https://www.gequhai.com',
  'priority': 'u=1, i',
  'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  'x-custom-header': 'SecretKey',
  'x-requested-with': 'XMLHttpRequest',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
};

const REQUEST_TIMEOUT = 15000;

type GequhaiItem = {
  id?: string;
  title?: string;
  artist?: string;
  playUrl?: string;
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

export class GequhaiProvider implements MusicProvider {
  name = 'gequhai';

  async search(query: string): Promise<MusicItem[]> {
    try {
      const url = `https://www.gequhai.com/s/${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, { headers: SEARCH_HEADERS, timeout: REQUEST_TIMEOUT });
      const results = parseSearchHtml(data);
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
      return [];
    }
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    try {
      const playUrl = (() => {
        const candidate = (extra as { playUrl?: unknown } | undefined)?.playUrl;
        return typeof candidate === 'string' && candidate.trim()
          ? candidate
          : `https://www.gequhai.com/play/${id}`;
      })();
      const { data: html } = await axios.get(playUrl, { headers: SEARCH_HEADERS, timeout: REQUEST_TIMEOUT });
      const appData = extractAppData(html);
      const playId = String(appData.play_id || appData.mp3_id || id || '');
      let downloadUrl = '';
      if (playId) {
        const params = new URLSearchParams({ id: playId, type: '0' });
        const { data: apiData } = await axios.post('https://www.gequhai.com/api/music', params, {
          headers: API_HEADERS,
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
      const cover = typeof appData.mp3_cover === 'string' ? appData.mp3_cover : undefined;
      return {
        url: downloadUrl,
        type: extractExt(downloadUrl),
        cover,
      };
    } catch (error) {
      console.error('Gequhai getPlayInfo error:', error);
      throw error;
    }
  }
}
