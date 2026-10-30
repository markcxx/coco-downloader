import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { providerErrorMessage } from '@/lib/api-error';
import { directAudioUrl } from '@/lib/download-url';

function parseExtra(value: string | null) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

// Resolve metadata only. Audio bytes are fetched by the user's browser.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get('id');
  if (!id) return NextResponse.json({ error: '缺少歌曲 ID' }, { status: 400 });

  try {
    const info = await getProvider(params.get('provider') || 'gdstudio-netease').getPlayInfo(id, parseExtra(params.get('extra')));
    const url = info?.url ? directAudioUrl(info.url) : undefined;
    if (!url) return NextResponse.json({ error: '无法获取可用的音频直链，请更换解析线路' }, { status: 404 });
    return NextResponse.json({ url, type: info.type, delivery: info.delivery || 'audio' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Download URL resolution failed:', error);
    const message = providerErrorMessage(error, '音频地址解析失败，请稍后重试或更换解析线路');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
