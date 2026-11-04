/**
 * Regras do Meu Remédio, independentes da interface e do navegador.
 * @typedef {'patient'|'caregiver'} Role
 * @typedef {'morning'|'lunch'|'afternoon'|'night'} Period
 * @typedef {'scheduled'|'pending'|'missed'|'completed'} DoseStatus
 * @typedef {{kind:'sample'|'local',value:string}} Photo
 * @typedef {{id:string,time:string,quantity:number,period:Period}} Schedule
 * @typedef {{id:string,name:string,photo:Photo,schedules:Schedule[],effectiveFrom:string,active:boolean}} Medication
 * @typedef {{id:string,medicationId:string,scheduleId:string,day:string,scheduledAt:string,name:string,photo:Photo,quantity:number,period:Period,confirmedAt?:string,confirmedBy?:string,confirmedByName?:string,resendCount:number}} Dose
 * @typedef {{version:1,patient:{id:string,name:string,age:number},caregivers:Array<{id:string,name:string,relationship:string,photo?:string}>,primaryCaregiverId:string,activeCaregiverId:string,role:Role|null,now:string,medications:Medication[],doses:Dose[],events:Array<{id:string,kind:string,at:string,doseId?:string,title:string,detail:string,read:boolean}>}} AppState
 */
(function (root) {
  'use strict';
  const PERIODS = [
    {
      key: 'morning',
      label: 'Manhã',
      icon: 'sunny-outline',
      color: '#986000',
      background: '#FFF0CD',
    },
    {
      key: 'lunch',
      label: 'Almoço',
      icon: 'restaurant-outline',
      color: '#A74522',
      background: '#FCE8DD',
    },
    {
      key: 'afternoon',
      label: 'Tarde',
      icon: 'partly-sunny-outline',
      color: '#6C5815',
      background: '#F6F0CB',
    },
    { key: 'night', label: 'Noite', icon: 'moon-outline', color: '#65549D', background: '#EEE9FA' },
  ];
  const STATUSES = {
    scheduled: {
      label: 'Programado',
      color: '#546477',
      background: '#EFF2F5',
      icon: 'time-outline',
    },
    pending: {
      label: 'Pendente',
      color: '#89530A',
      background: '#FFF0CD',
      icon: 'notifications-outline',
    },
    missed: {
      label: 'Esquecido',
      color: '#AF3936',
      background: '#FDEBE8',
      icon: 'alert-circle-outline',
    },
    completed: {
      label: 'Concluído',
      color: '#17634E',
      background: '#E2F3EA',
      icon: 'checkmark-circle-outline',
    },
  };

  function dayKey(value) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function atTime(day, time) {
    return new Date(`${day}T${time}:00`).toISOString();
  }
  function addDays(day, amount) {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return dayKey(date);
  }
  function clockLabel(value) {
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function dateLabel(day, long = false) {
    return new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: long ? 'long' : 'short',
    });
  }
  function weekdayLabel(day) {
    return new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
  }

  const TOLERANCE_MS = 15 * 60 * 1000;
  const MAX_RESENDS = 3;
  class DomainError extends Error {}
  function doseStatus(dose, now) {
    if (dose.confirmedAt) return 'completed';
    const elapsed = Date.parse(now) - Date.parse(dose.scheduledAt);
    if (elapsed < 0) return 'scheduled';
    return elapsed <= TOLERANCE_MS ? 'pending' : 'missed';
  }
  function dosesForDay(state, day = dayKey(state.now)) {
    return state.doses
      .filter((dose) => dose.day === day)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
  }
  function currentDose(state) {
    const doses = dosesForDay(state);
    return (
      doses.find((dose) => doseStatus(dose, state.now) === 'pending') ??
      doses.find((dose) => doseStatus(dose, state.now) === 'missed') ??
      doses.find((dose) => doseStatus(dose, state.now) === 'scheduled')
    );
  }
  function generateDay(medications, existing, day) {
    const ids = new Set(existing.map((dose) => dose.id));
    const generated = [];
    for (const medication of medications.filter((item) => item.active)) {
      for (const schedule of medication.schedules) {
        const id = `${day}:${medication.id}:${schedule.id}`;
        const scheduledAt = atTime(day, schedule.time);
        if (ids.has(id) || scheduledAt < medication.effectiveFrom) continue;
        generated.push({
          id,
          medicationId: medication.id,
          scheduleId: schedule.id,
          day,
          scheduledAt,
          name: medication.name,
          photo: medication.photo,
          quantity: schedule.quantity,
          period: schedule.period,
          resendCount: 0,
        });
        ids.add(id);
      }
    }
    return [...existing, ...generated];
  }
  function appendEvent(state, event) {
    if (state.events.some((item) => item.id === event.id)) return state;
    return { ...state, events: [...state.events, event] };
  }
  function reconcile(state) {
    let next = state;
    for (const dose of state.doses) {
      if (dose.confirmedAt) continue;
      const status = doseStatus(dose, state.now);
      if (status !== 'scheduled')
        next = appendEvent(next, {
          id: `pending:${dose.id}`,
          kind: 'pending',
          at: dose.scheduledAt,
          doseId: dose.id,
          title: 'Chegou a hora da dose',
          detail: `${dose.name} · ${clockLabel(dose.scheduledAt)}`,
          read: false,
        });
      if (status === 'missed')
        next = appendEvent(next, {
          id: `missed:${dose.id}`,
          kind: 'missed',
          at: new Date(Date.parse(dose.scheduledAt) + TOLERANCE_MS + 1).toISOString(),
          doseId: dose.id,
          title: 'Uma dose precisa de atenção',
          detail: `${dose.name} · sem confirmação após 15 minutos`,
          read: false,
        });
    }
    return next;
  }
  function requireDose(state, id) {
    const dose = state.doses.find((item) => item.id === id);
    if (!dose) throw new DomainError('Dose não encontrada.');
    return dose;
  }
  function requireCaregiver(state, id) {
    if (!state.caregivers.some((item) => item.id === id))
      throw new DomainError('Cuidador não encontrado.');
  }
  function validateMedication(medication) {
    if (!medication.name.trim()) throw new DomainError('Informe o nome do medicamento.');
    if (!medication.photo.value) throw new DomainError('Escolha uma fotografia.');
    if (!medication.schedules.length) throw new DomainError('Adicione pelo menos um horário.');
    const times = new Set();
    for (const schedule of medication.schedules) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time))
        throw new DomainError('Use um horário válido, como 08:00.');
      if (!Number.isInteger(schedule.quantity) || schedule.quantity < 1 || schedule.quantity > 12)
        throw new DomainError('Escolha uma quantidade entre 1 e 12 comprimidos.');
      if (times.has(schedule.time))
        throw new DomainError('Os horários do mesmo medicamento precisam ser diferentes.');
      times.add(schedule.time);
    }
  }
  function appReducer(state, action) {
    switch (action.type) {
      case 'role':
        return { ...state, role: action.role };
      case 'clock': {
        if (!Number.isFinite(Date.parse(action.now)) || action.now < state.now)
          throw new DomainError('O relógio só pode avançar.');
        let doses = state.doses;
        for (let day = dayKey(state.now); day <= dayKey(action.now); day = addDays(day, 1)) {
          doses = generateDay(state.medications, doses, day);
        }
        return reconcile({ ...state, now: action.now, doses });
      }
      case 'confirm': {
        const dose = requireDose(state, action.doseId);
        if (dose.confirmedAt) return state;
        const status = doseStatus(dose, state.now);
        if (status === 'scheduled') throw new DomainError('O horário desta dose ainda não chegou.');
        if (action.by === state.patient.id) {
          if (status === 'missed')
            throw new DomainError('Peça ajuda ao seu cuidador para esta dose.');
          if (dose.day !== dayKey(state.now)) throw new DomainError('Peça ajuda ao seu cuidador.');
        } else requireCaregiver(state, action.by);
        return appendEvent(
          {
            ...state,
            doses: state.doses.map((item) =>
              item.id === dose.id
                ? {
                    ...item,
                    confirmedAt: state.now,
                    confirmedBy: action.by,
                    confirmedByName:
                      action.by === state.patient.id
                        ? state.patient.name
                        : state.caregivers.find((caregiver) => caregiver.id === action.by).name,
                  }
                : item,
            ),
          },
          {
            id: `completed:${dose.id}`,
            kind: 'completed',
            at: state.now,
            doseId: dose.id,
            title: 'Dose registrada',
            detail: `${dose.name} · ${clockLabel(state.now)}${status === 'missed' ? ' · registro em atraso pelo cuidador' : ''}`,
            read: false,
          },
        );
      }
      case 'resend': {
        const dose = requireDose(state, action.doseId);
        const status = doseStatus(dose, state.now);
        if (status !== 'pending' && status !== 'missed')
          throw new DomainError('Só é possível reenviar alertas de doses pendentes ou esquecidas.');
        if (dose.resendCount >= MAX_RESENDS)
          throw new DomainError('Esta dose já recebeu os três reenvios.');
        return appendEvent(
          {
            ...state,
            doses: state.doses.map((item) =>
              item.id === dose.id ? { ...item, resendCount: item.resendCount + 1 } : item,
            ),
          },
          {
            id: `resend:${dose.id}:${dose.resendCount + 1}`,
            kind: 'resend',
            at: state.now,
            doseId: dose.id,
            title: 'Lembrete reenviado',
            detail: `${dose.name} · envio ${dose.resendCount + 1} de 3`,
            read: false,
          },
        );
      }
      case 'help': {
        const caregiver = state.caregivers.find((item) => item.id === state.primaryCaregiverId);
        return appendEvent(state, {
          id: action.id,
          kind: 'help',
          at: state.now,
          title: `${state.patient.name} pediu ajuda`,
          detail: `Pedido direcionado a ${caregiver.name}.`,
          read: false,
        });
      }
      case 'saveMedication': {
        validateMedication(action.medication);
        const medication = {
          ...action.medication,
          name: action.medication.name.trim(),
          effectiveFrom: new Date(Date.parse(state.now) + 1).toISOString(),
        };
        const medications = [
          ...state.medications.filter((item) => item.id !== medication.id),
          medication,
        ];
        const kept = state.doses.filter(
          (dose) =>
            dose.medicationId !== medication.id ||
            dose.scheduledAt <= state.now ||
            dose.confirmedAt,
        );
        return { ...state, medications, doses: generateDay(medications, kept, dayKey(state.now)) };
      }
      case 'archiveMedication':
        return {
          ...state,
          medications: state.medications.map((item) =>
            item.id === action.medicationId ? { ...item, active: false } : item,
          ),
          doses: state.doses.filter(
            (dose) =>
              dose.medicationId !== action.medicationId ||
              dose.scheduledAt <= state.now ||
              dose.confirmedAt,
          ),
        };
      case 'addCaregiver': {
        if (!action.caregiver.name.trim() || !action.caregiver.relationship.trim())
          throw new DomainError('Preencha nome e vínculo do cuidador.');
        return {
          ...state,
          caregivers: [
            ...state.caregivers,
            {
              ...action.caregiver,
              name: action.caregiver.name.trim(),
              relationship: action.caregiver.relationship.trim(),
            },
          ],
        };
      }
      case 'removeCaregiver': {
        requireCaregiver(state, action.caregiverId);
        if (state.caregivers.length === 1)
          throw new DomainError('Mantenha pelo menos um cuidador no grupo.');
        const caregivers = state.caregivers.filter((item) => item.id !== action.caregiverId);
        return {
          ...state,
          caregivers,
          primaryCaregiverId:
            state.primaryCaregiverId === action.caregiverId
              ? caregivers[0].id
              : state.primaryCaregiverId,
          activeCaregiverId:
            state.activeCaregiverId === action.caregiverId
              ? caregivers[0].id
              : state.activeCaregiverId,
        };
      }
      case 'primaryCaregiver':
        requireCaregiver(state, action.caregiverId);
        return { ...state, primaryCaregiverId: action.caregiverId };
      case 'activeCaregiver':
        requireCaregiver(state, action.caregiverId);
        return { ...state, activeCaregiverId: action.caregiverId };
      case 'readEvents':
        return { ...state, events: state.events.map((event) => ({ ...event, read: true })) };
    }
  }

  function createSeed(date = new Date()) {
    const today = dayKey(date);
    const firstDay = addDays(today, -7);
    const medications = [
      {
        id: 'medicine-1',
        name: 'Comprimido redondo',
        photo: { kind: 'sample', value: 'morning' },
        active: true,
        effectiveFrom: atTime(firstDay, '00:00'),
        schedules: [
          { id: 'morning-1', time: '08:00', quantity: 1, period: 'morning' },
          { id: 'night-1', time: '20:00', quantity: 1, period: 'night' },
        ],
      },
      {
        id: 'medicine-2',
        name: 'Comprimido oval',
        photo: { kind: 'sample', value: 'lunch' },
        active: true,
        effectiveFrom: atTime(firstDay, '00:00'),
        schedules: [{ id: 'lunch-1', time: '12:00', quantity: 2, period: 'lunch' }],
      },
      {
        id: 'medicine-3',
        name: 'Cartela prateada',
        photo: { kind: 'sample', value: 'night' },
        active: true,
        effectiveFrom: atTime(firstDay, '00:00'),
        schedules: [{ id: 'afternoon-1', time: '16:00', quantity: 1, period: 'afternoon' }],
      },
    ];
    let state = {
      version: 1,
      patient: { id: 'benedita', name: 'Dona Benedita', age: 72 },
      caregivers: [
        { id: 'carlos', name: 'Carlos', relationship: 'Filho', photo: 'carlos' },
        { id: 'marcia', name: 'Márcia', relationship: 'Cuidadora', photo: 'marcia' },
      ],
      primaryCaregiverId: 'carlos',
      activeCaregiverId: 'carlos',
      role: null,
      now: atTime(today, '08:00'),
      medications,
      doses: [],
      events: [],
    };
    for (let i = -7; i <= 0; i++) {
      const day = addDays(today, i);
      state.doses = generateDay(medications, state.doses, day);
      if (i < 0)
        state.doses = state.doses.map((dose) =>
          dose.day === day && !(i === -2 && dose.period === 'night')
            ? {
                ...dose,
                confirmedAt: new Date(Date.parse(dose.scheduledAt) + 120000).toISOString(),
                confirmedBy: i % 2 ? 'benedita' : 'marcia',
                confirmedByName: i % 2 ? 'Dona Benedita' : 'Márcia',
              }
            : dose,
        );
    }
    state = reconcile(state);
    state.events = state.events.map((event) => ({
      ...event,
      read: event.at < atTime(today, '00:00'),
    }));
    return state;
  }

  const api = {
    PERIODS,
    STATUSES,
    dayKey,
    atTime,
    addDays,
    clockLabel,
    dateLabel,
    weekdayLabel,
    TOLERANCE_MS,
    MAX_RESENDS,
    DomainError,
    doseStatus,
    dosesForDay,
    currentDose,
    generateDay,
    reconcile,
    validateMedication,
    appReducer,
    createSeed,
  };
  root.MeuRemedio = root.MeuRemedio || {};
  root.MeuRemedio.domain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
