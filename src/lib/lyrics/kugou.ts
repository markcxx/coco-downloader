import axios from 'axios';
import type { LyricData } from '@/types/music';
const REQUEST_TIMEOUT=15000;
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
function cleanLyric(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
export class KugouLyrics {
  async getLyric(id: string, extra?: unknown): Promise<LyricData> {
    const keyword = String(getExtraValue(extra, 'filename') || '');
    const duration = String(getExtraValue(extra, 'duration') || '-1');
    const { data: searchData } = await axios.get('http://lyrics.kugou.com/search', {
      params: { keyword, duration, hash: id },
      timeout: REQUEST_TIMEOUT,
    });
    const candidate = searchData?.candidates?.[0];
    if (!candidate?.id || !candidate?.accesskey) {
      return { songid: id, provider: 'kugou', lines: [], lrc: '' };
    }

    const { data: lyricData } = await axios.get('http://lyrics.kugou.com/download', {
      params: {
        ver: 1,
        client: 'pc',
        id: candidate.id,
        accesskey: candidate.accesskey,
        fmt: 'lrc',
        charset: 'utf8',
      },
      timeout: REQUEST_TIMEOUT,
    });
    const encoded = typeof lyricData?.content === 'string' ? lyricData.content : '';
    const lrc = encoded ? cleanLyric(Buffer.from(encoded, 'base64').toString('utf8')) : '';
    return {
      songid: id,
      provider: 'kugou',
      lines: parseLyricLines(lrc),
      lrc,
    };
  }

}

function getExtraValue(extra: unknown,key:string) { return (extra as Record<string, unknown> | undefined)?.[key]; }
