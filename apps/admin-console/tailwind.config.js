import { addIconSelectors } from '@iconify/tailwind'
import daisyui from 'daisyui'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [
    daisyui,
    addIconSelectors(['tabler']),
  ],
  daisyui: {
    themes: [
      'light',
      'dark',
      'corporate',
      'luxury',
      'pastel',
      {
        hai: {
          'primary': '#6366f1',
          'primary-content': '#ffffff',
          'secondary': '#8b5cf6',
          'secondary-content': '#ffffff',
          'accent': '#f59e0b',
          'accent-content': '#000000',
          'neutral': '#1f2937',
          'neutral-content': '#f3f4f6',
          'base-100': '#ffffff',
          'base-200': '#f9fafb',
          'base-300': '#f3f4f6',
          'base-content': '#1f2937',
          'info': '#3b82f6',
          'info-content': '#ffffff',
          'success': '#22c55e',
          'success-content': '#ffffff',
          'warning': '#f59e0b',
          'warning-content': '#000000',
          'error': '#ef4444',
          'error-content': '#ffffff',
        },
      },
    ],
    darkTheme: 'dark',
  },
}
