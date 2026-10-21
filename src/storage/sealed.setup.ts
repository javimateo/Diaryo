import { vi } from 'vitest';

/**
 * The "sealed" test project (vite.config.ts): the same tests of storage, the diary and the
 * sync, with every diary encrypted on the device.
 */
vi.mock('./db', async (importOriginal) => {
  const db = await importOriginal<typeof import('./db')>();
  const { newSealingKey } = await import('./sealing');
  class SealedDiaryoDB extends db.DiaryoDB {
    constructor(name?: string) {
      super(name);
      this.sealing.key = newSealingKey();
      this.sealing.seal = true;
    }
  }
  return { ...db, DiaryoDB: SealedDiaryoDB };
});
