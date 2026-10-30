import axios from 'axios';

const BASE_URL = 'https://www.jbsou.cn/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36';

export async function bootstrapJianbinSession() {
  const cookies = new Map<string, string>();
  const absorbCookies = (values: string[] | undefined) => {
    for (const value of values || []) {
      const pair = value.split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  };
  const serialize = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  const response = await axios.get<string>(BASE_URL, {
    headers: { 'user-agent': USER_AGENT }, timeout: 15000, responseType: 'text',
  });
  absorbCookies(response.headers['set-cookie']);
  const visitor = response.data.match(/document\.cookie\s*=\s*["']mk_visit=([A-Za-z0-9_-]+);/);
  if (visitor) {
    cookies.set('mk_visit', visitor[1]);
    const initialized = await axios.get(BASE_URL, {
      headers: { 'user-agent': USER_AGENT, cookie: serialize() }, timeout: 15000,
    });
    absorbCookies(initialized.headers['set-cookie']);
  }
  if (!cookies.size) throw new Error('煎饼渠道暂时无法建立访客会话，请稍后重试');
  return serialize();
}
