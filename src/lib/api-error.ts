import axios from 'axios';

export function providerErrorMessage(error: unknown, fallback = '第三方渠道请求失败，请稍后重试或切换渠道') {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ENOTFOUND') return '渠道域名解析失败，请稍后重试或切换渠道';
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return '渠道请求超时，请稍后重试或切换渠道';
    if (error.response) return `第三方渠道返回异常状态（${error.response.status}），请稍后重试或切换渠道`;
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
