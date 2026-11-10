import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

export default defineConfig({
  testDir: defineBddConfig({
    features: 'tests/features/**/*.feature',
    steps: 'tests/steps/**/*.{js,mjs}',
    output: '.bdd-gen',
  }),
  reporter: [
    ['html', { outputFolder: 'testing', open: 'never' }],
    ['list'],
  ],
  projects: [
    { name: 'logic', grep: /@logic/ },
    { name: 'e2e', grep: /@e2e/ },
  ],
});
