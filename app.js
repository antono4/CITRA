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
const RATIOS=[
  {label:'1:1', w:1024,h:1024, bw:16,bh:16},
  {label:'3:2', w:1536,h:1024, bw:20,bh:13},
  {label:'2:3', w:1024,h:1536, bw:13,bh:20},
  {label:'16:9',w:1536,h:864,  bw:22,bh:12},
  {label:'9:16',w:864, h:1536, bw:12,bh:22},
];
let ratioIdx=0;
RATIOS.forEach((r,i)=>{
  const b=document.createElement('button');
  b.className='ratio'+(i===0?' on':'');
  b.innerHTML=`<span class="box" style="width:${r.bw}px;height:${r.bh}px"></span>${r.label}`;
  b.onclick=()=>{ ratioIdx=i; document.querySelectorAll('.ratio').forEach((x,j)=>x.classList.toggle('on',j===i)); };
  $('ratios').appendChild(b);
});

/* ---------- model / quality visibility ---------- */
$('model').addEventListener('change', e=>{
  $('qualityField').style.display = e.target.value ? 'block' : 'none';
});

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
let shimmerInt;

$('genBtn').onclick=async()=>{
  const base=$('prompt').value.trim();
  if(!base){ toast('Tulis prompt dulu ya.'); $('prompt').focus(); return; }

  const styled = base + [...activeStyles].map(i=>STYLES[i].text).join('');
  const model=$('model').value;
  const r=RATIOS[ratioIdx];
  const seedVal=$('seed').value.trim();
  const options={};

  // Skala ukuran hanya untuk model default (model GPT pakai ukuran tetap)
  const scale=parseFloat($('size').value)||1;
  const to8=n=>Math.max(8,Math.round(n/8)*8);
  let dispW=r.w, dispH=r.h;

  if(model){
    options.model=model;
    options.quality=$('quality').value;
    options.ratio={w:r.w,h:r.h};
  }else{
    dispW=to8(r.w*scale); dispH=to8(r.h*scale);
    options.width=dispW; options.height=dispH;
    options.steps=parseInt($('steps').value)||12;
    if(seedVal) options.seed=parseInt(seedVal);
    const neg=$('negative').value.trim();
    if(neg) options.negative_prompt=neg;
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
    const img=await puter.ai.txt2img(styled, options);
    const secs=((performance.now()-t0)/1000).toFixed(1);
    const src=img.src;

    img.className='result';
    img.alt=base;
    $('viewport').appendChild(img);

    $('resultMeta').innerHTML=
      `“${base.length>80?base.slice(0,80)+'…':base}”<br>`+
      `${model||'default'} · ${r.label} (${dispW}×${dispH}) · ${secs}s`;
    $('downloadBtn').href=src;
    $('downloadBtn').setAttribute('download','citra-'+Date.now()+'.png');
    $('resultBar').classList.add('on');

    history.unshift({src,prompt:base});
    renderHistory();
  }catch(err){
    console.error(err);
    const msg=(err&&err.message)||'';
    if(/auth|sign|401|403/i.test(msg)){
      toast('Perlu masuk dulu — klik "Masuk dengan Puter" di kanan atas.');
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
