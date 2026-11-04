(function (root) {
  'use strict';
  const {
    PERIODS,
    STATUSES,
    dosesForDay,
    doseStatus,
    clockLabel,
    dateLabel,
    weekdayLabel,
    dayKey,
  } = root.MeuRemedio.domain;
  const {
    escape: e,
    icon,
    button,
    photo,
    notice,
    empty,
    field,
    screen,
    doseCard,
  } = root.MeuRemedio.ui;

  function today(context) {
    const { state } = context,
      caregiver = state.caregivers.find((item) => item.id === state.activeCaregiverId);
    const doses = dosesForDay(state),
      done = doses.filter((item) => item.confirmedAt).length;
    const attention = doses.filter((item) =>
      ['pending', 'missed'].includes(doseStatus(item, state.now)),
    ).length;
    const day = dayKey(state.now);
    const content = `<section class="card patient-summary"><div class="row"><div class="patient-avatar">${icon('person-outline', 30)}</div><div class="stack grow" style="gap:2px"><p class="eyebrow">ACOMPANHANDO</p><h2>${e(state.patient.name)}</h2><p class="caption">${state.patient.age} anos · cuidado compartilhado</p></div></div>
      <div class="row between" style="align-items:flex-end"><div><p class="summary-count">${done}<small> / ${doses.length}</small></p><p class="muted">doses registradas hoje</p></div>${icon('leaf-outline', 45, '#7C9C69')}</div>
      <div class="progress" role="img" aria-label="${done} de ${doses.length} doses registradas">${doses.map((dose) => `<span style="background:${STATUSES[doseStatus(dose, state.now)].color}"></span>`).join('')}</div><p class="primary-ink">${attention ? `${attention} ${attention === 1 ? 'dose precisa' : 'doses precisam'} de atenção agora.` : done === doses.length && doses.length ? 'Todas as doses do dia foram registradas.' : 'As próximas doses estão programadas.'}</p></section>
      <div class="stack gap-4"><h2>O dia de Dona Benedita</h2><p class="muted capitalize">${weekdayLabel(day)}, ${dateLabel(day, true)}</p></div>
      ${doses.map((dose) => doseCard(dose, context)).join('')}${!doses.length ? empty('Nenhuma dose para hoje', 'Cadastre um medicamento para organizar as próximas doses.', 'medical-outline') : ''}${button('Adicionar medicamento', 'new-medication', { icon: 'add-outline', variant: 'secondary' })}`;
    return screen(context, `Olá, ${caregiver.name}`, content);
  }
  function medications(context) {
    const list = context.state.medications.filter((item) => item.active);
    return screen(
      context,
      'Medicamentos',
      `${button('Adicionar medicamento', 'new-medication', { icon: 'add-outline' })}<p class="eyebrow">${list.length} ${list.length === 1 ? 'MEDICAMENTO CADASTRADO' : 'MEDICAMENTOS CADASTRADOS'}</p>
      ${list
        .map(
          (
            item,
          ) => `<article class="card"><div class="row" style="gap:16px">${photo(item.photo, context.repository, { width: 85, height: 85 })}<div class="stack grow" style="gap:5px"><h2>${e(item.name)}</h2><p class="muted">Todos os dias</p></div></div>
      ${item.schedules
        .map((schedule) => {
          const period = PERIODS.find((value) => value.key === schedule.period);
          return `<div class="row wrap medication-schedule">${icon(period.icon, 24, period.color)}<p>${schedule.time}</p><p class="caption">· ${schedule.quantity} ${schedule.quantity === 1 ? 'comprimido' : 'comprimidos'} · ${period.label}</p></div>`;
        })
        .join('')}
      ${button('Editar medicamento', 'edit-medication', { id: item.id, icon: 'create-outline', variant: 'secondary' })}</article>`,
        )
        .join('')}
      ${!list.length ? empty('Comece por uma foto', 'Adicione um medicamento e defina seus horários.', 'camera-outline') : ''}`,
    );
  }
  function history(context) {
    const { state } = context,
      today = dayKey(state.now),
      selected = context.history.day || today;
    const all = dosesForDay(state, selected),
      doses = all.filter(
        (dose) => !context.history.filter || doseStatus(dose, state.now) === context.history.filter,
      );
    const first = state.doses.reduce((day, dose) => (dose.day < day ? dose.day : day), today);
    const filters = [
      [null, 'Todas'],
      ...Object.entries(STATUSES).map(([key, value]) => [key, value.label]),
    ];
    return screen(
      context,
      'Histórico',
      `<section class="card"><div class="row between"><button class="icon-button" type="button" data-action="history-prev" aria-label="Dia anterior" ${selected <= first ? 'disabled' : ''}>${icon('chevron-back')}</button><div class="stack grow center" style="gap:0"><h2>${selected === today ? 'Hoje' : dateLabel(selected, true)}</h2><p class="caption capitalize">${weekdayLabel(selected)} · ${dateLabel(selected)}</p></div><button class="icon-button" type="button" data-action="history-next" aria-label="Próximo dia" ${selected >= today ? 'disabled' : ''}>${icon('chevron-forward')}</button></div><p class="primary-ink center">${all.filter((item) => item.confirmedAt).length} de ${all.length} doses registradas</p></section>
      <div class="chips" role="group" aria-label="Filtrar histórico por status">${filters.map(([key, label]) => `<button type="button" class="chip" data-action="history-filter" data-id="${key || ''}" aria-label="Filtrar: ${label}" aria-pressed="${context.history.filter === key}">${label}</button>`).join('')}</div>
      ${doses.map((dose) => doseCard(dose, context)).join('')}${!doses.length ? empty('Nenhum registro neste filtro', 'Escolha outro status ou consulte um dia diferente.', 'calendar-outline') : ''}`,
    );
  }
  function events(context) {
    const events = [...context.state.events].sort((a, b) => b.at.localeCompare(a.at));
    const unread = events.filter((event) => !event.read).length;
    const icons = {
      help: 'hand-left-outline',
      completed: 'checkmark-circle-outline',
      pending: 'notifications-outline',
      missed: 'alert-circle-outline',
      resend: 'paper-plane-outline',
    };
    return screen(
      context,
      'Avisos',
      `<p class="muted">${unread ? `${unread} ${unread === 1 ? 'aviso novo' : 'avisos novos'}` : 'Todos os avisos foram lidos.'}</p>${unread ? button('Marcar todos como lidos', 'read-events', { icon: 'checkmark-done-outline', variant: 'secondary' }) : ''}
      ${events.map((event) => `<article class="card event-card ${!event.read ? 'unread' : ''}"><div class="row start"><div class="event-icon" style="${event.kind === 'help' ? 'background:var(--lavender);color:var(--purple)' : event.kind === 'missed' ? 'background:var(--rose);color:var(--danger)' : ''}">${icon(icons[event.kind])}</div><div class="stack grow" style="gap:7px"><h3>${e(event.title)}</h3><p>${e(event.detail)}</p><p class="caption">${dateLabel(dayKey(event.at))} · ${clockLabel(event.at)}${!event.read ? ' · Novo' : ''}</p></div></div></article>`).join('')}
      ${!events.length ? empty('Tudo tranquilo por aqui', 'Os registros de doses e pedidos de ajuda aparecerão aqui.', 'notifications-outline') : ''}`,
    );
  }
  function care(context) {
    const { state, caregiverDraft } = context;
    return screen(
      context,
      'Cuidar juntos',
      `<p class="eyebrow">GRUPO DE CUIDADORES</p><p class="muted">Escolha quem está usando o perfil agora. Todos acompanham Dona Benedita.</p>
      <div class="stack gap-20" role="radiogroup" aria-label="Cuidador ativo">${state.caregivers
        .map(
          (
            caregiver,
          ) => `<article class="card"><button class="caregiver-choice" type="button" role="radio" aria-label="Usar perfil de ${e(caregiver.name)}" aria-checked="${caregiver.id === state.activeCaregiverId}" data-action="active-caregiver" data-id="${e(caregiver.id)}">${caregiver.photo ? `<img class="portrait" src="assets/images/${caregiver.photo}.jpg" alt="Foto de ${e(caregiver.name)}" />` : `<span class="patient-avatar">${icon('person-outline', 32)}</span>`}<span class="stack grow" style="gap:3px"><span class="elder-text" style="font-size:1.3125rem;line-height:1.75rem">${e(caregiver.name)}</span><span class="caption">${e(caregiver.relationship)}${caregiver.id === state.activeCaregiverId ? ' · Perfil ativo' : ''}</span></span>${icon(caregiver.id === state.activeCaregiverId ? 'radio-button-on' : 'radio-button-off')}</button>
      ${button(caregiver.id === state.primaryCaregiverId ? 'Contato principal para ajuda' : 'Escolher como contato de ajuda', 'primary-caregiver', { id: caregiver.id, icon: caregiver.id === state.primaryCaregiverId ? 'heart' : 'heart-outline', variant: 'secondary', disabled: caregiver.id === state.primaryCaregiverId })}${button(`Remover ${caregiver.name}`, 'remove-caregiver', { id: caregiver.id, icon: 'person-remove-outline', variant: 'quiet', disabled: state.caregivers.length === 1 })}</article>`,
        )
        .join('')}</div>
      <form class="card" id="caregiver-form" novalidate><h2>Adicionar cuidador</h2>${field('Nome do cuidador', 'caregiver-name', caregiverDraft.name, { placeholder: 'Ex.: Ana', maxLength: 60 })}${field('Vínculo com o idoso', 'caregiver-relationship', caregiverDraft.relationship, { placeholder: 'Ex.: Filha, cuidadora', maxLength: 50 })}${context.caregiverError ? notice(context.caregiverError, 'error') : ''}${button('Adicionar ao grupo', 'add-caregiver', { icon: 'person-add-outline' })}</form>
      ${notice('Os perfis compartilham os dados neste navegador. Alertas e ajuda são demonstrados dentro do app; não há comunicação com outros celulares.')}<p class="caption center">Meu Remédio · Protótipo de IHC e Experiência do Usuário</p>`,
    );
  }
  Object.assign(root.MeuRemedio.screens, { today, medications, history, events, care });
})(globalThis);
