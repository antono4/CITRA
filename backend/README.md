# CITRA Podcast Backend

Backend FastAPI untuk CITRA — membungkus `ai_blog_to_podcast_agent`
(dari [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps))
menjadi API async yang dipakai frontend GitHub Pages.

Alur: URL blog → scraping (Firecrawl) → ringkasan podcast (GPT-4o) →
audio MP3 (ElevenLabs) → polling tugas → pemutar audio di frontend.

## Jalankan

```bash
cd backend
pip install -r requirements.txt
python server.py                 # via uvicorn bila tersedia, default :8080
# atau: uvicorn server:app --host 0.0.0.0 --port 8080
```

Untuk dipakai dari GitHub Pages, backend harus bisa diakses publik via HTTPS
(mis. Nginx/Caddy atau Cloudflare Tunnel). CORS sudah terbuka (`*`).

## Endpoint

| Method | Path | Fungsi |
|---|---|---|
| GET | `/health` | Cek hidup (dipakai tombol "Uji Koneksi") |
| POST | `/api/podcast/generate/async` | Mulai tugas; body: `url`, `openai_key`, `elevenlabs_key`, `firecrawl_key`, `voice_id` (opsional) |
| GET | `/api/tasks/{task_id}` | Status tugas — `pending/running/completed/failed` + `result` |
| GET | `/api/files/{task_id}.mp3` | File audio hasil |

Kunci API dikirim pengguna per-request dan **tidak pernah disimpan** di server.
Hasil tugas disimpan 1 jam di memori; file MP3 tersimpan di `output/`.
