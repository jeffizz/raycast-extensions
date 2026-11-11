const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const filename = path.resolve('src/utils/dateTime.ts.test.cjs');
const result = esbuild.buildSync({ entryPoints: ['src/utils/dateTime.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
const mod = new Module(filename, module);
mod.filename = filename;
mod._compile(result.outputFiles[0].text, filename);
const { getDateTimeItems } = mod.exports;
const french = (input) => getDateTimeItems(input).items.map((item) => item.french);

for (const [input, expected] of [
  ['14:30', ['quatorze heures trente']],
  ['9:05', ['neuf heures cinq']],
  ['01:00', ['une heure']],
  ['21:01', ['vingt et une heures une']],
  ['23:21', ['vingt-trois heures vingt et une']],
  ['00:01', ['zéro heure une']],
  ['00:00', ['zéro heure', 'minuit']],
  ['12:00', ['douze heures', 'midi']],
  ['23:59', ['vingt-trois heures cinquante-neuf']],
  ['2024-02-29', ['le jeudi vingt-neuf février deux mille vingt-quatre']],
  ['2024/1/1', ['le lundi premier janvier deux mille vingt-quatre']],
  ['2026-11-11', ['le mercredi onze novembre deux mille vingt-six']],
  ['0001-01-01', ['le lundi premier janvier un']],
  ['0080-01-01', ['le lundi premier janvier quatre-vingt']],
  ['2000-01-01', ['le samedi premier janvier deux mille']],
  ['1900-03-01', ['le jeudi premier mars mille neuf cent']],
]) assert.deepEqual(french(input), expected, input);

for (const input of ['24:00', '12:60', '1:2', '12:', '2023-02-29', '1900-02-29', '0000-01-01', '2024-13-01', '2024-04-31', '2024-02/01', '2024-02']) {
  const result = getDateTimeItems(input);
  assert.ok(result?.error, input);
  assert.deepEqual(result.items, [], input);
}
for (const input of ['', '27', '27abc', 'lundi']) assert.equal(getDateTimeItems(input), null, input);
assert.equal(getDateTimeItems('2024-02-29').items[0].chinese, '2024-02-29 星期四');
assert.ok(getDateTimeItems('2000-02-29').items.length);

// Exhaustively test valid times and the Gregorian date range, independent of local time zone.
for (let hour = 0; hour < 24; hour++) for (let minute = 0; minute < 60; minute++) {
  const result = getDateTimeItems(`${hour}:${String(minute).padStart(2, '0')}`);
  assert.ok(result.items.length && !result.error);
}
for (let year = 1; year <= 9999; year++) for (let month = 1; month <= 12; month++) {
  const input = `${String(year).padStart(4, '0')}-${month}-01`;
  const result = getDateTimeItems(input);
  assert.ok(result.items.length && !result.error, input);
  assert.ok(!/\b(?:cents|vingts)(?: mille|$)/.test(result.items[0].french), input);
}
console.log('Date and time tests passed.');
