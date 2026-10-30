// Browser downloads always use HTTPS, including links from HTTP-only parsers.
export function directAudioUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') ||
      ['.localhost', '.local', '.internal', '.lan'].some(suffix => host.endsWith(suffix))) return undefined;
  url.protocol = 'https:';
  return url.href;
}
