// Smart Save - Popup 交互逻辑

const filenameEl = document.getElementById('filename');
const emptyState = document.getElementById('emptyState');
const mainPanel = document.getElementById('mainPanel');
const pathList = document.getElementById('pathList');
const noPaths = document.getElementById('noPaths');
const browseBtn = document.getElementById('browseBtn');
const confirmBtn = document.getElementById('confirmBtn');
const cancelBtn = document.getElementById('cancelBtn');

let savedPaths = [];
let selectedId = null;
let pendingDownload = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 申请持久化存储，防止浏览器自动清理 IndexedDB
  if (navigator.storage && navigator.storage.persist) {
    await navigator.storage.persist();
  }

  pendingDownload = await sendMessage({ action: 'getPendingDownload' });

  if (!pendingDownload) {
    emptyState.style.display = 'block';
    mainPanel.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  mainPanel.style.display = 'block';
  filenameEl.textContent = pendingDownload.filename;

  // 加载已保存的路径
  savedPaths = await loadSavedPaths();

  if (savedPaths.length > 0) {
    savedPaths.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    selectedId = savedPaths[0].id;
  }

  renderPathList();
});

// ========== IndexedDB 操作 ==========

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('SmartSaveDB', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // 删除旧版 store
      if (db.objectStoreNames.contains('paths')) {
        db.deleteObjectStore('paths');
      }
      db.createObjectStore('paths', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSavedPaths() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('paths', 'readonly');
    const store = tx.objectStore('paths');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function savePath(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('paths', 'readwrite');
    const store = tx.objectStore('paths');
    store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteSavedPath(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('paths', 'readwrite');
    const store = tx.objectStore('paths');
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ========== 渲染 ==========

function renderPathList() {
  pathList.innerHTML = '';

  if (savedPaths.length === 0) {
    noPaths.style.display = 'block';
    return;
  }

  noPaths.style.display = 'none';

  savedPaths.forEach((item) => {
    const div = document.createElement('div');
    const hasHandle = !!item.handle;
    div.className = 'path-item' + (selectedId === item.id ? ' selected' : '') + (!hasHandle ? ' no-handle' : '');

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'path';
    radio.checked = selectedId === item.id;

    const span = document.createElement('span');
    span.className = 'path-text';
    span.textContent = shortenPath(item.displayName);
    span.title = item.displayName;

    // handle 丢失时显示重新授权按钮
    if (!hasHandle) {
      const reAuthBtn = document.createElement('button');
      reAuthBtn.className = 'reauth-btn';
      reAuthBtn.textContent = '重新选择';
      reAuthBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
          item.handle = dirHandle;
          item.displayName = await getFullPath(dirHandle);
          await savePath(item);
          renderPathList();
        } catch (err) {
          // 用户取消
        }
      });
      div.appendChild(radio);
      div.appendChild(span);
      div.appendChild(reAuthBtn);
    } else {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteSavedPath(item.id);
        savedPaths = savedPaths.filter(p => p.id !== item.id);
        if (selectedId === item.id) {
          selectedId = savedPaths.length > 0 ? savedPaths[0].id : null;
        }
        renderPathList();
      });

      div.appendChild(radio);
      div.appendChild(span);
      div.appendChild(deleteBtn);
    }

    div.addEventListener('click', () => {
      selectedId = item.id;
      renderPathList();
    });

    pathList.appendChild(div);
  });
}

function shortenPath(fullPath) {
  const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 3) return fullPath;
  return '.../' + parts.slice(-3).join('/');
}

// 获取文件夹完整路径
async function getFullPath(dirHandle) {
  const pathParts = [];
  let currentHandle = dirHandle;

  // 向上遍历获取路径
  while (currentHandle) {
    pathParts.unshift(currentHandle.name);
    try {
      // 尝试获取父目录
      const parent = await currentHandle.getParent?.();
      if (!parent) break;
      currentHandle = parent;
    } catch {
      break;
    }
  }

  return pathParts.join('/') || dirHandle.name;
}

// ========== 选择文件夹 ==========

browseBtn.addEventListener('click', async () => {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

    // 生成唯一 ID
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // 获取完整路径
    const displayName = await getFullPath(dirHandle);

    const entry = {
      id,
      displayName,
      handle: dirHandle,
      lastUsed: Date.now()
    };

    savedPaths.unshift(entry);
    await savePath(entry);

    selectedId = id;
    renderPathList();
  } catch (e) {
    // 用户取消了选择
  }
});

// ========== 确认下载 ==========

confirmBtn.addEventListener('click', async () => {
  if (!pendingDownload) return;

  const selected = savedPaths.find(p => p.id === selectedId);
  if (!selected || !selected.handle) {
    if (selected && !selected.handle) {
      alert('该路径需要重新选择文件夹');
    } else {
      alert('请先选择一个保存路径');
    }
    return;
  }

  confirmBtn.disabled = true;
  confirmBtn.textContent = '下载中...';

  try {
    // 请求目录写入权限
    const perm = await selected.handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      alert('需要文件夹写入权限');
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确定';
      return;
    }

    // 通过 background fetch 文件内容
    const result = await sendMessage({
      action: 'downloadViaFetch',
      url: pendingDownload.url,
      filename: pendingDownload.filename
    });

    if (result.error) {
      alert('下载失败: ' + result.error);
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确定';
      return;
    }

    // 将 base64 data URL 转为 blob
    const resp = await fetch(result.data);
    const blob = await resp.blob();

    // 写入文件到选定目录
    const fileHandle = await selected.handle.getFileHandle(
      pendingDownload.filename,
      { create: true }
    );
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    // 更新最近使用时间
    selected.lastUsed = Date.now();
    await savePath(selected);

    // 通知 background 清理原下载
    await sendMessage({
      action: 'confirmDownload',
      filename: pendingDownload.filename,
      dirName: selected.displayName
    });

    window.close();
  } catch (e) {
    alert('保存失败: ' + e.message);
    confirmBtn.disabled = false;
    confirmBtn.textContent = '确定';
  }
});

// ========== 取消 ==========

cancelBtn.addEventListener('click', async () => {
  await sendMessage({ action: 'cancelDownload' });
  window.close();
});

// ========== 工具函数 ==========

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response);
    });
  });
}
