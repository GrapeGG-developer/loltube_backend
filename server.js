const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'loltube-secret-violet-2024-v2';
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const THUMBS_DIR = path.join(__dirname, 'uploads', 'thumbs');
const AVATARS_DIR = path.join(__dirname, 'uploads', 'avatars');

[DATA_DIR, UPLOADS_DIR, THUMBS_DIR, AVATARS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const DB_PATH = path.join(DATA_DIR, 'db.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const init = { users: [], videos: [], comments: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!data.users) data.users = [];
    if (!data.videos) data.videos = [];
    if (!data.comments) data.comments = [];
    return data;
  } catch {
    return { users: [], videos: [], comments: [] };
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let db = loadDB();

// CORS for GitHub Pages + local
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'thumbnail') cb(null, THUMBS_DIR);
    else if (file.fieldname === 'avatar') cb(null, AVATARS_DIR);
    else cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({
  storage,
  // Убрано ограничение 500MB - теперь без лимита
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video' && !file.mimetype.startsWith('video/')) return cb(new Error('Только видео'));
    if ((file.fieldname === 'thumbnail' || file.fieldname === 'avatar') && !file.mimetype.startsWith('image/')) return cb(new Error('Только картинки'));
    cb(null, true);
  }
});

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Нет токена' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Невалидный токен' });
  }
}

function isNumericPin(pw) {
  return /^\d{3}$/.test(pw);
}

// Login only, auto-create if not exists, пин только 3 цифры
app.post('/api/login', async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) return res.status(400).json({ error: 'Ник и пин обязательны' });
  const cleanNick = nickname.trim();
  if (cleanNick.length < 2 || cleanNick.length > 20) return res.status(400).json({ error: 'Ник 2-20 символов' });
  if (!/^[a-zA-Z0-9_]+$/.test(cleanNick)) return res.status(400).json({ error: 'Ник: только латиница, цифры, _' });
  if (!isNumericPin(password)) return res.status(400).json({ error: 'Пин только 3 цифры' });

  db = loadDB();
  let user = db.users.find(u => u.nickname.toLowerCase() === cleanNick.toLowerCase());

  if (!user) {
    // Auto-create - вход = регистрация
    const hash = await bcrypt.hash(password, 10);
    user = {
      id: uuidv4(),
      nickname: cleanNick,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
      avatarColor: `hsl(${Math.floor(Math.random()*40+250)}, 85%, 60%)`,
      avatar: null
    };
    db.users.push(user);
    saveDB(db);
  } else {
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Неверный пинкод' });
  }

  const token = jwt.sign({ id: user.id, nickname: user.nickname }, JWT_SECRET, { expiresIn: '60d' });
  res.json({ 
    token, 
    user: { 
      id: user.id, 
      nickname: user.nickname, 
      avatarColor: user.avatarColor,
      avatar: user.avatar ? `/uploads/avatars/${user.avatar}` : null
    } 
  });
});

// Скрытый тестовый аккаунт - вход по кодовому символу "1"
app.post('/api/test-login', async (req, res) => {
  const { code } = req.body;
  if (code !== '1') return res.status(400).json({ error: 'Неверный код' });

  db = loadDB();
  const testNick = 'test_account';
  let user = db.users.find(u => u.nickname === testNick);

  if (!user) {
    const hash = await bcrypt.hash('000', 10);
    user = {
      id: uuidv4(),
      nickname: testNick,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
      avatarColor: '#000000',
      avatar: null,
      isTest: true
    };
    db.users.push(user);
    saveDB(db);
  }

  const token = jwt.sign({ id: user.id, nickname: user.nickname }, JWT_SECRET, { expiresIn: '60d' });
  res.json({
    token,
    user: {
      id: user.id,
      nickname: user.nickname,
      avatarColor: user.avatarColor,
      avatar: user.avatar ? `/uploads/avatars/${user.avatar}` : null
    }
  });
});

