import { describe, expect, it } from 'vitest';
import '../lib/testBrowser';
import { spaceWarning } from './cloudSync';

describe('warning about the space used', () => {
  it('once past 80 %, once more past 95 %', () => {
    expect(spaceWarning(0.5, 0)).toEqual({ warned: 0, warn: false });
    expect(spaceWarning(0.82, 0)).toEqual({ warned: 0.8, warn: true });
    expect(spaceWarning(0.9, 0.8)).toEqual({ warned: 0.8, warn: false });
    expect(spaceWarning(0.96, 0.8)).toEqual({ warned: 0.95, warn: true });
    expect(spaceWarning(0.97, 0.95)).toEqual({ warned: 0.95, warn: false });
  });

  it('straight to 95 % warns only that once', () => {
    expect(spaceWarning(0.96, 0)).toEqual({ warned: 0.95, warn: true });
    expect(spaceWarning(0.85, 0.95)).toEqual({ warned: 0.95, warn: false });
  });

  it('full, it says nothing more (the settings and the cloud show it)', () => {
    expect(spaceWarning(1, 0.8)).toEqual({ warned: 0.8, warn: false });
  });

  it('warns again only after going well below 80 %', () => {
    expect(spaceWarning(0.75, 0.8)).toEqual({ warned: 0.8, warn: false });
    expect(spaceWarning(0.65, 0.8)).toEqual({ warned: 0, warn: false });
    expect(spaceWarning(0.81, 0)).toEqual({ warned: 0.8, warn: true });
  });
});
