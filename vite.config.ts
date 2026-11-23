import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The multiplayer server runs on :8787 in development; Vite proxies the WebSocket to it.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/three') || id.includes('@react-three') ? 'three' : undefined),
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
} as never)
