import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import replace from '@rollup/plugin-replace';
// If you use TS path aliases, install vite-tsconfig-paths and uncomment:
// import tsconfigPaths from 'vite-tsconfig-paths';

// Match CRA's environment variables.
// TODO: Replace these with VITE_ prefixed environment variables, and using import.meta.env.VITE_* instead of process.env.REACT_APP_*.
const craEnvVarRegex = /^REACT_APP/i;
const craEnvVars = Object.keys(process.env)
  .filter((key) => craEnvVarRegex.test(key))
  .reduce((env, key) => {
    env[`process.env.${key}`] = JSON.stringify(process.env[key]);
    return env;
  }, {});

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: './dist/color-lock-web'
  },
  server: {
    port: 3000,
    open: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: 'src/setupTests.ts',
    css: true,
  },
  plugins: [
    react(),
    replace({ values: craEnvVars, preventAssignment: true }),
    // tsconfigPaths(),
  ],
});
