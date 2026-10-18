(function () {
  'use strict';

  const app = document.querySelector('#adminApp');
  const toast = document.querySelector('#adminToast');
  const api = window.XW_SUPABASE;
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const maxSourceImageBytes = 25 * 1024 * 1024;
  const maxUploadImageBytes = 8 * 1024 * 1024;
  const targetImageBytes = 2.5 * 1024 * 1024;
  const maxImageDimension = 1800;
  const loginGuardKey = 'xw-admin-login-guard-v1';
  const state = {
    session: null,
    user: null,
    preview: false,
    products: [],
    editingId: null,
    mainFile: null,
    galleryFiles: [],
    retainedGalleryPaths: [],
    removedPaths: [],
    mainImagePath: ''
  };

  const demoProducts = [
    { id: 'preview-1', model: 'iPhone 13 Pro', memory: '256GB', price: 2699, condition: '95新', color: '远峰蓝', configuration: '6GB 内存 · 256GB 存储', description: '本地后台界面预览商品，可测试编辑、状态与排序操作。', status: 'on_sale', display_order: 1, main_image_path: '../assets/stock-demo-blue-front.svg', gallery_image_paths: ['../assets/stock-demo-blue-front.svg', '../assets/stock-demo-blue-back.svg'] },
    { id: 'preview-2', model: '小米 13', memory: '12GB + 256GB', price: 2099, condition: '9成新', color: '黑色', configuration: '12GB 内存 · 256GB 存储', description: '本地预览数据不会上传，也不会修改正式网站。', status: 'sold', display_order: 2, main_image_path: '../assets/stock-demo-black-front.svg', gallery_image_paths: ['../assets/stock-demo-black-front.svg', '../assets/stock-demo-black-back.svg'] }
  ];

  function esc(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function statusText(status) {
    return ({ on_sale: '在售', sold: '已售出', hidden: '隐藏' })[status] || status;
  }

  function showToast(message, error = false) {
    toast.textContent = message;
    toast.classList.toggle('error', error);
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function readLoginGuard() {
    try { return JSON.parse(sessionStorage.getItem(loginGuardKey) || '{"failures":[],"blockedUntil":0}'); }
    catch { return { failures: [], blockedUntil: 0 }; }
  }

  function loginGuardWaitSeconds() {
    const guard = readLoginGuard();
    return Math.max(0, Math.ceil((Number(guard.blockedUntil || 0) - Date.now()) / 1000));
  }

  function recordLoginFailure() {
    const now = Date.now();
    const guard = readLoginGuard();
    const failures = (guard.failures || []).filter(time => now - time < 10 * 60 * 1000);
    failures.push(now);
    const blockedUntil = failures.length >= 5 ? now + 2 * 60 * 1000 : 0;
    sessionStorage.setItem(loginGuardKey, JSON.stringify({ failures, blockedUntil }));
    return Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  }

  function clearLoginFailures() {
    sessionStorage.removeItem(loginGuardKey);
  }

  function imageUrl(path) {
    if (!path) return '';
    if (/^(?:https?:|blob:|data:|\.\.\/|\.\/)/i.test(path)) return path;
    return api.publicImageUrl(path);
  }

  function sortProducts(products) {
    const rank = { on_sale: 0, sold: 1, hidden: 2 };
    return [...products].sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || Number(a.display_order) - Number(b.display_order) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }

  function renderLogin(message = '') {
    const configured = api?.isConfigured();
    app.innerHTML = `<div class="login-shell"><section class="panel login-card">
      <div class="login-mark" aria-hidden="true">王</div>
      <h1>现货管理后台</h1>
      <p>管理员登录后可维护现货商品、图片、状态和展示顺序。</p>
      ${configured ? `<form id="loginForm" class="form-stack">
        <div class="field"><label for="adminEmail">管理员邮箱</label><input id="adminEmail" name="email" type="email" autocomplete="username" inputmode="email" required></div>
        <div class="field"><label for="adminPassword">管理员密码</label><input id="adminPassword" name="password" type="password" autocomplete="current-password" required></div>
        <p class="form-error" id="loginError" role="alert">${esc(message)}</p>
        <button class="primary wide" type="submit">安全登录</button>
      </form>` : `<div class="setup-notice"><strong>尚未连接 Supabase</strong><br>后台代码已在本地就绪。配置 Project URL 与 anon / publishable key 后，登录和云端保存才会启用。</div>
        ${isLocal ? '<button class="secondary wide preview-admin-button" id="previewAdmin" type="button">仅本地预览后台界面</button>' : ''}`}
    </section></div>`;

    document.querySelector('#loginForm')?.addEventListener('submit', handleLogin);
    document.querySelector('#previewAdmin')?.addEventListener('click', () => {
      state.preview = true;
      state.products = structuredClone(demoProducts);
      renderDashboard();
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const errorNode = document.querySelector('#loginError');
    const form = new FormData(event.currentTarget);
    const waitSeconds = loginGuardWaitSeconds();
    if (waitSeconds > 0) {
      errorNode.textContent = `登录失败次数较多，请 ${waitSeconds} 秒后再试。`;
      return;
    }
    button.disabled = true;
    button.textContent = '正在登录…';
    errorNode.textContent = '';
    try {
      const session = await api.signIn(String(form.get('email') || '').trim(), String(form.get('password') || ''));
      const user = await api.getUser(session);
      const adminRows = await api.select('admin_users', { select: 'user_id', user_id: `eq.${user.id}`, limit: '1' }, session);
      if (!adminRows.length) {
        await api.signOut();
        throw new Error('此账号没有现货管理权限。');
      }
      state.session = session;
      state.user = user;
      clearLoginFailures();
      await loadProducts();
      renderDashboard();
    } catch (error) {
      const blockedSeconds = recordLoginFailure();
      errorNode.textContent = blockedSeconds
        ? `登录失败次数较多，请 ${blockedSeconds} 秒后再试。`
        : (error.message || '登录失败，请检查账号与密码。');
      button.disabled = false;
      button.textContent = '安全登录';
    }
  }

  async function loadProducts() {
    state.products = await api.select('stock_products', { select: '*', order: 'display_order.asc,created_at.asc' }, state.session);
  }

  function productCard(product, sorted) {
    const sameStatus = sorted.filter(item => item.status === product.status);
    const groupIndex = sameStatus.findIndex(item => item.id === product.id);
    const image = imageUrl(product.main_image_path);
    return `<article class="product-card" data-product-id="${esc(product.id)}">
      <div class="product-thumb">${image ? `<img src="${esc(image)}" alt="${esc(product.model)}主图">` : '<span class="product-thumb-empty">尚未上传主图</span>'}</div>
      <div class="product-body">
        <div class="product-title-row"><h3>${esc(product.model)} ${esc(product.memory)}</h3><span class="status-pill ${esc(product.status)}">${statusText(product.status)}</span></div>
        <div class="product-price">¥${Number(product.price || 0)}</div>
        <p class="product-meta">${esc(product.condition)} · ${esc(product.color || '未填颜色')} · 排序 ${Number(product.display_order || 0)}</p>
        <div class="product-actions">
          <button type="button" data-action="edit">编辑</button>
          <button type="button" data-action="sale">${product.status === 'on_sale' ? '已售出' : '恢复在售'}</button>
          <button type="button" data-action="hide">${product.status === 'hidden' ? '取消隐藏' : '隐藏'}</button>
          <button type="button" data-action="up" ${groupIndex <= 0 ? 'disabled' : ''}>上移</button>
          <button type="button" data-action="down" ${groupIndex < 0 || groupIndex >= sameStatus.length - 1 ? 'disabled' : ''}>下移</button>
          <button type="button" data-action="delete">删除</button>
        </div>
      </div>
    </article>`;
  }

  function renderDashboard() {
    const sorted = sortProducts(state.products);
    app.innerHTML = `<header class="admin-header">
      <div><h1>现货管理后台</h1><p>${state.preview ? '本地界面预览 · 数据不会上传' : esc(state.user?.email || '管理员已登录')}</p></div>
      <div class="header-actions"><a class="secondary" href="../#home">查看前台</a><button class="secondary" id="logoutButton" type="button">退出</button></div>
    </header>
    ${state.preview ? '<div class="preview-notice"><strong>本地预览模式：</strong>您可以测试新增、编辑、状态、删除和排序；刷新后会恢复演示数据。连接 Supabase 后才会长期保存。</div>' : ''}
    <section class="panel">
      <div class="toolbar"><div><h2>现货商品</h2><span>共 ${sorted.length} 台</span></div><button class="primary" id="addProduct" type="button">＋ 新增商品</button></div>
      <div class="product-list">${sorted.length ? sorted.map(product => productCard(product, sorted)).join('') : '<div class="empty-state"><strong>暂时没有商品</strong><span>点击“新增商品”录入第一台现货手机。</span></div>'}</div>
    </section>
    <section class="editor" id="productEditor" aria-label="商品编辑页面" hidden></section>`;

    document.querySelector('#addProduct')?.addEventListener('click', () => openEditor(null));
    document.querySelector('#logoutButton')?.addEventListener('click', async () => {
      if (!state.preview) await api.signOut();
      state.session = null; state.user = null; state.preview = false; state.products = [];
      renderLogin();
    });
    document.querySelector('.product-list')?.addEventListener('click', handleProductAction);
  }

  async function handleProductAction(event) {
    const button = event.target.closest('[data-action]');
    const card = event.target.closest('[data-product-id]');
    if (!button || !card || button.disabled) return;
    const product = state.products.find(item => item.id === card.dataset.productId);
    if (!product) return;
    const action = button.dataset.action;
    if (action === 'edit') return openEditor(product);
    if (action === 'delete') return deleteProduct(product);
    if (action === 'up' || action === 'down') return moveProduct(product, action === 'up' ? -1 : 1);
    if (action === 'sale') return setStatus(product, product.status === 'on_sale' ? 'sold' : 'on_sale');
    if (action === 'hide') return setStatus(product, product.status === 'hidden' ? 'on_sale' : 'hidden');
  }

  async function setStatus(product, status) {
    try {
      if (state.preview) product.status = status;
      else await api.update('stock_products', product.id, { status }, state.session);
      if (!state.preview) await loadProducts();
      renderDashboard();
      showToast(`已切换为“${statusText(status)}”`);
    } catch (error) { showToast(error.message || '状态修改失败。', true); }
  }

  async function moveProduct(product, direction) {
    const group = sortProducts(state.products).filter(item => item.status === product.status);
    const index = group.findIndex(item => item.id === product.id);
    const target = group[index + direction];
    if (!target) return;
    const currentOrder = Number(product.display_order || index + 1);
    const targetOrder = Number(target.display_order || index + direction + 1);
    try {
      if (state.preview) {
        product.display_order = targetOrder;
        target.display_order = currentOrder;
      } else {
        await api.update('stock_products', product.id, { display_order: targetOrder }, state.session);
        await api.update('stock_products', target.id, { display_order: currentOrder }, state.session);
        await loadProducts();
      }
      renderDashboard();
      showToast(direction < 0 ? '商品已上移' : '商品已下移');
    } catch (error) { showToast(error.message || '排序修改失败。', true); }
  }

  async function deleteProduct(product) {
    if (!confirm(`确定删除“${product.model} ${product.memory}”吗？此操作不能撤销。`)) return;
    try {
      if (state.preview) state.products = state.products.filter(item => item.id !== product.id);
      else {
        await api.remove('stock_products', product.id, state.session);
        api.removeImages([product.main_image_path, ...(product.gallery_image_paths || [])], state.session)
          .catch(error => console.warn('商品已删除，但旧图片清理失败：', error));
        await loadProducts();
      }
      renderDashboard();
      showToast('商品已删除');
    } catch (error) { showToast(error.message || '删除失败。', true); }
  }

  function resetEditorState(product) {
    state.editingId = product?.id || null;
    state.mainFile = null;
    state.galleryFiles = [];
    state.mainImagePath = product?.main_image_path || '';
    state.retainedGalleryPaths = [...(product?.gallery_image_paths || [])];
    state.removedPaths = [];
  }

  function openEditor(product) {
    resetEditorState(product);
    const editor = document.querySelector('#productEditor');
    const nextOrder = Math.max(0, ...state.products.map(item => Number(item.display_order || 0))) + 1;
    editor.innerHTML = `<div class="editor-card">
      <div class="editor-head"><h2>${product ? '编辑商品' : '新增商品'}</h2><button class="secondary" id="closeEditor" type="button">关闭</button></div>
      <form id="productForm" class="form-stack">
        <div class="field-grid">
          <div class="field"><label for="productModel">手机型号 <span class="required">*</span></label><input id="productModel" name="model" type="text" maxlength="80" value="${esc(product?.model || '')}" required placeholder="例如：iPhone 13 Pro"></div>
          <div class="field"><label for="productMemory">内存容量 <span class="required">*</span></label><input id="productMemory" name="memory" type="text" maxlength="50" value="${esc(product?.memory || '')}" required placeholder="例如：256GB"></div>
          <div class="field"><label for="productPrice">价格（元） <span class="required">*</span></label><input id="productPrice" name="price" type="number" inputmode="decimal" min="0" step="1" value="${esc(product?.price ?? '')}" required placeholder="2699"></div>
          <div class="field"><label for="productCondition">成色 <span class="required">*</span></label><input id="productCondition" name="condition" type="text" maxlength="40" value="${esc(product?.condition || '')}" required placeholder="例如：95新"></div>
          <div class="field"><label for="productColor">颜色</label><input id="productColor" name="color" type="text" maxlength="40" value="${esc(product?.color || '')}" placeholder="例如：远峰蓝"></div>
          <div class="field"><label for="productStatus">商品状态 <span class="required">*</span></label><select id="productStatus" name="status"><option value="on_sale" ${product?.status === 'on_sale' || !product ? 'selected' : ''}>在售</option><option value="sold" ${product?.status === 'sold' ? 'selected' : ''}>已售出</option><option value="hidden" ${product?.status === 'hidden' ? 'selected' : ''}>隐藏</option></select></div>
        </div>
        <div class="field"><label for="productConfiguration">配置</label><input id="productConfiguration" name="configuration" type="text" maxlength="160" value="${esc(product?.configuration || '')}" placeholder="例如：6GB 内存 · 256GB 存储"></div>
        <div class="field"><label for="productDescription">具体机况 <span class="required">*</span></label><textarea id="productDescription" name="description" maxlength="2000" required placeholder="填写功能、外观、维修情况等真实信息">${esc(product?.description || '')}</textarea></div>
        <div class="field"><label for="productOrder">展示顺序</label><input id="productOrder" name="display_order" type="number" inputmode="numeric" min="0" step="1" value="${esc(product?.display_order ?? nextOrder)}"><small>数字越小越靠前；已售出商品仍会自动排在所有在售商品后面。</small></div>
        <section class="image-section"><h3>商品主图 <span class="required">*</span></h3><input class="file-input" id="mainImageInput" type="file" accept="image/jpeg,image/png,image/webp"><small>支持 JPG、PNG、WebP；选择后会在手机本地自动压缩，单张原图最大 25MB。</small><div class="image-previews" id="mainImagePreview"></div></section>
        <section class="image-section"><h3>实拍图片（最多9张）</h3><input class="file-input" id="galleryInput" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>可一次选择多张；系统会去重、压缩，并最多同时上传3张。</small><div class="image-previews" id="galleryPreview"></div></section>
        <div class="upload-progress" id="uploadProgress" role="status" aria-live="polite" hidden><div class="upload-progress-track"><span id="uploadProgressBar"></span></div><span id="uploadProgressText">准备图片…</span></div>
        <p class="form-error" id="productError" role="alert"></p>
        <div class="editor-actions"><button class="secondary" id="cancelEditor" type="button">取消</button><button class="primary" id="saveProduct" type="submit">保存商品</button></div>
      </form>
    </div>`;
    editor.hidden = false;
    document.body.style.overflow = 'hidden';
    renderImagePreviews();
    document.querySelector('#closeEditor').addEventListener('click', () => closeEditor());
    document.querySelector('#cancelEditor').addEventListener('click', () => closeEditor());
    document.querySelector('#mainImageInput').addEventListener('change', handleMainFile);
    document.querySelector('#galleryInput').addEventListener('change', handleGalleryFiles);
    document.querySelector('#mainImagePreview').addEventListener('click', handleRemovePreview);
    document.querySelector('#galleryPreview').addEventListener('click', handleRemovePreview);
    document.querySelector('#productForm').addEventListener('submit', saveProduct);
    requestAnimationFrame(() => document.querySelector('#productModel')?.focus({ preventScroll: true }));
  }

  function closeEditor(preserveObjectUrls = false) {
    document.querySelector('#productEditor').hidden = true;
    document.body.style.overflow = '';
    if (!preserveObjectUrls) {
      state.galleryFiles.forEach(item => URL.revokeObjectURL(item.url));
      if (state.mainFile?.url) URL.revokeObjectURL(state.mainFile.url);
    }
  }

  function validateImage(file) {
    if (!acceptedImageTypes.has(file.type)) return '只支持 JPG、PNG 或 WebP 图片。';
    if (file.size > maxSourceImageBytes) return `图片“${file.name}”超过 25MB。`;
    return '';
  }

  function handleMainFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const error = validateImage(file);
    if (error) { document.querySelector('#productError').textContent = error; event.target.value = ''; return; }
    if (state.mainFile?.url) URL.revokeObjectURL(state.mainFile.url);
    state.mainFile = { file, url: URL.createObjectURL(file) };
    document.querySelector('#productError').textContent = '';
    renderImagePreviews();
  }

  function handleGalleryFiles(event) {
    const known = new Set(state.galleryFiles.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    const files = [...(event.target.files || [])].filter(file => {
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (known.has(fingerprint)) return false;
      known.add(fingerprint);
      return true;
    });
    const total = state.retainedGalleryPaths.length + state.galleryFiles.length + files.length;
    if (total > 9) { document.querySelector('#productError').textContent = `实拍图片最多9张，当前选择后将达到${total}张。`; event.target.value = ''; return; }
    const invalid = files.map(validateImage).find(Boolean);
    if (invalid) { document.querySelector('#productError').textContent = invalid; event.target.value = ''; return; }
    state.galleryFiles.push(...files.map(file => ({ file, url: URL.createObjectURL(file), key: crypto.randomUUID() })));
    event.target.value = '';
    document.querySelector('#productError').textContent = '';
    renderImagePreviews();
  }

  function renderImagePreviews() {
    const mainUrl = state.mainFile?.url || imageUrl(state.mainImagePath);
    document.querySelector('#mainImagePreview').innerHTML = mainUrl ? `<div class="image-preview"><img src="${esc(mainUrl)}" alt="主图预览"><button type="button" data-remove-main aria-label="删除主图">×</button></div>` : '';
    const existing = state.retainedGalleryPaths.map((path, index) => `<div class="image-preview"><img src="${esc(imageUrl(path))}" alt="实拍图${index + 1}"><button type="button" data-remove-path="${esc(path)}" aria-label="删除这张图片">×</button></div>`);
    const added = state.galleryFiles.map((item, index) => `<div class="image-preview"><img src="${esc(item.url)}" alt="新实拍图${state.retainedGalleryPaths.length + index + 1}"><button type="button" data-remove-file="${esc(item.key)}" aria-label="删除这张图片">×</button></div>`);
    document.querySelector('#galleryPreview').innerHTML = [...existing, ...added].join('');
  }

  function handleRemovePreview(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-remove-main')) {
      if (state.mainFile?.url) URL.revokeObjectURL(state.mainFile.url);
      state.mainFile = null;
      if (state.mainImagePath) state.removedPaths.push(state.mainImagePath);
      state.mainImagePath = '';
    } else if (button.dataset.removePath) {
      const path = button.dataset.removePath;
      state.retainedGalleryPaths = state.retainedGalleryPaths.filter(item => item !== path);
      state.removedPaths.push(path);
    } else if (button.dataset.removeFile) {
      const removed = state.galleryFiles.find(item => item.key === button.dataset.removeFile);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      state.galleryFiles = state.galleryFiles.filter(item => item.key !== button.dataset.removeFile);
    }
    renderImagePreviews();
  }

  function extensionFor(file) {
    return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type] || 'jpg';
  }

  function setUploadProgress(percent, text) {
    const box = document.querySelector('#uploadProgress');
    const bar = document.querySelector('#uploadProgressBar');
    const label = document.querySelector('#uploadProgressText');
    if (!box || !bar || !label) return;
    box.hidden = false;
    bar.style.width = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
    label.textContent = text;
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) return createImageBitmap(file, { imageOrientation: 'from-image' });
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`无法读取图片“${file.name}”。`));
        image.src = url;
      });
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function prepareImage(file) {
    const source = await decodeImage(file);
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    const ratio = Math.min(1, maxImageDimension / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * ratio));
    canvas.height = Math.max(1, Math.round(sourceHeight * ratio));
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('当前浏览器无法压缩图片，请更换浏览器后重试。');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    source.close?.();

    let type = 'image/webp';
    let quality = 0.84;
    let blob = await canvasBlob(canvas, type, quality);
    if (!blob) {
      type = 'image/jpeg';
      blob = await canvasBlob(canvas, type, quality);
    }
    while (blob && blob.size > targetImageBytes && quality > 0.52) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, type, quality);
    }
    if (!blob || blob.size > maxUploadImageBytes) throw new Error(`图片“${file.name}”压缩后仍超过 8MB，请先裁剪后重试。`);
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'photo';
    return new File([blob], `${base}.${type === 'image/webp' ? 'webp' : 'jpg'}`, { type, lastModified: Date.now() });
  }

  async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    async function run() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
  }

  async function saveProduct(event) {
    event.preventDefault();
    const errorNode = document.querySelector('#productError');
    const saveButton = document.querySelector('#saveProduct');
    if (!state.mainFile && !state.mainImagePath) { errorNode.textContent = '请上传商品主图。'; return; }
    if (state.retainedGalleryPaths.length + state.galleryFiles.length > 9) { errorNode.textContent = '实拍图片最多9张。'; return; }
    const form = new FormData(event.currentTarget);
    const record = {
      model: String(form.get('model') || '').trim(),
      memory: String(form.get('memory') || '').trim(),
      price: Math.round(Number(form.get('price'))),
      condition: String(form.get('condition') || '').trim(),
      color: String(form.get('color') || '').trim(),
      configuration: String(form.get('configuration') || '').trim(),
      description: String(form.get('description') || '').trim(),
      status: String(form.get('status') || 'on_sale'),
      display_order: Math.max(0, Math.round(Number(form.get('display_order')) || 0))
    };
    if (!record.model || !record.memory || !Number.isFinite(record.price) || record.price < 0 || !record.condition || !record.description) {
      errorNode.textContent = '请完整填写所有必填信息。'; return;
    }

    saveButton.disabled = true;
    saveButton.textContent = '正在保存…';
    errorNode.textContent = '';
    try {
      if (state.preview) {
        const existing = state.products.find(item => item.id === state.editingId);
        const previewMain = state.mainFile?.url || state.mainImagePath;
        const previewGallery = [...state.retainedGalleryPaths, ...state.galleryFiles.map(item => item.url)];
        if (existing) Object.assign(existing, record, { main_image_path: previewMain, gallery_image_paths: previewGallery });
        else state.products.push({ id: `preview-${Date.now()}`, ...record, main_image_path: previewMain, gallery_image_paths: previewGallery, created_at: new Date().toISOString() });
      } else {
        const productId = state.editingId || crypto.randomUUID();
        const uploaded = [];
        const pathsToRemove = [...state.removedPaths];
        try {
          const selectedFiles = [state.mainFile?.file, ...state.galleryFiles.map(item => item.file)].filter(Boolean);
          setUploadProgress(2, selectedFiles.length ? '正在压缩图片…' : '正在保存商品信息…');
          const preparedFiles = await mapWithConcurrency(selectedFiles, 2, prepareImage);
          let preparedCursor = 0;
          const preparedMain = state.mainFile ? preparedFiles[preparedCursor++] : null;
          const preparedGallery = state.galleryFiles.map(() => preparedFiles[preparedCursor++]);
          let mainPath = state.mainImagePath;
          const uploadTasks = [];
          if (state.mainFile) {
            if (state.mainImagePath) pathsToRemove.push(state.mainImagePath);
            mainPath = `${productId}/main-${Date.now()}.${extensionFor(preparedMain)}`;
            uploadTasks.push({ path: mainPath, file: preparedMain, galleryIndex: -1 });
          }
          const newGalleryPaths = new Array(state.galleryFiles.length);
          for (let index = 0; index < state.galleryFiles.length; index += 1) {
            const file = preparedGallery[index];
            const path = `${productId}/gallery-${Date.now()}-${index + 1}.${extensionFor(file)}`;
            uploadTasks.push({ path, file, galleryIndex: index });
          }
          const taskProgress = new Array(uploadTasks.length).fill(0);
          await mapWithConcurrency(uploadTasks, 3, async (task, taskIndex) => {
            await api.uploadImage(task.path, task.file, state.session, {
              retries: 2,
              onProgress: (loaded, total) => {
                taskProgress[taskIndex] = total ? loaded / total : 0;
                const average = taskProgress.reduce((sum, value) => sum + value, 0) / Math.max(1, taskProgress.length);
                setUploadProgress(10 + average * 82, `正在上传图片 ${taskIndex + 1}/${uploadTasks.length}…`);
              }
            });
            uploaded.push(task.path);
            taskProgress[taskIndex] = 1;
            if (task.galleryIndex >= 0) newGalleryPaths[task.galleryIndex] = task.path;
          });
          setUploadProgress(94, '图片上传完成，正在保存商品信息…');
          const payload = { ...record, main_image_path: mainPath, gallery_image_paths: [...state.retainedGalleryPaths, ...newGalleryPaths] };
          if (state.editingId) await api.update('stock_products', productId, payload, state.session);
          else await api.insert('stock_products', { id: productId, ...payload }, state.session);
          api.removeImages([...new Set(pathsToRemove.filter(path => path && path !== mainPath && !payload.gallery_image_paths.includes(path)))], state.session)
            .catch(error => console.warn('旧图片清理失败，可稍后重试：', error));
        } catch (error) {
          await api.removeImages(uploaded, state.session).catch(() => {});
          throw error;
        }
        await loadProducts();
        setUploadProgress(100, '保存完成');
      }
      closeEditor(state.preview);
      renderDashboard();
      showToast('商品保存成功，前台刷新后会自动读取最新数据。');
    } catch (error) {
      errorNode.textContent = error.message || '保存失败，请稍后重试。';
      saveButton.disabled = false;
      saveButton.textContent = '保存商品';
    }
  }

  async function start() {
    if (!api?.isConfigured()) { renderLogin(); return; }
    const session = await api.getSession();
    if (!session) { renderLogin(); return; }
    try {
      const user = await api.getUser(session);
      const adminRows = await api.select('admin_users', { select: 'user_id', user_id: `eq.${user.id}`, limit: '1' }, session);
      if (!adminRows.length) throw new Error('此账号没有管理权限。');
      state.session = session;
      state.user = user;
      await loadProducts();
      renderDashboard();
    } catch (error) {
      await api.signOut();
      renderLogin(error.message || '登录已失效，请重新登录。');
    }
  }

  start().catch(error => renderLogin(error.message || '后台加载失败。'));
})();
