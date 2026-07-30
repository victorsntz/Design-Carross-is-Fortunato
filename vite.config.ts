import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em produção no GitHub Pages o site fica em /<nome-do-repo>/,
// então o workflow de deploy define GH_PAGES_BASE. Localmente é "/".
export default defineConfig({
  base: process.env.GH_PAGES_BASE ?? '/',
  plugins: [react()],
})
