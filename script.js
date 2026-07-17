// ========== CONSTANTS ==========
var APP_ID = 'fifty';
var STORAGE_KEY = 'fifty-gastos';
var CACHE_KEY = 'fifty-cache';
var ADMIN_EMAIL = 'roca.jlr@gmail.com';

var CATEGORIAS = [
  { id: 'casa', nombre: 'Casa', icono: '\u{1F3E0}' },
  { id: 'comida', nombre: 'Comida', icono: '\u{1F6D2}' },
  { id: 'ocio', nombre: 'Ocio', icono: '\u{1F389}' },
  { id: 'hijo', nombre: 'Hijo', icono: '\u{1F476}' },
  { id: 'otros', nombre: 'Otros', icono: '\u{1F4E6}' }
];

var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var currentYear = new Date().getFullYear();

// ========== STATE ==========
var supabaseClient = null;
var supabaseChannel = null;
var currentUserEmail = null;
var gastos = [];
var nextGastoId = 1;
var editingGastoId = null;
var currentView = 'gastos';
var filterMes = new Date().getMonth();
var filterAnyo = currentYear;
var fiftyMonths = {};

// ========== STORAGE ==========
function loadGastosLocal() {
  try { var s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; } catch(e) { return []; }
}

function saveGastosLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gastos));
}

function cacheGastos(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch(e) {}
}

function loadCachedGastos() {
  try { var s = localStorage.getItem(CACHE_KEY); return s ? JSON.parse(s) : null; } catch(e) { return null; }
}

// ========== SUPABASE ==========
function initSupabase() {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}

