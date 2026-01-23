/** @type {import('tailwindcss').Config} */
module.exports = {
  // Content paths for Angular templates (includes inline templates in .ts files)
  content: [
    "./src/**/*.{html,ts}",
  ],

  // CRITICAL: Disable Preflight to preserve Angular Material form fields
  // Preflight resets form elements which breaks Material's MDC-based styling
  corePlugins: {
    preflight: false,
  },

  theme: {
    // Mobile-first breakpoints matching Nubian design system
    screens: {
      'xs': '320px',
      'sm': '576px',
      'md': '768px',   // Primary mobile/desktop breakpoint
      'lg': '992px',
      'xl': '1200px',
      '2xl': '1400px',
      '3xl': '1920px',
    },

    extend: {
      // =============================================
      // NUBIAN COLOR PALETTE
      // =============================================
      colors: {
        'nubian': {
          // Primary - Nubian Teal
          'teal': {
            50: '#E6F5F5',
            100: '#B3E0DF',
            200: '#80CBCA',
            300: '#4DB6B4',
            400: '#2B9A97',
            DEFAULT: '#187573',
            600: '#136160',
            700: '#0D5654',
            800: '#094544',
            900: '#063433',
          },
          // Secondary - Nubian Gold
          'gold': {
            50: '#FFF8F0',
            100: '#FFEDD5',
            200: '#FED9AA',
            300: '#FDC07D',
            400: '#D4A574',
            DEFAULT: '#C17E3E',
            600: '#A66A2E',
            700: '#8B5A2B',
            800: '#704820',
            900: '#5A3A1A',
          },
          // Accent - Nubian Orange
          'orange': {
            50: '#FFF3EF',
            100: '#FFE0D6',
            200: '#FFCABC',
            300: '#FFB09D',
            400: '#FF7A52',
            DEFAULT: '#E85D35',
            600: '#C94621',
            700: '#A53618',
            800: '#822910',
            900: '#601E0A',
          },
          // Success - Nubian Green
          'green': {
            50: '#EDF7EF',
            100: '#C9E9CF',
            200: '#A5DBAF',
            300: '#7ECB8E',
            400: '#3FA055',
            DEFAULT: '#2D7A3E',
            600: '#236630',
            700: '#1F5A2B',
            800: '#1A4A23',
            900: '#143A1B',
          },
          // Neutral colors
          'cream': '#FFF9F5',
          'beige': '#F4E4D7',
          'sand': '#CEC5B0',
          'brown': '#8B6F47',
          'charcoal': '#2D2D2D',
          'gray': '#6B6B6B',
          'gray-light': '#9CA3AF',
        },
        // Semantic aliases using CSS custom properties
        'ft': {
          'primary': 'var(--ft-primary)',
          'primary-light': 'var(--ft-primary-light)',
          'primary-dark': 'var(--ft-primary-dark)',
          'accent': 'var(--ft-accent)',
          'accent-light': 'var(--ft-accent-light)',
          'accent-dark': 'var(--ft-accent-dark)',
          'success': 'var(--ft-success)',
          'warning': 'var(--ft-warning)',
          'error': 'var(--ft-error)',
          'info': 'var(--ft-info)',
          'background': 'var(--ft-background)',
          'surface': 'var(--ft-surface)',
          'surface-variant': 'var(--ft-surface-variant)',
          'border': 'var(--ft-border)',
          'divider': 'var(--ft-divider)',
          'on-surface': 'var(--ft-on-surface)',
          'on-surface-variant': 'var(--ft-on-surface-variant)',
          // Gender colors
          'male': 'var(--ft-male)',
          'male-light': 'var(--ft-male-light)',
          'female': 'var(--ft-female)',
          'female-light': 'var(--ft-female-light)',
        },
      },

      // =============================================
      // PWA SAFE-AREA SPACING
      // =============================================
      spacing: {
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-l': 'env(safe-area-inset-left, 0px)',
        'safe-r': 'env(safe-area-inset-right, 0px)',
        'header': '64px',
        'header-mobile': '56px',
        'bottom-nav': '56px',
        'touch': '48px',
        'sidebar': '280px',
        'sidebar-collapsed': '64px',
      },

      // =============================================
      // NUBIAN BORDER RADIUS
      // =============================================
      borderRadius: {
        'nubian-xs': '4px',
        'nubian-sm': '6px',
        'nubian': '8px',
        'nubian-lg': '12px',
        'nubian-xl': '16px',
        'nubian-2xl': '24px',
        'nubian-3xl': '32px',
      },

      // =============================================
      // NUBIAN SHADOWS
      // =============================================
      boxShadow: {
        'nubian-xs': '0 1px 2px rgba(45, 45, 45, 0.04)',
        'nubian-sm': '0 2px 4px rgba(45, 45, 45, 0.06)',
        'nubian': '0 4px 8px rgba(45, 45, 45, 0.08)',
        'nubian-lg': '0 8px 16px rgba(45, 45, 45, 0.10)',
        'nubian-xl': '0 12px 24px rgba(45, 45, 45, 0.12)',
        'nubian-2xl': '0 20px 40px rgba(45, 45, 45, 0.15)',
        // Colored shadows
        'nubian-gold': '0 4px 20px rgba(193, 126, 62, 0.25)',
        'nubian-teal': '0 4px 20px rgba(24, 117, 115, 0.25)',
        'nubian-orange': '0 4px 20px rgba(232, 93, 53, 0.25)',
        // Inset shadows
        'nubian-inset-sm': 'inset 0 1px 2px rgba(45, 45, 45, 0.06)',
        'nubian-inset': 'inset 0 2px 4px rgba(45, 45, 45, 0.08)',
      },

      // =============================================
      // FONT FAMILIES
      // =============================================
      fontFamily: {
        'primary': ['Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        'display': ['Cinzel', 'Playfair Display', 'Times New Roman', 'serif'],
        'serif': ['Cormorant Garamond', 'Georgia', 'serif'],
        'arabic': ['Amiri', 'Cairo', 'Noto Sans Arabic', 'serif'],
        'nubian': ['SophiaNubian', 'system-ui', 'sans-serif'],
      },

      // =============================================
      // Z-INDEX LAYERS
      // =============================================
      zIndex: {
        'base': '1',
        'dropdown': '1000',
        'sticky': '1020',
        'fixed': '1030',
        'modal-backdrop': '1040',
        'modal': '1050',
        'popover': '1060',
        'tooltip': '1070',
        'header': '1080',
      },

      // =============================================
      // TRANSITIONS
      // =============================================
      transitionDuration: {
        'fast': '150ms',
        'normal': '250ms',
        'slow': '350ms',
        'slower': '500ms',
      },

      // =============================================
      // TOUCH-FRIENDLY SIZING
      // =============================================
      minHeight: {
        'touch': '48px',
        'input': '48px',
        'button-sm': '32px',
        'button': '40px',
        'button-lg': '48px',
      },
      minWidth: {
        'touch': '48px',
        'button-sm': '32px',
        'button': '40px',
        'button-lg': '48px',
      },

      // =============================================
      // PWA-SPECIFIC HEIGHTS
      // =============================================
      height: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        'dvh': '100dvh',
      },

      // =============================================
      // MAX WIDTH FOR CONTAINERS
      // =============================================
      maxWidth: {
        'container': '1400px',
        'content': '1200px',
        'form': '600px',
        'card': '400px',
      },
    },
  },

  plugins: [],
}
