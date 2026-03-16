// Smart Save - Background Service Worker

let pendingDownload = null;
let pendingSuggest = null;

// 拦截下载
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  pendingDownload = {
    id: downloadItem.id,
    url: downloadItem.url,
    filename: downloadItem.filename,
    mime: downloadItem.mime,
    referrer: downloadItem.referrer
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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
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
