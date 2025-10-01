import { useEffect, useMemo, useRef, useState } from 'react';
import { useEquipmentFromAuth } from '@/contexts/AuthContext';

type UnifiedWeightStatus = 'disconnected' | 'stale' | 'stable' | 'unstable' | 'warning' | 'error';

export interface UnifiedWeight {
  displayWeightKg: number | null;
  isStable: boolean;
  isUnstable: boolean;
  warning: boolean;
  isStale: boolean;
  status: UnifiedWeightStatus;
  timestamp: Date | null;
  rawHex?: string;
}

// Local simple tone player aligned with SettingsEquipment.tsx choices
const playTone = (frequency: number, duration: number, waveform: OscillatorType = 'sine', volume = 0.3) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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
  } catch {}
};

const playSoundChoice = (choice: string | undefined, event: 'stable' | 'unstable' | 'error') => {
  if (!choice || choice === 'off') return;
  switch (choice) {
    case 'soft':
      if (event === 'stable') return playTone(700, 0.12, 'sine');
      if (event === 'unstable') return playTone(520, 0.12, 'triangle');
      return playTone(420, 0.25, 'sine');
    case 'sharp':
      if (event === 'stable') return playTone(1000, 0.1, 'square');
      if (event === 'unstable') return playTone(650, 0.1, 'square');
      return playTone(400, 0.35, 'square');
    case 'double': {
      const f = event === 'error' ? 420 : event === 'unstable' ? 600 : 900;
      playTone(f, 0.09, 'sine');
      setTimeout(() => playTone(f, 0.09, 'sine'), 90);
      return;
    }
    case 'beep3': {
      const f = event === 'error' ? 420 : event === 'unstable' ? 600 : 800;
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
    case 'default':
    default: {
      // Fall back to simple cues
      if (event === 'stable') return playTone(800, 0.2, 'sine', 0.25);
      if (event === 'unstable') return playTone(520, 0.15, 'triangle', 0.25);
      return playTone(400, 0.5, 'sine', 0.25);
    }
  }
};

export function useUnifiedWeight(): UnifiedWeight {
  const [equipmentState] = useEquipmentFromAuth();
  const lastStableWeightRef = useRef<number | null>(null);
  const [displayWeight, setDisplayWeight] = useState<number | null>(null);
  const [status, setStatus] = useState<UnifiedWeightStatus>('disconnected');
  const [isStable, setIsStable] = useState(false);
  const [isUnstable, setIsUnstable] = useState(false);
  const [warning, setWarning] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const lastEventRef = useRef<'stable' | 'unstable' | 'error' | null>(null);

  const config = equipmentState?.config;
  const soundStable = (config as any)?.scale?.stableSound as string | undefined;
  const soundUnstable = (config as any)?.scale?.unstableSound as string | undefined;
  const soundError = (config as any)?.scale?.errorSound as string | undefined;

  // Fallback to default if sounds are undefined
  const finalSoundStable = soundStable || 'default';
  const finalSoundUnstable = soundUnstable || 'default';
  const finalSoundError = soundError || 'default';


  // Compute thresholds
  const activePollingInterval = config?.scale?.activePollingInterval || 1000;
  const cacheMs = config?.scale?.weightCacheDuration || 2000;
  const spikeThresholdKg = (config?.scale as any)?.amplitudeSpikeThresholdKg ?? 5;

  const rawHex = useMemo(() => {
    const raw = equipmentState?.currentWeight?.rawData;
    if (!raw) return undefined;
    return Array.from(raw).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  }, [equipmentState?.currentWeight?.rawData]);

  // Derive unified status on weight changes
  useEffect(() => {
    const cw = equipmentState?.currentWeight;
    const connected = !!equipmentState?.isScaleConnected;
    
    
    if (!connected || !cw) {
      setStatus('disconnected');
      setIsStable(false);
      setIsUnstable(false);
      setWarning(false);
      setIsStale(false);
      setDisplayWeight(null);
      return;
    }

    // Staleness check
    const now = Date.now();
    const ts = cw.timestamp ? new Date(cw.timestamp).getTime() : now;
    const age = now - ts;
    const staleThreshold = Math.max(cacheMs, activePollingInterval * 2);
    const stale = age > staleThreshold;
    setIsStale(stale);
    if (stale) {
      setStatus('stale');
      // Do not change display weight on stale; keep last stable
      return;
    }

    const bytes = cw.rawData ? Array.from(cw.rawData) : [];
    const suffix2 = bytes.slice(-2).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const serviceStable = suffix2 === '00 00';
    const serviceUnstableKnown = suffix2 === '00 04';
    const hasInnerDigitsOnZero = serviceStable && cw.weight === 0 && bytes.slice(0, -2).some(b => b !== 0);

    const lastStable = lastStableWeightRef.current;
    const weight = typeof cw.weight === 'number' ? cw.weight : null;
    const jumpedTooMuch = lastStable !== null && weight !== null && Math.abs(weight - lastStable) >= spikeThresholdKg;

    const unstable = serviceUnstableKnown || hasInnerDigitsOnZero || (!serviceStable && suffix2 !== '');
    const stable = serviceStable && !unstable;
    const isWarn = stable && jumpedTooMuch;

    // Reset lastEvent if weight changed significantly to allow sound replay
    if (lastStable !== null && weight !== null && Math.abs(weight - lastStable) > 0.01) {
      lastEventRef.current = null;
    }


    setIsStable(stable);
    setIsUnstable(unstable);
    setWarning(isWarn);

    // Update display value: no flicker on warnings/unstable
    if (stable && weight !== null) {
      lastStableWeightRef.current = weight;
      setDisplayWeight(weight);
      setStatus('stable');
      if (lastEventRef.current !== 'stable') {
        playSoundChoice(finalSoundStable, 'stable');
        lastEventRef.current = 'stable';
      }
    } else if (isWarn) {
      setStatus('warning');
      if (lastEventRef.current !== 'unstable') {
        playSoundChoice(finalSoundUnstable, 'unstable');
        lastEventRef.current = 'unstable';
      }
    } else if (unstable) {
      setStatus('unstable');
      if (lastEventRef.current !== 'unstable') {
        playSoundChoice(finalSoundUnstable, 'unstable');
        lastEventRef.current = 'unstable';
      }
    } else {
      setStatus('error');
      if (lastEventRef.current !== 'error') {
        playSoundChoice(finalSoundError, 'error');
        lastEventRef.current = 'error';
      }
    }
  }, [equipmentState?.currentWeight, equipmentState?.isScaleConnected, cacheMs, activePollingInterval, spikeThresholdKg, finalSoundStable, finalSoundUnstable, finalSoundError]);

  return {
    displayWeightKg: displayWeight,
    isStable,
    isUnstable,
    warning,
    isStale,
    status,
    timestamp: equipmentState?.currentWeight?.timestamp || null,
    rawHex
  };
}


