self.addEventListener('push', (event) => {
  const payload = event.data && event.data.text ? (() => {
    try {
      return event.data.json();
    } catch {
      return null;
    }
  })() : null;

  const notification = payload || {
    title: 'MVS',
    body: 'You have a new notification.',
    data: { url: '/' },
  };

  const options = {
    body: notification.body || '',
    icon: '/favicon.jpeg',
    badge: '/favicon.jpeg',
    tag: 'mvs-notification',
    vibrate: [200, 100, 200],
    data: notification.data || { url: '/' },
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(notification.title || 'MVS', options));
});

self.addEventListener('notificationclick', (event) => {
  event.preventDefault();

  const url = event.notification?.data?.url || '/';
  const targetUrl = url.startsWith('http') ? url : new URL(url, self.location.origin).toString();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl || client.url === `${targetUrl}/`) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
