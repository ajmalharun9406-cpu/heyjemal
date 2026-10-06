// heyjemal admin panel — loaded only via /#admin (or after logging in once on this device).
// Edits data/media.json + media files in memory, then "Publish" writes everything to GitHub
// in one commit through the Git Data API, using a fine-grained token kept in this browser only.
(() => {
  const REPO = 'ajmalharun9406-cpu/heyjemal', BRANCH = 'main', API = 'https://api.github.com';
  const HJ = window.HJ, M = () => HJ.media;
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let token = store.get('hj_token');
  const uploads = {};          // repo path -> Blob, new files waiting for Publish
  const deletes = new Set();   // repo paths to remove on Publish
  let changes = 0;

  /* ---------- styles ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .adm-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:95;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;
    background:#18181bf2;border:1px solid #3f3f46;border-radius:16px;padding:10px 14px;box-shadow:0 10px 40px #000a;max-width:calc(100vw - 32px);font:500 14px var(--body)}
  .adm-bar b{color:var(--accent-text)}
  .adm-bar .msg{color:var(--muted);font-size:13px}
  .adm-btn{font:600 13px var(--body);padding:8px 14px;border-radius:999px;border:1px solid #52525b;background:#27272a;color:var(--text);cursor:pointer}
  .adm-btn:hover{border-color:var(--accent-text)}
  .adm-btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}
  .adm-btn:disabled{opacity:.45;cursor:not-allowed}
  .adm-tools{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px;padding:12px;border:1px dashed #52525b;border-radius:14px}
  .adm-tools span{color:var(--muted);font-size:13px;align-self:center;margin-right:4px}
  .adm-ctl{position:absolute;z-index:5;display:flex;gap:6px}
  .card .adm-ctl{top:12px;left:12px}
  figure .adm-ctl{top:44px;right:10px;flex-direction:column}
  figure:not(.album) .adm-ctl{top:10px}
  .adm-ctl button{width:34px;height:34px;border-radius:50%;border:1px solid #ffffff55;background:#0a0a0bd9;color:#fff;font-size:15px;cursor:pointer;display:grid;place-items:center}
  .adm-ctl button:hover{background:var(--accent);border-color:var(--accent)}
  .adm-new{outline:2px solid var(--accent-text);outline-offset:-2px}
  .adm-dlg{border:1px solid #3f3f46;border-radius:18px;background:#18181b;color:var(--text);padding:22px;width:min(440px,92vw)}
  .adm-dlg::backdrop{background:#000b}
  .adm-dlg h3{font:700 19px var(--body);margin-bottom:12px}
  .adm-dlg p,.adm-dlg li{color:var(--muted);font-size:14px;margin-bottom:8px}
  .adm-dlg ol{padding-left:18px;margin-bottom:12px}
  .adm-dlg a{color:var(--accent-text);text-decoration:underline}
  .adm-dlg label{display:block;font-size:13px;color:var(--muted);margin:12px 0 4px}
  .adm-dlg input,.adm-dlg select{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #52525b;background:#0a0a0b;color:var(--text);font:15px var(--body)}
  .adm-dlg .row{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
  .adm-dlg .radio{display:flex;gap:14px;margin-top:6px}
  .adm-dlg .radio label{display:flex;gap:6px;align-items:center;margin:0;color:var(--text)}
  .adm-dlg .radio input{width:auto}
  @media(max-width:600px){
    .adm-bar{left:8px;right:8px;bottom:8px;transform:none;max-width:none;padding:8px 10px;gap:6px;border-radius:14px}
    .adm-bar .msg{flex-basis:100%;text-align:center;order:-1}
    .adm-bar > span:first-child{display:none}
    .adm-btn{padding:7px 11px;font-size:12px}
  }`;
  document.head.appendChild(css);

  /* ---------- small helpers ---------- */
  function ask(title, html, okText = 'OK') {
    return new Promise(res => {
      const d = document.createElement('dialog');
      d.className = 'adm-dlg';
      d.innerHTML = `<form method="dialog"><h3>${title}</h3>${html}
        <div class="row"><button class="adm-btn" value="cancel" formnovalidate>Batal</button><button class="adm-btn pri" value="ok">${okText}</button></div></form>`;
      document.body.appendChild(d);
      const form = d.querySelector('form');
      // resolve on submit (synchronous) rather than the dialog's async 'close' event
      const finish = ok => { const data = ok ? Object.fromEntries(new FormData(form)) : null; d.close(); d.remove(); res(data); };
      form.addEventListener('submit', e => { e.preventDefault(); finish(e.submitter?.value === 'ok'); });
      d.addEventListener('cancel', e => { e.preventDefault(); finish(false); });   // Esc key
      d.showModal();
    });
  }
  const catField = (cats, current) => `
    <label>Kategori</label>
    <select name="cat">${cats.map(c => `<option ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new">+ Kategori baru…</option></select>
    <label>Nama kategori baru (jika pilih "Kategori baru")</label><input name="newcat" placeholder="cth: Fashion">`;
  const pickCat = fd => (fd.cat === '__new' ? fd.newcat.trim() : fd.cat) || null;
  const activeFilter = id => document.querySelector(`#${id} .on`)?.dataset.c;
  const pickFiles = (accept, multiple) => new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.onchange = () => res([...i.files]);
    i.click();
  });
  const stamp = () => Date.now().toString(36);

  function addUpload(path, blob) {
    uploads[path] = blob;
    HJ.pending[path] = URL.createObjectURL(blob);
  }
  function dropFile(path) {
    if (!path) return;
    const stillUsed = M().videos.some(v => v.thumb === path || v.clip === path) || M().photos.some(p => p.photos.includes(path));
    if (stillUsed) return;
    if (uploads[path]) { URL.revokeObjectURL(HJ.pending[path]); delete uploads[path]; delete HJ.pending[path]; }
    else deletes.add(path);
  }
  function changed(n = 1) { changes += n; updateBar(); }

  // resize in the browser so the site stays fast (long side 1400px, JPEG q0.82)
  async function resizeImage(file, max = 1400) {
    let bmp;
    try { bmp = await createImageBitmap(file, {imageOrientation: 'from-image'}); }
    catch (e) { throw new Error(`"${file.name}" tak boleh dibaca. Guna JPG atau PNG (HEIC iPhone tak disokong browser).`); }
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(r => c.toBlob(r, 'image/jpeg', .82));
  }
  // thumbnail = frame at 30% of the video
  function videoThumb(file) {
    return new Promise((res, rej) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.src = URL.createObjectURL(file);
      v.onloadedmetadata = () => { v.currentTime = Math.max(0, Math.min(v.duration * .3, v.duration - .1)); };
      v.onseeked = () => {
        const c = document.createElement('canvas');
        c.width = 960; c.height = Math.round(960 * v.videoHeight / v.videoWidth);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        URL.revokeObjectURL(v.src);
        c.toBlob(res, 'image/jpeg', .8);
      };
      v.onerror = () => rej(new Error('Video tak boleh dibaca. Guna MP4 (H.264).'));
    });
  }

  /* ---------- GitHub ---------- */
  async function gh(path, opts = {}, tok = token) {
    const r = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: {Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json'},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.json().catch(() => ({}))).message || r.statusText}`);
    return r.json();
  }
  const toB64 = blob => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result.split(',')[1]); f.readAsDataURL(blob); });

  async function login() {
    const fd = await ask('Login Admin', `
      <p>Masukkan token GitHub anda. Ia disimpan dalam browser ini sahaja.</p>
      <ol>
        <li>Buka <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Fine-grained token baru</a></li>
        <li><b>Repository access</b>: Only select repositories → <b>heyjemal</b></li>
        <li><b>Permissions → Contents</b>: Read and write</li>
        <li>Generate token, copy, dan tampal di bawah</li>
      </ol>
      <label>Token</label><input name="token" type="password" autocomplete="off" required placeholder="github_pat_...">
      <p style="margin-top:10px">Jangan login di komputer orang lain.</p>`, 'Login');
    if (!fd) return false;
    try {
      const repo = await gh(`/repos/${REPO}`, {}, fd.token.trim());
      if (!repo.permissions?.push) throw new Error('Token ni tiada kebenaran tulis (Contents: Read and write).');
      token = fd.token.trim(); store.set('hj_token', token); store.set('hj_admin', '1');
      return true;
    } catch (e) { alert('Login gagal: ' + e.message); return false; }
  }

  async function publish() {
    if (!changes) return;
    const btn = bar.querySelector('[data-a=publish]'); btn.disabled = true;
    try {
      say('Menyimpan ke GitHub…');
      const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
      const head = await gh(`/repos/${REPO}/git/commits/${ref.object.sha}`);
      const tree = [];
      const items = Object.entries(uploads);
      for (let i = 0; i < items.length; i++) {
        const [path, blob] = items[i];
        say(`Upload fail ${i + 1}/${items.length}…`);
        const b = await gh(`/repos/${REPO}/git/blobs`, {method: 'POST', body: {content: await toB64(blob), encoding: 'base64'}});
        tree.push({path, mode: '100644', type: 'blob', sha: b.sha});
      }
      tree.push({path: 'data/media.json', mode: '100644', type: 'blob', content: JSON.stringify(M(), null, 1) + '\n'});
      deletes.forEach(path => tree.push({path, mode: '100644', type: 'blob', sha: null}));
      const t = await gh(`/repos/${REPO}/git/trees`, {method: 'POST', body: {base_tree: head.tree.sha, tree}});
      const c = await gh(`/repos/${REPO}/git/commits`, {method: 'POST', body: {
        message: `Update media from admin panel (${changes} change${changes > 1 ? 's' : ''})`, tree: t.sha, parents: [ref.object.sha]}});
      await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {method: 'PATCH', body: {sha: c.sha}});
      Object.keys(uploads).forEach(k => delete uploads[k]); deletes.clear(); changes = 0;
      updateBar(); say('✓ Dah publish. Website live berubah dalam ~1 minit.');
    } catch (e) {
      say('Publish gagal: ' + e.message); btn.disabled = false;
    }
  }

  /* ---------- admin bar ---------- */
  const bar = document.createElement('div');
  bar.className = 'adm-bar';
  bar.innerHTML = `<span>🔧 <b>Admin</b></span><span class="msg" data-a="msg"></span>
    <button class="adm-btn pri" data-a="publish">Publish</button>
    <button class="adm-btn" data-a="discard">Buang perubahan</button>
    <button class="adm-btn" data-a="logout">Keluar admin</button>`;
  const say = m => { bar.querySelector('[data-a=msg]').textContent = m; };
  function updateBar() {
    bar.querySelector('[data-a=publish]').disabled = !changes;
    bar.querySelector('[data-a=discard]').disabled = !changes;
    say(changes ? `${changes} perubahan belum publish` : 'Tiada perubahan');
  }
  bar.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'publish') publish();
    if (a === 'discard' && confirm('Buang semua perubahan yang belum publish?')) { changes = 0; location.reload(); }
    if (a === 'logout' && (!changes || confirm('Ada perubahan belum publish. Keluar juga?'))) {
      store.del('hj_token'); store.del('hj_admin'); changes = 0; location.href = location.pathname;
    }
  };
  addEventListener('beforeunload', e => { if (changes) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- videos ---------- */
  async function uploadVideo(given) {
    const [file] = given ? [given] : await pickFiles('video/mp4,video/*', false);
    if (!file) return;
    if (file.size > 90e6) return alert('Video lebih 90MB. Potong jadi preview pendek (cth 15–30 saat) atau compress dulu.');
    if (file.size > 40e6 && !confirm('Video ni besar (' + Math.round(file.size / 1e6) + 'MB) dan akan buat website lambat. Teruskan?')) return;
    const cats = [...new Set(M().videos.map(v => v.cat))];
    const fd = await ask('Video baru', `<label>Tajuk</label><input name="title" required value="${esc(file.name.replace(/\.[^.]+$/, ''))}">` +
      catField(cats, activeFilter('filters')), 'Tambah');
    if (!fd) return;
    const cat = pickCat(fd); if (!cat) return alert('Pilih atau taip kategori.');
    say('Sediakan thumbnail…');
    try {
      const id = 'u' + stamp(), thumb = `assets/thumb/${id}.jpg`, clip = `assets/clip/${id}.mp4`;
      addUpload(thumb, await videoThumb(file));
      addUpload(clip, file);
      M().videos.unshift({cat, title: fd.title.trim(), thumb, clip});
      HJ.renderWork(); changed();
    } catch (e) { alert(e.message); updateBar(); }
  }
  async function deleteVideo(i) {
    const v = M().videos[i];
    if (!confirm(`Padam video "${v.title}"?`)) return;
    M().videos.splice(i, 1);
    dropFile(v.thumb); dropFile(v.clip);
    HJ.renderWork(); changed();
  }
  async function editVideo(i) {
    const v = M().videos[i], cats = [...new Set(M().videos.map(x => x.cat))];
    const fd = await ask('Edit video', `<label>Tajuk</label><input name="title" required value="${esc(v.title)}">` + catField(cats, v.cat), 'Simpan');
    if (!fd) return;
    const cat = pickCat(fd); if (!cat) return;
    v.title = fd.title.trim(); v.cat = cat;
    HJ.renderWork(); changed();
  }

  /* ---------- photos ---------- */
  async function uploadPhotos(intoAlbum, given) {
    const files = given || await pickFiles('image/jpeg,image/png,image/webp', true);
    if (!files.length) return;
    let item = intoAlbum, cat, asAlbum = false, title = '';
    if (!item) {
      const fd = await ask(`Upload ${files.length} gambar`, catField(M().photoCats, activeFilter('photoFilters')) + `
        <label>Susunan</label>
        <div class="radio"><label><input type="radio" name="mode" value="single" ${files.length === 1 ? 'checked' : ''}> Satu-satu</label>
        <label><input type="radio" name="mode" value="album" ${files.length > 1 ? 'checked' : ''}> Jadikan album (carousel)</label></div>
        <label>Nama album (jika album)</label><input name="title" placeholder="cth: Studio Portrait">`, 'Upload');
      if (!fd) return;
      cat = pickCat(fd); if (!cat) return alert('Pilih atau taip kategori.');
      asAlbum = fd.mode === 'album'; title = (fd.title || '').trim() || cat;
      if (!M().photoCats.includes(cat)) M().photoCats.push(cat);
    }
    const id = stamp(), paths = [];
    try {
      for (let i = 0; i < files.length; i++) {
        say(`Kecilkan gambar ${i + 1}/${files.length}…`);
        const path = `assets/photo/u${id}-${String(i + 1).padStart(2, '0')}.jpg`;
        addUpload(path, await resizeImage(files[i]));
        paths.push(path);
      }
    } catch (e) { alert(e.message); paths.forEach(dropFile); return updateBar(); }
    if (item) item.photos.push(...paths);
    else if (asAlbum) M().photos.unshift({cat, title, album: true, photos: paths});
    else M().photos.unshift(...paths.map(p => ({cat, photos: [p]})));
    HJ.renderPhotos(); changed(paths.length);
  }
  function deletePhotoItem(k) {
    const it = M().photos[k];
    const what = it.album ? `album "${it.title}" (${it.photos.length} gambar)` : 'gambar ini';
    if (!confirm(`Padam ${what}?`)) return;
    M().photos.splice(k, 1);
    it.photos.forEach(dropFile);
    HJ.renderPhotos(); changed();
  }
  function deleteSlide(k, j) {
    const it = M().photos[k];
    if (it.photos.length === 1) return deletePhotoItem(k);
    if (!confirm(`Padam gambar ${j + 1} dari album "${it.title}"?`)) return;
    const [p] = it.photos.splice(j, 1);
    dropFile(p);
    HJ.renderPhotos(); changed();
  }
  async function editAlbum(k) {
    const it = M().photos[k];
    const fd = await ask('Edit album', `<label>Nama album</label><input name="title" required value="${esc(it.title)}">` + catField(M().photoCats, it.cat), 'Simpan');
    if (!fd) return;
    const cat = pickCat(fd); if (!cat) return;
    if (!M().photoCats.includes(cat)) M().photoCats.push(cat);
    it.title = fd.title.trim(); it.cat = cat;
    HJ.renderPhotos(); changed();
  }

  /* ---------- decorate rendered sections ---------- */
  function tools(beforeId, html, handlers) {
    const host = document.getElementById(beforeId);
    let t = host.previousElementSibling;
    if (!t?.classList.contains('adm-tools')) { t = document.createElement('div'); t.className = 'adm-tools'; host.before(t); }
    t.innerHTML = html;
    t.querySelectorAll('[data-t]').forEach(b => b.onclick = handlers[b.dataset.t]);
  }
  function decorateWork() {
    tools('grid', `<span>Video</span><button class="adm-btn pri" data-t="up">＋ Upload video</button>`, {up: uploadVideo});
    document.querySelectorAll('#grid .card').forEach(card => {
      const i = +card.dataset.i;
      if (uploads[M().videos[i].clip]) card.classList.add('adm-new');
      card.insertAdjacentHTML('beforeend', `<div class="adm adm-ctl"><button title="Edit tajuk / kategori" data-x="edit">✎</button><button title="Padam video" data-x="del">🗑</button></div>`);
      card.querySelector('[data-x=edit]').onclick = e => { e.stopPropagation(); editVideo(i); };
      card.querySelector('[data-x=del]').onclick = e => { e.stopPropagation(); deleteVideo(i); };
    });
  }
  function decoratePhotos() {
    tools('masonry', `<span>Gambar</span><button class="adm-btn pri" data-t="up">＋ Upload gambar / album</button>`, {up: () => uploadPhotos(null)});
    // figures keep data-i into the rendered order; map back to the media.json index (k) via the src
    document.querySelectorAll('#masonry figure').forEach(f => {
      const first = f.querySelector('img').getAttribute('src');
      const k = M().photos.findIndex(p => HJ.src(p.photos[0]) === first);
      if (k < 0) return;
      const it = M().photos[k];
      if (it.photos.some(p => uploads[p])) f.classList.add('adm-new');
      const btns = it.album
        ? `<button title="Tambah gambar ke album" data-x="add">＋</button><button title="Padam gambar yang sedang dipapar" data-x="slide">🗑</button><button title="Edit nama / kategori album" data-x="edit">✎</button><button title="Padam seluruh album" data-x="del">✕</button>`
        : `<button title="Padam gambar" data-x="del">🗑</button>`;
      f.insertAdjacentHTML('beforeend', `<div class="adm adm-ctl">${btns}</div>`);
      const on = (x, fn) => { const b = f.querySelector(`[data-x=${x}]`); if (b) b.onclick = e => { e.stopPropagation(); fn(); }; };
      on('del', () => deletePhotoItem(k));
      on('slide', () => deleteSlide(k, f.cur()));
      on('add', () => uploadPhotos(it));
      on('edit', () => editAlbum(k));
    });
  }

  /* ---------- start ---------- */
  (async () => {
    if (!token && !(await login())) { if (location.hash === '#admin') history.replaceState(null, '', location.pathname); return; }
    store.set('hj_admin', '1');
    document.body.appendChild(bar); updateBar();
    HJ.afterRender = sec => (sec === 'work' ? decorateWork : decoratePhotos)();
    decorateWork(); decoratePhotos();
    HJ.admin = {uploadPhotos, uploadVideo, pending: () => ({uploads: Object.keys(uploads), deletes: [...deletes], changes})};
  })();
})();
