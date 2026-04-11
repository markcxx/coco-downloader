import axios from 'axios';
import * as cheerio from 'cheerio';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const REQUEST_TIMEOUT = 15000;

const HEADERS_PAGE = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'cache-control': 'max-age=0',
  'priority': 'u=0, i',
  'referer': 'https://www.gequbao.com/',
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

const HEADERS_API = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'origin': 'https://www.gequbao.com',
  'priority': 'u=1, i',
  'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
};

function extractExt(url: string) {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'mp3';
}

function decodeJsStringLiteral(raw: string) {
  return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`) as string;
}

function extractAppData(html: string): Record<string, unknown> {
  const jsonParseMatch = /window\.appData\s*=\s*JSON\.parse\((['"])([\s\S]*?)\1\)\s*;/.exec(html);
  if (jsonParseMatch) {
    try {
      const jsonText = decodeJsStringLiteral(jsonParseMatch[2]);
      return JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
    }
  }

  const jsonObjectMatch = /window\.appData\s*=\s*(\{[\s\S]*?\})\s*;/.exec(html);
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[1]) as Record<string, unknown>;
    } catch {
    }
  }

  return {};
}

export class GequbaoProvider implements MusicProvider {
  name = 'gequbao';

  async search(query: string): Promise<MusicItem[]> {
    try {
      const url = `https://www.gequbao.com/s/${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, { headers: HEADERS_PAGE, timeout: REQUEST_TIMEOUT });
      const $ = cheerio.load(data);
      const items: MusicItem[] = [];

      $('a[href^="/music/"]').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const match = href.match(/\/music\/([0-9]+)/);
        if (!match) return;

        const id = match[1];
        // 清理标题中的多余空白符
        const rawTitle = $a.text();
        const title = rawTitle.replace(/\s+/g, ' ').trim();

        // 过滤干扰项
        if (!title || ['播放&下载', '播放', '下载'].includes(title) || title.startsWith('网友刚刚下载了')) {
          return;
        }

        let artist = '';
        // 尝试从父级查找歌手
        const $parent = $a.closest('li, div, tr');
        if ($parent.length) {
          const $artist = $parent.find('a[href*="/singer/"], a[href*="/artist/"]');
          if ($artist.length) {
             artist = $artist.text().replace(/\s+/g, ' ').trim();
          }

          // 尝试文本分割
          if (!artist) {
            const txt = $parent.text().replace(/\s+/g, ' ').trim();
            if (txt.includes(' - ')) {
              const parts = txt.split(' - ').filter(s => s.trim());
              if (parts.length >= 2 && parts[0].includes(title)) {
                artist = parts[1].trim();
              }
            }
          }
        }

        // 尝试标题分割
        if (!artist) {
          const sep = title.includes(' - ') ? ' - ' : '-';
          if (title.includes(sep)) {
            const parts = title.split(sep, 2).map(s => s.trim());
            if (parts.length === 2) {
              // 分离标题和歌手
              artist = parts[1];
              // 这是一个临时变量，我们需要修改 items.push 里的 title
            }
          }
        }

        // 如果标题中包含歌手名（通常格式为 "歌名 - 歌手"），再次清理标题
        // 无论 artist 是从哪里获取的，如果 title 包含 " - artist" 或 "-artist"，都应该去掉
        if (artist) {
            const sep1 = ` - ${artist}`;
            const sep2 = `-${artist}`;
            if (title.includes(sep1)) {
                items.push({
                    id,
                    title: title.replace(sep1, '').trim(),
                    artist: artist,
                    provider: this.name,
                });
                return;
            } else if (title.includes(sep2)) {
                items.push({
                    id,
                    title: title.replace(sep2, '').trim(),
                    artist: artist,
                    provider: this.name,
                });
                return;
            }
        }

        items.push({
          id,
          title,
          artist: artist || '未知歌手',
          provider: this.name,
        });
      });

      // 去重
      const seen = new Set();
      const dedup: MusicItem[] = [];
      for (const item of items) {
        const key = `${item.id}-${item.title}`;
        if (!seen.has(key)) {
          seen.add(key);
          dedup.push(item);
        }
      }
      return dedup;
    } catch (error) {
      console.error('Gequbao search error:', error);
      return [];
    }
  }

  async getPlayInfo(id: string, quality?: 'standard' | 'high' | 'lossless'): Promise<PlayInfo> {
    try {
      const pageUrl = `https://www.gequbao.com/music/${id}`;
      const { data: html } = await axios.get(pageUrl, {
        headers: { ...HEADERS_PAGE, referer: 'https://www.gequbao.com/' },
        timeout: REQUEST_TIMEOUT,
      });

      const appData = extractAppData(html);
      const playId = typeof appData.play_id === 'string' ? appData.play_id : '';
      const cover = typeof appData.mp3_cover === 'string' ? appData.mp3_cover : undefined;

      if (!playId) throw new Error('Failed to extract play_id');

      const params = new URLSearchParams({ id: playId });
      const { data: apiRes } = await axios.post('https://www.gequbao.com/api/play-url', params, {
        headers: { ...HEADERS_API, referer: pageUrl },
        timeout: REQUEST_TIMEOUT,
      });

      if (apiRes.code === 1 && apiRes.data?.url) {
        const url = String(apiRes.data.url || '').trim();
        if (!url.startsWith('http')) throw new Error('Invalid url');
        return {
          url,
          type: extractExt(url),
          cover,
        };
      }
      
      throw new Error(apiRes.msg || 'API error');
    } catch (error) {
      console.error('Gequbao getPlayInfo error:', error);
      throw error;
    }
  }
}
