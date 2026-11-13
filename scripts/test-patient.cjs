// Execute com: node --test scripts/test-*.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const context = vm.createContext({ URLSearchParams });
  for (const file of ['domain', 'storage', 'store', 'icons', 'media', 'ui', 'screens-patient'])
    vm.runInContext(readFileSync(path.join(__dirname, `../js/${file}.js`), 'utf8'), context);
  const M = context.MeuRemedio;
  const state = M.domain.createSeed(new Date(2026, 10, 13, 8));
  state.role = 'patient';
  const repository = { getPhoto: () => null };
  const render = (name, currentState = state, query = '') => M.screens[name]({
    state: currentState, repository, route: { path: `/patient/${name}`, params: new URLSearchParams(query) },
  });
  return { ...M, state, render, context };
}

// Adaptador mínimo do DOM para exercitar o app real, sem navegador ou dependências.
// Não mede layout: a verificação visual continua sendo uma etapa separada.
function startApp(state, hash = '#/patient', values = new Map()) {
  const { context, storage } = setup();
  const documentEvents = {}, windowEvents = {};
  const scroller = { scrollTop: 0 };
  const element = (scope) => ({
    innerHTML: '',
    contains: (target) => target.scope === scope,
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector(selector) {
      if (selector === 'h1') return { textContent: this.innerHTML.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1], focus() {} };
      if (selector === '.screen-scroll, .profiles') return scroller;
      return null;
    },
  });
  const nodes = Object.fromEntries(['app', 'notices', 'simulation', 'confirmation', 'automatic-audio', 'simulation-time', 'simulation-date'].map((name) => [name, element(name)]));
  nodes.simulation.innerHTML = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  context.document = {
    getElementById: (name) => nodes[name],
    addEventListener: (name, callback) => { documentEvents[name] = callback; },
    visibilityState: 'visible',
  };
  context.addEventListener = (name, callback) => { windowEvents[name] = callback; };
  context.location = { hash };
  const entries = [{ state: { mrDepth: 0 }, hash }];
  let index = 0;
  context.history = {
    get state() { return entries[index].state; },
    replaceState(value, _, url) { entries[index] = { state: value, hash: url }; context.location.hash = url; },
    pushState(value, _, url) { entries.splice(++index, entries.length, { state: value, hash: url }); context.location.hash = url; },
    back() { if (index > 0) { context.location.hash = entries[--index].hash; windowEvents.hashchange(); } },
  };
  if (!values.has(storage.STATE_KEY)) values.set(storage.STATE_KEY, JSON.stringify(state));
  values.set(storage.AUTO_AUDIO_KEY, 'false');
  context.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  for (const name of ['screens-caregiver', 'screens-editor', 'app'])
    vm.runInContext(readFileSync(path.join(__dirname, `../js/${name}.js`), 'utf8'), context);
  return {
    values,
    get hash() { return context.location.hash; },
    get html() { return nodes.app.innerHTML; },
    get state() { return JSON.parse(values.get(storage.STATE_KEY)); },
    click(action, { scope = 'app', repeat = 1 } = {}) {
      const attributes = [...nodes[scope].innerHTML.matchAll(/<button\b([^>]*)>/g)]
        .map((match) => match[1]).find((value) => value.includes(`data-action="${action}"`));
      assert.ok(attributes, `A ação ${action} precisa estar disponível na tela`);
      const target = { scope, dataset: { action, id: attributes.match(/data-id="([^"]*)"/)?.[1] }, closest: () => target };
      for (let i = 0; i < repeat; i++) documentEvents.click({ target });
    },
  };
}

test('ajuda vincula a dose e o cuidador, sem registrar tomada', () => {
  const { domain: d, state } = setup();
  const dose = d.currentDose(state);
  const sent = d.appReducer(state, { type: 'help', id: 'request-1', doseId: dose.id });
  const request = d.helpRequest(sent, dose.id);
  assert.equal(request.id, 'request-1');
  assert.equal(request.doseId, dose.id);
  assert.equal(request.caregiver.name, 'Carlos');
  assert.equal(request.read, false);
  assert.equal(sent.doses, state.doses);
  assert.equal(d.doseStatus(dose, sent.now), 'pending');
  assert.throws(() => d.appReducer(state, { type: 'help', id: 'bad', doseId: 'inexistente' }), /Dose não encontrada/);
});

