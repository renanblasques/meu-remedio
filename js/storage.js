/** Persistência do protótipo. Fotos são armazenadas uma vez e referenciadas por ID. */
(function (root) {
  'use strict';
  const STATE_KEY = 'meu-remedio:web:state:v1';
  const PHOTO_PREFIX = 'meu-remedio:web:photo:';
  const periods = new Set(['morning', 'lunch', 'afternoon', 'night']);
  const isoDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const photo = (value) =>
    value &&
    ['sample', 'local'].includes(value.kind) &&
    typeof value.value === 'string' &&
    value.value.length > 0;

  /** @param {unknown} value @returns {boolean} */
  function isAppState(value) {
    const state = value;
    return (
      !!state &&
      state.version === 1 &&
      isoDate(state.now) &&
      typeof state.patient?.id === 'string' &&
      typeof state.patient?.name === 'string' &&
      [null, 'patient', 'caregiver'].includes(state.role) &&
      Array.isArray(state.caregivers) &&
      state.caregivers.length > 0 &&
      state.caregivers.every(
        (item) =>
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.relationship === 'string',
      ) &&
      state.caregivers.some((item) => item.id === state.primaryCaregiverId) &&
      state.caregivers.some((item) => item.id === state.activeCaregiverId) &&
      Array.isArray(state.medications) &&
      state.medications.every(
        (item) =>
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          photo(item.photo) &&
          isoDate(item.effectiveFrom) &&
          Array.isArray(item.schedules) &&
          item.schedules.every(
            (schedule) =>
              typeof schedule.id === 'string' &&
              /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) &&
              Number.isInteger(schedule.quantity) &&
              schedule.quantity >= 1 &&
              schedule.quantity <= 12 &&
              periods.has(schedule.period),
          ),
      ) &&
      Array.isArray(state.doses) &&
      state.doses.every(
        (item) =>
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          photo(item.photo) &&
          isoDate(item.scheduledAt) &&
          (!item.confirmedAt || isoDate(item.confirmedAt)) &&
          typeof item.day === 'string' &&
          Number.isInteger(item.quantity) &&
          item.quantity >= 1 &&
          item.quantity <= 12 &&
          periods.has(item.period) &&
          Number.isInteger(item.resendCount) &&
          item.resendCount >= 0 &&
          item.resendCount <= 3,
      ) &&
      Array.isArray(state.events) &&
      state.events.every(
        (item) =>
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.detail === 'string' &&
          isoDate(item.at) &&
          ['pending', 'missed', 'completed', 'resend', 'help'].includes(item.kind) &&
          typeof item.read === 'boolean',
      )
    );
  }

  /** Storage pode ser injetado nos testes; o acesso ao localStorage pode lançar SecurityError. */
  function createRepository(storage) {
    const backend = () => (storage === undefined ? root.localStorage : storage);
    return {
      load() {
        const raw = backend().getItem(STATE_KEY);
        if (raw === null) return null;
        let value;
        try {
          value = JSON.parse(raw);
        } catch {
          value = null;
        }
        if (!isAppState(value)) {
          const error = new Error('Os dados salvos não puderam ser lidos.');
          error.code = 'CORRUPT_DATA';
          throw error;
        }
        return value;
      },
      save(state) {
        backend().setItem(STATE_KEY, JSON.stringify(state));
      },
      putPhoto(dataUrl, id) {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/'))
          throw new Error('Fotografia inválida.');
        backend().setItem(PHOTO_PREFIX + id, dataUrl);
        return { kind: 'local', value: id };
      },
      getPhoto(id) {
        return backend().getItem(PHOTO_PREFIX + id);
      },
      clearPhotos() {
        const target = backend();
        const keys = Array.from({ length: target.length }, (_, i) => target.key(i));
        keys
          .filter((key) => key?.startsWith(PHOTO_PREFIX))
          .forEach((key) => target.removeItem(key));
      },
    };
  }
  const api = { STATE_KEY, PHOTO_PREFIX, isAppState, createRepository };
  root.MeuRemedio = root.MeuRemedio || {};
  root.MeuRemedio.storage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
