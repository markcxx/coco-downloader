import axios from 'axios';
import type { Agent } from 'https';
import type { Readable } from 'stream';
import { audioMimeFromSignature } from '@/lib/audio-signature';

const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav']);

type ValidateAudioLinkOptions = {
  headers?: Record<string, string>;
  httpsAgent?: Agent;
  timeout?: number;
  verifyMislabeledAudio?: boolean;
};

function responseUrl(response: unknown, fallback: string) {
  const value = response as { request?: { res?: { responseUrl?: string } } };
  return value.request?.res?.responseUrl || fallback;
}

function urlExtension(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return pathname.includes('.') ? pathname.split('.').pop()?.toLowerCase() || '' : '';
  } catch {
    return '';
  }
}

export async function validateAudioLink(url: string, options: ValidateAudioLinkOptions = {}) {
  const response = await axios.get(url, {
    headers: {
      Range: options.verifyMislabeledAudio ? 'bytes=0-4095' : 'bytes=0-1',
      ...options.headers,
    },
    httpsAgent: options.httpsAgent,
    maxRedirects: 5,
    responseType: 'stream',
    timeout: options.timeout || 15000,
  });
  const finalUrl = responseUrl(response, url);
  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  const isAudioType = contentType.startsWith('audio/') || contentType.includes('application/octet-stream');
  const stream = response.data as Readable;
  let detectedType: string | undefined;
  try {
    if (!isAudioType && options.verifyMislabeledAudio &&
        contentType.split(';', 1)[0].trim() === 'application/x-www-form-urlencoded') {
      let prefix = Buffer.alloc(0);
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        prefix = Buffer.concat([prefix, bytes.subarray(0, 4096 - prefix.length)]);
        if (prefix.length >= 12) break;
      }
      detectedType = audioMimeFromSignature(prefix);
      console.warn('Audio link MIME mismatch', {
        host: new URL(finalUrl).hostname,
        status: response.status,
        contentType,
        detectedType: detectedType || 'unrecognized',
        inspectedBytes: prefix.length,
      });
    }
  } finally {
    stream.destroy();
  }
  if (detectedType) return { url: finalUrl, contentType: detectedType };
  if (contentType && !isAudioType) {
    throw new Error(`Non-audio content type: ${contentType}`);
  }
  if (!contentType && !AUDIO_EXTENSIONS.has(urlExtension(finalUrl))) {
    throw new Error('Audio response has no recognizable content type or extension');
  }
  return { url: finalUrl, contentType };
}
