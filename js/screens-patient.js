(function (root) {
  'use strict';
  const { currentDose, dosesForDay, doseStatus, clockLabel, helpRequest, PERIODS, STATUSES } =
    root.MeuRemedio.domain;
  const { escape: e, icon, button, periodBadge, photo, notice, empty, screen } = root.MeuRemedio.ui;
  const patientOptions = { elder: true, help: true, className: 'patient-screen' };

  function listen(action, doseId) {
    return `<button class="listen-button" type="button" data-action="${action}" ${doseId ? `data-id="${e(doseId)}"` : ''}>${icon('volume-high-outline', 26)}<span>Ouvir</span></button>`;
  }
  function dayButton(secondary = false) {
    return button('Meu dia', 'day', { icon: 'grid-outline', variant: secondary ? 'secondary' : 'primary' });
  }
  function sentBadge() {
    return `<p class="help-sent" role="status">${icon('checkmark', 24)}<span>Pedido enviado</span></p>`;
  }
  function profiles() {
    return `<main class="profiles" id="main-content"><h1 class="sr-only" tabindex="-1">Escolha de perfil</h1><div class="profile-content">
      <div class="profile-intro"><img class="logo" src="assets/images/logo.png" alt="Meu Remédio: sol, lua e medicamentos" /></div>
      <button class="profile-choice" type="button" data-action="choose-profile" data-id="patient">${icon('person-outline', 42)}<span>Meus remédios</span></button>
      <button class="profile-choice caregiver" type="button" data-action="choose-profile" data-id="caregiver">${icon('people-outline', 42)}<span>Cuidar de alguém</span></button>
    </div></main>`;
  }
  function patient(context) {
    const { state, repository } = context;
    const dose = currentDose(state);
    if (!dose)
      return screen(context, 'Tudo em dia!', empty('Tudo em dia!', 'As doses de hoje já estão registradas.'), {
        ...patientOptions,
        hideHeading: true,
        footer: `<div class="patient-action-row">${listen('speak-all-done')}${dayButton()}</div>`,
      });

    const status = doseStatus(dose, state.now);
    const sent = status === 'missed' && helpRequest(state, dose.id);
    const label = status === 'pending' ? 'Hora do remédio' : status === 'missed' ? 'Passou da hora' : 'Próximo remédio';
    const glyph = status === 'pending' ? 'notifications-outline' : status === 'missed' ? 'warning-outline' : 'time-outline';
    const content = `${context.patientError ? notice(context.patientError, 'error') : ''}
      <article class="patient-dose" aria-label="${e(label)}">
        <div class="row between patient-dose-heading">${periodBadge(dose.period)}<p class="patient-time">${clockLabel(dose.scheduledAt)}</p></div>
        <p class="patient-dose-status ${status}">${icon(glyph, 18)}<span>${label}</span></p>
        ${photo(dose.photo, repository, { className: 'patient-medicine-photo', label: `Foto de ${dose.name}` })}
        <h2 class="patient-medicine-name">${e(dose.name)}</h2>
        <p class="patient-quantity">${icon('capsule-outline', 22)}<span>${dose.quantity} ${dose.quantity === 1 ? 'comprimido' : 'comprimidos'}</span></p>
      </article>`;
    const action = status === 'pending'
      ? button('Já tomei', 'patient-confirm', { id: dose.id, icon: 'checkmark' })
      : status === 'missed'
        ? button('Pedir ajuda', 'help', { icon: 'hand-left-outline', variant: 'patient-danger' })
        : dayButton();
    const footer = sent
      ? `${sentBadge()}${dayButton(true)}`
      : `<div class="patient-action-row">${listen('speak-dose', dose.id)}${action}</div>${status !== 'scheduled' ? dayButton(true) : ''}`;
    return screen(context, 'Meus remédios', content, { ...patientOptions, hideHeading: true, footer });
  }
  function success(context) {
    const { state, repository, route } = context;
    const dose = state.doses.find((item) => item.id === route.params.get('dose') && item.confirmedAt);
    if (!dose)
      return screen(context, 'Dose não encontrada', `${empty('Confira seu dia', 'Consulte as doses e seus registros.')}${dayButton()}`, patientOptions);
    const next = currentDose(state);
    const period = next && PERIODS.find((item) => item.key === next.period);
    return screen(context, 'Muito bem!', `<section class="patient-success">
      <div class="patient-success-check">${icon('checkmark', 76)}</div>
      <h2>Muito bem!</h2>
      ${next ? `<div class="patient-next-dose">
        ${photo(next.photo, repository, { className: 'patient-thumbnail', label: `Foto de ${next.name}` })}
        <div class="patient-next-info"><p>Próximo</p><p class="patient-next-time">${clockLabel(next.scheduledAt)}</p></div>
        <span class="patient-next-period" role="img" aria-label="${e(period.label)}" style="color:${period.color}">${icon(period.icon, 28)}</span>
      </div>` : '<p class="muted center">Tudo em dia por hoje.</p>'}
      </section>`, {
        ...patientOptions,
        hideHeading: true,
        footer: `<div class="patient-action-row">${listen('speak-success')}${dayButton()}</div>`,
      });
  }
  function day(context) {
    const { state, repository } = context;
    const doses = dosesForDay(state);
    return screen(context, 'Meu dia', doses.length
      ? `<ul class="patient-day-list" aria-label="Remédios de hoje">${doses.map((dose) => {
        const status = doseStatus(dose, state.now);
        const indicator = status === 'scheduled' ? '' : icon(status === 'pending' ? 'notifications-outline' : status === 'missed' ? 'warning-outline' : 'checkmark', 21);
        return `<li><button class="patient-day-dose ${status}" type="button" data-action="speak-dose" data-id="${e(dose.id)}" aria-label="${e(`Ouvir: ${clockLabel(dose.scheduledAt)}, ${dose.name}, ${STATUSES[status].label}`)}">
          ${photo(dose.photo, repository, { className: 'patient-thumbnail', label: `Foto de ${dose.name}` })}
          <span class="patient-day-info"><span class="patient-next-time">${clockLabel(dose.scheduledAt)}</span><span class="patient-day-name">${e(dose.name)}</span></span>
          <span class="patient-day-indicator" aria-hidden="true">${indicator}</span>
        </button></li>`;
      }).join('')}</ul>`
      : empty('Dia sem doses', 'Peça ajuda ao cuidador se tiver alguma dúvida.'), {
        ...patientOptions,
        back: true,
      });
  }
  function help(context) {
    const request = context.state.events.find((event) => event.kind === 'help' && event.id === context.route.params.get('request'));
    if (!request)
      return screen(context, 'Pedido não encontrado', dayButton(), { ...patientOptions, back: true });
    const caregiver = request.caregiver || context.state.caregivers.find((item) => item.id === context.state.primaryCaregiverId);
    return screen(context, 'Pedido enviado', `<section class="patient-help">
      ${caregiver.photo ? `<img class="portrait" src="assets/images/${e(caregiver.photo)}.jpg" alt="Foto de ${e(caregiver.name)}" />` : icon('person-circle-outline', 144)}
      <h2>${e(caregiver.name)}</h2><p class="muted">${e(caregiver.relationship)}</p>${sentBadge()}
      </section>`, {
        ...patientOptions,
        help: false,
        back: true,
        hideHeading: true,
        footer: button('Entendi', 'patient-home'),
      });
  }
  root.MeuRemedio.screens = { profiles, patient, success, day, help };
})(globalThis);
