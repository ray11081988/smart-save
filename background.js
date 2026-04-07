// Smart Save - Background Service Worker

let pendingDownload = null;
let pendingSuggest = null;

// 拦截下载
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // 获取发起下载的 tab ID
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    pendingDownload = {
      id: downloadItem.id,
      url: downloadItem.url,
      filename: downloadItem.filename,
      mime: downloadItem.mime,
      referrer: downloadItem.referrer,
      tabId: tabs[0]?.id
    };
    pendingSuggest = suggest;

    chrome.storage.session.set({ pendingDownload });

    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#333333' });

    try {
      chrome.action.openPopup();
    } catch (e) {
      chrome.notifications.create('smart-save-notify', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Smart Save',
        message: '检测到下载，请点击插件图标选择保存路径'
      });
    }
  });

  return true;
});

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getPendingDownload') {
    sendResponse(pendingDownload);
    return true;
  }

  if (message.action === 'confirmDownload') {
    handlePostSave(message.filename, message.dirName);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'cancelDownload') {
    cancelAndCleanup();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'downloadViaFetch') {
    handleFetchDownload(message.url, message.filename)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

// 确认保存后
function handlePostSave(filename, dirName) {
  const id = pendingDownload?.id;

  // 不调用 suggest()，直接取消原下载
  // 下载仍在"等待文件名确定"阶段，不会写入磁盘
  pendingSuggest = null;

  if (id != null) {
    chrome.downloads.cancel(id, () => {
      chrome.downloads.erase({ id });
    });
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Smart Save',
    message: `${filename} 已保存，请到「${dirName}」文件夹查看`
  });

  pendingDownload = null;
  chrome.action.setBadgeText({ text: '' });
  chrome.storage.session.remove('pendingDownload');
}

// 取消下载
function cancelAndCleanup() {
  pendingSuggest = null;
  const id = pendingDownload?.id;
  if (id != null) {
    chrome.downloads.cancel(id, () => {
      chrome.downloads.erase({ id });
    });
  }
  pendingDownload = null;
  chrome.action.setBadgeText({ text: '' });
  chrome.storage.session.remove('pendingDownload');
}

// fetch 文件内容
async function handleFetchDownload(url, filename) {
  // blob: URL 无法在 Service Worker 中 fetch，需要在原始页面上下文中读取
  if (url.startsWith('blob:')) {
    return handleBlobFetch(url, filename);
  }

  // 普通 HTTP URL：先尝试 Service Worker fetch，失败则回退到页面上下文
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return blobToDataURL(blob, filename);
  } catch (e) {
    // 回退：在页面上下文中 fetch（解决跨域/认证问题）
    return handlePageContextFetch(url, filename);
  }
}

// 在原始页面上下文中 fetch blob: URL
async function handleBlobFetch(blobUrl, filename) {
  const tabId = pendingDownload?.tabId;
  if (!tabId) {
    throw new Error('无法定位下载来源页面');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (url) => {
      // 优先从 hook 缓存中取数据（blob 可能已被 revoke）
      const cache = window.__smartSaveBlobCache__;
      if (cache && cache[url]) {
        const cached = cache[url];
        delete cache[url];
        return { data: cached.data, mime: cached.mime };
      }

      // 缓存未命中，尝试直接 fetch（blob 未被 revoke 时可用）
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ data: reader.result, mime: blob.type });
          reader.onerror = () => resolve({ error: '读取 Blob 数据失败' });
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        return { error: 'Blob 数据获取失败，URL 已失效且无缓存' };
      }
    },
    args: [blobUrl]
  });

  const result = results?.[0]?.result;
  if (!result || result.error) {
    throw new Error(result?.error || 'Blob 数据获取失败');
  }

  return { data: result.data, mime: result.mime, filename };
}

// 在页面上下文中 fetch 普通 URL（回退方案）
async function handlePageContextFetch(url, filename) {
  const tabId = pendingDownload?.tabId;
  if (!tabId) {
    throw new Error('下载失败，无法定位来源页面');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (url) => {
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) return { error: `HTTP ${response.status}` };
        const blob = await response.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ data: reader.result, mime: blob.type });
          reader.onerror = () => resolve({ error: '读取失败' });
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        return { error: e.message };
      }
    },
    args: [url]
  });

  const result = results?.[0]?.result;
  if (!result || result.error) {
    throw new Error(result?.error || '下载失败');
  }

  return { data: result.data, mime: result.mime, filename };
}

// Blob 转 DataURL
function blobToDataURL(blob, filename) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = () => resolve({
      data: reader.result,
      mime: blob.type,
      filename: filename
    });
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(blob);
  });
}
