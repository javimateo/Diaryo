import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    projects: [
      { extends: true, test: { name: 'app' } },
      // Storage, the diary and the sync again, with the diary encrypted on the device.
      {
        extends: true,
        test: {
          name: 'sealed',
          include: ['src/storage/**/*.test.ts', 'src/diary/**/*.test.ts', 'src/cloud/sync.test.ts'],
          exclude: ['src/storage/sealing.test.ts'],
          setupFiles: ['src/storage/sealed.setup.ts'],
        },
      },
    ],
  },
});
