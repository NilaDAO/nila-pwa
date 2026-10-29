/** @type {import('tailwindcss').Config} */

module.exports = {
  mode: 'jit',
  darkMode: 'class',
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/App/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/App.js",
  ],
  theme: {
    extend: {
      fontFamily: {
        regular: ['Inter-Regular','sans-serif'],
        bold: ['Inter-Bold','sans-serif'],
        Chains: ['Chains','sans-serif']
      },
      height: {
        "128": '32rem'
      },
      scale: {
        "180": '1.8',
        "200": '2',
        "300": '4'
      },
      screens: {
        "xs": "200px",
        "sm": "600px",
      },
      backfaceVisibility: [
        'hidden'
      ],
      fontSize: {
        'xxs': '0.5rem', //
        'xs': '0.85rem', //
        'sm': '1rem', // 
        'base': '1.2rem', //
        'lg': '1.55rem',
        'xl': '2rem',
        '2xl': '1.5rem', 
        'spinner-large': '9rem', 
        'spinner-small': '6rem', 
      },
      borderWidth: {
        '48': '48px',
      },
      safelist: [
        'h-[20%]',
        'h-[15%]',
      ],
      boxShadow: {
        'bottom-light': '0 6px 10px 0px rgba(0, 0, 0, 0.05), 0 5px 6px 2px rgba(0, 0, 0, 0.03)',
        'bottom': '0 12px 10px 0px rgba(0, 0, 0, 0.15), 0 5px 12px 2px rgba(0, 0, 0, 0.06)',
        'top': '0 -12px 10px 0px rgba(0, 0, 0, 0.15), 0 5px 12px 2px rgba(0, 0, 0, 0.06)',
      },
      keyframes: {
        borderFlash: {
          '0%, 100%': { borderColor: '#E69283', boxShadow: '0 0 0 1px #E69283' },
          '50%':      { borderColor: 'transparent', boxShadow: '0 0 0 1px transparent' },
        },
        iconPulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.35', transform: 'scale(1.25)' },
        },
      },
      animation: {
        spin: 'spin 1s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        'border-flash': 'borderFlash 1.1s ease-in-out infinite',
        'icon-pulse': 'iconPulse 1s ease-in-out infinite',
      },
      colors: {
        green: "#D4CF5A" ,
        green_dark: "#d4a634ff" ,
        green_light: "#DFDB83" ,        // donate card (light theme) — slightly lighter than green
        green_dark_light: "#DFBC67" ,   // donate card (dark theme) — slightly lighter than green_dark
        red: "#E69283",
        red_dark: "#6492b3ff",
        grey: "#979797",
        black: "#0A0A0A",
        darkgrey:"#121212"
      }
    },
  },
  plugins: [],
}

