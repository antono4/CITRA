const $ = id => document.getElementById(id);

/* ---------- style presets ---------- */
const STYLES = [
  {label:'Fotorealistis', text:', ultra realistic photograph, 85mm lens, cinematic lighting, high detail'},
  {label:'Anime', text:', anime style, studio ghibli inspired, vibrant colors, detailed background'},
  {label:'Cat Air', text:', delicate watercolor painting, soft washes, paper texture'},
  {label:'3D Render', text:', polished 3d render, octane, soft studio lighting, high detail'},
  {label:'Pixel Art', text:', retro pixel art, 16-bit, limited palette'},
  {label:'Batik Nusantara', text:', traditional javanese batik pattern style, intricate ornament, warm sogan colors'},
  {label:'Cyberpunk', text:', cyberpunk aesthetic, neon glow, rain, night city, cinematic'},
  {label:'Minimalis', text:', minimalist flat illustration, clean shapes, muted palette'},
];
const activeStyles = new Set();
STYLES.forEach((s,i)=>{
  const b=document.createElement('button');
  b.className='chip'; b.textContent=s.label;
  b.onclick=()=>{ activeStyles.has(i)?activeStyles.delete(i):activeStyles.add(i); b.classList.toggle('on'); };
  $('styleChips').appendChild(b);
});

/* ---------- aspect ratios ---------- */
/* rw/rh = rasio dalam unit kecil untuk provider yang menerima rasio (Gemini/Replicate) */
const RATIOS=[
  {label:'1:1', w:1024,h:1024, rw:1, rh:1,  bw:16,bh:16},
  {label:'3:2', w:1536,h:1024, rw:3, rh:2,  bw:20,bh:13},
  {label:'2:3', w:1024,h:1536, rw:2, rh:3,  bw:13,bh:20},
  {label:'16:9',w:1536,h:864,  rw:16,rh:9,  bw:22,bh:12},
  {label:'9:16',w:864, h:1536, rw:9, rh:16, bw:12,bh:22},
];
let ratioIdx=0;
RATIOS.forEach((r,i)=>{
  const b=document.createElement('button');
  b.className='ratio'+(i===0?' on':'');
  b.innerHTML=`<span class="box" style="width:${r.bw}px;height:${r.bh}px"></span>${r.label}`;
  b.onclick=()=>{ ratioIdx=i; document.querySelectorAll('.ratio').forEach((x,j)=>x.classList.toggle('on',j===i)); };
  $('ratios').appendChild(b);
});

/* ---------- model / provider handling ---------- */
const MODEL_KINDS={
  'gpt-image-1-mini':'openai', 'gpt-image-1':'openai', 'gpt-image-1.5':'openai', 'gpt-image-2':'openai',
  'gemini-3.1-flash-image-preview':'gemini',
  'grok-imagine-image':'xai', 'grok-imagine-image-quality':'xai',
  'black-forest-labs/flux-schnell':'replicate', 'black-forest-labs/flux-1.1-pro':'replicate',
  'black-forest-labs/flux-2-dev':'replicate', 'black-forest-labs/flux-2-pro':'replicate',
  'black-forest-labs/flux-2-klein-9b-base':'replicate',
  'leonardoai/lucid-origin':'replicate', 'leonardoai/phoenix-1.0':'replicate',
};
// Model default Puter adalah gpt-image-1-mini (OpenAI) — sesuai dokumentasi txt2img.
const kindOf=m=>MODEL_KINDS[m]||'openai';

const QUALITY_OPTS={
  openai:[['low','Rendah (paling cepat)'],['medium','Sedang'],['high','Tinggi (paling lambat)']],
  gemini:[['1K','1K (paling cepat)'],['2K','2K (lebih tajam)'],['4K','4K (paling detail)']],
  xai:[['1k','1K (paling cepat)'],['2k','2K (lebih tajam)']],
};