function handleGoogleLogin() {
  if (!supabaseClient) return;
  var btn = document.getElementById('btnGoogleLogin');
  btn.disabled = true;
  btn.innerHTML =
    '<svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2v4"/></svg>' +
    ' Iniciando sesi\u00F3n\u2026';
  supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

function checkSession() {
  if (!supabaseClient) return Promise.resolve(null);
  return supabaseClient.auth.getSession().then(function(result) {
    var session = result.data ? result.data.session : null;
    if (!session) return null;
    return supabaseClient.from('allowed_emails')
      .select('email').in('app_id', [APP_ID, 'all'])
      .eq('email', session.user.email).maybeSingle()
      .then(function(res) {
        if (res.data) {
          currentUserEmail = session.user.email;
          return session.user.email;
        }
        supabaseClient.auth.signOut();
        showToast('No tienes permiso para acceder');
        return null;
      }).catch(function() {
        currentUserEmail = session.user.email;
        return session.user.email;
      });
  }).catch(function() { return null; });
}

function supabaseSave(data) {
  if (!supabaseClient || !currentUserEmail) return Promise.resolve();
  return supabaseClient.from('app_data').upsert({
    app_id: APP_ID,
    data: data,
    updated_at: new Date().toISOString()
  }).then(function(res) {
    if (res.error) throw res.error;
  });
}

function supabaseLoad() {
  if (!supabaseClient || !currentUserEmail) return Promise.resolve(null);
  return supabaseClient.from('app_data')
    .select('data').eq('app_id', APP_ID).maybeSingle()
    .then(function(res) {
      if (res.data && res.data.data) return res.data.data;
      return null;
    }).catch(function() { return null; });
}

function supabaseOnChange(payload) {
  if (!payload.new || !payload.new.data) return;
  var incoming = payload.new.data;
  if (!incoming.gastos) return;
  gastos = incoming.gastos;
  fiftyMonths = incoming.fiftyMonths || {};
  calcNextId();
  cacheGastos(gastos);
  refreshCurrentView();
}

function supabaseSubscribe() {
  if (!supabaseClient || !currentUserEmail) return;
  supabaseChannel = supabaseClient.channel('fifty-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'app_data', filter: 'app_id=eq.' + APP_ID },
      supabaseOnChange
    )
    .subscribe();
}

function supabaseUnsubscribe() {
  if (supabaseChannel) {
    supabaseClient.removeChannel(supabaseChannel);
    supabaseChannel = null;
  }
}

// ========== AUTH UI ==========
function showLogin() {
  document.getElementById('viewLogin').classList.remove('hidden');
  document.getElementById('viewApp').classList.add('hidden');
  document.getElementById('fabAdd').style.display = 'none';
}

function hideLogin() {
  document.getElementById('viewLogin').classList.add('hidden');
  document.getElementById('viewApp').classList.remove('hidden');
}

// ========== DATA LOADING ==========
function loadGastos() {
  return supabaseLoad().then(function(data) {
    if (data) {
      gastos = data.gastos || [];
      fiftyMonths = data.fiftyMonths || {};
      calcNextId();
      cacheGastos(gastos);
      return true;
    }
    var cached = loadCachedGastos();
    if (cached && cached.length > 0) {
      gastos = cached;
      calcNextId();
      return true;
    }
    gastos = [];
    nextGastoId = 1;
    return true;
  });
}

function calcNextId() {
  var max = 0;
  for (var i = 0; i < gastos.length; i++) {
    if (gastos[i].id > max) max = gastos[i].id;
  }
  nextGastoId = max + 1;
}

function saveToSupabase() {
  cacheGastos(gastos);
  return supabaseSave({ gastos: gastos, fiftyMonths: fiftyMonths });
}

// ========== HELPERS ==========
function getCategoria(id) {
  for (var i = 0; i < CATEGORIAS.length; i++) {
    if (CATEGORIAS[i].id === id) return CATEGORIAS[i];
  }
  return CATEGORIAS[3];
}

function getMesActual() {
  return new Date().getMonth();
}

function getAnyoActual() {
  return currentYear;
}

// ========== GASTO CRUD ==========
function showGastoModal(id) {
  editingGastoId = id || null;
  var modal = document.getElementById('gastoModal');
  document.getElementById('gastoModalTitle').textContent = id ? 'Editar gasto' : 'Nuevo gasto';

  // Default mes/anyo from current filter
  document.getElementById('inputMes').value = filterMes;
  document.getElementById('inputAnyo').value = filterAnyo;

  document.getElementById('inputConcepto').value = '';
  document.getElementById('inputImporte').value = '';

  // Reset categoria
  var catBtns = document.querySelectorAll('#categoriaGrid .categoria-option');
  catBtns.forEach(function(b) { b.classList.remove('selected'); });

  // Reset pagador
  var pagBtns = document.querySelectorAll('#pagadorSelect .pagador-option');
  pagBtns.forEach(function(b) { b.classList.remove('selected'); });
  document.querySelector('#pagadorSelect .pagador-option[data-pagador="Juan"]').classList.add('selected');

  if (id) {
    var gasto = null;
    for (var i = 0; i < gastos.length; i++) {
      if (gastos[i].id === id) { gasto = gastos[i]; break; }
    }
    if (gasto) {
      document.getElementById('inputConcepto').value = gasto.concepto;
      document.getElementById('inputImporte').value = gasto.importe;
      var catBtn = document.querySelector('#categoriaGrid .categoria-option[data-categoria="' + gasto.categoria + '"]');
      if (catBtn) catBtn.classList.add('selected');
      var pagBtn = document.querySelector('#pagadorSelect .pagador-option[data-pagador="' + gasto.pagador + '"]');
      if (pagBtn) {
        pagBtns.forEach(function(b) { b.classList.remove('selected'); });
        pagBtn.classList.add('selected');
      }
      document.getElementById('inputMes').value = gasto.mes;
      document.getElementById('inputAnyo').value = gasto.anyo;
    }
  }

  // Apply Fifty logic if category is selected
  setTimeout(function() {
    if (isFiftyCategory()) setFiftyFields();
    else clearFiftyFields();
  }, 50);

  modal.classList.add('open');
  document.getElementById('fabAdd').style.display = 'none';
}

function hideGastoModal() {
  document.getElementById('gastoModal').classList.remove('open');
  document.getElementById('fabAdd').style.display = '';
  editingGastoId = null;
}

function handleSaveGasto(e) {
  e.preventDefault();
  var concepto = document.getElementById('inputConcepto').value.trim();
  if (!concepto) return showToast('El concepto es obligatorio');

  var importe = parseFloat(document.getElementById('inputImporte').value);
  if (!importe || importe <= 0) return showToast('Importe no v\u00E1lido');

  var selectedCat = document.querySelector('#categoriaGrid .categoria-option.selected');
  if (!selectedCat) return showToast('Selecciona una categor\u00EDa');
  var categoria = selectedCat.dataset.categoria;

  var selectedPag = document.querySelector('#pagadorSelect .pagador-option.selected');
  var pagador = selectedPag ? selectedPag.dataset.pagador : 'Juan';

  var mes = parseInt(document.getElementById('inputMes').value);
  var anyo = parseInt(document.getElementById('inputAnyo').value);

  if (editingGastoId) {
    for (var k = 0; k < gastos.length; k++) {
      if (gastos[k].id === editingGastoId) {
        gastos[k].categoria = categoria;
        gastos[k].importe = importe;
        gastos[k].pagador = pagador;
        gastos[k].mes = mes;
        gastos[k].anyo = anyo;
        gastos[k].concepto = concepto;
        break;
      }
    }
  } else {
    gastos.push({
      id: nextGastoId++,
      categoria: categoria,
      importe: importe,
      pagador: pagador,
      mes: mes,
      anyo: anyo,
      concepto: concepto,
      created_at: new Date().toISOString()
    });
  }

  hideGastoModal();
  refreshCurrentView();
  saveToSupabase().catch(function() { showToast('Error al guardar'); });
}

function deleteGasto(id) {
  showConfirm('\u00BFEliminar este gasto?', function() {
    var newGastos = [];
    for (var i = 0; i < gastos.length; i++) {
      if (gastos[i].id !== id) newGastos.push(gastos[i]);
    }
    gastos = newGastos;
    refreshCurrentView();
    saveToSupabase().catch(function() { showToast('Error al guardar'); });
  });
}

// ========== FILTERS ==========
function getFilteredGastos() {
  return gastos.filter(function(g) {
    return g.mes === filterMes && g.anyo === filterAnyo;
  });
}

function getGastosInRange(desdeMes, desdeAnyo, hastaMes, hastaAnyo, categoria) {
  return gastos.filter(function(g) {
    var gDate = g.anyo * 12 + g.mes;
    var fromDate = desdeAnyo * 12 + desdeMes;
    var toDate = hastaAnyo * 12 + hastaMes;
    if (gDate < fromDate || gDate > toDate) return false;
    if (categoria && categoria !== 'todas' && g.categoria !== categoria) return false;
    return true;
  });
}

function populateMonthSelects() {
  var selects = document.querySelectorAll('.filter-select[id="filterMes"], #inputMes, #statsDesdeMes, #statsHastaMes');
  selects.forEach(function(sel) {
    if (!sel) return;
    sel.innerHTML = '';
    for (var i = 0; i < 12; i++) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = MESES[i];
      sel.appendChild(opt);
    }
  });
}

