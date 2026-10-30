import axios from 'axios';

const BASE_URL = 'https://www.jbsou.cn/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';

// Handle the site's literal visit cookie without evaluating remote JavaScript.
// Some versions use PHPSESSID; the current site only requires mk_visit.
export async function createJbsouSession() {
  const cookies = new Map<string, string>();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await axios.get<string>(BASE_URL, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      responseType: 'text',
      timeout: 30000,
    });
    for (const value of response.headers['set-cookie'] || []) {
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    const html = response.data;
    const visit = html.match(/document\.cookie\s*=\s*["'](mk_visit=([^;"']+))/);
    if (visit) {
      cookies.set('mk_visit', visit[2]);
      continue;
    }
    if (/id=["']j-input["']/.test(html)) {
      return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    throw new Error('煎饼未返回搜索页面，请稍后重试');
  }
  throw new Error('煎饼访问会话初始化失败，请稍后重试');
}
