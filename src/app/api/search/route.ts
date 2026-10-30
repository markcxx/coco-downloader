import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { providerErrorMessage } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get('q');
  const providerName = searchParams.get('provider');
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 50);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  if (!q) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const resolvedProviderName =
    providerName && providerName !== 'all' ? providerName : 'gdstudio-netease';
  try {
    if (searchParams.has('source') && searchParams.get('source') !== 'channel') return NextResponse.json({error:'不支持该搜索来源'}, {status:400});
    const items = await getProvider(resolvedProviderName).search(q, limit, offset);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: providerErrorMessage(error) }, { status: 502 });
  }
}
