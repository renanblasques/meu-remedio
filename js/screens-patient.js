(function (root) {
  'use strict';
  const { currentDose, dosesForDay, doseStatus, clockLabel } = root.MeuRemedio.domain;
  const {
    escape: e,
    icon,
    button,
    periodBadge,
    statusBadge,
    photo,
    quantity,
    notice,
    empty,
    screen,
  } = root.MeuRemedio.ui;
  const med = root.MeuRemedio.media;

  function profiles() {
    return `<main class="profiles" id="main-content"><h1 class="sr-only" tabindex="-1">Escolha de perfil</h1><div class="profile-content">
      <div class="stack profile-intro"><img class="logo" src="assets/images/logo.png" alt="Meu Remédio: sol, lua e medicamentos" /><p class="profile-subtitle">Seu remédio, na hora certa.<br />Com mais tranquilidade.</p></div>
      <p class="label muted center">COMO VOCÊ VAI USAR?</p>
      <button class="profile-choice" type="button" data-action="choose-profile" data-id="patient" aria-label="Sou o idoso. Ver meus remédios."><span class="profile-choice-icon" aria-hidden="true">👴</span><span class="grow"><span class="elder-text">Meus remédios</span><span class="primary-ink">Sou o idoso</span></span>${icon('arrow-forward', 24, '#24735E')}</button>
      <button class="profile-choice caregiver" type="button" data-action="choose-profile" data-id="caregiver" aria-label="Sou cuidador. Acompanhar tratamento."><span class="profile-choice-icon" aria-hidden="true">👩‍⚕️</span><span class="grow"><span class="elder-text">Cuidar de alguém</span><span class="purple-ink">Sou cuidador</span></span>${icon('arrow-forward', 24, '#65549D')}</button>
      ${button('Ouvir as opções', 'speak-profiles', { icon: 'volume-high-outline', variant: 'quiet', large: true })}
    </div></main>`;
  }
  function patient(context) {
    const { state, repository } = context;
    const dose = currentDose(state),
      status = dose && doseStatus(dose, state.now);
    const content = `${context.patientError ? notice(context.patientError, 'error') : ''}${
      dose
        ? `<article class="card patient-dose">
      <div class="row between wrap">${periodBadge(dose.period, true)}<p class="row gap-4 elder-text muted">${icon('time-outline', 23)}<span>${clockLabel(dose.scheduledAt)}</span></p></div>
      <div class="row justify-center ${status === 'missed' ? 'danger-ink' : 'primary-ink'}">${icon(status === 'pending' ? 'notifications-outline' : status === 'missed' ? 'alert-circle-outline' : 'time-outline', 27)}<p class="elder-text">${status === 'pending' ? 'Hora do remédio' : status === 'missed' ? 'O horário passou' : 'Seu próximo remédio'}</p></div>
      ${photo(dose.photo, repository, { height: 180, label: `Foto de ${dose.name}` })}<p class="elder-text center">${e(dose.name)}</p>${quantity(dose.quantity)}
      ${status === 'scheduled' ? `<div class="row justify-center primary-ink">${icon('time-outline')}<p class="elder-text">Ainda não é a hora</p></div>` : ''}
      ${dose.resendCount ? '<p class="muted center">Seu cuidador enviou um lembrete.</p>' : ''}</article>`
        : `${empty('Tudo em dia!', 'As doses de hoje já estão registradas.')}${button('Ouvir', 'speak-all-done', { icon: 'volume-high-outline', large: true })}`
    }
      <div class="divider"></div>${button('Meu dia', 'day', { icon: 'grid-outline', variant: 'secondary', large: true })}`;
    const footer = dose
      ? `<button class="listen-button" type="button" data-action="speak-dose" data-id="${e(dose.id)}" aria-label="Ouvir">${icon('volume-high-outline', 29)}<span>Ouvir</span></button>
      ${status === 'pending' ? button('Já tomei', 'patient-confirm', { id: dose.id, icon: 'checkmark-circle-outline', large: true }) : status === 'missed' ? button('Pedir ajuda', 'help', { icon: 'hand-left-outline', large: true }) : button('Meu dia', 'day', { icon: 'grid-outline', large: true })}`
      : '';
    return screen(context, 'Olá, Dona Benedita!', content, { elder: true, help: true, footer });
  }
  function success(context) {
    const { state, repository, route } = context;
    const dose = state.doses.find(
      (item) => item.id === route.params.get('dose') && item.confirmedAt,
    );
    if (!dose)
      return screen(
        context,
        'Dose não encontrada',
        `${empty('Confira seu dia', 'Consulte as doses e seus registros.')}${button('Voltar ao início', 'patient-home', { icon: 'home-outline', large: true })}`,
        { elder: true, help: true },
      );
    const next = dosesForDay(state).find((item) => doseStatus(item, state.now) === 'scheduled');
    return screen(
      context,
      'Dose registrada!',
      `<section class="card success-card"><div class="circle">${icon('checkmark', 82)}</div><h2 class="center" style="font-size:1.75rem;line-height:2.25rem">Tudo certo,<br />Dona Benedita.</h2>${photo(dose.photo, repository, { height: 120, width: 180 })}<p class="elder-text center">Esta dose já está marcada.</p><p class="primary-ink">Seu cuidador pode acompanhar.</p></section>
      ${next ? `<section class="card"><div class="row between"><p class="elder-text">Próxima dose</p>${periodBadge(next.period)}</div><p class="elder-text">${clockLabel(next.scheduledAt)}</p></section>` : ''}
      ${button('Ver meu dia', 'day', { icon: 'grid-outline', large: true })}${button('Voltar ao início', 'patient-home', { icon: 'home-outline', variant: 'secondary', large: true })}${button('Ouvir de novo', 'speak-success', { icon: 'volume-high-outline', variant: 'quiet', large: true })}`,
      { elder: true, help: true },
    );
  }
  function day(context) {
    const { state, repository } = context,
      doses = dosesForDay(state);
    return screen(
      context,
      'Meu dia',
      `${!doses.length ? empty('Dia sem doses', 'Peça ajuda ao cuidador se tiver alguma dúvida.') : ''}${doses.map((dose) => `<article class="card"><div class="row between wrap">${periodBadge(dose.period, true)}<p class="elder-text">${clockLabel(dose.scheduledAt)}</p></div>${photo(dose.photo, repository, { height: 145, label: `Foto de ${dose.name}` })}<p class="elder-text">${e(dose.name)}</p>${statusBadge(dose, state.now)}${button('Ouvir', 'speak-dose', { id: dose.id, icon: 'volume-high-outline', variant: 'secondary', large: true })}</article>`).join('')}
      ${button('Voltar ao início', 'patient-home', { icon: 'home-outline', large: true })}${button('Pedir ajuda', 'help', { icon: 'hand-left-outline', variant: 'quiet', large: true })}`,
      { back: true, elder: true, help: true },
    );
  }
  function help(context) {
    const caregiver = context.state.caregivers.find(
      (item) => item.id === context.state.primaryCaregiverId,
    );
    const sent = context.helpSent;
    return screen(
      context,
      sent ? 'Pedido registrado' : 'Precisa de ajuda?',
      `<section class="card patient-help">
      ${sent ? `<div class="circle" style="background:var(--mint)">${icon('checkmark', 70)}</div>` : caregiver.photo ? `<img class="portrait" src="assets/images/${caregiver.photo}.jpg" alt="Foto de ${e(caregiver.name)}" />` : icon('person-circle-outline', 140, '#24735E')}
      <h2 style="font-size:1.75rem;line-height:2.25rem">${e(caregiver.name)}</h2><p class="elder-text">${e(caregiver.relationship)}</p><p class="elder-text center">${sent ? 'Seu pedido aparece para o cuidador.' : 'Toque para pedir ajuda.'}</p></section>
      ${!sent ? button(`Pedir ajuda a ${caregiver.name}`, 'request-help', { icon: 'hand-left-outline', large: true }) : ''}${button('Ouvir', 'speak-help', { icon: 'volume-high-outline', variant: 'secondary', large: true })}<p class="caption center">Demonstração: o pedido aparece no perfil do cuidador neste aparelho.</p>`,
      { back: true, elder: true },
    );
  }
  root.MeuRemedio.screens = { profiles, patient, success, day, help };
})(globalThis);
