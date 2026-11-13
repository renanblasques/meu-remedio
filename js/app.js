/** Navegação, eventos e apresentação. Não requer servidor, módulos ES ou instalação. */
(function (root) {
  'use strict';
  const M = root.MeuRemedio,
    d = M.domain,
    u = M.ui,
    media = M.media;
  const repository = M.storage.createRepository();
  const store = M.createStore(repository);
  const app = document.getElementById('app'),
    notices = document.getElementById('notices'),
    simulation = document.getElementById('simulation');
  const dialog = document.getElementById('confirmation');
  const seenAlerts = new Set();
  let previousRoute = '',
    autoAudio = repository.loadAutoAudio(),
    confirmLocked = false,
    dialogCallback = null,
    returnFocus = null;
  const ui = {
    messages: {},
    patientError: null,
    medicationError: null,
    medicationDraft: null,
    caregiverDraft: { name: '', relationship: '' },
    caregiverError: null,
    history: { day: null, filter: null },
    photoBusy: false,
    mediaMessage: null,
  };
  const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const defaultSchedule = () => ({ id: id(), time: '08:00', quantity: 1, period: 'morning' });
  const home = () =>
    store.state?.role === 'patient'
      ? '/patient'
      : store.state?.role === 'caregiver'
        ? '/caregiver'
        : '/profiles';
  function parseRoute() {
    const [path, query = ''] = location.hash.slice(1).split('?');
    return {
      path: path || home(),
      params: new URLSearchParams(query),
      key: location.hash || `#${home()}`,
    };
  }
  function navigate(path, replace = false, sound = null) {
    const depth = history.state?.mrDepth || 0;
    history[replace ? 'replaceState' : 'pushState'](
      { mrDepth: replace ? depth : depth + 1, mrRole: store.state?.role },
      '',
      `#${path}`,
    );
    render(true, sound);
  }
  function back() {
    if ((history.state?.mrDepth || 0) > 0) history.back();
    else navigate(parseRoute().path === '/medication' ? '/caregiver/medications' : home(), true);
  }
  function updateNotices() {
    notices.innerHTML = `${store.error ? `<div class="global-notice" role="status"><span>${u.escape(store.error)}</span>${store.state ? '<button type="button" data-action="retry-save">Tentar salvar novamente</button>' : ''}</div>` : ''}${ui.mediaMessage ? `<div class="global-notice" role="status"><span>${u.escape(ui.mediaMessage)}</span><button type="button" data-action="close-media" aria-label="Fechar aviso de áudio">Fechar</button></div>` : ''}`;
  }
  function updateSimulation() {
    const state = store.state;
    const audioControl = document.getElementById('automatic-audio');
    audioControl.checked = autoAudio;
    audioControl.disabled = !state;
    const time = document.getElementById('simulation-time');
    time.textContent = state ? d.clockLabel(state.now) : '--:--';
    time.dateTime = state?.now || '';
    document.getElementById('simulation-date').textContent = state
      ? d.dateLabel(d.dayKey(state.now), true)
      : 'Reinicie a demonstração para recuperar os dados.';
    simulation.querySelectorAll('button').forEach((button) => {
      button.disabled = !state && button.dataset.action !== 'reset';
    });
  }
  function normalize(route) {
    const state = store.state;
    if (!state || route.path === '/profiles') return route;
    const needsPatient = route.path.startsWith('/patient');
    const needsCaregiver = route.path.startsWith('/caregiver') || route.path === '/medication';
    if (
      (needsPatient && state.role !== 'patient') ||
      (needsCaregiver && state.role !== 'caregiver') ||
      !state.role
    ) {
      const path = state.role ? home() : '/profiles';
      history.replaceState({ mrDepth: 0, mrRole: state.role }, '', `#${path}`);
      return parseRoute();
    }
    if (
      route.path === '/patient/help' &&
      !state.events.some(
        (event) => event.kind === 'help' && event.id === route.params.get('request'),
      )
    ) {
      history.replaceState(history.state, '', '#/patient');
      return parseRoute();
    }
    return route;
  }
  function prepareDraft(route) {
    if (route.path !== '/medication') {
      ui.medicationDraft = null;
      ui.photoBusy = false;
      return;
    }
    const medicationId = route.params.get('id');
    const existing = store.state.medications.find(
      (item) => item.id === medicationId && item.active,
    );
    ui.medicationDraft =
      medicationId && !existing
        ? null
        : existing
          ? {
              ...existing,
              editing: true,
              schedules: existing.schedules.map((item) => ({ ...item })),
            }
          : {
              id: `medicine-${id()}`,
              name: '',
              photo: { kind: 'sample', value: 'morning' },
              schedules: [defaultSchedule()],
              editing: false,
              active: true,
            };
    ui.medicationError = null;
  }
  function context(route) {
    return { ...ui, state: store.state, repository, route };
  }
  const routes = {
    '/profiles': 'profiles',
    '/patient': 'patient',
    '/patient/success': 'success',
    '/patient/day': 'day',
    '/patient/help': 'help',
    '/caregiver': 'today',
    '/caregiver/medications': 'medications',
    '/caregiver/history': 'history',
    '/caregiver/events': 'events',
    '/caregiver/more': 'care',
    '/medication': 'medication',
  };
  function narrateScreen(route) {
    if (!autoAudio || store.state?.role !== 'patient') return;
    const text = media.patientSpeech(context(route));
    if (text) media.speak(text, { automatic: true });
  }
  function render(focusHeading = false, sound = null) {
    updateNotices();
    updateSimulation();
    if (!store.state) {
      media.stopSpeech();
      media.stopSounds();
      app.innerHTML = `<main class="loading"><h1 tabindex="-1">Dados indisponíveis</h1><p>${u.escape(store.error)}</p><p>Use “Reiniciar demonstração” no painel de simulação.</p></main>`;
      slideTabIndicator();
      return;
    }
    let route = normalize(parseRoute());
    if (!location.hash) {
      history.replaceState({ mrDepth: 0, mrRole: store.state.role }, '', `#${route.path}`);
      route = parseRoute();
    }
    const changed = previousRoute !== route.key;
    const active = document.activeElement;
    const focusId = active?.id;
    const selection =
      typeof active?.selectionStart === 'number'
        ? [active.selectionStart, active.selectionEnd]
        : null;
    const actionFocus = active?.dataset?.action
      ? { action: active.dataset.action, id: active.dataset.id, period: active.dataset.period }
      : null;
    const scroll = !changed ? app.querySelector('.screen-scroll, .profiles')?.scrollTop || 0 : 0;
    if (changed) {
      media.stopSpeech();
      media.stopSounds();
      prepareDraft(route);
      ui.patientError = null;
      if (route.path === '/patient') confirmLocked = false;
      if (dialog.open) dialog.close();
    }
    previousRoute = route.key;
    const view = M.screens[routes[route.path]];
    app.innerHTML = view
      ? view(context(route))
      : u.screen(
          context(route),
          'Vamos voltar ao início',
          `${u.empty('Esta tela não foi encontrada', 'Toque abaixo para continuar.', 'home-outline')}${u.button('Voltar ao início', 'home')}`,
        );
    const scroller = app.querySelector('.screen-scroll, .profiles');
    if (scroller) scroller.scrollTop = scroll;
    if (changed || focusHeading) app.querySelector('h1')?.focus({ preventScroll: true });
    else {
      const target =
        (focusId && document.getElementById(focusId)) ||
        (actionFocus &&
          [...app.querySelectorAll('[data-action]')].find(
            (element) =>
              element.dataset.action === actionFocus.action &&
              element.dataset.id === actionFocus.id &&
              element.dataset.period === actionFocus.period,
          ));
      if (target && !target.disabled) {
        target.focus({ preventScroll: true });
        if (selection && typeof target.setSelectionRange === 'function')
          target.setSelectionRange(...selection);
      }
    }
    document.title = `${app.querySelector('h1')?.textContent || 'Meu Remédio'} · Meu Remédio`;
    slideTabIndicator();
    if (sound) media.play(sound);
    else alertIfNeeded();
    if (changed) narrateScreen(route);
  }
  function slideTabIndicator() {
    const tabs = app.querySelector('.tabs');
    if (!tabs) {
      slideTabIndicator.from = undefined;
      return;
    }
    const index = [...tabs.querySelectorAll('.nav-item')].findIndex(
      (item) => item.getAttribute('aria-current') === 'page',
    );
    if (index < 0) return;
    const from = slideTabIndicator.from;
    slideTabIndicator.from = index;
    const indicator = tabs.querySelector('.tab-indicator');
    if (!indicator || from === undefined || from === index) {
      tabs.style.setProperty('--tab-index', String(index));
      return;
    }
    tabs.style.setProperty('--tab-index', String(from));
    indicator.style.transition = 'none';
    indicator.getBoundingClientRect();
    indicator.style.transition = '';
    tabs.style.setProperty('--tab-index', String(index));
  }
  function alertIfNeeded() {
    if (
      store.state?.role !== 'patient' ||
      !parseRoute().path.startsWith('/patient') ||
      document.visibilityState !== 'visible'
    )
      return;
    const dose = d.currentDose(store.state);
    if (!dose) return;
    const status = d.doseStatus(dose, store.state.now);
    if (!['pending', 'missed'].includes(status)) return;
    const key = `${dose.id}:${status}:${dose.resendCount}`;
    if (seenAlerts.has(key)) return;
    seenAlerts.add(key);
    media.play('alert');
  }
  function openDialog({ title, description, label = 'Confirmar', danger = false, confirm }) {
    returnFocus = document.activeElement;
    dialogCallback = confirm;
    dialog.innerHTML = `<form method="dialog"><h2 id="dialog-title">${u.escape(title)}</h2><p id="dialog-description">${u.escape(description)}</p><button class="button ${danger ? 'danger' : ''}" value="confirm" type="submit">${u.escape(label)}</button><button class="button quiet" value="cancel" type="submit" autofocus>Cancelar</button></form>`;
    dialog.showModal();
    dialog.querySelector('[value="cancel"]').focus();
  }
  dialog.addEventListener('submit', (event) => {
    event.preventDefault();
    const confirm = event.submitter?.value === 'confirm',
      callback = dialogCallback;
    dialogCallback = null;
    dialog.close();
    if (confirm) callback?.();
  });
  dialog.addEventListener('close', () => {
    dialogCallback = null;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else app.querySelector('h1')?.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [
      ...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]'),
    ];
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  function actionError(key, failure, success) {
    ui.messages[key] = { text: failure || success, error: !!failure };
    render();
  }
  function confirmByCaregiver(doseId) {
    const dose = store.state.doses.find((item) => item.id === doseId);
    if (!dose) return;
    openDialog({
      title: 'A dose já foi tomada?',
      description: `Registre somente se a tomada de ${dose.name}, prevista para ${d.clockLabel(dose.scheduledAt)}, já foi informada. O registro ficará identificado com o cuidador ativo.`,
      label: 'Sim, registrar tomada informada',
      confirm: () =>
        actionError(
          doseId,
          store.dispatch({ type: 'confirm', doseId, by: store.state.activeCaregiverId }),
          'Tomada informada registrada.',
        ),
    });
  }
  function scheduleUpdate(scheduleId, change) {
    if (!ui.medicationDraft) return;
    ui.medicationDraft.schedules = ui.medicationDraft.schedules.map((item) =>
      item.id === scheduleId ? { ...item, ...change(item) } : item,
    );
    render();
  }
  function saveMedication() {
    if (!ui.medicationDraft || ui.photoBusy) return;
    const draft = ui.medicationDraft;
    const failure = store.dispatch(
      {
        type: 'saveMedication',
        medication: {
          id: draft.id,
          name: draft.name,
          photo: draft.photo,
          schedules: draft.schedules.map((item) => ({ ...item, id: id() })),
          active: true,
          effectiveFrom: store.state.now,
        },
      },
      true,
    );
    if (failure) {
      ui.medicationError = failure;
      render();
      app.querySelector('#medication-form .notice.error')?.scrollIntoView({ block: 'nearest' });
    } else navigate('/caregiver/medications', true);
  }
  async function selectPhoto(input) {
    const file = input.files?.[0],
      draft = ui.medicationDraft;
    if (!file || !draft) return;
    ui.photoBusy = true;
    ui.medicationError = null;
    render();
    try {
      const data = await media.readPhoto(file);
      if (ui.medicationDraft !== draft) return;
      draft.photo = repository.putPhoto(data, id());
    } catch (cause) {
      if (ui.medicationDraft === draft)
        ui.medicationError =
          cause.name === 'QuotaExceededError' || cause.name === 'SecurityError'
            ? 'Não foi possível guardar a foto no navegador. Seu formulário foi mantido. Tente uma imagem menor ou uma foto de exemplo.'
            : cause.message || 'Não foi possível guardar essa foto.';
    } finally {
      if (ui.medicationDraft === draft) {
        ui.photoBusy = false;
        render();
      }
    }
  }
  function handleAction(action, target) {
    const value = target.dataset.id;
    if (action === 'retry-save') {
      store.retrySave();
      return;
    }
    if (action === 'close-media') {
      ui.mediaMessage = null;
      updateNotices();
      return;
    }
    if (action === 'reset') {
      openDialog({
        title: 'Recomeçar a demonstração?',
        description:
          'Os cadastros e registros locais serão substituídos pelo cenário inicial de Dona Benedita.',
        label: 'Reiniciar demonstração',
        danger: true,
        confirm: () => {
          ui.messages = {};
          ui.history = { day: null, filter: null };
          seenAlerts.clear();
          store.reset();
          navigate('/profiles', true);
        },
      });
      return;
    }
    if (!store.state) return;
    const state = store.state;
    switch (action) {
      case 'choose-profile':
        store.dispatch({ type: 'role', role: value });
        navigate(value === 'patient' ? '/patient' : '/caregiver', true);
        break;
      case 'profiles':
        media.stopSounds();
        navigate('/profiles', true);
        break;
      case 'back':
        back();
        break;
      case 'home':
        navigate(home(), true);
        break;
      case 'patient-home':
        navigate('/patient', true);
        break;
      case 'day':
        // A confirmação é transitória: ao voltar de Meu dia, mostrar o próximo remédio.
        if (parseRoute().path === '/patient/success')
          history.replaceState(history.state, '', '#/patient');
        navigate('/patient/day');
        break;
      case 'help': {
        const dose = d.currentDose(state);
        const failure = store.dispatch({ type: 'help', id: `help:${id()}`, doseId: dose?.id });
        if (failure) {
          ui.patientError = failure;
          render();
        } else {
          const request = d.helpRequest(store.state, dose?.id);
          navigate(`/patient/help?request=${encodeURIComponent(request.id)}`);
        }
        break;
      }
      case 'medications':
        navigate('/caregiver/medications', true);
        break;
      case 'new-medication':
        ui.medicationDraft = null;
        previousRoute = '';
        navigate('/medication');
        break;
      case 'edit-medication':
        navigate(`/medication?id=${encodeURIComponent(value)}`);
        break;
      case 'patient-confirm': {
        if (confirmLocked) return;
        confirmLocked = true;
        const failure = store.dispatch({ type: 'confirm', doseId: value, by: state.patient.id });
        if (failure) {
          ui.patientError = failure;
          confirmLocked = false;
          render();
        } else {
          navigate(`/patient/success?dose=${encodeURIComponent(value)}`, true, 'success');
        }
        break;
      }
      case 'resend':
        actionError(
          value,
          store.dispatch({ type: 'resend', doseId: value }),
          'Lembrete disponível no perfil do idoso.',
        );
        break;
      case 'caregiver-confirm':
        confirmByCaregiver(value);
        break;
      case 'read-events':
        store.dispatch({ type: 'readEvents' });
        break;
      case 'active-caregiver':
        store.dispatch({ type: 'activeCaregiver', caregiverId: value });
        break;
      case 'primary-caregiver':
        store.dispatch({ type: 'primaryCaregiver', caregiverId: value });
        break;
      case 'remove-caregiver':
        openDialog({
          title: 'Remover cuidador?',
          description:
            'O cuidador será retirado do grupo. Os registros de doses anteriores serão preservados.',
          label: 'Remover cuidador',
          danger: true,
          confirm: () => {
            ui.caregiverError = store.dispatch({ type: 'removeCaregiver', caregiverId: value });
            render();
          },
        });
        break;
      case 'add-caregiver': {
        ui.caregiverError = store.dispatch(
          { type: 'addCaregiver', caregiver: { id: `caregiver-${id()}`, ...ui.caregiverDraft } },
          true,
        );
        if (!ui.caregiverError) ui.caregiverDraft = { name: '', relationship: '' };
        render();
        break;
      }
      case 'advance':
        store.dispatch({
          type: 'clock',
          now: new Date(Date.parse(state.now) + Number(value) * 60000).toISOString(),
        });
        break;
      case 'next-time':
        store.dispatch({
          type: 'clock',
          now:
            d.dosesForDay(state).find((item) => item.scheduledAt > state.now)?.scheduledAt ||
            d.atTime(d.addDays(d.dayKey(state.now), 1), '08:00'),
        });
        break;
      case 'next-day':
        store.dispatch({
          type: 'clock',
          now: d.atTime(d.addDays(d.dayKey(state.now), 1), '08:00'),
        });
        break;
      case 'history-prev':
        ui.history.day = d.addDays(ui.history.day || d.dayKey(state.now), -1);
        render();
        break;
      case 'history-next':
        ui.history.day = d.addDays(ui.history.day || d.dayKey(state.now), 1);
        render();
        break;
      case 'history-filter':
        ui.history.filter = value || null;
        render();
        break;
      case 'pick-camera':
        document.getElementById('camera-file').click();
        break;
      case 'pick-gallery':
        document.getElementById('gallery-file').click();
        break;
      case 'sample-photo':
        if (ui.medicationDraft) {
          ui.medicationDraft.photo = { kind: 'sample', value };
          render();
        }
        break;
      case 'quantity-minus':
        scheduleUpdate(value, (item) => ({ quantity: Math.max(1, item.quantity - 1) }));
        break;
      case 'quantity-plus':
        scheduleUpdate(value, (item) => ({ quantity: Math.min(12, item.quantity + 1) }));
        break;
      case 'schedule-period':
        scheduleUpdate(value, () => ({ period: target.dataset.period }));
        break;
      case 'add-schedule':
        ui.medicationDraft?.schedules.push(defaultSchedule());
        render();
        break;
      case 'remove-schedule':
        if (ui.medicationDraft?.schedules.length > 1) {
          ui.medicationDraft.schedules = ui.medicationDraft.schedules.filter(
            (item) => item.id !== value,
          );
          render();
        }
        break;
      case 'save-medication':
        saveMedication();
        break;
      case 'archive-medication':
        openDialog({
          title: 'Desativar medicamento?',
          description:
            'As próximas doses deixarão de ser programadas. O histórico das doses anteriores será preservado.',
          label: 'Desativar',
          danger: true,
          confirm: () => {
            const failure = store.dispatch(
              { type: 'archiveMedication', medicationId: value },
              true,
            );
            if (failure) {
              ui.medicationError = failure;
              render();
            } else navigate('/caregiver/medications', true);
          },
        });
        break;
      case 'speak-dose': {
        const dose = state.doses.find((item) => item.id === value);
        if (dose)
          media.speak(media.doseSpeech(dose, d.doseStatus(dose, state.now), !!d.helpRequest(state, dose.id)));
        break;
      }
      case 'speak-success':
      case 'speak-all-done':
        media.speak(media.patientSpeech(context(parseRoute())));
        break;
    }
  }
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (
      target &&
      (app.contains(target) || notices.contains(target) || simulation.contains(target)) &&
      !target.disabled
    ) {
      handleAction(target.dataset.action, target);
      return;
    }
    const link = event.target.closest('a[href^="#/"]');
    if (
      link &&
      app.contains(link) &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.button === 0
    ) {
      event.preventDefault();
      navigate(link.getAttribute('href').slice(1));
    }
  });
  document.addEventListener('input', (event) => {
    const input = event.target,
      field = input.dataset.field;
    if (!field) return;
    if (field === 'caregiver-name') ui.caregiverDraft.name = input.value;
    if (field === 'caregiver-relationship') ui.caregiverDraft.relationship = input.value;
    if (!ui.medicationDraft) return;
    if (field === 'medication-name') ui.medicationDraft.name = input.value;
    if (field.startsWith('schedule-')) {
      const schedule = ui.medicationDraft.schedules.find((item) => item.id === field.slice(9));
      if (schedule) {
        const digits = input.value.replace(/\D/g, '').slice(0, 4);
        schedule.time = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
        input.value = schedule.time;
      }
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'automatic-audio') {
      autoAudio = event.target.checked;
      repository.saveAutoAudio(autoAudio);
      if (autoAudio) narrateScreen(parseRoute());
      else media.stopSpeech(true);
      return;
    }
    if (['camera-file', 'gallery-file'].includes(event.target.id)) void selectPhoto(event.target);
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'medication-form') {
      event.preventDefault();
      saveMedication();
    }
    if (event.target.id === 'caregiver-form') {
      event.preventDefault();
      handleAction('add-caregiver', event.target);
    }
  });
  document.addEventListener('keydown', (event) => {
    media.unlock();
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) &&
      event.target.matches('[role="radio"]')
    ) {
      const group = event.target.closest('[role="radiogroup"]');
      const choices = [...group.querySelectorAll('[role="radio"]')];
      const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
      const target =
        choices[(choices.indexOf(event.target) + direction + choices.length) % choices.length];
      event.preventDefault();
      target.focus({ preventScroll: true });
      target.click();
    }
  });
  document.addEventListener('pointerdown', media.unlock, { capture: true });
  document.addEventListener(
    'error',
    (event) => {
      if (
        event.target instanceof HTMLImageElement &&
        event.target.matches('[data-medicine-photo]')
      ) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = u.photoFallback(
          event.target.getAttribute('style') || '',
          event.target.className,
        );
        event.target.replaceWith(wrapper.firstElementChild);
      }
    },
    true,
  );
  root.addEventListener('hashchange', () => render(true));
  document.addEventListener('visibilitychange', alertIfNeeded);
  media.onMessage((message) => {
    ui.mediaMessage = message;
    updateNotices();
  });
  store.subscribe(() => render());
  render();
})(globalThis);
