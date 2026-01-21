/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/views/**/*.pug"],
  separator: '_',
  theme: {
    extend: {
      colors: {
        'youtube': '#FF0000',
        'youtube-dark': '#cc0000',
      }
    }
  },
  plugins: [],
}
