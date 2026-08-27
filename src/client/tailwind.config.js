/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        whatsapp: {
          light: '#25D366',
          dark: '#075E54',
          teal: '#128C7E',
          chatbg: '#EFEAE2'
        }
      }
    },
  },
  plugins: [],
}
