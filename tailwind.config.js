// Set up color and font themes for the meal planning app
// All the pages and components will use these styles for consistency

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: '#007BFF', // Blue for buttons and accents
        secondary: '#FF9500', // Orange for highlights (e.g., active meal tabs)
        background: '#FFFFFF', // White main background
        appBackground: '#EFF3F7',
        surface: '#FFFFFF',
        textPrimary: '#000000', // Black for titles
        textSecondary: '#6B7280', // Gray for subtitles
        textDeep: '#0B2149',
        border: '#D1D5DB', // Light gray for borders
        borderSoft: '#DAE2EC',
        error: '#EF4444', // Red for alerts (e.g., delete goal)
        success: '#10B981', // Green if needed for success states
        dinner: '#555555', // Dark gray for dinner section
        macroTrack: '#D1D5DB',
        primarySoft: '#E7F1FF',
        secondarySoft: '#FFF2E0',
        successSoft: '#DFF7EF',
        neutralSoft: '#EEF2F6',
      },
      fontFamily:{
        sans: ['System', 'sans-serif'], // Default sans-serif for clean look
        bold: ['System', 'sans-serif'], // Use bold weights via font-bold class
      }
    },
  },
  plugins: [],
}
