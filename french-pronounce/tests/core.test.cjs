const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Compile TS in memory; Raycast and network calls are mocked, no credentials required.
require.extensions['.ts'] = (module, filename) => {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  module._compile(code, filename);
};
const supportPath = fs.mkdtempSync(path.join(os.tmpdir(), 'french-pronounce-tests-'));
const storage = new Map();
let preferences = { strictPrivacyChecks: true, translationEngine: 'none', elevenFrenchVoiceId: 'FrenchVoice', elevenEnglishVoiceId: 'EnglishVoice' };
let playbackError = false;
let translations = 0;
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === '@raycast/api') return {
    environment: { supportPath },
    getPreferenceValues: () => preferences,
    LocalStorage: { getItem: async (key) => storage.get(key), setItem: async (key, value) => storage.set(key, value) },
    showHUD: async () => {},
  };
  if (request === './translate' && parent?.filename.endsWith('/workflow.ts')) return { showTranslationIfEnabled: async () => { translations++; } };
  if (request === 'child_process') return { execFile: (_file, _args, callback) => callback(playbackError ? new Error('device error') : null, '', '') };
  return originalLoad.call(this, request, parent, main);
};
const { validateText, characterCount } = require('../src/text-safety.ts');
const { reserveKey, failKey, reactivateKey, refreshExpiredKeys, COOLDOWN_MS } = require('../src/key-state.ts');
const { updateKeys } = require('../src/state.ts');
const { getStrategy, setStrategy, cycleStrategy } = require('../src/strategy.ts');
const { requestElevenAudio, getElevenConfig, elevenRequestBody, DEFAULT_VOICES } = require('../src/elevenlabs.ts');
const { describeElevenError } = require('../src/elevenlabs-errors.ts');
const { playSpeech } = require('../src/speech.ts');
const { speakAndMaybeTranslate } = require('../src/workflow.ts');
const { isMp3, cachedAudio } = require('../src/audio-cache.ts');
const { formatConjugation, stripBoundaryParentheses } = require('../src/conjugation.ts');
const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200)]);
const key = (id) => ({ id, label: id, secret: `sk_${id.repeat(20)}`, enabled: true, createdAt: 1, requests: 0, submittedCharacters: 0, successfulCharacters: 0, failures: 0, cycleCharacters: 0, cycleFailures: 0 });
function reset() { storage.clear(); playbackError = false; translations = 0; preferences = { strictPrivacyChecks: true, translationEngine: 'none', elevenFrenchVoiceId: 'FrenchVoice', elevenEnglishVoiceId: 'EnglishVoice' }; }
const response = () => new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } });

