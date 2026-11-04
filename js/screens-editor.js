(function (root) {
  'use strict';
  const { PERIODS } = root.MeuRemedio.domain;
  const { escape: e, icon, button, photo, notice, field, screen } = root.MeuRemedio.ui;
  function medication(context) {
    const draft = context.medicationDraft;
    if (!draft)
      return screen(
        context,
        'Medicamento indisponível',
        `${notice('Este medicamento não está mais ativo.')}${button('Ver medicamentos', 'medications')}`,
        { back: true, tabs: false },
      );
    return screen(
      context,
      draft.editing ? 'Editar medicamento' : 'Novo medicamento',
      `<form id="medication-form" class="stack gap-20" novalidate>
      <section class="card"><h2>1. Identificação</h2>${field('Nome do medicamento', 'medication-name', draft.name, { placeholder: 'Como você identifica este remédio?', maxLength: 80 })}${photo(draft.photo, context.repository, { height: 210 })}
      ${button(context.photoBusy ? 'Preparando foto…' : 'Fotografar medicamento', 'pick-camera', { icon: 'camera-outline', variant: 'secondary', disabled: context.photoBusy })}${button('Escolher da galeria', 'pick-gallery', { icon: 'images-outline', variant: 'quiet', disabled: context.photoBusy })}
      <input id="camera-file" class="file-input" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true" /><input id="gallery-file" class="file-input" type="file" accept="image/*" tabindex="-1" aria-hidden="true" />
      <div class="divider"></div><p class="caption">Ou use uma foto de exemplo para a demonstração:</p><div class="photo-options">${['morning', 'lunch', 'night'].map((sample, i) => `<button class="photo-option" type="button" data-action="sample-photo" data-id="${sample}" aria-label="Usar foto de exemplo ${i + 1}" aria-pressed="${draft.photo.kind === 'sample' && draft.photo.value === sample}" ${context.photoBusy ? 'disabled' : ''}>${photo({ kind: 'sample', value: sample }, context.repository)}</button>`).join('')}</div></section>
      <h2>2. Doses de todos os dias</h2>${draft.schedules
        .map(
          (
            schedule,
            i,
          ) => `<section class="card" data-schedule-id="${e(schedule.id)}"><div class="row between"><h2>Dose ${i + 1}</h2>${draft.schedules.length > 1 ? `<button class="icon-button danger-ink" type="button" data-action="remove-schedule" data-id="${e(schedule.id)}" aria-label="Remover dose ${i + 1}">${icon('trash-outline')}</button>` : ''}</div>
      ${field(`Horário da dose ${i + 1}`, `schedule-${schedule.id}`, schedule.time, { placeholder: '08:00', numeric: true, maxLength: 5 })}<p class="label">Quantidade de comprimidos</p><div class="stepper"><button type="button" data-action="quantity-minus" data-id="${e(schedule.id)}" aria-label="Diminuir quantidade da dose ${i + 1}" ${schedule.quantity <= 1 ? 'disabled' : ''}>${icon('remove', 28)}</button><output aria-label="Quantidade da dose ${i + 1}">${schedule.quantity}</output><button type="button" data-action="quantity-plus" data-id="${e(schedule.id)}" aria-label="Aumentar quantidade da dose ${i + 1}" ${schedule.quantity >= 12 ? 'disabled' : ''}>${icon('add', 28)}</button></div>
      <p class="label">Símbolo da rotina</p><div class="schedule-periods" role="radiogroup" aria-label="Período da dose ${i + 1}">${PERIODS.map((period) => `<button class="period-option" type="button" role="radio" data-action="schedule-period" data-id="${e(schedule.id)}" data-period="${period.key}" aria-label="${period.label} para dose ${i + 1}" aria-checked="${schedule.period === period.key}" style="--badge-bg:${period.background};--badge-color:${period.color}">${icon(period.icon, 30)}<span class="label">${period.label}</span></button>`).join('')}</div></section>`,
        )
        .join('')}
      ${button('Adicionar outro horário', 'add-schedule', { icon: 'add-circle-outline', variant: 'secondary' })}${notice('As alterações valem para os próximos horários. Doses já ocorridas continuam no histórico.')}${context.medicationError ? notice(context.medicationError, 'error') : ''}${button('Salvar medicamento', 'save-medication', { icon: 'checkmark-outline', disabled: context.photoBusy })}
      ${draft.editing ? button('Desativar medicamento', 'archive-medication', { id: draft.id, icon: 'archive-outline', variant: 'danger' }) : ''}</form>`,
      {
        subtitle: 'Uma foto ajuda a reconhecer. Um horário ajuda a lembrar.',
        back: true,
        tabs: false,
      },
    );
  }
  Object.assign(root.MeuRemedio.screens, { medication });
})(globalThis);
