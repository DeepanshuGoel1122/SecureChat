self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const payloadText = event.data ? event.data.text() : '{}';
  console.log('[Service Worker] Push Received with data:', payloadText);
  
  let data = {};
  try {
    data = JSON.parse(payloadText);
  } catch (e) {
    console.error('Failed to parse push data', e);
  }

  const notificationPromise = self.registration.showNotification(data.title || 'New Message', {
    body: data.body || 'You have a new message on SecureChat.',
    data: {
      url: data.url || '/'
    }
  });

  event.waitUntil(notificationPromise);
});


self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