test('Unicode limits, normalization and privacy heuristics', () => {
  assert.equal(validateText('  élève  '), 'élève');
  assert.equal(validateText('e\u0301cole'), 'école');
  assert.equal(characterCount('a😀'), 2);
  assert.equal(validateText('é'.repeat(175)).length, 175);
  assert.throws(() => validateText('a'.repeat(176)), /175/);
  for (const text of ['', '!!!', 'a\0b', 'a\u202eb', 'name@example.com', 'https://example.test', 'password=bonjour', '123-456-7890', '<break>', 'sk_abcdefghijklmnopqrstuvwxyz']) assert.throws(() => validateText(text));
  assert.equal(validateText('name@example.com', false), 'name@example.com');
  assert.throws(() => validateText('a\0b', false));
});
test('round robin skips disabled/cooling keys and resets at exact 7-day expiry', () => {
  const state = { keys: [key('a'), key('b'), key('c')] };
  assert.equal(reserveKey(state, [], 7, 100).id, 'a');
  assert.equal(reserveKey(state, [], 7, 100).id, 'b');
  failKey(state.keys[1], 'HTTP 401', 100);
  state.keys[2].enabled = false;
  assert.equal(reserveKey(state, [], 7, 100).id, 'a');
  assert.equal(refreshExpiredKeys(state, 100 + COOLDOWN_MS - 1), false);
  assert.equal(refreshExpiredKeys(state, 100 + COOLDOWN_MS), true);
  assert.equal(state.keys[1].lastError, undefined);
  assert.equal(state.keys[1].cycleCharacters, 0);
  assert.equal(state.keys[1].submittedCharacters, 7);
  assert.equal(state.keys[1].failures, 1);
  assert.equal(reserveKey(state, ['a'], 7, 100 + COOLDOWN_MS).id, 'b');
  failKey(state.keys[1], 'HTTP 500'); reactivateKey(state.keys[1]);
  assert.equal(state.keys[1].cycleFailures, 0);
});
test('strategy defaults, cycles and persists', async () => {
  reset(); assert.equal(await getStrategy(), 'fallback');
  assert.equal(await cycleStrategy(), 'frdic');
  assert.equal(await cycleStrategy(), 'elevenlabs');
  assert.equal(await cycleStrategy(), 'fallback');
  await setStrategy('elevenlabs'); assert.equal(await getStrategy(), 'elevenlabs');
});
test('ElevenLabs rotates on error, counts attempts, and enforces language', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a'), key('b')]; });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return calls.length === 1 ? new Response('private error text', { status: 401 }) : response();
  };
  await requestElevenAudio('bonjour', getElevenConfig('fr'));
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].body).language_code, 'fr');
  assert.notEqual(calls[0].headers['xi-api-key'], calls[1].headers['xi-api-key']);
  const keys = await updateKeys((state) => state.keys);
  assert.equal(keys[0].lastError, 'HTTP 401');
  assert.equal(keys[0].submittedCharacters, 7);
  assert.equal(keys[0].successfulCharacters, 0);
  assert.ok(keys[0].blockedUntil > Date.now());
  assert.equal(keys[1].successfulCharacters, 7);
});
test('all failures terminate after each available key once, including network and invalid audio', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a'), key('b')]; });
  let count = 0;
  global.fetch = async () => { if (++count === 1) throw new Error('timeout'); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); };
  await assert.rejects(requestElevenAudio('salut', getElevenConfig('fr')), /All attempted/);
  assert.equal(count, 2);
  await assert.rejects(requestElevenAudio('salut', getElevenConfig('fr')), /No active/);
  assert.equal(count, 2);
});
test('model settings validated before key use; multilingual omits language_code', async () => {
  reset(); preferences.elevenModel = 'eleven_flash_v2_5'; preferences.elevenSpeed = 'NaN';
  assert.throws(() => getElevenConfig('fr'), /Speed/);
  preferences.elevenSpeed = '0.85'; preferences.elevenModel = 'eleven_multilingual_v2';
  await updateKeys((state) => { state.keys = [key('a')]; });
  global.fetch = async (_url, options) => { const body = JSON.parse(options.body); assert.equal(body.language_code, undefined); assert.equal(body.voice_settings.speed, 0.85); return response(); };
  await requestElevenAudio('merci', getElevenConfig('fr'));
});
test('frdic failure falls back; cache hits do not count; provider-only never crosses', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; });
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return url.includes('frdic') ? new Response('{}', { headers: { 'Content-Type': 'application/json' } }) : response(); };
  await playSpeech('cache-test-unique', 'fr');
  assert.equal(calls.length, 2);
  await setStrategy('elevenlabs'); await playSpeech('cache-test-unique', 'fr');
  assert.equal(calls.length, 2);
  assert.equal((await updateKeys((state) => state.keys))[0].requests, 1);
  await setStrategy('frdic'); await assert.rejects(playSpeech('frdic-only-unique', 'fr'));
  assert.equal(calls.length, 3); assert.ok(calls[2].includes('frdic'));
});
test('playback errors do not trigger fallback', async () => {
  reset(); playbackError = true; let count = 0;
  global.fetch = async () => { count++; return response(); };
  await assert.rejects(playSpeech('playback-test-unique', 'fr'), /playback/);
  assert.equal(count, 1);
});
test('reject before either translation or speech is sent, including expanded templates', async () => {
  reset(); let calls = 0; global.fetch = async () => { calls++; return response(); };
  await assert.rejects(speakAndMaybeTranslate('safe', 'name@example.com', 'fr'));
  await assert.rejects(speakAndMaybeTranslate('a'.repeat(176), 'safe', 'fr'));
  assert.equal(translations, 0); assert.equal(calls, 0);
});
test('audio checks, hashed cache, atomic writes and corruption replacement', async () => {
  assert.equal(isMp3(Buffer.from('{}')), false);
  const identity = { text: 'cache-corruption-test' };
  let calls = 0;
  const download = async () => { calls++; return audio; };
  const file = await cachedAudio(identity, download);
  assert.ok(!file.includes('cache-corruption-test'));
  await cachedAudio(identity, download); assert.equal(calls, 1);
  fs.writeFileSync(file, '{}'); await cachedAudio(identity, download); assert.equal(calls, 2);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
test('existing French preprocessing retained', () => {
  assert.equal(stripBoundaryParentheses('(x)amoureux(euse)'), 'amoureux');
  assert.equal(formatConjugation('aller\nvais\nvas\nva\nallons\nallez\nvont'), 'ALLER. Je vais?\tTu vas?\tIl va?\tNous allons?\tVous allez?\tIls vont');
});
test('blank or missing voice IDs use requested defaults; explicit values win', () => {
  reset(); delete preferences.elevenFrenchVoiceId; preferences.elevenEnglishVoiceId = '  ';
  assert.equal(getElevenConfig('fr').voiceId, DEFAULT_VOICES.fr);
  assert.equal(getElevenConfig('en').voiceId, DEFAULT_VOICES.en);
  preferences.elevenFrenchVoiceId = 'CustomFrenchVoice';
  assert.equal(getElevenConfig('fr').voiceId, 'CustomFrenchVoice');
});
test('v4 default sends only supported settings; v3 snaps stability and omits speed', () => {
  reset(); preferences.elevenSpeed = 'NaN';
  const config = getElevenConfig('fr');
  assert.equal(config.model, 'eleven_v4');
  const body = elevenRequestBody('bonjour', config);
  assert.equal(body.language_code, 'fr');
  assert.deepEqual(body.voice_settings, { stability: 0.65, similarity_boost: 0.75 });
  preferences.elevenModel = 'eleven_v3'; preferences.elevenStability = '0.65';
  assert.deepEqual(elevenRequestBody('bonjour', getElevenConfig('fr')).voice_settings, { stability: 0.5 });
});
test('402 includes provider diagnostics, redacts credentials/text, and retains cooldown policy', async () => {
  reset(); const saved = key('a');
  await updateKeys((state) => { state.keys = [saved]; });
  global.fetch = async () => new Response(JSON.stringify({ detail: { status: 'paid_plan_required', message: `Paid plan required for this voice. secret=${saved.secret}, input=bonjour` } }), { status: 402 });
  await assert.rejects(requestElevenAudio('bonjour', getElevenConfig('fr')), (error) => {
    assert.match(error.message, /HTTP 402 \[paid_plan_required\]/);
    assert.ok(!error.message.includes(saved.secret)); assert.ok(!error.message.includes('bonjour'));
    return true;
  });
  const records = await updateKeys((state) => state.keys);
  assert.match(records[0].lastError, /Paid plan required/);
  assert.ok(records[0].blockedUntil > Date.now());
});
test('error decoder supports new code/type schema; discards non-JSON and oversized bodies', async () => {
  const description = await describeElevenError(new Response(JSON.stringify({ detail: { code: 'insufficient_credits', type: 'payment_required', message: 'Account needs credits' } }), { status: 402 }), []);
  assert.match(description, /insufficient_credits/); assert.match(description, /payment_required/);
  assert.equal(await describeElevenError(new Response('<html>private</html>', { status: 502 }), []), 'HTTP 502');
  assert.equal(await describeElevenError(new Response(JSON.stringify({ detail: { message: 'a'.repeat(20000) } }), { status: 402 }), []), 'HTTP 402');
});
test('successful frdic and ElevenLabs caches stay separate and survive switching back', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; });
  const calls = []; global.fetch = async (url) => { calls.push(url); return response(); };
  const text = 'provider-isolation-unique';
  await setStrategy('frdic'); await playSpeech(text, 'fr');
  await setStrategy('elevenlabs'); await playSpeech(text, 'fr');
  assert.equal(calls.length, 2); assert.ok(calls[0].includes('frdic')); assert.ok(calls[1].includes('elevenlabs'));
  await setStrategy('frdic'); await playSpeech(text, 'fr');
  await setStrategy('elevenlabs'); await playSpeech(text, 'fr');
  await setStrategy('fallback'); await playSpeech(text, 'fr');
  assert.equal(calls.length, 2);
  assert.equal((await updateKeys((state) => state.keys))[0].requests, 1);
  await setStrategy('elevenlabs'); preferences.elevenFrenchVoiceId = 'OtherFrenchVoice';
  await playSpeech(text, 'fr'); assert.equal(calls.length, 3);
  preferences.elevenFrenchVoiceId = 'FrenchVoice'; await playSpeech(text, 'fr'); assert.equal(calls.length, 3);
  preferences.elevenModel = 'eleven_multilingual_v2'; await playSpeech(text, 'fr'); assert.equal(calls.length, 4);
  delete preferences.elevenModel; await playSpeech(text, 'fr'); assert.equal(calls.length, 4);
});
test.after(() => { fs.rmSync(supportPath, { recursive: true, force: true }); Module._load = originalLoad; });
