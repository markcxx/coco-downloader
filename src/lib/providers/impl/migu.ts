import axios from 'axios';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const SEARCH_HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'activityid': 'v4_zt_2022_music',
  'appid': 'ce',
  'channel': '014X031',
  'connection': 'keep-alive',
  'deviceid': 'E60C6B2F-7F11-4362-9FCE-6F1CC86E0F18',
  'host': 'c.musicapp.migu.cn',
  'hwid': '',
  'imei': '',
  'h5page': '',
  'imsi': '',
  'location-info': '',
  'mgm-user-agent': '',
  'oaid': '',
  'uid': '',
  'location-data': '',
  'logid': 'h5page[1808]',
  'mgm-network-operators': '02',
  'mgm-network-standard': '03',
  'mgm-network-type': '03',
  'origin': 'https://y.migu.cn',
  'recommendstatus': '1',
  'referer': 'https://y.migu.cn/app/v4/zt/2022/music/index.html',
  'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'subchannel': '014X031',
  'test': '00',
  'ua': 'Android_migu',
  'version': '6.8.8',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
};

const MUSIC_QUALITIES: Record<string, PlayInfo['type']> = {
  LQ: 'mp3',
  PQ: 'mp3',
  HQ: 'mp3',
  SQ: 'flac',
  ZQ: 'flac',
  Z3D: 'flac',
  ZQ24: 'flac',
  ZQ32: 'flac',
};

type MiguRate = {
  formatType?: string;
  resourceType?: string;
  size?: string | number;
  iosSize?: string | number;
  androidSize?: string | number;
};

type MiguSinger = {
  name?: string;
};

type MiguAlbum = {
  name?: string;
};

type MiguImage = {
  img?: string;
};

type MiguSong = {
  contentId?: string;
  copyrightId?: string;
  name?: string;
  singers?: MiguSinger[];
  albums?: MiguAlbum[];
  imgItems?: MiguImage[];
  rateFormats?: MiguRate[];
  newRateFormats?: MiguRate[];
};

type MiguSearchResponse = {
  songResultData?: {
    result?: MiguSong[];
  };
};

function parseSize(value: unknown): number {
  const raw = String(value ?? '').replace('MB', '').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function buildSearchUrl(keyword: string, pageNo = 1, pageSize = 20) {
  const searchSwitch = "{'song': 1, 'album': 0, 'singer': 0, 'tagSong': 1, 'mvSong': 0, 'bestShow': 1}";
  const params = new URLSearchParams({
    text: keyword,
    pageNo: String(pageNo),
    pageSize: String(pageSize),
    isCopyright: '1',
    sort: '1',
    searchSwitch,
  });
  return `https://c.musicapp.migu.cn/v1.0/content/search_all.do?${params.toString()}`;
}

function buildListenUrl(contentId: string, copyrightId: string, resourceType: string, toneFlag: string) {
  return (
    'https://c.musicapp.migu.cn/MIGUM3.0/strategy/listen-url/v2.4' +
    `?resourceType=${resourceType}` +
    '&netType=01' +
    '&scene=' +
    `&toneFlag=${toneFlag}` +
    `&contentId=${contentId}` +
    `&copyrightId=${copyrightId}` +
    `&lowerQualityContentId=${contentId}`
  );
}

function fallbackUrl(contentId: string, copyrightId: string, toneFlag: string, resourceType: string) {
  return (
    'https://app.pd.nf.migu.cn/MIGUM3.0/v1.0/content/sub/listenSong.do' +
    `?channel=mx&copyrightId=${copyrightId}` +
    `&contentId=${contentId}` +
    `&toneFlag=${toneFlag}` +
    `&resourceType=${resourceType}` +
    '&userId=15548614588710179085069' +
    '&netType=00'
  );
}

function buildId(contentId?: string, copyrightId?: string) {
  if (!contentId || !copyrightId) return '';
  return `${contentId}_${copyrightId}`;
}

function parseId(id: string) {
  const [contentId, copyrightId] = id.split('_');
  return { contentId, copyrightId };
}

export class MiguProvider implements MusicProvider {
  name = 'migu';

  async search(query: string): Promise<MusicItem[]> {
    try {
      const url = buildSearchUrl(query);
      const { data } = await axios.get<MiguSearchResponse>(url, { headers: SEARCH_HEADERS, timeout: 15000 });
      const list = data?.songResultData?.result || [];
      return list
        .map((item) => {
          const contentId = item?.contentId;
          const copyrightId = item?.copyrightId;
          const id = buildId(contentId, copyrightId);
          const artist = (item?.singers || [])
            .filter((s) => s && s.name)
            .map((s) => s.name)
            .join(', ');
          const album = (item?.albums || [])
            .filter((a) => a && a.name)
            .map((a) => a.name)
            .join(', ');
          const coverItems = item?.imgItems || [];
          const cover = coverItems.length ? coverItems[coverItems.length - 1]?.img : undefined;
          return {
            id,
            title: item?.name || '未知歌曲',
            artist: artist || '未知歌手',
            album: album || undefined,
            cover,
            provider: this.name,
          } as MusicItem;
        })
        .filter((item: MusicItem) => item.id);
    } catch (error) {
      console.error('Migu search error:', error);
      return [];
    }
  }

  async getPlayInfo(id: string, quality?: 'standard' | 'high' | 'lossless'): Promise<PlayInfo> {
    try {
      const { contentId, copyrightId } = parseId(id);
      if (!contentId || !copyrightId) {
        throw new Error('Invalid id');
      }
      const { data } = await axios.get<MiguSearchResponse>(buildSearchUrl(contentId, 1, 1), {
        headers: SEARCH_HEADERS,
        timeout: 15000,
      });
      const list = data?.songResultData?.result || [];
      const song = list.find((item) => item?.contentId === contentId) || list[0];
      if (!song) {
        throw new Error('Song not found');
      }
      const rateFormats: MiguRate[] = (song.rateFormats || []).concat(song.newRateFormats || []);
      const sorted = rateFormats
        .filter((rate) => rate && rate.formatType && rate.resourceType)
        .sort((a, b) => parseSize(b.size ?? b.iosSize ?? b.androidSize) - parseSize(a.size ?? a.iosSize ?? a.androidSize));
      for (const rate of sorted) {
        try {
          const url = buildListenUrl(contentId, copyrightId, rate.resourceType as string, rate.formatType as string);
          const response = await axios.get(url, { headers: SEARCH_HEADERS, timeout: 15000 });
          const info = response.data || {};
          const urlFromApi = info?.data?.url || fallbackUrl(contentId, copyrightId, rate.formatType as string, rate.resourceType as string);
          if (!urlFromApi) {
            continue;
          }
          const fixedUrl = urlFromApi.replace(/(?<=\/)MP3_128_16_Stero(?=\/)/, 'MP3_320_16_Stero');
          const type = MUSIC_QUALITIES[rate.formatType as string] || 'mp3';
          return {
            url: fixedUrl,
            type,
            bitrate: rate.formatType,
          };
        } catch {
          continue;
        }
      }
      throw new Error('Failed to get play url');
    } catch (error) {
      console.error('Migu getPlayInfo error:', error);
      throw error;
    }
  }
}
