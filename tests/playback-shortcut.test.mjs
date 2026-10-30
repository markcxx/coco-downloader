import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadSource(path, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, URLSearchParams, AbortController, AbortSignal, ...globals, require(id) {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  }};
  vm.runInNewContext(code, context);
  return context.exports;
}
class Element {
  constructor(tag = 'div', attributes = {}, parent = null) {
    this.tag = tag;
    this.attributes = attributes;
    this.parent = parent;
  }
  closest(selector) {
    const matches = selector.split(', ').some(part => {
      if (part.startsWith('[role=')) return part === `[role="${this.attributes.role}"]`;
      if (part === 'a[href]') return this.tag === 'a' && 'href' in this.attributes;
      return part === this.tag;
    });
    return matches ? this : this.parent?.closest(selector) || null;
  }
}
class HTMLElement extends Element {
  get isContentEditable() {
    if ('contenteditable' in this.attributes) return this.attributes.contenteditable !== 'false';
    return this.parent?.isContentEditable || false;
  }
}
const dom = { Element, HTMLElement };
const shortcut = loadSource('src/lib/playback-shortcut.ts', {}, dom);
function press(document, target = new HTMLElement(), options = {}) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({
    key: ' ', target, repeat: false, isComposing: false,
    ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...options,
  }).map(([key, value]) => [key, { value }])));
  document.dispatchEvent(event);
  return event;
}

test('plain space toggles once, suppresses scrolling during repeats and removes its listener', () => {
  const document = new EventTarget();
  let toggles = 0;
  const cleanup = shortcut.installPlaybackShortcut(document, () => true, () => toggles++);
  assert.equal(press(document).defaultPrevented, true);
  for (let i = 0; i < 5; i++) assert.equal(press(document, undefined, { repeat: true }).defaultPrevented, true);
  assert.equal(toggles, 1);
  cleanup();
  assert.equal(press(document).defaultPrevented, false);
  assert.equal(toggles, 1);
});

test('inputs, focused controls, their descendants and inherited editability retain native space behavior', () => {
  const document = new EventTarget();
  let toggles = 0;
  shortcut.installPlaybackShortcut(document, () => true, () => toggles++);
  const controls = ['input', 'textarea', 'select', 'button', 'summary'].map(tag => new HTMLElement(tag));
  controls.push(new HTMLElement('a', { href: '/about' }));
  for (const role of ['button', 'slider', 'combobox', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'checkbox', 'radio', 'switch', 'textbox', 'spinbutton', 'tab']) controls.push(new HTMLElement('div', { role }));
  controls.push(new HTMLElement('div', { contenteditable: 'true' }), new HTMLElement('div', { contenteditable: 'plaintext-only' }));
  for (const target of controls.flatMap(control => [control, new HTMLElement('span', {}, control)])) {
    assert.equal(press(document, target).defaultPrevented, false);
  }
  assert.equal(toggles, 0);
});

test('composition, modifier keys, other keys, handled events and unavailable playback are ignored', () => {
  const document = new EventTarget();
  let toggles = 0;
  document.addEventListener('keydown', event => { if (event.handled) event.preventDefault(); });
  shortcut.installPlaybackShortcut(document, () => true, () => toggles++);
  for (const options of [{ isComposing: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { key: 'Enter' }, { handled: true }]) press(document, undefined, options);
  assert.equal(toggles, 0);
  const unavailable = new EventTarget();
  shortcut.installPlaybackShortcut(unavailable, () => false, () => toggles++);
  assert.equal(press(unavailable).defaultPrevented, false);
  assert.equal(toggles, 0);
});

function playerHarness() {
  const document = new EventTarget();
  const cells = [];
  const effects = [];
  const errors = [];
  let cursor = 0, mounted = false;
  class Audio extends EventTarget {
    src = '';
    paused = true;
    playCalls = 0;
    playResult = null;
    emitBeforeFailure = false;
    async play() {
      this.playCalls++;
      if (this.emitBeforeFailure) this.dispatchEvent(new Event('play'));
      await this.playResult;
      this.paused = false;
      this.dispatchEvent(new Event('play'));
    }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    load() {}
    removeAttribute() { this.src = ''; }
  }
  let audio;
  const { useWebPlayer: renderPlayerHook } = loadSource('src/hooks/useWebPlayer.ts', {
    react: {
      useRef(initial) { const index = cursor++; return cells[index] ||= { current: initial }; },
      useState(initial) {
        const index = cursor++;
        if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
        return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }];
      },
      useCallback: callback => callback,
      useEffect(effect) { if (!mounted) effects.push(effect); },
    },
    antd: { message: { error: value => errors.push(value), info() {} } },
    '@/lib/music-channels': { getMusicChannel: () => ({ preview: true }) },
    '@/lib/player-queue': { adjacentIndex: () => -1, queueOrder: () => [0] },
    '@/lib/playback-shortcut': shortcut,
  }, {
    ...dom, document,
    Audio: function () { audio = new Audio(); return audio; },
    fetch: async url => ({ ok: true, json: async () => url.startsWith('/api/lyric') ? { lines: [] } : { url: 'https://audio.example/song.mp3' } }),
  });
  function render() { cursor = 0; return renderPlayerHook(); }
  const player = render();
  const cleanup = effects.map(effect => effect());
  mounted = true;
  return { player, audio, errors, document, render, cleanup: () => cleanup.forEach(fn => fn?.()) };
}
const song = { id: 'song', title: 'Song', artist: 'Artist', provider: 'qq' };
const settle = () => new Promise(resolve => setImmediate(resolve));

test('shortcut uses the live player to pause/resume and keeps failed playback paused', async () => {
  const h = playerHarness();
  assert.equal(press(h.document).defaultPrevented, false);
  await h.player.handlePlay(song);
  assert.equal(h.render().playing, true);
  press(h.document);
  assert.equal(h.audio.paused, true);
  assert.equal(h.render().playing, false);
  press(h.document);
  await settle();
  assert.equal(h.audio.paused, false);
  assert.equal(h.render().playing, true);
  press(h.document);
  // A media element can emit play before its play promise rejects.
  h.audio.emitBeforeFailure = true;
  h.audio.playResult = Promise.reject(new Error('unsupported audio'));
  press(h.document);
  await settle();
  assert.equal(h.render().playing, false);
  assert.equal(h.audio.paused, true);
  assert.equal(h.errors.length, 1);
  h.cleanup();
  const calls = h.audio.playCalls;
  press(h.document);
  assert.equal(h.audio.playCalls, calls);
});

test('resolving a track prevents shortcut reentry and repeats never restart playback', async () => {
  const h = playerHarness();
  let resolvePlay;
  h.audio.playResult = new Promise(resolve => { resolvePlay = resolve; });
  const pending = h.player.handlePlay(song);
  await settle();
  assert.equal(h.render().resolvingMusicId, song.id);
  assert.equal(h.render().playing, false);
  assert.equal(press(h.document).defaultPrevented, false);
  assert.equal(h.audio.playCalls, 1);
  resolvePlay();
  await pending;
  assert.equal(h.render().playing, true);
  for (let i = 0; i < 5; i++) press(h.document, undefined, { repeat: true });
  assert.equal(h.audio.playCalls, 1);
  assert.equal(h.audio.paused, false);
  h.cleanup();
});
