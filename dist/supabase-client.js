(function () {
  'use strict';

  const rawConfig = window.XW_SUPABASE_CONFIG || {};
  const config = {
    url: String(rawConfig.url || '').trim().replace(/\/$/, ''),
    anonKey: String(rawConfig.anonKey || '').trim()
  };
  const sessionKey = 'xw-stock-admin-session-v1';
  const allowedTables = new Set(['admin_users', 'stock_products']);
  const requestTimeoutMs = 25000;
  const storagePathPattern = /^[0-9a-f-]{36}\/(?:main|gallery)-\d+(?:-\d+)?\.(?:jpe?g|png|webp)$/i;

  function isConfigured() {
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url) && config.anonKey.length > 20;
  }

  function parseResponseText(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  async function request(path, options = {}) {
    if (!isConfigured()) throw new Error('Supabase 尚未配置。');
    const headers = {
      apikey: config.anonKey,
      ...options.headers
    };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.body !== undefined && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || requestTimeoutMs);
    let response;
    try {
      response = await fetch(`${config.url}${path}`, {
        method: options.method || 'GET',
        headers,
        signal: controller.signal,
        body: options.body === undefined
          ? undefined
          : (typeof options.body === 'string' || options.body instanceof Blob || options.body instanceof ArrayBuffer)
            ? options.body
            : JSON.stringify(options.body)
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('网络请求超时，请检查网络后重试。');
      throw new Error('网络连接失败，请检查网络后重试。');
    } finally {
      clearTimeout(timeout);
    }
    const text = await response.text();
    const result = parseResponseText(text);
    if (!response.ok) {
      const message = result?.msg || result?.message || result?.error_description || result?.error || `请求失败（${response.status}）`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return { data: result, response };
  }

  function saveSession(session) {
    // 管理员令牌只保留在当前浏览器会话，关闭标签页/浏览器后自动失效。
    // 同时清理旧版本曾写入 localStorage 的会话，降低令牌长期暴露风险。
    localStorage.removeItem(sessionKey);
    if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
    else sessionStorage.removeItem(sessionKey);
  }

  function readStoredSession() {
    localStorage.removeItem(sessionKey);
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch { return null; }
  }

  async function signIn(email, password) {
    const { data } = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password }
    });
    saveSession(data);
    return data;
  }

  async function refreshSession(refreshToken) {
    const { data } = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: refreshToken }
    });
    saveSession(data);
    return data;
  }

  async function getSession() {
    let session = readStoredSession();
    if (!session?.access_token) return null;
    const expiresAt = Number(session.expires_at || 0) * 1000;
    if (expiresAt && expiresAt < Date.now() + 60000) {
      if (!session.refresh_token) { saveSession(null); return null; }
      try { session = await refreshSession(session.refresh_token); }
      catch { saveSession(null); return null; }
    }
    return session;
  }

  async function signOut() {
    const session = readStoredSession();
    if (session?.access_token && isConfigured()) {
      try { await request('/auth/v1/logout', { method: 'POST', token: session.access_token }); } catch { /* local logout still succeeds */ }
    }
    saveSession(null);
  }

  async function getUser(session) {
    const { data } = await request('/auth/v1/user', { token: session.access_token });
    return data;
  }

  function queryString(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, value);
    });
    const value = search.toString();
    return value ? `?${value}` : '';
  }

  function assertAllowedTable(table) {
    if (!allowedTables.has(table)) throw new Error('不允许访问此数据表。');
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function withRetry(task, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try { return await task(attempt); }
      catch (error) {
        lastError = error;
        if (attempt >= retries || (error.status && ![408, 429].includes(error.status) && error.status < 500)) throw error;
        await wait(700 * (2 ** attempt) + Math.round(Math.random() * 300));
      }
    }
    throw lastError;
  }

  async function select(table, params = {}, session = null) {
    assertAllowedTable(table);
    const { data } = await withRetry(() => request(`/rest/v1/${encodeURIComponent(table)}${queryString(params)}`, {
      token: session?.access_token,
      headers: { Accept: 'application/json' }
    }));
    return data || [];
  }

  async function insert(table, value, session) {
    assertAllowedTable(table);
    const { data } = await request(`/rest/v1/${encodeURIComponent(table)}`, {
      method: 'POST', token: session.access_token, body: value,
      headers: { Prefer: 'return=representation', Accept: 'application/json' }
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function update(table, id, value, session) {
    assertAllowedTable(table);
    const { data } = await request(`/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', token: session.access_token, body: value,
      headers: { Prefer: 'return=representation', Accept: 'application/json' }
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function remove(table, id, session) {
    assertAllowedTable(table);
    await request(`/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE', token: session.access_token,
      headers: { Prefer: 'return=minimal' }
    });
  }

  function encodeObjectPath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  function uploadOnce(path, file, session, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${config.url}/storage/v1/object/stock-images/${encodeObjectPath(path)}`);
      xhr.timeout = 90000;
      xhr.setRequestHeader('apikey', config.anonKey);
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.upload.onprogress = event => {
        if (event.lengthComputable && typeof onProgress === 'function') onProgress(event.loaded, event.total);
      };
      xhr.onload = () => {
        const result = parseResponseText(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) return resolve(result);
        const error = new Error(result?.message || result?.error || `图片上传失败（${xhr.status}）`);
        error.status = xhr.status;
        reject(error);
      };
      xhr.onerror = () => { const error = new Error('图片上传网络中断，请稍后重试。'); error.status = 0; reject(error); };
      xhr.ontimeout = () => { const error = new Error('图片上传超时，请检查网络后重试。'); error.status = 408; reject(error); };
      xhr.send(file);
    });
  }

  async function uploadImage(path, file, session, options = {}) {
    if (!storagePathPattern.test(String(path))) throw new Error('图片存储路径不合法。');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('只允许上传 JPG、PNG 或 WebP 图片。');
    if (file.size > 8 * 1024 * 1024) throw new Error('单张图片不能超过 8MB。');
    return withRetry(() => uploadOnce(path, file, session, options.onProgress), options.retries ?? 2);
  }

  async function removeImages(paths, session) {
    const filtered = [...new Set(paths.filter(path => storagePathPattern.test(String(path))))];
    if (!filtered.length) return;
    await request('/storage/v1/object/stock-images', {
      method: 'DELETE', token: session.access_token, body: { prefixes: filtered }
    });
  }

  function publicImageUrl(path) {
    if (!path || !isConfigured()) return '';
    return `${config.url}/storage/v1/object/public/stock-images/${encodeObjectPath(path)}`;
  }

  window.XW_SUPABASE = Object.freeze({
    config,
    isConfigured,
    signIn,
    signOut,
    getSession,
    getUser,
    select,
    insert,
    update,
    remove,
    uploadImage,
    removeImages,
    publicImageUrl
  });
})();
