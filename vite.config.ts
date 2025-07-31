import { defineConfig } from 'vite'
import honox from 'honox/vite'

export default defineConfig({
  plugins: [honox()],
  server: {
    port: 3000
  },
  build: {
    emptyOutDir: false,
    target: 'node18',
    lib: {
      entry: 'src/index.ts',
      name: 'main',
      formats: ['cjs']
    },
    rollupOptions: {
      external: ['postgres', 'redis', 'jsonwebtoken', 'jose', 'bcrypt-ts', 'crypto-js'],
      output: {
        entryFileNames: 'index.js'
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
      '@/components': '/src/components',
      '@/lib': '/src/lib',
      '@/types': '/src/types'
    }
  }
})