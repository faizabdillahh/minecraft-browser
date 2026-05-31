# Minecraft Browser Clone

Sebuah game browser berbasis voxel (Minecraft-like) yang dirender sepenuhnya menggunakan raycasting 3D murni di atas Canvas 2D. Proyek ini dibangun tanpa alat *build* tambahan (seperti Webpack atau Vite) dan sepenuhnya menggunakan native ES Modules (ESM).

## Persyaratan Browser
- **Google Chrome:** Versi 125 atau lebih baru.
- **Mozilla Firefox:** Versi 128 atau lebih baru.
- Membutuhkan dukungan ECMAScript 2026 (termasuk top-level await, native ESM, dan fitur-fitur modern lainnya).

## Cara Menjalankan

Karena proyek ini menggunakan ES Modules (`<script type="module">`), Anda perlu menyajikannya melalui HTTP server lokal untuk menghindari isu CORS. 

1. **Menggunakan Python 3:**
   ```bash
   python -m http.server 8000
   ```
   Lalu buka `http://localhost:8000` di browser Anda.

2. **Menggunakan Node.js / NPX:**
   ```bash
   npx serve .
   ```

3. **Menggunakan VS Code:**
   Instal ekstensi **Live Server**, klik kanan pada `index.html` dan pilih "Open with Live Server".

## Daftar Kontrol
- **W, A, S, D** - Berjalan (Maju, Kiri, Mundur, Kanan)
- **Space** - Melompat
- **Mouse Move** - Melihat sekeliling (menggunakan Pointer Lock API)
- **Klik Kiri** - Menghancurkan blok
- **Klik Kanan** - Meletakkan blok
- **Scroll Mouse / Angka 1-9** - Mengganti blok aktif di inventory (hotbar)
- **F3** - Menampilkan/Menyembunyikan Debug Screen (FPS, Koordinat, Chunk Data)

## Daftar Blok Tersedia
1. **Dirt** (Tanah)
2. **Grass** (Rumput)
3. **Stone** (Batu)
4. **Wood** (Kayu)
5. **Leaves** (Daun)
6. **Sand** (Pasir)
7. **Water** (Air - dengan transparansi)
8. **Glass** (Kaca)

## Struktur Direktori

```text
minecraft-browser/
├── index.html       # Struktur dasar HTML dan canvas container
├── css/             
│   ├── reset.css    # Modern CSS reset
│   ├── base.css     # CSS variables (colors, fonts, etc) dan gaya body
│   ├── layout.css   # Penataan canvas dan lapisan UI agar responsive
│   └── hud.css      # Gaya untuk crosshair, hotbar, dan debug menu (F3)
├── js/
│   ├── main.js      # Entry point aplikasi, inisialisasi game loop dan sinkronisasi modul
│   ├── constants.js # Global settings (CHUNK_SIZE, resolusi, daftar blok)
│   ├── input.js     # Menangani state keyboard, mouse, dan pointer lock API
│   ├── player.js    # Logika entitas pemain (posisi, fisika, kamera, hitbox)
│   ├── world.js     # Manajemen Voxel/Chunk, getter/setter blok dengan typed arrays
│   ├── worldgen.js  # Generator terrain prosedural (berbasis noise/simplex)
│   ├── renderer.js  # Mesin raycasting 3D DDA untuk Canvas 2D
│   ├── textures.js  # Memuat dan mengelola data warna blok / procedural textures
│   ├── hud.js       # Logika update elemen antarmuka DOM (hotbar, health, F3)
│   └── audio.js     # Manajer sfx/BGM (footsteps, place/break block)
└── README.md        # File dokumentasi ini
```