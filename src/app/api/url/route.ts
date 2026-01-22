import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const providerName = searchParams.get('provider') || 'gequbao';

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const provider = getProvider(providerName);
    const info = await provider.getPlayInfo(id);
    return NextResponse.json(info);
  } catch {
    return NextResponse.json({ error: 'Failed to get url' }, { status: 500 });
  }
}
