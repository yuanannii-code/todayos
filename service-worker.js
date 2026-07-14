/* ============================================================
   TodayOS — service-worker.js
   採用 Cache First 策略：
   - 安裝時預先快取核心檔案（App Shell）
   - 之後所有請求優先讀快取，快取沒有才發網路請求
   - 版本號更新時清除舊快取，確保使用者取得最新版本
============================================================ */

const CACHE_VERSION = "todayos-v0.1.1-beta";

// App Shell：首次安裝時預先快取的核心檔案
// 版本號更新時（CACHE_VERSION 改變），activate 階段會自動清除舊快取，
// 確保使用者下次連網時能取得最新版本，離線時則沿用舊版直到重新連網。
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

/* ------------------------------------------------------------
   install：預先快取 App Shell
------------------------------------------------------------ */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ------------------------------------------------------------
   activate：清除舊版本快取
------------------------------------------------------------ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ------------------------------------------------------------
   fetch：Cache First，快取沒有才 fallback 到網路
------------------------------------------------------------ */
self.addEventListener("fetch", (event) => {
  // 僅處理 GET 請求，避免快取到寫入類請求
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((networkResponse) => {
          // 將新取得的資源也存入快取，供下次離線使用
          const responseClone = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => {
          // 離線且無快取時，首頁請求 fallback 回 index.html
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
