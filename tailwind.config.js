/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // App theme colors - customize these to match your brand
        background: '#FFE51F', // Default screen background
        surface: '#ffffff', // Card/surface background
        primary: '#3b82f6', // Primary blue
        secondary: '#6b7280', // Secondary gray
        accent: '#8b5cf6', // Accent purple
        error: '#D8514B', // Error red
        text: {
          primary: '#111827', // Primary text color
          secondary: '#6b7280', // Secondary text color
          tertiary: '#9ca3af', // Tertiary text color
        },
        border: '#e5e7eb', // Border color
      },
      fontFamily: {
        sans: ['RobotoFlex', 'system-ui', 'sans-serif'],
        roboto: ['RobotoFlex'],
        'roboto-medium': ['RobotoFlex-Medium'],
        'roboto-bold': ['RobotoFlex-Bold'],
        'roboto-black': ['RobotoFlex-Black'],
        'roboto-extrablack': ['RobotoFlex-ExtraBlack'],
      },
    },
  },
  plugins: [],
};
