// Execute com: node --test scripts/test-audio.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ voice = true, audio = true } = {}) {
  const spoken = [], sounds = [], messages = [];
  let currentSpeech = null;
  const context = vm.createContext({ URLSearchParams });
  if (audio) context.Audio = class {
    constructor(src) { this.src = src; sounds.push(this); }
    pause() { this.playing = false; }
    play() {
      if (this.failure) return Promise.reject({ name: this.failure });
      this.playing = true;
      return Promise.resolve();
    }
    finish() { this.playing = false; this.onended?.(); }
  };
  if (voice) {
    context.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; }
    };
    context.speechSynthesis = {
      getVoices: () => [{ lang: 'en-US' }, { lang: 'pt-BR' }],
      cancel() {
        const old = currentSpeech;
        currentSpeech = null;
        old?.onerror?.({ error: 'canceled' });
      },
      speak(speech) { currentSpeech = speech; spoken.push(speech); },
    };
  }
  for (const file of ['domain.js', 'storage.js', 'store.js', 'media.js'])
    vm.runInContext(readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  const { media, domain, storage, createStore } = context.MeuRemedio;
  media.onMessage((message) => messages.push(message));
  const state = domain.createSeed(new Date(2026, 10, 11, 8));
  const text = (path, query = '', extra = {}) => media.patientSpeech({
    state, route: { path, params: new URLSearchParams(query) }, ...extra,
  });
  return { media, domain, storage, createStore, state, text, spoken, sounds, messages };
}

test('preferência começa ligada, persiste separadamente e sobrevive ao reset', () => {
  const { storage, createStore } = setup();
  const values = new Map();
  const backend = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index],
    get length() { return values.size; },
  };
  const repository = storage.createRepository(backend);
  assert.equal(repository.loadAutoAudio(), true);
  repository.saveAutoAudio(false);
  const store = createStore(repository);
  store.reset();
  assert.equal(storage.createRepository(backend).loadAutoAudio(), false);
  assert.equal(JSON.parse(values.get(storage.STATE_KEY)).version, 1);
  repository.saveAutoAudio(true);
  assert.equal(repository.loadAutoAudio(), true);
});

test('armazenamento indisponível não impede usar a preferência', () => {
  const { storage } = setup();
  const repository = storage.createRepository({
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  });
  assert.equal(repository.loadAutoAudio(), true);
  assert.doesNotThrow(() => repository.saveAutoAudio(false));
});

test('textos correspondem às telas e validam a confirmação da dose', () => {
  const { state, text, domain, media } = setup();
  const dose = domain.currentDose(state);
  assert.equal(text('/patient'), media.doseSpeech(dose, domain.doseStatus(dose, state.now)));
  assert.match(text('/patient/day'), /toque em Ouvir no cartão/);
  assert.ok(!text('/patient/day').includes(dose.name));
  assert.match(text('/patient/help'), /Carlos/);
  assert.match(text('/patient/help', '', { helpSent: true }), /foi registrado/);
  assert.match(text('/patient/success', `dose=${dose.id}`), /não encontrada/);
  dose.confirmedAt = state.now;
  assert.match(text('/patient/success', `dose=${dose.id}`), /já está registrada/);
  assert.match(text('/patient/success', 'dose=inexistente'), /não encontrada/);
  state.doses = [];
  assert.match(text('/patient'), /Tudo em dia/);
  assert.match(text('/patient/day'), /não há doses/);
  assert.equal(text('/profiles'), null);
  assert.equal(text('/caregiver'), null);
});

test('narração automática aguarda o sinal e mantém a voz e a velocidade', () => {
  const { media, sounds, spoken } = setup();
  media.play('alert');
  media.speak('Hora do remédio', { automatic: true });
  assert.equal(spoken.length, 0);
  sounds[0].finish();
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].text, 'Hora do remédio');
  assert.equal(spoken[0].lang, 'pt-BR');
  assert.equal(spoken[0].voice.lang, 'pt-BR');
  assert.equal(spoken[0].rate, 0.82);
});

test('sinal de sucesso também termina antes da narração', () => {
  const { media, sounds, spoken } = setup();
  media.play('success');
  media.speak('Dose registrada', { automatic: true });
  assert.equal(spoken.length, 0);
  sounds[1].finish();
  assert.equal(spoken[0].text, 'Dose registrada');
});