function updateModelFields(){
  const k=kindOf($('model').value);
  if(QUALITY_OPTS[k]){
    $('quality').innerHTML=QUALITY_OPTS[k].map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
    $('qualityField').style.display='block';
  }else{
    $('qualityField').style.display='none';
  }
  $('seedField').style.display = k==='replicate' ? 'block':'none';
}
$('model').addEventListener('change',updateModelFields);
updateModelFields();

/* ---------- auth ---------- */
async function refreshAuth(){
  try{
    const signed = await puter.auth.isSignedIn();
    const btn=$('authBtn');
    if(signed){
      const u=await puter.auth.getUser();
      btn.textContent='✓ '+u.username;
      btn.classList.add('signed');
    }else{
      btn.textContent='Masuk dengan Puter';
      btn.classList.remove('signed');
    }
  }catch(e){ /* abaikan */ }
}
$('authBtn').onclick=async()=>{
  try{
    if(await puter.auth.isSignedIn()){ await puter.auth.signOut(); }
    else{ await puter.auth.signIn(); }
  }catch(e){}
  refreshAuth();
};
refreshAuth();

/* ---------- toast ---------- */
let toastT;
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('on');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),4200);
}

/* ---------- generation ---------- */
const history=[];
const SHIMMER_LINES=['AI sedang melukis…','Mencampur warna digital…','Menenun piksel…','Hampir selesai…'];
const GEN_TIMEOUT=3*60*1000;
let shimmerInt;

// GPT Image selain gpt-image-2 hanya menerima ukuran tetap — ambil yang rasio-nya paling dekat.
const OPENAI_SIZES=[[1024,1024],[1536,1024],[1024,1536]];
function snapOpenAISize(w,h){
  const t=w/h;
  return OPENAI_SIZES.reduce((a,b)=>Math.abs(a[0]/a[1]-t)<=Math.abs(b[0]/b[1]-t)?a:b);
}

function errText(err){
  const parts=[err&&err.message, err&&err.code, err&&err.error&&(err.error.message||err.error.code)];
  let s=parts.filter(Boolean).join(' ');
  if(!s){ try{ s=JSON.stringify(err); }catch(e){ s=String(err||''); } }
  return s||'';
}

function withTimeout(promise,ms){
  return Promise.race([
    promise,
    new Promise((_,rej)=>setTimeout(()=>rej(new Error('Timeout — permintaan tidak selesai. Tutup jendela login Puter lalu coba lagi.')),ms)),
  ]);
}

