/** Identify supported audio containers without trusting a CDN's MIME header. */
export function audioMimeFromSignature(bytes: Uint8Array): string | undefined {
  const matches = (offset: number, text: string) =>
    bytes.length >= offset + text.length && [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  if (bytes.length >= 10 && matches(0, 'ID3') && bytes[3] >= 2 && bytes[3] <= 4 &&
      [6, 7, 8, 9].every(index => bytes[index] < 128)) return 'audio/mpeg';
  if (matches(0, 'fLaC')) return 'audio/flac';
  if (matches(0, 'OggS')) return 'audio/ogg';
  if (matches(0, 'RIFF') && matches(8, 'WAVE')) return 'audio/wav';
  if (matches(4, 'ftyp')) return 'audio/mp4';
  if (bytes.length >= 4 && bytes[0] === 255 && (bytes[1] & 224) === 224 &&
      (bytes[1] & 24) !== 8 && (bytes[1] & 6) !== 0 &&
      (bytes[2] & 240) !== 0 && (bytes[2] & 240) !== 240 && (bytes[2] & 12) !== 12) return 'audio/mpeg';
  return undefined;
}
