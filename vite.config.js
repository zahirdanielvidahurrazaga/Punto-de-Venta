import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Sello de la versión: fecha y hora del build en México. Cada caja la anuncia
// (src/lib/controlCajas.js) y Equipo enseña cuál trae cargada cada una, para
// saber desde fuera si ya recargaron.
const build = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date())

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_BUILD': JSON.stringify(build) },
})