test('sinal recebido durante a fala aguarda seu fim, sem repetir a narração', () => {
  const { media, sounds, spoken } = setup();
  media.speak('Meu dia', { automatic: true });
  media.play('alert');
  assert.ok(!sounds[0].playing);
  spoken[0].onend();
  assert.equal(sounds[0].playing, true);
  sounds[0].finish();
  assert.equal(spoken.length, 1);
});

test('navegação descarta a fala e os eventos de áudio da tela anterior', () => {
  const { media, sounds, spoken, messages } = setup();
  media.play('success');
  const staleEnd = sounds[1].onended;
  media.speak('Dose registrada', { automatic: true });
  media.stopSpeech();
  media.stopSounds();
  media.speak('Meu dia', { automatic: true });
  staleEnd();
  const staleSpeech = spoken[0];
  media.stopSpeech();
  media.speak('Ajuda', { automatic: true });
  staleSpeech.onerror({ error: 'not-allowed' });
  staleSpeech.onend();
  media.unlock();
  assert.deepEqual(spoken.map((speech) => speech.text), ['Meu dia', 'Ajuda']);
  assert.equal(messages.length, 0);
});

test('bloqueio de voz repete somente a fala atual na próxima interação', () => {
  const { media, spoken } = setup();
  media.speak('Tela anterior', { automatic: true });
  spoken[0].onerror({ error: 'not-allowed' });
  media.stopSpeech();
  media.speak('Tela atual', { automatic: true });
  spoken[1].onerror({ error: 'not-allowed' });
  media.unlock();
  assert.deepEqual(spoken.map((speech) => speech.text), ['Tela anterior', 'Tela atual', 'Tela atual']);
});

test('bloqueio do sinal mantém a ordem sinal, depois voz', async () => {
  const { media, sounds, spoken } = setup();
  sounds[0].failure = 'NotAllowedError';
  media.play('alert');
  media.speak('Hora do remédio', { automatic: true });
  await Promise.resolve();
  assert.equal(spoken.length, 0);
  sounds[0].failure = null;
  media.unlock();
  assert.equal(sounds[0].playing, true);
  assert.equal(spoken.length, 0);
  sounds[0].finish();
  assert.equal(spoken[0].text, 'Hora do remédio');
});

test('rejeição tardia do áudio abandonado não restaura sua fala', async () => {
  const { media, sounds, spoken, messages } = setup();
  sounds[0].failure = 'NotAllowedError';
  media.play('alert');
  media.speak('Tela anterior', { automatic: true });
  media.stopSpeech();
  media.stopSounds();
  media.speak('Tela atual', { automatic: true });
  await Promise.resolve();
  media.unlock();
  assert.deepEqual(spoken.map((speech) => speech.text), ['Tela atual']);
  assert.equal(messages.length, 0);
});

test('desligar cancela a fala automática pendente e preserva a leitura manual', () => {
  const { media, sounds, spoken } = setup();
  media.play('alert');
  media.speak('Automática', { automatic: true });
  media.stopSpeech(true);
  sounds[0].finish();
  media.unlock();
  assert.equal(spoken.length, 0);
  media.speak('Manual');
  media.stopSpeech(true);
  assert.equal(spoken.length, 1);
  media.play('alert');
  assert.ok(!sounds[0].playing);
  spoken[0].onend();
  assert.equal(sounds[0].playing, true);
});

test('leitura manual substitui a automática e interrompe o sinal imediatamente', () => {
  const { media, sounds, spoken } = setup();
  media.play('alert');
  media.speak('Automática', { automatic: true });
  media.speak('Manual');
  assert.equal(sounds[0].playing, false);
  assert.deepEqual(spoken.map((speech) => speech.text), ['Manual']);
});

test('desligar a narração libera o alerta que estava aguardando a fala', () => {
  const { media, sounds, spoken } = setup();
  media.speak('Automática', { automatic: true });
  media.play('alert');
  assert.ok(!sounds[0].playing);
  media.stopSpeech(true);
  assert.equal(sounds[0].playing, true);
  sounds[0].finish();
  assert.equal(spoken.length, 1);
});

test('falha no sinal libera a voz; ausência de voz gera aviso sem exceção', async () => {
  const { media, sounds, spoken } = setup();
  sounds[0].failure = 'NotSupportedError';
  media.play('alert');
  media.speak('Orientação', { automatic: true });
  await Promise.resolve();
  assert.equal(spoken[0].text, 'Orientação');
  const unsupported = setup({ voice: false, audio: false });
  assert.doesNotThrow(() => unsupported.media.speak('Orientação', { automatic: true }));
  assert.match(unsupported.messages[0], /Áudio indisponível/);
});
