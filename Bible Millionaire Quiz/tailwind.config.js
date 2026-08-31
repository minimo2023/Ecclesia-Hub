import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(projectRoot, 'index.html'),
    path.join(projectRoot, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['CuYuan', 'Microsoft JhengHei', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

