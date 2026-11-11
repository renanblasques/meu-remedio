/** Integrações do navegador: voz, sons e leitura de fotografias. */
(function (root) {
  'use strict';
  const { PERIODS, clockLabel, currentDose, doseStatus, dosesForDay } = root.MeuRemedio.domain;
  const samples = {
    morning: 'assets/images/medicine-morning.jpg',
    lunch: 'assets/images/medicine-lunch.jpg',
    night: 'assets/images/medicine-night.jpg',
  };
  const sounds =
    typeof root.Audio === 'function'
      ? {
          alert: new Audio('assets/sounds/alert.wav'),
          success: new Audio('assets/sounds/success.wav'),
        }
      : {};
  let pendingSound = null;
  let activeSound = null;
  let narration = null;
  let notify = () => {};
  function stopSounds() {
    activeSound = null;
    pendingSound = null;
    Object.values(sounds).forEach((audio) => {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
    });
  }
  function stopSpeech(automaticOnly = false) {
    if (automaticOnly && !narration?.automatic) return;
    narration = null;
    root.speechSynthesis?.cancel();
    if (automaticOnly) unlock();
  }
  function play(name) {
    const sound = sounds[name];
    if (!sound) return;
    if (narration?.utterance) {
      pendingSound = name;
      return;
    }
    stopSounds();
    const playback = { sound };
    activeSound = playback;
    const finish = () => {
      if (activeSound !== playback) return;
      activeSound = null;
      sound.onended = null;
      sound.onerror = null;
      startSpeech();
    };
    sound.onended = finish;
    sound.onerror = () => {
      if (activeSound !== playback) return;
      notify('Não foi possível reproduzir o som. Verifique o volume do navegador.');
      finish();
    };
    sound
      .play()
      .catch((error) => {
        if (activeSound !== playback) return;
        activeSound = null;
        sound.onended = null;
        sound.onerror = null;
        if (error.name === 'NotAllowedError') {
          pendingSound = name;
          notify('Toque na tela ou use Ouvir para ativar o som.');
        } else {
          if (error.name !== 'AbortError')
            notify('Não foi possível reproduzir o som. Verifique o volume do navegador.');
          startSpeech();
        }
      });
  }
  function unlock() {
    if (narration) narration.blocked = false;
    if (pendingSound && !narration?.utterance) {
      const name = pendingSound;
      pendingSound = null;
      play(name);
    } else startSpeech();
  }
  function startSpeech() {
    const request = narration;
    if (!request || request.utterance || request.blocked || activeSound || pendingSound) return;
    if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) {
      narration = null;
      notify(
        'Áudio indisponível neste navegador. Abra o protótipo no Chrome ou Edge com uma voz em português instalada.',
      );
      return;
    }
    const speech = new root.SpeechSynthesisUtterance(request.text);
    request.utterance = speech;
    speech.lang = 'pt-BR';
    speech.rate = 0.82;
    const voices = root.speechSynthesis.getVoices();
    speech.voice =
      voices.find((voice) => voice.lang.replace('_', '-').toLowerCase() === 'pt-br') ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith('pt')) ||
      null;
    speech.onstart = () => {
      if (narration === request) notify(null);
    };
    speech.onend = () => {
      if (narration !== request || request.utterance !== speech) return;
      narration = null;
      unlock();
    };
    speech.onerror = (event) => {
      if (narration !== request || request.utterance !== speech) return;
      request.utterance = null;
      if (event.error === 'not-allowed') {
        request.blocked = true;
        notify('Toque na tela ou use Ouvir para ativar o som.');
      } else {
        narration = null;
        if (!['canceled', 'interrupted'].includes(event.error))
          notify(
            'Não foi possível ler em voz alta. Verifique o volume e a voz em português do navegador.',
          );
        unlock();
      }
    };
    root.speechSynthesis.speak(speech);
  }
  function speak(text, { automatic = false } = {}) {
    stopSpeech();
    if (!automatic) stopSounds();
    if (!text) return;
    narration = { text, automatic, utterance: null, blocked: false };
    startSpeech();
  }
  function patientSpeech({ state, route, helpSent = false }) {
    switch (route.path) {
      case '/patient': {
        const dose = currentDose(state);
        return dose
          ? doseSpeech(dose, doseStatus(dose, state.now))
          : 'Tudo em dia. As doses de hoje já estão registradas.';
      }
      case '/patient/success': {
        const dose = state.doses.find(
          (item) => item.id === route.params.get('dose') && item.confirmedAt,
        );
        return dose
          ? 'Esta dose já está registrada. Seu cuidador pode acompanhar.'
          : 'Dose não encontrada. Confira seu dia para consultar as doses e seus registros.';
      }
      case '/patient/day':
        return dosesForDay(state).length
          ? 'Este é o seu dia. Aqui você pode conferir os horários e os registros dos seus remédios. Para ouvir as orientações de cada remédio, toque em Ouvir no cartão dele.'
          : 'Hoje não há doses cadastradas. Peça ajuda ao cuidador se tiver alguma dúvida.';
      case '/patient/help': {
        const caregiver = state.caregivers.find((item) => item.id === state.primaryCaregiverId);
        return helpSent
          ? `Seu pedido para ${caregiver.name} foi registrado.`
          : `Este é ${caregiver.name}, seu cuidador. Toque no botão verde para pedir ajuda.`;
      }
      default:
        return null;
    }
  }
  function doseSpeech(dose, status) {
    const period = PERIODS.find((item) => item.key === dose.period).label;
    const intro = `${dose.name}. ${period}, às ${clockLabel(dose.scheduledAt)}. Quantidade cadastrada: ${dose.quantity} ${dose.quantity === 1 ? 'comprimido' : 'comprimidos'}.`;
    if (status === 'completed')
      return `${intro} Esta dose já foi registrada. Não registre outra vez.`;
    if (status === 'missed') return `${intro} O horário passou. Peça ajuda ao seu cuidador.`;
    if (status === 'scheduled') return `${intro} O horário ainda não chegou.`;
    return `${intro} Confira a foto. Depois de tomar, toque no botão verde para registrar.`;
  }
  function photoUrl(photo, repository) {
    if (photo.kind === 'sample') return samples[photo.value] || '';
    try {
      return repository.getPhoto(photo.value) || '';
    } catch {
      return '';
    }
  }
  /** Redimensionamento limita a ocupação; fotos ficam fora do snapshot das doses. */
  async function readPhoto(file) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Não foi possível ler essa imagem.'));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(
          new Error('Este formato de imagem não pôde ser aberto. Tente uma foto JPEG ou PNG.'),
        );
      element.src = data;
    });
    const ratio = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }
  root.MeuRemedio.media = {
    samples,
    play,
    unlock,
    speak,
    stopSpeech,
    patientSpeech,
    doseSpeech,
    photoUrl,
    readPhoto,
    stopSounds,
    onMessage(callback) {
      notify = callback;
    },
  };
})(globalThis);
