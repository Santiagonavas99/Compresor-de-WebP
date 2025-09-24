(async function () {
  // -------------------------------------------------------------
  // 🔹 Soporte para pegar imágenes desde el portapapeles
  // -------------------------------------------------------------
  document.addEventListener('paste', async (e) => {
    if (!e.clipboardData) return;
    const items = e.clipboardData.items;
    let found = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type === 'image/webp') {
        const file = item.getAsFile();
        if (file) {
          handleFiles([file]);
          found = true;
        }
      }
    }
    // Si no encontró webp, pero hay imagen genérica, también la acepta
    if (!found) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleFiles([file]);
            break;
          }
        }
      }
    }
  });
  // 🔹 Referencias a elementos
  const fileInput = document.getElementById('file');
  const drop = document.getElementById('drop');
  const btnCompress = document.getElementById('btnCompress');
  const btnDownload = document.getElementById('btnDownload');
  const btnReset = document.getElementById('btnReset');
  const preview = document.getElementById('preview');
  const q = document.getElementById('quality');
  const qualityValue = document.getElementById('qualityValue');
  const maxW = document.getElementById('maxW');
  const maxH = document.getElementById('maxH');
  const preset = document.getElementById('preset');
  const bar = document.getElementById('bar');
  const countStat = document.getElementById('countStat');
  const globalGain = document.getElementById('globalGain');
  const live = document.getElementById('live');
  const toast = document.getElementById('toast');

  // 🔹 Variables globales
  let files = [];
  let outputs = [];
  let metas = [];

  // -------------------------------------------------------------
  // 🔹 Helpers
  // -------------------------------------------------------------
  function human(n) {
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, x = n;
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
    return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + ' ' + u[i];
  }

  function cssId(name) {
    return name.replace(/[^a-z0-9]/gi, '_');
  }

  function resize(img, w, h) {
    let iw = img.width, ih = img.height;
    if (w > 0 || h > 0) {
      const rw = w > 0 ? w / iw : Infinity;
      const rh = h > 0 ? h / ih : Infinity;
      const r = Math.min(rw, rh);
      if (r < 1) { iw = Math.round(iw * r); ih = Math.round(ih * r); }
    }
    const c = document.createElement('canvas');
    c.width = iw; c.height = ih;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, iw, ih);
    return c;
  }

  function announceDone(avg) {
    live.textContent = `Compresión finalizada. Ahorro promedio ${avg.toFixed(1)} por ciento.`;
    toast.textContent = `✅ Compresión lista — ahorro promedio ${avg.toFixed(1)}%`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  // -------------------------------------------------------------
  // 🔹 Manejo de presets y calidad
  // -------------------------------------------------------------
  function updateQualityLabel() {
    const val = parseFloat(q.value);
    qualityValue.textContent = `${val.toFixed(2)} (${Math.round(val * 100)}%)`;
  }

  // Inicializar valor
  updateQualityLabel();

  // Slider de calidad
  q.addEventListener('input', updateQualityLabel);

  // Presets
  preset.addEventListener('change', () => {
    if (preset.value === 'visual') {
      q.value = 0.95; maxW.value = 0; maxH.value = 0;
    } else if (preset.value === 'ecom') {
      q.value = 0.85; maxW.value = 1600; maxH.value = 0;
    } else if (preset.value === 'max') {
      q.value = 0.7; maxW.value = 1200; maxH.value = 0;
    }
    updateQualityLabel();
  });

  // -------------------------------------------------------------
  // 🔹 Manejo de archivos
  // -------------------------------------------------------------
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => handleFiles(fileInput.files));

  function handleFiles(list) {
    files = [...list];
    preview.innerHTML = ''; outputs = []; metas = [];
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      const div = document.createElement('div');
      div.className = 'panel'; div.dataset.name = f.name;
      div.innerHTML = `
        <h3>${f.name}</h3>
        <img src="${url}"/>
        <div class="stat"><span>Original</span><span>${human(f.size)}</span></div>
        <div class="stat" id="out-${cssId(f.name)}"><span>Comprimido</span><span>—</span></div>
        <div class="stat" id="save-${cssId(f.name)}"><span>Ahorro</span><span>—</span></div>
        <button id="dl-${cssId(f.name)}" disabled>⬇ Descargar</button>`;
      preview.appendChild(div);
    });
    countStat.textContent = `0/${files.length} listas`;
    bar.style.width = '0%';
    globalGain.textContent = 'Ahorro promedio: —';
    btnCompress.disabled = files.length === 0;
  }

  // -------------------------------------------------------------
  // 🔹 Compresión
  // -------------------------------------------------------------
  async function compress() {
    outputs = []; metas = [];
    const total = files.length;
    let done = 0, savedSum = 0;

    btnCompress.disabled = true; btnDownload.disabled = true;

    for (const f of files) {
      const img = await createImageBitmap(f);
      const c = resize(img, parseInt(maxW.value) || 0, parseInt(maxH.value) || 0);
      const blob = await new Promise(res => c.toBlob(res, 'image/webp', parseFloat(q.value)));

      outputs.push({ name: f.name.replace(/\.[^.]+$/, '.webp'), blob });

      const saved = Math.max(0, 100 - (blob.size / f.size) * 100);
      metas.push({ name: f.name, sizeIn: f.size, sizeOut: blob.size, saved });

      // Actualizar UI
      const outEl = document.getElementById('out-' + cssId(f.name));
      const saveEl = document.getElementById('save-' + cssId(f.name));
      const dlBtn = document.getElementById('dl-' + cssId(f.name));
      if (outEl) outEl.lastElementChild.textContent = human(blob.size);
      if (saveEl) saveEl.lastElementChild.textContent = `${saved.toFixed(1)}%`;
      if (dlBtn) {
        dlBtn.disabled = false;
        dlBtn.onclick = () => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = f.name.replace(/\.[^.]+$/, '.webp');
          a.click();
        };
      }

      done++; savedSum += saved;
      bar.style.width = `${(done / total) * 100}%`;
      countStat.textContent = `${done}/${total} listas`;
    }

    const avg = savedSum / Math.max(1, total);
    globalGain.textContent = `Ahorro promedio: ${avg.toFixed(1)}%`;
    btnDownload.disabled = false; btnCompress.disabled = false;
    announceDone(avg);
  }

  // -------------------------------------------------------------
  // 🔹 Eventos botones
  // -------------------------------------------------------------
  btnCompress.addEventListener('click', async () => {
    const prev = btnCompress.textContent;
    btnCompress.textContent = 'Comprimiendo...';
    await compress();
    btnCompress.textContent = prev;
  });

  btnDownload.addEventListener('click', async () => {
    if (outputs.length === 1) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(outputs[0].blob);
      a.download = outputs[0].name;
      a.click();
    } else {
      const zip = new JSZip();
      outputs.forEach(o => zip.file(o.name, o.blob));
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'imagenes_comprimidas.zip';
      a.click();
    }
  });

  btnReset.addEventListener('click', () => {
    files = []; outputs = []; metas = [];
    preview.innerHTML = '';
    fileInput.value = '';
    countStat.textContent = '0/0 listas';
    bar.style.width = '0%';
    globalGain.textContent = 'Ahorro promedio: —';
    btnCompress.disabled = true; btnDownload.disabled = true;
  });




})();