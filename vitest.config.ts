import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/cardFines.ts',
        'src/lib/finesReport.ts',
        'src/lib/usersSync.ts',
        'src/lib/matchSheet.ts',
        'src/lib/registration.ts',
        'src/lib/scheduling/random.ts',
        'src/lib/scheduling/sharedPlayers.ts',
        'src/lib/scheduling/fairness.ts',
        'src/lib/scheduling/matchday.ts',
        'src/lib/scheduling/matchDiff.ts',
        'src/lib/scheduling/arrangeCalendar.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
