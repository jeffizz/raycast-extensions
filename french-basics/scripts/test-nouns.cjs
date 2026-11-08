const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
function load(file) {
  const result = esbuild.buildSync({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node22', external: ['@raycast/api'] });
  const filename = path.resolve(file) + '.test.cjs';
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
  const requireOriginal = mod.require.bind(mod);
  mod.require = (name) => name === '@raycast/api' ? { environment: { supportPath: '/unused-test-support' } } : requireOriginal(name);
  mod._compile(result.outputFiles[0].text, filename); return mod.exports;
}
async function main() {
  const lex = load('src/nouns/lexicon.ts');
  const { formatFrenchSpeechItems } = load('src/tts.ts');
  assert.equal(formatFrenchSpeechItems(['un acteur', 'une actrice']), 'un acteur?\tune actrice');
  assert.equal(formatFrenchSpeechItems([' un chat ']), 'un chat');
  assert.throws(() => formatFrenchSpeechItems(['un chat\tune chatte']));
  const conjugations = ["APPRÉCIER. J'apprécie", 'Tu apprécies', 'Il apprécie', 'Nous apprécions', 'Vous appréciez', 'Ils apprécient'];
  const encoded = Buffer.from(formatFrenchSpeechItems(conjugations), 'utf8').toString('base64');
  assert.equal(encoded, decodeURIComponent('QVBQUsOJQ0lFUi4gSidhcHByw6ljaWU%2fCVR1IGFwcHLDqWNpZXM%2fCUlsIGFwcHLDqWNpZT8JTm91cyBhcHByw6ljaW9ucz8JVm91cyBhcHByw6ljaWV6PwlJbHMgYXBwcsOpY2llbnQ%3d'));
  const assets = path.resolve('assets');
  const find = (word) => lex.lookupNoun(assets, word);
  for (const [input, expected] of [
    ['mécanicien(ne)', 'mécanicien'],
    ['  mécanicien ( ne ) (nom)  ', 'mécanicien'],
    ['un (commentaire) mécanicien(ne)', 'un mécanicien'],
    ['méca(note)ni(autre)cien(ne)', 'mécanicien'],
    ['mécanicien（ne）（test）', 'mécanicien'],
    ['mécanicien(note (imbriquée))', 'mécanicien'],
  ]) assert.equal(lex.cleanNounInput(input), expected);
  for (const invalid of ['mécanicien(ne', 'mécanicien)ne(', 'mécanicien（ne)', 'mécanicien(ne))']) assert.equal(lex.cleanNounInput(invalid), null);
  assert.equal((await find(lex.cleanNounInput('mécanicien ( ne ) (nom)')))[0].entry.lemma, 'mécanicien');
  const mechanic = await find('mécanicien');
  assert.ok((await lex.linkedNouns(assets, mechanic)).some((e) => e.lemma === 'mécanicienne'));
  assert.ok(lex.speechForSelection(mechanic, lex.cleanNounInput('mécanicien(ne)'), await lex.linkedNouns(assets, mechanic)).includes('une mécanicienne'));
  const phrases = async (word) => lex.articlePhrases((await find(word))[0].entry).map((p) => p.text);
  for (const [word, phrase] of [['chat','un chat'],['chat','le chat'],['chat','des chats'],['cheval','des chevaux'],['heure','l’heure'],['haricot','le haricot']]) assert.ok((await phrases(word)).includes(phrase), word + ': ' + phrase);
  assert.ok(!(await phrases('haricot')).includes('l’haricot'));
  assert.ok(!(await phrases('yacht')).includes('l’yacht'));
  assert.equal((await find('les chevaux'))[0].entry.lemma, 'cheval');
  assert.equal((await find('L’HEURE'))[0].entry.lemma, 'heure');
  assert.equal((await find('chats'))[0].entry.lemma, 'chat');
  const modeGenders = (await find('mode')).flatMap((m) => m.entry.gender);
  assert.ok(modeGenders.includes('m') && modeGenders.includes('f'));
  const bakery = (await find('boulangerie'))[0].entry;
  const bakeryPhrases = lex.articlePhrases(bakery);
  assert.deepEqual(lex.translationInputs(bakery), ['une boulangerie']);
  const bakeryTranslations = { 'une boulangerie': '一家面包店' };
  for (const phrase of bakeryPhrases) {
    assert.equal(lex.translationForPhrase(bakery, phrase, bakeryTranslations), phrase.description.includes('单数') ? '一家面包店' : '');
  }
  const reporter = (await find('journaliste'))[0].entry;
  assert.deepEqual(lex.translationInputs(reporter), ['un journaliste', 'une journaliste']);
  assert.equal(lex.translationForPhrase(reporter, lex.articlePhrases(reporter).find((p) => p.text === 'une journaliste'), { 'un journaliste': '男记者', 'une journaliste': '女记者' }), '女记者');
  assert.deepEqual(lex.translationInputs((await find('gens'))[0].entry), []);
  const journaliste = await phrases('journaliste');
  assert.ok(journaliste.includes('un journaliste') && journaliste.includes('une journaliste'));
  assert.ok((await lex.linkedNouns(assets, await find('acteur'))).some((e) => e.lemma === 'actrice'));
  assert.ok((await lex.linkedNouns(assets, await find('actrice'))).some((e) => e.lemma === 'acteur'));
  assert.ok(!(await phrases('gens')).includes('un gens'));
  assert.ok(!(await phrases('amour')).includes('une amour'));
  assert.equal(lex.preferredPhrase(await find('modes'), 'modes').phrase.text, 'des modes');
  assert.equal(lex.preferredPhrase(await find('la mode'), 'la mode').phrase.text, 'la mode');
  assert.deepEqual(lex.speechForSelection(await find('chevaux'), 'chevaux'), ['un cheval']);
  assert.deepEqual(new Set(lex.speechForSelection(await find('mode'), 'mode')), new Set(['un mode', 'une mode']));
  assert.deepEqual(lex.speechForSelection(await find('la mode'), 'la mode'), ['une mode']);
  assert.deepEqual(new Set(lex.speechForSelection(await find('journaliste'), 'journaliste')), new Set(['un journaliste', 'une journaliste']));
  for (const [first, second] of [['Chinois', 'Chinoise'], ['Chinoise', 'Chinois'], ['Anglais', 'Anglaise']]) {
    const match = await find(first);
    const linked = await lex.linkedNouns(assets, match);
    assert.ok(linked.some((entry) => entry.lemma === second && entry.inferredLink), first + ' -> ' + second);
    const spoken = lex.speechForSelection(match, first, linked);
    assert.ok(spoken.some((s) => s.endsWith(' ' + first)) && spoken.some((s) => s.endsWith(' ' + second)));
  }
  const acteur = await find('acteur');
  assert.deepEqual(new Set(lex.speechForSelection(acteur, 'acteur', await lex.linkedNouns(assets, acteur))), new Set(['un acteur', 'une actrice']));
  const actrice = await find('actrice');
  assert.deepEqual(new Set(lex.speechForSelection(actrice, 'actrice', await lex.linkedNouns(assets, actrice))), new Set(['un acteur', 'une actrice']));
  assert.deepEqual(lex.speechForSelection(await find('une journaliste'), 'une journaliste'), ['une journaliste']);
  assert.deepEqual(lex.speechForSelection(await find('gens'), 'gens'), []);
  assert.deepEqual(await find("chat'; DROP TABLE entries; --"), []);
  await assert.rejects(() => lex.lookupNoun('/not/a/database', 'chat'));
  const cours = await find('cours');
  assert.ok(cours.some((m) => m.entry.lemma === 'cour') && cours.some((m) => m.entry.lemma === 'cours'));
  assert.deepEqual(await lex.linkedNouns(assets, cours), []);
  assert.ok(!cours.some((m) => m.entry.lemma === 'course'));
  assert.deepEqual(lex.speechForSelection(cours, 'cours'), []);
  assert.deepEqual(lex.speechPlanForSelection(cours, 'cours'), { phrases: ['un cours'], ambiguous: true });
  assert.deepEqual(lex.speechPlanForSelection([...cours].reverse(), 'cours'), { phrases: ['un cours'], ambiguous: true });
  assert.deepEqual(lex.speechPlanForSelection(await find('un cours'), 'un cours'), { phrases: ['un cours'], ambiguous: false });
  assert.deepEqual(new Set(lex.speechPlanForSelection(await find('journaliste'), 'journaliste').phrases), new Set(['un journaliste', 'une journaliste']));
  assert.deepEqual(lex.speechForSelection(await find('un cours'), 'un cours'), ['un cours']);
  assert.deepEqual(lex.speechForSelection(await find('une cour'), 'une cour'), ['une cour']);
  const { cachedSpeech } = load('src/speech-cache.ts');
  const fs = require('node:fs/promises');
  const directory = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'french-cache-test-'));
  try {
    let downloads = 0;
    const audio = Buffer.alloc(200); audio[0] = 0xff; audio[1] = 0xf3;
    const download = async () => { downloads++; return audio; };
    const [first, second] = await Promise.all([cachedSpeech(directory, 'un chat', download), cachedSpeech(directory, 'un chat', download)]);
    assert.equal(first, second); assert.equal(downloads, 1);
    await cachedSpeech(directory, 'un chat', download); assert.equal(downloads, 1);
    await fs.writeFile(first, 'invalid cache');
    await cachedSpeech(directory, 'un chat', download); assert.equal(downloads, 2);
    await assert.rejects(() => cachedSpeech(directory, 'bad', async () => Buffer.from('not audio')));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
  const { translateNouns, cachedNounTranslations } = load('src/nouns/deepl.ts');
  const original = global.fetch; const requests = [];
  global.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ translations: [{ text: '猫' }] }) }; };
  try {
    assert.deepEqual(await translateNouns(['un chat'], 'test-key', 'free'), ['猫']);
    assert.equal(requests[0].url, 'https://api-free.deepl.com/v2/translate');
    assert.equal(requests[0].options.headers.Authorization, 'DeepL-Auth-Key test-key');
    await translateNouns(['un chat'], 'test-key', 'pro');
    assert.equal(requests[1].url, 'https://api.deepl.com/v2/translate');
    const cache = new Map();
    const store = { getItem: async (k) => cache.get(k), setItem: async (k, v) => { cache.set(k, v); } };
    const before = requests.length;
    assert.deepEqual(await cachedNounTranslations(['un chat', 'un chat'], 'test-key', 'free', store), { 'un chat': '猫' });
    assert.equal(requests.length, before + 1);
    await cachedNounTranslations(['un chat'], 'test-key', 'free', store);
    await cachedNounTranslations(['un chat'], undefined, 'free', store);
    assert.equal(requests.length, before + 1);
    global.fetch = async () => ({ ok: false, status: 403 });
    await assert.rejects(() => translateNouns(['un chat'], 'test-key', 'free'), /HTTP 403/);
  } finally { global.fetch = original; }
  console.log('SQLite noun lookup, selection, speech and mocked DeepL tests passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
