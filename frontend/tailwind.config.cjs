/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        aurora: {
          start: '#4FD1C5', // teal
          mid: '#7F56D9',  // violet
          end: '#6EE7B7', // cyan/green
        },
      },
    },
  },
  plugins: [],
};
