import axios from 'axios';
import * as cheerio from 'cheerio';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';
import { validateAudioLink } from '@/lib/providers/audio-link';

const BASE_URL = 'https://www.at38.cn/';
const REQUEST_TIMEOUT = 15000;
type At38Source = 'wy' | 'qq';

type At38UrlResponse = {
  code?: number;
  url?: string;
  msg?: string;
};

function audioExtension(value: string) {
  return new URL(value).pathname.match(/\.(mp3|flac|m4a|aac|wav|ogg|opus)$/i)?.[1]?.toLowerCase() || 'mp3';
}

export class At38Provider implements MusicProvider {
  private readonly cookies = new Map<string, string>();

  constructor(public readonly name: string, private readonly source: At38Source) {}

  private validId(id: string) {
    return (this.source === 'wy' ? /^\d+$/ : /^[a-zA-Z0-9]+$/).test(id);
  }

  private async requestText(params: Record<string, string>) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await axios.get<string>(BASE_URL, {
        params,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: BASE_URL,
          Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        },
        responseType: 'text',
        timeout: REQUEST_TIMEOUT,
      });
      for (const cookie of response.headers['set-cookie'] || []) {
        const pair = cookie.split(';', 1)[0];
        const separator = pair.indexOf('=');
        if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      // The first visit sets a literal visit cookie and reloads. Only extract
      // that value; never evaluate scripts supplied by a music provider.
      const visit = response.data.match(/document\.cookie\s*=\s*["']mk_visit=([^;"']+)/);
      if (visit) {
        this.cookies.set('mk_visit', visit[1]);
        continue;
      }
      return response.data;
    }
    throw new Error('51ape 访问会话建立失败，请稍后重试');
  }

  async search(query: string, limit = 20, offset = 0): Promise<MusicItem[]> {
    const keyword = query.trim();
    if (!keyword) return [];
    const html = await this.requestText({ keyword });
    const $ = cheerio.load(html);
    const items: MusicItem[] = [];
    const seen = new Set<string>();
    $('.music-card').each((_, element) => {
      const card = $(element);
      if (card.attr('data-type') !== this.source) return;
      const id = card.attr('data-id') || '';
      const title = card.find('.music-info h3').text().trim();
      if (!this.validId(id) || !title || seen.has(id)) return;
      const metadata = card.find('.music-info p').text().replace(/\s+/g, ' ').trim();
      const artist = metadata.match(/歌手[：:]\s*(.*?)\s*\|\s*专辑[：:]/)?.[1]?.trim() || '未知歌手';
      const album = metadata.match(/专辑[：:]\s*(.*?)\s*\|\s*来源[：:]/)?.[1]?.trim();
      seen.add(id);
      items.push({
        id, title, artist, album: album || undefined, provider: this.name,
        extra: { filename: card.attr('data-filename') || `${artist}-${title}` },
      });
    });
    const start = Math.max(0, Math.floor(offset));
    const size = Math.min(50, Math.max(1, Math.floor(limit)));
    return items.slice(start, start + size);
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    if (!this.validId(id)) throw new Error('51ape 歌曲 ID 无效，请重新搜索');
    const filename = (extra as { filename?: unknown } | undefined)?.filename;
    const text = await this.requestText({
      action: 'geturl', id, type: this.source,
      filename: typeof filename === 'string' ? filename : id,
    });
    let payload: At38UrlResponse;
    try {
      payload = JSON.parse(text) as At38UrlResponse;
    } catch {
      throw new Error('51ape 未返回有效的歌曲链接，请稍后重试或更换渠道');
    }
    if (payload?.code !== 1 || typeof payload.url !== 'string' || !/^https?:\/\//i.test(payload.url)) {
      throw new Error(typeof payload?.msg === 'string' ? payload.msg : '51ape 暂未提供此歌曲的播放链接');
    }
    const verified = await validateAudioLink(payload.url, {
      timeout: REQUEST_TIMEOUT,
      verifyMislabeledAudio: true,
    });
    return { url: verified.url, type: audioExtension(verified.url) };
  }
}