test('pedidos repetidos, inclusive após persistir e recarregar, geram um único evento', () => {
  const { domain: d, state, storage, createStore } = setup();
  const dose = d.currentDose(state);
  const values = new Map();
  const repository = storage.createRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  repository.save(state);
  let store = createStore(repository);
  assert.equal(store.dispatch({ type: 'help', id: 'first', doseId: dose.id }), null);
  store = createStore(repository);
  assert.equal(d.helpRequest(store.state, dose.id).id, 'first');
  assert.equal(store.dispatch({ type: 'help', id: 'second', doseId: dose.id }), null);
  assert.equal(store.state.events.filter((event) => event.kind === 'help').length, 1);
  const another = d.dosesForDay(store.state)[1];
  store.dispatch({ type: 'help', id: 'another', doseId: another.id });
  assert.equal(store.state.events.filter((event) => event.kind === 'help').length, 2);
});

test('pedido geral é único por dia e não bloqueia pedidos por dose', () => {
  const { domain: d, state } = setup();
  const first = d.appReducer(state, { type: 'help', id: 'general-1' });
  assert.equal(d.appReducer(first, { type: 'help', id: 'general-2' }), first);
  const withDose = d.appReducer(first, { type: 'help', id: 'dose-1', doseId: d.currentDose(first).id });
  assert.equal(withDose.events.filter((event) => event.kind === 'help').length, 2);
  const tomorrow = { ...withDose, now: d.atTime(d.addDays(d.dayKey(state.now), 1), '08:00') };
  assert.equal(d.helpRequest(tomorrow), undefined);
  assert.equal(d.helpRequest(d.appReducer(tomorrow, { type: 'help', id: 'tomorrow' })).id, 'tomorrow');
});

test('snapshot mantém o destinatário original e dados antigos continuam válidos', () => {
  const { domain: d, state, storage, render, media } = setup();
  const sent = d.appReducer(state, { type: 'help', id: 'snapshot', doseId: d.currentDose(state).id });
  const changed = { ...sent, primaryCaregiverId: 'marcia', caregivers: sent.caregivers.filter((item) => item.id !== 'carlos'), activeCaregiverId: 'marcia' };
  assert.match(render('help', changed, 'request=snapshot'), /Foto de Carlos/);
  assert.match(media.patientSpeech({ state: changed, route: { path: '/patient/help', params: new URLSearchParams('request=snapshot') } }), /Carlos/);
  const legacy = JSON.parse(JSON.stringify(state));
  legacy.events.push({ id: 'legacy', kind: 'help', at: state.now, title: 'Ajuda', detail: 'Pedido antigo', read: true });
  assert.equal(storage.isAppState(legacy), true);
  assert.equal(storage.isAppState(JSON.parse(JSON.stringify(sent))), true);
  assert.equal(d.helpRequest(legacy).id, 'legacy');
});

test('tela do remédio mostra somente ações permitidas e um acesso a Meu dia', () => {
  const { domain: d, state, render } = setup();
  const dose = d.currentDose(state);
  const pending = render('patient');
  assert.match(pending, /Hora do remédio/);
  assert.match(pending, /data-action="patient-confirm"/);
  assert.equal((pending.match(/data-action="day"/g) || []).length, 1);
  const waiting = { ...state, now: d.atTime(d.dayKey(state.now), '07:00') };
  assert.match(render('patient', waiting), /Próximo remédio/);
  assert.doesNotMatch(render('patient', waiting), /data-action="patient-confirm"/);
  const late = { ...state, now: d.atTime(d.dayKey(state.now), '08:16') };
  assert.match(render('patient', late), /Passou da hora/);
  assert.match(render('patient', late), />Pedir ajuda</);
  assert.doesNotMatch(render('patient', late), /data-action="patient-confirm"/);
  assert.throws(() => d.appReducer(late, { type: 'confirm', doseId: dose.id, by: state.patient.id }), /Peça ajuda/);
  assert.throws(() => d.appReducer(waiting, { type: 'confirm', doseId: dose.id, by: state.patient.id }), /ainda não chegou/);
  const sent = d.appReducer(late, { type: 'help', id: 'late', doseId: dose.id });
  const afterReload = JSON.parse(JSON.stringify(sent));
  assert.match(render('patient', afterReload), /Pedido enviado/);
  assert.doesNotMatch(render('patient', afterReload), />Pedir ajuda</);
  assert.match(render('help', afterReload, 'request=late'), />Entendi</);
  assert.doesNotMatch(render('help', afterReload, 'request=late'), /request-help/);
});

