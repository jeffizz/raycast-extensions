const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Compile TS in memory; Raycast and network calls are mocked, no credentials required.
require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  module._compile(code, filename);
};
const supportPath = fs.mkdtempSync(path.join(os.tmpdir(), 'french-pronounce-tests-'));
const storage = new Map();
let preferences = { strictPrivacyChecks: true, translationEngine: 'none', elevenFrenchVoiceId: 'FrenchVoice', elevenEnglishVoiceId: 'EnglishVoice' };
let playbackError = false;
let translations = 0;
let confirmAnswer = false;
let confirmOptions;
let hudMessages = [];
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === '@raycast/api') return {
    environment: { supportPath },
    getPreferenceValues: () => preferences,
    LocalStorage: { getItem: async (key) => storage.get(key), setItem: async (key, value) => storage.set(key, value) },
    showHUD: async (message) => { hudMessages.push(message); },
    confirmAlert: async (options) => { confirmOptions = options; return confirmAnswer; },
    Alert: { ActionStyle: { Destructive: 'destructive' } },
  };
  if (request === './translate' && parent?.filename.endsWith('/workflow.ts')) return { showTranslationIfEnabled: async () => { translations++; } };
  if (request === 'child_process') return { execFile: (_file, _args, callback) => callback(playbackError ? new Error('device error') : null, '', '') };
  return originalLoad.call(this, request, parent, main);
};
const { validateText, characterCount } = require('../src/text-safety.ts');
const { reserveKey, failKey, reactivateKey, refreshExpiredKeys, COOLDOWN_MS } = require('../src/key-state.ts');
const { updateKeys } = require('../src/state.ts');
const { getStrategy, setStrategy, cycleStrategy, parseFrdicPercentage, chooseRandomProvider } = require('../src/strategy.ts');
const { requestElevenAudio, getElevenConfig, elevenRequestBody, parseVoiceIds, DEFAULT_VOICES } = require('../src/elevenlabs.ts');
const { describeElevenError } = require('../src/elevenlabs-errors.ts');
const { playSpeech } = require('../src/speech.ts');
const { speakAndMaybeTranslate } = require('../src/workflow.ts');
const { isMp3, cachedAudio, clearAudioCache } = require('../src/audio-cache.ts');
const clearAudioCacheCommand = require('../src/clear-audio-cache.tsx').default;
const { formatConjugation, stripBoundaryParentheses } = require('../src/conjugation.ts');
const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200)]);
const key = (id) => ({ id, label: id, secret: `sk_${id.repeat(20)}`, enabled: true, createdAt: 1, requests: 0, submittedCharacters: 0, successfulCharacters: 0, failures: 0, cycleCharacters: 0, cycleFailures: 0 });
function reset() { storage.clear(); playbackError = false; translations = 0; confirmAnswer = false; confirmOptions = undefined; hudMessages = []; preferences = { strictPrivacyChecks: true, translationEngine: 'none', elevenFrenchVoiceId: 'FrenchVoice', elevenEnglishVoiceId: 'EnglishVoice' }; }
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
  assert.equal(await cycleStrategy(), 'random');
  assert.equal(await getStrategy(), 'random');
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
  await playSpeech(text, 'fr'); assert.equal(calls.length, 2);
  preferences.elevenFrenchVoiceId = 'FrenchVoice'; await playSpeech(text, 'fr'); assert.equal(calls.length, 2);
  preferences.elevenModel = 'eleven_multilingual_v2'; await playSpeech(text, 'fr'); assert.equal(calls.length, 3);
  delete preferences.elevenModel; await playSpeech(text, 'fr'); assert.equal(calls.length, 3);
});
test('frdic works without ElevenLabs settings or keys in frdic-only and default modes', async () => {
  reset(); preferences = { translationEngine: 'none', strictPrivacyChecks: true, elevenFrenchVoiceId: 'bad value', elevenModel: 'invalid model' };
  const calls = []; global.fetch = async (url) => { calls.push(url); return response(); };
  await setStrategy('frdic'); await playSpeech('independent-frdic-only', 'fr');
  await setStrategy('fallback'); await playSpeech('independent-fallback', 'fr');
  assert.equal(calls.length, 2); assert.ok(calls.every((url) => url.includes('frdic')));
  assert.equal(storage.has('elevenlabs-keys-v1'), false);
});
test('default fallback reports missing ElevenLabs key only after frdic fails', async () => {
  reset(); delete preferences.elevenFrenchVoiceId; delete preferences.elevenEnglishVoiceId;
  let calls = 0; global.fetch = async () => { calls++; return new Response('{}', { status: 503 }); };
  await assert.rejects(playSpeech('fallback-without-keys', 'fr'), /No active ElevenLabs keys/);
  assert.equal(calls, 1);
});
test('voice lists parse comma/newline, deduplicate, validate and select expected entries', () => {
  reset();
  assert.deepEqual(parseVoiceIds(undefined, 'fr'), [DEFAULT_VOICES.fr]);
  assert.deepEqual(parseVoiceIds('  \n', 'en'), [DEFAULT_VOICES.en]);
  assert.deepEqual(parseVoiceIds('VoiceA, VoiceB\r\nVoiceC， VoiceA,,', 'fr'), ['VoiceA', 'VoiceB', 'VoiceC']);
  assert.throws(() => parseVoiceIds('VoiceA, bad id', 'fr'), /Invalid/);
  assert.throws(() => parseVoiceIds(',,', 'fr'), /Invalid/);
  preferences.elevenFrenchVoiceId = 'VoiceA, VoiceB\nVoiceC';
  const originalRandom = Math.random;
  try {
    Math.random = () => 0; assert.equal(getElevenConfig('fr').voiceId, 'VoiceA');
    Math.random = () => 0.4; assert.equal(getElevenConfig('fr').voiceId, 'VoiceB');
    Math.random = () => 0.99; assert.equal(getElevenConfig('fr').voiceId, 'VoiceC');
    preferences.elevenFrenchVoiceId = 'VoiceA';
    assert.equal(getElevenConfig('fr').voiceId, 'VoiceA');
  } finally { Math.random = originalRandom; }
});
test('voice is selected on cache miss, fixed across key retries and ignored on cache hit', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a'), key('b')]; });
  await setStrategy('elevenlabs'); preferences.elevenFrenchVoiceId = 'VoiceA, VoiceB';
  const originalRandom = Math.random; let choice = 0; Math.random = () => choice;
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return calls.length === 1 ? new Response('error', { status: 500 }) : response(); };
  try {
    await playSpeech('random-voice-cache', 'fr');
    assert.equal(calls.length, 2); assert.ok(calls.every((url) => url.includes('/VoiceA?')));
    choice = 0.99; await playSpeech('random-voice-cache', 'fr');
    assert.equal(calls.length, 2);
    choice = 0; await playSpeech('random-voice-cache', 'fr'); assert.equal(calls.length, 2);
    choice = 0.99; await playSpeech('random-voice-cache', 'fr'); assert.equal(calls.length, 2);
    await playSpeech('different-random-voice-text', 'fr');
    assert.equal(calls.length, 3); assert.ok(calls[2].includes('/VoiceB?'));
  } finally { Math.random = originalRandom; }
});
test('freeform model handles whitespace, future IDs, v4 turbo, and invalid values safely', () => {
  reset(); preferences.elevenModel = '  '; assert.equal(getElevenConfig('fr').model, 'eleven_v4');
  preferences.elevenModel = '  eleven_v4_turbo  ';
  let body = elevenRequestBody('bonjour', getElevenConfig('fr'));
  assert.equal(body.model_id, 'eleven_v4_turbo');
  assert.deepEqual(body.voice_settings, { stability: 0.65, similarity_boost: 0.75 });
  preferences.elevenModel = 'eleven_future_v9'; preferences.elevenSpeed = 'bad'; preferences.elevenStability = 'bad';
  body = elevenRequestBody('bonjour', getElevenConfig('fr'));
  assert.deepEqual(body, { text: 'bonjour', model_id: 'eleven_future_v9' });
  preferences.elevenModel = 'invalid model'; assert.throws(() => getElevenConfig('fr'), /Invalid ElevenLabs model/);
  preferences.elevenModel = '../bad'; assert.throws(() => getElevenConfig('fr'), /Invalid ElevenLabs model/);
});
test('unknown model ID is sent to API and API rejection follows normal cooldown', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; }); preferences.elevenModel = 'future_model_v1';
  global.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { text: 'hello', model_id: 'future_model_v1' });
    return new Response(JSON.stringify({ detail: { status: 'model_not_found', message: 'Unknown model' } }), { status: 400 });
  };
  await assert.rejects(requestElevenAudio('hello', getElevenConfig('en')), /model_not_found/);
  assert.ok((await updateKeys((state) => state.keys))[0].blockedUntil > Date.now());
});
test('random percentage defaults, validation and boundaries', () => {
  assert.equal(parseFrdicPercentage(undefined), 50);
  assert.equal(parseFrdicPercentage(' '), 50);
  assert.equal(parseFrdicPercentage(' 25.5 '), 25.5);
  for (const bad of ['-1', '101', 'NaN', 'Infinity', '1e2', '50%', '0x20']) assert.throws(() => parseFrdicPercentage(bad), /0 to 100/);
  const original = Math.random;
  try {
    Math.random = () => 0; assert.equal(chooseRandomProvider(0), 'elevenlabs');
    Math.random = () => 0.999999; assert.equal(chooseRandomProvider(100), 'frdic');
    Math.random = () => 0.2549; assert.equal(chooseRandomProvider(25.5), 'frdic');
    Math.random = () => 0.255; assert.equal(chooseRandomProvider(25.5), 'elevenlabs');
  } finally { Math.random = original; }
});
test('random provider is selected before cache lookup and caches remain separate', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; }); await setStrategy('random');
  preferences.randomFrdicPercentage = '50'; let sample = 0.1; const oldRandom = Math.random; Math.random = () => sample;
  const calls = []; global.fetch = async (url) => { calls.push(url); return response(); };
  try {
    await playSpeech('random-provider-cache-test', 'fr');
    sample = 0.9; await playSpeech('random-provider-cache-test', 'fr');
    assert.equal(calls.length, 2); assert.ok(calls[0].includes('frdic')); assert.ok(calls[1].includes('elevenlabs'));
    sample = 0.1; await playSpeech('random-provider-cache-test', 'fr');
    sample = 0.9; await playSpeech('random-provider-cache-test', 'fr');
    assert.equal(calls.length, 2); assert.equal((await updateKeys((state) => state.keys))[0].requests, 1);
  } finally { Math.random = oldRandom; }
});
test('random provider failure never falls back to the other provider', async () => {
  reset(); await setStrategy('random'); await updateKeys((state) => { state.keys = [key('a')]; });
  const calls = []; global.fetch = async (url) => { calls.push(url); return new Response('{}', { status: 503 }); };
  preferences.randomFrdicPercentage = '100';
  await assert.rejects(playSpeech('random-frdic-failure-test', 'fr'), /frdic HTTP 503/);
  assert.equal(calls.length, 1); assert.ok(calls[0].includes('frdic'));
  preferences.randomFrdicPercentage = '0';
  await assert.rejects(playSpeech('random-eleven-failure-test', 'en'), /All attempted ElevenLabs keys failed/);
  assert.equal(calls.length, 2); assert.ok(calls[1].includes('elevenlabs'));
  assert.ok((await updateKeys((state) => state.keys))[0].blockedUntil > Date.now());
});
test('missing ElevenLabs keys fail only when random mode chooses ElevenLabs', async () => {
  reset(); await setStrategy('random'); global.fetch = async () => response();
  preferences.randomFrdicPercentage = '100'; await playSpeech('random-no-keys-frdic', 'en');
  preferences.randomFrdicPercentage = '0'; await assert.rejects(playSpeech('random-no-keys-eleven', 'en'), /No active ElevenLabs keys/);
});
test('invalid random percentage is checked only in random mode and before any request', async () => {
  reset(); preferences.randomFrdicPercentage = '101'; let calls = 0; global.fetch = async () => { calls++; return response(); };
  await setStrategy('random'); await assert.rejects(playSpeech('random-invalid-percentage', 'fr'), /0 to 100/); assert.equal(calls, 0);
  await setStrategy('frdic'); await playSpeech('other-mode-invalid-percentage', 'fr'); assert.equal(calls, 1);
});
test('ElevenLabs cached audio ignores Voice ID and key state but distinguishes effective model settings', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; }); await setStrategy('elevenlabs');
  let calls = 0; global.fetch = async () => { calls++; return response(); };
  const text = 'shared-eleven-cache-all-configs';
  await playSpeech(text, 'fr'); assert.equal(calls, 1);
  preferences.elevenFrenchVoiceId = 'NotTheOriginalVoice'; await playSpeech(text, 'fr'); assert.equal(calls, 1);
  preferences.elevenModel = 'eleven_multilingual_v2'; await playSpeech(text, 'fr'); assert.equal(calls, 2);
  preferences.elevenSpeed = '0.85'; await playSpeech(text, 'fr'); assert.equal(calls, 3);
  preferences.elevenStability = '0.9'; await playSpeech(text, 'fr'); assert.equal(calls, 4);
  preferences.elevenSimilarity = '0.1'; await playSpeech(text, 'fr'); assert.equal(calls, 5);
  delete preferences.elevenModel; delete preferences.elevenSpeed; delete preferences.elevenStability; delete preferences.elevenSimilarity;
  await updateKeys((state) => { state.keys = []; });
  preferences.elevenFrenchVoiceId = 'invalid voice';
  const oldRandom = Math.random;
  try {
    Math.random = () => { throw new Error('Should not randomize on cache hit'); };
    await playSpeech(text, 'fr'); assert.equal(calls, 5);
  } finally { Math.random = oldRandom; }
  preferences.elevenStability = 'invalid';
  await assert.rejects(playSpeech(text, 'fr'), /Stability/); assert.equal(calls, 5);
  delete preferences.elevenStability;
  await assert.rejects(playSpeech('uncached-invalid-voice', 'fr'), /Invalid ElevenLabs/); assert.equal(calls, 5);
});
test('cache reflects effective request parameters, ignoring unsupported settings', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; }); await setStrategy('elevenlabs');
  const requests = []; global.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return response(); };
  const text = 'effective-settings-cache-test';
  await playSpeech(text, 'fr');
  preferences.elevenSpeed = '0.8'; await playSpeech(text, 'fr'); assert.equal(requests.length, 1); // v4 speed omitted
  preferences.elevenStability = '0.7'; await playSpeech(text, 'fr'); assert.equal(requests.length, 2);
  preferences.elevenSimilarity = '0.5'; await playSpeech(text, 'fr'); assert.equal(requests.length, 3);
  preferences.elevenStability = '0.65'; preferences.elevenSimilarity = '0.75'; await playSpeech(text, 'fr'); assert.equal(requests.length, 3);
  preferences.elevenModel = 'eleven_v3'; preferences.elevenStability = '0.65'; await playSpeech(text, 'fr'); assert.equal(requests.length, 4);
  preferences.elevenStability = '0.6'; preferences.elevenSimilarity = '0.2'; await playSpeech(text, 'fr'); assert.equal(requests.length, 4); // both map to stability 0.5; similarity omitted
  preferences.elevenModel = 'future_model_v1'; await playSpeech(text, 'fr'); assert.equal(requests.length, 5);
  preferences.elevenStability = 'bad'; preferences.elevenSimilarity = 'bad'; preferences.elevenSpeed = 'bad';
  await playSpeech(text, 'fr'); assert.equal(requests.length, 5); // unknown model sends no voice settings
});
test('ElevenLabs shared cache preserves language distinction', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; }); await setStrategy('elevenlabs');
  const calls = []; global.fetch = async (_url, options) => { calls.push(JSON.parse(options.body)); return response(); };
  await playSpeech('language-shared-spelling', 'fr');
  await playSpeech('language-shared-spelling', 'en');
  await playSpeech('language-shared-spelling', 'fr');
  await playSpeech('language-shared-spelling', 'en');
  assert.equal(calls.length, 2); assert.equal(calls[0].language_code, 'fr'); assert.equal(calls[1].language_code, 'en');
});
test('Frdic English voice-specific cache behavior is unchanged', async () => {
  reset(); await setStrategy('frdic'); let calls = 0; global.fetch = async () => { calls++; return response(); };
  await playSpeech('frdic-english-voice-specific', 'en', 'en_uk_female');
  await playSpeech('frdic-english-voice-specific', 'en', 'en_us_male');
  await playSpeech('frdic-english-voice-specific', 'en', 'en_uk_female');
  assert.equal(calls, 2);
});
test('clear audio cache removes generated files only and preserves settings, temp files and unrelated paths', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; }); await setStrategy('random');
  const keysBefore = storage.get('elevenlabs-keys-v1');
  const originalStrategy = await getStrategy();
  const frdic = await cachedAudio({ provider: 'frdic', text: 'clear-frdic' }, async () => audio);
  const eleven = await cachedAudio({ provider: 'elevenlabs', text: 'clear-eleven' }, async () => audio);
  const dir = path.join(supportPath, 'audio-cache');
  const temp = path.join(dir, `${'a'.repeat(64)}.mp3.${'b'.repeat(36)}.tmp`);
  const unrelated = path.join(dir, 'unrelated.txt');
  const nested = path.join(dir, `${'c'.repeat(64)}.mp3`);
  const outside = path.join(supportPath, 'outside.txt');
  const link = path.join(dir, `${'d'.repeat(64)}.mp3`);
  fs.writeFileSync(temp, 'in progress'); fs.writeFileSync(unrelated, 'keep'); fs.mkdirSync(nested);
  fs.writeFileSync(outside, 'outside'); fs.symlinkSync(outside, link);
  const result = await clearAudioCache();
  assert.ok(result.deleted >= 2); assert.ok(result.bytes >= audio.length * 2); assert.equal(result.failed, 0);
  assert.equal(fs.existsSync(frdic), false); assert.equal(fs.existsSync(eleven), false);
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'keep'); assert.equal(fs.readFileSync(temp, 'utf8'), 'in progress');
  assert.ok(fs.statSync(nested).isDirectory()); assert.ok(fs.lstatSync(link).isSymbolicLink()); assert.equal(fs.readFileSync(outside, 'utf8'), 'outside');
  assert.equal(storage.get('elevenlabs-keys-v1'), keysBefore); assert.equal(await getStrategy(), originalStrategy);
  fs.rmSync(nested, { recursive: true }); fs.unlinkSync(link); fs.unlinkSync(unrelated); fs.unlinkSync(temp); fs.unlinkSync(outside);
  assert.deepEqual(await clearAudioCache(), { deleted: 0, bytes: 0, failed: 0 });
});
test('clear audio cache command requires confirmation and leaves user data alone on cancel', async () => {
  reset(); const file = await cachedAudio({ provider: 'frdic', text: 'cancel-clear' }, async () => audio);
  await clearAudioCacheCommand();
  assert.ok(fs.existsSync(file)); assert.match(confirmOptions.title, /Clear pronunciation audio cache/); assert.equal(hudMessages.length, 0);
  confirmAnswer = true; await clearAudioCacheCommand();
  assert.equal(fs.existsSync(file), false); assert.match(hudMessages.at(-1), /Cleared 1 audio files/);
});
test('clear then request downloads again; missing directory is a successful no-op', async () => {
  reset(); await setStrategy('frdic'); let count = 0; global.fetch = async () => { count++; return response(); };
  await playSpeech('cache-clear-redownload', 'fr'); await playSpeech('cache-clear-redownload', 'fr'); assert.equal(count, 1);
  await clearAudioCache(); await playSpeech('cache-clear-redownload', 'fr'); assert.equal(count, 2);
  fs.rmSync(path.join(supportPath, 'audio-cache'), { recursive: true, force: true });
  assert.deepEqual(await clearAudioCache(), { deleted: 0, bytes: 0, failed: 0 });
});
test('ElevenLabs cache-by-voice defaults off and preserves separate caches when toggled', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; }); await setStrategy('elevenlabs');
  preferences.elevenFrenchVoiceId = 'VoiceA, VoiceB';
  const calls = []; global.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response(); };
  const text = 'voice-toggle-cache-test';
  const originalRandom = Math.random; let sample = 0;
  Math.random = () => sample;
  try {
    // Default shared cache: only the initial miss chooses a voice.
    await playSpeech(text, 'fr'); assert.equal(calls.length, 1); assert.ok(calls[0].url.includes('/VoiceA?'));
    sample = 0.99; await playSpeech(text, 'fr'); assert.equal(calls.length, 1);
    preferences.elevenCacheByVoiceId = true;
    sample = 0; await playSpeech(text, 'fr'); assert.equal(calls.length, 2); assert.ok(calls[1].url.includes('/VoiceA?'));
    sample = 0.99; await playSpeech(text, 'fr'); assert.equal(calls.length, 3); assert.ok(calls[2].url.includes('/VoiceB?'));
    sample = 0; await playSpeech(text, 'fr'); sample = 0.99; await playSpeech(text, 'fr'); assert.equal(calls.length, 3);
    // Model/actual settings and language continue to identify separate audio.
    preferences.elevenStability = '0.8'; await playSpeech(text, 'fr'); assert.equal(calls.length, 4);
    delete preferences.elevenStability; await playSpeech(text, 'fr'); assert.equal(calls.length, 4);
    preferences.elevenModel = 'eleven_multilingual_v2'; await playSpeech(text, 'fr'); assert.equal(calls.length, 5);
    delete preferences.elevenModel; await playSpeech(text, 'fr'); assert.equal(calls.length, 5);
    await playSpeech(text, 'en'); assert.equal(calls.length, 6);
    preferences.elevenCacheByVoiceId = false; preferences.elevenFrenchVoiceId = 'invalid voice';
    await playSpeech(text, 'fr'); assert.equal(calls.length, 6); // original shared entry remains
    preferences.elevenFrenchVoiceId = 'VoiceA, VoiceB'; preferences.elevenCacheByVoiceId = true;
    sample = 0; await playSpeech(text, 'fr'); sample = 0.99; await playSpeech(text, 'fr'); assert.equal(calls.length, 6);
    const state = await updateKeys((s) => s.keys); assert.equal(state[0].requests, 6);
  } finally { Math.random = originalRandom; }
});
test('cache-by-voice keeps one selected ID across retries and never falls back to shared cache', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a'), key('b')]; }); await setStrategy('elevenlabs');
  let calls = []; global.fetch = async (url) => { calls.push(url); return response(); };
  await playSpeech('voice-mode-failure-test', 'fr'); assert.equal(calls.length, 1); // shared entry
  preferences.elevenCacheByVoiceId = true; preferences.elevenFrenchVoiceId = 'VoiceA, VoiceB';
  const originalRandom = Math.random; Math.random = () => 0.99;
  calls = []; global.fetch = async (url) => { calls.push(url); return new Response('failure', { status: 500 }); };
  try {
    await assert.rejects(playSpeech('voice-mode-failure-test', 'fr'), /All attempted ElevenLabs keys failed/);
    assert.equal(calls.length, 2); assert.ok(calls.every((url) => url.includes('/VoiceB?')));
    preferences.elevenCacheByVoiceId = false;
    await playSpeech('voice-mode-failure-test', 'fr'); assert.equal(calls.length, 2); // shared entry still available
  } finally { Math.random = originalRandom; }
});
test('cache-by-voice remains compatible with random provider strategy and provider isolation', async () => {
  reset(); await updateKeys((state) => { state.keys = [key('a')]; }); await setStrategy('random');
  preferences.elevenCacheByVoiceId = true; preferences.elevenFrenchVoiceId = 'VoiceA';
  const calls = []; global.fetch = async (url) => { calls.push(url); return response(); };
  preferences.randomFrdicPercentage = '100'; await playSpeech('voice-provider-random-test', 'fr');
  preferences.randomFrdicPercentage = '0'; await playSpeech('voice-provider-random-test', 'fr');
  await playSpeech('voice-provider-random-test', 'fr');
  assert.equal(calls.length, 2); assert.ok(calls[0].includes('frdic')); assert.ok(calls[1].includes('/VoiceA?'));
});
test.after(() => { fs.rmSync(supportPath, { recursive: true, force: true }); Module._load = originalLoad; });
