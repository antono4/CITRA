const $ = id => document.getElementById(id);

/* ---------- konfigurasi backend & kunci API ---------- */
// Semua nilai disimpan di localStorage browser pengguna. Kunci API dikirim
// langsung ke backend per-request dan tidak pernah disimpan oleh server.
const FIELDS = {
  citra_backend:      'backendUrl',
  citra_openai_key:   'openaiKey',
  citra_elevenlabs_key: 'elevenlabsKey',
  citra_firecrawl_key:  'firecrawlKey',
  citra_voice_id:     'voiceId',
};

function loadSettings(){
  for(const [store, id] of Object.entries(FIELDS))
    $(id).value = localStorage.getItem(store) || '';
}
function saveSetting(store, id){
  const v = $(id).value.trim();
  if(v) localStorage.setItem(store, v);
  else  localStorage.removeItem(store);
}
loadSettings();
for(const [store, id] of Object.entries(FIELDS))
  $(id).addEventListener('change', ()=>saveSetting(store, id));

let baseUrl = () => ($('backendUrl').value.trim().replace(/\/+$/, ''));

$('backendBtn').onclick = ()=> $('backendBar').classList.toggle('on');

async function fetchJSON(path, opts){
  const base = baseUrl();
  if(!base) throw new Error('URL backend belum diatur.');
  const res = await fetch(base + path, opts);
  if(!res.ok){
    let detail = 'HTTP ' + res.status;
    try{
      const j = await res.json();
      if(j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    }catch(e){}
    throw new Error(detail);
  }
  return res.json();
}

async function refreshConn(){
  const el = $('connStatus');
  if(!baseUrl()){ el.textContent = 'belum diatur'; el.className = 'conn'; return; }
  el.textContent = 'mengecek…'; el.className = 'conn';
  try{
    await fetchJSON('/health');
    el.textContent = '● terhubung'; el.className = 'conn ok';
  }catch(e){
    el.textContent = '○ gagal terhubung'; el.className = 'conn bad';
  }
}
$('testBtn').onclick = refreshConn;
$('backendUrl').addEventListener('change', refreshConn);
refreshConn();

/* ---------- toast ---------- */
let toastT;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove('on'), 5000);
}

/* ---------- generation ---------- */
const history = [];
const POLL_MS = 3000;
const POLL_MAX = 10 * 60 * 1000; // 10 menit

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
    if(Date.now() > deadline)       throw new Error('Terlalu lama — cek backend.');
    onProgress(task);
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

$('genBtn').onclick = async ()=>{
  const url = $('prompt').value.trim();
  if(!url){ toast('Tempel URL blog dulu ya.'); $('prompt').focus(); return; }
  if(!/^https?:\/\//i.test(url)){ toast('URL harus diawali http:// atau https://'); $('prompt').focus(); return; }
  if(!baseUrl()){
    toast('Atur dulu URL backend (klik "Atur Backend & Kunci" di kanan atas).');
    $('backendBar').classList.add('on'); $('backendUrl').focus(); return;
  }
  const keys = ['openaiKey','elevenlabsKey','firecrawlKey'];
  const missing = keys.filter(k => !$(k).value.trim());
  if(missing.length){
    toast('Lengkapi dulu 3 API key di bar "Atur Backend & Kunci".');
    $('backendBar').classList.add('on'); $(missing[0]).focus(); return;
  }

  const body = {
    url,
    openai_key:      $('openaiKey').value.trim(),
    elevenlabs_key:  $('elevenlabsKey').value.trim(),
    firecrawl_key:   $('firecrawlKey').value.trim(),
  };
  const voice = $('voiceId').value.trim();
  if(voice) body.voice_id = voice;

  const btn = $('genBtn');
  btn.disabled = true; btn.classList.add('loading');
  $('genLabel').textContent = 'Memproses…';
  $('shimmer').classList.add('on');
  $('emptyState').style.display = 'none';
  const old = $('viewport').querySelector('.podcast'); if(old) old.remove();

  const t0 = performance.now();
  try{
    $('shimmerText').textContent = 'Mengirim tugas ke backend…';
    const { task_id } = await fetchJSON('/api/podcast/generate/async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await pollTask(task_id, task => {
      $('shimmerText').textContent = task.message || 'Backend sedang bekerja…';
    });

    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const audioUrl = baseUrl() + result.audio_url;

    const wrap = document.createElement('div');
    wrap.className = 'podcast';
    const audio = document.createElement('audio');
    audio.controls = true; audio.autoplay = true; audio.src = audioUrl;
    const sum = document.createElement('details');
    const sumT = document.createElement('summary');
    sumT.textContent = '📄 Ringkasan podcast';
    const sumP = document.createElement('p');
    sumP.textContent = result.summary || '';
    sum.append(sumT, sumP);
    wrap.append(audio, sum);
    $('viewport').appendChild(wrap);

    $('resultMeta').innerHTML =
      `“${url.length > 80 ? url.slice(0,80) + '…' : url}”<br>` +
      `${fmtSize(result.file_size)} · dibuat dalam ${secs}s`;
    $('downloadBtn').href = audioUrl;
    $('downloadBtn').setAttribute('download', 'citra-podcast-' + Date.now() + '.mp3');
    $('resultBar').classList.add('on');

    history.unshift({ src: audioUrl, prompt: url });
    renderHistory();
  }catch(err){
    console.error(err);
    const msg = (err && err.message) || '';
    if(/failed to fetch|networkerror|load failed/i.test(msg)){
      toast('Tidak bisa menghubungi backend — pastikan URL benar dan server sedang berjalan.');
    }else if(/401|403|unauthor|api.?key|invalid key/i.test(msg)){
      toast('API key salah atau tidak berizin — cek kembali di bar "Atur Backend & Kunci".');
    }else if(/insufficient|quota|credit|balance/i.test(msg)){
      toast('Kuota API key habis — isi ulang di penyedia layanan yang bersangkutan.');
    }else{
      toast('Gagal membuat podcast: ' + (msg || 'coba lagi.'));
    }
    if(!history.length) $('emptyState').style.display = '';
  }finally{
    $('shimmer').classList.remove('on');
    btn.disabled = false; btn.classList.remove('loading');
    $('genLabel').textContent = 'Generate Podcast';
  }
};

$('copyPromptBtn').onclick = ()=>{
  navigator.clipboard.writeText($('prompt').value).then(()=>toast('URL disalin ✓'));
};

function renderHistory(){
  $('histCount').textContent = history.length;
  const g = $('grid'); g.innerHTML = '';
  history.forEach((h, i)=>{
    const d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = `<span class="thumb-icon">🎙️</span>
      <a class="dl" href="${h.src}" download="citra-podcast-${i}.mp3" title="Unduh" onclick="event.stopPropagation()">⬇</a>`;
    d.onclick = ()=>{
      const old = $('viewport').querySelector('.podcast'); if(old) old.remove();
      $('emptyState').style.display = 'none';
      const wrap = document.createElement('div');
      wrap.className = 'podcast';
      const audio = document.createElement('audio');
      audio.controls = true; audio.autoplay = true; audio.src = h.src;
      wrap.appendChild(audio);
      $('viewport').appendChild(wrap);
      $('downloadBtn').href = h.src;
      $('resultMeta').innerHTML = `“${h.prompt}”`;
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
