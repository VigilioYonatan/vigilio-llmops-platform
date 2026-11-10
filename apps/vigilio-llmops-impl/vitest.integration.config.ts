import {defineConfig} from 'vitest/config';
export default defineConfig({test:{setupFiles:['test/setup.ts'],include:['test/integration/**/*.test.ts','test/e2e/**/*.spec.ts','test/security/**/*.spec.ts'],testTimeout:30000,hookTimeout:45000,fileParallelism:false,maxWorkers:1}});
