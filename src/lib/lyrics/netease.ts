import axios from 'axios';
import crypto from 'crypto';


const LYRIC_API_URL = 'https://interface3.music.163.com/eapi/song/lyric/v1';
const REQUEST_TIMEOUT = 15000;
const EAPI_KEY = Buffer.from('e82ckenh8dichen8', 'utf8');
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 ' +
  'NeteasyMusicDesktop/3.1.19.204510';
const DEFAULT_HEADER = {
  os: 'pc',
  appver: '3.1.19.204510',
  requestId: '0',
  osver: 'Microsoft-Windows-11-Home-China-build-22631-64bit',
};

export type LyricLine = {
  time: number;
  text: string;
};

export type NeteaseLyricData = {
  songid: string;
  provider: 'netease';
  lines: LyricLine[];
  lrc: string;
  tlyric?: string;
  yrc?: string;
  romalrc?: string;
};

function eapiEncrypt(uri: string, payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  const digestText = `nobody${uri}use${text}md5forencrypt`;
  const digest = crypto.createHash('md5').update(digestText, 'utf8').digest('hex');
  const message = `${uri}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const cipher = crypto.createCipheriv('aes-128-ecb', EAPI_KEY, null);
  return Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]).toString('hex').toUpperCase();
}

function toBuffer(content: ArrayBuffer | Buffer) {
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}

function eapiDecrypt(content: ArrayBuffer | Buffer) {
  const decipher = crypto.createDecipheriv('aes-128-ecb', EAPI_KEY, null);
  const decrypted = Buffer.concat([decipher.update(toBuffer(content)), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted) as unknown;
}

function parseMaybeEncryptedResponse(content: ArrayBuffer | Buffer, contentType: string) {
  const buffer = toBuffer(content);
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(buffer.toString('utf8')) as unknown;
    } catch {
      // NetEase can label encrypted eapi payloads as JSON when requested through axios.
    }
  }
  return eapiDecrypt(buffer);
}

function buildFormBody(params: Record<string, string>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.set(key, value);
  }
  return body.toString();
}

function parseLyricLines(lyric: string) {
  const lines: LyricLine[] = [];
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

export class NeteaseLyrics {
  name = 'netease';
  private deviceId = this.generateDeviceId();

  async getLyric(id: string): Promise<NeteaseLyricData> {
    const songId = Number(id);
    if (!Number.isFinite(songId)) {
      throw new Error('Invalid id');
    }

    const raw = await this.makeLyricRequest({
      id: songId,
      cp: false,
      tv: 0,
      lv: 0,
      rv: 0,
      kv: 0,
      yv: 0,
      ytv: 0,
      yrv: 0,
    });
    const payload = raw as {
      lrc?: { lyric?: string };
      tlyric?: { lyric?: string };
      yrc?: { lyric?: string };
      romalrc?: { lyric?: string };
    };
    const lrc = typeof payload.lrc?.lyric === 'string' ? payload.lrc.lyric : '';

    return {
      songid: id,
      provider: 'netease',
      lines: parseLyricLines(lrc),
      lrc,
      tlyric: typeof payload.tlyric?.lyric === 'string' ? payload.tlyric.lyric : undefined,
      yrc: typeof payload.yrc?.lyric === 'string' ? payload.yrc.lyric : undefined,
      romalrc: typeof payload.romalrc?.lyric === 'string' ? payload.romalrc.lyric : undefined,
    };
  }

  private async makeLyricRequest(data: Record<string, unknown>) {
    const uri = '/api/song/lyric/v1';
    const encrypted = eapiEncrypt(uri, { header: this.buildRequestHeader(), e_r: true, ...data });
    const response = await axios.post(LYRIC_API_URL, buildFormBody({ params: encrypted }), {
      headers: {
        'User-Agent': DEFAULT_UA,
        Cookie: this.buildCookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT,
    });

    return parseMaybeEncryptedResponse(response.data, String(response.headers['content-type'] || ''));
  }

  private buildRequestHeader() {
    return { ...DEFAULT_HEADER, deviceId: this.deviceId, MUSIC_U: '' };
  }

  private buildCookieHeader() {
    return new URLSearchParams(this.buildRequestHeader()).toString().replace(/&/g, '; ');
  }

  private generateDeviceId() {
    return crypto.randomBytes(16).toString('hex');
  }

}