// Keep register for compatibility, but it does same as login
app.post('/api/register', async (req, res) => {
  return res.redirect(307, '/api/login');
});

app.get('/api/me', authMiddleware, (req, res) => {
  db = loadDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  res.json({ 
    id: user.id, 
    nickname: user.nickname, 
    avatarColor: user.avatarColor,
    avatar: user.avatar ? `/uploads/avatars/${user.avatar}` : null,
    createdAt: user.createdAt
  });
});

// Upload avatar - с ограничением для тестового аккаунта
app.post('/api/me/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  db = loadDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Не найден' });

  // Тестовый аккаунт не может менять аватарку
  if (user.nickname === 'test_account') {
    try { fs.unlinkSync(path.join(AVATARS_DIR, req.file.filename)); } catch {}
    return res.status(403).json({ error: 'Тестовый аккаунт не может менять аватарку' });
  }

  // delete old
  if (user.avatar) {
    try { fs.unlinkSync(path.join(AVATARS_DIR, user.avatar)); } catch {}
  }
  user.avatar = req.file.filename;
  saveDB(db);
  res.json({ avatar: `/uploads/avatars/${user.avatar}` });
});

// Videos list - no search anymore, just feed
app.get('/api/videos', (req, res) => {
  db = loadDB();
  let videos = [...db.videos].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  videos = videos.map(v => {
    const author = db.users.find(u => u.id === v.authorId);
    return { 
      ...v, 
      authorColor: author?.avatarColor || '#7c3aed',
      authorAvatar: author?.avatar ? `/uploads/avatars/${author.avatar}` : null
    };
  });
  res.json(videos);
});

app.get('/api/videos/:id', (req, res) => {
  db = loadDB();
  const video = db.videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Видео не найдено' });
  video.views = (video.views || 0) + 1;
  saveDB(db);
  const author = db.users.find(u => u.id === video.authorId);
  res.json({ 
    ...video, 
    authorColor: author?.avatarColor || '#7c3aed',
    authorAvatar: author?.avatar ? `/uploads/avatars/${author.avatar}` : null
  });
});

app.get('/api/users/:nickname/videos', (req, res) => {
  db = loadDB();
  const user = db.users.find(u => u.nickname.toLowerCase() === req.params.nickname.toLowerCase());
  if (!user) return res.status(404).json({ error: 'Юзер не найден' });
  const videos = db.videos.filter(v => v.authorId === user.id).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  res.json({ 
    user: { 
      id: user.id, 
      nickname: user.nickname, 
      avatarColor: user.avatarColor,
      avatar: user.avatar ? `/uploads/avatars/${user.avatar}` : null
    }, 
    videos 
  });
});

app.post('/api/videos/upload', authMiddleware, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), (req, res) => {
  const { title, description } = req.body;

  db = loadDB();
  const currentUser = db.users.find(u => u.id === req.user.id);
  if (!currentUser) return res.status(404).json({ error: 'Не найден' });
  // Тестовый аккаунт не может загружать видео
  if (currentUser.nickname === 'test_account') {
    if (req.files) {
      try { if (req.files.video) fs.unlinkSync(path.join(UPLOADS_DIR, req.files.video[0].filename)); } catch {}
      try { if (req.files.thumbnail) fs.unlinkSync(path.join(THUMBS_DIR, req.files.thumbnail[0].filename)); } catch {}
    }
    return res.status(403).json({ error: 'Тестовый аккаунт не может загружать видео' });
  }

  // Убрано ограничение по названию - любое
  if (!title || !title.trim()) return res.status(400).json({ error: 'Название обязательно' });
  if (!req.files || !req.files.video) return res.status(400).json({ error: 'Видео файл обязателен' });

  const videoFile = req.files.video[0];
  const thumbFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

  const newVideo = {
    id: uuidv4(),
    title: title.trim(),
    description: (description || '').trim(),
    filename: videoFile.filename,
    originalName: videoFile.originalname,
    size: videoFile.size,
    thumbnail: thumbFile ? `thumbs/${thumbFile.filename}` : null,
    authorId: req.user.id,
    authorNickname: req.user.nickname,
    createdAt: new Date().toISOString(),
    views: 0,
    likes: [],
    dislikes: []
  };
  db.videos.push(newVideo);
  saveDB(db);
  res.json(newVideo);
});

