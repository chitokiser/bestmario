// BestMario 웹 푸시 수신. 새 주문 알림을 띄우고, 누르면 해당 화면으로 이동한다.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'BestMario', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'BestMario', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      // 소리·진동은 OS/브라우저 알림 채널 설정을 따르되, 우리 쪽에서 꺼 두지 않고 진동 패턴을 준다.
      // renotify 가 없으면 같은 tag 의 알림은 소리 없이 교체되고, requireInteraction 이 없으면 곧 사라진다.
      silent: false,
      vibrate: [200, 100, 200, 100, 400],
      renotify: true,
      requireInteraction: true,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
