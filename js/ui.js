/** Componentes HTML compartilhados. Todo texto vindo dos dados é escapado. */
(function (root) {
  'use strict';
  const { PERIODS, STATUSES, doseStatus, clockLabel } = root.MeuRemedio.domain;
  function escape(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
  }
  function icon(name, size = 24, color = '') {
    const source = root.MeuRemedio.icons[name] || root.MeuRemedio.icons['medical-outline'];
    return source
      .replace(/class="[^"]*"/g, '')
      .replace(
        '<svg',
        `<svg class="icon" aria-hidden="true" focusable="false" fill="currentColor" style="--icon-size:${Number(size)}px;${color ? `color:${escape(color)}` : ''}"`,
      );
  }
  function button(label, action, options = {}) {
    const {
      id,
      icon: glyph,
      variant = 'primary',
      large = false,
      disabled = false,
      ariaLabel,
      extra = '',
    } = options;
    return `<button type="button" class="button ${variant} ${large ? 'large' : ''}" data-action="${escape(action)}" ${id ? `data-id="${escape(id)}"` : ''} ${disabled ? 'disabled' : ''} ${ariaLabel ? `aria-label="${escape(ariaLabel)}"` : ''} ${extra}>${glyph ? icon(glyph, large ? 32 : 23) : ''}<span>${escape(label)}</span></button>`;
  }
  function periodBadge(period, big = false) {
    const value = PERIODS.find((item) => item.key === period);
    return `<span class="period ${big ? 'big' : ''}" style="--badge-bg:${value.background};--badge-color:${value.color}">${icon(value.icon, big ? 40 : 23)}<span class="${big ? 'elder-text' : 'label'}">${value.label}</span></span>`;
  }
  function statusBadge(dose, now) {
    const value = STATUSES[doseStatus(dose, now)];
    return `<span class="status" style="--badge-bg:${value.background};--badge-color:${value.color}">${icon(value.icon, 17)}${value.label}</span>`;
  }
  function photoFallback(style = '') {
    return `<div class="medicine-photo photo-fallback" style="${style}" role="img" aria-label="Foto indisponível. Peça ajuda ao cuidador.">${icon('image-outline', 48)}<p>Foto indisponível</p></div>`;
  }
  function photo(value, repository, options = {}) {
    const { height, width, label = 'Fotografia do medicamento', className = '' } = options;
    const source = root.MeuRemedio.media.photoUrl(value, repository);
    const style = `${height ? `--photo-height:${height}px;` : ''}${width ? `width:${width}px;` : ''}`;
    return source
      ? `<img class="medicine-photo ${escape(className)}" src="${escape(source)}" alt="${escape(label)}" style="${style}" data-medicine-photo />`
      : photoFallback(style);
  }
  function quantity(value) {
    return `<div class="quantity"><span class="pills" aria-hidden="true">${Array.from({ length: value }, () => '<span class="pill"></span>').join('')}</span><p class="elder-text">${value} ${value === 1 ? 'comprimido' : 'comprimidos'}</p></div>`;
  }
  function notice(text, tone = 'info') {
    return `<div class="notice ${tone}" role="status">${icon(tone === 'error' ? 'alert-circle-outline' : 'information-circle-outline')}<p>${escape(text)}</p></div>`;
  }
  function empty(title, description, glyph = 'checkmark-circle-outline') {
    return `<section class="card empty-state"><div class="circle">${icon(glyph, 42)}</div><h2>${escape(title)}</h2><p class="muted">${escape(description)}</p></section>`;
  }
  function field(label, fieldName, value, options = {}) {
    const id = options.id || fieldName;
    return `<label class="field" for="${escape(id)}"><span class="label">${escape(label)}</span><input id="${escape(id)}" name="${escape(fieldName)}" data-field="${escape(fieldName)}" value="${escape(value)}" ${options.placeholder ? `placeholder="${escape(options.placeholder)}"` : ''} ${options.maxLength ? `maxlength="${options.maxLength}"` : ''} ${options.numeric ? 'inputmode="numeric"' : ''} ${options.required ? 'required' : ''} autocomplete="off" /></label>`;
  }
  function header({ back = false, help = false } = {}) {
    return `<header class="topbar">${back ? `<button class="icon-button" type="button" aria-label="Voltar" data-action="back">${icon('arrow-back')}</button>` : `<div class="row"><img class="brand-icon" src="assets/images/logo.png" alt="" /><span class="brand brand-name">Meu Remédio</span></div>`}
      <div class="row gap-4">${help ? `<button class="icon-button" type="button" aria-label="Preciso de ajuda" data-action="help">${icon('hand-left-outline')}</button>` : ''}<button class="icon-button" type="button" aria-label="Sair para a seleção de perfil" title="Sair para a seleção de perfil" data-action="profiles">${icon('log-out-outline', 23)}</button></div></header>`;
  }
  const navItems = [
    ['#/caregiver', 'Hoje', 'grid-outline'],
    ['#/caregiver/medications', 'Remédios', 'capsule-outline'],
    ['#/caregiver/history', 'Histórico', 'calendar-outline'],
    ['#/caregiver/events', 'Avisos', 'notifications-outline'],
    ['#/caregiver/more', 'Cuidado', 'heart-outline'],
  ];
  function tabs(state, route) {
    const unread = state.events.filter((item) => !item.read).length;
    return `<nav class="tabs" aria-label="Navegação do cuidador">${navItems.map(([path, label, glyph]) => `<a class="nav-item" href="${path}" aria-label="${label}" ${label === 'Avisos' && unread ? 'aria-describedby="unread-count"' : ''} ${route.path === path.slice(1) ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${label === 'Avisos' && unread ? `<span class="nav-badge" id="unread-count" aria-label="${unread} avisos novos">${unread}</span>` : ''}</a>`).join('')}</nav>`;
  }
  function screen(context, title, content, options = {}) {
    return `<div class="screen ${options.elder ? 'elder' : ''}">${header(options)}<main class="screen-scroll" id="main-content"><div class="content"><div class="page-heading"><h1 tabindex="-1">${escape(title)}</h1>${options.subtitle ? `<p class="muted">${escape(options.subtitle)}</p>` : ''}</div>${content}</div></main>${options.footer ? `<footer class="bottom-actions"><div class="bottom-content">${options.footer}</div></footer>` : ''}${context.state.role === 'caregiver' && options.tabs !== false ? tabs(context.state, context.route) : ''}</div>`;
  }
  function doseCard(dose, context) {
    const { state, repository, messages } = context;
    const status = doseStatus(dose, state.now),
      period = PERIODS.find((item) => item.key === dose.period);
    const by =
      dose.confirmedByName ||
      (dose.confirmedBy === state.patient.id
        ? state.patient.name
        : state.caregivers.find((item) => item.id === dose.confirmedBy)?.name || 'Cuidador');
    const actionable = status === 'pending' || status === 'missed';
    return `<article class="card" data-dose-id="${escape(dose.id)}"><div class="row between wrap gap-8"><div class="row">${icon(period.icon, 23, period.color)}<h2>${clockLabel(dose.scheduledAt)}</h2><span class="caption">${period.label}</span></div>${statusBadge(dose, state.now)}</div>
      <div class="row" style="gap:15px">${photo(dose.photo, repository, { className: 'thumbnail', label: `Foto de ${dose.name}` })}<div class="grow stack" style="gap:3px"><h3>${escape(dose.name)}</h3><p class="muted">${dose.quantity} ${dose.quantity === 1 ? 'comprimido' : 'comprimidos'}</p></div></div>
      ${dose.confirmedAt ? `<p class="caption">Registrado às ${clockLabel(dose.confirmedAt)} · ${escape(by)}${Date.parse(dose.confirmedAt) - Date.parse(dose.scheduledAt) > 900000 ? ' · em atraso' : ''}</p>` : ''}
      ${actionable ? `<div class="divider"></div>${status === 'missed' ? '<p class="danger-ink">Sem confirmação. Converse com o idoso para conferir o que aconteceu.</p>' : ''}${button(dose.resendCount >= 3 ? 'Limite de reenvios atingido' : `Reenviar lembrete (${dose.resendCount}/3)`, 'resend', { id: dose.id, icon: 'notifications-outline', variant: 'secondary', disabled: dose.resendCount >= 3 })}${button('Registrar tomada informada', 'caregiver-confirm', { id: dose.id, icon: 'checkmark-outline', variant: 'quiet' })}` : ''}
      ${messages[dose.id] ? notice(messages[dose.id].text, messages[dose.id].error ? 'error' : 'success') : ''}</article>`;
  }
  root.MeuRemedio.ui = {
    escape,
    icon,
    button,
    periodBadge,
    statusBadge,
    photo,
    photoFallback,
    quantity,
    notice,
    empty,
    field,
    screen,
    doseCard,
  };
})(globalThis);