app.post('/api/videos/:id/like', authMiddleware, (req, res) => {
  db = loadDB();
  const video = db.videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Видео не найдено' });
  const userId = req.user.id;
  const type = req.body.type || 'like';
  video.likes = (video.likes || []).filter(id => id !== userId);
  video.dislikes = (video.dislikes || []).filter(id => id !== userId);
  if (type === 'like') video.likes.push(userId);
  else if (type === 'dislike') video.dislikes.push(userId);
  saveDB(db);
  res.json({ likes: video.likes.length, dislikes: video.dislikes.length, userLiked: video.likes.includes(userId), userDisliked: video.dislikes.includes(userId) });
});

app.get('/api/videos/:id/like-status', authMiddleware, (req, res) => {
  db = loadDB();
  const video = db.videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Видео не найдено' });
  const userId = req.user.id;
  res.json({
    likes: (video.likes||[]).length,
    dislikes: (video.dislikes||[]).length,
    userLiked: (video.likes||[]).includes(userId),
    userDisliked: (video.dislikes||[]).includes(userId)
  });
});

app.get('/api/videos/:id/comments', (req, res) => {
  db = loadDB();
  const comments = db.comments.filter(c => c.videoId === req.params.id).sort((a,b)=> new Date(a.createdAt)-new Date(b.createdAt));
  const enriched = comments.map(c => {
    const author = db.users.find(u => u.id === c.authorId);
    return { ...c, authorColor: author?.avatarColor || '#7c3aed', authorAvatar: author?.avatar ? `/uploads/avatars/${author.avatar}` : null };
  });
  res.json(enriched);
});

app.post('/api/videos/:id/comments', authMiddleware, (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length < 1) return res.status(400).json({ error: 'Пусто' });
  if (text.length > 1000) return res.status(400).json({ error: 'Макс 1000' });
  db = loadDB();
  const video = db.videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Видео не найдено' });
  const comment = {
    id: uuidv4(),
    videoId: req.params.id,
    authorId: req.user.id,
    authorNickname: req.user.nickname,
    text: text.trim(),
    createdAt: new Date().toISOString()
  };
  db.comments.push(comment);
  saveDB(db);
  const author = db.users.find(u => u.id === comment.authorId);
  res.json({ ...comment, authorColor: author?.avatarColor, authorAvatar: author?.avatar ? `/uploads/avatars/${author.avatar}` : null });
});

app.delete('/api/videos/:id', authMiddleware, (req, res) => {
  db = loadDB();
  const idx = db.videos.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  if (db.videos[idx].authorId !== req.user.id) return res.status(403).json({ error: 'Не твое' });
  const vid = db.videos[idx];
  try { fs.unlinkSync(path.join(UPLOADS_DIR, vid.filename)); } catch {}
  if (vid.thumbnail) try { fs.unlinkSync(path.join(UPLOADS_DIR, vid.thumbnail)); } catch {}
  db.videos.splice(idx,1);
  db.comments = db.comments.filter(c => c.videoId !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// Config endpoint for GitHub Pages frontend to know backend URL
app.get('/api/config', (req, res) => {
  res.json({ 
    name: 'LolTube',
    version: '2.0',
    developer: 'https://grapegg-developer.github.io/RoboBattle-Web/'
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LolTube v2 running on http://0.0.0.0:${PORT}`);
  console.log(`For GitHub Pages, set API base to your local IP, e.g. http://YOUR_LOCAL_IP:${PORT}`);
});
