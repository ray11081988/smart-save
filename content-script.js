// Smart Save - Content Script
// 注入到页面 MAIN world，hook URL.createObjectURL 缓存 blob 数据
// 解决网站调用 revokeObjectURL 后 blob 失效的问题

(function () {
  const CACHE_KEY = '__smartSaveBlobCache__';
  // blob url -> dataURL 缓存，最多保留 20 条，5 分钟过期
  window[CACHE_KEY] = window[CACHE_KEY] || {};

  const originalCreate = URL.createObjectURL.bind(URL);
  const originalRevoke = URL.revokeObjectURL.bind(URL);

  URL.createObjectURL = function (obj) {
    const blobUrl = originalCreate(obj);

    // 只缓存 Blob/File 对象
    if (obj instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => {
        const cache = window[CACHE_KEY];
        cache[blobUrl] = {
          data: reader.result,
          mime: obj.type,
          ts: Date.now()
        };

        // 清理过期（5 分钟）和超量缓存
        const keys = Object.keys(cache);
        const now = Date.now();
        for (const k of keys) {
          if (now - cache[k].ts > 5 * 60 * 1000) delete cache[k];
        }
        if (Object.keys(cache).length > 20) {
          const sorted = Object.entries(cache).sort((a, b) => a[1].ts - b[1].ts);
          delete cache[sorted[0][0]];
        }
      };
      reader.readAsDataURL(obj);
    }

    return blobUrl;
  };

  URL.revokeObjectURL = function (url) {
    // 正常 revoke，但缓存保留
    return originalRevoke(url);
  };
})();
