import { defineConfig } from 'vite'
import honox from 'honox/vite'

export default defineConfig({
  plugins: [honox()],
  server: {
    port: 3000
  },
  build: {
    emptyOutDir: false
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