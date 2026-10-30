import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { getMusicPlatform } from '@/lib/music-channels';
import { NeteaseLyrics } from '@/lib/lyrics/netease';
import { QQLyrics } from '@/lib/lyrics/qq';
import { KugouLyrics } from '@/lib/lyrics/kugou';
import { KuwoLyrics } from '@/lib/lyrics/kuwo';
import type { LyricData } from '@/types/music';

export async function GET(request: NextRequest) {
  const params=request.nextUrl.searchParams;
  const id=params.get('id'), channel=params.get('provider') || 'gdstudio-netease';
  if (!id) return NextResponse.json({error:'缺少歌曲 ID'},{status:400});
  try {
    const provider=getProvider(channel) as { getLyric?: (id:string,extra?:unknown)=>Promise<LyricData> };
    const platform=getMusicPlatform(channel)?.id;
    let songId=channel.startsWith('at38-') || channel==='gdstudio-netease' ? id : '';
    if(channel.startsWith('jianbin-')) {
      try {
        const url=new URL(decodeURIComponent(decodeURIComponent(id)));
        const expected:Record<string,string>={netease:'wy',qq:'qq',kugou:'kg',kuwo:'kw'};
        if(url.hostname==='www.jbsou.cn' && url.searchParams.get('type')===expected[platform || '']) songId=url.searchParams.get('id') || '';
      } catch { /* Fall back to embedded lyrics without searching metadata. */ }
    }
    if(songId) {
      const client=platform==='netease'?new NeteaseLyrics():platform==='qq'?new QQLyrics():platform==='kugou'?new KugouLyrics():new KuwoLyrics();
      try { const lyric=await client.getLyric(songId); if(lyric.lrc || lyric.lines.length) return NextResponse.json({...lyric,songid:id,provider:channel}); } catch { /* Try selected channel's embedded lyric. */ }
    }
    if(provider.getLyric) return NextResponse.json(await provider.getLyric(id));
    return NextResponse.json({songid:id,provider:channel,lines:[],lrc:''});
  } catch { return NextResponse.json({error:'歌词暂时无法获取'},{status:502}); }
}
