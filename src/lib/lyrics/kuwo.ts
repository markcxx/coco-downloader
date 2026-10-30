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
    .replace(/<-?\d+,-?\d+>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
export class KuwoLyrics {
  async getLyric(id: string): Promise<LyricData> {
    const content = await this.getLyricByOfficialApi(id);
    const lrc = cleanLyric(content);
    return { songid: id, provider: 'bodian', lines: parseLyricLines(lrc), lrc };
  }
  private async getLyricByOfficialApi(id: string) {
    const query = `type=lyric&req=2&lrcx=1&rid=${id}&songname=&artist=&corp=kuwo&fromchannel=bodian`;
    const q = Buffer.from(query, 'utf8').toString('base64');
    const { data } = await axios.get('http://mlyric.kuwo.cn/mobi.s', {
      params: {
        f: 'bodian',
        q,
        uid: '-1',
        token: '',
      },
      timeout: REQUEST_TIMEOUT,
    });
    const content = data?.data?.content;
    if (typeof content !== 'string' || !content) {
      throw new Error('Invalid bodian lyric');
    }
    return Buffer.from(content, 'base64').toString('utf8');
  }


}
