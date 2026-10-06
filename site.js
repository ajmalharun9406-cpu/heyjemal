// heyjemal — public site script. Video & photo lists live in data/media.json so the
// #admin panel (admin.js) can add / delete media without touching this file.

const CLIENTS = ["TNB","Cenviro","Arissto","Dashing Diva","JomRides","Big Mo","Kambyan","MyExpo","Johawaki","Koperasi Tentera","Bulan Sutena","Dr Roket TV"];
const HJ = window.HJ = { media: null, pending: {}, afterRender: null };
// pending uploads (admin) are shown from local object URLs until they are published
HJ.src = p => HJ.pending[p] || p;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// reveal-on-scroll; rendered sections call observe() on their new nodes
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), {threshold:.12});
const observe = root => root.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));

// marquee
$('track').innerHTML = [...CLIENTS, ...CLIENTS].map(c => `<span>${c}</span>`).join('');

// filter bars keep their active button across re-renders
function renderFilters(bar, cats, onPick) {
  const active = bar.querySelector('.on')?.dataset.c || 'All';
  const list = ["All", ...cats];
  const cur = list.includes(active) ? active : 'All';
  bar.innerHTML = list.map(c => `<button class="${c === cur ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  bar.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    bar.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    onPick(b.dataset.c);
  };
  onPick(cur);
}

/* ---------- work (videos) ---------- */
const grid = $('grid');
const touch = matchMedia('(hover: none)').matches;
const play = card => card.querySelector('video').play().then(() => card.classList.add('playing')).catch(() => {});
const stop = card => { card.querySelector('video').pause(); card.classList.remove('playing'); };
// touch screens have no hover: play preview when the card is mid-screen
const vio = touch && new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? play(e.target) : stop(e.target)), {threshold:.75});

function renderWork() {
  const V = HJ.media.videos;
  grid.innerHTML = V.map((v, i) => `
    <article class="card reveal" data-cat="${esc(v.cat)}" data-i="${i}">
      <img src="${HJ.src(v.thumb)}" alt="${esc(v.title)}" loading="lazy">
      <video muted loop playsinline preload="none" src="${HJ.src(v.clip)}"></video>
      <div class="play">▶</div>
      <div class="meta"><span class="tag">${esc(v.cat)}</span><h3>${esc(v.title)}</h3></div>
    </article>`).join('');
  grid.querySelectorAll('.card').forEach(card => {
    if (touch) vio.observe(card);
    card.addEventListener('mouseenter', () => play(card));
    card.addEventListener('mouseleave', () => stop(card));
  });
  renderFilters($('filters'), [...new Set(V.map(v => v.cat))], c =>
    grid.querySelectorAll('.card').forEach(card => card.classList.toggle('hide', c !== 'All' && card.dataset.cat !== c)));
  observe(grid);
  HJ.afterRender?.('work');
}
grid.addEventListener('click', e => {
  const card = e.target.closest('.card'); if (!card || e.target.closest('.adm')) return;
  const v = HJ.media.videos[card.dataset.i];
  openModal(`<video src="${HJ.src(v.clip)}" autoplay loop muted playsinline controls></video>`, v.title, 'Preview · full video coming soon on YouTube');
});

/* ---------- photos ---------- */
const masonry = $('masonry');
let mixed = [];

function renderPhotos() {
  const M = HJ.media;
  // spread each category evenly by relative position so "All" shows a mix, not blocks
  const byCat = M.photoCats.map(c => M.photos.map((it, k) => ({...it, k})).filter(it => it.cat === c));
  mixed = byCat.flatMap((l, c) => l.map((it, i) => [it, (i + .5) / l.length, c]))
    .sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
  masonry.innerHTML = mixed.map((it, i) => !it.album
    ? `<figure class="reveal" data-cat="${esc(it.cat)}" data-i="${i}"><img src="${HJ.src(it.photos[0])}" alt="${esc(it.cat)} photography by Jemal" loading="lazy"><figcaption>${esc(it.cat)}</figcaption></figure>`
    : `<figure class="reveal album" data-cat="${esc(it.cat)}" data-i="${i}">
        <div class="slides">${it.photos.map((p, j) => `<img src="${HJ.src(p)}" alt="${esc(it.title)} ${j + 1}" loading="lazy">`).join('')}</div>
        <button class="sl prev" aria-label="Previous">‹</button><button class="sl next" aria-label="Next">›</button>
        <span class="count">1 / ${it.photos.length}</span>
        <div class="dots">${it.photos.map((_, j) => `<i class="${j ? '' : 'on'}"></i>`).join('')}</div>
        <figcaption>${esc(it.title)}</figcaption>
      </figure>`).join('');
  masonry.querySelectorAll('.album').forEach(initAlbum);
  renderFilters($('photoFilters'), M.photoCats.filter(c => M.photos.some(p => p.cat === c)), c =>
    masonry.querySelectorAll('figure').forEach(f => f.classList.toggle('hide', c !== 'All' && f.dataset.cat !== c)));
  observe(masonry);
  HJ.afterRender?.('photos');
}

// album = one person/session as a carousel: arrows wrap, dots + counter track the slide (swipe too)
function initAlbum(f) {
  const s = f.querySelector('.slides'), n = s.children.length;
  let cur = 0;
  const mark = k => {
    cur = k;
    f.querySelector('.count').textContent = `${k + 1} / ${n}`;
    f.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', j === k));
  };
  // arrows track their own target (mid-animation scrollLeft is unreliable) and mark it immediately
  const go = d => { const t = (cur + d + n) % n; mark(t); s.scrollTo({left: t * s.clientWidth, behavior: 'smooth'}); };
  f.querySelector('.prev').onclick = e => { e.stopPropagation(); go(-1); };
  f.querySelector('.next').onclick = e => { e.stopPropagation(); go(1); };
  let t; s.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => mark(Math.round(s.scrollLeft / s.clientWidth)), 120); }, {passive: true});
  f.cur = () => cur;
  // landscape shots inside a portrait-shaped card: show whole frame instead of cropping
  s.querySelectorAll('img').forEach(im => {
    const fit = () => im.classList.toggle('land', im.naturalWidth > im.naturalHeight);
    im.complete ? fit() : im.addEventListener('load', fit, {once: true});
  });
}

// lightbox: an album steps through its own photos; a single photo steps through the visible singles
let shown = [], at = 0;
function showPhoto(i) {
  at = (i + shown.length) % shown.length;
  const [src, title] = shown[at];
  openModal(`<img src="${src}" alt="">`, title, `${at + 1} / ${shown.length}`);
  modal.classList.add('gallery');
}
masonry.addEventListener('click', e => {
  const f = e.target.closest('figure'); if (!f || e.target.closest('.sl, .adm')) return;
  const it = mixed[f.dataset.i];
  if (it.album) {
    shown = it.photos.map(p => [HJ.src(p), it.title]);
    showPhoto(f.cur());
  } else {
    const singles = [...masonry.querySelectorAll('figure:not(.hide):not(.album)')];
    shown = singles.map(x => [HJ.src(mixed[x.dataset.i].photos[0]), x.dataset.cat]);
    showPhoto(singles.indexOf(f));
  }
});
$('prevPhoto').onclick = e => { e.stopPropagation(); showPhoto(at - 1); };
$('nextPhoto').onclick = e => { e.stopPropagation(); showPhoto(at + 1); };
addEventListener('keydown', e => {
  if (!modal.classList.contains('gallery')) return;
  if (e.key === 'ArrowLeft') showPhoto(at - 1);
  if (e.key === 'ArrowRight') showPhoto(at + 1);
});

/* ---------- modal ---------- */
const modal = $('modal');
function openModal(html, title, note) {
  $('modalMedia').innerHTML = html;
  $('modalTitle').textContent = title;
  $('modalNote').textContent = note;
  modal.classList.add('open'); document.body.style.overflow = 'hidden';
}
function closeModal() {
  modal.classList.remove('open', 'gallery'); $('modalMedia').innerHTML = '';
  document.body.style.overflow = '';
}
$('closeModal').onclick = closeModal;
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('openReel').onclick = () =>
  openModal('<video src="assets/showreel.mp4" autoplay controls playsinline></video>', 'Showreel — Jemal', '3:28');

/* ---------- nav, reveal, deep links ---------- */
const nav = $('nav');
addEventListener('scroll', () => nav.classList.toggle('solid', scrollY > 60), {passive: true});
observe(document);

HJ.renderWork = renderWork;
HJ.renderPhotos = renderPhotos;

(async () => {
  // no-store: edits published from #admin show up without waiting for the 10-min Pages cache
  HJ.media = await fetch('data/media.json?t=' + Date.now(), {cache: 'no-store'}).then(r => r.json());
  renderWork();
  renderPhotos();
  const t = location.hash && location.hash !== '#admin' && document.querySelector(location.hash);
  if (t) t.scrollIntoView({behavior: 'instant'});
  let remembered = false;
  try { remembered = localStorage.getItem('hj_admin') === '1'; } catch (e) {}
  if (location.hash === '#admin' || remembered) {
    const s = document.createElement('script'); s.src = 'admin.js?t=' + Date.now(); document.body.appendChild(s);
  }
})();
