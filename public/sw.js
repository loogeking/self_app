/* 只用于 PWA 可安装；不做离线缓存，避免部署后缓存旧版本。 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* passthrough */
});