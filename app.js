const $ = id => document.getElementById(id);

/* ---------- backend config ---------- */
// Tersimpan di localStorage — GitHub Pages bersifat statis, jadi setiap
// pengunjung mengatur URL backend Pixelle-Video miliknya sendiri.
let baseUrl = (localStorage.getItem('citra_backend') || '').replace(/\/+$/, '');

function api(path){ return baseUrl + path; }

async function fetchJSON(path, opts){
  const res = await fetch(api(path), opts);
  if(!res.ok){
    let detail = 'HTTP ' + res.status;
    try{ const j = await res.json(); if(j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); }catch(e){}
    throw new Error(detail);
  }
  return res.json();
}

/* ---------- backend settings bar ---------- */
$('backendUrl').value = baseUrl;
$('backendBtn').onclick = ()=> $('backendBar').classList.toggle('on');
$('backendUrl').addEventListener('change', ()=>{
  baseUrl = $('backendUrl').value.trim().replace(/\/+$/, '');
  localStorage.setItem('citra_backend', baseUrl);
  refreshConn();
});

async function refreshConn(){
  const el = $('connStatus');
  if(!baseUrl){ el.textContent = 'belum diatur'; el.className = 'conn'; return; }
  el.textContent = 'mengecek…'; el.className = 'conn';
  try{
    await fetchJSON('/health');
    el.textContent = '● terhubung'; el.className = 'conn ok';
  }catch(e){
    el.textContent = '○ gagal terhubung'; el.className = 'conn bad';
  }
}
$('testBtn').onclick = refreshConn;
refreshConn();

/* ---------- ukuran video (folder template Pixelle) ---------- */
const RATIOS = [
  {label:'9:16', size:'1080x1920', desc:'TikTok/Reels/Shorts', bw:12, bh:22},
  {label:'16:9', size:'1920x1080', desc:'YouTube',            bw:22, bh:12},
  {label:'1:1',  size:'1080x1080', desc:'Feed',               bw:16, bh:16},
];
let ratioIdx = 0;
RATIOS.forEach((r,i)=>{
  const b = document.createElement('button');
  b.className = 'ratio' + (i===0 ? ' on' : '');
  b.innerHTML = `<span class="box" style="width:${r.bw}px;height:${r.bh}px"></span>${r.label}`;
  b.onclick = ()=>{
    ratioIdx = i;
    document.querySelectorAll('.ratio').forEach((x,j)=>x.classList.toggle('on', j===i));
    fillTemplates();
  };
  $('ratios').appendChild(b);
});

/* ---------- template visual (dimuat dari backend, fallback bawaan) ---------- */
const FALLBACK_TEMPLATES = [
  'image_default.html','image_full.html','image_minimal_framed.html','image_cartoon.html',
  'image_elegant.html','image_book.html','image_modern.html','image_neon.html',
  'image_blur_card.html','asset_default.html',
];

async function fillTemplates(){
  const size = RATIOS[ratioIdx].size;
  let keys = [];
  if(baseUrl){
    try{
      const data = await fetchJSON('/api/resources/templates');
      keys = (data.templates || []).filter(t => t.size === size).map(t => t.key);
    }catch(e){ /* backend belum siap — pakai fallback */ }
  }
  if(!keys.length) keys = FALLBACK_TEMPLATES.map(n => `${size}/${n}`);
  $('template').innerHTML = keys.map(k => `<option value="${k}">${k.split('/')[1].replace('.html','').replace(/_/g,' ')}</option>`).join('');
}

/* ---------- musik latar (dimuat dari backend) ---------- */
async function fillBgm(){
  let opts = [['', 'Tanpa musik']];
  if(baseUrl){
    try{
      const data = await fetchJSON('/api/resources/bgm');
      (data.bgm_files || []).forEach(b => opts.push([b.path, b.name]));
    }catch(e){}
  }
  if(opts.length === 1) opts.push(['bgm/default.mp3', 'default.mp3 (bawaan)']);
  $('bgm').innerHTML = opts.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
}

fillTemplates();
fillBgm();
$('backendUrl').addEventListener('change', ()=>{ fillTemplates(); fillBgm(); });

/* ---------- mode naskah: jumlah adegan hanya untuk mode generate ---------- */
$('mode').addEventListener('change', ()=>{
  $('scenesField').style.display = $('mode').value === 'generate' ? 'block' : 'none';
});

/* ---------- toast ---------- */
let toastT;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove('on'), 5000);
}

/* ---------- generation ---------- */
const history = [];
const POLL_MS = 3000;
const POLL_MAX = 30 * 60 * 1000; // 30 menit

function fmtSize(bytes){
  if(!bytes && bytes !== 0) return '';
  if(bytes > 1048576) return (bytes/1048576).toFixed(1) + ' MB';
  return Math.round(bytes/1024) + ' KB';
}