$('genBtn').onclick=async()=>{
  const base=$('prompt').value.trim();
  if(!base){ toast('Tulis prompt dulu ya.'); $('prompt').focus(); return; }

  const styled = base + [...activeStyles].map(i=>STYLES[i].text).join('');
  const model=$('model').value;
  const r=RATIOS[ratioIdx];
  const seedVal=$('seed').value.trim();
  const options={};

  const kind=kindOf(model);
  let dispW=r.w, dispH=r.h;

  if(kind==='openai'){
    options.provider='openai-image-generation';
    if(model) options.model=model;
    options.quality=$('quality').value;
    [dispW,dispH]=snapOpenAISize(r.w,r.h);
    options.ratio={w:dispW,h:dispH};
  }else if(kind==='gemini'){
    options.provider='gemini';
    options.model=model;
    options.quality=$('quality').value;
    options.ratio={w:r.rw,h:r.rh};
  }else if(kind==='xai'){
    options.provider='xai';
    options.model=model;
    options.quality=$('quality').value;
  }else if(kind==='replicate'){
    options.provider='replicate-image-generation';
    options.model=model;
    options.ratio={w:r.rw,h:r.rh};
    if(seedVal) options.seed=parseInt(seedVal);
  }

  const btn=$('genBtn');
  btn.disabled=true; btn.classList.add('loading');
  $('genLabel').textContent='Memproses…';
  $('shimmer').classList.add('on');
  $('emptyState').style.display='none';
  const old=$('viewport').querySelector('img.result'); if(old) old.remove();
  let li=0;
  $('shimmerText').textContent=SHIMMER_LINES[0];
  shimmerInt=setInterval(()=>{ li=(li+1)%SHIMMER_LINES.length; $('shimmerText').textContent=SHIMMER_LINES[li]; },2200);

  const t0=performance.now();
  try{
    // Pastikan sudah login SEBELUM memanggil txt2img — kalau tidak, SDK membuka
    // jendela sign-in dan promise-nya menggantung selamanya (UI macet "Memproses…").
    let signed=false;
    try{ signed=await puter.auth.isSignedIn(); }catch(e){}
    if(!signed){
      $('genLabel').textContent='Menunggu login…';
      try{
        await puter.auth.signIn();
      }catch(e){
        throw Object.assign(new Error('Perlu masuk dulu — klik "Masuk dengan Puter" di kanan atas.'),{code:'auth_required'});
      }
      refreshAuth();
    }
    $('genLabel').textContent='Memproses…';

    const img=await withTimeout(puter.ai.txt2img(styled, options), GEN_TIMEOUT);
    const secs=((performance.now()-t0)/1000).toFixed(1);
    const src=img.src;

    img.className='result';
    img.alt=base;
    $('viewport').appendChild(img);

    const modelLabel=model?$('model').selectedOptions[0].textContent:'Default (GPT Image 1 Mini)';
    const dims=kind==='openai'?` (${dispW}×${dispH})`:'';
    $('resultMeta').innerHTML=
      `“${base.length>80?base.slice(0,80)+'…':base}”<br>`+
      `${modelLabel} · ${r.label}${dims} · ${secs}s`;
    $('downloadBtn').href=src;
    $('downloadBtn').setAttribute('download','citra-'+Date.now()+'.png');
    $('resultBar').classList.add('on');

    history.unshift({src,prompt:base});
    renderHistory();
  }catch(err){
    console.error(err);
    const msg=errText(err);
    if(/auth|sign|401|403|unauthor|permission|login/i.test(msg)){
      toast('Perlu masuk dulu — klik "Masuk dengan Puter" di kanan atas.');
    }else if(/insufficient|quota|credit|balance|billing|funding|upgrade/i.test(msg)){
      toast('Saldo akun Puter tidak cukup — isi ulang di puter.com (dashboard → billing), atau coba model lain.');
    }else{
      toast('Gagal membuat gambar: '+(msg||'coba lagi atau ganti model.'));
    }
    if(!history.length) $('emptyState').style.display='';
  }finally{
    clearInterval(shimmerInt);
    $('shimmer').classList.remove('on');
    btn.disabled=false; btn.classList.remove('loading');
    $('genLabel').textContent='Generate Gambar';
  }
};

$('copyPromptBtn').onclick=()=>{
  navigator.clipboard.writeText($('prompt').value).then(()=>toast('Prompt disalin ✓'));
};

function renderHistory(){
  $('histCount').textContent=history.length;
  const g=$('grid'); g.innerHTML='';
  history.forEach((h,i)=>{
    const d=document.createElement('div');
    d.className='thumb';
    d.innerHTML=`<img src="${h.src}" alt="${h.prompt.replace(/"/g,'&quot;')}">
      <a class="dl" href="${h.src}" download="citra-${i}.png" title="Unduh" onclick="event.stopPropagation()">⬇</a>`;
    d.onclick=()=>{
      const old=$('viewport').querySelector('img.result'); if(old) old.remove();
      $('emptyState').style.display='none';
      const im=new Image(); im.src=h.src; im.className='result';
      $('viewport').appendChild(im);
      $('downloadBtn').href=h.src;
      $('resultMeta').innerHTML=`“${h.prompt}”`;
      $('resultBar').classList.add('on');
      window.scrollTo({top:0,behavior:'smooth'});
    };
    g.appendChild(d);
  });
}

/* Ctrl+Enter untuk generate */
$('prompt').addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter') $('genBtn').click();
});
