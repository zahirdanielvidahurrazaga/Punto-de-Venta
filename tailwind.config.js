/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          300: '#cbd5e1',
          500: '#64748b',
          600: '#1e293b', // Gris oscuro elegante
          700: '#0f172a', // Casi negro
          900: '#020617', // Negro total
        },
        dark: {
          900: '#000000',
          800: '#111111',
          700: '#222222',
        }
      }
    },
  },
  plugins: [],
}
