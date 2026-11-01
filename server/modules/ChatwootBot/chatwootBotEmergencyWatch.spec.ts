import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentRepliedSince,
  clearEmergencyWatch,
  isEmergencyWatchActive,
  startEmergencyWatch,
} from './chatwootBotEmergencyWatch.js';

afterEach(() => {
  vi.useRealTimers();
  clearEmergencyWatch(1);
});

describe('emergency watch', () => {
  it('is active until the timeout fires the fallback once', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn(async () => undefined);
    startEmergencyWatch(1, 5 * 60_000, onTimeout);
    expect(isEmergencyWatchActive(1)).toBe(true);
    vi.advanceTimersByTime(5 * 60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(isEmergencyWatchActive(1)).toBe(false);
  });

  it('clear cancels the fallback', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn(async () => undefined);
    startEmergencyWatch(1, 60_000, onTimeout);
    clearEmergencyWatch(1);
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('detects an agent reply after the call started', () => {
    const now = 1_000_000;
    const startedAt = now - 5 * 60_000;
    expect(agentRepliedSince(startedAt, 2, now)).toBe(true);
    expect(agentRepliedSince(startedAt, 10, now)).toBe(false);
    expect(agentRepliedSince(startedAt, null, now)).toBe(false);
  });
});
