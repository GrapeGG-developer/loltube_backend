// ЛОЛ ТУБ v3.8 - F9 animations, blur, no limits, test pixel fix
const LS_TOKEN = 'loltube_token_v3';
const LS_API = 'loltube_api_base';

function normalizeApiBase(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  // убрать кавычки и markdown [http...](http...) если случайно скопировал
  s = s.replace(/^\[|\]$/g,'').replace(/\(.*\)$/,'').trim();
  s = s.replace(/^['"]+|['"]+$/g,'').trim();
  s = s.replace(/\/$/, '');
  if (!s) return '';
  // 192.168.1.50 -> http://192.168.1.50:3000
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) {
    return `http://${s}:3000`;
  }
  // 192.168.1.50:3000 -> http://192.168.1.50:3000
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(s)) {
    return `http://${s}`;
  }
  // без http/https, но с точкой - добавить http://
  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    if (s.includes('.') || s.includes(':')) return `http://${s}`;
  }
  return s.replace(/\/$/, '');
}
function getApiBase() {
  const fromLS = localStorage.getItem(LS_API);
  if (fromLS) return normalizeApiBase(fromLS);
  if (window.LOLTUBE_API_BASE) return normalizeApiBase(window.LOLTUBE_API_BASE);
  return '';
}
function apiUrl(p) {
  const base = getApiBase();
  return base ? base + p : p;
}
function getToken() { return localStorage.getItem(LS_TOKEN); }
function setToken(t) { localStorage.setItem(LS_TOKEN, t); }
function clearToken() { localStorage.removeItem(LS_TOKEN); }

async function apiFetch(url, opts={}) {
  opts.headers = opts.headers || {};
  const token = getToken();
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) opts.headers['Content-Type'] = 'application/json';
  const res = await fetch(apiUrl(url), opts);
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

let currentUser = null;
let selectedVideoFile = null;
let selectedThumbFile = null;
let frameCanvas = null;

