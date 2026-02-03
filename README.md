# 🎵 bariscb Spotify Playlist Editor

Spotify playlistlerini genre'lara göre ayır, albüme göre sırala, dilediğin gibi düzenle!

[![GitHub](https://img.shields.io/github/license/byigitt/spotify-playlist-editor?style=for-the-badge)](https://github.com/byigitt/spotify-playlist-editor/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/byigitt/spotify-playlist-editor?style=for-the-badge)](https://github.com/byigitt/spotify-playlist-editor/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/byigitt/spotify-playlist-editor?style=for-the-badge)](https://github.com/byigitt/spotify-playlist-editor/issues)

![Spotify Playlist Organizer](https://img.shields.io/badge/Spotify-1DB954?style=for-the-badge&logo=spotify&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

## ✨ Özellikler

- 🔐 **Spotify OAuth Giriş** - Güvenli Spotify hesap bağlantısı
- 🎸 **Genre'lara Göre Ayırma** - Şarkıları otomatik olarak türlerine göre ayır
- 💿 **Albüme Göre Sıralama** - Şarkıları albümlerine göre grupla
- 📅 **Yayın Tarihine Göre Sıralama** - Eski veya yeni şarkıları öne çıkar
- ⭐ **Popülerlik Sıralaması** - En popüler şarkıları bul
- 🔄 **Playlist Yeniden Düzenleme** - Mevcut playlist'i yeniden sırala
- ➕ **Yeni Playlist Oluşturma** - Sıralanmış şarkılarla yeni playlist yap
- 🎯 **Genre'lara Göre Otomatik Playlist** - Her genre için ayrı playlist oluştur

## 🛠️ Teknolojiler

### Frontend
- React 18
- TypeScript
- Vite
- Lucide React (İkonlar)
- Context API

### Backend
- Bun
- Express
- spotify-web-api-node

## 🚀 Kurulum

### 1. Spotify Developer Uygulaması Oluştur

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)'a git
2. "Create App" ile yeni uygulama oluştur
3. Redirect URI olarak `http://127.0.0.1:3001/api/auth/callback` ekle (**localhost değil 127.0.0.1!**)
4. Client ID ve Client Secret'ı kopyala

### 2. Projeyi Kur

```bash
# Bağımlılıkları yükle
bun run install:all

# Server .env dosyasını düzenle
# server/.env dosyasına Spotify bilgilerini gir
```

### 3. Environment Değişkenleri

`server/.env` dosyasını düzenle:

```env
SPOTIFY_CLIENT_ID=buraya_client_id
SPOTIFY_CLIENT_SECRET=buraya_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/callback
CLIENT_URL=http://127.0.0.1:5173
PORT=3001
```

### 4. Çalıştır

```bash
# Her iki servisi de başlat
bun run dev
```

Veya ayrı ayrı:

```bash
# Backend (Terminal 1)
cd server && bun run dev

# Frontend (Terminal 2)
cd client && bun run dev
```

Uygulama şurada çalışacak: http://127.0.0.1:5173

## 📖 Kullanım

1. **Giriş Yap** - "Spotify ile Giriş Yap" butonuna tıkla
2. **Playlist Seç** - Sol panelden bir playlist seç
3. **Sırala** - Sıralama seçeneklerini kullan (genre, albüm, tarih vs.)
4. **Grupla** - Genre veya albüme göre grupla
5. **Aksiyonlar**:
   - 🔄 **Yeniden Sırala** - Mevcut playlist'i sıralanmış haliyle güncelle
   - ➕ **Yeni Playlist** - Sıralanmış şarkılarla yeni playlist oluştur
   - 🎸 **Genre'lara Ayır** - Her genre için ayrı playlist oluştur

## 🔒 İzinler

Uygulama şu Spotify izinlerini kullanır:

- `user-read-private` - Kullanıcı bilgileri
- `user-read-email` - E-posta
- `playlist-read-private` - Özel playlistleri okuma
- `playlist-read-collaborative` - Ortak playlistleri okuma
- `playlist-modify-public` - Public playlistleri düzenleme
- `playlist-modify-private` - Özel playlistleri düzenleme

## 📁 Proje Yapısı

```
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/     # React Componentleri
│   │   ├── context/        # Auth Context
│   │   ├── hooks/          # Custom Hooks
│   │   ├── services/       # API Service
│   │   └── types/          # TypeScript Types
│   └── vite.config.ts
│
├── server/                 # Express Backend (Bun)
│   └── src/
│       └── index.ts        # API Routes
│
└── package.json            # Root Package
```

## 🤝 Katkıda Bulunma

Pull request'ler kabul edilir! Büyük değişiklikler için önce issue açınız.

## 📜 Lisans

MIT
