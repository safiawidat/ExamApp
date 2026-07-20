import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveApiBaseUrl } from './src/api/apiBaseUrl.js'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '.', 'VITE_')

  resolveApiBaseUrl({
    configuredBaseUrl: environment.VITE_API_BASE_URL,
    isProduction: mode === 'production',
  })

  return {
    plugins: [react()],

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.js',
      maxWorkers: 2,
    },
  }
})
