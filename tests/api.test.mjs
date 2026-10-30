import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Compile the real route handler with deterministic network adapters.
function loadRoute(name, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(`src/app/api/${name}/route.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, URL, console: { error() {} }, require(id) {
    if (id === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  }};
  vm.runInNewContext(code, context);
  return context.exports.GET;
}
const request = query => ({ nextUrl: new URL(`https://local/api?${query}`) });
const errors = { providerErrorMessage: error => error.message };

test('search passes native query and clamps pagination to the selected channel', async () => {
  let args;
  const handler = loadRoute('search', {
    '@/lib/providers': { getProvider(name) { assert.equal(name, 'at38-qq'); return { async search(...values) { args = values; return [{ id: 'native-id' }]; } }; } },
    '@/lib/api-error': errors,
  });
  const result = await handler(request('q=test&provider=at38-qq&limit=500&offset=-1'));
  assert.deepEqual(args, ['test', 50, 0]);
  assert.equal(result.body.items[0].id, 'native-id');
});

test('official search requests are rejected without calling any provider', async () => {
  const handler = loadRoute('search', {
    '@/lib/providers': { getProvider() { throw new Error('must not be called'); } }, '@/lib/api-error': errors,
  });
  assert.equal((await handler(request('q=test&source=official'))).status, 400);
});

test('missing search query is rejected before network work', async () => {
  const handler = loadRoute('search', { '@/lib/providers': {}, '@/lib/api-error': errors });
  assert.equal((await handler(request('provider=at38-qq'))).status, 400);
});

test('download resolves the selected native ID and preserves source-page delivery', async () => {
  let resolved;
  const handler = loadRoute('download', {
    '@/lib/providers': { getProvider(name) { assert.equal(name, 'livepoo'); return { async getPlayInfo(id, extra) { resolved = [id, extra]; return { url: 'https://www.livepoo.cn/music/123', type: '', delivery: 'source-page' }; } }; } },
    '@/lib/api-error': errors, '@/lib/download-url': { directAudioUrl: url => url },
  });
  const result = await handler(request(`provider=livepoo&id=123&extra=${encodeURIComponent(JSON.stringify({ level: 'standard' }))}`));
  assert.equal(result.body.delivery, 'source-page');
  assert.equal(resolved[0], '123');
  assert.equal(resolved[1].level, 'standard');
});

test('failed download resolution is reported as failure', async () => {
  const handler = loadRoute('download', {
    '@/lib/providers': { getProvider() { throw new Error('channel unavailable'); } },
    '@/lib/api-error': errors, '@/lib/download-url': {},
  });
  const result = await handler(request('id=123&provider=removed'));
  assert.equal(result.status, 502);
  assert.equal(result.body.error, 'channel unavailable');
});

function lyricRoute(primary, embedded) {
  class Lyrics { async getLyric(id) { return primary(id); } }
  return loadRoute('lyric', {
    '@/lib/providers': { getProvider() { return { getLyric: embedded }; } },
    '@/lib/music-channels': { getMusicPlatform: () => ({ id: 'netease' }) },
    '@/lib/lyrics/netease': { NeteaseLyrics: Lyrics }, '@/lib/lyrics/qq': {},
    '@/lib/lyrics/kugou': {}, '@/lib/lyrics/kuwo': {},
  });
}

test('known channel ID fetches lyrics directly without metadata searching', async () => {
  const handler = lyricRoute(id => { assert.equal(id, '123'); return { lrc: '[00:01]hello', lines: [] }; }, () => { throw new Error('unexpected fallback'); });
  const result = await handler(request('provider=at38-netease&id=123'));
  assert.equal(result.body.lrc, '[00:01]hello');
  assert.equal(result.body.provider, 'at38-netease');
});

test('lyric failure falls back to the selected channel', async () => {
  const handler = lyricRoute(() => { throw new Error('offline'); }, async id => ({ songid: id, lrc: '[00:02]fallback', lines: [] }));
  assert.equal((await handler(request('provider=at38-netease&id=123'))).body.lrc, '[00:02]fallback');
});

test('Web playback resolves through the selected original channel with playback hints', async () => {
  let resolved;
  const handler = loadRoute('url', {
    '@/lib/providers': { getProvider(name) { assert.equal(name, 'qq'); return { async getPlayInfo(id, extra) { resolved = [id, extra]; return { url: 'https://audio.example/song.mp3', type: 'mp3' }; } }; } },
    '@/lib/api-error': errors,
  });
  const result = await handler(request(`id=mid&provider=qq&extra=${encodeURIComponent(JSON.stringify({ usage: 'playback' }))}`));
  assert.equal(result.status, 200);
  assert.equal(result.body.url, 'https://audio.example/song.mp3');
  assert.equal(resolved[0], 'mid');
  assert.equal(resolved[1].usage, 'playback');
});

test('missing playback ID is rejected before contacting a channel', async () => {
  const handler = loadRoute('url', { '@/lib/providers': {}, '@/lib/api-error': errors });
  assert.equal((await handler(request('provider=qq'))).status, 400);
});

const queueModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/player-queue.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, queueModule);
const { queueOrder, adjacentIndex } = queueModule.exports;

test('sequential queue stops at boundaries and supports manual previous/next', () => {
  for (const mode of ['order', 'single']) {
    const order = queueOrder(3, 1, mode);
    assert.equal(adjacentIndex(order, 0, -1), -1);
    assert.equal(adjacentIndex(order, 1, -1), 0);
    assert.equal(adjacentIndex(order, 1, 1), 2);
    assert.equal(adjacentIndex(order, 2, 1), -1);
  }
  assert.equal(adjacentIndex([], 0, 1), -1);
});

test('shuffle keeps current track first and visits each other track exactly once', () => {
  const order = queueOrder(8, 3, 'shuffle');
  assert.equal(order[0], 3);
  assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(adjacentIndex(order, 3, -1), -1);
  assert.equal(adjacentIndex(order, 3, 1), order[1]);
  assert.equal(adjacentIndex(order, order.at(-1), 1), -1);
});
