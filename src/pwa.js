// Register the service worker so the portal can be installed on supported phones.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(error => {
      console.warn('App installation support could not be initialized:', error);
    });
  });
}
