import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default {
  plugins: {
    tailwindcss: {
      config: path.join(projectRoot, 'tailwind.config.js'),
    },
    autoprefixer: {},
  },
}
