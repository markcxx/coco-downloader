import { audioMimeFromSignature } from '@/lib/audio-signature';

export class BrowserDirectDownloadError extends Error {}

type Progress = (percent: number, receivedBytes: number, totalBytes?: number) => void;

// The timer bounds waiting for headers and stalled transfers, not total file time.
export async function fetchAudioBlob(url: string, progress: Progress, firstByteTimeout = 30000) {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), firstByteTimeout);
  const refreshTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), 30000);
  };
  try {
    const response = await fetch(url, { credentials: 'omit', signal: controller.signal });
    refreshTimer();
    if (!response.ok || !response.body) {
      const failure = await response.json().catch(() => null);
      throw new Error(failure?.error || `下载失败（${response.status}）`);
    }
    let type = (response.headers.get('content-type') || '').toLowerCase();
    const mislabeled = type.split(';', 1)[0].trim() === 'application/x-www-form-urlencoded';
    if (!type.startsWith('audio/') && !type.includes('application/octet-stream') && !mislabeled) {
      await response.body.cancel();
      throw new Error('来源未返回音频文件');
    }
    const total = response.headers.get('content-encoding') ? 0 : Number(response.headers.get('content-length'));
    progress(0, 0, total > 0 ? total : undefined);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    const reader = response.body.getReader();
    let signature = new Uint8Array(0);
    let signatureChecked = !mislabeled;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        refreshTimer();
        if (!signatureChecked) {
          const prefix = value.subarray(0, Math.max(0, 12 - signature.length));
          const combined = new Uint8Array(signature.length + prefix.length);
          combined.set(signature);
          combined.set(prefix, signature.length);
          signature = combined;
          if (signature.length >= 12) {
            const detectedType = audioMimeFromSignature(signature);
            if (!detectedType) {
              await reader.cancel();
              throw new Error('来源未返回可识别的音频文件，请更换渠道');
            }
            type = detectedType;
            signatureChecked = true;
          }
        }
        received += value.byteLength;
        chunks.push(new Uint8Array(value));
        progress(total > 0 ? Math.min(99, received / total * 100) : 0, received, total > 0 ? total : undefined);
      }
    } finally {
      reader.releaseLock();
    }
    if (!signatureChecked) throw new Error('来源未返回可识别的音频文件，请更换渠道');
    if (!received || (total > 0 && received !== total)) throw new Error('音频文件接收不完整，请重试');
    return new Blob(chunks, { type });
  } catch (error) {
    if (controller.signal.aborted) throw new BrowserDirectDownloadError('网页直连超时，可交给浏览器处理；网页无法跟踪后续进度');
    if (error instanceof TypeError) throw new BrowserDirectDownloadError('网页无法读取此音源，可交给浏览器处理；网页无法跟踪后续进度');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
