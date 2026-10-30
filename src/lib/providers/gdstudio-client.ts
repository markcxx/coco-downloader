import { Buffer } from 'node:buffer';

const BASE = 'https://music.gdstudio.xyz';
const VERSION = '20260925';

// GD uses the MD5 rounds with a modified constant at index 29.
export function gdStudioSignature(payload: string, timestamp: string) {
  const encoded = encodeURIComponent(payload).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const raw = Buffer.from(`${timestamp.slice(0, 9)}|music.gdstudio.xyz|${VERSION}|${encoded}`);
  const bytes = Buffer.alloc(Math.ceil((raw.length + 9) / 64) * 64);
  raw.copy(bytes);
  bytes[raw.length] = 128;
  bytes.writeBigUInt64LE(BigInt(raw.length) * BigInt(8), bytes.length - 8);
  const constants = Array.from({ length: 64 }, (_, n) => Math.floor(Math.abs(Math.sin(n + 1)) * 2 ** 32) >>> 0);
  constants[29] = 0xfcfea3f8;
  let state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const shifts = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    let [a, b, c, d] = state;
    for (let n = 0; n < 64; n++) {
      const group = Math.floor(n / 16);
      let f: number, word: number;
      if (group === 0) { f = (b & c) | (~b & d); word = n; }
      else if (group === 1) { f = (d & b) | (~d & c); word = (5 * n + 1) % 16; }
      else if (group === 2) { f = b ^ c ^ d; word = (3 * n + 5) % 16; }
      else { f = c ^ (b | ~d); word = (7 * n) % 16; }
      const value = (a + f + constants[n] + bytes.readUInt32LE(offset + word * 4)) >>> 0;
      const shift = shifts[group][n % 4];
      [a, b, c, d] = [d, (b + ((value << shift) | (value >>> (32 - shift)))) >>> 0, b, c];
    }
    state = state.map((old, n) => (old + [a, b, c, d][n]) >>> 0);
  }
  const digest = Buffer.alloc(16);
  state.forEach((value, n) => digest.writeUInt32LE(value, n * 4));
  return digest.toString('hex').slice(-8).toUpperCase();
}

export async function requestGD<T>(params: Record<string, string>): Promise<T> {
  // Load the native client only when this channel is used. A missing library
  // must not prevent unrelated channels or application startup from working.
  let client: typeof import('impers');
  try { client = await import('impers'); }
  catch { throw new Error('GD音乐台请求组件未就绪，请检查原生请求组件或配置 LIBCURL_PATH'); }
  const session = new client.Session({
    impersonate: 'chrome150', timeout: 20,
    headers: { Referer: `${BASE}/`, Origin: BASE, 'X-Requested-With': 'XMLHttpRequest' },
  });
  try {
    let timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const time = await session.get(`${BASE}/time`, { timeout: 8 });
      if (time.status === 200 && /^\d+$/.test(time.text.trim())) timestamp = time.text.trim();
    } catch { /* Local time is also accepted if the time endpoint is unavailable. */ }
    const response = await session.get(`${BASE}/api.php`, {
      params: { ...params, source: 'netease', s: gdStudioSignature(params.types === 'search' ? params.name : params.id, timestamp) },
    });
    if (response.status === 403) throw new Error('GD音乐台暂时拦截了当前网络，请稍后重试或切换渠道');
    if (response.status === 429) throw new Error('GD音乐台请求过于频繁，请稍后重试');
    if (response.status !== 200) throw new Error(`GD音乐台返回异常状态（${response.status}），请稍后重试`);
    try { return response.json() as T; }
    catch { throw new Error('GD音乐台未返回有效数据，请稍后重试'); }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GD音乐台')) throw error;
    if (error instanceof Error && error.name === 'ImpersonateError') {
      throw new Error('GD音乐台原生请求库未就绪，请检查原生请求组件或配置 LIBCURL_PATH');
    }
    throw new Error('GD音乐台请求失败或超时，请稍后重试或切换渠道');
  } finally {
    await session.close();
  }
}
