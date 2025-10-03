// Универсальные утилиты для воспроизведения звуковых сигналов в приложении
// Используйте эти функции во всех компонентах, где нужны звуки событий

export type SoundEvent = 'pending' | 'success' | 'done' | 'error' | 'stable' | 'unstable';

// Глобальный AudioContext для избежания предупреждений
let globalAudioContext: AudioContext | null = null;
let isAudioContextInitialized = false;

// Инициализация AudioContext при первом пользовательском взаимодействии
export function initAudioContext(): AudioContext | null {
  if (isAudioContextInitialized && globalAudioContext) {
    return globalAudioContext;
  }

  try {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    isAudioContextInitialized = true;
    return globalAudioContext;
  } catch (error) {
    console.warn('Не удалось создать AudioContext:', error);
    return null;
  }
}

// Функция для возобновления AudioContext если он приостановлен
async function ensureAudioContextResumed(): Promise<AudioContext | null> {
  const audioContext = initAudioContext();
  if (!audioContext) return null;

  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (error) {
      console.warn('Не удалось возобновить AudioContext:', error);
      return null;
    }
  }

  return audioContext;
}

export function playTone(frequency: number, duration: number, waveform: OscillatorType = 'sine', volume = 0.3) {
  ensureAudioContextResumed().then(audioContext => {
    if (!audioContext) return;

    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.type = waveform;
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      console.warn('Ошибка воспроизведения тона:', error);
    }
  });
}

export function playNotificationSound(type: 'success' | 'unstable' | 'error') {
  ensureAudioContextResumed().then(audioContext => {
    if (!audioContext) return;

    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      let frequency = 800;
      let duration = 0.2;
      let waveform: OscillatorType = 'sine';
      switch (type) {
        case 'error': frequency = 400; duration = 0.5; break;
        case 'unstable': frequency = 520; duration = 0.15; waveform = 'triangle'; break;
        case 'success':
        default: frequency = 800; duration = 0.2; break;
      }
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.type = waveform;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      console.warn('Ошибка воспроизведения уведомления:', error);
    }
  });
}

