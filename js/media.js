/** Integrações do navegador: voz, sons e leitura de fotografias. */
(function (root) {
  'use strict';
  const { PERIODS, clockLabel } = root.MeuRemedio.domain;
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
  let notify = () => {};
  function stopSounds() {
    Object.values(sounds).forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }
  function play(name) {
    const sound = sounds[name];
    if (!sound) return;
    stopSounds();
    sound
      .play()
      .then(() => {
        pendingSound = null;
      })
      .catch((error) => {
        if (error.name === 'NotAllowedError') {
          pendingSound = name;
          notify('Toque na tela ou use Ouvir para ativar o som.');
        } else if (error.name !== 'AbortError')
          notify('Não foi possível reproduzir o som. Verifique o volume do navegador.');
      });
  }
  function unlock() {
    if (pendingSound) {
      const name = pendingSound;
      pendingSound = null;
      play(name);
    }
  }
  function speak(text) {
    stopSounds();
    pendingSound = null;
    if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) {
      notify(
        'Áudio indisponível neste navegador. Abra o protótipo no Chrome ou Edge com uma voz em português instalada.',
      );
      return;
    }
    root.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'pt-BR';
    speech.rate = 0.82;
    const voices = root.speechSynthesis.getVoices();
    speech.voice =
      voices.find((voice) => voice.lang.replace('_', '-').toLowerCase() === 'pt-br') ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith('pt')) ||
      null;
    speech.onerror = (event) => {
      if (!['canceled', 'interrupted'].includes(event.error))
        notify(
          'Não foi possível ler em voz alta. Verifique o volume e a voz em português do navegador.',
        );
    };
    root.speechSynthesis.speak(speech);
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
    doseSpeech,
    photoUrl,
    readPhoto,
    stopSounds,
    onMessage(callback) {
      notify = callback;
    },
  };
})(globalThis);
