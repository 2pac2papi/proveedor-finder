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
  for (const r of rows) lines.push([
    esc(r.name), esc(r.email), esc(r.phone), esc(r.address), esc(r.city), esc(r.website), esc(r.source)
  ].join(','));
  return lines.join('\n');
};

const appendRows = (rows) => {
  const start = document.querySelectorAll("#tbl tbody tr").length;
  const tb = $("#tbl tbody");
  rows.forEach((it, idx) => {
    const i = start + idx;
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
  document.getElementById("btnCSV").disabled = document.querySelectorAll("#tbl tbody tr").length === 0;
};

// Espera a que CSE esté listo
const waitForCSE = () => new Promise(resolve => {
  const until = Date.now() + 8000;
  const check = () => {
    if (document.documentElement.getAttribute('data-cse-ready') === '1' || (window.google?.search?.cse?.element)) return resolve();
    if (Date.now() > until) return resolve();
    setTimeout(check, 120);
  };
  check();
});

const getLinksOnce = () => {
  const container = document.querySelector('.gcse-searchresults-only');
  if (!container) return [];
  const anchors = container.querySelectorAll("a.gs-title, .gsc-webResult a.gs-title");
  const urls = []; const seen = new Set();
  for (const a of anchors) {
    const href = a.getAttribute('data-ctorig') || a.href;
    if (!href) continue;
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./,'').toLowerCase();
      if (/\.(pdf|docx?|xlsx?)$/i.test(u.pathname)) continue;
      if (BLACKLIST.some(b => host === b || host.endsWith('.'+b))) continue;
      if (seen.has(host)) continue;
      seen.add(host);
      urls.push(u.href);
    } catch {}
  }
  return urls;
};

const ensureRendered = () => {
  // Fuerza a que el contenedor tenga área para que Google inserte resultados
  const holder = document.querySelector('.invisible-cse');
  if (holder) { holder.style.width = '360px'; holder.style.height = '360px'; }
};

const executeCSE = async (query) => {
  await waitForCSE();
  ensureRendered();
  const existing = window.google?.search?.cse?.element?.getElement('pf');
  if (!existing) {
    window.google?.search?.cse?.element?.render({ div: 'pf', tag: 'searchresults-only', gname: 'pf' });
  }
  window.google?.search?.cse?.element?.getElement('pf')?.execute(query);
};

async function processInBatches(allUrls, city, limit, batchSize) {
  const urls = allUrls.slice(0, limit);
  const batches = [];
  for (let i=0; i<urls.length; i+=batchSize) batches.push(urls.slice(i, i+batchSize));
  let total = 0;
  for (let i=0; i<batches.length; i++) {
    status(`Extrayendo lote ${i+1}/${batches.length}…`);
    const res = await fetch(window.WORKER_URL + '/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls: batches[i], city, limit: batches[i].length })
    });
    const data = await res.json();
    const rows = data.results || [];
    appendRows(rows);
    total += rows.length;
  }
  status(`Listo: ${total} proveedores`);
}

document.getElementById("btnBuscar").addEventListener('click', async () => {
  const q = document.getElementById("q").value.trim();
  const city = document.getElementById("city").value.trim();
  let limit = Math.max(5, Math.min(30, parseInt(document.getElementById("limit").value || '10')));
  const fast = document.getElementById("fast").checked;
  if (fast) limit = Math.min(limit, 10);
  if (!q) { alert('Ingresa un término de búsqueda'); return; }
  document.querySelector("#tbl tbody").innerHTML = ''; status('Buscando en Google…');

  try {
    await executeCSE(city ? `${q} ${city}` : q);
    // Recolecta 2 veces con pequeñas esperas
    await new Promise(r => setTimeout(r, 1000));
    let urls = getLinksOnce();
    if (!urls.length) {
      await new Promise(r => setTimeout(r, 1300));
      urls = getLinksOnce();
    }
    if (!urls.length) {
      status('Sin resultados. Desactiva bloqueadores (uBlock/AdGuard) o Brave Shields para esta página y recarga.');
      return;
    }

    const batchSize = fast ? 4 : 6;
    await processInBatches(urls, city, limit, batchSize);
  } catch (e) {
    console.error(e);
    status('Error al buscar o procesar resultados.');
  }
});

// CSV
document.getElementById("btnCSV").addEventListener('click', () => {
  const rows = Array.from(document.querySelectorAll("#tbl tbody tr")).map(tr => {
    const tds = tr.querySelectorAll("td");
    return {
      name: tds[1]?.textContent || '',
      email: tds[2]?.textContent || '',
      phone: tds[3]?.textContent || '',
      address: tds[4]?.textContent || '',
      city: tds[5]?.innerText || '',
      website: tds[6]?.innerText || '',
      source: tds[7]?.innerText || '',
    };
  });
  const esc = (v='') => '"' + String(v).replaceAll('"','""') + '"';
  const headers = ["Nombre","Email","Telefono","Direccion","Ciudad","Web","Fuente"];
  const lines = [headers.join(',')];
  for (const r of rows) lines.push([esc(r.name),esc(r.email),esc(r.phone),esc(r.address),esc(r.city),esc(r.website),esc(r.source)].join(','));
  const blob = new Blob([lines.join("\\n")], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'proveedores.csv';
  a.click();
});
