// 収支トラッカー — IndexedDB の薄いラッパ
// 金額は誤差回避のため整数（円）で保持する。
'use strict';

const DB = (() => {
  const DB_NAME = 'shushi-tracker';
  const DB_VERSION = 1;
  const STORE = 'entries';
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
        }
      };
      req.onsuccess = () => {
        _db = req.result;
        resolve(_db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode) {
    return open().then((db) => db.transaction(STORE, mode).objectStore(STORE));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    async put(entry) {
      const store = await tx('readwrite');
      return reqToPromise(store.put(entry));
    },
    async delete(id) {
      const store = await tx('readwrite');
      return reqToPromise(store.delete(id));
    },
    async getAll() {
      const store = await tx('readonly');
      const all = await reqToPromise(store.getAll());
      // 日付降順（同日は作成時刻降順）
      all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
      return all;
    },
    async clear() {
      const store = await tx('readwrite');
      return reqToPromise(store.clear());
    },
  };
})();