export function playSoundChoice(choice: string, event: SoundEvent) {
  if (!choice || choice === 'off') return;
  switch (choice) {
    case 'win11_calendar': // Windows 11 calendar reminder style
      playTone(1318, 0.07, 'triangle');
      setTimeout(() => playTone(1568, 0.09, 'triangle'), 60);
      setTimeout(() => playTone(2093, 0.11, 'triangle'), 120);
      return;
    case 'win11_message': // Windows 11 message style
      playTone(1175, 0.08, 'sine');
      setTimeout(() => playTone(784, 0.10, 'sine'), 70);
      setTimeout(() => playTone(523, 0.13, 'sine'), 150);
      return;
    case 'macos_subtle': // macOS subtle notification
      playTone(1760, 0.05, 'triangle');
      setTimeout(() => playTone(2093, 0.07, 'triangle'), 40);
      setTimeout(() => playTone(2637, 0.09, 'triangle'), 90);
      return;
    case 'macos_bell': // macOS bell/alert
      playTone(2093, 0.09, 'sine');
      setTimeout(() => playTone(2637, 0.11, 'sine'), 60);
      setTimeout(() => playTone(3136, 0.13, 'sine'), 120);
      return;
    case 'win11_notify': // Windows 11 notification style
      playTone(1760, 0.07, 'triangle');
      setTimeout(() => playTone(1175, 0.09, 'triangle'), 60);
      setTimeout(() => playTone(880, 0.13, 'triangle'), 140);
      return;
    case 'win11_error': // Windows 11 error style
      playTone(523, 0.13, 'sine');
      setTimeout(() => playTone(392, 0.18, 'sine'), 90);
      setTimeout(() => playTone(261, 0.22, 'sine'), 200);
      return;
    case 'macos_pop': // macOS pop (пример)
      playTone(1046, 0.04, 'sine');
      setTimeout(() => playTone(784, 0.04, 'sine'), 40);
      setTimeout(() => playTone(523, 0.06, 'sine'), 80);
      return;
    case 'macos_glass': // macOS glass (пример)
      playTone(1568, 0.06, 'triangle');
      setTimeout(() => playTone(2093, 0.09, 'triangle'), 60);
      setTimeout(() => playTone(2637, 0.12, 'triangle'), 120);
      return;
    case 'soft':
      if (event === 'success' || event === 'done' || event === 'stable') return playTone(700, 0.12, 'sine');
      if (event === 'pending' || event === 'unstable') return playTone(520, 0.12, 'triangle');
      return playTone(420, 0.25, 'sine');
    case 'sharp':
      if (event === 'success' || event === 'done' || event === 'stable') return playTone(1000, 0.1, 'square');
      if (event === 'pending' || event === 'unstable') return playTone(650, 0.1, 'square');
      return playTone(400, 0.35, 'square');
    case 'double': {
      const f = event === 'error' ? 420 : (event === 'pending' || event === 'unstable') ? 600 : 900;
      playTone(f, 0.09, 'sine');
      setTimeout(() => playTone(f, 0.09, 'sine'), 90);
      return;
    }
    case 'beep3': {
      const f = event === 'error' ? 420 : (event === 'pending' || event === 'unstable') ? 600 : 800;
      playTone(f, 0.06, 'triangle');
      setTimeout(() => playTone(f, 0.06, 'triangle'), 80);
      setTimeout(() => playTone(f, 0.06, 'triangle'), 160);
      return;
    }
    case 'chime':
      playTone(880, 0.08, 'sine');
      setTimeout(() => playTone(1200, 0.12, 'sine'), 70);
      return;
    case 'low':
      return playTone(300, 0.28, 'sine');
    case 'bell':
      playTone(1568, 0.08, 'triangle');
      setTimeout(() => playTone(2093, 0.12, 'triangle'), 60);
      return;
    case 'ping':
      playTone(1318, 0.09, 'sine');
      setTimeout(() => playTone(1760, 0.07, 'sine'), 70);
      return;
    case 'pop':
      playTone(880, 0.04, 'square');
      setTimeout(() => playTone(660, 0.04, 'square'), 40);
      setTimeout(() => playTone(440, 0.04, 'square'), 80);
      return;
    case 'melody':
      playTone(784, 0.08, 'sine');
      setTimeout(() => playTone(880, 0.08, 'sine'), 90);
      setTimeout(() => playTone(988, 0.12, 'sine'), 180);
      return;
    case 'buzz':
      playTone(110, 0.25, 'sawtooth', 0.2);
      return;
    case 'click':
      playTone(2000, 0.02, 'square', 0.15);
      return;
    case 'drum':
      playTone(120, 0.08, 'triangle', 0.4);
      setTimeout(() => playTone(80, 0.09, 'triangle', 0.3), 60);
      return;
    case 'laser':
      playTone(1800, 0.04, 'sawtooth', 0.2);
      setTimeout(() => playTone(900, 0.08, 'sawtooth', 0.15), 40);
      return;
    case 'retro':
      playTone(1046, 0.05, 'square');
      setTimeout(() => playTone(784, 0.05, 'square'), 50);
      setTimeout(() => playTone(523, 0.07, 'square'), 100);
      return;
    case 'uplift':
      playTone(523, 0.06, 'sine');
      setTimeout(() => playTone(659, 0.06, 'sine'), 60);
      setTimeout(() => playTone(784, 0.08, 'sine'), 120);
      return;
    case 'fall':
      playTone(784, 0.06, 'triangle');
      setTimeout(() => playTone(659, 0.06, 'triangle'), 60);
      setTimeout(() => playTone(523, 0.08, 'triangle'), 120);
      return;
    case 'default':
    default:
      if (event === 'success' || event === 'done' || event === 'stable') return playNotificationSound('success');
      if (event === 'pending' || event === 'unstable') return playNotificationSound('unstable');
      return playNotificationSound('error');
  }
}

export const SOUND_CHOICES = [
  { value: 'win11_calendar', label: 'Windows 11: Календар' },
  { value: 'win11_message', label: 'Windows 11: Повідомлення' },
  { value: 'macos_subtle', label: 'macOS: Тихе сповіщення' },
  { value: 'macos_bell', label: 'macOS: Дзвінок' },
  { value: 'win11_notify', label: 'Windows 11: Сповіщення' },
  { value: 'win11_error', label: 'Windows 11: Помилка' },
  { value: 'macos_pop', label: 'macOS: Поп' },
  { value: 'macos_glass', label: 'macOS: Скло' },
  { value: 'off', label: 'Без звуку' },
  { value: 'default', label: 'Стандартний' },
  { value: 'soft', label: 'Мʼякий' },
  { value: 'sharp', label: 'Різкий' },
  { value: 'double', label: 'Подвійний' },
  { value: 'beep3', label: 'Потрійний' },
  { value: 'chime', label: 'Дзвоник' },
  { value: 'low', label: 'Низький' },
  { value: 'bell', label: 'Дзвінок' },
  { value: 'ping', label: 'Пінг' },
  { value: 'pop', label: 'Поп' },
  { value: 'melody', label: 'Мелодія' },
  { value: 'buzz', label: 'Дзвін (buzz)' },
  { value: 'click', label: 'Клік' },
  { value: 'drum', label: 'Барабан' },
  { value: 'laser', label: 'Лазер' },
  { value: 'retro', label: 'Ретро' },
  { value: 'uplift', label: 'Підйом' },
  { value: 'fall', label: 'Падіння' },
];
