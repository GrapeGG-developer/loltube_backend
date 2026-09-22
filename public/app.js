// ЛОЛ ТУБ v2 - MOBILE ONLY, FRIENDS, PLAYLISTS, LIVE TV-FANTOMAS, SEARCH, ADMIN
const LS_TOKEN = 'loltube_token_v3';
const LS_API = 'loltube_api_base';
const LS_THEME = 'loltube_theme';
const LS_ACCENT = 'loltube_accent';

function normalizeApiBase(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/^\[|\]$/g,'').replace(/\(.*\)$/,'').trim();
  s = s.replace(/^['"]+|['"]+$/g,'').trim();
  s = s.replace(/\/$/, '');
  if (!s) return '';
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) return `http://${s}:3000`;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(s)) return `http://${s}`;
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

function showIsland(text, type='') {
  const island = document.getElementById('hyperIsland');
  const txt = document.getElementById('islandText');
  if (!island || !txt) return;
  txt.textContent = text;
  island.className = 'hyper-island show ' + type;
  clearTimeout(island._t);
  island._t = setTimeout(()=>{ island.classList.remove('show'); }, 3000);
}

const app = {
  async checkBackendStatus() {
    const dot = document.getElementById('backendDot');
    const connIcon = document.getElementById('connectionIcon');
    const connDot = connIcon ? connIcon.querySelector('.conn-dot') : null;
    const set = (state) => {
      if (dot) dot.className = 'status-dot ' + state;
      if (connIcon) connIcon.className = 'connection-icon ' + state;
      if (connDot) connDot.className = 'conn-dot';
    };
    set('checking');
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(apiUrl('/api/config'), { signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('offline');
      const data = await res.json();
      set('online');
      showIsland(`ОНЛАЙН • v${data.version||'2'}`, 'violet');
    } catch (e) {
      const base = getApiBase();
      const isRender = base.includes('onrender.com');
      if (isRender) {
        set('checking');
        showIsland('ПРОСЫПАЕТСЯ...', 'violet');
        setTimeout(() => this.checkBackendStatus(), 5000);
      } else {
        set('offline');
        showIsland('ОФФЛАЙН', 'error');
      }
    }
  },

  async init() {
    this.applyTheme();
    this.checkBackendStatus();
    setInterval(() => this.checkBackendStatus(), 15000);
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
          showIsland('ТЕСТ АККАУНТ', 'violet');
        } catch (err) {
          const errEl = document.getElementById('loginError');
          if (errEl) { errEl.textContent = err.message; errEl.style.display='block'; }
        }
      });
    }

    // search input live
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          if (searchInput.value.trim().length>=2) this.doSearch();
        }, 600);
      });
    }
  },

  applyTheme() {
    const theme = localStorage.getItem(LS_THEME) || currentUser?.theme || 'light';
    const accent = localStorage.getItem(LS_ACCENT) || currentUser?.accent || 'violet';
    document.body.setAttribute('data-theme', theme);
    document.body.setAttribute('data-accent', accent);
    // simple dark mode
    if (theme==='dark' || theme==='black') {
      document.body.style.background = theme==='black' ? '#000' : '#1a1a1a';
      document.body.style.color = '#fff';
    } else {
      document.body.style.background = '';
      document.body.style.color = '';
    }
  },

  async checkAuth() {
    const token = getToken();
    if (!token) { this.showLogin(); return; }
    try {
      currentUser = await apiFetch('/api/me');
      this.hideLogin();
      this.renderAccountBtn();
      this.applyTheme();
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
    this.setNavActive('home');
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
      const avUrl = currentUser.avatar ? this.getFileUrl(currentUser.avatar) : null;
      const av = avUrl ? `<div class="avatar"><img src="${avUrl}"></div>` : `<div class="avatar" style="background:${currentUser.avatarColor}">${currentUser.nickname[0].toUpperCase()}</div>`;
      btn.innerHTML = `${av}<span>${currentUser.nickname.slice(0,6)}</span>`;
      btn.classList.add('has-user');
    } else {
      btn.textContent = 'ВОЙТИ';
      btn.classList.remove('has-user');
    }
  },

  setNavActive(page) {
    document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.remove('active'));
    const map = { home:'navHome', shorts:'navShorts', live:'navLive', friends:'navFriends', profile:'navProfile', upload:'navHome' };
    const id = map[page] || 'navHome';
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
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
      showIsland(`ПРИВЕТ, ${currentUser.nickname.toUpperCase()}`, 'violet');
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
    showIsland('ВЫШЕЛ', '');
  },

  navigate(page, params={}) {
    if (!currentUser && page!=='live') { this.showLogin(); return; }
    let hash = page;
    if (params.id) hash+=`/${params.id}`;
    if (params.nickname) hash+=`/${params.nickname}`;
    window.location.hash=hash;
    this.router();
    this.setNavActive(page);
  },

  openProfile() {
    if (!currentUser) { this.showLogin(); return; }
    this.navigate('profile');
  },

  async router() {
    const main = document.getElementById('app');
    if (!main) return;
    if (!currentUser) { 
      const hash = window.location.hash.slice(1) || 'home';
      if (hash.startsWith('live')) {
        // allow live without auth
      } else {
        this.showLogin(); 
        return; 
      }
    }
    const hash = window.location.hash.slice(1) || 'home';
    const [page, id] = hash.split('/');
    main.innerHTML = `<div class="loading">ЛОЛ ТУБ v2...</div>`;
    try {
      if (page==='home') await this.renderHome();
      else if (page==='live') await this.renderLive();
      else if (page==='friends') await this.renderFriends();
      else if (page==='watch' && id) await this.renderWatch(id);
      else if (page==='profile') await this.renderProfile();
      else if (page==='upload') await this.renderUpload();
      else if (page==='user' && id) await this.renderUser(id);
      else if (page==='search') await this.renderSearch(id);
      else if (page==='history') await this.renderHistory();
      else if (page==='favorites') await this.renderFavorites();
      else if (page==='playlists') await this.renderPlaylists();
      else if (page==='admin') await this.renderAdmin();
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
    const filter = new URLSearchParams(window.location.search).get('type') || 'all';
    const videos = await apiFetch(`/api/videos?type=${filter}&sort=new`);
    if (!videos.length) {
      main.innerHTML = `<div class="empty"><h2>Пока пусто...</h2><p style="font-size:12px;color:#71717a;margin-top:8px;">Загрузи первое видео</p><button class="btn btn-primary" style="margin-top:12px" onclick="app.navigate('upload')">+ ЗАГРУЗИТЬ</button></div>`;
      return;
    }
    main.innerHTML = `
      <div style="display:flex;gap:6px;margin:10px 0;overflow-x:auto;flex-wrap:nowrap;">
        <button class="btn ${filter==='all'?'btn-primary':''}" style="font-size:10px;min-height:32px;padding:0 10px;white-space:nowrap;" onclick="app.filterHome('all')">ВСЕ</button>
        <button class="btn ${filter==='video'?'btn-primary':''}" style="font-size:10px;min-height:32px;padding:0 10px;" onclick="app.filterHome('video')">ВИДЕО</button>
        <button class="btn ${filter==='image'?'btn-primary':''}" style="font-size:10px;min-height:32px;" onclick="app.filterHome('image')">ФОТО</button>
        <button class="btn ${filter==='gif'?'btn-primary':''}" style="font-size:10px;min-height:32px;" onclick="app.filterHome('gif')">GIF</button>
        <button class="btn ${filter==='music'?'btn-primary':''}" style="font-size:10px;min-height:32px;" onclick="app.filterHome('music')">МУЗЫКА</button>
      </div>
      <div class="video-grid">${videos.map((v,i) => this.videoCard(v,i)).join('')}</div>`;
  },
  filterHome(type) {
    window.history.replaceState({}, '', `?type=${type}#home`);
    this.renderHome();
  },

  getFileUrl(filename) {
    if (!filename) return null;
    if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
    if (filename.startsWith('/uploads/')) return apiUrl(filename);
    return apiUrl(`/uploads/${filename}`);
  },
  videoCard(v) {
    const thumb = v.cloudinaryThumbUrl || v.thumbnail ? this.getFileUrl(v.cloudinaryThumbUrl || v.thumbnail) : null;
    const isImage = v.contentType==='image' || v.contentType==='gif';
    const isMusic = v.contentType==='music';
    // Premium icons for content type
    const typeIcons = {
      video: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
      image: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
      gif: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 8h.01"/><path d="M12 8h.01"/><path d="M16 8h.01"/><path d="M8 16h.01"/><path d="M12 16h.01"/><path d="M16 16h.01"/></svg>`,
      music: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
    };
    const fileUrl = this.getFileUrl(v.cloudinaryUrl || v.filename);
    const typeIcon = typeIcons[v.contentType] || typeIcons.video;
    return `
      <div class="video-card" onclick="app.navigate('watch', {id:'${v.id}'})">
        <div class="thumb">
          ${thumb ? `<img src="${thumb}" loading="lazy">` : isImage ? `<img src="${fileUrl}" loading="lazy">` : `<div class="thumb-placeholder"><span style="display:flex;align-items:center;gap:4px;">${typeIcon} ЛОЛ ТУБ</span></div>`}
          <div class="thumb-meta"><span style="display:flex;align-items:center;gap:3px;">${typeIcon} ${v.views||0}</span></div>
          <div class="content-type-icon ${v.contentType}">${typeIcon} ${v.contentType.toUpperCase()}</div>
        </div>
        <div class="video-info">
          <div class="video-title">${this.esc(v.title)}</div>
          <div class="video-meta"><span style="display:flex;align-items:center;gap:3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${this.esc(v.authorNickname)}</span><span>${this.timeAgo(v.createdAt)}</span><span style="display:flex;align-items:center;gap:2px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2.08C10.5 3.5 9.5 3 7.75 3A5.5 5.5 0 0 0 2.25 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg> ${v.likes?.length||0}</span></div>
        </div>
      </div>
    `;
  },

  async renderLive() {
    const main = document.getElementById('app');
    const live = await apiFetch('/api/live');
    main.innerHTML = `
      <div style="padding:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px;">
            ${live.isLive ? '<span class="live-badge"><span style="width:6px;height:6px;background:white;border-radius:50% !important;display:inline-block;animation:pulse 1s infinite;"></span> LIVE</span>' : '<span style="background:#71717a;color:white;font-size:9px;font-weight:800;padding:3px 8px;">OFFLINE</span>'}
            <span>ТВ-ФАНТОМАС</span>
          </div>
          <div style="font-size:10px;color:#71717a;display:flex;align-items:center;gap:4px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${live.viewerCount||0}
          </div>
        </div>
        
        <div class="live-player" id="livePlayer" style="border:var(--border-w-thick) solid var(--border);background:black;position:relative;overflow:hidden;">
          ${live.isLive && live.hlsUrl ? '' : `
            <div class="live-offline">
              <div class="offline-icon">◼</div>
              <div style="font-size:14px;font-weight:800;">${live.isLive ? 'ЗАГРУЗКА...' : 'ЭФИР ЗАВЕРШЕН'}</div>
              <div style="font-size:11px;color:#a1a1aa;margin-top:6px;">${this.esc(live.title)}</div>
              <div style="font-size:10px;color:#71717a;margin-top:12px;">Скоро снова в эфире</div>
            </div>
          `}
        </div>

        <div style="margin-top:10px;border:var(--border-w) solid var(--border);background:rgba(255,255,255,0.9);padding:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;">${this.esc(live.title)}</div>
            <div style="font-size:10px;color:#71717a;margin-top:2px;">Фантомас ТВ • Прямой эфир • ${live.isLive ? 'В эфире' : 'Оффлайн'}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn" style="font-size:10px;min-height:28px;padding:0 8px;" onclick="app.shareLive()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              ПОДЕЛИТЬСЯ
            </button>
          </div>
        </div>

        ${currentUser?.isAdmin ? `
          <div class="settings-section" style="margin-top:12px;">
            <h3><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 9 15a1.65 1.65 0 0 0-1-1.51V13a2 2 0 0 1 0-4v-.09a1.65 1.65 0 0 0 1-1.51 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 13 9a1.65 1.65 0 0 0 1-1.51V7a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21 11a1.65 1.65 0 0 0 1 1.51V13a2 2 0 0 1 0 4v.09a1.65 1.65 0 0 0-1 1.51Z"/></svg> АДМИН - УПРАВЛЕНИЕ ЭФИРОМ</h3>
            <div class="form-row"><label>HLS URL</label><input id="liveHlsUrl" type="text" value="${this.esc(live.hlsUrl)}" placeholder="https://.../live.m3u8"></div>
            <div class="form-row"><label>Название</label><input id="liveTitle" type="text" value="${this.esc(live.title)}"></div>
            <div style="display:flex;gap:6px;margin-top:10px;">
              <button class="btn btn-primary" style="font-size:10px;" onclick="app.setLive(true)">В ЭФИР</button>
              <button class="btn" style="font-size:10px;" onclick="app.setLive(false)">СТОП</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    if (live.isLive && live.hlsUrl) {
      const video = document.createElement('video');
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.style.width='100%';
      video.style.height='100%';
      video.style.background='black';
      const playerDiv = document.getElementById('livePlayer');
      if (playerDiv) {
        playerDiv.innerHTML='';
        playerDiv.appendChild(video);
        if (live.hlsUrl.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(live.hlsUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(()=>{}));
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = live.hlsUrl;
          video.play().catch(()=>{});
        } else {
          video.src = live.hlsUrl;
          video.play().catch(()=>{});
        }
        try { await apiFetch('/api/live/view', { method:'POST' }); } catch {}
      }
    }
  },
  async setLive(isLive) {
    const hlsUrl = document.getElementById('liveHlsUrl')?.value.trim();
    const title = document.getElementById('liveTitle')?.value.trim();
    try {
      await apiFetch('/api/live', { method:'POST', body: JSON.stringify({ isLive, hlsUrl, title }) });
      showIsland(isLive ? 'ЭФИР ВКЛЮЧЕН' : 'ЭФИР ВЫКЛЮЧЕН', 'violet');
      this.renderLive();
    } catch (e) { alert(e.message); }
  },

  async renderFriends() {
    const main = document.getElementById('app');
    const data = await apiFetch('/api/friends');
    const subs = await apiFetch('/api/subscriptions');
    main.innerHTML = `
      <div style="font-size:16px;font-weight:800;margin:12px 0;">ДРУЗЬЯ • ПОДПИСКИ</div>
      <div style="display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;">
        <button class="btn btn-primary" style="font-size:10px;min-height:32px;" onclick="app.navigate('friends')">ДРУЗЬЯ</button>
        <button class="btn" style="font-size:10px;min-height:32px;" onclick="app.navigate('history')">ИСТОРИЯ</button>
        <button class="btn" style="font-size:10px;min-height:32px;" onclick="app.navigate('favorites')">ИЗБРАННОЕ</button>
        <button class="btn" style="font-size:10px;min-height:32px;" onclick="app.navigate('playlists')">ПЛЕЙЛИСТЫ</button>
      </div>
      ${data.requests.length ? `<div class="settings-section"><h3>ЗАЯВКИ В ДРУЗЬЯ (${data.requests.length})</h3>${data.requests.map(u=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee;"><div class="avatar" style="background:${u.avatarColor||'#7c3aed'}">${u.nickname[0].toUpperCase()}</div><span style="flex:1;font-weight:700;font-size:13px;">${this.esc(u.nickname)}</span><button class="btn btn-primary" style="font-size:10px;min-height:28px;padding:0 8px;" onclick="app.acceptFriend('${u.nickname}')">ПРИНЯТЬ</button><button class="btn" style="font-size:10px;min-height:28px;" onclick="app.declineFriend('${u.nickname}')">Х</button></div>`).join('')}</div>` : ''}
      <div class="settings-section"><h3>МОИ ДРУЗЬЯ (${data.friends.length})</h3>${data.friends.length ? data.friends.map(u=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee;cursor:pointer;" onclick="app.navigate('user', {nickname:'${u.nickname}'})"><div class="avatar" style="background:${u.avatarColor||'#7c3aed'}">${u.nickname[0].toUpperCase()}</div><div style="flex:1"><div style="font-weight:700;font-size:13px;">${this.esc(u.nickname)}</div><div style="font-size:10px;color:#71717a;">LVL ${u.level||1}</div></div><button class="btn" style="font-size:10px;min-height:28px;" onclick="event.stopPropagation();app.removeFriend('${u.nickname}')">УДАЛИТЬ</button></div>`).join('') : '<div style="font-size:11px;color:#71717a;">Пока нет друзей</div>'}</div>
      <div class="settings-section" style="margin-top:12px;"><h3>ПОДПИСКИ (${subs.length})</h3>${subs.length ? subs.map(u=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee;cursor:pointer;" onclick="app.navigate('user', {nickname:'${u.nickname}'})"><div class="avatar">${u.nickname[0].toUpperCase()}</div><div style="flex:1;font-weight:700;font-size:13px;">${this.esc(u.nickname)}</div><div style="font-size:10px;color:#71717a;">${u.subscribers} подписчиков</div></div>`).join('') : '<div style="font-size:11px;color:#71717a;">Нет подписок</div>'}</div>
      <div class="settings-section" style="margin-top:12px;">
        <h3>ДОБАВИТЬ ДРУГА</h3>
        <div style="display:flex;gap:6px;"><input id="friendNick" type="text" placeholder="НИК" style="flex:1;border:var(--border-w) solid var(--border);padding:8px;font-size:13px;"><button class="btn btn-primary" style="font-size:10px;" onclick="app.sendFriendRequest()">ДОБАВИТЬ</button></div>
      </div>
    `;
  },
  async sendFriendRequest() {
    const nick = document.getElementById('friendNick')?.value.trim();
    if (!nick) return;
    try { await apiFetch(`/api/friends/request/${nick}`, { method:'POST' }); showIsland('ЗАЯВКА ОТПРАВЛЕНА', 'violet'); this.renderFriends(); } catch(e){ alert(e.message); }
  },
  async acceptFriend(nick) { try { await apiFetch(`/api/friends/accept/${nick}`, { method:'POST' }); showIsland('ДРУГ ДОБАВЛЕН', 'violet'); this.renderFriends(); } catch(e){ alert(e.message); } },
  async declineFriend(nick) { try { await apiFetch(`/api/friends/decline/${nick}`, { method:'POST' }); this.renderFriends(); } catch(e){ alert(e.message); } },
  async removeFriend(nick) { if(!confirm('Удалить друга?')) return; try { await apiFetch(`/api/friends/${nick}`, { method:'DELETE' }); this.renderFriends(); } catch(e){ alert(e.message); } },

  async renderProfile() {
    const main = document.getElementById('app');
    if (currentUser && currentUser.nickname === 'test_account') {
      main.innerHTML = `
        <div class="profile-head">
          <div class="avatar large" style="background:#000">T</div>
          <div>
            <div class="profile-name">TEST_ACCOUNT</div>
            <div style="font-size:11px; color:#71717a; margin:4px 0;">Тестовый - загрузка ограничена</div>
            <button class="btn" onclick="app.logout()">ВЫЙТИ</button>
          </div>
        </div>
        <div class="empty"><h2>Тестовый аккаунт</h2></div>
      `;
      return;
    }

    const data = await apiFetch(`/api/users/${currentUser.nickname}/videos`);
    const user = data.user;
    const videos = data.videos;
    let notifs = [];
    try {
      const n = await apiFetch('/api/notifications');
      notifs = Array.isArray(n) ? n : (n.notifications && Array.isArray(n.notifications) ? n.notifications : []);
    } catch { notifs = []; }
    main.innerHTML = `
      <div class="profile-head" style="${user.banner ? `background:url(${apiUrl(user.banner)}) center/cover;` : ''}">
        <div class="avatar large" style="${!user.avatar ? `background:${user.avatarColor}` : ''}" onclick="document.getElementById('avatarInput').click()">
          ${user.avatar ? `<img src="${apiUrl(user.avatar)}">` : user.nickname[0].toUpperCase()}
        </div>
        <div style="flex:1;min-width:0;">
          <div class="profile-name" style="display:flex;align-items:center;gap:6px;">${this.esc(user.nickname)} <span style="font-size:10px;background:var(--violet);color:white;padding:2px 4px;">LVL ${user.level||1}</span> ${user.isAdmin?'<span style="font-size:9px;background:black;color:white;padding:2px 4px;">ADMIN</span>':''}</div>
          <div style="font-size:11px; color:#71717a; margin:4px 0;">${user.bio||'Нет био'} • ${user.subscribers||0} подписчиков • ${videos.length} видео • ${user.totalViews||0} просмотров</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn" style="font-size:10px;min-height:28px;padding:0 8px;" onclick="document.getElementById('avatarInput').click()">АВАТАРКА</button>
            <button class="btn" style="font-size:10px;min-height:28px;padding:0 8px;" onclick="document.getElementById('bannerInput').click()">БАННЕР</button>
            <button class="btn" style="font-size:10px;min-height:28px;padding:0 8px;" onclick="app.logout()">ВЫЙТИ</button>
            ${user.isAdmin?'<button class="btn btn-primary" style="font-size:10px;min-height:28px;" onclick="app.navigate(\'admin\')">АДМИН</button>':''}
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>НАСТРОЙКИ АККАУНТА</h3>
        <div class="form-row"><label>БИО (до 200)</label><textarea id="bioInput" maxlength="200" placeholder="О себе...">${this.esc(user.bio||'')}</textarea></div>
        <div class="form-row"><label>ТЕМА</label><div class="theme-options">
          <div class="theme-option ${user.theme==='light'?'active':''}" onclick="app.setTheme('light')">LIGHT</div>
          <div class="theme-option ${user.theme==='dark'?'active':''}" onclick="app.setTheme('dark')">DARK</div>
          <div class="theme-option ${user.theme==='black'?'active':''}" onclick="app.setTheme('black')">BLACK</div>
        </div></div>
        <div class="form-row"><label>АКЦЕНТ</label><div class="theme-options">
          <div class="theme-option ${user.accent==='violet'?'active':''}" onclick="app.setAccent('violet')" style="background:#7c3aed;color:white;">VIOLET</div>
          <div class="theme-option ${user.accent==='green'?'active':''}" onclick="app.setAccent('green')" style="background:#22c55e;color:white;">GREEN</div>
          <div class="theme-option ${user.accent==='red'?'active':''}" onclick="app.setAccent('red')" style="background:#ef4444;color:white;">RED</div>
          <div class="theme-option ${user.accent==='blue'?'active':''}" onclick="app.setAccent('blue')" style="background:#3b82f6;color:white;">BLUE</div>
        </div></div>
        <button class="btn btn-primary" style="margin-top:10px;font-size:11px;" onclick="app.saveProfile()">СОХРАНИТЬ</button>
      </div>

      <div class="settings-section">
        <h3>СМЕНА НИКА (раз в день)</h3>
        <div style="display:flex;gap:6px;"><input id="newNickInput" type="text" placeholder="НОВЫЙ НИК" style="flex:1;border:var(--border-w) solid var(--border);padding:8px;font-size:13px;"><button class="btn btn-primary" style="font-size:10px;" onclick="app.changeNickname()">СМЕНИТЬ</button></div>
        <div style="font-size:10px;color:#71717a;margin-top:6px;">Последняя смена: ${user.nicknameChangedAt ? this.timeAgo(user.nicknameChangedAt) : 'никогда'}</div>
      </div>

      <div class="settings-section">
        <h3>УВЕДОМЛЕНИЯ (${notifs.filter(n=>!n.read).length} новых)</h3>
        ${notifs.length ? notifs.slice(0,10).map(n=>`<div style="padding:6px 0;border-bottom:1px solid #eee;font-size:11px;"><span style="font-weight:700;">${n.type}</span> • ${this.esc(JSON.stringify(n.data).slice(0,80))} • <span style="color:#71717a;">${this.timeAgo(n.createdAt)}</span></div>`).join('') : '<div style="font-size:11px;color:#71717a;">Нет уведомлений</div>'}
        ${notifs.length ? '<button class="btn" style="margin-top:8px;font-size:10px;min-height:28px;" onclick="app.readNotifications()">ПРОЧИТАТЬ ВСЕ</button>' : ''}
      </div>

      <div style="display:flex;gap:6px;margin-top:12px;overflow-x:auto;">
        <button class="btn ${'btn-primary'}" style="font-size:10px;min-height:32px;white-space:nowrap;" onclick="app.navigate('profile')">ВИДЕО</button>
        <button class="btn" style="font-size:10px;min-height:32px;white-space:nowrap;" onclick="app.navigate('history')">ИСТОРИЯ</button>
        <button class="btn" style="font-size:10px;min-height:32px;white-space:nowrap;" onclick="app.navigate('favorites')">ИЗБРАННОЕ</button>
        <button class="btn" style="font-size:10px;min-height:32px;white-space:nowrap;" onclick="app.navigate('playlists')">ПЛЕЙЛИСТЫ</button>
        <button class="btn" style="font-size:10px;min-height:32px;white-space:nowrap;" onclick="app.navigate('friends')">ДРУЗЬЯ</button>
      </div>

      ${videos.length ? `<div class="video-grid" style="padding-top:12px;">${videos.map((v,i)=>this.videoCard(v,i)).join('')}</div>` : `<div class="empty"><h2>Пока пусто...</h2></div>`}
    `;
    const avInput = document.getElementById('avatarInput');
    if (avInput) avInput.onchange = e => this.uploadAvatar(e.target.files[0]);
    const bannerInput = document.getElementById('bannerInput');
    if (bannerInput) bannerInput.onchange = e => this.uploadBanner(e.target.files[0]);
  },
  async saveProfile() {
    const bio = document.getElementById('bioInput')?.value.trim();
    try {
      await apiFetch('/api/me', { method:'PUT', body: JSON.stringify({ bio }) });
      showIsland('СОХРАНЕНО', 'violet');
      this.renderProfile();
    } catch(e){ alert(e.message); }
  },
  async setTheme(theme) {
    localStorage.setItem(LS_THEME, theme);
    try { await apiFetch('/api/me', { method:'PUT', body: JSON.stringify({ theme }) }); } catch {}
    this.applyTheme();
    showIsland(`ТЕМА: ${theme.toUpperCase()}`, 'violet');
    this.renderProfile();
  },
  async setAccent(accent) {
    localStorage.setItem(LS_ACCENT, accent);
    try { await apiFetch('/api/me', { method:'PUT', body: JSON.stringify({ accent }) }); } catch {}
    document.body.setAttribute('data-accent', accent);
    showIsland(`АКЦЕНТ: ${accent.toUpperCase()}`, 'violet');
  },
  async changeNickname() {
    const newNick = document.getElementById('newNickInput')?.value.trim();
    if (!newNick) return;
    try {
      const res = await apiFetch('/api/me/change-nickname', { method:'POST', body: JSON.stringify({ newNickname: newNick }) });
      setToken(res.token);
      currentUser.nickname = res.new;
      showIsland(`НИК: ${res.new}`, 'violet');
      this.renderProfile();
    } catch(e){ alert(e.message); }
  },
  async readNotifications() {
    try { await apiFetch('/api/notifications/read', { method:'POST' }); this.renderProfile(); } catch(e){}
  },

  async renderUser(nickname) {
    const main = document.getElementById('app');
    const data = await apiFetch(`/api/users/${nickname}/videos`);
    const isFriend = currentUser?.friends?.includes(data.user.id);
    const isSubscribed = currentUser?.subscriptions?.includes(data.user.id);
    main.innerHTML = `
      <div class="profile-head" style="${data.user.banner ? `background:url(${apiUrl(data.user.banner)}) center/cover;` : ''}">
        <div class="avatar large" style="${!data.user.avatar ? `background:${data.user.avatarColor}` : ''}">
          ${data.user.avatar ? `<img src="${apiUrl(data.user.avatar)}">` : data.user.nickname[0].toUpperCase()}
        </div>
        <div style="flex:1;min-width:0;">
          <div class="profile-name">${this.esc(data.user.nickname)} <span style="font-size:10px;background:var(--violet);color:white;padding:2px 4px;">LVL ${data.user.level||1}</span></div>
          <div style="font-size:11px; color:#71717a;">${this.esc(data.user.bio||'')} • ${data.user.subscribers||0} подписчиков • ${data.videos.length} видео</div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
            <button class="btn ${isSubscribed?'btn-primary':''}" style="font-size:10px;min-height:28px;" onclick="app.subscribe('${data.user.nickname}')">${isSubscribed?'ОТПИСАТЬСЯ':'ПОДПИСАТЬСЯ'}</button>
            <button class="btn ${isFriend?'btn-primary':''}" style="font-size:10px;min-height:28px;" onclick="app.toggleFriend('${data.user.nickname}')">${isFriend?'ДРУЗЬЯ':'В ДРУЗЬЯ'}</button>
            <button class="btn" style="font-size:10px;min-height:28px;" onclick="app.navigate('home')">НАЗАД</button>
          </div>
        </div>
      </div>
      ${data.videos.length ? `<div class="video-grid">${data.videos.map((v,i)=>this.videoCard(v,i)).join('')}</div>` : `<div class="empty"><h2>Пока пусто...</h2></div>`}
    `;
  },
  async subscribe(nick) {
    try { const res = await apiFetch(`/api/subscribe/${nick}`, { method:'POST' }); showIsland(res.subscribed?'ПОДПИСАЛСЯ':'ОТПИСАЛСЯ', 'violet'); this.renderUser(nick); } catch(e){ alert(e.message); }
  },
  async toggleFriend(nick) {
    try {
      // check if friends
      const friends = await apiFetch('/api/friends');
      const isFriend = friends.friends.some(f=>f.nickname.toLowerCase()===nick.toLowerCase());
      if (isFriend) {
        await apiFetch(`/api/friends/${nick}`, { method:'DELETE' });
        showIsland('УДАЛЕН ИЗ ДРУЗЕЙ', '');
      } else {
        await apiFetch(`/api/friends/request/${nick}`, { method:'POST' });
        showIsland('ЗАЯВКА ОТПРАВЛЕНА', 'violet');
      }
    } catch(e){ alert(e.message); }
  },

  async renderUpload() {
    const main = document.getElementById('app');
    if (currentUser && currentUser.nickname === 'test_account') {
      main.innerHTML = `<div class="empty"><h2>Тестовый аккаунт</h2><p>Не может загружать</p><button class="btn btn-primary" style="margin-top:16px" onclick="app.navigate('home')">НА ГЛАВНУЮ</button></div>`;
      return;
    }

    selectedVideoFile = null;
    selectedThumbFile = null;

    main.innerHTML = `
      <div class="upload-page">
        <div class="upload-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> ЗАГРУЗКА • ФОТО • GIF • МУЗЫКА</div>
        <div class="upload-box" id="uploadFormBox">
          <div class="form-row" style="margin-top:0">
            <label><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> НАЗВАНИЕ</label>
            <input id="upTitle" type="text" placeholder="">
          </div>
          <div class="form-row">
            <label><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> ОПИСАНИЕ + ТАЙМКОДЫ (00:12 интро)</label>
            <textarea id="upDesc" placeholder="Описание... 00:00 начало"></textarea>
          </div>
          <div class="form-row">
            <label><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> ТИП КОНТЕНТА</label>
            <select id="upContentType" style="width:100%;border:var(--border-w) solid var(--border);padding:10px;font-size:13px;">
              <option value="video">▶️ ВИДЕО</option>
              <option value="image">🖼️ ФОТО / КАРТИНКА</option>
              <option value="gif">🎞️ GIF</option>
              <option value="music">♫ МУЗЫКА</option>
            </select>
          </div>

          <div id="dropZone" class="video-drop" style="margin-top:14px;">
            <div style="font-weight:800; font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> ВЫБЕРИ ФАЙЛ • ВИДЕО • ФОТО • GIF • MP3</div>
            <div id="videoFileName" style="margin-top:8px; font-weight:700; font-size:11px;"></div>
          </div>

          <div id="previewSection" class="preview-section" style="display:none">
            <div style="font-size:10px; font-weight:800; text-transform:uppercase; margin-bottom:6px;">ПРЕВЬЮ ИЗ КАДРА</div>
            <div class="preview-video-wrap">
              <video id="sourceVideo" muted playsinline></video>
            </div>
            <div class="frame-controls">
              <input id="frameSlider" class="frame-slider" type="range" min="0" max="100" value="0">
              <button class="btn" style="font-size:10px;min-height:28px;" onclick="app.captureFrame()">КАДР</button>
              <button class="btn" style="font-size:10px;min-height:28px;" onclick="app.captureRandomFrame()">РАНДОМ</button>
            </div>
            <div class="thumb-options">
              <div class="thumb-option" onclick="document.getElementById('customThumbInput').click()">СВОЕ ПРЕВЬЮ</div>
              <div class="thumb-option" onclick="app.useCurrentFrame()">КАДР</div>
            </div>
            <div id="thumbPreview" class="thumb-preview" style="display:none">
              <img id="thumbPreviewImg">
            </div>
            <div id="thumbStatus" style="font-size:10px; color:#71717a; margin-top:6px;">Кадр не выбран</div>
          </div>

          <div id="upError" class="error" style="display:none; margin-top:10px;"></div>
          <button id="upBtn" class="btn btn-primary btn-block" style="margin-top:14px;" onclick="app.doUpload()">ЗАГРУЗИТЬ</button>
          <button class="btn btn-block" style="margin-top:6px;" onclick="app.navigate('home')">ОТМЕНА</button>
        </div>

        <div id="uploadingState" class="uploading-state" style="display:none">
          <div style="font-weight:800; font-size:13px; text-transform:uppercase; margin-bottom:10px;">ЗАГРУЗКА...</div>
          <div class="uploading-bar">
            <div id="upBar" class="uploading-bar-fill"></div>
          </div>
          <div id="uploadingPercent" style="font-family:'JetBrains Mono', monospace; font-size:11px; margin-top:6px;">0%</div>
          
          <div id="uploadPreviewCard" class="video-preview-card" style="display:none">
            <div class="thumb">
              <img id="uploadPreviewThumb" style="display:none">
              <div id="uploadPreviewPlaceholder" class="thumb-placeholder">ЛОЛ ТУБ</div>
            </div>
            <div class="video-info">
              <div id="uploadPreviewTitle" class="video-title">Название</div>
              <div style="font-size:11px; color:#71717a; margin-top:4px;">Так будет выглядеть</div>
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
        if (file) this.handleVideoFile(file);
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
    const type = document.getElementById('upContentType')?.value || 'video';
    let accept = 'video/*';
    if (type==='image') accept='image/*';
    else if (type==='gif') accept='image/gif';
    else if (type==='music') accept='audio/*';
    else accept='video/*,image/*,audio/*';
    const input = document.createElement('input');
    input.type='file';
    input.accept=accept;
    input.onchange = e => {
      const file = e.target.files[0];
      if (file) this.handleVideoFile(file);
    };
    input.click();
  },

  handleVideoFile(file) {
    selectedVideoFile = file;
    const nameEl = document.getElementById('videoFileName');
    if (nameEl) nameEl.textContent = `${file.name} (${(file.size/1024/1024).toFixed(1)} MB) • ${file.type}`;
    const dz = document.getElementById('dropZone');
    if (dz) dz.classList.add('has-file');
    const previewSection = document.getElementById('previewSection');
    if (previewSection && file.type.startsWith('video/')) {
      previewSection.style.display='block';
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
      if (status) status.textContent = `Кадр: ${video.currentTime.toFixed(1)}с`;
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
    const typeEl = document.getElementById('upContentType');
    const title = titleEl ? titleEl.value.trim() : '';
    const desc = descEl ? descEl.value.trim() : '';
    const contentType = typeEl ? typeEl.value : 'video';
    const errEl = document.getElementById('upError');
    const formBox = document.getElementById('uploadFormBox');
    const uploadingState = document.getElementById('uploadingState');
    const bar = document.getElementById('upBar');
    const percentEl = document.getElementById('uploadingPercent');
    const previewCard = document.getElementById('uploadPreviewCard');
    const previewTitle = document.getElementById('uploadPreviewTitle');
    const previewThumb = document.getElementById('uploadPreviewThumb');
    const previewPlaceholder = document.getElementById('uploadPreviewPlaceholder');

    if (!selectedVideoFile) { errEl.textContent='Выбери файл'; errEl.style.display='block'; return; }
    if (!title || !title.trim()) { errEl.textContent='Введи название'; errEl.style.display='block'; return; }

    if (!selectedThumbFile && contentType==='video') {
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
    form.append('contentType', contentType);

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
      showIsland('ЗАГРУЖЕНО!', 'violet');
      this.navigate('watch', {id: data.id});
    } catch (e) {
      if (e.message === 'Нет токена' || e.message === 'Невалидный токен') {
        clearToken();
        currentUser=null;
        this.showLogin();
        return;
      }
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

    const authorAvatar = video.authorAvatar ? (video.authorAvatar.startsWith('http') ? video.authorAvatar : apiUrl(video.authorAvatar)) : null;
    const isImage = video.contentType==='image' || video.contentType==='gif';
    const isMusic = video.contentType==='music';
    const videoSrc = this.getFileUrl(video.cloudinaryUrl || video.filename);
    const thumbSrc = this.getFileUrl(video.cloudinaryThumbUrl || video.thumbnail);

    // Parse chapters for clickable
    let descHtml = this.esc(video.description||'');
    if (video.chapters && video.chapters.length) {
      video.chapters.forEach(ch => {
        const regex = new RegExp(this.escapeRegExp(ch.raw), 'g');
        descHtml = descHtml.replace(regex, `<span class="chapter-link" onclick="app.seekTo(${ch.time})" style="background:var(--violet);color:white;padding:1px 4px;cursor:pointer;font-weight:800;">${this.esc(ch.raw)}</span>`);
      });
    }
    // tags
    const tagsHtml = video.tags && video.tags.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">${video.tags.map(t=>`<span style="background:var(--violet-pale);border:var(--border-w) solid var(--violet);padding:2px 6px;font-size:10px;font-weight:700;cursor:pointer;" onclick="app.searchTag('${t}')">#${this.esc(t)}</span>`).join('')}</div>` : '';

    main.innerHTML = `
      <div class="watch-layout">
        <div>
          <div class="player-root" id="playerRoot">
            ${isImage ? `<img src="${videoSrc}" style="width:100%;height:100%;object-fit:contain;background:black;">` : 
              isMusic ? `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(45deg, #7c3aed, #a78bfa);color:white;"><div style="font-size:48px;">♫</div><div style="font-weight:800;margin-top:8px;">${this.esc(video.title)}</div><audio src="${videoSrc}" controls autoplay style="margin-top:12px;width:90%;"></audio></div>` :
              `<video id="videoEl" src="${videoSrc}" poster="${thumbSrc || ''}" playsinline></video>
            <div class="player-controls">
              <div class="progress-wrap"><input id="progress" type="range" min="0" max="100" value="0"></div>
              <div class="controls-row">
                <button class="ctrl-btn" id="playBtn">▶</button>
                <button class="ctrl-btn" id="rewindBtn">-10</button>
                <button class="ctrl-btn" id="forwardBtn">+10</button>
                <input id="volume" type="range" min="0" max="1" step="0.05" value="1" style="width:50px">
                <select id="speedSelect" style="background:rgba(0,0,0,0.6); color:white; border:1px solid white; padding:2px; font-size:10px;">
                  <option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option>
                </select>
                <button class="ctrl-btn" id="loopBtn" title="Loop">↻</button>
                <button class="ctrl-btn" id="pipBtn" title="PiP">⧉</button>
                <button class="ctrl-btn" id="screenshotBtn" title="Скриншот">◫</button>
                <button class="ctrl-btn" id="fsBtn">⛶</button>
              </div>
            </div>`}
          </div>
          <div class="watch-info">
            <div class="watch-title">${this.esc(video.title)} ${video.contentType!=='video'? `<span style="font-size:10px;background:var(--violet);color:white;padding:2px 4px;">${video.contentType.toUpperCase()}</span>`:''}</div>
            ${tagsHtml}
            ${descHtml ? `<div style="background:rgba(248,247,255,0.9); border:var(--border-w) solid var(--border); padding:10px; font-size:12px; white-space:pre-wrap; margin-bottom:10px;">${descHtml}</div>` : ''}
            ${video.chapters && video.chapters.length ? `<div style="border:var(--border-w) solid var(--border);background:white;padding:8px;margin-bottom:10px;"><div style="font-size:10px;font-weight:800;margin-bottom:6px;">ГЛАВЫ</div>${video.chapters.map(ch=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;cursor:pointer;" onclick="app.seekTo(${ch.time})"><span style="font-size:11px;font-weight:700;">${this.formatTime(ch.time)}</span><span style="font-size:11px;">${this.esc(ch.label)}</span></div>`).join('')}</div>` : ''}
            <div class="author-row" onclick="app.navigate('user', {nickname:'${video.authorNickname}'})">
              <div class="avatar" style="${!authorAvatar ? `background:${video.authorColor}` : ''}">${authorAvatar ? `<img src="${authorAvatar}">` : video.authorNickname[0].toUpperCase()}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:800; font-size:13px;">${this.esc(video.authorNickname)} ${video.authorSubscribers? `• ${video.authorSubscribers} подписчиков`:''}</div>
                <div style="font-size:10px; color:#71717a;">${video.views||0} просмотров • ${this.timeAgo(video.createdAt)} • LVL ${video.authorLevel||1}</div>
              </div>
              <button class="btn ${video.authorIsSubscribed?'btn-primary':''}" style="font-size:10px;min-height:28px;padding:0 8px;" onclick="event.stopPropagation();app.subscribe('${video.authorNickname}')">${video.authorIsSubscribed?'ОТПИСАЛСЯ':'ПОДПИСАТЬСЯ'}</button>
            </div>
            <div class="action-row">
              <button id="likeBtn" class="action-btn violet ${likeStatus.userLiked?'active':''}" onclick="app.toggleLike('${video.id}','like')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${likeStatus.userLiked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2.08C10.5 3.5 9.5 3 7.75 3A5.5 5.5 0 0 0 2.25 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                ${likeStatus.likes}
              </button>
              <button id="dislikeBtn" class="action-btn ${likeStatus.userDisliked?'active':''}" onclick="app.toggleLike('${video.id}','dislike')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                ${likeStatus.dislikes}
              </button>
              <button class="action-btn" onclick="app.toggleFavorite('${video.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                ИЗБРАННОЕ
              </button>
              <button class="action-btn" onclick="app.shareVideo('${video.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                ПОДЕЛИТЬСЯ
              </button>
              <button class="action-btn" onclick="app.downloadVideo('${video.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                СКАЧАТЬ
              </button>
              ${currentUser && (currentUser.id===video.authorId || currentUser.isAdmin) ? `<button class="action-btn" style="background:black; color:white;" onclick="app.deleteVideo('${video.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> УДАЛИТЬ</button>` : ''}
              <button class="action-btn" style="background:#fef2f2;color:#ef4444;" onclick="app.reportVideo('${video.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> ЖАЛОБА</button>
            </div>
          </div>
          <div class="comments">
            <h3>КОММЕНТАРИИ • ${comments.length}</h3>
            <div class="comment-input-row">
              <input id="commentInput" type="text" placeholder="Комментарий..." maxlength="1000" onkeydown="if(event.key==='Enter') app.postComment('${video.id}')">
              <button class="btn btn-primary" style="min-height:36px;padding:0 12px;font-size:11px;" onclick="app.postComment('${video.id}')">ОК</button>
            </div>
            <div id="commentsList">${comments.length ? comments.map(c=>this.commentHtml(c)).join('') : `<div style="font-size:11px; color:#71717a;">Пока нет</div>`}</div>
          </div>
        </div>
        <div>
          <div style="font-size:10px; font-weight:800; text-transform:uppercase; margin-bottom:8px;">ДАЛЕЕ</div>
          <div id="related"></div>
        </div>
      </div>
    `;
    if (!isImage && !isMusic) this.initPlayer();
    try {
      const all = await apiFetch('/api/videos');
      const related = all.filter(v=>v.id!==id).slice(0,6);
      const relEl = document.getElementById('related');
      if (relEl) {
        relEl.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;">${related.map(v=>{
          const t = v.cloudinaryThumbUrl || v.thumbnail ? this.getFileUrl(v.cloudinaryThumbUrl || v.thumbnail) : '';
          return `
          <div class="video-card" onclick="app.navigate('watch', {id:'${v.id}'})">
            <div class="thumb"><img src="${t}" onerror="this.style.display='none'"><div class="thumb-placeholder" style="position:absolute; inset:0; display:${t?'none':'flex'}">ЛОЛ ТУБ</div></div>
            <div class="video-info"><div class="video-title" style="font-size:12px;">${this.esc(v.title)}</div><div style="font-size:10px;color:#71717a;">${v.views||0} 👁</div></div>
          </div>
        `}).join('')}</div>`;
      }
    } catch {}
  },

  commentHtml(c) {
    const av = c.authorAvatar ? apiUrl(c.authorAvatar) : null;
    const isReply = c.replyTo ? `style="margin-left:20px;border-left:2px solid var(--violet);padding-left:8px;"` : '';
    return `<div class="comment" ${isReply}><div class="avatar" style="${!av ? `background:${c.authorColor}; width:28px; height:28px; font-size:10px;` : 'width:28px; height:28px;'}">${av ? `<img src="${av}">` : c.authorNickname[0].toUpperCase()}</div><div style="flex:1;min-width:0;"><div style="display:flex;gap:6px;align-items:center;"><span style="font-weight:800;font-size:11px;">${this.esc(c.authorNickname)}</span><span style="font-size:9px;background:var(--violet);color:white;padding:1px 3px;">LVL ${c.authorLevel||1}</span><span style="font-size:10px;color:#71717a;">${this.timeAgo(c.createdAt)}</span></div><div style="font-size:12px;margin-top:2px;word-break:break-word;">${this.esc(c.text)}</div><div style="display:flex;gap:8px;margin-top:4px;"><span style="font-size:10px;cursor:pointer;color:#71717a;" onclick="app.likeComment('${c.id}')">♥ ${c.likes?.length||0}</span><span style="font-size:10px;cursor:pointer;color:#71717a;" onclick="app.replyComment('${c.id}', '${c.authorNickname}')">ОТВЕТИТЬ</span></div></div></div>`;
  },

  initPlayer() {
    const video = document.getElementById('videoEl');
    const root = document.getElementById('playerRoot');
    const playBtn = document.getElementById('playBtn');
    const progress = document.getElementById('progress');
    const volume = document.getElementById('volume');
    const speed = document.getElementById('speedSelect');
    const loopBtn = document.getElementById('loopBtn');
    const pipBtn = document.getElementById('pipBtn');
    const screenshotBtn = document.getElementById('screenshotBtn');
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
    if (loopBtn) loopBtn.onclick = () => { video.loop = !video.loop; loopBtn.style.background = video.loop ? 'var(--violet)' : ''; showIsland(video.loop ? 'LOOP ВКЛ' : 'LOOP ВЫКЛ', 'violet'); };
    if (pipBtn) pipBtn.onclick = async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch(e){} };
    if (screenshotBtn) screenshotBtn.onclick = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video,0,0);
      const a = document.createElement('a');
      a.download = `loltube-${Date.now()}.png`;
      a.href = canvas.toDataURL();
      a.click();
      showIsland('СКРИНШОТ СОХРАНЕН', 'violet');
    };
    // hotkeys
    document.onkeydown = (e) => {
      if (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return;
      if (e.key===' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
      if (e.key==='ArrowLeft') video.currentTime = Math.max(0, video.currentTime-5);
      if (e.key==='ArrowRight') video.currentTime = Math.min(video.duration, video.currentTime+5);
      if (e.key==='m') video.muted = !video.muted;
      if (e.key==='f') fs?.click();
      if (e.key==='j') video.currentTime = Math.max(0, video.currentTime-10);
      if (e.key==='k') video.paused ? video.play() : video.pause();
      if (e.key==='l') video.currentTime = Math.min(video.duration, video.currentTime+10);
    };
    show(); root.classList.add('paused');
  },
  seekTo(time) {
    const video = document.getElementById('videoEl');
    if (video) video.currentTime = time;
  },
  formatTime(s) {
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = Math.floor(s%60);
    if (h>0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  },
  escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },

  async toggleLike(id, type) {
    try {
      const res = await apiFetch(`/api/videos/${id}/like`, { method:'POST', body: JSON.stringify({ type }) });
      const likeBtn = document.getElementById('likeBtn');
      const dislikeBtn = document.getElementById('dislikeBtn');
      if (likeBtn) likeBtn.innerHTML=`<span class="icon">♥</span> ${res.likes}`;
      if (dislikeBtn) dislikeBtn.innerHTML=`<span class="icon">✕</span> ${res.dislikes}`;
      if (likeBtn) likeBtn.classList.toggle('active', res.userLiked);
      if (dislikeBtn) dislikeBtn.classList.toggle('active', res.userDisliked);
      if (res.userLiked) showIsland('ЛАЙК!', 'violet');
    } catch (e) {
      if (e.message === 'Нет токена' || e.message === 'Невалидный токен') { this.showLogin(); return; }
    }
  },

  async toggleFavorite(id) {
    try {
      const res = await apiFetch(`/api/favorites/${id}`, { method:'POST' });
      showIsland(res.favorited ? 'В ИЗБРАННОЕ' : 'УБРАНО ИЗ ИЗБРАННОГО', 'violet');
    } catch(e){ alert(e.message); }
  },

  async downloadVideo(id) {
    try {
      await apiFetch(`/api/videos/${id}/download`, { method:'POST' });
      const video = await apiFetch(`/api/videos/${id}`);
      const a = document.createElement('a');
      a.href = apiUrl(`/uploads/${video.filename}`);
      a.download = video.originalName || video.filename;
      a.click();
      showIsland('СКАЧИВАНИЕ...', 'violet');
    } catch(e){ alert(e.message); }
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
      showIsland('КОММЕНТ ДОБАВЛЕН', 'violet');
    } catch (e) {
      if (e.message === 'Нет токена' || e.message === 'Невалидный токен') { this.showLogin(); return; }
    }
  },
  async likeComment(id) {
    try { const res = await apiFetch(`/api/comments/${id}/like`, { method:'POST' }); showIsland(`♥ ${res.likes}`, 'violet'); } catch(e){}
  },
  replyComment(id, nick) {
    const input = document.getElementById('commentInput');
    if (input) { input.value = `@${nick} `; input.focus(); input.dataset.replyTo = id; }
  },

  shareVideo(id) {
    const url = `https://grapescript.gitverse.site/loltube/#watch/${id}`;
    const full = `https://grapescript.gitverse.site/loltube/#watch/${id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(full).then(()=>{ showIsland('ССЫЛКА СКОПИРОВАНА', 'violet'); }).catch(()=>{ prompt('Ссылка:', full); });
    } else {
      prompt('Ссылка:', full);
    }
  },
  shareLive() {
    const url = `https://grapescript.gitverse.site/loltube/#live`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(()=>{ showIsland('ССЫЛКА НА ТВ СКОПИРОВАНА', 'violet'); }).catch(()=>{ prompt('Ссылка:', url); });
    } else {
      prompt('Ссылка:', url);
    }
  },

  async reportVideo(id) {
    const reason = prompt('Причина жалобы: спам, оскорбление, другое');
    if (!reason) return;
    try { await apiFetch(`/api/report/${id}`, { method:'POST', body: JSON.stringify({ reason }) }); showIsland('ЖАЛОБА ОТПРАВЛЕНА', 'violet'); } catch(e){ alert(e.message); }
  },

  async deleteVideo(id) {
    if (!confirm('Удалить?')) return;
    try { await apiFetch(`/api/videos/${id}`, { method:'DELETE' }); showIsland('УДАЛЕНО', ''); this.navigate('home'); } catch (e) {
      if (e.message === 'Нет токена') { this.showLogin(); return; }
    }
  },

  async uploadAvatar(file) {
    if (!file) return;
    if (currentUser && currentUser.nickname === 'test_account') {
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
      showIsland('АВАТАРКА ОБНОВЛЕНА', 'violet');
    } catch (e) {
      if (e.message === 'Нет токена') { this.showLogin(); return; }
      alert(e.message);
    }
  },
  async uploadBanner(file) {
    if (!file) return;
    const form = new FormData();
    form.append('banner', file);
    try {
      const res = await apiFetch('/api/me/banner', { method:'POST', body: form });
      currentUser.banner = res.banner;
      this.renderProfile();
      showIsland('БАННЕР ОБНОВЛЕН', 'violet');
    } catch(e){ alert(e.message); }
  },

  async doSearch() {
    const input = document.getElementById('searchInput');
    const q = input ? input.value.trim() : '';
    if (!q) { this.navigate('home'); return; }
    window.location.hash = `search/${encodeURIComponent(q)}`;
    this.router();
  },
  searchTag(tag) {
    const input = document.getElementById('searchInput');
    if (input) input.value = tag;
    this.doSearch();
  },
  async renderSearch(query) {
    const main = document.getElementById('app');
    const q = decodeURIComponent(query||'');
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
    main.innerHTML = `
      <div style="font-size:14px;font-weight:800;margin:10px 0;">ПОИСК: ${this.esc(q)} • ${data.videos.length} видео • ${data.users.length} юзеров</div>
      ${data.users.length ? `<div class="settings-section"><h3>ЮЗЕРЫ</h3>${data.users.map(u=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee;cursor:pointer;" onclick="app.navigate('user', {nickname:'${u.nickname}'})"><div class="avatar">${u.nickname[0].toUpperCase()}</div><div style="flex:1"><div style="font-weight:700;font-size:13px;">${this.esc(u.nickname)}</div><div style="font-size:10px;color:#71717a;">${this.esc(u.bio||'')} • ${u.subscribers} подписчиков</div></div></div>`).join('')}</div>` : ''}
      <div class="video-grid" style="margin-top:12px;">${data.videos.map(v=>this.videoCard(v)).join('') || '<div style="font-size:11px;color:#71717a;">Ничего не найдено</div>'}</div>
    `;
  },

  async renderHistory() {
    const main = document.getElementById('app');
    const videos = await apiFetch('/api/history');
    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0;"><div style="font-size:14px;font-weight:800;">ИСТОРИЯ • ${videos.length}</div><button class="btn" style="font-size:10px;min-height:28px;" onclick="app.clearHistory()">ОЧИСТИТЬ</button></div>
      <div class="video-grid">${videos.map(v=>this.videoCard(v)).join('') || '<div style="font-size:11px;color:#71717a;">Пусто</div>'}</div>
    `;
  },
  async clearHistory() { if(!confirm('Очистить историю?')) return; await apiFetch('/api/history', { method:'DELETE' }); this.renderHistory(); },

  async renderFavorites() {
    const main = document.getElementById('app');
    const videos = await apiFetch('/api/favorites');
    main.innerHTML = `<div style="font-size:14px;font-weight:800;margin:10px 0;">ИЗБРАННОЕ • ${videos.length}</div><div class="video-grid">${videos.map(v=>this.videoCard(v)).join('') || '<div style="font-size:11px;color:#71717a;">Пусто</div>'}</div>`;
  },

  async renderPlaylists() {
    const main = document.getElementById('app');
    const pls = await apiFetch('/api/playlists');
    main.innerHTML = `
      <div style="font-size:14px;font-weight:800;margin:10px 0;">ПЛЕЙЛИСТЫ • ${pls.length}</div>
      <div class="settings-section">
        <h3>СОЗДАТЬ ПЛЕЙЛИСТ</h3>
        <div style="display:flex;gap:6px;"><input id="plTitle" type="text" placeholder="Название" style="flex:1;border:var(--border-w) solid var(--border);padding:8px;"><button class="btn btn-primary" style="font-size:10px;" onclick="app.createPlaylist()">СОЗДАТЬ</button></div>
      </div>
      <div style="margin-top:12px;">${pls.map(p=>`<div style="border:var(--border-w) solid var(--border);background:white;padding:10px;margin-bottom:8px;"><div style="font-weight:800;font-size:13px;">${this.esc(p.title)} • ${p.videos.length} видео</div><div style="font-size:10px;color:#71717a;">${this.esc(p.description||'')} • ${p.isPublic?'Публичный':'Приватный'}</div><button class="btn" style="margin-top:6px;font-size:10px;min-height:28px;" onclick="app.deletePlaylist('${p.id}')">УДАЛИТЬ</button></div>`).join('') || '<div style="font-size:11px;color:#71717a;margin-top:8px;">Нет плейлистов</div>'}</div>
    `;
  },
  async createPlaylist() {
    const title = document.getElementById('plTitle')?.value.trim();
    if (!title) return;
    try { await apiFetch('/api/playlists', { method:'POST', body: JSON.stringify({ title }) }); showIsland('ПЛЕЙЛИСТ СОЗДАН', 'violet'); this.renderPlaylists(); } catch(e){ alert(e.message); }
  },
  async deletePlaylist(id) { if(!confirm('Удалить плейлист?')) return; await apiFetch(`/api/playlists/${id}`, { method:'DELETE' }); this.renderPlaylists(); },

  async renderAdmin() {
    const main = document.getElementById('app');
    if (!currentUser?.isAdmin) { main.innerHTML = `<div class="empty"><h2>Только админ</h2></div>`; return; }
    const stats = await apiFetch('/api/admin/stats');
    const users = await apiFetch('/api/admin/users');
    main.innerHTML = `
      <div style="font-size:18px;font-weight:800;margin:12px 0;">АДМИН ПАНЕЛЬ • MAX ВОЗМОЖНОСТЕЙ</div>
      <div class="settings-section">
        <h3>СТАТИСТИКА</h3>
        <div style="font-size:11px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div>Юзеров: ${stats.users}</div><div>Видео: ${stats.videos}</div>
          <div>Комментов: ${stats.comments}</div><div>Плейлистов: ${stats.playlists}</div>
          <div>Жалоб: ${stats.reports}</div><div>Live: ${stats.live.isLive?'ON':'OFF'}</div>
          <div>Файлов: ${stats.storage.uploads}</div><div>Аватарок: ${stats.storage.avatars}</div>
        </div>
      </div>
      <div class="settings-section" style="margin-top:12px;">
        <h3>ЮЗЕРЫ (${users.length})</h3>
        <div style="max-height:300px;overflow-y:auto;">
          ${users.map(u=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee;font-size:11px;"><span>${this.esc(u.nickname)} ${u.isAdmin?'[ADMIN]':''} LVL${u.level} • ${u.videos} видео</span><button class="btn" style="font-size:9px;min-height:24px;padding:0 6px;" onclick="app.adminDeleteUser('${u.id}')">УДАЛИТЬ</button></div>`).join('')}
        </div>
      </div>
      <div class="settings-section" style="margin-top:12px;">
        <h3>БЫСТРЫЕ ДЕЙСТВИЯ</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn" style="font-size:10px;" onclick="app.navigate('live')">ТВ-ФАНТОМАС</button>
          <button class="btn" style="font-size:10px;" onclick="alert('Очистка кэша - TODO')">ОЧИСТИТЬ КЭШ</button>
          <button class="btn" style="font-size:10px;" onclick="alert('Бэкап - TODO')">БЭКАП БД</button>
        </div>
      </div>
    `;
  },
  async adminDeleteUser(id) { if(!confirm('Удалить юзера?')) return; try { await apiFetch(`/api/admin/users/${id}`, { method:'DELETE' }); showIsland('ЮЗЕР УДАЛЕН', ''); this.renderAdmin(); } catch(e){ alert(e.message); } },

  esc(s) { return (s||'').replace(/[&<>\"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); },
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
