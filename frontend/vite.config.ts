import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Em desenvolvimento local, repassa /api para o Laravel (php artisan serve)
    proxy: { '/api': process.env.VITE_PROXY ?? 'http://127.0.0.1:8000' },
  },
})
