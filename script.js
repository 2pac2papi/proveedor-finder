const $ = (s) => document.querySelector(s);
const status = (m) => { $("#status").textContent = m; };

const BLACKLIST = [
  'evisos.com','evisos.com.pe','perupaginas.com','perupaginas.com.pe',
  'olx.com','olx.com.pe','locanto.pe','facebook.com','instagram.com','twitter.com','x.com',
  'linkedin.com','mercadolibre.com','mercadolibre.com.pe','yapo.cl','trome.pe','elcomercio.pe',
  'craigslist.org','aliexpress.com','amazon.com'
];

const toCSV = (rows) => {
  const esc = (v='') => '"' + String(v).replaceAll('"','""') + '"';
  const headers = ["Nombre","Email","Telefono","Direccion","Ciudad","Web","Fuente"];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      esc(r.name), esc(r.email), esc(r.phone), esc(r.address), esc(r.city), esc(r.website), esc(r.source)
    ].join(','));
  }
  return lines.join('\n');
};

const render = (items=[]) => {
  const tb = $("#tbl tbody");
  tb.innerHTML = '';
  items.forEach((it, i) => {
    const tr = document.createElement('tr');
    const host = it.website ? new URL(it.website).hostname.replace(/^www\./,'') : '';
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${it.name||''}</td>
      <td>${it.email||''}</td>
      <td>${it.phone||''}</td>
      <td>${it.address||''}</td>
      <td><span class="badge">${it.city||''}</span></td>
      <td>${it.website?`<a href="${it.website}" target="_blank" rel="noopener">${host}</a>`:''}</td>
      <td>${it.source?`<a href="${it.source}" target="_blank" rel="noopener">ver</a>`:''}</td>`;
    tb.appendChild(tr);
  });
  $("#btnCSV").disabled = items.length === 0;
};

let lastRows = [];

const waitForCSE = () => new Promise(resolve => {
  const check = () => {
    if (window.google && window.google.search && window.google.search.cse && window.google.search.cse.element) resolve();
    else setTimeout(check, 100);
  };
  check();
});

const getResultLinks = (limit=15) => {
  const container = document.querySelector('.gcse-searchresults-only');
  if (!container) return [];
  const anchors = container.querySelectorAll("a.gs-title, .gsc-webResult a.gs-title");
  const urls = [];
  const seen = new Set();
  for (const a of anchors) {
    const href = a.getAttribute('data-ctorig') || a.href;
    if (!href) continue;
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./,'').toLowerCase();
      if (BLACKLIST.some(b => host === b || host.endsWith('.'+b))) continue;
      if (/\.(pdf|docx?|xlsx?)$/i.test(u.pathname)) continue;
      const key = host;
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(u.href);
      if (urls.length >= limit) break;
    } catch {}
  }
  return urls;
};

const executeCSE = async (query) => {
  await waitForCSE();
  const el = window.google.search.cse.element.getElement('pf');
  if (!el) {
    window.google.search.cse.element.render({ div: 'pf', tag: 'searchresults-only', gname: 'pf' });
  }
  window.google.search.cse.element.getElement('pf').execute(query);
};

$("#btnBuscar").addEventListener('click', async () => {
  const q = $("#q").value.trim();
  const city = $("#city").value.trim();
  const limit = Math.max(5, Math.min(30, parseInt($("#limit").value || '15')));
  if (!q) { alert('Ingresa un término de búsqueda'); return; }
  render([]); status('Buscando en Google…');
  try {
    await executeCSE(city ? `${q} ${city}` : q);
    await new Promise(r => setTimeout(r, 1200));
    const urls = getResultLinks(limit*2).slice(0, limit);
    if (!urls.length) { status('Sin resultados. Ajusta el término o aumenta el límite.'); return; }

    const res = await fetch(window.WORKER_URL + '/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls, city, limit })
    });
    const data = await res.json();
    lastRows = data.results || [];
    render(lastRows);
    status(`Listo: ${lastRows.length} proveedores (filtrados ${data.meta?.filtered||0})`);
  } catch (e) {
    console.error(e);
    status('Error al buscar o procesar resultados.');
  }
});

$("#btnCSV").addEventListener('click', () => {
  const csv = toCSV(lastRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'proveedores.csv';
  a.click();
});