async function pollTask(taskId, onProgress){
  const deadline = Date.now() + POLL_MAX;
  for(;;){
    const task = await fetchJSON('/api/tasks/' + taskId);
    if(task.status === 'completed') return task.result;
    if(task.status === 'failed')    throw new Error(task.error || 'Tugas gagal di backend.');
    if(task.status === 'cancelled') throw new Error('Tugas dibatalkan.');
    if(Date.now() > deadline)       throw new Error('Terlalu lama — cek antrean tugas di backend.');
    onProgress(task);
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

$('genBtn').onclick = async ()=>{
  const text = $('prompt').value.trim();
  if(!text){ toast('Tulis topik dulu ya.'); $('prompt').focus(); return; }
  if(!baseUrl){
    toast('Atur dulu URL backend Pixelle-Video (klik "Atur Backend" di kanan atas).');
    $('backendBar').classList.add('on');
    $('backendUrl').focus();
    return;
  }

  const mode = $('mode').value;
  const body = {
    text,
    mode,
    frame_template: $('template').value,
    video_fps: 30,
    bgm_volume: parseFloat($('bgmVolume').value) || 0.3,
  };
  const title = $('title').value.trim();
  if(title) body.title = title;
  if(mode === 'generate') body.n_scenes = parseInt($('scenes').value) || 5;
  const prefix = $('promptPrefix').value.trim();
  if(prefix) body.prompt_prefix = prefix;
  const bgm = $('bgm').value;
  if(bgm) body.bgm_path = bgm;

  const btn = $('genBtn');
  btn.disabled = true; btn.classList.add('loading');
  $('genLabel').textContent = 'Memproses…';
  $('shimmer').classList.add('on');
  $('emptyState').style.display = 'none';
  const old = $('viewport').querySelector('video.result'); if(old) old.remove();

  const t0 = performance.now();
  try{
    $('shimmerText').textContent = 'Mengirim tugas ke backend…';
    const { task_id } = await fetchJSON('/api/video/generate/async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await pollTask(task_id, task => {
      const p = task.progress;
      $('shimmerText').textContent = (p && p.message)
        ? `${p.message} (${Math.round(p.percentage)}%)`
        : 'Backend sedang membuat video… (script → gambar → suara → musik)';
    });

    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const vid = document.createElement('video');
    vid.className = 'result';
    vid.controls = true;
    vid.autoplay = true;
    vid.loop = true;
    vid.muted = true; // autoplay butuh mute; pengguna bisa nyalakan suara di kontrol
    vid.playsInline = true;
    vid.src = result.video_url;
    $('viewport').appendChild(vid);

    const dur = result.duration ? result.duration.toFixed(1) + 's' : '?';
    $('resultMeta').innerHTML =
      `“${text.length > 80 ? text.slice(0,80) + '…' : text}”<br>` +
      `${RATIOS[ratioIdx].label} · ${dur} · ${fmtSize(result.file_size)} · dibuat dalam ${secs}s`;
    $('downloadBtn').href = result.video_url;
    $('downloadBtn').setAttribute('download', 'citra-' + Date.now() + '.mp4');
    $('resultBar').classList.add('on');

    history.unshift({ src: result.video_url, prompt: text, meta: `${RATIOS[ratioIdx].label} · ${dur}` });
    renderHistory();
  }catch(err){
    console.error(err);
    const msg = (err && err.message) || '';
    if(/failed to fetch|networkerror|load failed/i.test(msg)){
      toast('Tidak bisa menghubungi backend — pastikan URL benar dan server Pixelle sedang berjalan.');
    }else{
      toast('Gagal membuat video: ' + (msg || 'coba lagi.'));
    }
    if(!history.length) $('emptyState').style.display = '';
  }finally{
    $('shimmer').classList.remove('on');
    btn.disabled = false; btn.classList.remove('loading');
    $('genLabel').textContent = 'Generate Video';
  }
};

$('copyPromptBtn').onclick = ()=>{
  navigator.clipboard.writeText($('prompt').value).then(()=>toast('Topik disalin ✓'));
};

function renderHistory(){
  $('histCount').textContent = history.length;
  const g = $('grid'); g.innerHTML = '';
  history.forEach((h, i)=>{
    const d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = `<video src="${h.src}" muted preload="metadata"></video>
      <a class="dl" href="${h.src}" download="citra-${i}.mp4" title="Unduh" onclick="event.stopPropagation()">⬇</a>`;
    d.onclick = ()=>{
      const old = $('viewport').querySelector('video.result'); if(old) old.remove();
      $('emptyState').style.display = 'none';
      const v = document.createElement('video');
      v.src = h.src; v.className = 'result';
      v.controls = true; v.autoplay = true; v.loop = true; v.playsInline = true;
      $('viewport').appendChild(v);
      $('downloadBtn').href = h.src;
      $('resultMeta').innerHTML = `“${h.prompt}”<br>${h.meta || ''}`;
      $('resultBar').classList.add('on');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    g.appendChild(d);
  });
}

/* Ctrl+Enter untuk generate */
$('prompt').addEventListener('keydown', e=>{
  if((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('genBtn').click();
});
