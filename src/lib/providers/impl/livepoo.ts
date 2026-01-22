import axios from 'axios';
import * as cheerio from 'cheerio';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const HEADERS = {
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

type LivepooItem = {
  id?: string;
  title?: string;
  artist?: string;
  detailUrl?: string;
};

function normalizeText(text: string) {
  let value = text.replace(/\s+/g, ' ').trim();
  ['播放', '试听', '下载', '分享'].forEach((token) => {
    value = value.replaceAll(token, '');
  });
  return value.replace(/\s+/g, ' ').trim();
}

function parseTitle(text: string) {
  const normalized = normalizeText(text);
  const match = /^(.*?)《(.*?)》$/.exec(normalized);
  if (match) {
    return { artist: match[1]?.trim() || '', title: match[2]?.trim() || normalized };
  }
  if (normalized.includes(' - ')) {
    const parts = normalized.split(' - ').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { artist: parts[1], title: parts[0] };
    }
  }
  if (normalized.includes('-')) {
    const parts = normalized.split('-').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { artist: parts[1], title: parts[0] };
    }
  }
  return { artist: '', title: normalized };
}

function extractCover(html: string) {
  const match = /"music_cover"\s*:\s*"(.*?)"/.exec(html);
  if (!match) return '';
  const raw = match[1];
  try {
    return JSON.parse(`"${raw}"`).replace('\\/', '/');
  } catch {
    return raw.replace('\\/', '/');
  }
}

function parseSearchHtml(html: string): LivepooItem[] {
  const $ = cheerio.load(html);
  const items: LivepooItem[] = [];
  $('ul.tuij_song li.song_item2 a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const li = $(el).closest('li.song_item2');
    const titleDiv = li.find('.song_info2 > div').first();
    const candidateTitle =
      titleDiv.text() ||
      li.find('.song_info2 .song_name').first().text() ||
      li.find('.song_info2').first().text() ||
      $(el).text();
    const titleText = normalizeText(candidateTitle);
    const url = new URL(href, 'https://www.livepoo.cn/');
    const idParam = url.searchParams.get('id') || '';
    const id = idParam.replace(/^MUSIC_/, '');
    if (!id || !titleText) return;
    const artistFromLink =
      li.find('a[href*="singer"], a[href*="artist"]').first().text().replace(/\s+/g, ' ').trim() || '';
    const { artist, title } = parseTitle(titleText);
    items.push({
      id,
      title: title || titleText,
      artist: artist || artistFromLink,
      detailUrl: url.toString(),
    });
  });
  return items;
}

function getExt(url: string) {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'mp3';
}

export class LivepooProvider implements MusicProvider {
  name = 'livepoo';

  async search(query: string): Promise<MusicItem[]> {
    try {
      const url = `https://www.livepoo.cn/search?keyword=${encodeURIComponent(query)}&page=0`;
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const results = parseSearchHtml(data);
      return results.map((item) => ({
        id: item.id as string,
        title: item.title || '未知歌曲',
        artist: item.artist || '未知歌手',
        provider: this.name,
        extra: {
          detailUrl: item.detailUrl,
        },
      }));
    } catch (error) {
      console.error('Livepoo search error:', error);
      return [];
    }
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    try {
      const detailUrl = this.getDetailUrl(id, extra);
      if (detailUrl) {
        const { data: detailHtml } = await axios.get(detailUrl, { headers: HEADERS, timeout: 15000 });
        const cover = extractCover(detailHtml);
        const playUrl = `https://www.livepoo.cn/audio/play?id=${encodeURIComponent(id)}`;
        const { data: playUrlText } = await axios.get(playUrl, { headers: HEADERS, timeout: 15000 });
        const url = String(playUrlText || '').trim();
        if (!url.startsWith('http')) {
          throw new Error('Invalid play url');
        }
        return {
          url,
          type: getExt(url),
          cover: cover || undefined,
        };
      }
      const playUrl = `https://www.livepoo.cn/audio/play?id=${encodeURIComponent(id)}`;
      const { data: playUrlText } = await axios.get(playUrl, { headers: HEADERS, timeout: 15000 });
      const url = String(playUrlText || '').trim();
      if (!url.startsWith('http')) {
        throw new Error('Invalid play url');
      }
      return {
        url,
        type: getExt(url),
      };
    } catch (error) {
      console.error('Livepoo getPlayInfo error:', error);
      throw error;
    }
  }

  private getDetailUrl(id: string, extra?: unknown): string | null {
    const detailUrl = (extra as { detailUrl?: string } | undefined)?.detailUrl;
    if (typeof detailUrl === 'string' && detailUrl.startsWith('http')) {
      return detailUrl;
    }
    if (id) {
      return `https://www.livepoo.cn/music/info.html?id=MUSIC_${id}`;
    }
    return null;
  }
}
