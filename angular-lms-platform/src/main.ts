import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { isDevMode } from '@angular/core';

// Enable production mode if not in development
if (!isDevMode()) {
  // Log application start in production
  console.log('EduPlatform LMS starting in production mode');
}

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // In production, you might want to send this to an error reporting service
});

// Service worker registration for PWA
if ('serviceWorker' in navigator && !isDevMode()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/ngsw-worker.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Initialize WebRTC adapter for cross-browser compatibility
import 'webrtc-adapter';

// Bootstrap the application
bootstrapApplication(AppComponent, appConfig)
  .catch(err => {
    console.error('Error starting app:', err);
    
    // Display user-friendly error message
    const errorContainer = document.createElement('div');
    errorContainer.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        text-align: center;
        max-width: 400px;
        z-index: 9999;
      ">
        <h2>Application Error</h2>
        <p>We're having trouble starting the application. Please refresh the page or try again later.</p>
        <button onclick="window.location.reload()" style="
          background: #673ab7;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
        ">Refresh Page</button>
      </div>
    `;
    document.body.appendChild(errorContainer);
  });