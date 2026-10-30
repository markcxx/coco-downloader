import type { MusicItem, MusicProvider, PlayInfo } from '@/types/music';
import { GDSTUDIO_QUALITY_OPTIONS } from '@/lib/music-quality';
import { requestGD } from '@/lib/providers/gdstudio-client';

type GDSong = {
  id?: string | number;
  url_id?: string | number;
  name?: string;
  artist?: string[];
  album?: string;
  source?: string;
  extra_data?: { duration?: number; has_hires?: boolean };
};
type GDUrl = { url?: string; size?: number | string; br?: number | string };
const BITRATES: Record<string, string> = { standard: '128', exhigh: '320', lossless: '740', hires: '999' };

export class GDStudioProvider implements MusicProvider {
  readonly name = 'gdstudio-netease';

  async search(query: string, limit = 20, offset = 0): Promise<MusicItem[]> {
    const keyword = query.trim();
    if (!keyword) return [];
    // Fixed upstream page size preserves offsets even when the caller changes limit.
    const start = Math.max(0, Math.floor(offset));
    const count = Math.min(50, Math.max(1, Math.floor(limit)));
    const page = Math.floor(start / 50) + 1;
    const withinPage = start % 50;
    const load = (pages: number) => requestGD<GDSong[]>({ types: 'search', name: keyword, count: '50', pages: String(pages) });
    let songs = await load(page);
    if (!Array.isArray(songs)) throw new Error('GD 音乐台未返回有效的搜索结果，请稍后重试');
    if (withinPage + count > 50 && songs.length === 50) {
      const next = await load(page + 1);
      if (Array.isArray(next)) songs = songs.concat(next);
    }
    return songs.slice(withinPage, withinPage + count).flatMap(song => {
      if (!song || typeof song !== 'object') return [];
      const id = String(song.id || '');
      const urlId = String(song.url_id || id);
      if (song.source !== 'netease' || !/^\d+$/.test(id) || !/^\d+$/.test(urlId) || !song.name) return [];
      const seconds = Math.floor(Number(song.extra_data?.duration || 0));
      return [{
        id, title: song.name, artist: Array.isArray(song.artist) ? song.artist.join(' / ') : '未知歌手',
        album: song.album, provider: this.name,
        duration: seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : undefined,
        extra: { urlId, selectedLevel: 'lossless', qualityOptions: GDSTUDIO_QUALITY_OPTIONS.filter(option => option.value !== 'hires' || song.extra_data?.has_hires) },
      }];
    });
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    const context = extra as { urlId?: unknown; selectedLevel?: string; level?: string } | undefined;
    const urlId = typeof context?.urlId === 'string' ? context.urlId : id;
    if (!/^\d+$/.test(id) || !/^\d+$/.test(urlId)) throw new Error('GD 音乐台歌曲 ID 无效，请重新搜索');
    const level = context?.selectedLevel || context?.level || 'lossless';
    const br = Object.hasOwn(BITRATES, level) ? BITRATES[level] : BITRATES.lossless;
    const result = await requestGD<GDUrl>({ types: 'url', id: urlId, br });
    if (!result?.url || Number(result.size) === 0 || Number(result.br) === -1) {
      throw new Error('GD 音乐台暂未提供此歌曲的音频，请更换音质或渠道');
    }
    const url = new URL(result.url, 'https://music.gdstudio.xyz/');
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('GD 音乐台返回了无效音频地址');
    return {
      url: url.href, type: url.pathname.match(/\.(mp3|flac|m4a|aac|ogg|wav)$/i)?.[1]?.toLowerCase() || 'mp3',
      bitrate: result.br ? `${result.br} kbps` : undefined,
    };
  }
}
