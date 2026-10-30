export type MusicChannel = {
  id: string;
  name: string;
  description: string;
  badges: string[];
  download: 'direct' | 'browser' | 'source-page';
  preview: boolean;
};

export type MusicPlatform = {
  id: string;
  name: string;
  channels: MusicChannel[];
  unavailableReason?: string;
};

export const MUSIC_PLATFORMS: MusicPlatform[] = [
  {
    id: 'netease', name: '网易云音乐', channels: [
      { id: 'netease', name: 'Meting', description: '搜索网易云曲库，支持标准、极高和无损音质。', badges: ['可批量下载'], download: 'direct', preview: true },
      { id: 'gdstudio-netease', name: 'GD音乐台', description: '搜索网易云曲库，支持在线播放和多音质下载。可用音质以歌曲实际返回为准。', badges: ['可批量下载'], download: 'direct', preview: true },
      { id: 'at38-netease', name: '51ape', description: '搜索网易云曲库，支持在线播放与下载。', badges: ['可批量下载'], download: 'direct', preview: true },
      { id: 'jianbin-netease', name: '煎饼', description: '搜索网易云曲库，支持在线播放与下载。', badges: ['可批量下载'], download: 'direct', preview: true },
    ],
  },
  {
    id: 'qq', name: 'QQ音乐', channels: [
      { id: 'qq', name: 'VKeys', description: '搜索 QQ 音乐曲库，下载优先选择高音质。', badges: ['可批量下载'], download: 'direct', preview: true },
      { id: 'at38-qq', name: '51ape', description: '搜索 QQ 音乐曲库，支持在线播放与下载。', badges: ['可批量下载'], download: 'direct', preview: true },
      { id: 'jianbin-qq', name: '煎饼', description: '搜索 QQ 音乐曲库，支持在线播放与下载。', badges: ['可批量下载'], download: 'direct', preview: true },
    ],
  },
  {
    id: 'kugou', name: '酷狗音乐', channels: [
      { id: 'jianbin-kugou', name: '煎饼', description: '搜索酷狗曲库，支持在线播放与下载。', badges: ['可批量下载'], download: 'direct', preview: true },
      { id: 'kugou', name: '90svip', description: '搜索酷狗曲库，支持在线播放与下载。', badges: ['可批量下载'], download: 'direct', preview: true },
    ],
  },
  {
    id: 'kuwo', name: '酷我音乐', channels: [
      { id: 'bodian', name: '波点 · 天宝', description: '搜索酷我曲库，支持在线播放。下载需逐首交给浏览器处理。', badges: ['浏览器下载', '网页不支持批量'], download: 'browser', preview: true },
      { id: 'qqmp3', name: '米兔（QQMP3）', description: '搜索酷我曲库，支持在线播放。下载需逐首交给浏览器处理。', badges: ['浏览器下载', '网页不支持批量'], download: 'browser', preview: true },
      { id: 'jianbin-kuwo', name: '煎饼', description: '搜索酷我曲库，支持在线播放。下载需逐首交给浏览器处理。', badges: ['浏览器下载', '网页不支持批量'], download: 'browser', preview: true },
      { id: 'gequhai', name: '歌曲海', description: '搜索歌曲海曲库，支持在线播放。下载需逐首交给浏览器处理。', badges: ['浏览器下载', '网页不支持批量'], download: 'browser', preview: true },
      { id: 'gequke', name: '歌曲客', description: '搜索歌曲客曲库，使用酷我 MP3 直链播放。下载需逐首交给浏览器处理。', badges: ['MP3直链', '浏览器下载', '网页不支持批量'], download: 'browser', preview: true },
      { id: 'livepoo', name: '力音 · 网盘下载', description: '通过源站提供的网盘入口保存歌曲，不支持试听或自动批量下载。', badges: ['前往源站', '不支持试听 / 批量'], download: 'source-page', preview: false },
    ],
  },
  { id: 'migu', name: '咪咕音乐', channels: [], unavailableReason: '暂无可用渠道，请选择其他音乐平台。' },
];

export function getMusicChannel(id: string) {
  return MUSIC_PLATFORMS.flatMap(platform => platform.channels).find(channel => channel.id === id);
}

export function getMusicPlatform(channelId: string) {
  return MUSIC_PLATFORMS.find(platform => platform.channels.some(channel => channel.id === channelId));
}

export function supportsBatchDownload(id: string) {
  return getMusicChannel(id)?.download === 'direct';
}