function populateYearSelects() {
  var selects = document.querySelectorAll('.filter-select[id="filterAnyo"], #inputAnyo, #statsDesdeAnyo, #statsHastaAnyo');
  selects.forEach(function(sel) {
    if (!sel) return;
    sel.innerHTML = '';
    for (var y = currentYear; y <= currentYear; y++) {
      var opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      sel.appendChild(opt);
    }
  });
}

// ========== RENDER: MAIN ==========
function refreshCurrentView() {
  if (currentView === 'gastos') renderGastos();
  else if (currentView === 'balance') renderBalance();
  else if (currentView === 'stats') renderStats();
}

// ========== RENDER: GASTOS ==========
function renderGastos() {
  var container = document.getElementById('gastosList');
  var filtered = getFilteredGastos();
  var emptyState = document.getElementById('emptyState');

  if (gastos.length === 0) {
    emptyState.classList.remove('hidden');
    container.innerHTML = '';
    return;
  }

  emptyState.classList.add('hidden');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-content" style="padding:48px 0"><p class="empty-text" style="font-size:16px">No hay gastos este mes</p><p class="empty-sub">Cambia el filtro o a\u00F1ade un gasto</p></div>';
    return;
  }

  // Sort by newest first
  filtered.sort(function(a, b) { return (b.id || 0) - (a.id || 0); });

  var html = '<div class="gastos-list">';
  for (var i = 0; i < filtered.length; i++) {
    var g = filtered[i];
    var cat = getCategoria(g.categoria);
    html += '<div class="gasto-item categoria-' + g.categoria + '" style="animation-delay:' + (i * 0.03) + 's">' +
      '<div class="gasto-categoria-icon">' + cat.icono + '</div>' +
      '<div class="gasto-info">' +
        '<div class="gasto-concepto">' + escapeHtml(g.concepto) + '</div>' +
        '<div class="gasto-meta">' +
          '<span class="pagador-badge ' + g.pagador.toLowerCase() + '">' +
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="5"/><path d="M3 21c0-4 4-8 9-8s9 4 9 8"/></svg>' +
            g.pagador +
          '</span>' +
          '<span>' + cat.nombre + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="gasto-importe">' + g.importe.toFixed(2) + '\u20AC</div>' +
      '<div class="gasto-actions">' +
        '<button class="gasto-action-btn edit-btn" data-id="' + g.id + '" title="Editar">\u270F\uFE0F</button>' +
        '<button class="gasto-action-btn delete-btn" data-id="' + g.id + '" title="Eliminar">\u{1F5D1}\uFE0F</button>' +
      '</div>' +
    '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

// ========== RENDER: BALANCE ==========
function getMonthKey(mes, anyo) {
  return anyo + '-' + mes;
}

function toggleFiftyMonth() {
  var key = getMonthKey(filterMes, filterAnyo);
  if (fiftyMonths[key]) {
    delete fiftyMonths[key];
  } else {
    fiftyMonths[key] = true;
  }
  saveToSupabase().then(function() {
    renderBalance();
  });
}

// ========== RENDER: BALANCE ==========
function renderBalance() {
  var container = document.getElementById('balanceContent');
  var filtered = getFilteredGastos();

  var total = 0, juanTotal = 0, marTotal = 0;
  for (var i = 0; i < filtered.length; i++) {
    var g = filtered[i];
    total += g.importe;
    if (g.pagador === 'Juan') juanTotal += g.importe;
    else marTotal += g.importe;
  }

  var mitad = total / 2;
  var difJuan = juanTotal - mitad;
  var mesCerrado = !!fiftyMonths[getMonthKey(filterMes, filterAnyo)];

  var html = '<div class="balance-content">';

  // Toggle button
  html += '<div style="text-align:center;margin-bottom:12px">' +
    '<button class="btn ' + (mesCerrado ? 'btn-secondary' : 'btn-primary') + '" id="btnToggleFifty">' +
      (mesCerrado ? 'Reabrir mes' : 'Cerrar mes (Fifty)') +
    '</button>' +
  '</div>';

  // Total card
  html += '<div class="balance-card">' +
    '<div class="balance-total">Gastos totales ' + MESES[filterMes] + ' ' + filterAnyo + '</div>' +
    '<div class="balance-amount">' + total.toFixed(2) + '\u20AC</div>' +
    '<div class="balance-half">' + filtered.length + ' gastos \u00B7 ' + mitad.toFixed(2) + '\u20AC cada uno</div>' +
  '</div>';

  // Per person
  html += '<div class="balance-grid">' +
    '<div class="balance-person">' +
      '<div class="person-name">Pagado por Juan</div>' +
      '<div class="person-amount" style="color:#1d4ed8">' + juanTotal.toFixed(2) + '\u20AC</div>' +
      '<div class="person-label">' + (juanTotal > mitad ? 'Pag\u00F3 de m\u00E1s' : (juanTotal < mitad ? 'Pag\u00F3 de menos' : 'Justo')) + '</div>' +
    '</div>' +
    '<div class="balance-person">' +
      '<div class="person-name">Pagado por Mar</div>' +
      '<div class="person-amount" style="color:#db2777">' + marTotal.toFixed(2) + '\u20AC</div>' +
      '<div class="person-label">' + (marTotal > mitad ? 'Pag\u00F3 de m\u00E1s' : (marTotal < mitad ? 'Pag\u00F3 de menos' : 'Justo')) + '</div>' +
    '</div>' +
  '</div>';

  // Result
  if (total === 0) {
    html += '<div class="balance-result zero">' +
      '<div class="result-icon">&#x1F4B0;</div>' +
      '<div class="result-text">No hay gastos</div>' +
      '<div class="result-sub">A\u00F1ade gastos para ver el balance</div>' +
    '</div>';
  } else if (mesCerrado) {
    html += '<div class="balance-result zero">' +
      '<div class="result-icon">&#x2705;</div>' +
      '<div class="result-text">Mes cerrado</div>' +
      '<div class="result-sub">Est\u00E1is empatados</div>' +
    '</div>';
  } else if (Math.abs(difJuan) < 0.01) {
    html += '<div class="balance-result zero">' +
      '<div class="result-icon">&#x2705;</div>' +
      '<div class="result-text">Est\u00E1is empatados</div>' +
      '<div class="result-sub">Cada uno ha pagado exactamente la mitad</div>' +
    '</div>';
  } else if (difJuan > 0) {
    html += '<div class="balance-result positive">' +
      '<div class="result-icon">&#x1F449;</div>' +
      '<div class="result-text">Mar debe pagar a Juan</div>' +
      '<div class="result-sub" style="font-size:20px;font-weight:700;color:#16a34a;margin-top:4px">' + difJuan.toFixed(2) + '\u20AC</div>' +
    '</div>';
  } else {
    html += '<div class="balance-result negative">' +
      '<div class="result-icon">&#x1F448;</div>' +
      '<div class="result-text">Juan debe pagar a Mar</div>' +
      '<div class="result-sub" style="font-size:20px;font-weight:700;color:#d97706;margin-top:4px">' + Math.abs(difJuan).toFixed(2) + '\u20AC</div>' +
    '</div>';
  }

  html += '</div>';
  container.innerHTML = html;

  // Bind toggle
  var btn = document.getElementById('btnToggleFifty');
  if (btn) btn.addEventListener('click', toggleFiftyMonth);
}

// ========== RENDER: STATS ==========
function renderStats() {
  var container = document.getElementById('statsContent');
  var desdeMes = parseInt(document.getElementById('statsDesdeMes').value);
  var desdeAnyo = parseInt(document.getElementById('statsDesdeAnyo').value);
  var hastaMes = parseInt(document.getElementById('statsHastaMes').value);
  var hastaAnyo = parseInt(document.getElementById('statsHastaAnyo').value);
  var catFiltro = document.getElementById('statsCategoria').value;

  var filtered = getGastosInRange(desdeMes, desdeAnyo, hastaMes, hastaAnyo, catFiltro);
  var total = 0;
  var juanTotal = 0;
  var marTotal = 0;

  for (var i = 0; i < filtered.length; i++) {
    total += filtered[i].importe;
    if (filtered[i].pagador === 'Juan') juanTotal += filtered[i].importe;
    else marTotal += filtered[i].importe;
  }

  // By category
  var catTotals = {};
  for (var c = 0; c < CATEGORIAS.length; c++) {
    catTotals[CATEGORIAS[c].id] = 0;
  }
  for (var j = 0; j < filtered.length; j++) {
    catTotals[filtered[j].categoria] = (catTotals[filtered[j].categoria] || 0) + filtered[j].importe;
  }

  var html = '<div class="stats-content">';

  // Summary cards
  html += '<div class="stats-summary">' +
    '<div class="stats-summary-card"><div class="stats-label">Total</div><div class="stats-value">' + total.toFixed(2) + '\u20AC</div></div>' +
    '<div class="stats-summary-card"><div class="stats-label">Gastos</div><div class="stats-value">' + filtered.length + '</div></div>' +
    '<div class="stats-summary-card"><div class="stats-label" style="color:#1d4ed8">Juan</div><div class="stats-value" style="color:#1d4ed8">' + juanTotal.toFixed(2) + '\u20AC</div></div>' +
    '<div class="stats-summary-card"><div class="stats-label" style="color:#db2777">Mar</div><div class="stats-value" style="color:#db2777">' + marTotal.toFixed(2) + '\u20AC</div></div>' +
  '</div>';

  // Per category breakdown
  if (total > 0) {
    html += '<div class="stats-table"><div class="stats-bar-container">';
    for (var k = 0; k < CATEGORIAS.length; k++) {
      var cat = CATEGORIAS[k];
      var amount = catTotals[cat.id] || 0;
      var pct = total > 0 ? (amount / total * 100) : 0;
      if (amount === 0) continue;
      html += '<div class="stats-bar-row">' +
        '<div class="bar-label">' +
          '<span>' + cat.icono + ' ' + cat.nombre + '</span>' +
          '<span>' + amount.toFixed(2) + '\u20AC (' + pct.toFixed(1) + '%)</span>' +
        '</div>' +
        '<div class="stats-bar-bg"><div class="stats-bar-fill" style="width:' + pct + '%;background:var(--primary)"></div></div>' +
      '</div>';
    }
    html += '</div></div>';
  }

  // Per-month breakdown if range spans multiple months
  var desdeDate = desdeAnyo * 12 + desdeMes;
  var hastaDate = hastaAnyo * 12 + hastaMes;
  if (hastaDate - desdeDate > 0) {
    html += '<div class="stats-table" style="margin-top:16px"><div class="stats-bar-container">';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.4px">Por mes</div>';
    for (var d = desdeDate; d <= hastaDate; d++) {
      var m = d % 12;
      var y = Math.floor(d / 12);
      var monthTotal = 0;
      for (var n = 0; n < filtered.length; n++) {
        if (filtered[n].mes === m && filtered[n].anyo === y) monthTotal += filtered[n].importe;
      }
      if (monthTotal === 0) continue;
      var mpct = total > 0 ? (monthTotal / total * 100) : 0;
      html += '<div class="stats-bar-row">' +
        '<div class="bar-label">' +
          '<span>' + MESES[m] + ' ' + y + '</span>' +
          '<span>' + monthTotal.toFixed(2) + '\u20AC (' + mpct.toFixed(1) + '%)</span>' +
        '</div>' +
        '<div class="stats-bar-bg"><div class="stats-bar-fill" style="width:' + mpct + '%;background:var(--primary-dark)"></div></div>' +
      '</div>';
    }
    html += '</div></div>';
  }

  // Table by category
  html += '<div class="stats-table" style="margin-top:16px">';
  for (var l = 0; l < CATEGORIAS.length; l++) {
    var cat2 = CATEGORIAS[l];
    var amt = catTotals[cat2.id] || 0;
    var pct2 = total > 0 ? (amt / total * 100) : 0;
    html += '<div class="stats-row">' +
      '<span class="stat-cat-icon">' + cat2.icono + '</span>' +
      '<span class="stat-cat-name">' + cat2.nombre + '</span>' +
      '<span class="stat-cat-amount">' + amt.toFixed(2) + '\u20AC</span>' +
      '<span class="stat-cat-pct">' + pct2.toFixed(1) + '%</span>' +
    '</div>';
  }
  html += '<div class="stats-row stat-total">' +
    '<span class="stat-cat-icon">\u{1F4CA}</span>' +
    '<span class="stat-cat-name">Total</span>' +
    '<span class="stat-cat-amount">' + total.toFixed(2) + '\u20AC</span>' +
    '<span class="stat-cat-pct">100%</span>' +
  '</div>';
  html += '</div>';

  html += '</div>';
  container.innerHTML = html;
}

// ========== NAVIGATION ==========
function switchView(view) {
  currentView = view;

  // Update nav items
  var navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(function(item) {
    item.classList.toggle('active', item.dataset.view === view);
  });

  // Hide all views
  var views = ['viewGastos', 'viewBalance', 'viewStats', 'viewUsuarios'];
  views.forEach(function(v) {
    document.getElementById(v).classList.remove('active');
  });

  // Handle special views
  if (view === 'gastos') {
    document.getElementById('viewGastos').classList.add('active');
    document.getElementById('filterBar').style.display = 'flex';
    document.getElementById('bottomNav').style.display = 'flex';
    document.getElementById('fabAdd').style.display = '';
    document.getElementById('btnBack').classList.remove('visible');
    document.getElementById('headerTitle').textContent = 'FIFTY';
    renderGastos();
  } else if (view === 'balance') {
    document.getElementById('viewBalance').classList.add('active');
    document.getElementById('filterBar').style.display = 'flex';
    document.getElementById('bottomNav').style.display = 'flex';
    document.getElementById('fabAdd').style.display = 'none';
    document.getElementById('btnBack').classList.remove('visible');
    document.getElementById('headerTitle').textContent = 'FIFTY';
    document.getElementById('emptyState').classList.add('hidden');
    renderBalance();
  } else if (view === 'stats') {
    document.getElementById('viewStats').classList.add('active');
    document.getElementById('filterBar').style.display = 'none';
    document.getElementById('bottomNav').style.display = 'flex';
    document.getElementById('fabAdd').style.display = 'none';
    document.getElementById('btnBack').classList.remove('visible');
    document.getElementById('headerTitle').textContent = 'FIFTY';
    document.getElementById('emptyState').classList.add('hidden');
    renderStats();
  } else if (view === 'usuarios') {
    document.getElementById('viewUsuarios').classList.add('active');
    document.getElementById('filterBar').style.display = 'none';
    document.getElementById('bottomNav').style.display = 'none';
    document.getElementById('fabAdd').style.display = '';
    document.getElementById('btnBack').classList.add('visible');
    document.getElementById('emptyState').classList.add('hidden');
    renderUsuarios();
  }
}

// ========== TOAST ==========
var toastTimeout;
function showToast(msg) {
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(function() { toast.classList.remove('show'); }, 2000);
}

// ========== CONFIRM ==========
var confirmCallback = null;

function showConfirm(message, onConfirm, buttonText) {
  confirmCallback = onConfirm;
  document.getElementById('confirmText').textContent = message;
  document.getElementById('btnConfirmOk').textContent = buttonText || 'Eliminar';
  if (buttonText === 'Crear') {
    document.getElementById('confirmIcon').innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  } else {
    document.getElementById('confirmIcon').innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  }
  document.getElementById('modalConfirm').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeConfirm() {
  confirmCallback = null;
  document.getElementById('modalConfirm').classList.remove('open');
  document.body.style.overflow = '';
}

// ========== ESCAPE HTML ==========
function escapeHtml(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ========== ADMIN: USER MANAGEMENT ==========
function renderUsuarios() {
  if (!supabaseClient) return;
  supabaseClient.from('allowed_emails').select('email').eq('app_id', APP_ID).then(function(res) {
    var total = res.data ? res.data.length : 0;
    document.getElementById('headerTitle').textContent = 'FIFTY: Usuarios (' + total + ')';
    var html = '';
    if (res.data) {
      var filtered = res.data.filter(function(r) { return r.email !== currentUserEmail; });
      for (var i = 0; i < filtered.length; i++) {
        html += '<div class="player-card" style="cursor:default">' +
          '<div class="player-info"><div class="player-name" style="font-size:14px;text-transform:none">' + escapeHtml(filtered[i].email) + '</div></div>' +
          '<button class="btn-edit" data-email="' + escapeHtml(filtered[i].email) + '" aria-label="Editar usuario">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="btn-delete" data-email="' + escapeHtml(filtered[i].email) + '" aria-label="Eliminar usuario">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
          '</button></div>';
      }
    }
    document.getElementById('usuariosList').innerHTML = html || '<div class="empty-state"><p class="empty-title">No hay usuarios</p><p class="empty-sub">A\u00F1ade el primer email</p></div>';
  });
}

function openUsuarioModal(email) {
  document.getElementById('inviteEmail').value = email || '';
  document.getElementById('editUsuarioEmail').value = email || '';
  document.getElementById('usuarioModalTitle').textContent = email ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('modalUsuario').classList.add('open');
  setTimeout(function() { document.getElementById('inviteEmail').focus(); }, 350);
}

function closeUsuarioModal() {
  document.getElementById('modalUsuario').classList.remove('open');
  document.getElementById('editUsuarioEmail').value = '';
}

function saveUsuario() {
  var input = document.getElementById('inviteEmail');
  var email = input.value.trim();
  if (!email || email.indexOf('@') === -1) {
    showToast('Email no v\u00E1lido');
    return;
  }
  if (!supabaseClient) return;
  var oldEmail = document.getElementById('editUsuarioEmail').value;
  var doInsert = function() {
    supabaseClient.from('allowed_emails').insert({ app_id: APP_ID, email: email }).then(function(res) {
      if (res.error) {
        showToast('Error al guardar: ' + res.error.message);
      } else {
        closeUsuarioModal();
        renderUsuarios();
        showToast(oldEmail ? 'Usuario actualizado' : 'Usuario a\u00F1adido');
      }
    });
  };
  if (oldEmail && oldEmail !== email) {
    supabaseClient.from('allowed_emails').delete().eq('app_id', APP_ID).eq('email', oldEmail).then(function(res) {
      if (res.error) {
        showToast('Error al actualizar');
      } else {
        doInsert();
      }
    });
  } else {
    doInsert();
  }
}

function removeUsuario(email) {
  showConfirm('\u00BF Eliminar a ' + email + '?', function() {
    supabaseClient.from('allowed_emails').delete().eq('app_id', APP_ID).eq('email', email).then(function(res) {
      if (res.error) {
        showToast('Error al eliminar');
      } else {
        renderUsuarios();
        showToast('Usuario eliminado');
      }
    });
  });
}

function logout() {
  supabaseUnsubscribe();
  if (supabaseClient) {
    supabaseClient.auth.signOut();
  }
  currentUserEmail = null;
  gastos = [];
  showLogin();
}

// ========== SERVICE WORKER ==========
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(function(reg) {
    reg.addEventListener('updatefound', function() {
      var nuevo = reg.installing;
      nuevo.addEventListener('statechange', function() {
        if (this.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('Nueva versi\u00F3n disponible');
          this.postMessage({ action: 'skipWaiting' });
        }
      });
    });
  });

  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

// ========== INIT ==========
function init() {
  initSupabase();

  // Build categoria grid
  var catGrid = document.getElementById('categoriaGrid');
  if (catGrid) {
    for (var c = 0; c < CATEGORIAS.length; c++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'categoria-option';
      btn.dataset.categoria = CATEGORIAS[c].id;
      btn.innerHTML = '<span class="cat-emoji">' + CATEGORIAS[c].icono + '</span>' + CATEGORIAS[c].nombre;
      btn.addEventListener('click', function() {
        catGrid.querySelectorAll('.categoria-option').forEach(function(el) { el.classList.remove('selected'); });
        this.classList.add('selected');
      });
      catGrid.appendChild(btn);
    }
  }

  // Pagador select
  var pagBtns = document.querySelectorAll('#pagadorSelect .pagador-option');
  pagBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      pagBtns.forEach(function(b) { b.classList.remove('selected'); });
      this.classList.add('selected');
    });
  });

  // Fifty auto-recalc on mes/anyo change
  var inputMes = document.getElementById('inputMes');
  var inputAnyo = document.getElementById('inputAnyo');
  if (inputMes) inputMes.addEventListener('change', function() { if (isFiftyCategory()) setFiftyFields(); });
  if (inputAnyo) inputAnyo.addEventListener('change', function() { if (isFiftyCategory()) setFiftyFields(); });

  // Populate month/year selects
  var filterMesSel = document.getElementById('filterMes');
  var filterAnyoSel = document.getElementById('filterAnyo');
  var statsDesdeMes = document.getElementById('statsDesdeMes');
  var statsDesdeAnyo = document.getElementById('statsDesdeAnyo');
  var statsHastaMes = document.getElementById('statsHastaMes');
  var statsHastaAnyo = document.getElementById('statsHastaAnyo');

  [filterMesSel, inputMes, statsDesdeMes, statsHastaMes].forEach(function(sel) {
    if (!sel) return;
    for (var i = 0; i < 12; i++) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = MESES[i];
      sel.appendChild(opt);
    }
  });

  var yRange = [];
  for (var y = currentYear; y <= currentYear; y++) yRange.push(y);
  [filterAnyoSel, inputAnyo, statsDesdeAnyo, statsHastaAnyo].forEach(function(sel) {
    if (!sel) return;
    for (var j = 0; j < yRange.length; j++) {
      var opt2 = document.createElement('option');
      opt2.value = yRange[j];
      opt2.textContent = yRange[j];
      sel.appendChild(opt2);
    }
  });

  // Set default values
  filterMesSel.value = getMesActual();
  filterAnyoSel.value = getAnyoActual();
  inputMes.value = getMesActual();
  inputAnyo.value = getAnyoActual();
  if (statsDesdeMes) statsDesdeMes.value = 0;
  if (statsDesdeAnyo) statsDesdeAnyo.value = currentYear;
  if (statsHastaMes) statsHastaMes.value = 11;
  if (statsHastaAnyo) statsHastaAnyo.value = currentYear;

  document.getElementById('fabAdd').style.display = 'none';

  checkSession().then(function(email) {
    if (email) {
      currentUserEmail = email;

      loadGastos().then(function() {
        supabaseSubscribe();
        hideLogin();
        switchView('gastos');
        document.getElementById('fabAdd').style.display = '';

        // Event listeners
        document.getElementById('fabAdd').addEventListener('click', function() {
          if (currentView === 'usuarios') {
            openUsuarioModal();
          } else {
            showGastoModal(null);
          }
        });

        document.getElementById('btnCancelGasto').addEventListener('click', hideGastoModal);
        document.getElementById('btnCancelGasto2').addEventListener('click', hideGastoModal);
        document.getElementById('gastoForm').addEventListener('submit', handleSaveGasto);
        document.getElementById('gastoModalOverlay').addEventListener('click', hideGastoModal);

        // Filter changes
        filterMesSel.addEventListener('change', function() {
          filterMes = parseInt(this.value);
          refreshCurrentView();
        });
        filterAnyoSel.addEventListener('change', function() {
          filterAnyo = parseInt(this.value);
          refreshCurrentView();
        });

        // Nav items
        document.querySelectorAll('.nav-item').forEach(function(item) {
          item.addEventListener('click', function() {
            switchView(this.dataset.view);
          });
        });

        // Back button
        document.getElementById('btnBack').addEventListener('click', function() {
          if (currentView === 'usuarios') {
            switchView('gastos');
          }
        });

        // Logo -> admin
        document.getElementById('btnLogo').addEventListener('click', function() {
          if (email !== ADMIN_EMAIL) return;
          if (currentView === 'usuarios') {
            switchView('gastos');
          } else {
            switchView('usuarios');
          }
        });

        // User management
        document.getElementById('modalUsuarioClose').addEventListener('click', closeUsuarioModal);
        document.getElementById('modalUsuarioOverlay').addEventListener('click', closeUsuarioModal);
        document.getElementById('usuariosList').addEventListener('click', function(e) {
          if (e.target.closest('.btn-delete')) {
            removeUsuario(e.target.closest('.btn-delete').dataset.email);
          } else if (e.target.closest('.btn-edit')) {
            openUsuarioModal(e.target.closest('.btn-edit').dataset.email);
          }
        });
        document.getElementById('usuarioForm').addEventListener('submit', function(e) {
          e.preventDefault();
          saveUsuario();
        });

        // Gasto list actions (delegated)
        document.getElementById('gastosList').addEventListener('click', function(e) {
          var btn = e.target.closest('.gasto-action-btn');
          if (!btn) return;
          var id = parseInt(btn.dataset.id);
          if (btn.classList.contains('edit-btn')) {
            showGastoModal(id);
          } else if (btn.classList.contains('delete-btn')) {
            deleteGasto(id);
          }
        });

        // Stats button
        var btnStats = document.getElementById('btnCalcularStats');
        if (btnStats) {
          btnStats.addEventListener('click', renderStats);
        }

        // Confirm modal
        document.getElementById('btnConfirmOk').addEventListener('click', function() {
          if (confirmCallback) confirmCallback();
          closeConfirm();
        });
        document.getElementById('btnConfirmCancel').addEventListener('click', closeConfirm);
        document.getElementById('modalConfirmOverlay').addEventListener('click', closeConfirm);
      });
    } else {
      showLogin();
      document.getElementById('btnGoogleLogin').addEventListener('click', handleGoogleLogin);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
