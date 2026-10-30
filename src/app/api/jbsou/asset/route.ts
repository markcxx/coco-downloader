import axios from 'axios';
import { createJbsouSession } from '@/lib/providers/jbsou-session';
import { NextRequest, NextResponse } from 'next/server';

const REQUEST_TIMEOUT = 30000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';
const SESSION_POOL_SIZE = 4;
const SESSION_RETRY_LIMIT = 2;
const sessionCookies: Array<string | undefined> = Array(SESSION_POOL_SIZE);
const sessionPromises: Array<Promise<string> | undefined> = Array(SESSION_POOL_SIZE);
const sessionQueues: Array<Promise<void>> = Array.from(
  { length: SESSION_POOL_SIZE },
  () => Promise.resolve()
);
let sessionCursor = 0;

function parseAssetUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'www.jbsou.cn' ||
      url.pathname !== '/api.php' ||
      url.searchParams.get('get') !== 'pic'
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextSessionSlot() {
  const slot = sessionCursor % SESSION_POOL_SIZE;
  sessionCursor += 1;
  return slot;
}

async function requestNewSession() {
  let lastError: unknown;
  for (let attempt = 0; attempt <= SESSION_RETRY_LIMIT; attempt += 1) {
    try {
      return await createJbsouSession();
    } catch (error) {
      lastError = error;
      if (attempt < SESSION_RETRY_LIMIT) await delay(200 * (attempt + 1));
    }
  }
  throw lastError || new Error('Failed to initialize JBSou session');
}

async function getSessionCookie(slot: number, forceRefresh = false) {
  if (forceRefresh) {
    sessionCookies[slot] = undefined;
    sessionPromises[slot] = undefined;
  }
  if (sessionCookies[slot]) return sessionCookies[slot];
  if (!sessionPromises[slot]) {
    sessionPromises[slot] = requestNewSession()
      .then((cookie) => {
        sessionCookies[slot] = cookie;
        return cookie;
      })
      .finally(() => {
        sessionPromises[slot] = undefined;
      });
  }
  return sessionPromises[slot];
}

export async function GET(request: NextRequest) {
  const assetUrl = parseAssetUrl(request.nextUrl.searchParams.get('url'));
  if (!assetUrl) {
    return NextResponse.json({ error: 'Invalid JBSou asset url' }, { status: 400 });
  }

  const slot = nextSessionSlot();
  const previousRequest = sessionQueues[slot];
  let releaseSlot!: () => void;
  sessionQueues[slot] = new Promise<void>((resolve) => {
    releaseSlot = resolve;
  });

  try {
    await previousRequest;
    let response;
    let lastError: unknown;
    for (let attempt = 0; attempt <= SESSION_RETRY_LIMIT; attempt += 1) {
      try {
        const cookie = await getSessionCookie(slot, attempt === SESSION_RETRY_LIMIT);
        response = await axios.get<ArrayBuffer>(assetUrl, {
          headers: { cookie, 'user-agent': USER_AGENT },
          maxRedirects: 5,
          responseType: 'arraybuffer',
          timeout: REQUEST_TIMEOUT,
        });
        break;
      } catch (error) {
        lastError = error;
        if (attempt < SESSION_RETRY_LIMIT) await delay(200 * (attempt + 1));
      }
    }
    if (!response) throw lastError || new Error('Failed to request JBSou asset');
    const contentType = String(response.headers['content-type'] || '');
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error('JBSou returned a non-image response');
    }

    return new NextResponse(response.data, {
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Length': String(response.data.byteLength),
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('JBSou asset proxy error:', error);
    return NextResponse.json({ error: 'Failed to load JBSou asset' }, { status: 502 });
  } finally {
    releaseSlot();
  }
}
