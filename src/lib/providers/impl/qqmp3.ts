import axios from 'axios';
import { MusicItem, MusicProvider, PlayInfo } from '@/types/music';

const HEADERS = {
  'accept': '*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'origin': 'https://www.qqmp3.vip',
  'priority': 'u=1, i',
  'referer': 'https://www.qqmp3.vip/',
  'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
};

interface SearchResponseItem {
  artist: string;
  downurl: string[];
  name: string;
  pic: string;
  rid: string;
}

interface DetailResponse {
  code: number;
  data: {
    lrc: string;
    url: string;
    processing_time: string;
  };
  msg: string;
}

export class QQMp3Provider implements MusicProvider {
  name = 'qqmp3';

  async search(query: string): Promise<MusicItem[]> {
    try {
      const { data } = await axios.get('https://api.qqmp3.vip/api/songs.php', {
        headers: HEADERS,
        params: {
          type: 'search',
          keyword: query,
        },
      });

      // API returns { data: [...] }
      const list = data?.data;
      if (!Array.isArray(list)) {
        return [];
      }

      return list.map((item: SearchResponseItem) => ({
        id: item.rid,
        title: item.name,
        artist: item.artist,
        cover: item.pic,
        provider: this.name,
        extra: {
            lrc: null // Will be fetched in getPlayInfo
        }
      }));
    } catch (error) {
      console.error('QQMp3 search error:', error);
      return [];
    }
  }

  async getPlayInfo(id: string, extra?: unknown): Promise<PlayInfo> {
    void extra;
    try {
      const { data } = await axios.get<DetailResponse>('https://api.qqmp3.vip/api/kw.php', {
        headers: HEADERS,
        params: {
          rid: id,
          type: 'json',
          level: 'exhigh',
          lrc: 'true',
        },
      });

      if (data.code === 200 && data.data && data.data.url) {
        return {
          url: data.data.url,
          type: 'mp3', // Default to mp3 as extension might not be in URL or tricky to parse
          cover: undefined, // Already have cover from search
        };
      }
      
      throw new Error('Failed to get play info');
    } catch (error) {
      console.error('QQMp3 getPlayInfo error:', error);
      throw error;
    }
  }
}
