(function () {
  'use strict';

  const rawConfig = window.XW_SUPABASE_CONFIG || {};
  const config = {
    url: String(rawConfig.url || '').trim().replace(/\/$/, ''),
    anonKey: String(rawConfig.anonKey || '').trim()
  };
  const sessionKey = 'xw-stock-admin-session-v1';

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
    const response = await fetch(`${config.url}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined
        ? undefined
        : (typeof options.body === 'string' || options.body instanceof Blob || options.body instanceof ArrayBuffer)
          ? options.body
          : JSON.stringify(options.body)
    });
    const text = await response.text();
    const result = parseResponseText(text);
    if (!response.ok) {
      const message = result?.msg || result?.message || result?.error_description || result?.error || `请求失败（${response.status}）`;
      throw new Error(message);
    }
    return { data: result, response };
  }

  function saveSession(session) {
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
  }

  function readStoredSession() {
    try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { return null; }
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

  async function select(table, params = {}, session = null) {
    const { data } = await request(`/rest/v1/${encodeURIComponent(table)}${queryString(params)}`, {
      token: session?.access_token,
      headers: { Accept: 'application/json' }
    });
    return data || [];
  }

  async function insert(table, value, session) {
    const { data } = await request(`/rest/v1/${encodeURIComponent(table)}`, {
      method: 'POST', token: session.access_token, body: value,
      headers: { Prefer: 'return=representation', Accept: 'application/json' }
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function update(table, id, value, session) {
    const { data } = await request(`/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', token: session.access_token, body: value,
      headers: { Prefer: 'return=representation', Accept: 'application/json' }
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function remove(table, id, session) {
    await request(`/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE', token: session.access_token,
      headers: { Prefer: 'return=minimal' }
    });
  }

  function encodeObjectPath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  async function uploadImage(path, file, session) {
    const { data } = await request(`/storage/v1/object/stock-images/${encodeObjectPath(path)}`, {
      method: 'POST', token: session.access_token, body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }
    });
    return data;
  }

  async function removeImages(paths, session) {
    const filtered = paths.filter(Boolean);
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
