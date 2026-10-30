import axios from 'axios';
import type { LyricData } from '@/types/music';
const SEARCH_HEADERS = {'User-Agent': 'Mozilla/5.0'};

function decodeBase64(value: string) {
  return Buffer.from(value, 'base64').toString('utf8');
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
export class QQLyrics {
  async getLyric(id: string): Promise<LyricData> {
    const { data } = await axios.get('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
      headers: {
        'Referer': 'https://y.qq.com/portal/player.html',
        'User-Agent': SEARCH_HEADERS['User-Agent'],
      },
      params: {
        songmid: id,
        g_tk: '5381',
        loginUin: '0',
        hostUin: '0',
        format: 'json',
        inCharset: 'utf8',
        outCharset: 'utf-8',
        platform: 'yqq',
      },
      timeout: 15000,
    });
    const encoded = typeof data?.lyric === 'string' ? data.lyric : '';
    const lrc = encoded ? decodeBase64(encoded) : '';
    return {
      songid: id,
      provider: 'qq',
      lines: parseLyricLines(lrc),
      lrc,
    };
  }

}
