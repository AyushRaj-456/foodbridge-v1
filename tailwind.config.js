/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0F9F5',
          100: '#D8F3DC',
          200: '#B7E4C7',
          300: '#95D5B2',
          400: '#74C69D',
          500: '#52B788',
          600: '#40916C',
          700: '#2D6A4F',
          800: '#1B4332',
          900: '#143628',
          950: '#0B2218',
        },
        surface: {
          DEFAULT: '#FAFAF7',
          card: '#FFFFFF',
          muted: '#F3F4F0',
          subtle: '#EEF0EB',
        },
        border: {
          DEFAULT: '#E2E5DF',
          strong: '#C2C8C1',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Kannada', 'Noto Sans Devanagari', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
