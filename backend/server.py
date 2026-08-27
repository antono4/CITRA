"""CITRA Podcast Backend — pembungkus API untuk ai_blog_to_podcast_agent.

Mengubah URL blog menjadi podcast (ringkasan GPT-4o + suara ElevenLabs),
dengan antrean tugas async yang bisa di-polling dari frontend GitHub Pages.

Jalankan:
    pip install -r requirements.txt
    python server.py            # http://0.0.0.0:8080

Kunci API dikirim per-request oleh pengguna lewat UI (header httpOnly tidak
dipakai supaya tetap sederhana); backend tidak menyimpan apa pun.
"""

import asyncio
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

OUT_DIR = Path(os.environ.get("CITRA_OUT_DIR", "output"))
OUT_DIR.mkdir(exist_ok=True)

TASK_TTL = 3600  # hasil tugas disimpan 1 jam


# ---------------- task store ----------------

class Task(BaseModel):
    task_id: str
    status: str = "pending"          # pending|running|completed|failed
    message: str = ""
    result: dict | None = None
    error: str | None = None
    created_at: float = Field(default_factory=time.time)


TASKS: dict[str, Task] = {}


def create_task() -> Task:
    task = Task(task_id=uuid.uuid4().hex[:12])
    TASKS[task.task_id] = task
    return task


def get_task(task_id: str) -> Task | None:
    # bersihkan tugas lama
    now = time.time()
    for tid in [t for t, v in TASKS.items() if now - v.created_at > TASK_TTL]:
        TASKS.pop(tid, None)
    return TASKS.get(task_id)


# ---------------- schemas ----------------

class GenerateRequest(BaseModel):
    url: str
    openai_key: str
    elevenlabs_key: str
    firecrawl_key: str
    voice_id: str = "JBFqnCBsd6RMkjVDRZzb"


class GenerateResponse(BaseModel):
    success: bool = True
    task_id: str


# ---------------- pipeline ----------------

def run_pipeline(task: Task, req: GenerateRequest):
    """Blokir — dijalankan di thread pool."""
    os.environ["OPENAI_API_KEY"] = req.openai_key
    os.environ["FIRECRAWL_API_KEY"] = req.firecrawl_key

    from agno.agent import Agent
    from agno.models.openai import OpenAIChat
    from agno.tools.firecrawl import FirecrawlTools
    from elevenlabs import ElevenLabs

    task.message = "Mengambil & meringkas blog…"
    agent = Agent(
        name="Blog Summarizer",
        model=OpenAIChat(id="gpt-4o"),
        tools=[FirecrawlTools()],
        instructions=[
            "Scrape the blog URL and create a concise, engaging summary (max 2000 characters) suitable for a podcast.",
            "The summary should be conversational and capture the main points.",
        ],
    )
    response = agent.run(f"Scrape and summarize this blog for a podcast: {req.url}")
    summary = getattr(response, "content", None) or str(response)
    if not summary:
        raise RuntimeError("Ringkasan kosong — blog gagal dibaca.")

    task.message = "Mengubah ringkasan menjadi suara…"
    client = ElevenLabs(api_key=req.elevenlabs_key)
    audio = client.text_to_speech.convert(
        text=summary,
        voice_id=req.voice_id,
        model_id="eleven_multilingual_v2",
    )
    audio_bytes = b"".join(c for c in audio if c)

    out = OUT_DIR / f"{task.task_id}.mp3"
    out.write_bytes(audio_bytes)
    return {
        "audio_url": f"/api/files/{task.task_id}.mp3",
        "file_size": len(audio_bytes),
        "summary": summary,
    }


async def execute(task: Task, req: GenerateRequest):
    task.status = "running"
    try:
        result = await asyncio.to_thread(run_pipeline, task, req)
        task.status = "completed"
        task.result = result
        task.message = "Selesai"
    except Exception as e:
        task.status = "failed"
        task.error = str(e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="CITRA Podcast Backend", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "healthy", "service": "citra-podcast"}


@app.post("/api/podcast/generate/async", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    if not req.url.strip():
        raise HTTPException(400, "URL blog wajib diisi.")
    task = create_task()
    asyncio.create_task(execute(task, req))
    return GenerateResponse(task_id=task.task_id)


@app.get("/api/tasks/{task_id}", response_model=Task)
def task_status(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, f"Tugas {task_id} tidak ditemukan.")
    return task


from fastapi.staticfiles import StaticFiles  # noqa: E402
app.mount("/api/files", StaticFiles(directory=OUT_DIR), name="files")
