// Vercel Web Analytics Integration
// This file initializes Vercel Web Analytics for the POS system

import { inject } from './node_modules/@vercel/analytics/dist/index.mjs';

// Initialize analytics when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    inject();
  });
} else {
  // DOM already loaded
  inject();
}
