import {test, expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {initializeTabs} from '../docs/schema-tabs.js';
const html = await readFile('docs/index.html', 'utf8');
function setup(hash = '') {
  const dom = new JSDOM(html, {url: `https://example.org/nfcweb/${hash}`});
  initializeTabs(dom.window.document, dom.window);
  return dom;
}
test('three progressive sections preserve architecture and responsibilities without JS', () => {
  const dom = new JSDOM(html);
  const d = dom.window.document;
  expect(d.querySelectorAll('main > section')).toHaveLength(3);
  expect(d.querySelectorAll('section[hidden]')).toHaveLength(0);
  expect(d.querySelector('#schemas table, #schemas svg')).toBeNull();
  expect(d.querySelector('#architecture svg')).not.toBeNull();
  expect(d.querySelector('#architecture').textContent).toContain('ByteSequence model');
  expect(d.querySelector('#architecture').textContent).toContain('Metadata axes:');
  expect(d.querySelector('#responsibilities table').textContent).toContain('ImageRepresentationUseV1');
  dom.window.close();
});
test('default, direct links, invalid fragments and reload preserve expected selection', () => {
  for (const [hash, selected] of [['', 'schemas'], ['#invalid', 'schemas'], ['#architecture', 'architecture'], ['#responsibilities', 'responsibilities']]) {
    const dom = setup(hash), d = dom.window.document;
    expect(d.querySelectorAll('[role=tab]')).toHaveLength(3);
    expect(d.querySelector('[aria-selected=true]').getAttribute('aria-controls')).toBe(selected);
    expect(d.querySelectorAll('[role=tabpanel]:not([hidden])')).toHaveLength(1);
    expect(d.getElementById(selected).hidden).toBe(false);
    dom.window.close();
  }
});
test('clicks, keyboard and browser history synchronize selection', async () => {
  const dom = setup(), w = dom.window, d = w.document;
  const first = new Promise(resolve => w.addEventListener('hashchange', resolve, {once:true}));
  d.getElementById('tab-architecture').click(); await first;
  expect(w.location.hash).toBe('#architecture');
  const second = new Promise(resolve => w.addEventListener('hashchange', resolve, {once:true}));
  d.getElementById('tab-architecture').dispatchEvent(new w.KeyboardEvent('keydown', {key:'End', bubbles:true})); await second;
  expect(w.location.hash).toBe('#responsibilities');
  expect(d.activeElement.id).toBe('tab-responsibilities');
  const changed = new Promise(resolve => w.addEventListener('popstate', resolve, {once:true}));
  w.history.back(); await changed;
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  expect(d.getElementById('architecture').hidden).toBe(false);
  const forward = new Promise(resolve => w.addEventListener('popstate', resolve, {once:true}));
  w.history.forward(); await forward;
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  expect(d.getElementById('responsibilities').hidden).toBe(false);
  dom.window.close();
});
