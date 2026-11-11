const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const filename = path.resolve('src/utils/numberToFrench.ts.test.cjs');
const result = esbuild.buildSync({
  entryPoints: ['src/utils/numberToFrench.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
});
const mod = new Module(filename, module);
mod.filename = filename;
mod._compile(result.outputFiles[0].text, filename);
const { toFrenchCardinal, toFrenchOrdinal, getFrenchApproximate } = mod.exports;
assert.equal(getFrenchApproximate(1000), 'un millier (1000左右 / 成千上万)');

for (const [number, cardinal, ordinal] of [
  [1, 'un', 'premier / première'],
  [2, 'deux', 'deuxième'],
  [3, 'trois', 'troisième'],
  [5, 'cinq', 'cinquième'],
  [6, 'six', 'sixième'],
  [9, 'neuf', 'neuvième'],
  [10, 'dix', 'dixième'],
  [20, 'vingt', 'vingtième'],
  [21, 'vingt et un', 'vingt et unième'],
  [23, 'vingt-trois', 'vingt-troisième'],
  [25, 'vingt-cinq', 'vingt-cinquième'],
  [29, 'vingt-neuf', 'vingt-neuvième'],
  [80, 'quatre-vingts', 'quatre-vingtième'],
  [200, 'deux cents', 'deux centième'],
  [80000, 'quatre-vingts mille', 'quatre-vingt millième'],
  [200000, 'deux cents mille', 'deux cent millième'],
  [200003, 'deux cents mille trois', 'deux cent mille troisième'],
  [26, 'vingt-six', 'vingt-sixième'],
  [27, 'vingt-sept', 'vingt-septième'],
  [34, 'trente-quatre', 'trente-quatrième'],
  [42, 'quarante-deux', 'quarante-deuxième'],
  [57, 'cinquante-sept', 'cinquante-septième'],
  [62, 'soixante-deux', 'soixante-deuxième'],
  [71, 'soixante et onze', 'soixante et onzième'],
  [87, 'quatre-vingt-sept', 'quatre-vingt-septième'],
  [127, 'cent vingt-sept', 'cent vingt-septième'],
  [22734, 'vingt-deux mille sept cent trente-quatre', 'vingt-deux mille sept cent trente-quatrième'],
]) {
  assert.equal(toFrenchCardinal(number), cardinal, `cardinal ${number}`);
  assert.equal(toFrenchOrdinal(number), ordinal, `ordinal ${number}`);
}

// Verify every number that is actually spelled out, including nested hundreds and thousands.
for (let n = 0; n < 1000000; n++) {
  for (const [kind, text] of [['cardinal', toFrenchCardinal(n)], ['ordinal', toFrenchOrdinal(n)]]) {
    assert.doesNotMatch(text, /\s-|\-\s/, `${kind} ${n}: ${text}`);
  }
}
console.log('Number spacing regression tests passed.');
