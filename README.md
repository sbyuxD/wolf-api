README.md

# ⚡ sbyuxD — Modular REST API Engine

<p align="center">
  <img src="src/media/ZEPH.jpg" alt="Logo" width="120" style="border-radius: 16px;" />
</p>

<p align="center">
  <strong>Engine REST API modern, ultra-ringan, hemat RAM, full native ESM, dilengkapi Hot-Reload Chokidar, Auto-Router, dan UI Playground interaktif.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18%2B-ea580c?style=flat-square&logo=node.js" alt="Node Version" />
  <img src="https://img.shields.io/badge/Module-ESM-1a1816?style=flat-square" alt="ESM" />
  <img src="https://img.shields.io/badge/Deployment-Vercel%20Ready-black?style=flat-square&logo=vercel" alt="Vercel" />
  <img src="https://img.shields.io/badge/Author-sbyuxD-ea580c?style=flat-square" alt="Author" />
</p>

---

## 🌟 Fitur Utama

- 🧩 **Modular Plugin Architecture**: Cukup buat 1 file di dalam folder kategori, endpoint otomatis terdaftar menjadi `/<kategori>/<nama-file>`.
- 🔥 **Chokidar Hot-Reload**: Ubah kode atau tambah plugin baru tanpa perlu restart server Node.js.
- ⚡ **On-Demand Route Loader**: Rute baru langsung dikenali secara instan bahkan di environment serverless seperti Vercel.
- 🛡️ **Auto Parameter Validator**: Validasi query & body otomatis berdasarkan schema tanpa perlu menulis `if (!param)` berulang kali.
- 💾 **Built-in TTL Cache**: Cache memori sementara per-plugin untuk menghemat kuota dan memangkas waktu response hingga 0–5ms.
- 🌐 **Anti-Crash Safe Fetch**: Fetcher bawaan dengan rotasi browser User-Agent dan timeout otomatis agar server tidak hang saat scraping.
- 🖥️ **Interactive 3D Terminal UI**: Tampilan web modern bertema *Warm Charcoal & Orange* lengkap dengan terminal scanner, touch ripple effect, dan live tester modal.
- ☁️ **Full Vercel Serverless Ready**: Konfigurasi siap deploy ke Vercel hanya dengan sekali push.

---

## 📁 Struktur Proyek

```text
rest-api/
├── api/
│   └── index.js             # Entry point untuk Vercel Serverless
├── public/
│   └── index.html           # Single Page UI & Interactive Tester
├── src/
│   ├── media/
│   │   └── ZEPH.jpg         # Asset logo & thumbnail OpenGraph
│   ├── plugins/             # Direktori semua endpoint API
│   │   ├── downloader/
│   │   │   ├── capcut.js
│   │   │   ├── instagram.js
│   │   │   ├── tiktok.js
│   │   │   └── youtube.js
│   │   ├── info/
│   │   │   └── gempa.js
│   │   ├── search/
│   │   │   ├── pinterest.js
│   │   │   └── ytsearch.js
│   │   └── tools/
│   │       └── ping.js
│   ├── app.js               # Express application & dynamic route dispatcher
│   └── function.js          # Core engine (Loader, Watcher, Cache, Validator, Response)
├── .gitignore
├── index.js                 # Runner lokal (VPS / Dev Server)
├── package.json
└── vercel.json              # Konfigurasi bundling & routing Vercel

🚀 Panduan Memulai

1. Prasyarat

  - Node.js versi 18.0.0 atau lebih baru.
  - npm atau pnpm / yarn.

2. Instalasi

Clone repository dan install dependensi:

git clone https://github.com/username/rest-api.git
cd rest-api
npm install

3. Menjalankan di Lokal (Development)

Jalankan server lokal dengan fitur Hot-Reload aktif:

npm run dev

Server akan aktif di:

http://localhost:3000

📝 Format Penulisan Plugin (Endpoint)

Untuk membuat endpoint baru, buat file .js di dalam folder
src/plugins/<kategori>/<nama-fitur>.js.

Template Standar:

export default {
  name: "Nama Endpoint",
  category: "downloader",
  description: "Penjelasan fungsi endpoint ini",
  method: ["GET", "POST"],
  cache: 60, // Opsional: cache response dalam detik (khusus GET)
  params: {
    url: {
      type: "string",
      required: true,
      description: "URL target yang ingin diproses"
    }
  },
  execute: async (req, res) => {
    const url = req.query.url || req.body?.url;

    // Logika proses / scraping
    return {
      title: "Contoh Result",
      target_url: url
    };
  }
};

Mapping URL Otomatis:

| Lokasi File                        | Method     | URL Path             |
| :--------------------------------- | :--------- | :------------------- |
| `src/plugins/downloader/tiktok.js` | GET / POST | `/downloader/tiktok` |
| `src/plugins/search/pinterest.js`  | GET / POST | `/search/pinterest`  |
| `src/plugins/info/gempa.js`        | GET        | `/info/gempa`        |

📦 Format Output JSON Standar

Semua response distandarisasi secara otomatis:

Success Response (200 OK)

{
  "status": true,
  "creator": "sbyuxD",
  "result": {
    "title": "Sample Result Data",
    "download_url": "https://..."
  }
}

Error Response (400 / 404 / 500)

{
  "status": false,
  "creator": "sbyuxD",
  "message": "Parameter 'url' wajib diisi (URL target yang ingin diproses)"
}

☁️ Panduan Deploy ke Vercel

Project ini sudah terkonfigurasi dengan vercel.json dan folder api/index.js.

Cara 1: Menggunakan Vercel CLI

npm i -g vercel
vercel

Cara 2: Melalui Dashboard GitHub

1.  Push repository ke akun GitHub kamu.
2.  Buka dashboard Vercel dan pilih Add New Project.
3.  Import repository tersebut dan klik Deploy.
4.  Semua file di dalam src/plugins akan otomatis di-bundle oleh Vercel.

🛠️ Built-in Helper di src/function.js

Saat membuat scraper atau integrasi API luar, kamu bisa langsung memanfaatkan
utility internal:

import { safeFetch, getCache, setCache } from "../../function.js";

// Fetch dengan proteksi timeout & auto User-Agent browser
const response = await safeFetch("https://api.example.com/data", {
  headers: { "Authorization": "Bearer ..." }
}, 15000);

const json = await response.json();

👤 Author

  - Creator: sbyuxD
  - Architecture: Node.js ESM Dynamic Plugin Engine