import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadSource(path, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, ...globals, require(id) {
    return id in dependencies ? dependencies[id] : require(id);
  }};
  vm.runInNewContext(code, context);
  return context.exports;
}
const key = 'coco-download-tasks';
function task(status, extra = {}) {
  return { id: status, status, fileName: 'song.mp3', progress: 0, startTime: 1,
    musicItem: { id: 'song', title: `Song ${status}`, artist: 'Artist', provider: 'qq' }, ...extra };
}
function storage(initial) {
  const data = new Map(initial === undefined ? [] : [[key, initial]]);
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
function loadHistory(localStorage) {
  return loadSource('src/lib/download-history.ts', {}, { window: { localStorage } });
}

test('refresh restores finished records and actionable browser links, excluding in-flight transfers', () => {
  const store = storage();
  const history = loadHistory(store);
  history.saveDownloadTasks(['pending', 'downloading', 'browser-ready', 'completed', 'error', 'handed-off'].map(s => task(s)));
  assert.deepEqual(Array.from(history.readDownloadTasks(), t => t.status), ['browser-ready', 'completed', 'error', 'handed-off']);
  assert.equal(loadHistory(store).readDownloadTasks().length, 4);
});

test('deleting one record and clearing history survive a refresh without losing actionable links', () => {
  const store = storage();
  const history = loadHistory(store);
  history.saveDownloadTasks([task('completed'), task('error'), task('browser-ready')]);
  history.saveDownloadTasks(history.readDownloadTasks().filter(t => t.status !== 'error'));
  assert.deepEqual(Array.from(loadHistory(store).readDownloadTasks(), t => t.status), ['completed', 'browser-ready']);
  history.saveDownloadTasks(history.readDownloadTasks().filter(t => !history.isDownloadHistory(t)));
  assert.deepEqual(Array.from(loadHistory(store).readDownloadTasks(), t => t.status), ['browser-ready']);
  history.saveDownloadTasks([]);
  assert.equal(store.getItem(key), null);
  assert.equal(loadHistory(store).readDownloadTasks().length, 0);
});

test('corrupt JSON and invalid stored task shapes do not crash the download list', () => {
  for (const saved of ['{broken', 'null', '{}', '42']) {
    assert.equal(loadHistory(storage(saved)).readDownloadTasks().length, 0);
  }
  const invalid = [null, {}, task('pending'), task('completed', { musicItem: null }), task('error', { error: {} }), task('completed', { progress: 'NaN' })];
  const history = loadHistory(storage(JSON.stringify([...invalid, task('completed')])));
  assert.equal(history.readDownloadTasks().length, 1);
});

test('denied storage access, quota exhaustion and server rendering remain safe', () => {
  const denied = { get localStorage() { throw new Error('SecurityError'); } };
  const history = loadSource('src/lib/download-history.ts', {}, { window: denied });
  assert.equal(history.readDownloadTasks().length, 0);
  assert.doesNotThrow(() => history.saveDownloadTasks([task('completed')]));
  const failing = loadHistory({ getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('SecurityError'); } });
  assert.equal(failing.readDownloadTasks().length, 0);
  assert.doesNotThrow(() => failing.saveDownloadTasks([task('completed')]));
  assert.doesNotThrow(() => failing.saveDownloadTasks([]));
  const server = loadSource('src/lib/download-history.ts');
  assert.equal(server.readDownloadTasks().length, 0);
  assert.doesNotThrow(() => server.saveDownloadTasks([]));
});

test('drawer tab clicks expose every status and preserve browser download links', () => {
  const history = loadHistory(storage());
  let activeTab = 'downloading';
  const drawer = loadSource('src/components/DownloadDrawer.tsx', {
    react: { ...React, useState: () => [activeTab, value => { activeTab = value; }] },
    '@/lib/download-history': history,
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    '@/components/BrowserDownloadNotice': { BrowserDownloadNotice: () => null },
  }).DownloadDrawer;
  const tasks = ['pending', 'downloading', 'browser-ready', 'completed', 'error', 'handed-off'].map(status => task(status, { sourceUrl: `https://audio.example/${status}.mp3` }));
  const props = { tasks, isOpen: true, onOpen() {}, onClose() {}, onRemoveTask() {}, onClearCompleted() {}, onBrowserHandoff() {} };
  const first = drawer(props);
  const html = renderToStaticMarkup(first);
  for (const status of ['pending', 'downloading', 'browser-ready']) assert.ok(html.includes(`Song ${status}`));
  for (const status of ['completed', 'error', 'handed-off']) assert.ok(!html.includes(`Song ${status}`));
  assert.ok(html.includes('href="https://audio.example/browser-ready.mp3"'));
  function clickHistory(element) {
    if (!React.isValidElement(element)) return false;
    if (element.type === 'button' && React.Children.toArray(element.props.children).some(c => typeof c === 'string' && c.includes('历史记录'))) {
      element.props.onClick();
      return true;
    }
    return React.Children.toArray(element.props.children).some(clickHistory);
  }
  assert.ok(clickHistory(first));
  const completedHtml = renderToStaticMarkup(drawer(props));
  for (const status of ['completed', 'error', 'handed-off']) assert.ok(completedHtml.includes(`Song ${status}`));
  for (const status of ['pending', 'downloading', 'browser-ready']) assert.ok(!completedHtml.includes(`Song ${status}`));
  assert.ok(completedHtml.includes('href="https://audio.example/handed-off.mp3"'));
});
