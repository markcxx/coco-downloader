import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/search-preferences.ts', 'utf8');
function load(localStorage) {
  const context = { exports: {}, ...(localStorage ? { window: { localStorage } } : {}) };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
function store(values = {}) {
  return { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = value; } };
}
const item = provider => ({ id: '123', provider, title: 'Song', artist: 'Artist' });

test('history validates values, trims, deduplicates and limits records', () => {
  const h = load(store({ 'coco-search-history': JSON.stringify([' A ', null, 5, {}, 'A', '', ' B ', ...Array.from({ length: 110 }, (_, n) => `term${n}`)]) }));
  const history = h.readSearchHistory();
  assert.equal(history.length, 100);
  assert.deepEqual(Array.from(history.slice(0, 2)), ['A', 'B']);
});

test('corrupt or incorrectly shaped storage safely falls back', () => {
  for (const value of ['{broken', 'null', '{}', '42']) {
    const h = load(store({ 'coco-search-history': value, 'coco-playlist': value }));
    assert.equal(h.readSearchHistory().length, 0);
    assert.equal(h.readPlaylist().length, 0);
  }
  const h = load(store({ 'coco-playlist': JSON.stringify([null, {}, { ...item('qq'), cover: {} }, item('qq')]) }));
  assert.equal(h.readPlaylist().length, 1);
});

test('playlist identity preserves different providers and removes only true duplicates', () => {
  const h = load(store({ 'coco-playlist': JSON.stringify([item('netease'), item('qq'), item('qq')]) }));
  assert.equal(h.samePlaylistSong(item('netease'), item('qq')), false);
  const playlist = h.readPlaylist();
  assert.equal(playlist.length, 2);
  const remaining = playlist.filter(song => !h.samePlaylistSong(song, item('qq')));
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].provider, 'netease');
});

test('provider restores valid channels and falls back for removed or invalid channels', () => {
  assert.equal(load(store({ 'coco-search-provider': 'qq' })).readSearchProvider(['qq', 'netease'], 'netease'), 'qq');
  for (const value of ['removed', '', '{}']) assert.equal(load(store({ 'coco-search-provider': value })).readSearchProvider(['qq', 'netease'], 'netease'), 'netease');
});

test('storage failure, access denial and SSR cannot interrupt the page', () => {
  const h = load({ getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } });
  assert.equal(h.readPlaylist().length, 0);
  assert.equal(h.readSearchHistory().length, 0);
  assert.equal(h.readSearchProvider(['qq'], 'qq'), 'qq');
  assert.doesNotThrow(() => h.savePreference('test', []));
  assert.doesNotThrow(() => h.saveSearchProvider('qq'));
  const denied = {};
  Object.defineProperty(denied, 'localStorage', { get() { throw Error('SecurityError'); } });
  const context = { exports: {}, window: denied };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  assert.equal(context.exports.readPlaylist().length, 0);
  assert.doesNotThrow(() => context.exports.saveSearchProvider('qq'));
  const server = load();
  assert.equal(server.readSearchHistory().length, 0);
  assert.doesNotThrow(() => server.savePreference('test', []));
});

test('search request includes the selected channel', async () => {
  const page = fs.readFileSync('src/app/page.tsx', 'utf8');
  const ast = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'fetchSearchPage') declaration = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let requested;
  const context = { URLSearchParams, query: 'test', provider: 'qq', fetchJson: async url => { requested = url; return { items: [] }; } };
  vm.runInNewContext(ts.transpileModule(`const ${declaration};globalThis.search = fetchSearchPage;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await context.search(0);
  assert.equal(new URL(requested, 'https://local').searchParams.get('provider'), 'qq');
});