const app = {
  async checkBackendStatus() {
    const dot = document.getElementById('backendDot');
    const text = document.getElementById('backendStatusText');
    const box = document.getElementById('backendStatus');
    if (!dot || !text || !box) return;
    const set = (state, msg) => {
      dot.className = 'status-dot ' + state;
      box.className = 'backend-status ' + state;
      text.textContent = msg;
    };
    set('checking', 'ПРОВЕРКА БЕКЕНДА...');
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(apiUrl('/api/config'), { signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('offline');
      const data = await res.json();
      set('online', `БЕКЕНД: ОНЛАЙН • ${getApiBase() || 'localhost'} • v${data.version||'1'}`);
    } catch (e) {
      const base = getApiBase();
      set('offline', base ? `БЕКЕНД: ОФФЛАЙН • ${base} • НЕ ЗАПУЩЕН` : 'БЕКЕНД: ОФФЛАЙН • НЕ НАСТРОЕН');
    }
  },

  async init() {
    this.checkBackendStatus();
    setInterval(() => this.checkBackendStatus(), 10000);
    await this.checkAuth();
    window.addEventListener('hashchange', () => this.router());
    this.router();

    document.getElementById('loginNick').addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g,'').slice(0,20);
    });
    document.getElementById('loginPin').addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g,'').slice(0,3);
    });
    document.getElementById('loginPin').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.doLogin();
    });
    document.getElementById('loginNick').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('loginPin').focus();
    });

    const testPixel = document.getElementById('testPixel');
    if (testPixel) {
      testPixel.addEventListener('click', async (e) => {
        e.stopPropagation();
        const code = prompt('Кодовый символ:');
        if (code === null) return;
        if (code.trim() !== '1') {
          const errEl = document.getElementById('loginError');
          if (errEl) { errEl.textContent = 'Неверный код'; errEl.style.display = 'block'; }
          return;
        }
        const errEl = document.getElementById('loginError');
        if (errEl) errEl.style.display='none';
        try {
          const data = await apiFetch('/api/test-login', { method:'POST', body: JSON.stringify({ code: '1' }) });
          setToken(data.token);
          currentUser = data.user;
          try { currentUser = await apiFetch('/api/me'); } catch {}
          this.hideLogin();
          this.navigate('home');
        } catch (err) {
          const errEl = document.getElementById('loginError');
          if (errEl) { errEl.textContent = err.message; errEl.style.display='block'; }
        }
      });
    }
  },

  async checkAuth() {
    const token = getToken();
    if (!token) { this.showLogin(); return; }
    try {
      currentUser = await apiFetch('/api/me');
      this.hideLogin();
      this.renderAccountBtn();
    } catch (e) {
      clearToken();
      currentUser = null;
      this.showLogin();
    }
  },

  showLogin() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'flex';
    this.renderAccountBtn();
  },
  hideLogin() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    this.renderAccountBtn();
  },

  renderAccountBtn() {
    const btn = document.getElementById('accountBtn');
    if (!btn) return;
    if (currentUser) {
      const av = currentUser.avatar ? `<div class="avatar"><img src="${apiUrl(currentUser.avatar)}"></div>` : `<div class="avatar" style="background:${currentUser.avatarColor}">${currentUser.nickname[0].toUpperCase()}</div>`;
      btn.innerHTML = `${av}<span>${currentUser.nickname}</span>`;
      btn.classList.add('has-user');
    } else {
      btn.textContent = 'ВОЙТИ';
      btn.classList.remove('has-user');
    }
  },

  async doLogin() {
    const nick = document.getElementById('loginNick').value.trim();
    const pin = document.getElementById('loginPin').value.trim();
    const errEl = document.getElementById('loginError');
    const submitBtn = document.getElementById('loginSubmit');
    if (!nick) { errEl.textContent='Введи ник'; errEl.style.display='block'; return; }
    if (!/^\d{3}$/.test(pin)) { errEl.textContent='Пин только 3 цифры'; errEl.style.display='block'; return; }
    errEl.style.display='none';
    submitBtn.textContent='...';
    submitBtn.disabled=true;
    try {
      const data = await apiFetch('/api/login', { method:'POST', body: JSON.stringify({ nickname:nick, password:pin }) });
      setToken(data.token);
      currentUser = data.user;
      try { currentUser = await apiFetch('/api/me'); } catch {}
      this.hideLogin();
      this.navigate('home');
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display='block';
    } finally {
      submitBtn.textContent='ВОЙТИ';
      submitBtn.disabled=false;
    }
  },

  logout() {
    if (!confirm('Выйти?')) return;
    clearToken();
    currentUser=null;
    this.showLogin();
    const nickEl = document.getElementById('loginNick');
    const pinEl = document.getElementById('loginPin');
    if (nickEl) nickEl.value='';
    if (pinEl) pinEl.value='';
  },

  navigate(page, params={}) {
    if (!currentUser) { this.showLogin(); return; }
    let hash = page;
    if (params.id) hash+=`/${params.id}`;
    if (params.nickname) hash+=`/${params.nickname}`;
    window.location.hash=hash;
    this.router();
  },

  openProfile() {
    if (!currentUser) { this.showLogin(); return; }
    this.navigate('profile');
  },

  async router() {
    const main = document.getElementById('app');
    if (!main) return;
    if (!currentUser) { this.showLogin(); return; }
    const hash = window.location.hash.slice(1) || 'home';
    const [page, id] = hash.split('/');
    main.innerHTML = `<div class="loading">ЛОЛ ТУБ...</div>`;
    try {
      if (page==='home') await this.renderHome();
      else if (page==='watch' && id) await this.renderWatch(id);
      else if (page==='profile') await this.renderProfile();
      else if (page==='upload') await this.renderUpload();
      else if (page==='user' && id) await this.renderUser(id);
      else await this.renderHome();
    } catch (e) {
      if (e.message === 'Нет токена' || e.message === 'Невалидный токен') {
        clearToken();
        currentUser=null;
        this.showLogin();
        return;
      }
      main.innerHTML = `<div class="empty"><h2>ОШИБКА</h2><p>${this.esc(e.message)}</p><button class="btn btn-primary" onclick="app.navigate('home')" style="margin-top:16px">НА ГЛАВНУЮ</button></div>`;
    }
  },

  async renderHome() {
    const main = document.getElementById('app');
    const videos = await apiFetch('/api/videos');
    if (!videos.length) {
      main.innerHTML = `<div class="empty"><h2>Пока пусто...</h2></div>`;
      return;
    }
    main.innerHTML = `<div class="video-grid">${videos.map((v,i) => this.videoCard(v,i)).join('')}</div>`;
  },

  videoCard(v) {
    const thumb = v.thumbnail ? apiUrl(`/uploads/${v.thumbnail}`) : null;
    return `
      <div class="video-card" onclick="app.navigate('watch', {id:'${v.id}'})">
        <div class="thumb">
          ${thumb ? `<img src="${thumb}" loading="lazy">` : `<div class="thumb-placeholder">ЛОЛ ТУБ</div>`}
          <div class="thumb-meta">${v.views||0} 👁</div>
        </div>
        <div class="video-info">
          <div class="video-title">${this.esc(v.title)}</div>
        </div>
      </div>
    `;
  },

  async renderProfile() {
    const main = document.getElementById('app');
    // Проверка тестового аккаунта
    if (currentUser && currentUser.nickname === 'test_account') {
      main.innerHTML = `
        <div class="profile-head">
          <div class="avatar large" style="background:#000">T</div>
          <div>
            <div class="profile-name">TEST_ACCOUNT</div>
            <div style="font-size:12px; color:#71717a; margin:6px 0;">Тестовый аккаунт - загрузка ограничена</div>
            <button class="btn" onclick="app.logout()">ВЫЙТИ</button>
          </div>
        </div>
        <div class="empty"><h2>Тестовый аккаунт</h2><p style="color:#71717a; margin-top:8px;">Не может загружать видео и аватарку</p></div>
      `;
      return;
    }

    const data = await apiFetch(`/api/users/${currentUser.nickname}/videos`);
    const user = data.user;
    const videos = data.videos;
    main.innerHTML = `
      <div class="profile-head">
        <div class="avatar large" style="${!user.avatar ? `background:${user.avatarColor}` : ''}" onclick="document.getElementById('avatarInput').click()">
          ${user.avatar ? `<img src="${apiUrl(user.avatar)}">` : user.nickname[0].toUpperCase()}
        </div>
        <div>
          <div class="profile-name">${this.esc(user.nickname)}</div>
          <div style="font-size:12px; color:#71717a; margin:6px 0 12px;">${videos.length} видео</div>
          <div style="display:flex; gap:8px;">
            <button class="btn" onclick="document.getElementById('avatarInput').click()">АВАТАРКА</button>
            <button class="btn" onclick="app.logout()">ВЫЙТИ</button>
          </div>
        </div>
      </div>
      ${videos.length ? `<div class="video-grid" style="padding-top:16px;">${videos.map((v,i)=>this.videoCard(v,i)).join('')}</div>` : `<div class="empty"><h2>Пока пусто...</h2></div>`}
    `;
    const avInput = document.getElementById('avatarInput');
    if (avInput) avInput.onchange = e => this.uploadAvatar(e.target.files[0]);
  },

  async renderUser(nickname) {
    const main = document.getElementById('app');
    const data = await apiFetch(`/api/users/${nickname}/videos`);
    main.innerHTML = `
      <div class="profile-head">
        <div class="avatar large" style="${!data.user.avatar ? `background:${data.user.avatarColor}` : ''}">
          ${data.user.avatar ? `<img src="${apiUrl(data.user.avatar)}">` : data.user.nickname[0].toUpperCase()}
        </div>
        <div>
          <div class="profile-name">${this.esc(data.user.nickname)}</div>
          <div style="font-size:12px; color:#71717a;">${data.videos.length} видео</div>
          <button class="btn" style="margin-top:10px" onclick="app.navigate('home')">← НАЗАД</button>
        </div>
      </div>
      ${data.videos.length ? `<div class="video-grid">${data.videos.map((v,i)=>this.videoCard(v,i)).join('')}</div>` : `<div class="empty"><h2>Пока пусто...</h2></div>`}
    `;
  },

  async renderUpload() {
    const main = document.getElementById('app');
    if (currentUser && currentUser.nickname === 'test_account') {
      main.innerHTML = `<div class="empty"><h2>Тестовый аккаунт</h2><p>Не может загружать видео</p><button class="btn btn-primary" style="margin-top:16px" onclick="app.navigate('home')">НА ГЛАВНУЮ</button></div>`;
      return;
    }

    selectedVideoFile = null;
    selectedThumbFile = null;

    main.innerHTML = `
      <div class="upload-page">
        <div class="upload-title">ЗАГРУЗКА</div>
        <div class="upload-box" id="uploadFormBox">
          <!-- Название вверх -->
          <div class="form-row" style="margin-top:0">
            <label>НАЗВАНИЕ</label>
            <input id="upTitle" type="text" placeholder="">
          </div>
          <!-- Описание -->
          <div class="form-row">
            <label>ОПИСАНИЕ</label>
            <textarea id="upDesc" placeholder=""></textarea>
          </div>

          <div id="dropZone" class="video-drop" style="margin-top:18px;">
            <div style="font-weight:800; font-size:14px;">ВЫБЕРИ ВИДЕО</div>
            <div id="videoFileName" style="margin-top:10px; font-weight:700; font-size:13px;"></div>
          </div>

          <div id="previewSection" class="preview-section" style="display:none">
            <div style="font-size:11px; font-weight:800; text-transform:uppercase; margin-bottom:8px;">ПРЕВЬЮ ИЗ КАДРА</div>
            <div class="preview-video-wrap">
              <video id="sourceVideo" muted playsinline></video>
            </div>
            <div class="frame-controls">
              <input id="frameSlider" class="frame-slider" type="range" min="0" max="100" value="0">
              <button class="btn" onclick="app.captureFrame()">ВЗЯТЬ КАДР</button>
              <button class="btn" onclick="app.captureRandomFrame()">РАНДОМ</button>
            </div>
            <div class="thumb-options">
              <div class="thumb-option" onclick="document.getElementById('customThumbInput').click()">СВОЕ ПРЕВЬЮ</div>
              <div class="thumb-option" onclick="app.useCurrentFrame()">ИСПОЛЬЗОВАТЬ КАДР</div>
            </div>
            <div id="thumbPreview" class="thumb-preview" style="display:none">
              <img id="thumbPreviewImg">
            </div>
            <div id="thumbStatus" style="font-size:11px; color:#71717a; margin-top:6px;">Кадр не выбран — возьмем случайный автоматом</div>
          </div>

          <div id="upError" class="error" style="display:none; margin-top:12px;"></div>
          <button id="upBtn" class="btn btn-primary btn-block" style="margin-top:18px;" onclick="app.doUpload()">ЗАГРУЗИТЬ</button>
          <button class="btn btn-block" style="margin-top:8px;" onclick="app.navigate('home')">ОТМЕНА</button>
        </div>

        <!-- Состояние загрузки - только бар и превью -->
        <div id="uploadingState" class="uploading-state" style="display:none">
          <div style="font-weight:800; font-size:14px; text-transform:uppercase; margin-bottom:12px;">ЗАГРУЗКА...</div>
          <div class="uploading-bar">
            <div id="upBar" class="uploading-bar-fill"></div>
          </div>
          <div id="uploadingPercent" style="font-family:'JetBrains Mono', monospace; font-size:12px; margin-top:8px;">0%</div>
          
          <div id="uploadPreviewCard" class="video-preview-card" style="display:none">
            <div class="thumb">
              <img id="uploadPreviewThumb" style="display:none">
              <div id="uploadPreviewPlaceholder" class="thumb-placeholder">ЛОЛ ТУБ</div>
            </div>
            <div class="video-info">
              <div id="uploadPreviewTitle" class="video-title">Название</div>
              <div style="font-size:12px; color:#71717a; margin-top:4px;">Так будет выглядеть видео</div>
            </div>
          </div>
        </div>
      </div>
      <input id="customThumbInput" type="file" accept="image/*" style="display:none">
      <canvas id="frameCanvas" style="display:none"></canvas>
    `;

    frameCanvas = document.getElementById('frameCanvas');
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
      dropZone.onclick = () => this.triggerVideoSelect();
      dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.background='#ede9fe'; });
      dropZone.addEventListener('dragleave', () => dropZone.style.background='');
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.style.background='';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('video/')) this.handleVideoFile(file);
      });
    }
    const customThumb = document.getElementById('customThumbInput');
    if (customThumb) {
      customThumb.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        selectedThumbFile = file;
        const reader = new FileReader();
        reader.onload = ev => {
          const prev = document.getElementById('thumbPreview');
          const img = document.getElementById('thumbPreviewImg');
          const status = document.getElementById('thumbStatus');
          if (prev) prev.style.display='block';
          if (img) img.src = ev.target.result;
          if (status) status.textContent = 'Свое превью выбрано';
        };
        reader.readAsDataURL(file);
      };
    }
  },

  triggerVideoSelect() {
    const input = document.createElement('input');
    input.type='file';
    input.accept='video/*';
    input.onchange = e => {
      const file = e.target.files[0];
      if (file) this.handleVideoFile(file);
    };
    input.click();
  },

  handleVideoFile(file) {
    selectedVideoFile = file;
    const nameEl = document.getElementById('videoFileName');
    if (nameEl) nameEl.textContent = `${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
    const dz = document.getElementById('dropZone');
    if (dz) dz.classList.add('has-file');
    const previewSection = document.getElementById('previewSection');
    if (previewSection) previewSection.style.display='block';
    const video = document.getElementById('sourceVideo');
    if (!video) return;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
    video.onloadedmetadata = () => {
      const slider = document.getElementById('frameSlider');
      if (slider) {
        slider.max = Math.floor(video.duration * 10);
        slider.value = Math.floor(video.duration * 10 * 0.1);
      }
      video.currentTime = video.duration * 0.1;
      setTimeout(() => this.captureRandomFrame(), 800);
    };
    const slider = document.getElementById('frameSlider');
    if (slider) {
      slider.oninput = () => {
        if (video.duration) video.currentTime = slider.value / 10;
      };
    }
  },

  captureFrame() {
    const video = document.getElementById('sourceVideo');
    if (!video || !video.videoWidth) return;
    const canvas = frameCanvas;
    if (!canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'thumb.jpg', { type:'image/jpeg' });
      selectedThumbFile = file;
      const url = URL.createObjectURL(blob);
      const prev = document.getElementById('thumbPreview');
      const img = document.getElementById('thumbPreviewImg');
      const status = document.getElementById('thumbStatus');
      if (prev) prev.style.display='block';
      if (img) img.src = url;
      if (status) status.textContent = `Кадр взят: ${video.currentTime.toFixed(1)}с`;
    }, 'image/jpeg', 0.85);
  },

  captureRandomFrame() {
    const video = document.getElementById('sourceVideo');
    if (!video || !video.duration) return;
    const randomTime = Math.random() * Math.min(video.duration, 10) + 0.2;
    video.currentTime = randomTime;
    video.onseeked = () => {
      this.captureFrame();
      video.onseeked = null;
    };
  },

  useCurrentFrame() { this.captureFrame(); },

  async doUpload() {
    const titleEl = document.getElementById('upTitle');
    const descEl = document.getElementById('upDesc');
    const title = titleEl ? titleEl.value.trim() : '';
    const desc = descEl ? descEl.value.trim() : '';
    const errEl = document.getElementById('upError');
    const formBox = document.getElementById('uploadFormBox');
    const uploadingState = document.getElementById('uploadingState');
    const bar = document.getElementById('upBar');
    const percentEl = document.getElementById('uploadingPercent');
    const previewCard = document.getElementById('uploadPreviewCard');
    const previewTitle = document.getElementById('uploadPreviewTitle');
    const previewThumb = document.getElementById('uploadPreviewThumb');
    const previewPlaceholder = document.getElementById('uploadPreviewPlaceholder');

    if (!selectedVideoFile) { errEl.textContent='Выбери видео'; errEl.style.display='block'; return; }
    if (!title || !title.trim()) { errEl.textContent='Введи название'; errEl.style.display='block'; return; }

    if (!selectedThumbFile) {
      const video = document.getElementById('sourceVideo');
      if (video && video.videoWidth && frameCanvas) {
        const canvas = frameCanvas;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
        if (blob) selectedThumbFile = new File([blob], 'thumb.jpg', { type:'image/jpeg' });
      }
    }

    errEl.style.display='none';
    // Показываем только бар и превью
    if (formBox) formBox.style.display='none';
    if (uploadingState) uploadingState.style.display='block';
    if (previewCard) previewCard.style.display='block';
    if (previewTitle) previewTitle.textContent = title;
    if (selectedThumbFile && previewThumb && previewPlaceholder) {
      const url = URL.createObjectURL(selectedThumbFile);
      previewThumb.src = url;
      previewThumb.style.display='block';
      previewPlaceholder.style.display='none';
    }

    const form = new FormData();
    form.append('video', selectedVideoFile);
    if (selectedThumbFile) form.append('thumbnail', selectedThumbFile);
    form.append('title', title);
    form.append('description', desc);

    try {
      const xhr = new XMLHttpRequest();
      const promise = new Promise((resolve, reject) => {
        xhr.upload.onprogress = e => {
          if (e.lengthComputable && bar) {
            const pct = Math.round(e.loaded/e.total*100);
            bar.style.width = pct+'%';
            if (percentEl) percentEl.textContent = pct+'%';
          }
        };
        xhr.onload = () => {
          if (xhr.status>=200 && xhr.status<300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
          } else {
            try { const d=JSON.parse(xhr.responseText); reject(new Error(d.error||'Ошибка')); } catch { reject(new Error('Ошибка загрузки')); }
          }
        };
        xhr.onerror = () => reject(new Error('Сеть упала'));
        xhr.open('POST', apiUrl('/api/videos/upload'));
        const token = getToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(form);
      });
      const data = await promise;
      this.navigate('watch', {id: data.id});
    } catch (e) {
      if (e.message === 'Нет токена' || e.message === 'Невалидный токен') {
        clearToken();
        currentUser=null;
        this.showLogin();
        return;
      }
      // При ошибке возвращаем форму
      if (formBox) formBox.style.display='block';
      if (uploadingState) uploadingState.style.display='none';
      errEl.textContent = e.message;
      errEl.style.display='block';
    }
  },

  async renderWatch(id) {
    const main = document.getElementById('app');
    const video = await apiFetch(`/api/videos/${id}`);
    const comments = await apiFetch(`/api/videos/${id}/comments`);
    let likeStatus = { likes: video.likes?.length||0, dislikes: video.dislikes?.length||0, userLiked:false, userDisliked:false };
    try { likeStatus = await apiFetch(`/api/videos/${id}/like-status`); } catch {}

    const authorAvatar = video.authorAvatar ? apiUrl(video.authorAvatar) : null;

    main.innerHTML = `
      <div class="watch-layout">
        <div>
          <div class="player-root" id="playerRoot">
            <video id="videoEl" src="${apiUrl(`/uploads/${video.filename}`)}" poster="${video.thumbnail ? apiUrl(`/uploads/${video.thumbnail}`) : ''}" playsinline></video>
            <div class="player-controls">
              <div class="progress-wrap"><input id="progress" type="range" min="0" max="100" value="0"></div>
              <div class="controls-row">
                <button class="ctrl-btn" id="playBtn">▶</button>
                <button class="ctrl-btn" id="rewindBtn">-10</button>
                <button class="ctrl-btn" id="forwardBtn">+10</button>
                <input id="volume" type="range" min="0" max="1" step="0.05" value="1" style="width:70px">
                <select id="speedSelect" style="background:rgba(0,0,0,0.6); color:white; border:1px solid white; padding:4px;">
                  <option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option>
                </select>
                <button class="ctrl-btn" id="fsBtn">⛶</button>
              </div>
            </div>
          </div>
          <div class="watch-info">
            <div class="watch-title">${this.esc(video.title)}</div>
            ${video.description ? `<div style="background:rgba(248,247,255,0.8); backdrop-filter:blur(8px); border:2.5px solid black; padding:12px; font-size:13px; white-space:pre-wrap; margin-bottom:14px;">${this.esc(video.description)}</div>` : ''}
            <div class="author-row" onclick="app.navigate('user', {nickname:'${video.authorNickname}'})">
              <div class="avatar" style="${!authorAvatar ? `background:${video.authorColor}` : ''}">${authorAvatar ? `<img src="${authorAvatar}">` : video.authorNickname[0].toUpperCase()}</div>
              <div>
                <div style="font-weight:800; font-size:13px;">${this.esc(video.authorNickname)}</div>
                <div style="font-size:11px; color:#71717a;">${video.views||0} просмотров</div>
              </div>
            </div>
            <div class="action-row">
              <button id="likeBtn" class="action-btn violet ${likeStatus.userLiked?'active':''}" onclick="app.toggleLike('${video.id}','like')">♥ ${likeStatus.likes}</button>
              <button id="dislikeBtn" class="action-btn ${likeStatus.userDisliked?'active':''}" onclick="app.toggleLike('${video.id}','dislike')">✕ ${likeStatus.dislikes}</button>
              <button class="action-btn" onclick="app.shareVideo('${video.id}')">ПОДЕЛИТЬСЯ</button>
              ${currentUser && currentUser.id===video.authorId ? `<button class="action-btn" style="background:black; color:white;" onclick="app.deleteVideo('${video.id}')">УДАЛИТЬ</button>` : ''}
            </div>
          </div>
          <div class="comments">
            <h3>КОММЕНТАРИИ • ${comments.length}</h3>
            <div class="comment-input-row">
              <input id="commentInput" type="text" placeholder="" maxlength="1000" onkeydown="if(event.key==='Enter') app.postComment('${video.id}')">
              <button class="btn btn-primary" onclick="app.postComment('${video.id}')">ОК</button>
            </div>
            <div id="commentsList">${comments.length ? comments.map(c=>this.commentHtml(c)).join('') : `<div style="font-size:12px; color:#71717a;">Пока нет</div>`}</div>
          </div>
        </div>
        <div>
          <div style="font-size:11px; font-weight:800; text-transform:uppercase; margin-bottom:12px;">ДАЛЕЕ</div>
          <div id="related"></div>
        </div>
      </div>
    `;
    this.initPlayer();
    try {
      const all = await apiFetch('/api/videos');
      const related = all.filter(v=>v.id!==id).slice(0,6);
      const relEl = document.getElementById('related');
      if (relEl) {
        relEl.innerHTML = `<div style="display:flex; flex-direction:column; gap:12px;">${related.map(v=>`
          <div class="video-card" onclick="app.navigate('watch', {id:'${v.id}'})">
            <div class="thumb"><img src="${v.thumbnail ? apiUrl(`/uploads/${v.thumbnail}`) : ''}" onerror="this.style.display='none'"><div class="thumb-placeholder" style="position:absolute; inset:0; display:${v.thumbnail?'none':'flex'}">ЛОЛ ТУБ</div></div>
            <div class="video-info"><div class="video-title" style="font-size:13px;">${this.esc(v.title)}</div></div>
          </div>
        `).join('')}</div>`;
      }
    } catch {}
  },

  commentHtml(c) {
    const av = c.authorAvatar ? apiUrl(c.authorAvatar) : null;
    return `<div class="comment"><div class="avatar" style="${!av ? `background:${c.authorColor}; width:32px; height:32px; font-size:11px;` : 'width:32px; height:32px;'}">${av ? `<img src="${av}">` : c.authorNickname[0].toUpperCase()}</div><div style="flex:1"><div class="comment-author">${this.esc(c.authorNickname)}</div><div class="comment-text">${this.esc(c.text)}</div><div class="comment-time">${this.timeAgo(c.createdAt)}</div></div></div>`;
  },

  initPlayer() {
    const video = document.getElementById('videoEl');
    const root = document.getElementById('playerRoot');
    const playBtn = document.getElementById('playBtn');
    const progress = document.getElementById('progress');
    const volume = document.getElementById('volume');
    const speed = document.getElementById('speedSelect');
    if (!video || !root || !playBtn || !progress) return;
    let hideTimeout;
    const show = () => { root.classList.add('show-controls'); clearTimeout(hideTimeout); hideTimeout=setTimeout(()=>root.classList.remove('show-controls'), 3000); };
    video.addEventListener('click', () => { video.paused ? video.play() : video.pause(); show(); });
    root.addEventListener('touchstart', show);
    root.addEventListener('mousemove', show);
    playBtn.onclick = () => video.paused ? video.play() : video.pause();
    video.addEventListener('play', () => { playBtn.textContent='❚❚'; root.classList.remove('paused'); });
    video.addEventListener('pause', () => { playBtn.textContent='▶'; root.classList.add('paused'); });
    video.addEventListener('timeupdate', () => { if (video.duration) progress.value = (video.currentTime/video.duration)*100; });
    progress.addEventListener('input', () => { if (video.duration) video.currentTime = (progress.value/100)*video.duration; });
    if (volume) volume.addEventListener('input', () => video.volume = volume.value);
    if (speed) speed.addEventListener('change', () => video.playbackRate = parseFloat(speed.value));
    const rw = document.getElementById('rewindBtn');
    const fw = document.getElementById('forwardBtn');
    const fs = document.getElementById('fsBtn');
    if (rw) rw.onclick = () => video.currentTime = Math.max(0, video.currentTime-10);
    if (fw) fw.onclick = () => video.currentTime = Math.min(video.duration||0, video.currentTime+10);
    if (fs) fs.onclick = () => {
      if (!document.fullscreenElement) (root.requestFullscreen||video.requestFullscreen).call(root);
      else document.exitFullscreen && document.exitFullscreen();
    };
    show(); root.classList.add('paused');
  },

  async toggleLike(id, type) {
    try {
      const res = await apiFetch(`/api/videos/${id}/like`, { method:'POST', body: JSON.stringify({ type }) });
      const likeBtn = document.getElementById('likeBtn');
      const dislikeBtn = document.getElementById('dislikeBtn');
      if (likeBtn) likeBtn.innerHTML=`♥ ${res.likes}`;
      if (dislikeBtn) dislikeBtn.innerHTML=`✕ ${res.dislikes}`;
      if (likeBtn) likeBtn.classList.toggle('active', res.userLiked);
      if (dislikeBtn) dislikeBtn.classList.toggle('active', res.userDisliked);
    } catch (e) {
      if (e.message === 'Нет токена' || e.message === 'Невалидный токен') { this.showLogin(); return; }
    }
  },

  async postComment(videoId) {
    const input = document.getElementById('commentInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    try {
      const c = await apiFetch(`/api/videos/${videoId}/comments`, { method:'POST', body: JSON.stringify({ text }) });
      input.value='';
      const list = document.getElementById('commentsList');
      if (list) list.insertAdjacentHTML('afterbegin', this.commentHtml(c));
    } catch (e) {
      if (e.message === 'Нет токена' || e.message === 'Невалидный токен') { this.showLogin(); return; }
    }
  },

  shareVideo(id) {
    const url = `${location.origin}${location.pathname}#watch/${id}`;
    const full = getApiBase() ? `${getApiBase()}/#watch/${id}` : url;
    if (navigator.clipboard) navigator.clipboard.writeText(full).then(()=>{});
    else prompt('Ссылка:', full);
  },

  async deleteVideo(id) {
    if (!confirm('Удалить?')) return;
    try { await apiFetch(`/api/videos/${id}`, { method:'DELETE' }); this.navigate('home'); } catch (e) {
      if (e.message === 'Нет токена') { this.showLogin(); return; }
    }
  },

  async uploadAvatar(file) {
    if (!file) return;
    if (currentUser && currentUser.nickname === 'test_account') {
      const errEl = document.getElementById('loginError');
      alert('Тестовый аккаунт не может менять аватарку');
      return;
    }
    const form = new FormData();
    form.append('avatar', file);
    try {
      const res = await apiFetch('/api/me/avatar', { method:'POST', body: form });
      currentUser.avatar = res.avatar;
      this.renderAccountBtn();
      this.renderProfile();
    } catch (e) {
      if (e.message === 'Нет токена') { this.showLogin(); return; }
      alert(e.message);
    }
  },

  esc(s) { return (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); },
  timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff/60000);
    if (mins<1) return 'сейчас';
    if (mins<60) return `${mins}м`;
    const h = Math.floor(mins/60);
    if (h<24) return `${h}ч`;
    const d = Math.floor(h/24);
    return `${d}д`;
  }
};

window.app = app;
window.addEventListener('DOMContentLoaded', () => app.init());
