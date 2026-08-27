# CITRA

Studio AI generator gambar & video, berjalan 100% di browser — tanpa API key, tanpa backend. Ditenagai [Puter.js](https://docs.puter.com/) dengan model user-pays: pengguna memakai kredit Puter-nya sendiri.

## Fitur

### Gambar (`puter.ai.txt2img`)
- Prompt bebas + 8 preset gaya (fotorealistis, anime, cat air, 3D render, pixel art, batik nusantara, cyberpunk, minimalis)
- Pilihan model: default (gratis) atau GPT Image 1 Mini / 1 / 1.5 / 2
- 5 rasio aspek (1:1, 3:2, 2:3, 16:9, 9:16)
- Seed untuk reproduksi, steps, negative prompt
- Galeri sesi, unduh PNG, salin prompt, shortcut Ctrl+Enter

### Video dari gambar (`puter.ai.txt2vid`)
- Tombol "Buat Video" muncul setelah gambar tergenerate
- Model: Sora 2 / Sora 2 Pro / Veo 2.0 / Veo 3.0 / Veo 3.1
- Durasi & resolusi otomatis menyesuaikan kemampuan model
- Gambar hasil dikirim sebagai `input_reference` (frame pertama, image-to-video)
- Unduh MP4

### Lainnya
- Autentikasi Puter (masuk/keluar, tampil username)
- Tema editorial gelap: Fraunces + IBM Plex Mono, aksen chartreuse & ember
- Handling error yang ramah (toast) dan loading state yang jelas

## Menjalankan

Sajikan lewat web server apa pun (Puter.js tidak mendukung `file:///`):

```bash
python3 -m http.server 8000
# atau
npx serve .
```

Buka `http://localhost:8000`. Untuk generate nyata, klik **Masuk dengan Puter** — akun gratis. Permintaan disetujui Puter langsung dari frontend; tidak ada server milik kita yang terlibat.

## Struktur

| File | Isi |
|---|---|
| `index.html` | Markup & kontrol |
| `style.css` | Tema & layout |
| `app.js` | Logika txt2img/txt2vid, auth, galeri |

## Dokumen API relevan

- [txt2img](https://docs.puter.com/AI/txt2img)
- [txt2vid](https://docs.puter.com/AI/txt2vid)
- [Auth](https://docs.puter.com/Auth)

## Lisensi

[MIT](LICENSE) © antono4
