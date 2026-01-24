/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./src/views/**/*.pug"],
  separator: '_',
  theme: {
    extend: {
      colors: {
        'youtube': '#FF0000',
        'youtube-dark': '#cc0000',
        'surface': 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        'surface-hover': 'var(--color-surface-hover)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        'border-default': 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
      }
    }
  },
  plugins: [],
}