test('sucesso considera outra dose no mesmo horário antes de um horário futuro', () => {
  const { domain: d, state, render } = setup();
  const dose = d.currentDose(state);
  state.doses.push({ ...dose, id: `${dose.id}:extra`, name: 'Outra dose das oito', photo: { kind: 'sample', value: 'lunch' } });
  const confirmed = d.appReducer(state, { type: 'confirm', doseId: dose.id, by: state.patient.id });
  const html = render('success', confirmed, `dose=${encodeURIComponent(dose.id)}`);
  assert.match(html, /Muito bem!/);
  assert.match(html, /Foto de Outra dose das oito/);
  assert.doesNotMatch(html, /Foto de Comprimido oval/);
  assert.equal((html.match(/data-action="day"/g) || []).length, 1);
  const completed = { ...confirmed, doses: confirmed.doses.map((item) => ({ ...item, confirmedAt: state.now })) };
  assert.match(render('success', completed, `dose=${encodeURIComponent(dose.id)}`), /Tudo em dia por hoje/);
  assert.match(render('patient', completed), /Tudo em dia!/);
});

test('Meu dia combina os quatro estados e lê as linhas sem permitir confirmar', () => {
  const { domain: d, state, render } = setup();
  const today = d.dosesForDay(state);
  state.now = d.atTime(d.dayKey(state.now), '12:00');
  state.doses = state.doses.map((dose) => dose.id === today[2].id ? { ...dose, confirmedAt: state.now } : dose);
  const html = render('day');
  for (const status of ['pending', 'missed', 'completed', 'scheduled'])
    assert.match(html, new RegExp(`patient-day-dose ${status}`));
  assert.equal((html.match(/data-action="speak-dose"/g) || []).length, 4);
  assert.doesNotMatch(html, /data-action="patient-confirm"/);
  assert.match(render('day', { ...state, doses: [] }), /Dia sem doses/);
});

test('fotos indisponíveis mantêm miniaturas compactas e nomes são escapados', () => {
  const { domain: d, state, render } = setup();
  const dose = d.currentDose(state);
  dose.photo = { kind: 'local', value: 'missing' };
  dose.name = '<script>alert(1)</script>';
  const html = render('day');
  assert.match(html, /photo-fallback patient-thumbnail/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('um toque envia ajuda; Entendi, voltar e recarga mantêm um único pedido', () => {
  const { domain: d, state } = setup();
  state.now = d.atTime(d.dayKey(state.now), '08:16');
  let app = startApp(state);
  app.click('help', { repeat: 2 });
  assert.match(app.hash, /^#\/patient\/help\?request=/);
  assert.match(app.html, />Entendi</);
  assert.equal(app.state.events.filter((event) => event.kind === 'help').length, 1);
  app = startApp(state, app.hash, app.values);
  assert.match(app.html, /Pedido enviado/);
  app.click('patient-home');
  assert.equal(app.hash, '#/patient');
  assert.match(app.html, /Pedido enviado/);
  app.click('day');
  app.click('back');
  assert.equal(app.hash, '#/patient');
  assert.match(app.html, /Pedido enviado/);
  app.click('help'); // Atalho do header também reaproveita o pedido.
  assert.equal(app.state.events.filter((event) => event.kind === 'help').length, 1);
  app.click('patient-home');
  app.click('next-day', { scope: 'simulation' });
  assert.doesNotMatch(app.html, /Pedido enviado/);
  assert.match(app.html, /Hora do remédio/);
});

test('acessar confirmação sem pedido válido volta ao início e não envia ajuda', () => {
  const { state } = setup();
  for (const hash of ['#/patient/help', '#/patient/help?request=inexistente']) {
    const app = startApp(state, hash);
    assert.equal(app.hash, '#/patient');
    assert.equal(app.state.events.filter((event) => event.kind === 'help').length, 0);
  }
});

test('clique duplo em Já tomei registra uma dose e abre o sucesso simplificado', () => {
  const { state, domain: d } = setup();
  const dose = d.currentDose(state);
  const app = startApp(state);
  app.click('patient-confirm', { repeat: 2 });
  assert.match(app.hash, /^#\/patient\/success\?dose=/);
  assert.match(app.html, /Muito bem!/);
  assert.equal(app.state.events.filter((event) => event.kind === 'completed' && event.doseId === dose.id).length, 1);
  app.click('day');
  assert.match(app.html, /patient-day-dose completed/);
  app.click('back');
  assert.equal(app.hash, '#/patient');
  assert.match(app.html, /Próximo remédio/);
});
