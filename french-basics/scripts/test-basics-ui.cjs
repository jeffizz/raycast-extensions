const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const filename = path.resolve('src/index.tsx.test.cjs');
const result = esbuild.buildSync({ entryPoints: ['src/index.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@raycast/api', 'react', './tts'] });
const mockComponent = () => null;
const Grid = Object.assign(() => null, { Item: () => null, Section: () => null, EmptyView: () => null, Dropdown: Object.assign(() => null, { Item: () => null }), ItemSize: { Medium: 'medium' }, Inset: { Zero: 'zero' } });
const Action = Object.assign(() => null, { CopyToClipboard: () => null });
let search = '';
let category = 'all';
let spoken = [];
let stateIndex = 0;
const mockApi = { Grid, Action, ActionPanel: mockComponent, showToast: async () => {}, Toast: { Style: { Animated: 0, Success: 1, Failure: 2 } }, Icon: { SpeakerHigh: 'speaker' }, environment: { assetsPath: '/unused' } };
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
const requireOriginal = mod.require.bind(mod);
mod.require = (name) => {
  if (name === '@raycast/api') return mockApi;
  if (name === 'react') return { useState: () => [stateIndex++ === 0 ? search : category, () => {}] };
  if (name === './tts') return { playFrenchSpeech: async (text) => { spoken.push(text); }, playLocalAudio: async () => {} };
  return requireOriginal(name);
};
mod._compile(result.outputFiles[0].text, filename);
const Command = mod.exports.default;
function render(query, filter = 'all') {
  search = query; category = filter; stateIndex = 0;
  return Command();
}
function collect(element, type, found = []) {
  if (!element || typeof element !== 'object') return found;
  if (element.type === type) found.push(element);
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) collect(child, type, found);
  return found;
}
(async () => {
  for (const [query, expected] of [
    ['26', ['vingt-six', 'vingt-sixième']],
    ['14:30', ['quatorze heures trente']],
    ['2024-02-29', ['le jeudi vingt-neuf février deux mille vingt-quatre']],
  ]) {
    const grid = render(query, 'alphabet');
    assert.equal(grid.props.filtering, false);
    const items = collect(grid, Grid.Item);
    assert.equal(items.length, expected.length, query);
    for (let i = 0; i < items.length; i++) {
      const actions = items[i].props.actions;
      assert.equal(collect(actions, Action.CopyToClipboard)[0].props.content, expected[i]);
      spoken = [];
      await collect(actions, Action)[0].props.onAction();
      assert.deepEqual(spoken, [expected[i]], query);
    }
  }
  assert.equal(collect(render('2023-02-29'), Grid.EmptyView).length, 1);
  assert.equal(collect(render('24:00'), Grid.Item).length, 0);
  assert.equal(collect(render('', 'time'), Grid.Item).length, 3);
  assert.equal(collect(render('mercredi'), Grid.Item).length, 1);
  console.log('Basics UI integration tests passed.');
})().catch((err) => { console.error(err); process.exitCode = 1; });
