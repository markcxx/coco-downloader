import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { providerErrorMessage } from '@/lib/api-error';

function parseExtra(value: string | null) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const providerName = searchParams.get('provider') || 'gdstudio-netease';
  const extra = parseExtra(searchParams.get('extra'));

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const info = await getProvider(providerName).getPlayInfo(id, extra);
    return NextResponse.json(info);
  } catch (error) {
    return NextResponse.json({ error: providerErrorMessage(error) }, { status: 502 });
  }
}
