// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect, vi } from 'vitest';
import { createNasaScenarioReplay, installScenarioHotkeys } from '../src/rooms/personal/spaceWeatherLive.js';
import { gameData } from '../src/data/index.js';

describe('offline NASA scenario replay (Personal)', () => {
  it('starts calm and advances historical counts with the mission clock', () => {
    const replay = createNasaScenarioReplay(gameData.real.escenarios_nasa);
    expect(replay.activeId).toBe('calmado');
    expect(replay.getSnapshot().counts).toMatchObject({ cmeCount: 0, gstCount: 0, sepCount: 0, flrCount: 0 });

    replay.syncClock({ day: 3, hour: 6, minute: 0 });
    expect(replay.activeId).toBe('moderado');
    expect(replay.getSnapshot().counts.flrCount).toBe(0);
    expect(replay.getSnapshot().nextEvent.data.classType).toBe('M2.3');

    replay.syncClock({ day: 3, hour: 10, minute: 0 });
    expect(replay.getSnapshot().counts.flrCount).toBe(1);
    replay.syncClock({ day: 3, hour: 12, minute: 0 });
    expect(replay.getSnapshot().counts.flrCount).toBe(2);
    replay.syncClock({ day: 3, hour: 18, minute: 0 });
    expect(replay.getSnapshot().counts).toMatchObject({ cmeCount: 1, flrCount: 2 });
  });

  it('replays the three-day G5 event over the extreme stage, including changing Kp', () => {
    const replay = createNasaScenarioReplay(gameData.real.escenarios_nasa);
    replay.syncClock({ day: 5, hour: 18, minute: 0 });
    expect(replay.activeId).toBe('extremo');
    expect(replay.getSnapshot().counts).toMatchObject({ cmeCount: 3, gstCount: 1, sepCount: 4, maxKp: 7.67 });

    replay.syncClock({ day: 6, hour: 0, minute: 0 });
    expect(replay.getSnapshot().sourceDate).toBe('2024-05-11');
    expect(replay.getSnapshot().counts.maxKp).toBe(9);
    replay.syncClock({ day: 7, hour: 23, minute: 59 });
    expect(replay.getSnapshot().counts).toMatchObject({ cmeCount: 14, gstCount: 2, sepCount: 6, flrCount: 38 });
  });

  it('allows a manual override until the next automatic stage and rejects unknown scenarios', () => {
    const replay = createNasaScenarioReplay(gameData.real.escenarios_nasa);
    expect(replay.select('extremo')).toBe(true);
    expect(replay.activeId).toBe('extremo');
    expect(replay.getSnapshot().sourceDate).toBe('2024-05-10');
    expect(replay.select('unknown')).toBe(false);

    replay.syncClock({ day: 2, hour: 6, minute: 0 });
    expect(replay.activeId).toBe('extremo');
    replay.syncClock({ day: 3, hour: 6, minute: 0 });
    expect(replay.activeId).toBe('moderado');
  });

  it('binds 1/2/3 shortcuts without making requests', () => {
    const replay = createNasaScenarioReplay(gameData.real.escenarios_nasa);
    const handlers = {};
    const target = {
      addEventListener: (type, handler) => { handlers[type] = handler; },
      removeEventListener: (type) => { delete handlers[type]; },
    };
    const fetch = vi.spyOn(globalThis, 'fetch');
    const preventDefault = vi.fn();
    installScenarioHotkeys(replay, target);
    handlers.keydown({
      key: '3',
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      target: null,
      preventDefault,
    });

    expect(replay.activeId).toBe('extremo');
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
