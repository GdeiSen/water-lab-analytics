import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"IBM Plex Sans"', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      colors: {
        ink: '#142031',
        fog: '#f4f8ff',
        surge: '#0b7a75',
        ember: '#d95a3a',
        leaf: '#3f8c4d',
        warning: '#b68600'
      },
      boxShadow: {
        panel: '0 18px 45px -24px rgba(9, 25, 49, 0.45)'
      }
    }
  },
  plugins: []
};

export default config;
