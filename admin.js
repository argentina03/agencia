const SUPABASE_URL = window.__CONFIG__.SUPABASE_URL;
const SUPABASE_KEY = window.__CONFIG__.SUPABASE_KEY;

var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// === Helpers de fecha y bloqueos (comparten admin y pasadores) ===
function hoyISO() {
  // Fecha "local" real de Buenos Aires, sin UTC y sin corrimientos nocturnos
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

// Traer bloqueos desde la nube para una fecha (Set de siglas)
async function getBloqueosSet(fecha = hoyISO()) {
  try {
    const { data, error } = await supabase
      .from('bloqueos_hoy')
      .select('sigla')
      .eq('fecha', fecha);

    if (error) { console.warn('bloqueos_hoy (read) err:', error); return new Set(); }
    return new Set((data || []).map(r => r.sigla));
  } catch (e) {
    console.warn('bloqueos_hoy (read) ex:', e);
    return new Set();
  }
}

// Guardar selección completa para HOY: borra y vuelve a insertar
async function setBloqueosHoy(siglas, fecha = hoyISO()) {
  try {
    // borro todo lo de hoy
    await supabase.from('bloqueos_hoy').delete().eq('fecha', fecha);
    if (!siglas || siglas.length === 0) return;

    const filas = siglas.map(s => ({ fecha, sigla: s }));
    const { error } = await supabase.from('bloqueos_hoy').insert(filas);
    if (error) throw error;
  } catch (e) {
    console.error('bloqueos_hoy (write) err:', e);
    throw e;
  }
}
// 🔐 Admin padre o admin_hijo pueden ver este panel
(function () {
  const rol = (localStorage.getItem('rolUsuario') || '').toLowerCase();
  const usuario = localStorage.getItem('claveVendedor');

  if (!usuario || !rol) {
    window.location.href = 'index.html';
    return;
  }
  if (rol !== 'admin' && rol !== 'admin_hijo') {
    // vendedores siguen yendo a su panel
    window.location.href = 'panel.html';
    return;
  }

  // 🔄 Revalidar bloqueo desde la nube (lo que ya tenías)
  (async () => {
    try {
      const usuario = localStorage.getItem('claveVendedor');
      const { data } = await supabase
        .from('usuarios')
        .select('bloqueado, estado')
        .eq('usuario', usuario)
        .single();

      const bloqueado = data?.bloqueado === true || (data?.estado || '').toLowerCase() === 'bloqueado';
      if (bloqueado) {
        localStorage.removeItem('claveVendedor');
        localStorage.removeItem('rolUsuario');
        alert('⛔ Tu usuario está bloqueado.');
        window.location.href = 'index.html';
      }
    } catch (e) {
      console.warn('No se pudo revalidar bloqueo', e);
    }
  })();
})();
// --- Identidad actual y permisos globales (arreglado) ---
function usuarioActual() {
  const rolLS = (localStorage.getItem('rolUsuario') || '').toLowerCase();
  // Priorizar el usuario real logueado
  const u1 = localStorage.getItem('claveVendedor'); // setea el login
  const u2 = localStorage.getItem('usuario');
  const u3 = localStorage.getItem('vendedor');
  const u4 = localStorage.getItem('adminUsuario');   // usar solo si sos admin real
  return (u1 || u2 || u3 || (rolLS === 'admin' ? u4 : '') || '').trim() || 'invitado';
}

const USUARIO_ACTUAL = usuarioActual();
window.USUARIO_ACTUAL = USUARIO_ACTUAL;

// Se setean bien cuando corre detectarRolActual()
window.ES_CENTRAL = false;
window.ES_ADMIN_HIJO = false;

// ⚠️ borrar preferencia vieja que te fijaba “2300”
try { localStorage.removeItem('admin_pasador_sel'); } catch {}

// Lee el rol real del usuario en la tabla `usuarios`
async function detectarRolActual() {
  try {
    const u = (localStorage.getItem('claveVendedor') || '').trim();
    if (!u) return;
    const { data } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('usuario', u)
      .maybeSingle();

    const rol = (data?.rol || '').toLowerCase();
    // admin padre
    window.ES_CENTRAL    = (rol === 'admin');
    // admin hijo
    window.ES_ADMIN_HIJO = (rol === 'admin_hijo');
  } catch (e) {
    console.warn('detectarRolActual()', e);
  }
}
// vendedores que puede ver/operar el usuario actual
async function vendedoresPermitidos() {
  if (window.ES_CENTRAL) return null; // null = sin filtro
  const { data, error } = await supabase
    .from('usuarios')
    .select('usuario')
    .eq('rol', 'vendedor')
    .eq('creado_por', window.USUARIO_ACTUAL);
  if (error) { console.warn('permits', error); return []; }
  return (data || []).map(r => r.usuario);
}
// ========================== //
// 1. LOTERÍAS INICIALES
// ========================== //
if (!localStorage.getItem('loteriasConfig')) {
  const loteriasIniciales = [
    { nombre: "Nacional", sigla: "NAC", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Provincia", sigla: "PRO", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Santa Fe", sigla: "SFE", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Cordoba", sigla: "COR", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Entre Rios", sigla: "RIO", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Corrientes", sigla: "CTE", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Mendoza", sigla: "MZA", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Chaco", sigla: "CHA", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Jujuy", sigla: "JUJ", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "San Luis", sigla: "SAN", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Neuquén", sigla: "NQN", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Chubut", sigla: "CHB", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Río Negro", sigla: "RIN", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "La Rioja", sigla: "LRJ", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Salta", sigla: "SAL", horarios: ["12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Misiones", sigla: "MIS", horarios: ["10:15", "12:00", "15:00", "18:00", "21:00"] },
    { nombre: "Santa Cruz", sigla: "SCR", horarios: ["12:00", "14:30", "18:00", "21:00"] },
    { nombre: "Tucumán", sigla: "TUC", horarios: ["11:30", "14:30", "17:30", "19:30", "21:00"] },
    { nombre: "Santiago del Estero", sigla: "SGO", horarios: ["10:15", "12:00", "15:00", "19:30", "21:00"] },
    { nombre: "Montevideo", sigla: "ORO", horarios: ["15:00", "21:00"] }
  ];
  localStorage.setItem('loteriasConfig', JSON.stringify(loteriasIniciales));
}

// ==========================
// ⚙️ CONFIGURACIÓN (Global + Overrides por vendedor)
// Tablas esperadas: config_global (id int PK=1, comision numeric, bono_sabado numeric)
//                   config_overrides (vendedor text PK, comision numeric null, bono_activo boolean null, creado_por text)
//                   auditoria_config (ts timestamptz default now(), actor text, vendedor text null, campo text, valor_anterior text, valor_nuevo text)
// ==========================
async function mostrarEditarSistema() {
  const zona = document.getElementById("zonaContenido");

  // armo lista de LOTERÍAS (siglas) desde tu localStorage
  const loteriasCfg = JSON.parse(localStorage.getItem('loteriasConfig') || '[]');
  const SIGLAS = [...new Set(loteriasCfg.map(l => l.sigla))].sort();

  zona.innerHTML = `
    <h1 style="color:white;margin:0 0 12px;text-align:center">⚙️ Configuración</h1>

    <div style="display:grid; gap:16px; grid-template-columns: 1fr 1fr">
      <!-- Global -->
      <div style="background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:14px">
        <h3 style="margin:0 0 8px;color:#fff">🌍 Global</h3>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px">
          <label style="color:#bbb">Comisión diaria</label>
          <input id="g_comision" type="number" step="0.01" placeholder="0.20" style="padding:8px">

          <label style="color:#bbb">Bono sábado (%)</label>
          <input id="g_bono" type="number" step="0.01" placeholder="0.30" style="padding:8px">
        </div>
        <div style="margin-top:12px; display:flex; gap:8px">
          <button id="btnCargarGlobal" style="padding:8px 12px">⤵️ Cargar</button>
          <button id="btnGuardarGlobal" style="padding:8px 12px;background:#2ecc71;color:#fff;border:none;border-radius:6px">💾 Guardar global</button>
        </div>
        <div id="g_msg" style="margin-top:8px;color:#9ad"></div>
      </div>

      <!-- Override por vendedor -->
      <div style="background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:14px">
        <h3 style="margin:0 0 8px;color:#fff">👤 Override por vendedor</h3>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px">
          <label style="color:#bbb">Vendedor</label>
          <input id="o_vend" type="text" placeholder="ej: 2312" style="padding:8px">

          <label style="color:#bbb">Comisión (opcional)</label>
          <input id="o_comision" type="number" step="0.01" placeholder="vacío usa global" style="padding:8px">

          <label style="color:#bbb">Bono sábado (%) (opcional)</label>
          <input id="o_bono_pct" type="number" step="0.01" placeholder="vacío usa global" style="padding:8px">

          <label style="color:#bbb">Bono activo</label>
          <select id="o_bono" style="padding:8px">
            <option value="">(usar global)</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
          <button id="btnCargarOverride" style="padding:8px 12px">⤵️ Cargar</button>
          <button id="btnGuardarOverride" style="padding:8px 12px;background:#3498db;color:#fff;border:none;border-radius:6px">💾 Guardar override</button>
          <button id="btnBorrarOverride" style="padding:8px 12px;background:#e74c3c;color:#fff;border:none;border-radius:6px">🗑 Eliminar override</button>
        </div>
        <div id="o_efectiva" style="margin-top:8px;color:#9ad"></div>
      </div>
    </div>

    <!-- Auditoría -->
    <div style="margin-top:16px;background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:14px">
      <h3 style="margin:0 0 8px;color:#fff">🧾 Auditoría reciente</h3>
      <div id="auditoriaBox" style="font-family:monospace; white-space:pre-wrap; color:#ccc">Cargando…</div>
    </div>

    <!-- 🛑 Bloqueos por HOY -->
    <div style="margin-top:16px;background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:14px">
      <h3 style="margin:0 0 8px;color:#fff">🛑 Bloqueos de loterías (solo hoy: <span id="bloqFecha"></span>)</h3>
      <div id="bloqGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px"></div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button id="btnBloqCargar" style="padding:8px 12px">⤵️ Cargar bloqueos de hoy</button>
        <button id="btnBloqGuardar" style="padding:8px 12px;background:#e67e22;color:#fff;border:none;border-radius:6px">💾 Guardar para hoy</button>
        <button id="btnBloqLimpiar" style="padding:8px 12px;background:#555;color:#fff;border:none;border-radius:6px">🧹 Limpiar hoy</button>
      </div>
      <div id="bloqMsg" style="margin-top:8px;color:#9ad"></div>
    </div>
  `;

  // wiring original botones
  document.getElementById('btnCargarGlobal').onclick = cargarConfigGlobalEnUI;
  document.getElementById('btnGuardarGlobal').onclick = guardarGlobal;
  document.getElementById('btnCargarOverride').onclick = async () => {
    const v = (document.getElementById('o_vend').value || '').trim();
    if (!v) return alert('Ingresá un vendedor');
    await cargarOverrideVendedor(v);
    await mostrarConfigEfectiva(v);
  };
  document.getElementById('btnGuardarOverride').onclick = async () => {
    const v = (document.getElementById('o_vend').value || '').trim();
    if (!v) return alert('Ingresá un vendedor');
    await guardarOverrideVendedor(v);
    await mostrarConfigEfectiva(v);
  };
  document.getElementById('btnBorrarOverride').onclick = async () => {
    const v = (document.getElementById('o_vend').value || '').trim();
    if (!v) return alert('Ingresá un vendedor');
    await borrarOverrideVendedor(v);
    await mostrarConfigEfectiva(v);
  };

  // === Bloqueos UI ===
  document.getElementById('bloqFecha').textContent = hoyISO();

  // pinto la grilla de siglas
  const bloqGrid = document.getElementById('bloqGrid');
  bloqGrid.innerHTML = SIGLAS.map(sig => `
    <label style="display:flex;align-items:center;gap:6px;background:#111;border:1px solid #333;border-radius:8px;padding:8px">
      <input type="checkbox" class="bloqCheck" value="${sig}">
      <span style="color:#fff;font-weight:600">${sig}</span>
    </label>
  `).join('');

  async function cargarBloqueosDeHoyEnUI() {
    const set = await getBloqueosSet(hoyISO());
    document.querySelectorAll('.bloqCheck').forEach(chk => {
      chk.checked = set.has(chk.value);
    });
    document.getElementById('bloqMsg').textContent = `Cargado: ${set.size} bloqueadas hoy`;
  }

  async function guardarBloqueosDeHoyDesdeUI() {
    const seleccion = [...document.querySelectorAll('.bloqCheck')]
      .filter(chk => chk.checked)
      .map(chk => chk.value);
    document.getElementById('bloqMsg').textContent = 'Guardando...';
    try {
      await setBloqueosHoy(seleccion, hoyISO());
      document.getElementById('bloqMsg').textContent = `✅ Guardado. Bloqueadas hoy: ${seleccion.length}`;
    } catch {
      document.getElementById('bloqMsg').textContent = `❌ No se pudo guardar`;
    }
  }

  document.getElementById('btnBloqCargar').onclick  = cargarBloqueosDeHoyEnUI;
  document.getElementById('btnBloqGuardar').onclick = guardarBloqueosDeHoyDesdeUI;
  document.getElementById('btnBloqLimpiar').onclick = async () => {
    document.querySelectorAll('.bloqCheck').forEach(chk => chk.checked = false);
    await guardarBloqueosDeHoyDesdeUI();
  };

  // carga inicial
  await cargarConfigGlobalEnUI();
  await cargarAuditoriaEnUI();
  await cargarBloqueosDeHoyEnUI();
}

async function cargarConfigGlobalEnUI() {
  const box = document.getElementById('g_msg');
  box.textContent = 'Cargando...';
  const { data, error } = await supabase.from('config_global').select('*').eq('id', 1).maybeSingle();
  if (error) {
    console.error(error);
    box.textContent = 'Error cargando global';
    return;
  }
  document.getElementById('g_comision').value = data?.comision ?? '';
  document.getElementById('g_bono').value = data?.bono_sabado ?? '';
  box.textContent = 'Global cargado';
}

async function guardarGlobal() {
  const com = parseFloat(document.getElementById('g_comision').value || '0');
  const bono = parseFloat(document.getElementById('g_bono').value || '0');

  // upsert id=1
  const { data: previo } = await supabase.from('config_global').select('*').eq('id',1).maybeSingle();
  const { error } = await supabase.from('config_global').upsert({ id:1, comision: com, bono_sabado: bono });
  if (error) { alert('No se pudo guardar'); return; }

  await auditarCambios({
    actor: USUARIO_ACTUAL,
    vendedor: null,
    campo: 'global',
    valor_anterior: JSON.stringify(previo||{}),
    valor_nuevo: JSON.stringify({comision:com, bono_sabado:bono})
  });

  document.getElementById('g_msg').textContent = '✅ Guardado';
  await cargarAuditoriaEnUI();
}

async function cargarOverrideVendedor(vendedor) {
  const { data, error } = await supabase
    .from('config_overrides')
    .select('*')
    .eq('vendedor', vendedor)
    .maybeSingle();

  // antes:
  // if (error) { alert('Error leyendo override'); return; }

  // ahora: loguea y seguí sin frenar la UI
  if (error) {
    console.warn('Error leyendo override', error);
    // opcional: limpiar campos para que se note que no hay override
    document.getElementById('o_comision').value = '';
    document.getElementById('o_bono').value = '';
    document.getElementById('o_bono_pct').value = '';
    // 👈 no hacemos return; que siga y muestre "usar global"
  }

  document.getElementById('o_comision').value =
    (data?.comision ?? '') === null ? '' : (data?.comision ?? '');

  document.getElementById('o_bono').value =
    (data?.bono_activo === null || data?.bono_activo === undefined)
      ? ''
      : (data?.bono_activo ? 'si' : 'no');

  document.getElementById('o_bono_pct').value =
    (data?.bono_sabado ?? '') === null ? '' : (data?.bono_sabado ?? '');
}

async function mostrarConfigEfectiva(vendedor) {
  const [{ data: g }, { data: o }] = await Promise.all([
    supabase.from('config_global').select('*').eq('id',1).maybeSingle(),
    supabase.from('config_overrides').select('*').eq('vendedor', vendedor).maybeSingle()
  ]);

  const efectCom = (o?.comision ?? g?.comision ?? '-');

  // Si bono_activo es null → se considera “usar global” (activo si el global > 0)
  const bonoActivoEfectivo =
    (o?.bono_activo === null || o?.bono_activo === undefined)
      ? ((g?.bono_sabado ?? 0) > 0)
      : !!o?.bono_activo;

  const bonoPctEfectivo =
    (o?.bono_sabado !== null && o?.bono_sabado !== undefined)
      ? o?.bono_sabado
      : (g?.bono_sabado ?? 0);

  document.getElementById('o_efectiva').textContent =
    `Efectiva para ${vendedor} → Comisión: ${efectCom} | Bono activo: ${bonoActivoEfectivo ? 'Sí' : 'No'} | Bono %: ${bonoPctEfectivo ?? '-'}`;
}

async function guardarOverrideVendedor(vendedor) {
  const comTxt  = document.getElementById('o_comision').value;
  const bonoSel = document.getElementById('o_bono').value;
  const bonoPct = document.getElementById('o_bono_pct').value; // 🔹 NUEVO

  const com   = comTxt === '' ? null : parseFloat(comTxt);
  const bono  = bonoSel === '' ? null : (bonoSel === 'si');
  const bonoS = bonoPct === '' ? null : parseFloat(bonoPct); // 🔹 NUEVO

  const { data: previo } = await supabase
    .from('config_overrides')
    .select('*')
    .eq('vendedor', vendedor)
    .maybeSingle();

  const payload = {
    vendedor,
    comision: com,
    bono_activo: bono,
    bono_sabado: bonoS,          // 🔹 NUEVO
    creado_por: USUARIO_ACTUAL
  };

  const { error } = await supabase.from('config_overrides').upsert(payload);
  if (error) { alert('No se pudo guardar override'); return; }

  await auditarCambios({
    actor: USUARIO_ACTUAL,
    vendedor,
    campo: 'override',
    valor_anterior: JSON.stringify(previo||{}),
    valor_nuevo: JSON.stringify(payload)
  });

  alert('✅ Override guardado');
}

async function borrarOverrideVendedor(vendedor) {
  const { data: previo } = await supabase.from('config_overrides').select('*').eq('vendedor', vendedor).maybeSingle();
  const { error } = await supabase.from('config_overrides').delete().eq('vendedor', vendedor);
  if (error) { alert('No se pudo borrar override'); return; }

  await auditarCambios({
    actor: USUARIO_ACTUAL,
    vendedor,
    campo: 'override',
    valor_anterior: JSON.stringify(previo||{}),
    valor_nuevo: '(eliminado)'
  });

  document.getElementById('o_comision').value = '';
  document.getElementById('o_bono').value = '';
  document.getElementById('o_bono_pct').value = ''; // limpiar campo nuevo
  alert('🗑️ Override eliminado');
}

async function auditarCambios(ev) {
  await supabase.from('auditoria_config').insert({
    actor: ev.actor || USUARIO_ACTUAL,
    vendedor: ev.vendedor || null,
    campo: ev.campo,
    valor_anterior: String(ev.valor_anterior ?? ''),
    valor_nuevo: String(ev.valor_nuevo ?? '')
  });
}

async function cargarAuditoriaEnUI() {
  const box = document.getElementById('auditoriaBox');
  const { data, error } = await supabase
    .from('auditoria_config')
    .select('ts, actor, vendedor, campo, valor_nuevo')
    .order('ts', { ascending: false })
    .limit(20);
  if (error) { box.textContent = 'Error cargando auditoría'; return; }
  if (!data || data.length === 0) { box.textContent = 'Sin movimientos'; return; }

  box.textContent = data.map(r => {
    const vend = r.vendedor ? ` vend:${r.vendedor}` : '';
    return `${new Date(r.ts).toLocaleString()} | ${r.actor}${vend} | ${r.campo} → ${r.valor_nuevo}`;
  }).join('\n');
}

// ==========================
// 10. MENÚ DE SOLAPAS
// ==========================
// ==========================
// RESULTADOS — UI compacta (carga + tablero + modal)
// Reemplaza tu mostrarResultados() por esta versión
// ==========================
// ==========================
// RESULTADOS — UI compacta (carga + tablero + modal)
// ==========================

function _minutosDe(hhmm) {
  const [h, m] = String(hhmm).trim().split(':').map(Number);
  return h * 60 + m;
}

function _ahoraBuenosAiresEnMin() {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date()); // ej "12:05"
  const [h, m] = fmt.split(':').map(Number);
  return h * 60 + m;
}

async function mostrarResultados() {
  const zona = document.getElementById("zonaContenido");
  const hoy = hoyISO();

  // Config desde localStorage
  const lotCfg = JSON.parse(localStorage.getItem('loteriasConfig') || '[]');  // [{nombre, sigla, horarios}]
  const LOTS    = lotCfg.map(l => ({ sigla: l.sigla, nombre: l.nombre, horarios: l.horarios }));
  const NOMBRES = new Map(lotCfg.map(l => [l.sigla, l.nombre]));
  const HORAS   = [...new Set(lotCfg.flatMap(l => l.horarios))].sort((a,b)=>{
    const [h1,m1]=a.split(':').map(Number), [h2,m2]=b.split(':').map(Number);
    return h1-h2 || m1-m2;
  });
// Solo lectura para admin_hijo (sin carga manual ni grilla)
if (window.ES_ADMIN_HIJO) {
  const off = id => { const el = document.getElementById(id); if (el){ el.disabled = true; el.style.opacity=.5; el.title='Solo lectura (admin hijo)'; } };
  off('btnGuardarRes');     // no puede guardar
  off('btnVolcar');         // no puede volcar inputs
  off('res-pega'); off('res-sigla'); off('res-hora');
  const grid = document.getElementById('res-grid');
  if (grid) grid.style.display = 'none'; // oculta grilla de 20 números
  const css = document.createElement('style'); css.textContent = '#mBorrar{display:none !important;}';
  document.head.appendChild(css); // oculta botón "Borrar" en el modal
}
  zona.innerHTML = `
  <div style="display:grid;grid-template-columns:0.4fr 0.6fr;gap:16px;align-items:start">

    <!-- CARGA -->
<div id="panelIzq" style="background:#111;border:1px solid #333;border-radius:8px;padding:14px">
      <h3 style="margin:0 0 8px;color:#fff">📄 Carga manual</h3>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="color:#bbb">Fecha</label>
        <input type="date" id="res-fecha" value="${hoy}" style="padding:6px">

        <label style="color:#bbb">Lotería</label>
        <div>
          <select id="res-sigla" style="padding:6px">
            ${LOTS.map(l=>`<option value="${l.sigla}">${l.nombre}</option>`).join('')}
          </select>
          <select id="res-hora" style="padding:6px"></select>
          <input type="hidden" id="res-loteria">
        </div>
      </div>

      <div style="margin-top:10px">
        <label style="color:#bbb;display:block;margin-bottom:6px">🧷 Pegá los 20 números (solo 4 cifras)</label>
        <textarea id="res-pega" rows="5" style="width:100%;padding:8px;border-radius:6px"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button id="btnVolcar" style="padding:6px 10px">⬇ Volcar a inputs</button>
        </div>
      </div>

      <div id="res-grid" style="margin-top:12px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px"></div>

      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button id="btnGuardarRes" style="padding:8px 12px;background:#2ecc71;border:none;color:#fff;border-radius:6px">✅ Guardar resultado</button>
        <span id="resMsg" style="color:#9ad"></span>
      </div>
    </div>

    <!-- TABLERO -->
    <div style="background:#111;border:1px solid #333;border-radius:8px;padding:14px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <h3 style="margin:0;color:#fff">📊 Resultados del día</h3>
        <input type="date" id="tabFecha" value="${hoy}" style="margin-left:auto;padding:6px">
        <button id="btnRefrescar" style="padding:6px 10px">Actualizar</button>
      </div>
      <div id="tablero" style="display:grid;grid-template-columns: 180px repeat(${HORAS.length},1fr);gap:6px"></div>
      <div id="tabMsg" style="margin-top:6px;color:#9ad"></div>
    </div>
  </div>

  <!-- Modal -->
  <div id="resModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);place-items:start center;padding-top:60px;z-index:9999">
  <div style="background:#0b0b0b;border:1px solid #444;border-radius:10px;padding:14px;width:auto;min-width:auto;max-width:90vw">
      <div id="mTitulo" style="color:#fff;font-weight:700;margin-bottom:8px"></div>
      <div id="mLista" style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px"></div>
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">
        <button id="mCerrar" style="padding:8px 14px;font-size:15px;border-radius:6px">Cerrar</button>
      </div>
    </div>
  </div>
  `;
  // ⬇ debajo del grid principal, agrego dos secciones fijas
  zona.insertAdjacentHTML('beforeend', `

  <div style="margin-top:20px">
    <h3 style="margin:0 0 8px;color:#fff">🧾 Aciertos — filtros</h3>
    <div id="aciertosFiltros" style="display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:8px">
      <div>
        <label style="color:#bbb;font-size:12px">Desde</label><br>
        <input type="date" id="f_desde" style="padding:6px">
      </div>
      <div>
        <label style="color:#bbb;font-size:12px">Hasta</label><br>
        <input type="date" id="f_hasta" style="padding:6px">
      </div>
      <div>
        <label style="color:#bbb;font-size:12px">Pasador</label><br>
        <input type="text" id="f_vendedor" placeholder="2312..." style="padding:6px;width:120px">
      </div>
      <div>
  <label style="color:#bbb;font-size:12px">Ticket</label><br>
  <input type="number" id="f_ticket" placeholder="N° ticket" style="padding:6px;width:140px">
</div>
<div>
  <label style="color:#bbb;font-size:12px">Lotería</label><br>
  <input type="text" id="f_loteria" placeholder="PRO, NAC, SFE…" style="padding:6px;width:120px;text-transform:uppercase">
</div>
<button id="btnFiltrarAciertos" style="padding:6px 10px">Filtrar</button>
<span id="aciertosMsg" style="color:#9ad;margin-left:6px"></span>
<span id="aciertosCount" style="color:#9ad;margin-left:10px"></span>
<span id="aciertosTotal" style="color:#ffd86b;margin-left:10px;font-weight:700"></span>
    </div>

    <div style="overflow:auto;border:1px solid #333;border-radius:8px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#161616;color:#bbb">
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">Fecha</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">Lotería</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">Ticket</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">Vendedor</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">Número</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">Pos</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">Redob</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">PosR</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #333">Importe</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #333">Acierto</th>
            <th style="text-align:center;padding:8px;border-bottom:1px solid #333">Acción</th>
          </tr>
        </thead>
        <tbody id="aciertosTabla"></tbody>
      </table>
    </div>
  </div>
`);
// 🔒 Admin hijo: solo lectura en Resultados
if (window.ES_ADMIN_HIJO) {
  const off = (id) => { const el = document.getElementById(id); if (el) { el.disabled = true; el.style.opacity = .5; el.title = 'Solo lectura (admin hijo)'; } };
  off('btnGuardarRes');      // no puede guardar resultados manuales
  off('btnVolcar');          // no puede volcar inputs
  off('res-pega'); off('res-sigla'); off('res-hora');
  const grid = document.getElementById('res-grid');
  if (grid) grid.style.display = 'none'; // ocultar la grilla 1..20
  // esconder borrar en el modal, por si aparece
  const css = document.createElement('style');
  css.textContent = '#mBorrar{display:none!important;}';
  document.head.appendChild(css);
}
// Abreviaciones dentro del panel izquierdo (40% de ancho)
document.getElementById('panelIzq').insertAdjacentHTML('beforeend', `
  <div id="abrevsWrap" style="margin-top:14px">
    <h3 style="margin:0 0 8px;color:#fff"></h3>
    <div id="bloquesLoterias" style="
      display:grid;
      grid-template-columns:repeat(5,minmax(110px,1fr));
      gap:6px;
    "></div>
  </div>
`);
renderBloquesLoterias(lotCfg);
function renderBloquesLoterias(lotCfg) {
  const cont = document.getElementById('bloquesLoterias');
  if (!cont) return;
  // orden exacto según localStorage

  cont.innerHTML = lotCfg.map(l => `
  <div style="
    border:1px solid #333;border-radius:8px;padding:6px;
    background:#0f0f0f;display:flex;align-items:center;gap:6px
  ">
    <div style="
      min-width:42px;text-align:center;font-weight:800;
      color:#fff;border:1px solid #333;border-radius:6px;padding:4px 6px;
      background:#131313;font-size:13px
    ">
      ${l.sigla}
    </div>
    <div style="color:#bbb;font-size:12px">${l.nombre}</div>
  </div>
`).join('');
}
renderBloquesLoterias(lotCfg);
// --- Grilla en pares: (1,11), (2,12), ..., (10,20)
const mkInput = (n)=>`
  <div style="display:flex;gap:6px;align-items:center">
    <div style="width:24px;text-align:right;color:#bbb">${String(n).padStart(2,'0')}.</div>
    <input type="text" maxlength="4"
           class="campo-numero-ganador"
           data-idx="${n-1}"
           style="width:70px;padding:6px;text-align:center;border:1px solid #444;border-radius:6px">
  </div>`;
// defaults de filtros
const hoyFiltros = hoyISO();
const inpD = document.getElementById('f_desde');
const inpH = document.getElementById('f_hasta');
if (inpD && !inpD.value) inpD.value = hoyFiltros;
if (inpH && !inpH.value) inpH.value = hoyFiltros;

// botón Filtrar
const btnF = document.getElementById('btnFiltrarAciertos');
if (btnF) btnF.onclick = cargarAciertosConFiltros;
// 🔎 Auto-filtrado mientras escribís (con debounce)
(function(){
  let t;
  const run = ()=> { clearTimeout(t); t = setTimeout(cargarAciertosConFiltros, 250); };

  ['f_desde','f_hasta','f_vendedor','f_ticket','f_loteria'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    // escribe y filtra solo
    el.addEventListener('input', run);
    // por si cambian el date con el picker
    el.addEventListener('change', run);
  });
})();
// primera carga
cargarAciertosConFiltros();
const filas = [];
for (let i = 1; i <= 10; i++) {
  filas.push(`<div style="display:contents">${mkInput(i)}${mkInput(i+10)}</div>`);
}
document.getElementById('res-grid').innerHTML = filas.join('');
  // Después de construir LOTS (desde lotCfg)
const selSig = document.getElementById('res-sigla');
const selHor = document.getElementById('res-hora');
 function cargarHorarios(sig) {
  const lotCfgLoc = JSON.parse(localStorage.getItem('loteriasConfig') || '[]');
  const lot = lotCfgLoc.find(x => x.sigla === sig);
  const hs  = lot ? lot.horarios : [];

  // poblar el select de horarios
  selHor.innerHTML = hs.map(h => `<option value="${h}">${h}</option>`).join('');

  // preseleccionar el último horario ya pasado (BA)
  if (hs.length) {
    const ahora = _ahoraBuenosAiresEnMin();
    let bestIdx = -1, bestMin = -1;
    hs.forEach((h, i) => {
      const mins = _minutosDe(h);
      if (Number.isFinite(mins) && mins <= ahora && mins >= bestMin) {
        bestMin = mins; bestIdx = i;
      }
    });
    if (bestIdx === -1) bestIdx = hs.length - 1; // si no pasó ninguno aún, dejar el último
    selHor.selectedIndex = bestIdx;
  }
}

cargarHorarios(selSig.value);
selSig.addEventListener('change', () => cargarHorarios(selSig.value));
cargarHorarios(selSig.value);
selSig.addEventListener('change', () => cargarHorarios(selSig.value));

  // === Helpers (solo 4 cifras exactas) ===
const extraer20De4 = (texto) => (String(texto).match(/\b\d{4}\b/g) || []).slice(0, 20);

// convierte el formato 1-11-2-12-...-10-20 en 1,2,3,...,20
const reordenarFormatoColumna = (arr) => {
  const out = [];
  for (let i = 0; i < 10; i++) out.push(arr[i * 2] || '');
  for (let i = 0; i < 10; i++) out.push(arr[i * 2 + 1] || '');
  return out;
};

document.getElementById('btnVolcar').onclick = () => {
  const crudos = extraer20De4(document.getElementById('res-pega').value);
  volcarAInputs(reordenarFormatoColumna(crudos));
};

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const volcarAInputs = (arr) => {
  document.querySelectorAll('.campo-numero-ganador').forEach(inp=>{
    const idx = +inp.dataset.idx; // 0..19
    inp.value = (arr[idx] && /^\d{4}$/.test(arr[idx])) ? arr[idx] : '';
  });
};

// Cada input acepta 4 cifras o vacío
$$('.campo-numero-ganador').forEach(inp=>{
  inp.addEventListener('input', e=>{
    // solo dígitos, deja escribir 1..4 cifras (sin borrar si tiene menos de 4)
    const v = e.target.value.replace(/\D/g,'').slice(0,4);
    e.target.value = v;
  });
});

  // Guardar (usa tu subirResultadoManual intacta)
  $('#btnGuardarRes').onclick = async () => {
    const fecha = $('#res-fecha').value;
    const sigla = $('#res-sigla').value;
    const hora  = $('#res-hora').value;
  
    if (!fecha || !sigla || !hora) {
      $('#resMsg').textContent = 'Completá fecha/lotería/horario y 20 números (4 cifras).';
      return;
    }
    $('#res-loteria').value = sigla;
    $('#res-loteria').setAttribute('data-horario', hora);
    $('#resMsg').textContent='Guardando…';
    try {
      await subirResultadoManual();
$('#resMsg').textContent='✅ Guardado';

// 👇 refrescar tablero del mismo día que cargaste (si estabas cargando “ayer”)
const tabF = document.getElementById('tabFecha');
if (tabF) tabF.value = fecha;
await cargarTablero();

// 👇 refrescar la tabla de aciertos (así se borra visualmente el viejo y queda el nuevo)
if (typeof cargarAciertosConFiltros === 'function') {
  await cargarAciertosConFiltros();
}
    } catch (e) {
      console.error(e);
      $('#resMsg').textContent='❌ Error al guardar';
    }
  };
  function formatARS(n){
    try { return n.toLocaleString('es-AR', {style:'currency', currency:'ARS', maximumFractionDigits:0}); }
    catch { return '$' + (Math.round(n)||0).toLocaleString('es-AR'); }
  }
  
  async function cargarAciertosConFiltros() {
    const lot = document.getElementById('f_loteria')?.value?.trim();
    const d = document.getElementById('f_desde')?.value;
    const h = document.getElementById('f_hasta')?.value;
    const vend = document.getElementById('f_vendedor')?.value?.trim();
    const tick = document.getElementById('f_ticket')?.value?.trim();
  
    const tbody = document.getElementById('aciertosTabla');
    const msg   = document.getElementById('aciertosMsg');
    const spanC = document.getElementById('aciertosCount');
    const spanT = document.getElementById('aciertosTotal');
  
    if (tbody) tbody.innerHTML = '';
    let q = supabase
  .from('aciertos')
  .select('id, fecha, loteria, id_ticket, vendedor, numero, posicion, redoblona, pos_redoblona, importe, acierto')
  .order('fecha', { ascending: true })
  .order('id',    { ascending: true });

if (d)    q = q.gte('fecha', d);
if (h)    q = q.lte('fecha', h);
if (vend) q = q.eq('vendedor', vend);
if (tick) q = q.eq('id_ticket', Number(tick));

const lotVal = (lot || '').toUpperCase().trim();
if (lotVal) q = q.ilike('loteria', `${lotVal}%`); // “PRO”, “NAC”, etc. (empieza con)
// Si no sos central, limitá a tus vendedores
if (!window.ES_CENTRAL){
  const { data: vs } = await supabase
    .from('usuarios')
    .select('usuario')
    .eq('rol','vendedor')
    .eq('creado_por', window.USUARIO_ACTUAL);
  const lista = (vs||[]).map(v => v.usuario);

  if (lista.length === 0){
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="padding:10px;text-align:center;color:#888">Sin vendedores asignados.</td></tr>`;
    if (msg) msg.textContent = 'Sin datos';
    return;
  }

  if (vend){                         // si filtró un vendedor
    if (!lista.includes(vend)){      // ...y no es suyo → vacío
      if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="padding:10px;text-align:center;color:#888">Sin datos</td></tr>`;
      if (msg) msg.textContent = 'Sin datos';
      return;
    }
  } else {
    q = q.in('vendedor', lista);     // sino, muestro todos los suyos
  }
}
const { data, error } = await q;
    if (error) {
      console.error(error);
      if (msg) msg.textContent = 'Error cargando aciertos';
      return;
    }
  
    const rows = data || [];
    const total = rows.reduce((s, r) => s + (Number(r.acierto)||0), 0);
  // 🔽 ORDENAR POR HORARIO (lotería) + NÚMERO DE TICKET
rows.sort((a, b) => {
  // Extraer la hora (los números dentro del texto de la lotería, ej: "NAC10")
  const horaA = a.loteria.match(/\d+/) ? parseInt(a.loteria.match(/\d+/)[0]) : 0;
  const horaB = b.loteria.match(/\d+/) ? parseInt(b.loteria.match(/\d+/)[0]) : 0;
  if (horaA !== horaB) return horaA - horaB;

  // Agrupar por ticket (id_ticket)
  if (a.id_ticket !== b.id_ticket) return a.id_ticket - b.id_ticket;

  // Luego por nombre de lotería (alfabéticamente)
  return a.loteria.localeCompare(b.loteria);
});
    if (spanC) spanC.textContent = `${rows.length} acierto(s)`;
    if (spanT) spanT.textContent = `Total: ${formatARS(total)}`;
    if (msg)   msg.textContent = rows.length ? '' : 'Sin aciertos';
  
    if (!tbody) return;
  
    tbody.innerHTML = rows.map(r => `
      <tr data-id="${r.id}">
        <td style="padding:6px;border-top:1px solid #222">${r.fecha}</td>
        <td style="padding:6px;border-top:1px solid #222">${r.loteria}</td>
        <td style="padding:6px;border-top:1px solid #222">${r.id_ticket}</td>
        <td style="padding:6px;border-top:1px solid #222">${r.vendedor||''}</td>
        <td style="padding:6px;border-top:1px solid #222">${r.numero}</td>
        <td style="padding:6px;border-top:1px solid #222">${r.posicion}</td>
        <td style="padding:6px;border-top:1px solid #222">${r.redoblona||'-'}</td>
        <td style="padding:6px;border-top:1px solid #222">${r.pos_redoblona||'-'}</td>
        <td style="padding:6px;border-top:1px solid #222;text-align:right">${formatARS(Number(r.importe||0))}</td>
        <td style="padding:6px;border-top:1px solid #222;text-align:right;color:#ffd86b;font-weight:700">${formatARS(Number(r.acierto||0))}</td>
        <td style="padding:6px;border-top:1px solid #222;text-align:center">
  <button class="btnEliminar" style="padding:4px 8px;background:#e74c3c;color:#fff;border:none;border-radius:6px">Eliminar</button>
</td>
      </tr>
    `).join('');
    // ► Admin hijo no puede eliminar aciertos
if (window.ES_ADMIN_HIJO){
  tbody.querySelectorAll('.btnEliminar').forEach(b => b.remove());
}
    const sty = document.createElement('style');
    sty.textContent = `
      .row-eliminado td {
        background: #3a0f0f !important;
        color: #ff7b7b !important;
        text-decoration: line-through;
      }
    `;
    document.head.appendChild(sty);

// === eliminar en la nube con fallback usuario/vendedor ===
tbody.querySelectorAll('.btnEliminar').forEach(btn => {
  btn.onclick = async () => {
    const tr  = btn.closest('tr');
    const id  = Number(tr?.dataset?.id);
    if (!Number.isFinite(id)) return;

    if (!confirm(`¿Eliminar acierto #${id}?`)) return;

    // feedback visual mientras borra
    tr.classList.add('row-eliminado'); // rojo/tachado
    btn.disabled = true;
    btn.textContent = 'Eliminando…';

    const usuarioAdmin = (window.USUARIO_ACTUAL || localStorage.getItem('claveVendedor') || '').trim();

    // 👉 RPC que borra sin RLS, validando admin en la DB
    const { data, error } = await supabase.rpc('admin_delete_acierto_json', {
      p_id: id,
      p_usuario: usuarioAdmin
    });
    
    console.log('[RPC admin_delete_acierto_json]', data, error);
    
    if (error || !data || !(data.borradas > 0)) {
      tr.classList.remove('row-eliminado');
      btn.disabled = false;
      btn.textContent = 'Eliminar';
      alert('❌ No se pudo eliminar (no sos admin o RLS/políticas).');
      return;
    }
    
    // ✅ OK: marcar visualmente pero no recargar desde la DB
    btn.textContent = 'Eliminado';
    btn.style.opacity = '0.6';
    btn.disabled = true;
  };
});
  }
  
  // ====== Tablero del día (muestra NOMBRES completos) ======
  async function cargarTablero(){
    const fecha = document.getElementById('tabFecha').value;
    const lotCfg = JSON.parse(localStorage.getItem('loteriasConfig') || '[]'); // [{sigla,nombre,horarios}]
    const NOMBRES   = new Map(lotCfg.map(l => [l.sigla, l.nombre]));
    const HORARIOSx = new Map(lotCfg.map(l => [l.sigla, new Set(l.horarios)]));
    // ⬇ Orden EXACTO como está en el selector: usamos el orden del array del localStorage
    const FILAS = lotCfg.map(l => l.sigla);
  
    // Columnas de horas (todas las que existan en el sistema)
    const HORAS  = [...new Set(lotCfg.flatMap(l => l.horarios))].sort((a,b)=>{
      const [h1,m1]=a.split(':').map(Number), [h2,m2]=b.split(':').map(Number);
      return h1-h2 || m1-m2;
    });
  
    document.getElementById('tabMsg').textContent='Cargando…';
    const { data, error } = await supabase
  .from('resultados')
  .select('id,loteria,horario,posiciones')
  .eq('fecha', fecha)
  .order('id', { ascending: true });
  
    if (error) {
      console.error(error);
      document.getElementById('tabMsg').textContent='Error cargando';
      return;
    }
  
    const idx = new Map();
    (data||[]).forEach(r => idx.set(`${r.loteria}__${r.horario}`, r));
  
    // Header
    const hdr = `<div></div>${HORAS.map(h=>`<div style="text-align:center;color:#bbb">${h}</div>`).join('')}`;
    let html = hdr;
  
    // Filas
    FILAS.forEach((sig, filaIdx)=>{
      const nombre = NOMBRES.get(sig) || sig;
      const bg = (filaIdx % 2 === 0) ? '#0e0e0e' : '#0b0b0b';  // 🔹 franja para diferenciar fila
  
      // celda del nombre (con “renglón/cuadrado”)
      html += `<div style="color:#fff;font-weight:700;border:1px solid #333;border-radius:8px;padding:8px;background:${bg}">
                 ${nombre}
               </div>`;
  
      HORAS.forEach(h=>{
        const habilitada = HORARIOSx.get(sig)?.has(h); // 🔒 hay sorteo en ese horario?
        if (!habilitada) {
          // 🚫 sin sorteo: cruz grande visible
          html += `<div title="Sin sorteo"
                        style="text-align:center;border:1px dashed #333;
                               border-radius:8px;padding:8px;
                               background:${bg};opacity:.5;
                               color:#ff5555;font-weight:900;
                               font-size:18px;line-height:24px">
                     ✖
                   </div>`;
          return;
        }
  
        const key = `${sig}__${h}`;
        const row = idx.get(key);
        if (row?.posiciones?.length){
          const cabeza = row.posiciones[0];
          html += `<div class="celdaRes" data-sig="${sig}" data-h="${h}"
                    style="cursor:pointer;text-align:center;border:1px solid #333;border-radius:8px;padding:8px;background:${bg}">
                    <div style="font-size:18px;color:#ffd86b;font-weight:800">${cabeza}</div>
                  </div>`;
        } else {
          html += `<div style="text-align:center;border:1px dashed #333;border-radius:8px;padding:8px;color:#666;background:${bg}">—</div>`;
        }
      });
    });
  
    const cont = document.getElementById('tablero');
    cont.innerHTML = html;
    document.getElementById('tabMsg').textContent='';
  
    // Modal ver/borrar
    cont.querySelectorAll('.celdaRes').forEach(el=>{
      el.onclick = async ()=>{
        const sig = el.dataset.sig, h = el.dataset.h;
        const row = idx.get(`${sig}__${h}`);
        if (!row?.posiciones) return;
  
        const nombre = (new Map(lotCfg.map(l=>[l.sigla,l.nombre]))).get(sig) || sig;
        document.getElementById('mTitulo').textContent = `${nombre} ${h} — ${fecha}`;
        const lista = row.posiciones || [];
const col1 = lista.slice(0, 10);   // 1..10
const col2 = lista.slice(10, 20);  // 11..20

// ✅ NUEVO: llenar #mLista (2 columnas, 20% más grande)
const mLista = document.getElementById('mLista');
mLista.style.display = 'grid';
mLista.style.gridTemplateColumns = '1fr 1fr';
mLista.style.columnGap = '28px'; // antes 24px
mLista.style.rowGap = '12px';    // antes 10px
mLista.style.fontSize = '1.2em'; // agrandar texto un 20%

mLista.innerHTML = `
  <div>
    ${col1.map((n,i)=>`
      <div style="display:flex;gap:12px;align-items:center">
        <div style="width:38px;text-align:right;color:#bbb;font-size:1.2em">${String(i+1).padStart(2,'0')}.</div>
        <div style="flex:1;text-align:center;border:1px solid #333;border-radius:8px;padding:12px;background:#101010;color:#fff;font-size:1.2em">${n}</div>
      </div>`).join('')}
  </div>
  <div>
    ${col2.map((n,i)=>`
      <div style="display:flex;gap:12px;align-items:center">
        <div style="width:38px;text-align:right;color:#bbb;font-size:1.2em">${String(i+11).padStart(2,'0')}.</div>
        <div style="flex:1;text-align:center;border:1px solid #333;border-radius:8px;padding:12px;background:#101010;color:#fff;font-size:1.2em">${n}</div>
      </div>`).join('')}
  </div>
`;
        document.getElementById('resModal').style.display='grid';
  
        document.getElementById('mBorrar').onclick = async ()=>{
          if (!confirm(`¿Borrar ${nombre} ${h} (${fecha})?`)) return;
          try {
            const delR = await fetch(`${SUPABASE_URL}/rest/v1/resultados?fecha=eq.${fecha}&loteria=eq.${sig}&horario=eq.${h}`, {
              method: 'DELETE',
              headers: { apikey: SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}` }
            });
            if (!delR.ok) throw new Error(await delR.text());
            // borrar aciertos del mismo sorteo en todas las variantes de clave
const hh  = h.split(':')[0].padStart(2,'0');
const h1  = String(Number(hh));
const variantes = [
  `${sig}${hh}`,     // PRO21 / PRO09
  `${sig}${h1}`,     // PRO21 / PRO9
  `${sig}${hh}:00`,  // PRO21:00 / PRO09:00
  `${sig}${h1}:00`,  // PRO21:00 / PRO9:00
  `${sig}${hh}00`,   // PRO2100 / PRO0900
  `${sig}${h1}00`,   // PRO2100 / PRO900
];
const { error: delA } = await supabase
  .from('aciertos')
  .delete()
  .eq('fecha', fecha)
  .in('loteria', variantes);
if (delA) console.warn('Error borrando aciertos', delA, variantes);
  
            document.getElementById('resModal').style.display='none';
            await cargarTablero();
          } catch(e) {
            console.error(e);
            alert('❌ No se pudo borrar');
          }
        };
      };
    });
  
    document.getElementById('mCerrar').onclick = ()=> document.getElementById('resModal').style.display='none';
    document.getElementById('resModal').onclick = (e)=>{ if (e.target.id==='resModal') document.getElementById('resModal').style.display='none'; };
  }

  document.getElementById('btnRefrescar').onclick = cargarTablero;
  await cargarTablero();

  // Hidden que usa tu subirResultadoManual
  const syncHidden = ()=>{
    const s = document.getElementById('res-sigla').value;
    const h = document.getElementById('res-hora').value;
    document.getElementById('res-loteria').value = s;
    document.getElementById('res-loteria').setAttribute('data-horario', h);
  };
  document.getElementById('res-sigla').onchange = syncHidden;
  document.getElementById('res-hora').onchange  = syncHidden;
  syncHidden();

  document.querySelectorAll('.campo-numero-ganador').forEach(inp => {
    inp.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g,'').slice(0,4);
    });
  });
}

// --- Mostrar/ocultar solapas según rol usando el menú HTML existente ---
document.addEventListener('DOMContentLoaded', async () => {
  await detectarRolActual(); // deja listo ES_CENTRAL y ES_ADMIN_HIJO

  // 1) Enchufar los listeners a los botones que YA existen en el HTML
  document.querySelectorAll('.btn-solapa').forEach(btn => {
    btn.addEventListener('click', () => {
      const seccion = btn.getAttribute('data-seccion');
      document.querySelectorAll('.btn-solapa').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');

      switch (seccion) {
        case 'carga':           mostrarCargaJugadasAdmin(); break;
        case 'enviadas':        mostrarJugadasEnviadasAdmin(); break;
        case 'resultados':      mostrarResultados(); break;
        case 'liquidaciones':   mostrarLiquidacionesAdmin(); break;
        case 'editar':          mostrarEditarSistema(); break;
        case 'usuarios':        mostrarUsuariosAdmin(); break;
        case 'control':         mostrarControlGeneral && mostrarControlGeneral(); break;
        case 'administradores': mostrarAdministradoresAdmin && mostrarAdministradoresAdmin(); break;
        case 'cerrar':          typeof cerrarSesion === 'function' && cerrarSesion(); break;
      }
    });
  });

  // 2) Ocultar solapas según rol
  if (window.ES_ADMIN_HIJO) {
    // NO puede ver/usar "Editar Sistema"
    hide('editar');
    // (dejamos visibles: carga, enviadas, resultados, liquidaciones, usuarios, control, administradores)
  }

  function hide(sec) {
    const el = document.querySelector(`.btn-solapa[data-seccion="${sec}"]`);
    if (el) el.style.display = 'none';
  }

  // 3) Auto-seleccionar la primera visible
  const primero = Array.from(document.querySelectorAll('.btn-solapa'))
    .find(b => b.style.display !== 'none');
  if (primero) primero.click();
});
// 3. LOTERÍAS Y HORARIOS PARA LA CARGA
// ==========================
const loteriasConfig = JSON.parse(localStorage.getItem('loteriasConfig') || "[]");

const loterias = {};
const horariosSet = new Set();

loteriasConfig.forEach(lot => {
  loterias[lot.sigla] = lot.horarios;
  lot.horarios.forEach(h => horariosSet.add(h));
});

const horarios = Array.from(horariosSet).sort((a, b) => {
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  return h1 - h2 || m1 - m2;
});

async function mostrarCargaJugadasAdmin() {
  const zona = document.getElementById('zonaContenido'); // ajustá si tu contenedor tiene otro id
  const hoy = hoyISO();

  zona.innerHTML = `
    <div class="barra-superior">
      <div class="info-tiempo">
        <span id="fechaActual">--/--/----</span>
        <span id="horaActual">--:--:--</span>
        <span><i class="fa fa-user"></i> ADMIN</span>
      </div>
      <div class="atajos-info">
        <span>X = Por Afuera</span>
        <span>↑ = Posición</span>
        <span>Enter = Tab</span>
        <span>+ = Hacer bajada</span>
        <span>AvPag = Finalizar</span>
      </div>
    </div>

    <h1>Carga de Jugadas (Admin)</h1>

    <!-- Fecha & Pasador -->
    <div style="display:flex;gap:12px;align-items:center;margin:10px 0 16px">
      <label style="color:#bbb">Fecha del ticket:</label>
      <input type="date" id="fechaTicketAdmin" value="${hoy}" style="padding:6px">
      <label style="color:#bbb;margin-left:12px">Pasador:</label>
      <select id="selectPasadorAdmin" style="padding:6px">
  <option value="">Seleccionar</option>
</select>
    </div>

    <div class="cuadro-abreviaciones">
      <div><strong>NAC</strong> = NACIONAL</div>
      <div><strong>PRO</strong> = PROVINCIA</div>
      <div><strong>SFE</strong> = SANTA FE</div>
      <div><strong>COR</strong> = CÓRDOBA</div>
      <div><strong>RIO</strong> = ENTRE RIOS</div>
      <div><strong>CTE</strong> = CORRIENTES</div>
      <div><strong>MZA</strong> = MENDOZA</div>
      <div><strong>CHA</strong> = CHACO</div>
      <div><strong>JUJ</strong> = JUJUY</div>
      <div><strong>SAN</strong> = SAN LUIS</div>
      <div><strong>NQN</strong> = NEUQUÉN</div>
      <div><strong>CHB</strong> = CHUBUT</div>
      <div><strong>RIN</strong> = RÍO NEGRO</div>
      <div><strong>LRJ</strong> = LA RIOJA</div>
      <div><strong>SAL</strong> = SALTA</div>
      <div><strong>MIS</strong> = MISIONES</div>
      <div><strong>SCR</strong> = SANTA CRUZ</div>
      <div><strong>TUC</strong> = TUCUMÁN</div>
      <div><strong>SGO</strong> = SGO. DEL ESTERO</div>
      <div><strong>ORO</strong> = MONTEVIDEO</div>
    </div>

    <div style="display:flex;gap:20px">
      <!-- Izquierda: Grilla + Inputs -->
      <div style="flex:60%">
        <div class="seccion">
          <h3 style="display:flex;align-items:center;gap:8px;">
  Seleccioná los sorteos

  <button id="btnMontoTotalAdmin"
    style="font-size:12px;padding:6px 10px;border-radius:8px;
           border:1px solid #777;background:#444;color:#fff;
           cursor:pointer;font-weight:600;letter-spacing:.2px">
    Monto total
  </button>

  <button id="btnDividirMontoAdmin"
    style="font-size:12px;padding:6px 10px;border-radius:8px;
           border:1px solid #777;background:#444;color:#fff;
           cursor:pointer;font-weight:600;letter-spacing:.2px">
    Dividir monto
  </button>
</h3>
          <div class="grid-sorteos">
            <table class="tabla-sorteos">
              <thead>
                <tr>
                  <th style="width: 24px; text-align: center;">
  <input type="checkbox" id="dividirMontoAdmin" title="Dividir jugada" style="display:none">
</th>
                  <th><button id="btn-todos-sorteos-admin">Todos</button></th>
                  <th>NAC</th><th>PRO</th><th>SFE</th><th>COR</th><th>RIO</th>
                  <th>CTE</th><th>MZA</th><th>CHA</th><th>JUJ</th><th>SAN</th>
                  <th>NQN</th><th>CHB</th><th>RIN</th><th>LRJ</th>
                  <th>SAL</th><th>MIS</th><th>SCR</th><th>TUC</th><th>SGO</th><th>ORO</th>
                </tr>
              </thead>
              <tbody id="cuerpo-sorteos-admin"></tbody>
            </table>
          </div>
        </div>

        <div class="seccion">
          <h3>Jugadas</h3>
          <div class="jugada-inputs">
            <input type="text" id="numAdmin" placeholder="Número" maxlength="4" autocomplete="off">
            <input type="text" id="posAdmin" placeholder="Posición" autocomplete="off">
            <input type="text" id="impAdmin" placeholder="Importe" autocomplete="off">
          </div>
          <h3>Redoblona</h3>
          <div class="jugada-inputs">
            <input type="text" id="numrAdmin" placeholder="Número" autocomplete="off">
            <input type="text" id="posrAdmin" placeholder="Posición" autocomplete="off">
          </div>
          <button class="btn-jugar" id="btnAgregarAdmin">Agregar Apuesta</button>
        </div>
      </div>

      <!-- Derecha: Lista -->
      <div style="flex:40%">
        <div class="tabla-jugadas">
          <h3>Jugadas cargadas:</h3>
          <table>
            <thead>
              <tr>
                <th>NUM</th><th>POS</th><th>NUMR</th><th>POSR</th><th>LOT</th><th>IMPORTE</th><th>OPCIONES</th>
              </tr>
            </thead>
            <tbody id="listaJugadasAdmin"></tbody>
          </table>
          <!-- ⬇ Preview de ticket (solo Admin) -->
<div id="previewTicketAdminBox" style="margin-top:16px"></div>
<h3 id="totalAdmin" style="text-align:center;color:#fff;margin-top:10px">TOTAL: $0</h3>
          <div style="display:flex;gap:16px;justify-content:center;align-items:center;margin-top:10px">
            <button class="btn-repetir" id="btnRepetirAdmin">🔄 Repetir</button>
            <button class="btn-repetir" id="btnRepetirAdminMonto">💰 Repetir</button>
            <button class="btn-vaciar"  id="btnVaciarAdmin">🗑 Vaciar</button>
            <button class="btn-enviar"  id="btnEnviarAdmin">✅ Enviar</button>
          </div>
        </div>
      </div>
    </div>
  `;
// ▽▽▽ estilos para la grilla de selección (solo si no están)
if (!document.getElementById('carga-admin-css')) {
  const css = document.createElement('style');
  css.id = 'carga-admin-css';
  css.textContent = `
    .tabla-sorteos{ border-collapse:collapse; width:100%; }
    .tabla-sorteos th,.tabla-sorteos td{ border:1px solid #333; }
    .casilla-sorteo-admin{
      height:32px; cursor:pointer; background:#111;
      transition: transform .08s, box-shadow .08s, background .08s;
    }
    .casilla-sorteo-admin:hover{ filter:brightness(1.08); }
    .casilla-sorteo-admin.activo{
      background:#0f300f; box-shadow: inset 0 0 0 2px #00ff88; transform:scale(1.02);
    }
    .no-disponible{ background:#1a1a1a; }
    .btn-fila-admin{
      background:#111; border:1px solid #444; border-radius:6px;
      padding:6px 10px; cursor:pointer;
    }
/* 💵 Botón Repetir con Monto (azul pro) */
#btnRepetirAdminMonto {
  background: #007bff;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,123,255,.4);
  transition: all .2s ease;
}
#btnRepetirAdminMonto:hover {
  background: #1990ff;
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0,150,255,.6);
}
    /* 🔹 Agrandar botones Repetir, Vaciar y Enviar */
    #btnRepetirAdmin,
    #btnVaciarAdmin,
    #btnEnviarAdmin {
      padding: 10px 18px;
      font-size: 16px;
    }
  `;
  document.head.appendChild(css);
}
  // reloj simple
  setInterval(()=>{
    const ahora=new Date();
    const hora=ahora.toLocaleTimeString('es-AR',{hour12:false});
    const fecha=ahora.toLocaleDateString('es-AR');
    const h=document.getElementById('horaActual'), f=document.getElementById('fechaActual');
    if(h&&f){h.innerText=hora;f.innerText=fecha;}
  },1000);

  await cargarGrillaSorteosAdmin();
  manejarCargaJugadasAdmin();
  if (typeof setupMontoTotalUIAdmin === 'function') setupMontoTotalUIAdmin();
  if (typeof setupDividirMontoUIAdmin === 'function') setupDividirMontoUIAdmin();
  setupPasadoresAdmin(); // llena y escucha en tiempo real
  // Inicializar buffer de jugadas en la carga del panel
window.jugadasTempAdmin = [];

  document.getElementById('btnRepetirAdmin').onclick = repetirJugadasAdmin;
  document.getElementById('btnVaciarAdmin').onclick = ()=>{
  window.jugadasTempAdmin = [];
  document.getElementById('listaJugadasAdmin').innerHTML = '';
  actualizarTotalEnVivoAdmin();
};
  document.getElementById('btnEnviarAdmin').onclick  = enviarTicketAdmin;
  document.getElementById('btnRepetirAdminMonto').onclick = repetirJugadasAdminConMonto;
}

// ====== Pasadores dinámicos (filtrados por rol) ======
async function getPasadores(){
  try {
    let q = supabase
      .from('usuarios')
      .select('usuario, rol, creado_por')
      .in('rol', ['vendedor','pasador']);

    if (!window.ES_CENTRAL) {
      q = q.eq('creado_por', window.USUARIO_ACTUAL);
    }

    const { data, error } = await q;
    if (error) throw error;

    const set = new Set(
      (data || [])
        .filter(r => r.usuario)
        .map(r => String(r.usuario).trim())
    );
    return [...set].sort((a,b)=>a.localeCompare(b,'es'));
  } catch (_) {
    return [];
  }
}
const PASADOR_LS_KEY = `pasador_sel_${window.USUARIO_ACTUAL}`;
// Rellena el combo con la lista + opción "Agregar..."
function fillPasadoresSelect(pasadores){
  const sel = document.getElementById('selectPasadorAdmin');
  if (!sel) return;

  const remembered = localStorage.getItem(PASADOR_LS_KEY) || '';
  sel.innerHTML = '';

  // (Seleccionar)
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = 'Seleccionar';
  sel.appendChild(opt0);

  // opciones válidas
  pasadores.forEach(p => {
    const o = document.createElement('option');
    o.value = p; o.textContent = p;
    sel.appendChild(o);
  });

  // “Agregar pasador…”
  const onew = document.createElement('option');
  onew.value = '__nuevo__';
  onew.textContent = '➕ Agregar pasador…';
  sel.appendChild(onew);

  // si lo recordado NO está en la lista y NO sos central → no lo muestres
  if (remembered && (window.ES_CENTRAL || pasadores.includes(remembered))) {
    sel.value = remembered;
  } else {
    sel.value = '';
    localStorage.removeItem(PASADOR_LS_KEY);
  }
}

// Inserta un pasador nuevo en 'usuarios' (rol vendedor)
async function insertarPasador(nombre){
  const usuario = String(nombre || '').trim();
  if (!usuario) return { ok:false, error:'Nombre vacío' };

  // Evita duplicado exacto
  const { data: existe } = await supabase
    .from('usuarios')
    .select('usuario')
    .eq('usuario', usuario)
    .maybeSingle();
  if (existe) return { ok:true, ya:true };

  // Inserta con rol vendedor; clave vacía (o placeholder), ajustalo si querés
  const { error } = await supabase
    .from('usuarios')
    .insert([{ usuario, rol: 'vendedor', clave: '' }]);
  if (error) return { ok:false, error };
  return { ok:true };
}

// Arma todo: llena, escucha realtime, y maneja "Agregar pasador…"
async function setupPasadoresAdmin(){
  const sel = document.getElementById('selectPasadorAdmin');
  if (!sel) return;

  // Llenado inicial
  const lista = await getPasadores();
  fillPasadoresSelect(lista);

  // Guardar en localStorage cada vez que cambia (salvo “Agregar…”)
  sel.onchange = async () => {
    if (sel.value === '__nuevo__'){
      const nombre = prompt('Nombre de usuario del nuevo pasador (ej: juan.perez)');
      if (!nombre){ sel.value = localStorage.getItem(PASADOR_LS_KEY) || ''; return; }

      const res = await insertarPasador(nombre);
      if (!res.ok && !res.ya){
        alert('No se pudo crear el pasador en la base. Se agregará solo para esta sesión.');
        const opt = document.createElement('option');
        opt.value = nombre;
        opt.textContent = nombre;
        sel.insertBefore(opt, sel.querySelector('option[value="__nuevo__"]'));
        sel.value = nombre;
      } else {
        const nueva = await getPasadores();
        fillPasadoresSelect(nueva);
        sel.value = nombre;
      }
    }
    // Guardar selección (si no es vacío ni "__nuevo__")
    if (sel.value && sel.value !== '__nuevo__'){
      localStorage.setItem(PASADOR_LS_KEY, sel.value);
    }
  };

  // Realtime: refresca y mantiene el seleccionado (fillPasadoresSelect ya respeta LS)
  try {
    if (window.__rt_pasadores_channel) {
      await supabase.removeChannel(window.__rt_pasadores_channel);
    }
    const chan = supabase.channel('rt-pasadores');

    const refresh = async ()=>{
      const lista = await getPasadores();
      fillPasadoresSelect(lista);
    };

    chan.on('postgres_changes', { event:'INSERT', schema:'public', table:'usuarios' }, refresh);
    chan.on('postgres_changes', { event:'UPDATE', schema:'public', table:'usuarios' }, refresh);
    chan.on('postgres_changes', { event:'DELETE', schema:'public', table:'usuarios' }, refresh);

    await chan.subscribe();
    window.__rt_pasadores_channel = chan;
  } catch (e) {
    console.warn('Realtime pasadores no disponible:', e);
  }
}

// ====== Numeración Admin 10.000+ por pasador (persistente en nube) ======
async function getNextAdminTicket(pasador) {
  // Leer último número del pasador
  const { data: row, error } = await supabase
    .from('ticket_counters_admin')
    .select('ultimo')
    .eq('vendedor', pasador)
    .maybeSingle();

  let next = (row?.ultimo ?? 9999) + 1;
  if (next < 10000) next = 10000;
  if (next > 99000) next = 10000; // por si reseteás ciclo

  // Guardar nuevo valor en la nube
  const { error: upErr } = await supabase
    .from('ticket_counters_admin')
    .upsert({ vendedor: pasador, ultimo: next });

  if (upErr) {
    console.error('Error actualizando contador', upErr);
    alert('⚠️ No se pudo actualizar el contador en la nube');
  }

  return next;
}

// ====== Grilla de sorteos (idéntica a vendedor, sin bloqueos para Admin) ======
// ====== Grilla de sorteos (admin) ======
async function cargarGrillaSorteosAdmin(){
  const cuerpo = document.getElementById('cuerpo-sorteos-admin');
  if (!cuerpo) return;

  // Config desde localStorage (se autogenera si no existe en otro bloque del archivo)
  const lotCfg = JSON.parse(localStorage.getItem('loteriasConfig') || '[]');  // [{sigla,nombre,horarios}]
  const bySig  = Object.fromEntries(lotCfg.map(l=>[l.sigla, l.horarios]));

  // Orden de columnas (las que ya venís usando)
  const orden  = ['NAC','PRO','SFE','COR','RIO','CTE','MZA','CHA','JUJ','SAN','NQN','CHB','RIN','LRJ','SAL','MIS','SCR','TUC','SGO','ORO'];

  // Todas las horas ordenadas ascendente
  const horarios = [...new Set(lotCfg.flatMap(l=>l.horarios))].sort((a,b)=>{
    const [h1,m1]=a.split(':').map(Number), [h2,m2]=b.split(':').map(Number);
    return h1-h2 || m1-m2;
  });

  cuerpo.innerHTML = '';

  // Atajos visuales
  const horariosConBoton = ['10:15','12:00','15:00','18:00','21:00'];
  const principales = ['NAC','PRO','SFE','COR','RIO'];

  horarios.forEach(hora=>{
    const tr = document.createElement('tr');

    // 5️⃣ principales en esa hora
    const tdMini = document.createElement('td');
    tdMini.style.padding='0';
    tdMini.style.textAlign='center';
    if (horariosConBoton.includes(hora)){
      const mini = document.createElement('button');
      mini.textContent = '5️⃣';
      mini.title = 'Marcar 5 principales';
      mini.className = 'btn-fila-admin';
      mini.onclick = ()=>{
        const allOn = principales.every(sig=>{
          const c = document.querySelector(`.casilla-sorteo-admin[data-lot="${sig}"][data-horario="${hora}"]`);
          return c?.classList.contains('activo');
        });
        principales.forEach(sig=>{
          const c = document.querySelector(`.casilla-sorteo-admin[data-lot="${sig}"][data-horario="${hora}"]`);
          if (c) c.classList.toggle('activo', !allOn);
        });
      };
      tdMini.appendChild(mini);
    }
    tr.appendChild(tdMini);

    // Botón para toda la fila (hora)
    const tdHora = document.createElement('td');
    const bHora = document.createElement('button');
    bHora.textContent = hora;
    bHora.className = 'btn-fila-admin btn-fila-hora';
    bHora.dataset.hora = hora;
    tdHora.appendChild(bHora);
    tr.appendChild(tdHora);
    const isEnterKey = (e) => e.code === 'Enter' || e.code === 'NumpadEnter';
    // Celdas por sigla
orden.forEach(sig=>{
  const td = document.createElement('td');
  if ((bySig[sig]||[]).includes(hora)){
    td.className = 'casilla-sorteo-admin';
    td.dataset.lot = sig;
    td.dataset.horario = hora;
    td.tabIndex = 0; // accesible con teclado

    const toggle = ()=> td.classList.toggle('activo');
    td.addEventListener('click', toggle);
    td.addEventListener('keydown', (e) => {
      // ⛔️ Bloquear Enter/NumpadEnter para que NO “desmarque” la celda
      if (isEnterKey(e)) {
        e.preventDefault();
        return;
      }
      // ✅ Espacio sigue toggling
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  } else {
    td.className = 'no-disponible';
  }
  tr.appendChild(td);
});

    cuerpo.appendChild(tr);
  });

  // Botón "Todos"
  document.getElementById('btn-todos-sorteos-admin')?.addEventListener('click', ()=>{
    const celdas = document.querySelectorAll('.casilla-sorteo-admin');
    const allOn  = [...celdas].every(c=>c.classList.contains('activo'));
    celdas.forEach(c=>c.classList.toggle('activo', !allOn));
  });

  // Toggle por hora (toda la fila)
  document.querySelectorAll('.btn-fila-hora').forEach(b=>{
    b.addEventListener('click', ()=>{
      const hora=b.dataset.hora;
      const fila=[...document.querySelectorAll(`.casilla-sorteo-admin[data-horario="${hora}"]`)];
      const allOn=fila.every(c=>c.classList.contains('activo'));
      fila.forEach(c=>c.classList.toggle('activo', !allOn));
    });
  });
}
/* =========================================================
   ATAJOS CARGA (ADMIN) - SINGLETON GLOBAL (v2)
   +   = bajada 4→3→2 (no baja si hay redoblona)
   AvPag/PageDown = Enviar
   Enter = “tab” inteligente
   Flecha ↑ = campo anterior

   Nota: capturamos “+” en *keydown* (NumpadAdd, etc.)
         y también en *keypress* para Shift+'=' y layouts ES-LA.
========================================================= */
(function(){
  const get = (id)=> document.getElementById(id);
  const isInput = el => el && el.tagName === 'INPUT';
  const isEnterKey = (e) => e.code === 'Enter' || e.code === 'NumpadEnter'; // ← AÑADIR

  function getInputs(){
    return [get('numAdmin'), get('posAdmin'), get('impAdmin'), get('numrAdmin'), get('posrAdmin')].filter(Boolean);
  }

  // 🔽 BAJADA REAL (como en main.js): clona la última jugada y baja 4→3→2
function bajarYAgregarDesdeUltimaJugada(){
  // tiene que existir la lista y al menos una jugada
  const tbody = document.getElementById('listaJugadasAdmin');
  if (!tbody) return;
  const lista = tbody.querySelectorAll('tr');
  if (lista.length === 0) return;

  const pool = window.jugadasTempAdmin || [];
  if (!pool.length) return;

  const ultimaOriginal = pool[pool.length - 1];

  // si la última es redoblona, la bajada NO hereda redoblona (igual que tu main)
  const ultima = {
    ...ultimaOriginal,
    loterias: [...(ultimaOriginal.loterias || [])],
    _bajadasRealizadas: [...(ultimaOriginal._bajadasRealizadas || [])]
  };

  const num = String(ultima.numero || '').replace(/\D/g,'');
  const base = num.length;
  if (base < 3) return;

  ultima._bajadasRealizadas = ultima._bajadasRealizadas || [];

  let nuevoNumero = null;
  if (base === 4) {
    if (!ultima._bajadasRealizadas.includes('terno')) {
      nuevoNumero = num.slice(1);      // 4→3
      ultima._bajadasRealizadas.push('terno');
    } else if (!ultima._bajadasRealizadas.includes('ambo')) {
      nuevoNumero = num.slice(-2);     // 3→2
      ultima._bajadasRealizadas.push('ambo');
    } else {
      return; // ya hizo terno y ambo
    }
  } else if (base === 3) {
    if (!ultima._bajadasRealizadas.includes('ambo')) {
      nuevoNumero = num.slice(-2);     // 3→2
      ultima._bajadasRealizadas.push('ambo');
    } else {
      return;
    }
  }

  if (!nuevoNumero) return;

  const nuevaJugada = {
    numero: nuevoNumero,
    posicion: ultima.posicion,
    importe: ultima.importe,
    redoblona: null,
    posRedoblona: null,
    loterias: [...ultima.loterias]
  };

  // guardar en buffer
  window.jugadasTempAdmin.push(nuevaJugada);
  Object.freeze(nuevaJugada);
  Object.freeze(nuevaJugada.loterias);

  // pintar fila
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${nuevaJugada.numero}</td>
    <td>${nuevaJugada.posicion}</td>
    <td>${nuevaJugada.redoblona || '-'}</td>
    <td>${nuevaJugada.posRedoblona || '-'}</td>
    <td>${nuevaJugada.loterias.length}</td>
    <td>$${Number(nuevaJugada.importe).toLocaleString('es-AR')}</td>
    <td><button class='eliminar'>❌</button></td>
  `;
  tr.querySelector('.eliminar').onclick = () => {
    window.jugadasTempAdmin = window.jugadasTempAdmin.filter(x => x !== nuevaJugada);
    tr.remove();
      actualizarTotalEnVivoAdmin();
  };
  tbody.appendChild(tr);
}

  let enterTs = 0;

  // --- KEYDOWN: AvPag / NumpadAdd / variantes con keyCode ---
  function onKeyDown(e){
    if (!get('btnAgregarAdmin')) return; // solapa no montada
    const inputs = getInputs();
    const focused = document.activeElement;

    // AvPag / PageDown
    if (e.code === 'PageDown' || e.keyCode === 34){
      e.preventDefault();
      get('btnEnviarAdmin')?.click();
      return;
    }

    // "+" por numpad o códigos especiales
    // "+" por numpad o códigos especiales → BAJADA REAL
const noMods = !e.ctrlKey && !e.metaKey && !e.altKey;
const plusKeyDown =
  noMods && (e.code === 'NumpadAdd' || e.keyCode === 107);
if (plusKeyDown){
  e.preventDefault();
  bajarYAgregarDesdeUltimaJugada();
  return;
}

    // ↑ campo anterior
    if (e.code === 'ArrowUp'){
      for (let i = 1; i < inputs.length; i++){
        if (focused === inputs[i]){
          e.preventDefault();
          inputs[i-1].focus(); inputs[i-1].select?.();
          return;
        }
      }
    }

    // Enter (normal o numérico) → navegación inteligente
if (isEnterKey(e)){
      const now = Date.now();

      if (!isInput(focused)){
        if (now - enterTs < 300){
          setTimeout(()=> inputs[0]?.focus(), 30);
          enterTs = 0;
          return;
        }
        enterTs = now;
        return;
      }

      for (let i = 0; i < inputs.length; i++){
        if (focused === inputs[i]){
          e.preventDefault();
          const val = j => (inputs[j]?.value || '').trim();

          if (i === 0 && !val(0)){ alert('Completá el número'); inputs[0].focus(); return; }
          if (i === 0){ if (!val(1)) inputs[1].value = '1'; inputs[2]?.focus(); inputs[2]?.select?.(); return; }
          if (i === 2){ inputs[3]?.focus(); inputs[3]?.select?.(); return; }
          const rn = val(3), rp = val(4);
          if (i === 3 && rn && !rp){ inputs[4]?.focus(); inputs[4]?.select?.(); return; }
          if (i === 4 && !rn && rp){ inputs[3]?.focus(); inputs[3]?.select?.(); return; }

          if (i === inputs.length - 1){
            get('btnAgregarAdmin')?.click();
            inputs[0]?.focus(); inputs[0]?.select?.();
            return;
          }

          inputs[i+1]?.focus(); inputs[i+1]?.select?.();
          return;
        }
      }
    }
  }

  // --- KEYPRESS: captura el carácter real '+' (Shift+=' en ES-LA) ---
  function onKeyPress(e){
    if (!get('btnAgregarAdmin')) return;
    const noMods = !e.ctrlKey && !e.metaKey && !e.altKey;

    // e.key en keypress es el carácter resultante
    const esMasChar =
      noMods && (
        e.key === '+' ||           // plus real
        e.charCode === 43 ||       // legacy
        e.which === 43
      );

      if (esMasChar){
        e.preventDefault();
        bajarYAgregarDesdeUltimaJugada();
        return;
      }
  }

  // Evitar duplicados si recargás la solapa
  if (window.__atajosCargaAdminKD){
    document.removeEventListener('keydown', window.__atajosCargaAdminKD, true);
  }
  if (window.__atajosCargaAdminKP){
    document.removeEventListener('keypress', window.__atajosCargaAdminKP, true);
  }

  window.__atajosCargaAdminKD = onKeyDown;
  window.__atajosCargaAdminKP = onKeyPress;

  document.addEventListener('keydown',  window.__atajosCargaAdminKD, true);
  document.addEventListener('keypress', window.__atajosCargaAdminKP, true);
})();
// ====== Inputs / atajos / agregar filas ======
function manejarCargaJugadasAdmin(){
  const inputs = [
    document.getElementById('numAdmin'),
    document.getElementById('posAdmin'),
    document.getElementById('impAdmin'),
    document.getElementById('numrAdmin'),
    document.getElementById('posrAdmin')
  ];
  const lista = document.getElementById('listaJugadasAdmin');

  // saneo
  inputs.forEach((inp,i)=>{
    inp.addEventListener('input', ()=>{
      let v=inp.value;
      if (i===0) inp.value = v.replace(/\D/g,'').slice(0,4);
      if (i===1){ v=v.replace(/\D/g,''); if(+v<1||+v>20) v=''; inp.value=v; }
      if (i===2) inp.value = v.replace(/[^0-9]/g,'');
      if (i===3) inp.value = v.replace(/\D/g,'').slice(0,2);
      if (i===4){ v=v.replace(/\D/g,''); if(+v<1||+v>20) v=''; inp.value=v; }
    });
  });



  // agregar jugada
  document.getElementById('btnAgregarAdmin').onclick = ()=>{
    const numero = inputs[0].value.trim();
    const pos    = inputs[1].value.trim();
    const impStr = inputs[2].value.trim();
    const nr     = inputs[3].value.trim();
    const pr     = inputs[4].value.trim();

    if (!numero || !pos || !impStr) return alert('Faltan datos');
    if ((nr && !pr) || (!nr && pr)) return alert('Completá ambos campos de redoblona o dejalos vacíos');
    if (nr && numero.length!==2){ alert('Si hay redoblona, el número principal debe ser de 2 cifras'); inputs[0].focus(); inputs[0].select(); return; }

    const seleccion = [...document.querySelectorAll('.casilla-sorteo-admin.activo')]
  .map(c => c.dataset.lot + c.dataset.horario.split(':')[0].padStart(2,'0'));
if (seleccion.length===0) return alert('Seleccioná al menos una lotería');

const dividir = document.getElementById('dividirMontoAdmin')?.checked;
const importeTotal = Number.parseFloat(impStr);
if (!Number.isFinite(importeTotal) || importeTotal<=0) return alert('Importe inválido');

const importe = dividir ? +(importeTotal/seleccion.length).toFixed(2) : importeTotal;

const jug = {
  numero,
  posicion: pos,
  importe,
  redoblona: (nr||null),
  posRedoblona: (pr||null),
  loterias: [...seleccion]
};

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${jug.numero}</td>
      <td>${jug.posicion}</td>
      <td>${jug.redoblona||'-'}</td>
      <td>${jug.posRedoblona||'-'}</td>
      <td>${jug.loterias.length}</td>
      <td>$${jug.importe.toLocaleString('es-AR')}</td>
      <td><button class='editar'>❌</button><button class='eliminar'>❌</button></td>
    `;
    tr.querySelector('.eliminar').onclick = ()=>{
      window.jugadasTempAdmin = window.jugadasTempAdmin.filter(x=>x!==jug);
      tr.remove();
        actualizarTotalEnVivoAdmin();
    };
    tr.querySelector('.editar').onclick = ()=>{
      inputs[0].value = jug.numero;
      inputs[1].value = jug.posicion;
      inputs[2].value = jug.importe;
      inputs[3].value = jug.redoblona||'';
      inputs[4].value = jug.posRedoblona||'';
      window.jugadasTempAdmin = window.jugadasTempAdmin.filter(x=>x!==jug);
      tr.remove();
        actualizarTotalEnVivoAdmin(); // 🟢 agregado
      inputs[0].focus(); inputs[0].select();
    };

    window.jugadasTempAdmin.push(jug);
    document.getElementById('listaJugadasAdmin').appendChild(tr);
actualizarTotalEnVivoAdmin();
    // limpiar
    inputs[0].value=''; inputs[1].value='1'; inputs[3].value=''; inputs[4].value='';
    inputs[2].focus(); inputs[2].select();
  };
}

// ====== Repetir ticket (desde jugadas_enviadas) ======
function repetirJugadasAdmin(){
  const ticketId = prompt('¿Qué número de ticket querés repetir?');
  if (!ticketId) return;

  const pasadorSel = document.getElementById('selectPasadorAdmin')?.value || '';
if (!pasadorSel) return alert('Seleccioná un pasador antes de repetir un ticket');

supabase.from('jugadas_enviadas')
  .select('*')
  .eq('numero', Number(ticketId))
  .eq('vendedor', pasadorSel) // 🔹 filtra también por pasador
  .maybeSingle()
  .then(({ data, error }) => {
    if (error){ console.error(error); alert('Error buscando ticket'); return; }
    if (!data){ alert('No se encontró el ticket'); return; }

    // Si no hay selección activa, uso las mismas combinaciones del original
    let seleccion = [...document.querySelectorAll('.casilla-sorteo-admin.activo')]
      .map(c=>c.dataset.lot + c.dataset.horario.split(':')[0].padStart(2,'0'));

    if (seleccion.length===0){
      const set = new Set(data.loterias||[]);
      seleccion = [...set];
      // activarlas visualmente
      document.querySelectorAll('.casilla-sorteo-admin').forEach(c=>c.classList.remove('activo'));
      seleccion.forEach(code=>{
        const sig=code.slice(0,3), hh=code.slice(3).padStart(2,'0');
        const cel=document.querySelector(`.casilla-sorteo-admin[data-lot="${sig}"][data-horario^="${hh}"]`);
        if (cel) cel.classList.add('activo');
      });
    }

    (data.jugadas||[]).forEach(j=>{
      const jug = { numero:j.numero, posicion:j.posicion, importe:j.importe, redoblona:j.redoblona, posRedoblona:j.posRedoblona, loterias:[...seleccion] };
      window.jugadasTempAdmin.push(jug);

      const tr=document.createElement('tr');
      tr.innerHTML = `
        <td>${jug.numero}</td>
        <td>${jug.posicion}</td>
        <td>${jug.redoblona||'-'}</td>
        <td>${jug.posRedoblona||'-'}</td>
        <td>${jug.loterias.length}</td>
        <td>$${jug.importe.toLocaleString('es-AR')}</td>
        <td><button class='eliminar'>❌</button></td>
      `;
      tr.querySelector('.eliminar').onclick=()=>{
        window.jugadasTempAdmin = window.jugadasTempAdmin.filter(x=>x!==jug);
        tr.remove();
      };
      document.getElementById('listaJugadasAdmin').appendChild(tr);
      actualizarTotalEnVivoAdmin();
    });

    alert('✅ Ticket repetido');
  });
}
async function repetirJugadasAdminConMonto() {
  const ticketId = prompt("¿Qué número de ticket querés repetir?");
  if (!ticketId) return;

  const pasadorSel = document.getElementById('selectPasadorAdmin')?.value || '';
  if (!pasadorSel) return alert('Seleccioná un pasador antes de repetir un ticket.');

  // 🔒 Buscar solo tickets del pasador actual
  const { data: ticket, error } = await supabase
    .from('jugadas_enviadas')
    .select('*')
    .eq('numero', Number(ticketId))
    .eq('vendedor', pasadorSel)
    .maybeSingle();

  if (error || !ticket) {
    alert("❌ No se encontró el ticket o pertenece a otro pasador.");
    console.error(error);
    return;
  }

  const nuevoMonto = Number(prompt("💵 Ingresá el nuevo importe por jugada (ej: 50):"));
  if (!nuevoMonto || nuevoMonto <= 0) {
    alert("Importe inválido.");
    return;
  }

  // 🕒 Hora actual ARG
  const ahora = new Date();
  const ahoraArg = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const horaActual = ahoraArg.getHours() * 60 + ahoraArg.getMinutes();

  // 🎯 Si el admin seleccionó loterías manualmente → usar esas
  let seleccion = [...document.querySelectorAll('.casilla-sorteo-admin.activo')]
    .map(c => c.dataset.lot + c.dataset.horario.split(':')[0].padStart(2,'0'));

  // 🧩 Si no seleccionó nada → usar las originales pero filtradas según horario abierto
  if (seleccion.length === 0) {
    const abiertas = [];

    (ticket.loterias || []).forEach(code => {
      const pref = code.slice(0, 3);
      const hh = code.slice(3);
      const lista = loterias[pref];
      if (!lista) return;

      const [hor, min] = hh.length === 4 ? [hh.slice(0,2), hh.slice(2)] : [hh, "00"];
      const minutosSorteo = parseInt(hor) * 60 + parseInt(min);
      const sigueAbierto = horaActual < (minutosSorteo - 1);

      if (sigueAbierto) {
        abiertas.push(code);
      } else {
        // buscar el próximo horario disponible del mismo tipo
        const proximo = lista.find(horario => {
          const [h, m] = horario.split(':').map(Number);
          const minTot = h * 60 + m;
          return minTot > horaActual;
        });
        if (proximo) abiertas.push(pref + proximo.split(':')[0].padStart(2, '0'));
      }
    });

    seleccion = abiertas;

    // ⚙️ Actualizar visual
    document.querySelectorAll('.casilla-sorteo-admin').forEach(c => c.classList.remove('activo'));
    seleccion.forEach(code => {
      const sig = code.slice(0, 3);
      const hh = code.slice(3);
      const cel = document.querySelector(`.casilla-sorteo-admin[data-lot="${sig}"][data-horario^="${hh}"]`);
      if (cel) cel.classList.add('activo');
    });

    if (seleccion.length === 0) {
      alert("⛔ Todas las loterías del ticket ya cerraron por hoy.");
      return;
    }
  }

  // 🧹 Limpiar jugadas actuales
  window.jugadasTempAdmin = [];
  const tbody = document.getElementById('listaJugadasAdmin');
  if (tbody) tbody.innerHTML = '';

  // ♻️ Cargar jugadas repetidas con el nuevo monto
  (ticket.jugadas || []).forEach(j => {
    const jug = {
      numero: j.numero,
      posicion: j.posicion,
      importe: nuevoMonto,
      redoblona: j.redoblona,
      posRedoblona: j.posRedoblona,
      loterias: [...seleccion]
    };

    window.jugadasTempAdmin.push(jug);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${jug.numero}</td>
      <td>${jug.posicion}</td>
      <td>${jug.redoblona || '-'}</td>
      <td>${jug.posRedoblona || '-'}</td>
      <td>${jug.loterias.length}</td>
      <td>$${jug.importe.toLocaleString('es-AR')}</td>
      <td><button class='eliminar'>❌</button></td>
    `;
    tr.querySelector('.eliminar').onclick = () => {
      window.jugadasTempAdmin = window.jugadasTempAdmin.filter(x => x !== jug);
      tr.remove();
        actualizarTotalEnVivoAdmin();
    };
    tbody.appendChild(tr);
  });

  alert(`✅ Ticket #${ticketId} repetido con importe $${nuevoMonto}`);
  actualizarTotalEnVivoAdmin();
}

// === Helpers UI ADMIN – Monto Total & Dividir ===

// Estado persistido SOLO para admin (claves distintas del panel)
const LS_MT_ACTIVO_A  = 'montoTotalActivoAdmin';
const LS_MT_VALOR_A   = 'montoTotalValorAdmin';
const LS_DIV_ACTIVO_A = 'dividirMontoActivoAdmin';

// ---------- Monto total (Admin) ----------
function setupMontoTotalUIAdmin() {
  const btn = document.getElementById('btnMontoTotalAdmin');
  const importeInput = document.querySelectorAll('.jugada-inputs input')[2]; // campo Importe
  if (!btn || !importeInput) return;

  // estado inicial
  if (!window.__MTicketAdm) window.__MTicketAdm = { activo: false, total: 0 };
  const savedOn = localStorage.getItem(LS_MT_ACTIVO_A) === '1';
  const savedVal = Number(localStorage.getItem(LS_MT_VALOR_A) || 0);
  window.__MTicketAdm.activo = savedOn;
  window.__MTicketAdm.total  = savedVal > 0 ? savedVal : 0;
  let captured = savedVal > 0;

  const paint = (on) => {
    btn.style.backgroundColor = on ? '#2ecc71' : '#444';
    btn.style.borderColor = on ? '#27ae60' : '#777';
    const tot = Number(window.__MTicketAdm?.total || 0);
    btn.textContent = on ? (tot > 0 ? `Total: $${tot}` : 'Monto total: ON') : 'Monto total';
  };
  paint(window.__MTicketAdm.activo);

  // toggle
  btn.addEventListener('click', () => {
    const next = !window.__MTicketAdm.activo;
    window.__MTicketAdm.activo = next;

    // ⚖️ Mutuamente excluyente con "Dividir monto"
    if (next) {
      desactivarDividirMontoAdmin();
      localStorage.setItem(LS_DIV_ACTIVO_A, '0');
    }

    if (!next) {
      window.__MTicketAdm.total = 0;
      localStorage.removeItem(LS_MT_VALOR_A);
      captured = false;
    }
    localStorage.setItem(LS_MT_ACTIVO_A, next ? '1' : '0');
    paint(next);
  });

  // Capturar el primer importe como TOTAL cuando está activo
  importeInput.addEventListener('change', () => {
    if (!window.__MTicketAdm.activo || captured) return;
    const v = parseFloat(importeInput.value);
    if (Number.isFinite(v) && v > 0) {
      window.__MTicketAdm.total = v;
      localStorage.setItem(LS_MT_VALOR_A, String(v));
      captured = true;
      paint(true);
    }
  });
}

function desactivarMontoTotalAdmin() {
  window.__MTicketAdm = window.__MTicketAdm || { activo: false, total: 0 };
  window.__MTicketAdm.activo = false;
  window.__MTicketAdm.total = 0;
  try {
    localStorage.setItem(LS_MT_ACTIVO_A, '0');
    localStorage.removeItem(LS_MT_VALOR_A);
  } catch {}
  const btn = document.getElementById('btnMontoTotalAdmin');
  if (btn) {
    btn.style.backgroundColor = '#444';
    btn.style.borderColor = '#777';
    btn.textContent = 'Monto total';
  }
}

// ---------- Dividir monto (Admin) ----------
function updateDividirBtnUIAdmin(active) {
  const btn = document.getElementById('btnDividirMontoAdmin');
  if (!btn) return;
  btn.style.backgroundColor = active ? '#2ecc71' : '#444';
  btn.style.borderColor = active ? '#27ae60' : '#777';
  btn.textContent = active ? 'Dividir monto: ON' : 'Dividir monto';
}

function setupDividirMontoUIAdmin() {
  const btn = document.getElementById('btnDividirMontoAdmin');
  const chk = document.getElementById('dividirMontoAdmin'); // checkbox oculto
  if (!btn || !chk) return;

  // estado inicial
  const saved = localStorage.getItem(LS_DIV_ACTIVO_A);
  const initialActive = saved === '1' || (saved === null && !!chk.checked);
  chk.checked = !!initialActive;
  updateDividirBtnUIAdmin(chk.checked);

  // click botón => toggle checkbox + persistir
  btn.addEventListener('click', () => {
    const next = !chk.checked;
    chk.checked = next;

    // ⚖️ Mutuamente excluyente con "Monto total"
    if (next) {
      desactivarMontoTotalAdmin();
      localStorage.setItem(LS_MT_ACTIVO_A, '0');
      localStorage.removeItem(LS_MT_VALOR_A);
    }

    localStorage.setItem(LS_DIV_ACTIVO_A, next ? '1' : '0');
    updateDividirBtnUIAdmin(next);
    try { chk.dispatchEvent(new Event('change')); } catch {}
  });

  // sincronización si cambian el checkbox por código
  chk.addEventListener('change', () => {
    localStorage.setItem(LS_DIV_ACTIVO_A, chk.checked ? '1' : '0');
    updateDividirBtnUIAdmin(chk.checked);
  });
}

function desactivarDividirMontoAdmin() {
  const chk = document.getElementById('dividirMontoAdmin');
  if (chk) chk.checked = false;
  try { localStorage.setItem(LS_DIV_ACTIVO_A, '0'); } catch {}
  updateDividirBtnUIAdmin(false);
}

// ---------- Prorrateo por “Monto total” (igual al panel) ----------
function prorratearMontoTotal(jugadas, montoTotal) {
  try {
    const src = Array.isArray(jugadas) ? jugadas : [];
    const totalDeseado = Number.parseFloat(montoTotal);
    if (!src.length || !Number.isFinite(totalDeseado) || totalDeseado <= 0) return src;

    // cantidad de jugadas (números)
    const cantidadNumeros = src.length;

    // cantidad de loterías distintas seleccionadas en TODO el ticket
    const todasLoterias = new Set();
    for (const j of src) {
      if (Array.isArray(j.loterias)) j.loterias.forEach(l => todasLoterias.add(l));
    }
    const cantidadLoterias = todasLoterias.size || 1;

    // importe por número = total / (números * loterías)
    const totalCent = Math.round(totalDeseado * 100);
    const denom = cantidadNumeros * cantidadLoterias;
    const porNumeroCent = Math.floor(totalCent / denom);
    let restoCent = totalCent - porNumeroCent * denom;

    const out = src.map(j => ({ ...j, importe: +(porNumeroCent / 100).toFixed(2) }));

    // Reparto del resto en “escalones” de cantidadLoterias
    let i = 0;
    while (restoCent >= cantidadLoterias && out.length > 0) {
      out[i % out.length].importe = +((out[i % out.length].importe + 0.01).toFixed(2));
      restoCent -= cantidadLoterias;
      i++;
    }
    return out;
  } catch {
    return Array.isArray(jugadas) ? jugadas : [];
  }
}
// ====== Enviar ticket a la nube (fecha elegida + numeración admin) ======
// ====== Enviar ticket a la nube (admin) ======
// ====== Enviar ticket a la nube (fecha elegida + numeración admin) ======
// ====== Enviar ticket a la nube (fecha elegida + numeración admin) ======
// ====== Helpers de Ticket (ADMIN) ======

// Orden visible de loterías
function ordenarLoteriasAdmin(lista) {
  const orden = ['NAC','PRO','SFE','COR','RIO','CTE','MZA','CHA','JUJ','SAN','MIS','ORO','TUC','NQN','CHB','RIN','LRJ','SAL','SCR','SGO'];
  return lista.sort((a, b) => {
    const sa = a.slice(0,3), sb = b.slice(0,3);
    return orden.indexOf(sa) - orden.indexOf(sb);
  });
}
// Render del ticket en pantalla (ADMIN)
function renderTicketPreviewAdmin(ticket) {
  const { numero, fecha, hora, vendedor, jugadas, total } = ticket;

  // Agrupar por combinación exacta de loterías
  const grupos = {};
  (jugadas || []).forEach(j => {
    const clave = (j.loterias || []).join(',');
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(j);
  });

  // Orden visible de loterías (misma lógica que en panel)
  const ordenar = (lista) => {
    const orden = ['NAC','PRO','SFE','COR','RIO','CTE','MZA','CHA','JUJ','SAN','MIS','ORO','TUC','NQN','CHB','RIN','LRJ','SAL','SCR','SGO'];
    return lista.sort((a, b) => orden.indexOf(a.slice(0,3)) - orden.indexOf(b.slice(0,3)));
  };

  let html = `
  <div style="text-align:center;margin-bottom:12px">
    <button onclick="document.getElementById('previewTicketAdminBox').innerHTML=''" style="font-size:14px;padding:6px 12px;margin:4px">🆕 Nueva carga</button>
    <button onclick="window.print()" style="font-size:14px;padding:6px 12px;margin:4px">🖨 Imprimir</button>
    <button onclick="descargarTicketComoImagenAdmin()" style="font-size:14px;padding:6px 12px;margin:4px">📷 Guardar Imagen</button>
  </div>

  <div class="ticket-preview" style="font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;background:white;padding:20px;color:black;text-align:center;width:320px;margin:0 auto;border:2px solid #000;transform:scale(1.2);transform-origin:top center;font-weight:900;line-height:1.5">
    <div style="font-size:20px;font-weight:900;margin-bottom:8px">TICKET #${numero}</div>

    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
      <div style="text-align:left">
        <div><strong>Fecha:</strong> ${fecha}</div>
        <div><strong>Hora:</strong> ${hora}</div>
      </div>
      <div style="text-align:right">
        <div><strong>Pasador:</strong></div>
        <div>${vendedor}</div>
      </div>
    </div>
  `;

  Object.entries(grupos).forEach(([loterias, arr]) => {
    const ordenadas = ordenar(loterias.split(',').filter(Boolean));
    html += `<hr style="border:1px solid black;margin:4px 0">`;

    for (let i = 0; i < ordenadas.length; i += 7) {
      const fila = ordenadas.slice(i, i + 7).join(' ');
      html += `<div style="text-align:center;font-size:12px">${fila}</div>`;
    }

    html += `<hr style="border:1px solid black;margin:4px 0">`;

    arr.forEach(j => {
      const numeroStr    = '*'.repeat(Math.max(0, 4 - String(j.numero).length)) + String(j.numero);
      const posicionStr  = String(j.posicion).padStart(2, '0');
      const importeStr   = `$${Number(j.importe).toLocaleString('es-AR')}`.padStart(9, ' ');
      const redoblonaStr = j.redoblona
        ? ` ${'*'.repeat(Math.max(0, 4 - String(j.redoblona).length)) + String(j.redoblona)} ${String(j.posRedoblona||'').toString().padStart(2,' ')}`
        : '';

      html += `<div style="text-align:left;font-size:15px;line-height:1.6;margin-left:18px;font-family:monospace">
        ${numeroStr} ${posicionStr} ${importeStr}${redoblonaStr}
      </div>`;
    });
  });

  html += `
    <hr style="border:1px solid black;margin:10px 0">
    <div style="font-size:20px;font-weight:900;margin-top:6px;text-align:center">
      TOTAL: $${Number(total).toLocaleString('es-AR')}
    </div>
    <div id="uuidTicketAdmin" style="font-size:10px;text-align:center;margin-top:8px;color:gray">
      (ID pendiente...)
    </div>
  </div>`;

  const cont = document.getElementById('previewTicketAdminBox');
  if (!cont) return console.warn('⚠️ Falta el contenedor #previewTicketAdminBox en la solapa de Admin.');
  cont.innerHTML = html;
}
// ====== Enviar ticket a la nube (admin) + Overlay ======
// ====== Enviar ticket a la nube (admin) + Overlay ======
async function enviarTicketAdmin(){
    // =========================
  // 🔒 Anti-duplicados (LOCK)
  // =========================
  if (window.__ENVIANDO_TICKET_ADMIN) return; // si ya está enviando, ignorar clicks extra
  window.__ENVIANDO_TICKET_ADMIN = true;

  const __btnEnviar = document.getElementById('btnEnviarAdmin');
  const __txtOriginal = __btnEnviar ? __btnEnviar.textContent : '';
  if (__btnEnviar) {
    __btnEnviar.disabled = true;
    __btnEnviar.textContent = 'Enviando...';
  }

  // “anti doble envío” por mismo contenido (15s)
  const __now = Date.now();
  const __simpleHash = (s) => {
    let h = 0; for (let i=0;i<s.length;i++) h = ((h<<5)-h) + s.charCodeAt(i) | 0;
    return String(h);
  };
  const __rememberPayload = (payloadObj) => {
    try {
      const raw = JSON.stringify(payloadObj);
      const hash = __simpleHash(raw);
      const last = window.__LAST_SEND_ADMIN;
      if (last && last.hash === hash && (__now - last.ts) < 15000) return false; // ya lo mandaste hace nada
      window.__LAST_SEND_ADMIN = { hash, ts: __now };
      return true;
    } catch { return true; }
  };
    try {
  // Modo "Monto total" (ADMIN)
  const usarMontoTotal = (window.__MTicketAdm?.activo === true);
  const montoTotalDeseado = Number(window.__MTicketAdm?.total || 0);
  if (usarMontoTotal && !(montoTotalDeseado > 0)) {
    alert('Activaste "Monto total" pero no capturaste el importe total (primer importe).');
    return;
  }

  // Siempre usar el buffer de Admin
  const base = Array.isArray(window.jugadasTempAdmin) ? window.jugadasTempAdmin : [];
  const jugadasFuente = usarMontoTotal
    ? prorratearMontoTotal(base, montoTotalDeseado)
    : base;

  const fecha   = document.getElementById('fechaTicketAdmin')?.value || '';
  const pasador = document.getElementById('selectPasadorAdmin')?.value || '';
// 👉 seguridad: admin_hijo solo puede usar SUS pasadores
if (!window.ES_CENTRAL) {
  const permitidos = await getPasadores();
  if (!permitidos.includes(pasador)) {
    alert('No podés enviar jugadas a un pasador que no creaste vos.');
    return;
  }
}
  if (!fecha)   return alert('Elegí la fecha del ticket');
  if (!pasador) return alert('Seleccioná un pasador');
  if (!jugadasFuente.length) return alert('No hay jugadas');

  // 🔒 Validación extra: admin_hijo solo puede usar pasadores que él creó
  if (window.ES_ADMIN_HIJO) {
    const { data: ok, error: errCheck } = await supabase
      .from('usuarios')
      .select('usuario')
      .eq('usuario', pasador)
      .eq('creado_por', window.USUARIO_ACTUAL)
      .maybeSingle();
    if (errCheck) {
      console.error('Error validando pasador:', errCheck);
      return alert('No se pudo validar el pasador.');
    }
    if (!ok) {
      return alert('⛔ Ese pasador no fue creado por vos.');
    }
  }

  // Total del ticket (igual que antes)
const total = usarMontoTotal
? montoTotalDeseado
: jugadasFuente.reduce((s,j)=> s + (Number(j.importe)||0) * (j.loterias?.length||0), 0);

// Hora AR
const ahoraAR = new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" });
const dt = new Date(ahoraAR);
const horaStr = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`;

// Normalizo jugadas para el RPC
const jugadasPayload = jugadasFuente.map(j => ({
numero: String(j.numero),
posicion: Number(j.posicion),
redoblona: j.redoblona || null,
posRedoblona: j.posRedoblona ? Number(j.posRedoblona) : null,
importe: Number(j.importe),
loterias: [...(j.loterias || [])]
}));
// ✅ evita re-enviar EXACTAMENTE el mismo ticket si se disparó dos veces por lag/atajos (15s)
if (!__rememberPayload({ fecha, pasador, usarMontoTotal, montoTotalDeseado, jugadasPayload })) {
  return;
}

// Loterías únicas para mostrar en el ticket
const loteriasUnicas = [...new Set(jugadasPayload.flatMap(j => j.loterias || []))];

// 👉 Obtener siguiente número GLOBAL sin RPC (máximo >= 10000 + 1)
const { data: maxRow, error: maxErr } = await supabase
  .from('jugadas_enviadas')
  .select('numero')
  .gte('numero', 10000)
  .order('numero', { ascending: false })
  .limit(1)
  .maybeSingle();

if (maxErr) {
  console.error('max ticket error', maxErr);
  alert('⚠️ No se pudo calcular el número de ticket');
  return;
}

const numeroHumano = (Number(maxRow?.numero) || 9999) + 1;

// Armar objeto e insertar como siempre
const ticket = {
  numero: numeroHumano,
  fecha,
  hora: horaStr,
  total,
  anulado: false,
  vendedor: pasador,
  loterias: loteriasUnicas,
  jugadas: jugadasPayload
};

const { data: ins, error: insErr } = await supabase
  .from('jugadas_enviadas')
  .insert([ticket])
  .select()
  .single();

if (insErr) {
  console.error('insert ticket error', insErr);
  alert('⚠️ No se pudo guardar el ticket');
  return;
}
if (ins?.id) ticket.id = ins.id;

  // Limpiar UI + apagar modos en Admin
  try {
    window.jugadasTempAdmin = [];
    const lista = document.getElementById('listaJugadasAdmin');
    if (lista) lista.innerHTML = '';

    // persistencias admin
    try { localStorage.setItem('montoTotalActivoAdmin','0'); localStorage.removeItem('montoTotalValorAdmin'); } catch(_){}
    try { localStorage.setItem('dividirMontoActivoAdmin','0'); } catch(_){}

    // por si compartís helpers generales
    if (typeof desactivarMontoTotalAdmin === 'function') desactivarMontoTotalAdmin();
    if (typeof desactivarDividirMontoAdmin === 'function') desactivarDividirMontoAdmin();
  } catch(_) {}

  // Mostrar overlay del ticket
  const html = renderTicketHTMLAdmin(ticket);
  mostrarOverlayTicketAdmin(html);
  // ⬇ Poner el ID real dentro del ticket del overlay
if (ticket.id) {
  setTimeout(() => {
    const uuidBox = document.getElementById('uuidTicketAdmin');
    if (uuidBox) uuidBox.textContent = ticket.id;
  }, 30);
}
// 🔄 limpiar selección y campos después de enviar ticket
  try {
    document.querySelectorAll('.casilla-sorteo-admin.activo').forEach(c => c.classList.remove('activo'));
    document.querySelectorAll('.jugada-inputs input').forEach(inp => inp.value = '');
    const lista = document.getElementById('listaJugadasAdmin');
    if (lista) lista.innerHTML = '';
  } catch (e) {
    console.warn('⚠️ Error limpiando la interfaz después de enviar el ticket:', e);
  }
    } finally {
    window.__ENVIANDO_TICKET_ADMIN = false;
    if (__btnEnviar) {
      __btnEnviar.disabled = false;
      __btnEnviar.textContent = __txtOriginal || 'Enviar';
    }
  }
}


// ====== HTML del ticket (Admin) para overlay ======
function renderTicketHTMLAdmin(ticket) {
  const { numero, fecha, hora, vendedor, jugadas = [], total } = ticket;

  // agrupar por combinación exacta de loterías
  const grupos = {};
  jugadas.forEach(j => {
    const clave = (j.loterias || []).join(',');
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(j);
  });

  // mismo orden que usás en el panel
  const ordenar = (lista) => {
    const orden = ['NAC','PRO','SFE','COR','RIO','CTE','MZA','CHA','JUJ','SAN','MIS','ORO','TUC','NQN','CHB','RIN','LRJ','SAL','SCR','SGO'];
    return lista.sort((a,b)=> orden.indexOf(a.slice(0,3)) - orden.indexOf(b.slice(0,3)));
  };

  let html = `
   <div class="ticket-preview" id="ticketPreviewAdmin" style="
   font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;
   background:white; color:black; text-align:center;
   width:340px; margin:0 auto; border:2px solid #000; padding:22px;
   transform:scale(1.2);transform-origin:top center;font-weight:900;line-height:1.5">
    <div style="font-size:22px;font-weight:900;margin-bottom:8px">TICKET #${numero}</div>
    <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px">
      <div style="text-align:left">
        <div><strong>Fecha:</strong> ${fecha}</div>
        <div><strong>Hora:</strong> ${hora}</div>
      </div>
      <div style="text-align:right">
        <div><strong>Pasador:</strong></div>
        <div>${vendedor}</div>
      </div>
    </div>
  `;

  Object.entries(grupos).forEach(([loterias, arr])=>{
    const ordenadas = ordenar(loterias.split(',').filter(Boolean));
    html += `<hr style="border:1px solid black;margin:4px 0">`;
    for (let i=0; i<ordenadas.length; i+=7) {
      const fila = ordenadas.slice(i,i+7).join(' ');
      html += `<div style="text-align:center;font-size:12px">${fila}</div>`;
    }
    html += `<hr style="border:1px solid black;margin:4px 0">`;

    arr.forEach(j=>{
      const numeroStr    = '*'.repeat(Math.max(0,4-String(j.numero).length)) + String(j.numero);
      const posicionStr  = String(j.posicion).padStart(2,'0');
      const importeStr   = `$${Number(j.importe).toLocaleString('es-AR')}`.padStart(9,' ');
      const redoblonaStr = j.redoblona
        ? ` ${'*'.repeat(Math.max(0,4-String(j.redoblona).length)) + String(j.redoblona)} ${String(j.posRedoblona||'').toString().padStart(2,' ')}`
        : '';
      html += `<div style="text-align:left;font-size:15px;line-height:1.6;margin-left:18px;font-family:monospace">
        ${numeroStr} ${posicionStr} ${importeStr}${redoblonaStr}
      </div>`;
    });
  });

  html += `
    <hr style="border:1px solid black;margin:10px 0">
    <div style="font-size:22px;font-weight:900;margin-top:6px;text-align:center">
      TOTAL: $${Number(total).toLocaleString('es-AR')}
    </div>
    <div id="uuidTicketAdmin" style="font-size:10px;text-align:center;margin-top:8px;color:gray">
      (ID pendiente...)
    </div>
  </div>`;
  return html;
}

// ====== Overlay de ticket (oscurece todo y muestra al centro) ======
function mostrarOverlayTicketAdmin(ticketHTML) {
  // si ya hay uno, lo saco
  const old = document.getElementById('overlayTicketAdmin');
  if (old) old.remove();

  // contenedor overlay
  const overlay = document.createElement('div');
  overlay.id = 'overlayTicketAdmin';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.90)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  // caja centrada
  const box = document.createElement('div');
  box.style.maxWidth = '95vw';
  box.style.maxHeight = '95vh';
  box.style.overflow = 'auto';
  box.style.padding = '18px';
  box.style.textAlign = 'center';

  // barra de acciones
  const actions = document.createElement('div');
  actions.style.marginBottom = '12px';
  actions.innerHTML = `
    <button id="ovlVolverAdm"   style="font-size:14px;padding:8px 14px;margin:4px">🆕 Nueva carga</button>
    <button id="ovlImprimirAdm" style="font-size:14px;padding:8px 14px;margin:4px">🖨 Imprimir</button>
    <button id="ovlGuardarAdm"  style="font-size:14px;padding:8px 14px;margin:4px">📷 Guardar Imagen</button>
  `;

  const ticketWrap = document.createElement('div');
  ticketWrap.innerHTML = ticketHTML;

  box.appendChild(actions);
  box.appendChild(ticketWrap);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Cerrar con "Nueva carga"
  document.getElementById('ovlVolverAdm').onclick = () => overlay.remove();

  // Imprimir
  document.getElementById('ovlImprimirAdm').onclick = () => window.print();

  // Guardar imagen con html2canvas
  document.getElementById('ovlGuardarAdm').onclick = async () => {
    const ticketEl = document.getElementById('ticketPreviewAdmin');
    if (!ticketEl) return alert('No se encontró el ticket en pantalla');
    if (typeof html2canvas === 'undefined') {
      alert('html2canvas no está cargado en esta página.');
      return;
    }
    const canvas = await html2canvas(ticketEl);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg');
    a.download = `ticket_admin_${Date.now()}.jpeg`;
    a.click();
  };

  // cerrar al clickear fuera del ticket
  overlay.addEventListener('click', (e)=>{
    if (e.target === overlay) overlay.remove();
  });
}
  
// ⬇⬇⬇ Reemplazá toda tu función subirResultadoManual por esta
async function subirResultadoManual() {
  const fecha = document.getElementById('res-fecha').value;

  // tomar del nuevo UI (selects). Si no existen, usa el hidden como fallback.
  const sigSel   = document.getElementById('res-sigla');
  const horSel   = document.getElementById('res-hora');
  const lotHidden= document.getElementById('res-loteria');

  const loteria  = (sigSel?.value || lotHidden?.value || '').trim().toUpperCase();
  const horario  = (horSel?.value || lotHidden?.getAttribute('data-horario') || '').trim();

  // números: exactamente 20 y cada uno 4 dígitos
  const numeros = Array.from(document.querySelectorAll('.campo-numero-ganador'))
  .sort((a,b) => (+a.dataset.idx) - (+b.dataset.idx))   // 0..19 → 1..20
  .map(i => (i.value || '').replace(/\D/g,'').slice(-4));

if (numeros.length !== 20 || numeros.some(n => n.length !== 4)) {
  alert("Completá la fecha, la lotería, el horario y los 20 números (4 dígitos cada uno).");
  console.warn('⚠️ Faltan datos para subir resultado', { fecha, loteria, horario, cantNums: numeros.length, numeros });
  return;
}

  if (!fecha || !loteria || !horario || numeros.length !== 20) {
    alert("Completá la fecha, la lotería, el horario y los 20 números (4 dígitos cada uno).");
    console.warn('⚠️ Faltan datos para subir resultado', { fecha, loteria, horario, cantNums: numeros.length, numeros });
    return;
  }

  const resultado = { fecha, loteria, horario, posiciones: numeros, vendedor: 'manual' };
  console.log('🟢 Subiendo resultado', resultado);

  try {
    // borrar anterior (misma clave)
    const delR = await fetch(`${SUPABASE_URL}/rest/v1/resultados?fecha=eq.${fecha}&loteria=eq.${loteria}&horario=eq.${horario}`, {
      method: 'DELETE',
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    console.log('🧹 Borrado previo resultado', delR.ok);

    // insertar
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/resultados`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=representation"
      },
      body: JSON.stringify(resultado)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('❌ Error insertando resultado', txt);
      throw new Error(txt);
    }
    console.log('✅ Resultado insertado OK');

    // generar aciertos
    const claveLoteria = loteria + horario.split(':')[0].padStart(2,'0');
    console.time('⏱ generarAciertos');
    console.log('🔍 Generar aciertos — clave', { fecha, claveLoteria, posiciones: numeros });
    await generarAciertosDesdeResultados(fecha, claveLoteria, numeros, 'manual');
    console.timeEnd('⏱ generarAciertos');

    // limpiar UI
    document.querySelectorAll('.campo-numero-ganador').forEach(i => i.value = '');
    const ta = document.getElementById('res-pega'); if (ta) ta.value = '';
    alert("✅ Resultado actualizado correctamente.");
  } catch (error) {
    console.error("❌ Error al subir resultado:", error);
    alert("Hubo un error al guardar el resultado.");
  }
}
  
  function mostrarEdicionResultados() {
    alert("🔧 Pronto vas a poder editar los resultados cargados desde acá.");
  }
  
  function pegarDesdePortapapeles() {
  navigator.clipboard.readText().then(texto => {
    const crudos = (String(texto).match(/\b\d{4}\b/g) || []).slice(0, 20);
    // si viene 1-11-2-12-... lo reordenamos a 1..20; si ya viene 1..20 no rompe nada
    const ordenados = reordenarFormatoColumna(crudos);
    volcarAInputs(ordenados); // escribe usando data-idx (1..20)
  }).catch(() => alert("❌ No se pudo leer del portapapeles."));
}
  
  // ⬇⬇⬇ Hacer visibles globalmente para que los botones puedan llamarlas
  window.subirResultadoManual = subirResultadoManual;
  window.pegarDesdePortapapeles = pegarDesdePortapapeles;
  window.mostrarEdicionResultados = mostrarEdicionResultados;
  // ⬇⬇ Reemplazar toda la función por esta
// ⬇⬇ Reemplazar toda la función por esta
async function generarAciertosDesdeResultados(fecha, claveLoteria, posiciones, vendedor = 'manual') {
  console.group('generarAciertosDesdeResultados()');
  console.log({ fecha, claveLoteria, posicionesLen: posiciones?.length, vendedor });

  // 1) preparar
  const nuevosAciertos = [];

  // HH de 'PRO21' -> '21:00'
  const horaFromClave = (cl) => {
    const hh = String(cl).slice(-2);
    const hhNum = (/^\d{2}$/.test(hh)) ? hh : '00';
    return `${hhNum}:00`;
  };
  const horaParaPK = horaFromClave(claveLoteria);

  // 2) traer tickets del día (solo NO anulados)
const { data: tickets, error } = await supabase
.from('jugadas_enviadas')
.select('*')
.eq('fecha', fecha)
.or('anulado.is.null,anulado.eq.false'); // ← excluye anulado=true

  if (error) {
    console.error('❌ Error al buscar tickets:', error);
    console.groupEnd();
    return;
  }
  console.log('📦 Tickets en', fecha, ':', tickets?.length ?? 0);

  // 3) armar nuevosAciertos (una sola pasada)
  (tickets || []).forEach(ticket => {
    // ⛔ si está anulado, no lo procesamos
    const isAnulado = ticket.anulado === true || String(ticket.anulado).toLowerCase() === 'true';
    if (isAnulado) return;
  
    let jugadas = ticket.jugadas;
    try { if (typeof jugadas === 'string') jugadas = JSON.parse(jugadas); } catch { jugadas = []; }
    if (!Array.isArray(jugadas)) return;

    jugadas.forEach(j => {
  if (!j?.loterias) return;

  // 🛠️ Fix: asegurar que siempre sea array real, no texto
  if (typeof j.loterias === 'string') {
    try { j.loterias = JSON.parse(j.loterias); } 
    catch { j.loterias = [j.loterias]; }
  }
  if (!Array.isArray(j.loterias)) j.loterias = [j.loterias];

  j.loterias.forEach(cod => {
    if (cod !== claveLoteria) return;
// ⚙️ compat nombres (por si algún ticket viejo vino con numeroR/posicionR)
if (j.numeroR && !j.redoblona) j.redoblona = j.numeroR;
if (j.posicionR && !j.posRedoblona) j.posRedoblona = j.posicionR;
        // calcular premio con tu función actual
        let premio = 0;
        try {
          if (typeof calcularPremioUnitario === 'function') {
            premio = calcularPremioUnitario(j, posiciones, cod);
          }
        } catch (e) {
          console.warn('calc premio error', e);
        }

        {
          const pos  = parseInt(j.posicion);
          const posR = parseInt(j.posRedoblona);
          const esRedoblona = !!(j.redoblona && posR);
        
          let cantidad = 0;
          let aciertoUnitario = 0;
        
          if (esRedoblona) {
            // ——— REDOBLONA ———
            const pagos = {
              "1-5": 1280, "1-10": 640,"1-15": 426.67,  "1-20": 336.84,
              "5-5": 256,  "5-10": 128, "5-20": 64,
              "10-10": 64, "10-20": 32, "20-20": 16
            };
            const clavePago = `${pos}-${posR}`;
            const r2 = String(j.redoblona).padStart(2,'0');
            const num2 = String(j.numero).slice(-2);
        
            const zonaPrincipal = (pos === 1) ? [posiciones[0]] : zonaPorPosicion(pos, posiciones);
            const aciertaPrincipal = zonaPrincipal.some(n => n.endsWith(num2));
        
            // R: 2..R si pos=1, 1..R si pos es 5/10/20
            const zonaR =
              pos === 1 && posR === 5  ? posiciones.slice(1, 6)  :
              pos === 1 && posR === 10 ? posiciones.slice(1, 11) :
              pos === 1 && posR === 15 ? posiciones.slice(1, 16) :
              pos === 1 && posR === 20 ? posiciones.slice(1, 20) :
              zonaPorPosicion(posR, posiciones);
        
            const coincidenciasR = zonaR.filter(n => n.endsWith(r2)).length;
        
            if (aciertaPrincipal && coincidenciasR > 0 && pagos[clavePago]) {
              cantidad = coincidenciasR;                         // ← 1 fila por coincidencia
              aciertoUnitario = pagos[clavePago] * Number(j.importe);
            }
            // ——— PREMIO POSICIÓN 15 ———
} else if (pos === 15) {
  const zona15 = posiciones.slice(0, 15);
  const num = String(j.numero).padStart(4,'0');

  // 4 CIFRAS
  if (j.numero.length === 4) {
    const coincidencias = zona15.filter(n => n === num).length;
    if (coincidencias > 0) {
      cantidad = coincidencias;
      aciertoUnitario = 233.33 * Number(j.importe);
    }
  }

  // 3 CIFRAS
  else if (j.numero.length === 3) {
    const fin3 = num.slice(-3);
    const coincidencias = zona15.filter(n => n.endsWith(fin3)).length;
    if (coincidencias > 0) {
      cantidad = coincidencias;
      aciertoUnitario = 40 * Number(j.importe);
    }
  }

  // 2 CIFRAS
  else if (j.numero.length === 2) {
    const fin2 = num.slice(-2);
    const coincidencias = zona15.filter(n => n.endsWith(fin2)).length;
    if (coincidencias > 0) {
      cantidad = coincidencias;
      aciertoUnitario = 4.67 * Number(j.importe);
    }
  }
          } else if ([5,10,20].includes(pos)) {
            // ——— PREMIOS 5/10/20 ———
            const zona = zonaPorPosicion(pos, posiciones);
            const num = String(j.numero).padStart(4,'0');
        
            const factor = (j.numero.length === 4) ? {5:700,10:350,20:175}[pos]
                         : (j.numero.length === 3) ? {5:120,10:60, 20:30 }[pos]
                         : (j.numero.length === 2) ? {5:14, 10:7,  20:3.5}[pos]
                         : 0;
        
            const coincidencias =
              (j.numero.length === 4) ? zona.filter(n => n === num).length :
              (j.numero.length === 3) ? zona.filter(n => n.endsWith(num.slice(-3))).length :
              (j.numero.length === 2) ? zona.filter(n => n.endsWith(num.slice(-2))).length : 0;
        
            if (factor && coincidencias) {
              cantidad = coincidencias;                          // ← 1 fila por coincidencia
              aciertoUnitario = factor * Number(j.importe);
            }
          } else if (pos === 1) {
            // ——— CABEZA SUELTA ———
            const cabeza = posiciones[0];
            const len = j.numero.length;
            if (cabeza.endsWith(String(j.numero))) {
              const tabla = {4:3500, 3:600, 2:70, 1:7};
              cantidad = 1;
              aciertoUnitario = (tabla[len] || 0) * Number(j.importe);
            }
          }
        
          // insertar 1 fila por coincidencia
          for (let i = 0; i < cantidad; i++) {
            const idTicket = Number(ticket.numero);
            nuevosAciertos.push({
              id_ticket: idTicket,
              loteria: cod,
              numero: String(j.numero ?? ''),
              posicion: String(j.posicion ?? ''),
              redoblona: j.redoblona ? String(j.redoblona).padStart(2,'0') : '-',
              pos_redoblona: j.posRedoblona ? String(j.posRedoblona) : '-',
              ticket_id: idTicket,
              horario: horaParaPK,
              ticket_num: idTicket,
              fecha,
              importe: Number(j.importe ?? 0),
              acierto: Number(aciertoUnitario.toFixed(2)),
              vendedor: String(ticket.vendedor ?? vendedor ?? 'manual'),
            });
          }
        }
      });
    });
  });

  console.log('🔎 Aciertos encontrados:', nuevosAciertos.length);

  // 4) BORRAR ANTERIORES 100% en DB vía RPC (salta RLS)
console.log('🧹 Borrando aciertos previos (RPC)', { fecha, claveLoteria });

try {
  const { data: delCount, error: rpcErr } = await supabase.rpc('purge_aciertos', {
    _fecha: fecha,
    _loteria: claveLoteria,            // ej: "NAC10"
    _actor: window.USUARIO_ACTUAL || 'admin'
  });

  if (rpcErr) {
    console.error('❌ RPC purge_aciertos falló:', rpcErr);
  } else {
    console.log(`✅ Aciertos previos borrados (RPC): ${delCount || 0}`);
  }
} catch (e) {
  console.error('❌ Excepción en RPC purge_aciertos:', e);
}
// 5) INSERTAR los nuevos aciertos (forzamos retorno y log)
if (nuevosAciertos.length > 0) {
  console.log('🟢 Voy a insertar', nuevosAciertos.length, 'aciertos. Ejemplo:', nuevosAciertos[0]);

  const { data: ins, error: insErr, status: insStatus } = await supabase
    .from('aciertos')
    .insert(nuevosAciertos)
    .select('id, loteria, fecha, vendedor');   // ← forza retorno (si RLS lo permite)

  if (insErr) {
    console.error('❌ INSERT aciertos falló', { insStatus, insErr });
  } else {
    console.log(`✅ INSERT aciertos OK (${ins?.length || 0})`, ins);
  }
} else {
  console.log('🟡 No hubo aciertos para guardar.');
}

console.groupEnd(); // ← asegurar que no haya "return" antes de este punto
  console.groupEnd();
}function calcularPremioUnitario(jugada, numeros, claveLoteria) {
  const cabeza = numeros[0];
  const zona5 = numeros.slice(0, 5);
  const zona10 = numeros.slice(0, 10);
  const zona20 = numeros.slice(0, 20);

  const numOriginal = jugada.numero; // tal como se cargó
  const num = numOriginal.padStart(4, '0'); // para zonas y redoblona
  const redoblona = jugada.redoblona?.padStart(2, '0');
  const posRedoblona = parseInt(jugada.posRedoblona);
  const posicion = parseInt(jugada.posicion);
  const importe = parseFloat(jugada.importe);

  let total = 0;

  // 🎯 Premio en cabeza normal (sin redoblona)
  if (posicion === 1 && !(redoblona && posRedoblona)) {
    if (numOriginal.length === 4 && cabeza.endsWith(numOriginal)) {
      total += 3500 * importe;
    } else if (numOriginal.length === 3 && cabeza.endsWith(numOriginal)) {
      total += 600 * importe;
    } else if (numOriginal.length === 2 && cabeza.endsWith(numOriginal)) {
      total += 70 * importe;
    } else if (numOriginal.length === 1 && cabeza.endsWith(numOriginal)) {
      total += 7 * importe;
    }
  }

  // 🟦 Premios en zonas 5/10/20 (sin redoblona)
  if ([5, 10, 20].includes(posicion) && !(redoblona && posRedoblona)) {
    const zona = posicion === 5 ? zona5 : posicion === 10 ? zona10 : zona20;
  
    if (numOriginal.length === 4) {
      const coincidencias = zona.filter(n => n === num).length;
      total += { 5: 700, 10: 350, 20: 175 }[posicion] * importe * coincidencias;
    } else if (numOriginal.length === 3) {
      const coincidencias = zona.filter(n => n.endsWith(num.slice(-3))).length;
      total += { 5: 120, 10: 60, 20: 30 }[posicion] * importe * coincidencias;
    } else if (numOriginal.length === 2) {
      const coincidencias = zona.filter(n => n.endsWith(num.slice(-2))).length;
      total += { 5: 14, 10: 7, 20: 3.5 }[posicion] * importe * coincidencias;
    }
  }

  // 🌟 Redoblona
  if (redoblona && posRedoblona) {
    const premioRedoblona = calcularPremioRedoblona(jugada, numeros);
    total += premioRedoblona;
  }

  return total;
}

function calcularPremioRedoblona(jugada, numeros) {
  const cabeza = numeros[0];
  const zona5 = numeros.slice(0, 5);
  const zona10 = numeros.slice(0, 10);
  const zona20 = numeros.slice(0, 20);

  const num = jugada.numero;
  const redoblona = jugada.redoblona?.padStart(2, '0');
  const pos = parseInt(jugada.posicion);
  const posR = parseInt(jugada.posRedoblona);
  const importe = parseFloat(jugada.importe);

  const pagos = {
    "1-5": 1280,
    "1-10": 640,
    "1-15": 426.67,
    "1-20": 336.84,
    "5-5": 256,
    "5-10": 128,
    "5-20": 64,
    "10-10": 64,
    "10-20": 32,
    "20-20": 16
  };

  const clavePago = `${pos}-${posR}`;
  if (!pagos[clavePago]) return 0;

  const zonaPrincipal =
    pos === 1 ? [cabeza] :
    pos === 5 ? zona5 :
    pos === 10 ? zona10 :
    pos === 20 ? zona20 : [];

  // RANGO del R (2..R cuando el principal es 1; si ambos son a premios → 1..R)
const zonaRedoblona =
pos === 1 && posR === 5  ? numeros.slice(1, 6)  : // posiciones 2..5
pos === 1 && posR === 10 ? numeros.slice(1, 11) : // posiciones 2..10
pos === 1 && posR === 15 ? numeros.slice(1, 16) :
pos === 1 && posR === 20 ? numeros.slice(1, 20) : // posiciones 2..20
[5, 10, 20].includes(pos) && [5, 10, 20].includes(posR)
  ? zonaPorPosicion(posR, numeros)                // ambos 1..R
  : [];

  const aciertaPrincipal = zonaPrincipal.some(n => n.endsWith(num.slice(-2)));
  const coincidenciasRedoblona = zonaRedoblona.filter(n => n.endsWith(redoblona.slice(-2))).length;

  if (aciertaPrincipal && coincidenciasRedoblona > 0) {
    console.log(`✅ REDOBLONA acertada ${coincidenciasRedoblona} veces → ${pagos[clavePago]} x ${importe} x ${coincidenciasRedoblona}`);
    return pagos[clavePago] * importe * coincidenciasRedoblona;
  }

  return 0;
}

function verificarPremios(jugada) {
  const resultadosGuardados = JSON.parse(localStorage.getItem('resultados')) || [];
  let premioTotal = 0;

  jugada.loterias.forEach(codigo => {
    const sigla = codigo.slice(0, 3);
    const hora = codigo.slice(3);
    const clave = sigla + hora;

    const resultado = resultadosGuardados.find(r => r.loteria === clave);
    if (!resultado) return;

    premioTotal += calcularPremioUnitario(jugada, resultado.posiciones, clave);
  });

  return premioTotal;
}

function zonaPorPosicion(pos, numeros) {
  if (pos === 5) return numeros.slice(0, 5);
  if (pos === 10) return numeros.slice(0, 10);
  if (pos === 20) return numeros.slice(0, 20);
  return [];
}

// ✅ PEGÁ TODO ESTO EN TU ARCHIVO admin.js

async function subirLiquidacionesManuales() {
  const fechaInput = document.getElementById("fechaLiquidacion");
  if (!fechaInput) return alert("⛔ No se encontró el input de fecha.");
  const fecha = fechaInput.value;
  if (!fecha || !fecha.includes("-")) return alert("⛔ Fecha inválida.");

  const fechaIso = new Date(fecha).toISOString().slice(0, 10);

  // 🔹 NUEVO: traer config global para usar como default
  const { data: gconf } = await supabase
    .from('config_global')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  console.log("📆 Fecha que se va a usar para borrar:", fecha, "→", fechaIso, typeof fechaIso);

  const { data: usuarios } = await supabase.from("usuarios").select("*");
  const vendedores = usuarios.filter(u => u.rol === "vendedor").map(u => u.usuario);

  const nuevas = [];

  // 🔍 Mostrar todas las liquidaciones en la tabla
  const { data: todas, error: errorTodas } = await supabase
    .from("liquidaciones")
    .select("id, fecha, vendedor");

  if (errorTodas) {
    console.error("❌ Error obteniendo todas las liquidaciones:", errorTodas);
  } else {
    console.log("📋 Todas las liquidaciones en la tabla:", todas);
  }

  // 🔎 Buscar si hay liquidaciones de esa fecha
  const { data: existentes, error: errorLectura } = await supabase
    .from("liquidaciones")
    .select("id, fecha, vendedor")
    .eq("fecha", fechaIso);

  console.log("🧪 Liquidaciones encontradas para borrar:", existentes);

  if (errorLectura) {
    console.error("❌ Error leyendo liquidaciones para borrar:", errorLectura);
    alert("❌ Error al buscar liquidaciones anteriores. Abortando.");
    return;
  }

  if (existentes && existentes.length > 0) {
    const ids = existentes.map(l => l.id);
    console.log("🧹 IDs que se van a borrar:", ids);

    const { error: errorBorrado } = await supabase
      .from("liquidaciones")
      .delete()
      .in("id", ids);

    if (errorBorrado) {
      console.error("❌ Falló el borrado por ID:", errorBorrado);
      alert("❌ No se pudieron borrar las liquidaciones anteriores. Abortando.");
      return;
    } else {
      console.log("✅ Liquidaciones borradas por ID:", ids);
    }
  } else {
    console.log("🟡 No había liquidaciones para borrar.");
  }

  // 🔁 Procesar cada vendedor
  for (const vendedor of vendedores) {
    console.log(`🟠 Procesando liquidación de ${vendedor} para fecha ${fechaIso}...`);

    const { data: jugadas } = await supabase
      .from("jugadas_enviadas")
      .select("*")
      .eq("fecha", fechaIso)
      .eq("vendedor", vendedor)
      .eq("anulado", false);

    const resumenTurnos = {
      Previa: 0,
      Primera: 0,
      Matutina: 0,
      Vespertina: 0,
      Nocturna: 0
    };

    jugadas.forEach(ticket => {
      try {
        if (typeof ticket.jugadas === 'string') {
          ticket.jugadas = JSON.parse(ticket.jugadas);
        }
      } catch (e) {
        console.warn('No pude parsear ticket.jugadas', ticket.jugadas, e);
        ticket.jugadas = [];
      }
      const horaMin = ticket.jugadas
        .flatMap(j => j.loterias.map(l => parseInt(l.slice(3))))
        .reduce((min, h) => Math.min(min, h), 99);

      const minutos = horaMin * 60;
      let turno = "Nocturna";
      if (minutos < 660) turno = "Previa";
      else if (minutos < 780) turno = "Primera";
      else if (minutos < 960) turno = "Matutina";
      else if (minutos < 1140) turno = "Vespertina";
      resumenTurnos[turno] += ticket.total;
    });

    const totalPase = Object.values(resumenTurnos).reduce((a, b) => a + b, 0);
    // 👉 BLOQUE NUEVO: override efectivo por vendedor
const { data: ov } = await supabase
.from('config_overrides')
.select('comision, bono_activo, bono_sabado')
.eq('vendedor', vendedor)
.maybeSingle();

// % comisión efectivo
const comisionPct = (ov?.comision !== null && ov?.comision !== undefined)
? ov.comision
: (gconf?.comision ?? 0.20);   // si no hay override, usa global o 0.20

// ¿bono activo?
const bonoActivo = (ov?.bono_activo === null || ov?.bono_activo === undefined)
? ((gconf?.bono_sabado ?? 0) > 0)   // por defecto: activo si el global > 0
: !!ov?.bono_activo;

// % bono efectivo
const bonoPct = (ov?.bono_sabado !== null && ov?.bono_sabado !== undefined)
? ov.bono_sabado
: (gconf?.bono_sabado ?? 0);   // si no hay override, usa global o 0
    const comision = totalPase * comisionPct;

    const { data: aciertosTodos } = await supabase
  .from("aciertos")
  .select("*")
  .eq("fecha", fechaIso)
  .eq("vendedor", vendedor);

// Set de números de ticket ANULADOS (BIGINT)
const anuladosNums = new Set(
  (jugadas || [])
    .filter(j => j.anulado)
    .map(j => Number(j.numero))
    .filter(n => Number.isFinite(n))
);

// Filtrar aciertos cuyo id_ticket esté en anulados
const aciertos = (aciertosTodos || []).filter(a => !anuladosNums.has(Number(a.id_ticket)));
    const totalAciertos = aciertos.reduce((s, a) => s + parseFloat(a.acierto || 0), 0);

    const { data: reclamosData } = await supabase
    .from("reclamos")
    .select("importe")
    .eq("fecha", fechaIso)
    .eq("vendedor", vendedor);
  
  const totalReclamos = reclamosData?.reduce((sum, r) => sum + (r.importe || 0), 0) || 0;
  console.log("🧾 [RECLAMOS] vendedor:", vendedor, "fecha:", fechaIso, "totalReclamos:", totalReclamos);
  
  const saldo = totalPase - comision - totalAciertos - totalReclamos;
  console.log("🧮 [SALDO] pase:", totalPase, "comision:", comision, "aciertos:", totalAciertos, "reclamos:", totalReclamos, "=> saldo:", saldo);

    const { data: anteriores } = await supabase
      .from("liquidaciones")
      .select("*")
      .lt("fecha", fechaIso)
      .eq("vendedor", vendedor);
    const anterioresOrdenadas = (anteriores || []).sort((a, b) => b.fecha.localeCompare(a.fecha));
    let arrastreAnterior = 0;

    if (anterioresOrdenadas.length > 0) {
      // Buscar la última liquidación válida (ignora domingos vacíos)
      const ultima = anterioresOrdenadas.find(l => l.total_pase > 0 || l.saldo !== 0 || l.saldo_final_arrastre !== 0);

      if (ultima) {
        const fechaUltima = new Date(ultima.fecha + "T00:00:00");
        const fueSabado = fechaUltima.getDay() === 6;
        const saldoFinalUltimo = ultima.saldo_final_arrastre ?? ultima.saldo_final ?? 0;

        if (fueSabado && saldoFinalUltimo > 0) {
          arrastreAnterior = 0; // sábado positivo: se dio bono → reinicia
        } else {
          arrastreAnterior = saldoFinalUltimo; // arrastre normal
        }
        console.log("🔁 Última liquidación encontrada:", ultima.fecha, "→ saldo final:", ultima.saldo_final, "→ arrastre:", ultima.saldo_final_arrastre);
        console.log("📦 Arrastre anterior calculado:", arrastreAnterior);
      }
    }
// ⭐️ REGLA DEL LUNES ⭐️
const esLunes = new Date(fechaIso + "T00:00:00").getDay() === 1;

if (esLunes && saldo === 0) {
  if (arrastreAnterior > 0) {
    console.log("📘 Lunes sin movimiento → arrastre positivo NO se copia.");
    arrastreAnterior = 0;
  } else {
    console.log("📘 Lunes sin movimiento → arrastre negativo SÍ se copia.");
  }
}
    let saldoFinalConArrastre = saldo + arrastreAnterior;

    const esSabado = new Date(fechaIso + "T00:00:00").getDay() === 6;
let bonoVendedor = 0;
if (esSabado && bonoActivo && saldoFinalConArrastre > 0) {
  bonoVendedor = saldoFinalConArrastre * bonoPct; // usar % efectivo
  saldoFinalConArrastre = 0;                      // se cancela el arrastre
}

    nuevas.push({
      fecha: fechaIso,
      vendedor,
      total_pase: totalPase,
      comision,
      total_aciertos: totalAciertos,
      reclamos: (totalReclamos !== 0 ? totalReclamos : null),
      saldo,
      saldo_final: saldo,
      saldo_final_arrastre: saldoFinalConArrastre,
      bono_vendedor: bonoVendedor
    });
  }

  // 🚀 Subir todo junto
  if (nuevas.length > 0) {
    const { error: errSubida } = await supabase.from("liquidaciones").insert(nuevas);

    if (errSubida) {
      console.error("❌ Error al subir nuevas liquidaciones:", errSubida);
      alert("❌ Error al subir liquidaciones.");
    } else {
      console.log("✅ Todas las liquidaciones subidas correctamente");
      nuevas.forEach(l => console.log("📄 LIQUIDACIÓN de", l.vendedor, "→", l));
      alert("✅ Todas las liquidaciones fueron subidas correctamente.");
    }
  } else {
    alert("ℹ️ No se generó ninguna liquidación nueva.");
  }
}
function seleccionarLoteria(elemento) {
  const botones = document.querySelectorAll(".cuadro-loteria");
  botones.forEach(b => {
    b.style.border = "2px solid #444";
    b.style.backgroundColor = "#1a1a1a";
    b.style.color = "white";
  });

  elemento.style.border = "2px solid limegreen";
  elemento.style.backgroundColor = "#0f0";
  elemento.style.color = "black";

  document.getElementById("res-loteria").value = elemento.dataset.sigla;
  document.getElementById("res-loteria").setAttribute("data-horario", elemento.dataset.horario);
}
window.subirLiquidacionesManuales = subirLiquidacionesManuales;
async function mostrarUsuariosAdmin() {
  const zona = document.getElementById('zonaContenido');

  zona.innerHTML = `
    <h1 style="color:white; margin:0 0 12px;">👥 Usuarios</h1>

    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; margin-bottom:12px;">
      <div>
        <label style="color:#bbb; font-size:12px;">Usuario</label><br>
        <input id="u_usuario" type="text" placeholder="ej: 2312" style="padding:8px; width:130px;">
      </div>
      <div>
        <label style="color:#bbb; font-size:12px;">Clave</label><br>
        <input id="u_clave" type="text" placeholder="ej: 2312" style="padding:8px; width:130px;">
      </div>
      <div>
        <label style="color:#bbb; font-size:12px;">Tipo</label><br>
        <select id="u_tipo" style="padding:8px; width:140px;">
          <option value="vendedor">Vendedor</option>
          <option value="admin">Admin</option>
          <option value="admin_hijo">Admin hijo</option> <!-- 👈 NUEVO -->
        </select>
      </div>
      <button id="btnCrearUsuario" style="padding:10px 14px; background:#2ecc71; color:#fff; border:none; border-radius:6px; font-weight:600;">
        ➕ Crear usuario
      </button>
    </div>

    <div style="margin:8px 0 6px; color:#bbb; font-size:12px;">
      ${ES_CENTRAL ? 'Estás viendo <b>todos</b> los usuarios.' : 'Estás viendo usuarios creados por <b>'+USUARIO_ACTUAL+'</b>.'}
    </div>
    <!-- 🔍 Buscador -->
<div style="margin:8px 0 12px;">
  <input id="buscarUser" type="text" placeholder="Buscar usuario…" 
         style="padding:8px; width:260px; border-radius:6px; border:1px solid #666; background:#111; color:#fff;">
</div>

    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#1f1f1f;">
          <th style="text-align:left; padding:8px; color:#aaa;">Usuario</th>
          <th style="text-align:left; padding:8px; color:#aaa;">Tipo</th>
          <th style="text-align:left; padding:8px; color:#aaa;">Creado por</th>
          <th style="text-align:left; padding:8px; color:#aaa;">Estado</th>
          <th style="text-align:left; padding:8px; color:#aaa;">Acciones</th>
        </tr>
      </thead>
      <tbody id="tbodyUsuarios"></tbody>
    </table>
  `;
// 🔒 Admin hijo: solo puede crear/editar vendedores
if (window.ES_ADMIN_HIJO) {
  const tipo = document.getElementById('u_tipo');
  if (tipo) {
    [...tipo.options].forEach(o => {
      const v = (o.value || '').toLowerCase();
      if (v && v !== 'vendedor') { o.disabled = true; o.hidden = true; }
    });
    // fuerza valor
    if (tipo.value.toLowerCase() !== 'vendedor') tipo.value = 'vendedor';
  }
}
  document.getElementById('btnCrearUsuario').onclick = crearUsuario;
  await cargarUsuarios();
  // filtra filas de la tabla mientras escribís
const _in = document.getElementById('buscarUser');
_in?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('#tbodyUsuarios tr').forEach(tr => {
    const u = (tr.querySelector('td')?.textContent || '').toLowerCase();
    tr.style.display = u.includes(q) ? '' : 'none';
  });
});
}

async function cargarUsuarios() {
  const tbody = document.getElementById('tbodyUsuarios');
  tbody.innerHTML = `<tr><td colspan="5" style="padding:12px; color:#aaa;">Cargando...</td></tr>`;

  let query = supabase.from('usuarios').select('*').order('usuario', { ascending: true });

  if (window.ES_CENTRAL) {
    // ve todo
  } else if (window.ES_ADMIN_HIJO) {
    // solo los que él creó + su propio usuario
    query = query.or(`creado_por.eq.${window.USUARIO_ACTUAL},usuario.eq.${window.USUARIO_ACTUAL}`);
  } else {
    // vendedor: solo él
    query = query.eq('usuario', window.USUARIO_ACTUAL);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="5" style="padding:12px; color:#f55;">Error al cargar usuarios.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:12px; color:#aaa;">No hay usuarios.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(u => {
    const estado = u.bloqueado ? 'Bloqueado' : 'Activo';
    const esCentralReal = (u.usuario === 'admin');
    const soyYo = (u.usuario === window.USUARIO_ACTUAL);
  
    return `
      <tr style="border-top:1px solid #2a2a2a;">
        <td style="padding:8px; color:#fff;">${u.usuario}</td>
        <td style="padding:8px; color:#ddd;">${u.rol || 'vendedor'}</td>
        <td style="padding:8px; color:#bbb;">${u.creado_por || '-'}</td>
        <td style="padding:8px; color:${u.bloqueado ? '#ff7675' : '#55efc4'};">${estado}</td>
        <td style="padding:8px; display:flex; gap:8px;">
          <button onclick="resetClave('${u.usuario}')" style="padding:6px 10px; border:none; border-radius:5px;">🔑 Reset clave</button>
          ${soyYo ? '' : `
            <button onclick="toggleBloqueo('${u.usuario}', ${u.bloqueado ? 'false' : 'true'})" style="padding:6px 10px; border:none; border-radius:5px; background:${u.bloqueado ? '#2ecc71' : '#e67e22'}; color:#fff;">
              ${u.bloqueado ? '✅ Desbloquear' : '⛔ Bloquear'}
            </button>
            <button onclick="eliminarUsuario('${u.usuario}')" style="padding:6px 10px; border:none; border-radius:5px; background:#e74c3c; color:#fff;" ${esCentralReal ? 'disabled title="No se puede borrar el central"' : ''}>
              🗑 Eliminar
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

async function crearUsuario() {
  const usuario = document.getElementById('u_usuario').value.trim();
  const clave = document.getElementById('u_clave').value.trim();
  const tipo = window.ES_ADMIN_HIJO ? 'vendedor' : document.getElementById('u_tipo').value;

  if (!usuario || !clave) return alert('Completá usuario y clave');

  // No permitir duplicados
  const { data: existe } = await supabase.from('usuarios').select('usuario').eq('usuario', usuario).maybeSingle();
  if (existe) return alert('Ese usuario ya existe');

  const nuevo = {
    usuario,
    clave,
    rol: tipo,                // si sos admin_hijo, ya lo forzás a 'vendedor'
    creado_por: window.ES_CENTRAL ? 'admin' : window.USUARIO_ACTUAL,
    bloqueado: false
  };

  const { error } = await supabase.from('usuarios').insert([nuevo]);
  if (error) {
    console.error(error);
    return alert('Error al crear usuario');
  }

  /* 👇 NUEVO: si es admin_hijo, setear porcentaje 50 por defecto */
  if (tipo === 'admin_hijo') {
    const { error: e2 } = await supabase
      .from('admin_config')
      .upsert({
        admin_usuario: usuario,
        porcentaje: 50,
        updated_at: new Date().toISOString()
      });
    if (e2) console.warn('No se pudo setear 50% en admin_config', e2);
  }
  /* ☝️ FIN NUEVO */

  // limpiar
  document.getElementById('u_usuario').value = '';
  document.getElementById('u_clave').value = '';
  document.getElementById('u_tipo').value = 'vendedor';

  await cargarUsuarios();
  alert('✅ Usuario creado');
}

async function resetClave(usuario) {
  const nueva = prompt(`Nueva clave para ${usuario}:`);
  if (!nueva) return;

  const { error } = await supabase.from('usuarios').update({ clave: nueva }).eq('usuario', usuario);
  if (error) {
    console.error(error);
    return alert('Error al cambiar clave');
  }
  alert('🔑 Clave actualizada');
}

async function toggleBloqueo(usuario, bloquear) {
  // bloquear=true -> poner bloqueado=true
  const { error } = await supabase.from('usuarios').update({ bloqueado: bloquear }).eq('usuario', usuario);
  if (error) {
    console.error(error);
    return alert('Error al cambiar estado');
  }
  await cargarUsuarios();
}

async function eliminarUsuario(usuario) {
  if (usuario === 'admin') return alert('No se puede eliminar el central');
  if (!confirm(`¿Eliminar usuario ${usuario}?`)) return;

  const { error } = await supabase.from('usuarios').delete().eq('usuario', usuario);
  if (error) {
    console.error(error);
    return alert('Error al eliminar');
  }
  await cargarUsuarios();
}

// cache local para filtros
let _usuariosCache = [];
let _soportaEstado = false; // true si la tabla tiene la columna `estado`

async function cargarUsuariosAdmin() {
  const tbody = document.getElementById('u-tbody');
  tbody.innerHTML = `<tr><td colspan="4" style="color:#aaa; padding:12px">Cargando...</td></tr>`;

  // Traemos todos los campos actuales
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .order('usuario', { ascending: true });

  if (error) {
    console.error('Error listando usuarios:', error);
    tbody.innerHTML = `<tr><td colspan="4" style="color:#f55; padding:12px">Error al cargar</td></tr>`;
    return;
  }

  _usuariosCache = data || [];

  // Detectar si existe columna `estado`
  _soportaEstado = !!_usuariosCache.find(u => Object.prototype.hasOwnProperty.call(u, 'estado'));
  // Mostrar/ocultar filtro + columna
  document.getElementById('u-filtro-estado').style.display = _soportaEstado ? '' : 'none';
  const thEstado = document.getElementById('th-estado');
  if (thEstado) thEstado.style.display = _soportaEstado ? '' : 'none';

  renderUsuariosAdmin(_usuariosCache);
}

function renderUsuariosAdmin(lista) {
  const tbody = document.getElementById('u-tbody');
  const vacio = document.getElementById('u-empty');

  if (!lista || lista.length === 0) {
    tbody.innerHTML = '';
    vacio.style.display = '';
    return;
  }
  vacio.style.display = 'none';

  tbody.innerHTML = lista.map(u => {
    const estado = _soportaEstado ? (u.estado || 'activo') : '';
    const esAdmin = (u.rol === 'admin');

    return `
      <tr style="border-bottom:1px solid #2a2a2a">
        <td style="padding:8px; color:#eee">${u.usuario}</td>
        <td style="padding:8px; color:#ccc">${u.rol}</td>
        <td style="padding:8px; color:#ccc; ${_soportaEstado ? '' : 'display:none'}">${estado}</td>
        <td style="padding:8px; display:flex; gap:6px; flex-wrap:wrap">
          <button onclick="cambiarClaveAdmin(${u.id})" style="padding:6px 10px">Cambiar clave</button>
          ${_soportaEstado ? `
            <button onclick="toggleBloqueoAdmin(${u.id}, '${estado}')" style="padding:6px 10px">
              ${estado === 'bloqueado' ? 'Desbloquear' : 'Bloquear'}
            </button>` : ''
          }
          <button onclick="cambiarRolAdmin(${u.id}, '${u.rol}')" style="padding:6px 10px">Rol</button>
          ${esAdmin ? '' : `<button onclick="eliminarUsuarioAdmin(${u.id})" style="padding:6px 10px; background:#4a0; color:white; border:none">Eliminar</button>`}
        </td>
      </tr>
    `;
  }).join('');
}

function filtrarUsuariosAdmin() {
  const q = (document.getElementById('u-buscar').value || '').toLowerCase();
  const fRol = document.getElementById('u-filtro-rol').value || '';
  const fEstado = (_soportaEstado ? (document.getElementById('u-filtro-estado').value || '') : '');

  const filtrados = _usuariosCache.filter(u => {
    const okQ = !q || (u.usuario || '').toLowerCase().includes(q);
    const okRol = !fRol || u.rol === fRol;
    const okEst = !_soportaEstado || !fEstado || (u.estado || 'activo') === fEstado;
    return okQ && okRol && okEst;
  });

  renderUsuariosAdmin(filtrados);
}

async function crearUsuarioAdmin() {
  const usuario = document.getElementById('u-nuevo-usuario').value.trim();
  const clave = document.getElementById('u-nueva-clave').value.trim();
  const rol   = document.getElementById('u-nuevo-rol').value;

  if (!usuario || !clave) return alert('Completá usuario y clave');

  // Evitar duplicados por usuario
  const ya = _usuariosCache.find(u => (u.usuario || '').toLowerCase() === usuario.toLowerCase());
  if (ya) return alert('Ese usuario ya existe');

  const payload = { usuario, clave, rol };
  if (_soportaEstado) payload.estado = 'activo'; // por si la columna existe

  const { error } = await supabase.from('usuarios').insert([payload]);
  if (error) {
    console.error('Error creando usuario:', error);
    return alert('No se pudo crear el usuario');
  }

  document.getElementById('u-nuevo-usuario').value = '';
  document.getElementById('u-nueva-clave').value = '';
  document.getElementById('u-nuevo-rol').value = 'vendedor';
  await cargarUsuariosAdmin();
  alert('✅ Usuario creado');
}

async function cambiarClaveAdmin(id) {
  const u = _usuariosCache.find(x => x.id === id);
  if (!u) return;
  const nueva = prompt(`Nueva clave para ${u.usuario}:`);
  if (!nueva) return;

  const { error } = await supabase.from('usuarios').update({ clave: nueva }).eq('id', id);
  if (error) {
    console.error('Error cambiando clave:', error);
    return alert('No se pudo cambiar la clave');
  }
  await cargarUsuariosAdmin();
  alert('✅ Clave actualizada');
}

async function cambiarRolAdmin(id, rolActual) {
  const u = _usuariosCache.find(x => x.id === id);
  if (!u) return;

  // Rotación: vendedor -> admin_hijo -> admin -> vendedor
  const next = (rolActual === 'vendedor') ? 'admin_hijo'
             : (rolActual === 'admin_hijo') ? 'admin'
             : 'vendedor';

  if (!confirm(`Cambiar rol de ${u.usuario} a ${next}?`)) return;

  const { error } = await supabase.from('usuarios').update({ rol: next }).eq('id', id);
  if (error) {
    console.error('Error cambiando rol:', error);
    return alert('No se pudo cambiar el rol');
  }

  // Si quedó como admin_hijo, asegurar 50% por defecto
  if (next === 'admin_hijo') {
    const { error: e2 } = await supabase
      .from('admin_config')
      .upsert({
        admin_usuario: u.usuario,
        porcentaje: 50,
        updated_at: new Date().toISOString()
      });
    if (e2) console.warn('No se pudo setear 50% para admin_hijo', e2);
  }

  await cargarUsuariosAdmin();
  alert('✅ Rol actualizado');
}

async function eliminarUsuarioAdmin(id) {
  const u = _usuariosCache.find(x => x.id === id);
  if (!u) return;
  if (u.rol === 'admin') return alert('No podés borrar al admin');

  if (!confirm(`¿Eliminar definitivamente a ${u.usuario}?`)) return;

  const { error } = await supabase.from('usuarios').delete().eq('id', id);
  if (error) {
    console.error('Error eliminando usuario:', error);
    return alert('No se pudo eliminar');
  }
  await cargarUsuariosAdmin();
  alert('🗑️ Usuario eliminado');
}

async function toggleBloqueoAdmin(id, estadoActual) {
  if (!_soportaEstado) return; // por si alguien fuerza el botón

  const u = _usuariosCache.find(x => x.id === id);
  if (!u) return;

  const nuevo = (estadoActual === 'bloqueado') ? 'activo' : 'bloqueado';

  const { error } = await supabase.from('usuarios').update({ estado: nuevo }).eq('id', id);
  if (error) {
    console.error('Error actualizando estado:', error);
    return alert('No se pudo cambiar el estado');
  }
  await cargarUsuariosAdmin();
  alert(`✅ Usuario ${nuevo}`);
}
/***** ===================== LIQUIDACIONES — ADMIN (UI + lógica) ===================== *****/

async function mostrarLiquidacionesAdmin() {
  const zona = document.getElementById('zonaContenido');
 // 🔒 Admin hijo: bloquear acciones de carga/edición de liquidaciones
if (window.ES_ADMIN_HIJO) {
  const idsBloquear = ['btnSubirLiquidacion','btnEditarLiq','btnBorrarLiq','btnSubirReclamo'];
  idsBloquear.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; el.style.opacity = .5; el.title = 'Solo consulta (admin hijo)'; }
  });
}
  if (!zona) return;

  const hoy = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0,10);

  zona.innerHTML = `
<h1 style="text-align:center;margin:0 0 16px;color:#fff">💰 Liquidaciones</h1>

<div style="display:grid;grid-template-columns: 0.4fr 0.6fr;gap:16px;align-items:start">

  <!-- Izquierda -->
  <div style="display:flex;flex-direction:column;gap:16px">
    
    <!-- Subir control -->
    <div style="background:#111;border:1px solid #333;border-radius:8px;padding:14px">
      <h3 style="margin:0 0 10px;color:#fff">Subir control (todos los vendedores)</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <label style="color:#bbb">📅 Fecha:</label>
        <input type="date" id="fechaLiquidacion" value="${hoy}" style="padding:6px; font-size:15px;">
        <button id="btnSubirLiq" style="padding:8px 12px; font-size:15px; background:#008cba; color:white; border:none; border-radius:6px;">
          📤 Subir Liquidaciones a Supabase
        </button>
      </div>
    </div>

    <!-- Reclamos -->
    <div style="background:#111;border:1px solid #333;border-radius:8px;padding:14px">
      <h3 style="margin:0 0 10px;color:#fff">Reclamos (solo central)</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <label style="color:#bbb">📅 Fecha:</label>
        <input type="date" id="recFecha" value="${hoy}" style="padding:6px; font-size:15px;">
        <select id="recVend" style="padding:6px;min-width:140px"></select>
        <input type="number" id="recImporte" placeholder="10000 o -10000" style="padding:6px;width:150px">
      </div>
      <button id="btnAgregarReclamo" style="padding:8px 12px; background:orange; color:white; border:none; border-radius:6px;">
        ➕ Agregar reclamo
      </button>
      <table style="width:100%;margin-top:10px;font-size:14px;color:#ccc">
        <thead>
  <tr style="color:#ddd;background:#1b1b1b">
    <th>Fecha</th><th>Vendedor</th><th>Importe</th><th>Acción</th>
  </tr>
</thead>
        <tbody id="recRows">
          <tr><td colspan="5" style="text-align:center;color:#888">Sin datos</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Derecha -->
  <div style="background:#111;border:1px solid #333;border-radius:8px;padding:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0;color:#fff">Consultar liquidaciones</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="date" id="fDesde" style="padding:6px" value="${hoy}">
        <input type="date" id="fHasta" style="padding:6px" value="${hoy}">
        <select id="fVend" style="padding:6px;min-width:140px">
          <option value="">(Todos)</option>
        </select>
        <button id="btnBuscar" style="padding:6px 10px">Buscar</button>
      </div>
    </div>
    <div style="border:1px solid #333;border-radius:8px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#1b1b1b;color:#ddd">
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">Fecha</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #333">Vendedor</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #333">Pase</th>
<th style="text-align:right;padding:8px;border-bottom:1px solid #333">Aciertos</th>
<th style="text-align:right;padding:8px;border-bottom:1px solid #333">Reclamos</th>
<th style="text-align:right;padding:8px;border-bottom:1px solid #333">Comisión</th>
<th style="text-align:right;padding:8px;border-bottom:1px solid #333">Saldo</th>
<th style="text-align:right;padding:8px;border-bottom:1px solid #333">Arrastre</th>
<th style="text-align:right;padding:8px;border-bottom:1px solid #333">Bono</th>
          </tr>
        </thead>
        <tbody id="gridLiqRows" style="background:#0f0f0f;color:#ccc"></tbody>
      </table>
    </div>
    <div id="liqPreviewBox" style="margin-top:12px;background:#090909;border:1px solid #333;border-radius:8px;padding:12px">
      <div style="color:#bbb;margin-bottom:8px">Vista previa REAL:</div>
      <div id="liqPreview"></div>
    </div>
  </div>
</div>
`;
// Solo lectura para admin_hijo (sin subir ni reclamos)
if (window.ES_ADMIN_HIJO){
  const block = id => { const el = document.getElementById(id); if (el){ el.disabled = true; el.style.opacity=.5; el.title='Solo lectura (admin hijo)'; } };
  block('btnSubirLiq');   // subir desde Excel/CSV
  block('btnGuardarRec'); // reclamos manuales
}
  // wiring
  cargarVendedoresPermitidosEnSelect(document.getElementById('fVend'));
  document.getElementById('btnBuscar').onclick = buscarLiquidacionesAdmin;
  document.getElementById('btnSubirLiq').onclick = (e) => uiSubirLiquidacionesAdmin(e.currentTarget);
  // Reclamos: solo central
if (window.ES_CENTRAL) {
  await cargarVendedoresParaReclamo(document.getElementById('recVend'));
  document.getElementById('btnAgregarReclamo').onclick = async () => {
    await agregarReclamo();
    await listarReclamosDia();
    await buscarLiquidacionesAdmin(); // refresca grilla derecha
  };
  await listarReclamosDia();
}

  // primera búsqueda
  buscarLiquidacionesAdmin();
}

async function cargarVendedoresPermitidosEnSelect(selectEl) {
  if (!selectEl) return;
  try {
    let q = supabase.from('usuarios').select('usuario, rol, creado_por').eq('rol', 'vendedor');
    if (!window.ES_CENTRAL) q = q.eq('creado_por', window.USUARIO_ACTUAL);

    const { data, error } = await q;
    if (error) throw error;

    const arr = (data || []).map(u => u.usuario).sort();

    // 👇👇 ESTE ES EL CAMBIO (agrega la opción Admin en jv_vend)
    let opts = `<option value="">(Todos)</option>`;
    if (window.ES_CENTRAL && selectEl.id === 'jv_vend') {
      opts += `<option value="__ADMIN__">Admin</option>`;
    }
    opts += arr.map(u => `<option value="${u}">${u}</option>`).join('');

    selectEl.innerHTML = opts;
  } catch (e) {
    console.warn('No se pudieron cargar vendedores', e);
  }
}

async function buscarLiquidacionesAdmin() {
  const tbody = document.getElementById('gridLiqRows');
  if (!tbody) return;

  const fDesde = document.getElementById('fDesde').value;
  const fHasta = document.getElementById('fHasta').value;
  const vendedor = document.getElementById('fVend').value;

  tbody.innerHTML = `<tr><td colspan="8" style="padding:10px;text-align:center;color:#888">Buscando…</td></tr>`;

  try {
    let q = supabase
  .from('liquidaciones')
  .select('fecha,vendedor,total_pase,total_aciertos,comision,reclamos,saldo,saldo_final_arrastre,bono_vendedor') // ← acá agregué reclamos
  .gte('fecha', fDesde)
  .lte('fecha', fHasta)
  .order('fecha', { ascending: false })
  .order('vendedor', { ascending: true });

    if (vendedor) q = q.eq('vendedor', vendedor);

    if (!window.ES_CENTRAL) {
      const { data: vs, error: e2 } = await supabase
        .from('usuarios')
        .select('usuario')
        .eq('rol','vendedor')
        .eq('creado_por', window.USUARIO_ACTUAL);
      if (e2) throw e2;
      const lista = (vs||[]).map(v => v.usuario);
      if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:10px;text-align:center;color:#888">Sin vendedores asignados.</td></tr>`;
        return;
      }
      q = q.in('vendedor', lista);
    }

    const { data, error } = await q;
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="padding:10px;text-align:center;color:#888">No hay liquidaciones.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    data.forEach(r => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.onmouseenter = () => tr.style.background = '#151515';
      tr.onmouseleave = () => tr.style.background = '';

      const rec = r.reclamos || 0;

tr.innerHTML = `
  <td style="padding:8px;border-bottom:1px solid #333">${r.fecha}</td>
  <td style="padding:8px;border-bottom:1px solid #333">${r.vendedor}</td>
  <td style="padding:8px;border-bottom:1px solid #333;text-align:right">$${fmt1(r.total_pase||0)}</td>
  <td style="padding:8px;border-bottom:1px solid #333;text-align:right">$${fmt1(r.total_aciertos||0)}</td>
  <td style="padding:8px;border-bottom:1px solid #333;text-align:right">${money(rec)}</td>
  <td style="padding:8px;border-bottom:1px solid #333;text-align:right">$${fmt1(r.comision||0)}</td>
  <td style="padding:8px;border-bottom:1px solid #333;text-align:right">${money(r.saldo||0)}</td>
  <td style="padding:8px;border-bottom:1px solid #333;text-align:right">${money(r.saldo_final_arrastre||0)}</td>
  <td style="padding:8px;border-bottom:1px solid #333;text-align:right">$${fmt1(r.bono_vendedor||0)}</td>
`;

      tr.addEventListener('click', async () => {
        const box = document.getElementById('liqPreview');
        box.innerHTML = '';
        await renderLiquidacionRealAdmin({ fecha: r.fecha, vendedor: r.vendedor, targetEl: box });
      });


      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="8" style="padding:10px;text-align:center;color:#c33">Error al buscar.</td></tr>`;
  }
}

/** ===== LIQ REAL (sin tickets, formato ticket) ===== */

/** ===== LIQ REAL (sin tickets, formato ticket) ===== */

// 1 decimal salvo 0 (sin decimales)
function fmt1(v) {
  const n = Number(v) || 0;
  const sinDecimales = Number.isInteger(n);
  return n.toLocaleString('es-AR',
    sinDecimales
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 1, maximumFractionDigits: 1 }
  );
}

// Signo antes del $ cuando corresponde
function money(v){
  const n = Number(v) || 0;
  return (n < 0) ? `-$${fmt1(Math.abs(n))}` : `$${fmt1(n)}`;
}

async function renderLiquidacionRealAdmin({ fecha, vendedor, targetEl }) {
  if (!targetEl) return;
  targetEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0;color:#bbb">
      <span>Vista previa REAL:</span>
      <div style="color:#fff;font-weight:700">Liquidación de&nbsp;${vendedor}</div>
      <div style="color:#fff;font-weight:700">·&nbsp;${fecha}</div>
      <span id="liqLoading" style="margin-left:auto">Cargando…</span>
    </div>
    <div id="liqTicket" style="background:#0b0b0b;border:1px solid #222;border-radius:12px;padding:18px">
      <div style="text-align:right;margin-bottom:10px">
        <button id="btnDescargarLiq" style="padding:6px 10px;font-size:14px;background:#008cba;color:#fff;border:none;border-radius:6px;cursor:pointer">
          📥 Descargar imagen
        </button>
      </div>
     <div id="liqScale" style="width:100%;display:flex;justify-content:center;align-items:flex-start;">
  <div id="liqTicketBody" style="
    font-family:monospace;
    background:#fff;
    color:#000;
    padding:clamp(12px,3.5vw,20px);
    width:500px;
    max-width:100%;
    box-sizing:border-box;
    border:2px solid black;
    font-weight:900;
    overflow:hidden;
    font-size:clamp(12px, 1.15vw, 18px);
    transform-origin: top center;
  "></div>
</div>
    </div>
  `;

  const scaleWrap = targetEl.querySelector('#liqScale');
const body = targetEl.querySelector('#liqTicketBody');
const loading = targetEl.querySelector('#liqLoading');

  try {
    const { data: liq } = await supabase
      .from('liquidaciones')
      .select('*')
      .eq('fecha', fecha)
      .eq('vendedor', vendedor)
      .maybeSingle();

    const total_pase  = liq?.total_pase || 0;
    const comision    = liq?.comision || 0;
    const aciertosTot = liq?.total_aciertos || 0;
    const reclamos    = liq?.reclamos || 0;
    const saldo       = liq?.saldo ?? (total_pase - comision - aciertosTot - reclamos);
    const arrastreFin = liq?.saldo_final_arrastre || 0;
    const arrastreAnterior = arrastreFin - saldo;
    const bonoVend    = liq?.bono_vendedor || 0;

    const [{ data: gconf }, { data: ov }] = await Promise.all([
      supabase.from('config_global').select('*').eq('id',1).maybeSingle(),
      supabase.from('config_overrides').select('bono_activo, bono_sabado').eq('vendedor', vendedor).maybeSingle()
    ]);
    const bonoPct = (ov?.bono_sabado ?? gconf?.bono_sabado ?? 0);
    const bonoTxt = bonoVend > 0 ? ` (${(bonoPct*100).toFixed(0)}%)` : '';

    const { data: tickets } = await supabase
      .from('jugadas_enviadas')
      .select('total,jugadas,anulado')
      .eq('fecha', fecha)
      .eq('vendedor', vendedor);

    const resumen = { Previa:0, Primera:0, Matutina:0, Vespertina:0, Nocturna:0 };
    (tickets||[]).forEach(t => {
      if (t.anulado) return;
      let horaMin = 99;
      try {
        let js = t.jugadas;
        if (typeof js === 'string') js = JSON.parse(js);
        const horas = (js||[]).flatMap(j => (j.loterias||[]).map(l => parseInt(String(l).slice(3),10)));
        horaMin = horas.reduce((m,h)=>Math.min(m,h),99);
      } catch {}
      const minutos = horaMin*60;
      let turno = "Nocturna";
      if (minutos < 660) turno = "Previa";
      else if (minutos < 780) turno = "Primera";
      else if (minutos < 960) turno = "Matutina";
      else if (minutos < 1140) turno = "Vespertina";
      resumen[turno] += (t.total||0);
    });

    const { data: aciertos } = await supabase
  .from('aciertos')
  .select('loteria, numero, posicion, redoblona, pos_redoblona, importe, acierto, id')
  .eq('fecha', fecha)
  .eq('vendedor', vendedor)
  .order('id', { ascending: true });

    let aciertosHTML = "";

if (aciertos && aciertos.length) {
  aciertos.forEach(a => {
    const lot = a.loteria || "";
    const num = a.numero || "";
    const pos = (a.posicion ?? "-");
    const apo = `$${fmt1(a.importe || 0)}`;
    const gano = `$${fmt1(a.acierto || 0)}`;

    const red = (a.redoblona ?? "-");
    const posRed = (a.pos_redoblona ?? "-");

    const tieneRed =
      red !== "-" && red !== "" && red !== null &&
      posRed !== "-" && posRed !== "" && posRed !== null;

    if (tieneRed) {
      aciertosHTML += `
        <tr>
          <td style="padding:3px 0">${lot}</td>
          <td style="padding:3px 0">**${num}</td>
          <td style="padding:3px 0">${pos}</td>
          <td style="padding:3px 0;text-align:right">${apo}</td>
          <td style="padding:3px 0;text-align:right;font-weight:700">-------</td>
        </tr>
        <tr>
          <td style="padding:3px 0">${lot}</td>
          <td style="padding:3px 0">:${red}</td>
          <td style="padding:3px 0">${posRed}</td>
          <td style="padding:3px 0;text-align:right">----</td>
          <td style="padding:3px 0;text-align:right;font-weight:700">${gano}</td>
        </tr>
      `;
    } else {
      aciertosHTML += `
        <tr>
          <td style="padding:3px 0">${lot}</td>
          <td style="padding:3px 0">${num}</td>
          <td style="padding:3px 0">${pos}</td>
          <td style="padding:3px 0;text-align:right">${apo}</td>
          <td style="padding:3px 0;text-align:right;font-weight:700">${gano}</td>
        </tr>
      `;
    }
  });
} else {
  aciertosHTML = `<tr><td colspan="5" style="padding:8px;text-align:center;color:#888">SIN ACIERTOS PARA MOSTRAR</td></tr>`;
}

const aciertosHtml = `
  <div style="max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch">
  <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:16px;table-layout:fixed">
  <colgroup>
  <col style="width:20%">
  <col style="width:20%">
  <col style="width:12%">
  <col style="width:24%">
  <col style="width:24%">
</colgroup>
    <thead>
      <tr>
        <th style="text-align:left;padding:4px 0;border-bottom:1px solid #000">LOT</th>
        <th style="text-align:left;padding:4px 0;border-bottom:1px solid #000">NUM</th>
        <th style="text-align:left;padding:4px 0;border-bottom:1px solid #000">UBI</th>
        <th style="text-align:right;padding:4px 0;border-bottom:1px solid #000">APO</th>
        <th style="text-align:right;padding:4px 0;border-bottom:1px solid #000">GANÓ</th>
      </tr>
    </thead>
    <tbody>
      ${aciertosHTML}
    </tbody>
  </table>
  </div>
`;

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-weight:900;font-size:28px;letter-spacing:1px">LIQUIDACIÓN</div>
        <div style="font-weight:900;font-size:22px">${vendedor}</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:10px">
        <div>FECHA:&nbsp;<strong>${fecha}</strong></div>
        <div>ARGENTINA</div>
      </div>

      <hr style="border:2px solid #000;margin:6px 0 10px 0">
      ${aciertosHtml}

      <hr style="border:1px solid #000;margin:10px 0">
      <div style="font-size:18px;line-height:1.6">
        <div style="display:flex;justify-content:space-between"><span>PREVIA:</span><strong>$${fmt1(resumen.Previa)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>PRIMERA:</span><strong>$${fmt1(resumen.Primera)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>MATUTINA:</span><strong>$${fmt1(resumen.Matutina)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>VESPERTINA:</span><strong>$${fmt1(resumen.Vespertina)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>NOCTURNA:</span><strong>$${fmt1(resumen.Nocturna)}</strong></div>
      </div>

      <hr style="border:2px solid #000;margin:12px 0">
      <div style="font-size:18px;line-height:1.6">
        <div style="display:flex;justify-content:space-between"><span>TOTAL PASE:</span><strong>$${fmt1(total_pase)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>COMISIÓN:</span><strong>$${fmt1(comision)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>TOTAL ACIERTOS:</span><strong>$${fmt1(aciertosTot)}</strong></div>
        ${reclamos ? `<div style="display:flex;justify-content:space-between"><span>RECLAMOS:</span><strong>${money(reclamos)}</strong></div>` : ``}
      </div>

      <hr style="border:2px solid #000;margin:12px 0">
      <div style="display:flex;justify-content:space-between;font-size:22px">
        <span>SALDO FINAL:</span><strong>${money(saldo)}</strong>
      </div>

      ${bonoVend>0 ? `
        <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:20px;color:#0a0">
          <span><strong>BONO VENDEDOR${bonoTxt}:</strong></span>
          <strong>$${fmt1(bonoVend)}</strong>
        </div>
      ` : ''}

      <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:18px">
        <span>ARRASTRE ANTERIOR:</span>
        <strong>${money(arrastreAnterior)}</strong>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:18px">
        <span>SALDO + ARRASTRE:</span>
        <strong>${money(arrastreFin)}</strong>
      </div>
    `;

    // ✅ Auto-fit: si entra, NO scroll; si no entra, se achica solo
    const fitTicket = () => {
      if (!scaleWrap || !body) return;

      // reset
      body.style.transform = 'scale(1)';

      const availW = (scaleWrap.clientWidth || 0) - 8;
      const naturalW = body.scrollWidth || 0;
      if (availW <= 0 || naturalW <= 0) return;

      const s = Math.min(1, availW / naturalW);
      body.style.transform = `scale(${s})`;
    };

    // evitar múltiples listeners por cada render
    if (targetEl._liqFitHandler) {
      window.removeEventListener('resize', targetEl._liqFitHandler);
    }
    targetEl._liqFitHandler = () => fitTicket();
    window.addEventListener('resize', targetEl._liqFitHandler, { passive: true });

    // primera ejecución
    fitTicket();


    document.getElementById('btnDescargarLiq').onclick = () => {
      html2canvas(body, { backgroundColor: '#fff', scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `liquidacion_${vendedor}_${fecha}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      });
    };

    loading?.remove();
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div style="color:#c33">❌ No se pudo cargar la liquidación.</div>`;
    if (loading) loading.textContent = 'Error';
  }
}

/* Mantengo esta para el botón "Ver" de la izquierda, pero ahora usa la real y NO lista tickets */
async function renderLiquidacion({ fecha, vendedor, targetEl }) {
  await renderLiquidacionRealAdmin({ fecha, vendedor, targetEl });
}
/** Botón "Subir Liquidaciones" con loading + anti doble click (sin tocar tu lógica) */
async function uiSubirLiquidacionesAdmin(btn) {
  if (!btn || btn.dataset.loading === '1') return;
  const original = btn.innerHTML;
  btn.dataset.loading = '1';
  btn.disabled = true;
  btn.innerHTML = `Subiendo… <span class="spin" style="
    display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin 0.8s linear infinite"></span>`;

  try {
    await subirLiquidacionesManuales(); // 👉 tu función ya existente
  } catch (e) {
    console.error(e);
    alert('Error al subir liquidaciones');
  } finally {
    btn.dataset.loading = '0';
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

// mini CSS para el spinner (una sola vez)
(function(){
  if (document.getElementById('spin-css')) return;
  const css = `@keyframes spin{to{transform:rotate(360deg)}}`;
  const s = document.createElement('style');
  s.id = 'spin-css';
  s.textContent = css;
  document.head.appendChild(s);
})();
async function cargarVendedoresParaReclamo(selectEl) {
  if (!selectEl) return;
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('usuario')
      .eq('rol','vendedor')
      .order('usuario',{ascending:true});
    if (error) throw error;
    const arr = (data||[]).map(u=>u.usuario);
    selectEl.innerHTML = `<option value="">(Elegir)</option>` + arr.map(u=>`<option value="${u}">${u}</option>`).join('');
  } catch(e) {
    console.warn('No se pudieron cargar vendedores (reclamos)', e);
  }
}

async function agregarReclamo() {
  if (!window.ES_CENTRAL) return alert('Solo el central puede cargar reclamos.');

  const fecha = (document.getElementById('recFecha')?.value || '').trim();
  const vendedor = (document.getElementById('recVend')?.value || '').trim();
  const impTxt = (document.getElementById('recImporte')?.value || '').trim();

  if (!fecha) return alert('Elegí una fecha');
  if (!vendedor) return alert('Elegí un vendedor');
  if (!impTxt) return alert('Ingresá un importe (ej: 10000 o -10000)');

  const importe = parseFloat(impTxt.replace(',', '.'));
  if (isNaN(importe)) return alert('Importe inválido');

  const payload = {
    fecha,
    vendedor,
    importe // positivo descuenta; negativo suma
  };
  console.log("🧾 [RECLAMO] Payload a insertar:", payload);

  const { error } = await supabase.from('reclamos').insert([payload]);
  if (error) {
    console.error('Error insertando reclamo:', error);
    return alert('No se pudo agregar el reclamo.');
  }

  document.getElementById('recImporte').value = '';
  alert('✅ Reclamo agregado');
}

async function listarReclamosDia() {
  const tbody = document.getElementById('recRows');
  if (!tbody) return;
  const fecha = document.getElementById('recFecha')?.value;
  if (!fecha) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;text-align:center;color:#888">Elegí fecha</td></tr>`;
    return;
  }

  const { data, error } = await supabase
  .from('reclamos')
  .select('id,fecha,vendedor,importe') // 👈 solo columnas existentes
  // .order('id', { ascending: false }) // 👈 opcional: descomentar si tu tabla tiene 'id'
  .eq('fecha', fecha);

  if (error) {
    console.error('Error listando reclamos:', error);
    tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;text-align:center;color:#c33">Error al cargar reclamos</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;text-align:center;color:#888">Sin reclamos</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => `
    <tr style="border-bottom:1px solid #222">
      <td style="padding:8px">${r.fecha}</td>
      <td style="padding:8px">${r.vendedor}</td>
      <td style="padding:8px;text-align:right">$${(r.importe||0).toLocaleString('es-AR')}</td>
      <td style="padding:8px;text-align:center">
        <button onclick="eliminarReclamo(${r.id})" style="padding:4px 8px; background:#e74c3c; color:#fff; border:none; border-radius:4px">🗑</button>
      </td>
    </tr>
  `).join('');
}

async function eliminarReclamo(id) {
  if (!window.ES_CENTRAL) return alert('Solo el central puede borrar reclamos.');
  if (!confirm('¿Eliminar este reclamo?')) return;

  const { error } = await supabase.from('reclamos').delete().eq('id', id);
  if (error) {
    console.error('Error borrando reclamo:', error);
    return alert('No se pudo borrar.');
  }
  await listarReclamosDia();
  await buscarLiquidacionesAdmin(); // refresca totales
}
/***** ===================== JUGADAS ENVIADAS — ADMIN ===================== *****/

/***** ===================== 👑 ADMIN PADRE — SOLAPA “ADMINISTRADORES” ===================== *****/

/* Utilidades */
function ADM_money(n){
  const x = Number(n)||0, neg = x<0, abs = Math.abs(x);
  return (neg?'-':'') + '$' + abs.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}
function ADM_hoyISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
/* Semana por defecto: DOM (domingo) → SAB (sábado) que contiene HOY */
function ADM_semanaActualDomSab(){
  const d = new Date();
  const dow = d.getDay(); // 0=Dom,6=Sab
  const dom = new Date(d); dom.setDate(d.getDate() - dow);            // Domingo
  const sab = new Date(dom); sab.setDate(dom.getDate() + 6);           // Sábado
  const toISO = (x)=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  return { desde: toISO(dom), hasta: toISO(sab) };
}

/* === DATA LAYER === */

/** Lista de admins_hijo (usuarios.rol = 'admin_hijo') */
async function ADM_listarAdminsHijo(){
  // 👉 admin_hijo: solo puede verse a sí mismo
  if (window.ES_ADMIN_HIJO) return [window.USUARIO_ACTUAL];

  // 👉 admin padre: ver todos los admin_hijo (podés ajustar si querés por creado_por)
  const { data, error } = await supabase
    .from('usuarios')
    .select('usuario')
    .eq('rol','admin_hijo')
    .order('usuario',{ascending:true});

  if (error) { console.warn('ADM_listarAdminsHijo', error); return []; }
  return (data||[]).map(r=>r.usuario);
}

/** Vendedores creados por un admin_hijo (robusto con fallback) */
async function ADM_vendedoresDe(adminUsuario){
  const admin = String(adminUsuario||'').trim();
  console.log('DBG ADM_vendedoresDe → adminUsuario=', admin);

  // 1) intento rápido: filtrar en SQL (si existe la columna)
  let res = await supabase
    .from('usuarios')
    .select('usuario, rol, creado_por')
    .eq('rol','vendedor')
    .eq('creado_por', admin);

  // 42703 = columna no existe -> fallback
  if (res.error && String(res.error.code) === '42703'){
    console.warn('ADM_vendedoresDe: columna "creado_por" no existe en esta tabla/vista. Uso fallback en cliente.', res.error);
    res = await supabase
      .from('usuarios')
      .select('usuario, rol, creado_por'); // traigo todo y filtro acá
  }

  console.log('DBG ADM_vendedoresDe raw:', { error: res.error, sample: (res.data||[]).slice(0,3) });

  if (res.error) {
    console.warn('ADM_vendedoresDe error final:', res.error);
    return [];
  }

  const rows = (res.data||[])
    .filter(r => String(r.rol) === 'vendedor' && String(r.creado_por||'').trim() === admin);

  const vendedores = rows.map(r => String(r.usuario));
  console.log('DBG pasadores encontrados=', vendedores);
  return vendedores;
}

/** Porcentaje configurado para admin_hijo (default 50 si no existe) */
async function ADM_getPorcentaje(adminUsuario){
  const { data, error } = await supabase
    .from('admin_config')
    .select('porcentaje')
    .eq('admin_usuario', adminUsuario)
    .maybeSingle();
  if (error) { console.warn('ADM_getPorcentaje', error); }
  return Number(data?.porcentaje ?? 50);
}

/** Guardar porcentaje (upsert) */
async function ADM_setPorcentaje(adminUsuario, porcentaje){
  const { error } = await supabase
    .from('admin_config')
    .upsert({ admin_usuario: adminUsuario, porcentaje: Number(porcentaje)||0, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Después (solo filas sin vendedor):
async function ADM_movimientos(adminUsuario, desde, hasta){
  let q = supabase
    .from('admin_movimientos')
    .select('id, fecha, monto, nota, created_at, vendedor')
    .eq('admin_usuario', adminUsuario)
    .gte('fecha', desde).lte('fecha', hasta)
    .is('vendedor', null)                           // ⬅️ clave: solo admin puro
    .order('fecha', { ascending: true })
    .order('id', { ascending: true });

  const { data, error } = await q;
  if (error) { console.warn('ADM_movimientos', error); return []; }
  return (data || []);
}

/** Registrar movimiento */
async function ADM_agregarMovimiento({ adminUsuario, fecha, monto, nota }){
  const payload = {
    admin_usuario: adminUsuario,
    fecha,
    monto: Number(monto)||0,
    nota: (nota||'').trim()
  };
  const { error } = await supabase.from('admin_movimientos').insert([payload]);
  if (error) throw error;
}
// === Saldo GLOBAL acumulado (histórico) con misma regla que el semanal ===
// Por pasador: contrib = ultimoSaldo + min(0, saldoAnteriorDelUltimoDia)
// Global = ( Σ contrib - Σ bonosHistoricos ) * %  -  Σ movimientos
async function ADM_saldoGlobal(adminUsuario){
  const vendedores = await ADM_vendedoresDe(adminUsuario);
  if (!vendedores.length) return 0;

  // Traigo TODO el historial de liquidaciones de esos pasadores
  const { data: liqs, error: err } = await supabase
    .from('liquidaciones')
    .select('fecha, vendedor, saldo_final, saldo_final_arrastre, bono_vendedor')
    .in('vendedor', vendedores.map(String))
    .order('vendedor', { ascending: true })
    .order('fecha',    { ascending: true });

  if (err || !liqs) return 0;

  // Agrupo por vendedor y normalizo
  const byVend = new Map();
  for (const r of liqs){
    const v = String(r.vendedor || '');
    const row = {
      fecha: r.fecha,
      saldo: Number(r.saldo_final ?? r.saldo_final_arrastre ?? 0),
      bono:  Number(r.bono_vendedor || 0),
    };
    if (!byVend.has(v)) byVend.set(v, []);
    byVend.get(v).push(row);
  }

  // 1) Arrastre "vigente" global con la misma regla que usás en la semana
  let arrastreLikeSemana = 0;
  let totalBonosHistoricos = 0;

  for (const rows of byVend.values()){
    totalBonosHistoricos += rows.reduce((s, x) => s + x.bono, 0);

    const L = rows[rows.length - 1];                 // último día del historial
    const P = rows.length >= 2 ? rows[rows.length - 2] : null; // día anterior al último

    const contrib = L.saldo + Math.min(0, P ? P.saldo : 0);
    arrastreLikeSemana += contrib;
  }

  // 2) Neto global y % admin
  const netoGlobal = arrastreLikeSemana - totalBonosHistoricos;
  const pct = await ADM_getPorcentaje(adminUsuario);
  const debeGlobal = netoGlobal * (pct / 100);

  // Después:
const { data: movs } = await supabase
.from('admin_movimientos')
.select('monto, vendedor')
.eq('admin_usuario', adminUsuario)
.is('vendedor', null);                 // ⬅️ solo admin puro

  const pagado = (movs || []).reduce((s, m) => s + (Number(m.monto) || 0), 0);
  console.log('ADM_saldoGlobal DEBUG', {
    arrastreLikeSemana,
    totalBonosHistoricos,
    netoGlobal,
    pct,
    pagado,
    resultado: (netoGlobal * (pct/100)) - pagado
  });
  return debeGlobal - pagado;
}
// Carga única de liquidaciones en el rango (reutilizable)
async function ADM_liqsRango(vendedores, desde, hasta){
  if (!vendedores.length) return [];
  const { data, error } = await supabase
    .from('liquidaciones')
    .select('fecha, vendedor, saldo_final, saldo_final_arrastre, bono_vendedor')
    .gte('fecha', desde).lte('fecha', hasta)
    .in('vendedor', vendedores.map(String)) // forzar string
    .order('fecha', { ascending: true })
    .order('vendedor', { ascending: true });

  if (error) { console.warn('ADM_liqsRango', error); return []; }

  return (data||[]).map(r => ({
    ...r,
    vendedor: String(r.vendedor||''),
    _saldoFinal: Number(r.saldo_final ?? r.saldo_final_arrastre ?? 0),
  }));
}
// Suma el arrastre vigente de TODOS los pasadores del admin en la semana:
// para cada vendedor toma la ÚLTIMA liquidación del rango y usa su _saldoFinal
// (si hay varios vendedores, los suma).

// === Resumen por DÍA (totales para la semana) ===
async function ADM_liqsPorDia(adminUsuario, desde, hasta, rows){
  const vendedores = await ADM_vendedoresDe(adminUsuario);
  rows = rows || await ADM_liqsRango(vendedores, desde, hasta);
  const map = new Map();
  rows.forEach(r=>{
    const f = r.fecha;
    const cur = map.get(f) || { arrastreDia:0, bonoDia:0 };
    cur.arrastreDia += Number(r.saldo_final_arrastre)||0;
    cur.bonoDia     += Number(r.bono_vendedor)||0;
    map.set(f, cur);
  });
  return [...map.entries()]
    .sort((a,b)=> a[0].localeCompare(b[0]))
    .map(([fecha, v]) => ({ fecha, ...v, netoDia: v.arrastreDia - v.bonoDia }));
}

async function ADM_liqsPorDiaPas(adminUsuario, desde, hasta, rows){
  const vendedores = await ADM_vendedoresDe(adminUsuario);
  rows = rows || await ADM_liqsRango(vendedores, desde, hasta);
  const map = new Map(); // fecha__vend
  rows.forEach(r=>{
    const k = `${r.fecha}__${r.vendedor||'(sin)'}`;
    const cur = map.get(k) || { fecha:r.fecha, vendedor:String(r.vendedor||'(sin)'), arrastre:0, bonos:0 };
    cur.arrastre += Number(r.saldo_final_arrastre)||0;
    cur.bonos    += Number(r.bono_vendedor)||0;
    map.set(k, cur);
  });
  return [...map.values()]
    .sort((a,b)=> a.fecha===b.fecha ? a.vendedor.localeCompare(b.vendedor,'es') : a.fecha.localeCompare(b.fecha))
    .map(r=> ({ ...r, neto: r.arrastre - r.bonos }));
}
/** Cálculo semanal completo */
async function ADM_calculoSemanal(adminUsuario, desde, hasta){
  const vendedores = await ADM_vendedoresDe(adminUsuario);
  const [rows, porcentaje, movs] = await Promise.all([
    ADM_liqsRango(vendedores, desde, hasta),
    ADM_getPorcentaje(adminUsuario),
    ADM_movimientos(adminUsuario, desde, hasta)
  ]);

  const dias = await ADM_liqsPorDia(adminUsuario, desde, hasta, rows);

  const totalArrastre = dias.reduce((s,r)=> s + r.arrastreDia, 0);
  const totalBonos    = dias.reduce((s,r)=> s + r.bonoDia, 0);
  const netoSemanal   = totalArrastre - totalBonos;
  const debeCobrar    = netoSemanal * (porcentaje/100);
  const pagado        = movs.reduce((s,m)=> s + (Number(m.monto)||0), 0);
  const saldoPendiente= debeCobrar - pagado;

  return {
    porcentaje, dias, totalArrastre, totalBonos,
    netoSemanal, debeCobrar, pagado, saldoPendiente,
    movs,
    _rows: rows      // 👈 agrega esto
  };
}

/* === UI === */
async function mostrarPanelAdministradores() {
  const zona = document.getElementById('zonaContenido');
  if (!zona) return;
  zona.innerHTML = `
    <h1 style="color:#fff;margin:0 0 12px;display:flex;align-items:center;gap:8px">🛡️ Administradores</h1>
    <div style="background:#111;border:1px solid #333;border-radius:8px;padding:12px">
      <div style="color:#bbb">Acá va el panel de administración (padre) para crear/editar admins, porcentaje, cierres semanales, pagos, etc.</div>
    </div>
  `;
}

async function mostrarAdministradoresAdmin(){
  const zona = document.getElementById('zonaContenido');
  if (!zona) return;
  const SEM = ADM_semanaActualDomSab();

  zona.innerHTML = `
  <h1 style="color:#fff;margin:0 0 12px;display:flex;align-items:center;gap:8px">👥 Administradores</h1>

  <!-- FILA SUPERIOR: filtros (33%) · porcentaje (33%) · movimientos (33%) -->
  <div style="display:grid;grid-template-columns:repeat(3,minmax(260px,1fr));gap:12px;margin-bottom:12px">
    <!-- Filtros -->
    <div style="background:#111;border:1px solid #333;border-radius:8px;padding:12px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label style="color:#bbb">Desde</label>
        <input type="date" id="adm_desde" value="${SEM.desde}" style="padding:6px;min-width:140px">
        <label style="color:#bbb">Hasta</label>
        <input type="date" id="adm_hasta" value="${SEM.hasta}" style="padding:6px;min-width:140px">
        <label style="color:#bbb">Admin</label>
        <select id="adm_admin" style="padding:6px;min-width:160px"><option value="">(Elegir)</option></select>
        <button id="adm_refrescar" style="margin-left:auto;padding:6px 12px">Actualizar</button>
      </div>
    </div>

    <!-- Porcentaje -->
    <div style="background:#111;border:1px solid #333;border-radius:8px;padding:12px">
      <div style="color:#ddd;font-weight:700;margin-bottom:6px">Porcentaje del admin</div>
      <div style="display:flex;gap:10px;align-items:center">
        <input id="adm_pct" type="number" step="1" min="0" max="100" style="padding:6px;width:90px"> %
        <button id="adm_guardar_pct" style="margin-left:auto;padding:6px 12px">Guardar</button>
      </div>
    </div>

    <!-- Movimientos -->
    <div style="background:#111;border:1px solid #333;border-radius:8px;padding:12px">
      <div style="color:#ddd;font-weight:700;margin-bottom:6px">Movimientos (pagos)</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="color:#bbb">Fecha</label>
        <input type="date" id="adm_mov_fecha" value="${ADM_hoyISO()}" style="padding:6px">
        <label style="color:#bbb">Monto</label>
        <input type="number" id="adm_mov_monto" placeholder=">0 te pagó / <0 vos pagás" style="padding:6px;width:160px">
        <input type="text" id="adm_mov_nota" placeholder="Nota (opcional)" style="padding:6px;flex:1;min-width:120px">
        <button id="adm_mov_agregar" style="padding:6px 12px">Agregar</button>
      </div>
      <div style="max-height:200px;overflow:auto;border-top:1px solid #222;margin-top:10px">
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#ddd">
          <thead>
            <tr style="background:#161616">
              <th style="text-align:left;padding:6px">Fecha</th>
              <th style="text-align:right;padding:6px">Monto</th>
              <th style="text-align:left;padding:6px">Nota</th>
            </tr>
          </thead>
          <tbody id="adm_mov_rows">
            <tr><td colspan="3" style="padding:8px;color:#888;text-align:center">Sin movimientos</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- CARDS: una sola hilera con scroll horizontal si no entran -->
  <div id="adm_cards" style="display:flex;gap:10px;overflow:auto;white-space:nowrap;margin-bottom:12px"></div>

  <!-- PANEL DATOS -->
  <div id="adm_panel" style="display:none">
    <div style="border:1px solid #333;border-radius:8px;overflow:hidden">
      <div style="background:#1b1b1b;color:#ddd;padding:8px;font-weight:700">Detalle diario</div>
      <div style="max-height:480px;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#ddd">
          <thead>
            <tr style="background:#161616">
              <th style="text-align:left;padding:8px">Fecha</th>
              <th style="text-align:left;padding:8px">Pasador</th> <!-- ← agregado -->
              <th style="text-align:right;padding:8px">Saldo final</th>
              <th style="text-align:right;padding:8px">Arrastre día</th>
              <th style="text-align:right;padding:8px">Bonos día</th>
              <th style="text-align:right;padding:8px">Neto día</th>
            </tr>
          </thead>
          <tbody id="adm_rows"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="adm_hint" style="color:#888">Elegí un admin y un rango para ver su cuenta.</div>
`;
// ► Admin hijo: solo lectura (no cambiar % ni cargar movimientos)
if (window.ES_ADMIN_HIJO){
  ['adm_pct','adm_guardar_pct','adm_mov_fecha','adm_mov_monto','adm_mov_nota','adm_mov_agregar']
    .forEach(id=>{ const el=document.getElementById(id); if (el){ el.disabled=true; el.style.opacity=.6; el.title='Solo lectura (admin hijo)'; }});
}

// Cargar admins_hijo
const sel = document.getElementById('adm_admin');
const admins = await ADM_listarAdminsHijo();

if (window.ES_ADMIN_HIJO) {
  // 👉 solo yo, y bloqueado
  sel.innerHTML = `<option value="${USUARIO_ACTUAL}">${USUARIO_ACTUAL}</option>`;
  sel.value = USUARIO_ACTUAL;
  sel.disabled = true;
} else {
  sel.innerHTML = `<option value="">(Elegir admin)</option>` +
                  admins.map(u=>`<option value="${u}">${u}</option>`).join('');
}

// Eventos
document.getElementById('adm_refrescar').onclick = refrescar;
  /* ========== SUB-PANEL: Control por Pasador (NO % ) ========== */
  const sub = document.createElement('div');
  sub.innerHTML = `
  <div style="margin-top:16px;border:1px solid #333;border-radius:8px;overflow:hidden">
    <div style="background:#1b1b1b;color:#ddd;padding:8px;font-weight:700;display:flex;align-items:center;gap:10px">
      Control por pasador (sin %)
      <span id="pas_status" style="font-weight:400;color:#9ad"></span>
    </div>

    <div style="display:flex;gap:10px;align-items:flex-start">
      <!-- Panel 70% -->
      <div style="flex:7;padding:10px;background:#111;border-right:1px solid #222">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <label style="color:#bbb">Pasador</label>
          <select id="pas_sel" style="padding:6px;min-width:140px"><option value="">(Elegir)</option></select>

          <label style="color:#bbb;margin-left:6px">Desde</label>
          <input type="date" id="pas_desde" style="padding:6px;min-width:140px" value="${document.getElementById('adm_desde').value}">
          <label style="color:#bbb">Hasta</label>
          <input type="date" id="pas_hasta" style="padding:6px;min-width:140px" value="${document.getElementById('adm_hasta').value}">
          <button id="pas_run" style="margin-left:auto;padding:6px 10px">Actualizar</button>
        </div>

        <!-- Cards -->
        <div id="pas_cards" style="display:flex;gap:10px;overflow:auto;white-space:nowrap;padding:10px;background:#0f0f0f"></div>
      </div>

      <!-- Panel 30% -->
      <div style="flex:3;padding:10px;background:#101010">
        <div style="color:#ddd;font-weight:700;margin-bottom:6px">Pagos del pasador</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
          <label style="color:#bbb">Fecha</label>
          <input type="date" id="pas_mov_fecha" value="${ADM_hoyISO()}" style="padding:6px">
          <label style="color:#bbb">Monto</label>
          <input type="number" id="pas_mov_monto" placeholder=">0 te pagó / <0 vos pagás" style="padding:6px;width:120px">
          <input type="text" id="pas_mov_nota" placeholder="Nota" style="padding:6px;flex:1;min-width:100px">
          <button id="pas_mov_agregar" style="padding:6px 12px">Agregar</button>
        </div>
        <div style="max-height:220px;overflow:auto;border-top:1px solid #222">
          <table style="width:100%;border-collapse:collapse;font-size:13px;color:#ddd">
            <thead>
              <tr style="background:#161616">
                <th style="text-align:left;padding:6px">Fecha</th>
                <th style="text-align:right;padding:6px">Monto</th>
                <th style="text-align:left;padding:6px">Nota</th>
              </tr>
            </thead>
            <tbody id="pas_mov_rows">
              <tr><td colspan="3" style="padding:8px;color:#888;text-align:center">Sin movimientos</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
`;
  zona.appendChild(sub);

  // Cargar pasadores del admin elegido en el selector
const pasSel = sub.querySelector('#pas_sel');
const adminSel = document.getElementById('adm_admin');

// Si no eligieron nada en el combo de admin, uso el usuario actual (sirve para el central)
const adminTarget = adminSel?.value || window.USUARIO_ACTUAL || 'admin';

console.log('DBG cargar pasadores para adminTarget=', adminTarget);
const pasadores = await ADM_vendedoresDe(adminTarget);
console.log('DBG pasadores encontrados=', pasadores);

pasSel.innerHTML = `<option value="">(Elegir)</option>` +
  pasadores.map(v=>`<option value="${v}">${v}</option>`).join('');

  // Wire
  sub.querySelector('#pas_run').onclick = runPas;
  sub.querySelector('#pas_mov_agregar').onclick = async ()=>{
    const vend  = pasSel.value; if (!vend) return alert('Elegí un pasador');
    const fecha = sub.querySelector('#pas_mov_fecha').value;
    const monto = sub.querySelector('#pas_mov_monto').value;
    const nota  = sub.querySelector('#pas_mov_nota').value;
    if (!fecha || !monto) return alert('Completá fecha y monto');
    try{
      await PAS_agregarMovimiento({ adminUsuario: sel.value, vendedor: vend, fecha, monto, nota });
      sub.querySelector('#pas_mov_monto').value = '';
      sub.querySelector('#pas_mov_nota').value = '';
      await runPas();
    }catch(e){ console.error(e); alert('No se pudo agregar el pago'); }
  };

  async function runPas(){
    const vend  = pasSel.value;
    const desde = sub.querySelector('#pas_desde').value;
    const hasta = sub.querySelector('#pas_hasta').value;
    const status = sub.querySelector('#pas_status');
    const cardsBox = sub.querySelector('#pas_cards');
    const tbMovs   = sub.querySelector('#pas_mov_rows');

    if (!vend){ status.textContent=''; cardsBox.innerHTML=''; tbMovs.innerHTML=`<tr><td colspan="3" style="padding:8px;color:#888;text-align:center">Elegí un pasador</td></tr>`; return; }

    status.textContent = 'Cargando…';

    // Totales por pasador (rango)
    const arrVig = await PAS_arrastreVigenteRango(vend, desde, hasta);
    const bonRng = await PAS_bonosEnRango(vend, desde, hasta);
    const neto   = arrVig - bonRng;

    // Pagos por pasador (históricos y en rango)
    const movsRango = await PAS_movimientos({ adminUsuario: sel.value, vendedor: vend, desde, hasta });
    const pagosRango = movsRango.reduce((s,m)=> s + (Number(m.monto)||0), 0);

    // Saldo global histórico del pasador (sin %)
    const saldoGlobalPas = await PAS_saldoGlobalHistorico(sel.value, vend);

    // Cards (sin %)
    const cards = [
      { t:'Arrastre (semana)', v: ADM_money(arrVig) },
      { t:'Bonos (semana)',    v: ADM_money(bonRng) },
      { t:'Neto (A−B)',        v: ADM_money(neto) },
      { t:'Pagos registrados', v: ADM_money(pagosRango) },
      { t:'Saldo global (pasador)', v: ADM_money(saldoGlobalPas), color: saldoGlobalPas>0?'#46d46a':(saldoGlobalPas<0?'#ff6b6b':'#fff') },
    ].map(k=>`
      <div style="background:#0f0f0f;border:1px solid #333;border-radius:10px;padding:12px;min-width:200px">
        <div style="color:#bbb;font-size:12px">${k.t}</div>
        <div style="color:${k.color||'#fff'};font-weight:800;font-size:20px">${k.v}</div>
      </div>
    `).join('');
    cardsBox.innerHTML = cards;

    // Tabla de pagos (rango) por pasador
    tbMovs.innerHTML = (movsRango.length
      ? movsRango.map(m=>`
        <tr style="border-bottom:1px solid #222">
          <td style="padding:6px">${m.fecha}</td>
          <td style="padding:6px;text-align:right">${ADM_money(m.monto)}</td>
          <td style="padding:6px">${(m.nota||'').replace(/</g,'&lt;')}</td>
        </tr>`).join('')
      : `<tr><td colspan="3" style="padding:8px;color:#888;text-align:center">Sin movimientos</td></tr>`
    );

    status.textContent = '';
  }
document.getElementById('adm_guardar_pct').onclick = async ()=>{
  const admin = sel.value; if (!admin) return alert('Elegí un admin');
  const pct = Number(document.getElementById('adm_pct').value||0);
  try{
    await ADM_setPorcentaje(admin, pct);
    alert('✅ Porcentaje actualizado');
    await refrescar();
  }catch(e){ console.error(e); alert('No se pudo guardar el porcentaje'); }
};
document.getElementById('adm_mov_agregar').onclick = async ()=>{
  const admin = sel.value; if (!admin) return alert('Elegí un admin');
  const fecha = document.getElementById('adm_mov_fecha').value;
  const monto = document.getElementById('adm_mov_monto').value;
  const nota  = document.getElementById('adm_mov_nota').value;
  if (!fecha || !monto) return alert('Completá fecha y monto');
  try{
    await ADM_agregarMovimiento({ adminUsuario: admin, fecha, monto, nota });
    document.getElementById('adm_mov_monto').value='';
    document.getElementById('adm_mov_nota').value='';
    await refrescar();
  }catch(e){ console.error(e); alert('No se pudo agregar el movimiento'); }
};
function ADM_mapSaldoFinalPorDia(rows){
  const M = new Map(); // clave: "YYYY-MM-DD__vendedor"
  (rows||[]).forEach(r=>{
    const k = `${r.fecha}__${String(r.vendedor)}`;
    // nos quedamos con el saldo del día (si hubiera varias liquidaciones, la última del día pisa a la anterior)
    M.set(k, Number(r._saldoFinal||0));
  });
  return M;
}
async function refrescar(){
  const admin = sel.value;
  const desde = document.getElementById('adm_desde').value;
  const hasta = document.getElementById('adm_hasta').value;
  if (!admin || !desde || !hasta){
    document.getElementById('adm_panel').style.display='none';
    document.getElementById('adm_hint').style.display='';
    return;
  }
  document.getElementById('adm_hint').style.display='none';
  document.getElementById('adm_panel').style.display='';

  const [calc, saldoGlobal, arrastreVigente] = await Promise.all([
    ADM_calculoSemanal(admin, desde, hasta),
    ADM_saldoGlobal(admin),                    // ← histórico
    ADM_arrastreVigente(admin, desde, hasta),
  ]);

  const netoVigente           = arrastreVigente - (calc.totalBonos || 0);
  const debeCobrarVigente     = netoVigente * (calc.porcentaje / 100);
  const saldoPendienteVigente = debeCobrarVigente - (calc.pagado || 0);

  // Usamos las mismas rows ya cargadas para el detalle por pasador/día:
const detallePas = await ADM_liqsPorDiaPas(admin, desde, hasta, calc._rows);
  // ⛔️ NO re-definir saldoGlobal acá: que quede el histórico
  const colorSaldo = saldoGlobal > 0 ? '#46d46a' : (saldoGlobal < 0 ? '#ff6b6b' : '#fff');

  const cards = [
    { t:'Arrastre (semana)', v: ADM_money(arrastreVigente) },
    { t:'Bonos (semana)',    v: ADM_money(calc.totalBonos) },
    { t:'Neto (A−B)',        v: ADM_money(netoVigente) },
    { t:`% Admin (${calc.porcentaje}%)`, v: ADM_money(debeCobrarVigente) },
    { t:'Pagos registrados', v: ADM_money(calc.pagado) },
    { t:'Saldo pendiente',   v: ADM_money(saldoPendienteVigente) },
    { t:'Saldo global acumulado', v: ADM_money(saldoGlobal), color: colorSaldo },
  ].map(k=>`
    <div style="background:#0f0f0f;border:1px solid #333;border-radius:10px;padding:12px;min-width:200px">
      <div style="color:#bbb;font-size:12px">${k.t}</div>
      <div style="color:${k.color||'#fff'};font-weight:800;font-size:20px">${k.v}</div>
    </div>
  `).join('');
  document.getElementById('adm_cards').innerHTML = cards;

  // Pct input
  document.getElementById('adm_pct').value = calc.porcentaje;

  // Tabla diaria
  const tb = document.getElementById('adm_rows');
  const mapSaldo = ADM_mapSaldoFinalPorDia(calc._rows); // usa las rows del rango
  detallePas.sort((a,b)=> b.fecha.localeCompare(a.fecha));
  tb.innerHTML = (detallePas.length
    ? detallePas.map(r=>{
        const k = `${r.fecha}__${String(r.vendedor)}`;
        const saldoFinal = mapSaldo.get(k) ?? 0;
        return `
          <tr style="border-bottom:1px solid #222">
            <td style="padding:8px">${r.fecha}</td>
            <td style="padding:8px">${r.vendedor}</td>
            <td style="padding:8px;text-align:right">${ADM_money(saldoFinal)}</td>  <!-- 👈 NUEVA -->
            <td style="padding:8px;text-align:right">${ADM_money(r.arrastre)}</td>
            <td style="padding:8px;text-align:right">${ADM_money(r.bonos)}</td>
            <td style="padding:8px;text-align:right">${ADM_money(r.neto)}</td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="6" style="padding:10px;color:#888;text-align:center">Sin datos en el rango</td></tr>`
  );



  // Movimientos
  const tm = document.getElementById('adm_mov_rows');
  if (tm){
    tm.innerHTML = (calc.movs.length
      ? calc.movs.map(m=>`
          <tr style="border-bottom:1px solid #222">
            <td style="padding:6px">${m.fecha}</td>
            <td style="padding:6px;text-align:right">${ADM_money(m.monto)}</td>
            <td style="padding:6px">${(m.nota||'').replace(/</g,'&lt;')}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="3" style="padding:8px;color:#888;text-align:center">Sin movimientos</td></tr>`
    );
  }
}
}

/* ===== Cómo enlazar esta solapa desde tu menú =====
   Donde tengas tu barra lateral/botones, agregá:
   <button onclick="mostrarAdministradoresAdmin()">Administradores</button>
   (o el ítem equivalente)
*/

/* ========= 🧩 BLOQUE “POR PASADOR” (ADD-ON) ========= */

/** Movimientos por pasador (históricos o en rango) */
async function PAS_movimientos({ adminUsuario, vendedor, desde=null, hasta=null }){
  let q = supabase
    .from('admin_movimientos')
    .select('id,fecha,monto,nota,created_at')
    .eq('admin_usuario', adminUsuario)
    .eq('vendedor', String(vendedor||''));            // 👈 filtramos por pasador

  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);

  const { data, error } = await q.order('fecha', { ascending:true }).order('id', { ascending:true });
  if (error) { console.warn('PAS_movimientos', error); return []; }
  return data || [];
}

/** Registrar pago por pasador (no afecta los pagos del admin sin pasador) */
async function PAS_agregarMovimiento({ adminUsuario, vendedor, fecha, monto, nota }){
  const payload = {
    admin_usuario: adminUsuario,
    vendedor: String(vendedor||''),
    fecha,
    monto: Number(monto)||0,
    nota: (nota||'').trim()
  };
  const { error } = await supabase.from('admin_movimientos').insert([payload]);
  if (error) throw error;
}

// ✅ Arrastre vigente del PASADOR en el rango
//    = último saldo del rango + min(0, saldo del día anterior en el rango)
async function PAS_arrastreVigenteRango(vendedor, desde, hasta){
  const { data, error } = await supabase
    .from('liquidaciones')
    .select('fecha, saldo_final, saldo_final_arrastre')
    .eq('vendedor', String(vendedor||''))
    .gte('fecha', desde).lte('fecha', hasta)
    .order('fecha', { ascending: true });

  if (error || !data || data.length === 0) return 0;

  const rows = data.map(r => ({
    fecha: r.fecha,
    saldo: Number(r.saldo_final ?? r.saldo_final_arrastre ?? 0)
  }));

  const L = rows[rows.length - 1];                 // último del rango
  const P = rows.length >= 2 ? rows[rows.length - 2] : null; // día anterior

  const vigente = (L?.saldo || 0) + Math.min(0, P ? P.saldo : 0);
  console.log('DBG PAS_arrastreVigenteRango', { vendedor:String(vendedor), desde, hasta, L, P, vigente });
  return vigente;
}
// Bonos del PASADOR en el rango  ✅ (global, no dentro de otra función)
async function PAS_bonosEnRango(vendedor, desde, hasta){
  const { data, error } = await supabase
    .from('liquidaciones')
    .select('bono_vendedor, fecha')
    .eq('vendedor', String(vendedor||''))
    .gte('fecha', desde).lte('fecha', hasta);

  if (error || !data) return 0;
  return data.reduce((s,r)=> s + (Number(r.bono_vendedor)||0), 0);
}
// ✅ SALDO GLOBAL HISTÓRICO del PASADOR (sin %)
//    = (último saldo histórico + min(0, saldo día anterior histórico)) - bonos históricos - pagos del pasador
async function PAS_saldoGlobalHistorico(adminUsuario, vendedor){
  const { data, error } = await supabase
    .from('liquidaciones')
    .select('fecha, saldo_final, saldo_final_arrastre, bono_vendedor')
    .eq('vendedor', String(vendedor||''))
    .order('fecha', { ascending: true });

  if (error || !data || data.length === 0) return 0;

  const rows = data.map(r => ({
    fecha: r.fecha,
    saldo: Number(r.saldo_final ?? r.saldo_final_arrastre ?? 0),
    bono : Number(r.bono_vendedor || 0),
  }));

  const L = rows[rows.length - 1];                 // último histórico
  const P = rows.length >= 2 ? rows[rows.length - 2] : null;

  const arrastreLikeSemana = (L?.saldo || 0) + Math.min(0, P ? P.saldo : 0);
  const bonosHistoricos    = rows.reduce((s,x)=> s + x.bono, 0);
  const netoGlobal         = arrastreLikeSemana - bonosHistoricos;

  // pagos históricos del pasador
  const movs   = await PAS_movimientos({ adminUsuario, vendedor });
  const pagado = (movs || []).reduce((s,m)=> s + (Number(m.monto)||0), 0);

  const saldo = netoGlobal - pagado;
  console.log('DBG PAS_saldoGlobalHistorico', { arrastreLikeSemana, bonosHistoricos, netoGlobal, pagado, saldo });
  return saldo;
}

async function mostrarJugadasEnviadasAdmin() {
  const zona = document.getElementById('zonaContenido');
  if (!zona) return;

  const hoy = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0,10);

  zona.innerHTML = `
    <h1 style="color:#fff;margin:0 0 12px;display:flex;align-items:center;gap:8px">🎫 Jugadas enviadas</h1>

    <div style="background:#111;border:1px solid #333;border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <label style="color:#bbb">Desde</label>
        <input type="date" id="jv_desde" value="${hoy}" style="padding:6px">
        <label style="color:#bbb">Hasta</label>
        <input type="date" id="jv_hasta" value="${hoy}" style="padding:6px">

        <label style="color:#bbb">Pasador</label>
        <select id="jv_vend" style="padding:6px;min-width:140px"><option value="">(Todos)</option></select>

        <label style="color:#bbb">Ticket #</label>
        <input id="jv_ticket" type="number" placeholder="Opcional" style="padding:6px;width:120px">

        <button id="jv_buscar" style="padding:6px 10px">Buscar</button>
<div id="jv_stats" style="display:flex;align-items:center;gap:10px;margin-left:10px;color:#ddd;font-weight:600">
  <span>Tickets: <span id="jv_cnt" style="color:#7CFC9A">0</span></span>
  <span style="opacity:.6">|</span>
  <span>Monto: <span id="jv_sum" style="color:#7CFC9A">$0</span></span>
</div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button id="jv_del_sel" style="padding:6px 10px;background:#d35454;color:#fff;border:none;border-radius:6px">🗑 Eliminar seleccionados</button>
        </div>
      </div>
    </div>

    <div style="border:1px solid #333;border-radius:8px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
  <tr style="background:#1b1b1b;color:#ddd">
    <th style="padding:8px"><input type="checkbox" id="jv_chk_all"></th>
    <th style="text-align:left;padding:8px">Ticket</th>
    <th style="text-align:left;padding:8px">Fecha</th>
    <th style="text-align:left;padding:8px">Hora</th>
    <th style="text-align:left;padding:8px">Pasador</th>
    <th style="text-align:right;padding:8px">Total</th>
    <th style="text-align:right;padding:8px">#Jugadas</th>
    <th style="text-align:right;padding:8px">#Sorteos</th>
    <th style="text-align:left;padding:8px">Estado</th>
    <th style="text-align:center;padding:8px">Acciones</th>
  </tr>
</thead>
        <tbody id="jv_rows" style="background:#0f0f0f;color:#ccc">
          <tr><td colspan="10" style="padding:10px;text-align:center;color:#888">Cargá filtros y tocá “Buscar”.</td></tr>
        </tbody>
      </table>
    </div>
  `;
  // Cargar pasadores permitidos
  await cargarVendedoresPermitidosEnSelect(document.getElementById('jv_vend'));

  // Wiring
  document.getElementById('jv_buscar').onclick = buscarJugadasEnviadas;
  document.getElementById('jv_del_sel').onclick = async () => {
    const ids = [...document.querySelectorAll('.jv_row_chk:checked')].map(ch => ch.value);
    if (!ids.length) return alert('No hay seleccionados.');
    const motivo = prompt('Motivo de anulación (opcional):', 'Anulado por admin') || 'Anulado por admin';
    await anularTicketsAdmin(ids, { motivo });
  };
    document.getElementById('jv_chk_all').onchange = (e) => {
    document.querySelectorAll('.jv_row_chk').forEach(ch => ch.checked = e.target.checked);
  };

  // ✅ Auto-cargar al entrar (sin tocar nada del botón Buscar)
  setTimeout(() => {
    if (typeof buscarJugadasEnviadas === 'function') {
      buscarJugadasEnviadas();
    } else {
      // fallback: simula click
      document.getElementById('jv_buscar')?.click();
    }
  }, 0);
}

/***** ===================== 📈 CONTROL GENERAL — ADMIN (v2 · Top por Ticket) ===================== *****/

const CG_PAGO_MULT = { 4: 3500, 3: 600, 2: 70 };

// ⬇️ Reemplazo directo
function CG_ahoraAR(){ 
  return new Date(); // usar hora local del navegador
}
function CG_hoyISO(){
  const d = CG_ahoraAR();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`; // YYYY-MM-DD local
}

/* ---------- Horarios: normalización + hora de CIERRE real ---------- */
function CG_normHHMM(h){
  const m = String(h||'').match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const hh = String(m[1]).padStart(2,'0');
  const mm = String(m[2] || '00').padStart(2,'0');
  return `${hh}:${mm}`;
}
// En tickets puede venir 10:00/11:00/14:00/17:00/19:00 → cierran 10:15/11:30/14:30/17:30/19:30
function CG_horaCierre(hhmm){
  const h = CG_normHHMM(hhmm);
  if (!h) return null;
  const map = {
    '10:00':'10:15',
    '11:00':'11:30',
    '14:00':'14:30',
    '17:00':'17:30',
    '19:00':'19:30',
  };
  return map[h] || h; // 12:00, 15:00, 18:00, 21:00 quedan igual
}

function CG_parseLote(code){
  const s = String(code||'').toUpperCase().replace(/\s+/g,'');
  const m = s.match(/^([A-Z]{2,4})(\d{1,2})(:?(\d{2}))?$/);
  if (!m) return { sigla: s.slice(0,3), hora: null };
  let hh = m[2]; if (hh.length===1) hh='0'+hh;
  const mm = m[4] || '00';
  return { sigla: m[1], hora: CG_horaCierre(`${hh}:${mm}`) };
}

function CG_premioPotencial(num, imp){
  const n = String(num||'').replace(/\D/g,'');
  const mult = CG_PAGO_MULT[n.length] || 0;
  return (Number(imp)||0) * mult;
}
function CG_money(n){
  const x = Number(n)||0, neg = x<0, abs = Math.abs(x);
  return (neg?'-':'') + '$' + abs.toLocaleString('es-AR',{maximumFractionDigits:0});
}
// Suma el arrastre "vigente" de TODOS los pasadores del admin en el rango.
// Regla de corte: si la última fila tiene arrastre==0 y trae saldo_final,
// se usa (arrastre del día previo) + (saldo_final de la última fila).
async function ADM_arrastreVigente(adminUsuario, desde, hasta){
  const vendedores = await ADM_vendedoresDe(adminUsuario);
  if (!vendedores.length) return 0;

  const { data, error } = await supabase
    .from('liquidaciones')
    .select('fecha, vendedor, saldo_final, saldo_final_arrastre')
    .gte('fecha', desde).lte('fecha', hasta)
    .in('vendedor', vendedores)                 // <- vendedores en NÚMERO
    .order('vendedor', { ascending: true })
    .order('fecha',    { ascending: true });

  if (error || !data) return 0;

  // Recorremos por vendedor en orden cronológico
  const state = new Map(); // vend -> { prevArr, lastArr, lastSaldo }
  for (const r of data) {
    const vend = Number(r.vendedor);
    const s = state.get(vend) || { prevArr: null, lastArr: null, lastSaldo: null };

    // antes de pisar lastArr, lo guardamos como prevArr
    if (s.lastArr !== null) s.prevArr = s.lastArr;

    s.lastArr   = (r.saldo_final_arrastre == null ? null : Number(r.saldo_final_arrastre));
    s.lastSaldo = (r.saldo_final == null ? null : Number(r.saldo_final));

    state.set(vend, s);
  }

  // Regla del sábado/cierre
  let total = 0;
  for (const { prevArr, lastArr, lastSaldo } of state.values()) {
    let vigente = 0;

    if ((lastArr === 0 || lastArr === null) && Number.isFinite(lastSaldo)) {
      // hubo corte: usar arrastre del día previo + saldo_final del último día
      vigente = (Number(prevArr) || 0) + lastSaldo;
    } else {
      // sin corte: usar el último arrastre directo
      vigente = Number(lastArr) || 0;
    }

    total += vigente;
  }

  return total;
}
/* ---------- Sorteos cerrados (por resultados) con hora de cierre real ---------- */
async function CG_getCerradosPorRango(desde, hasta){
  const set = new Set();
  try{
    const { data } = await supabase
      .from('resultados')
      .select('fecha,loteria,horario')
      .gte('fecha',desde).lte('fecha',hasta);
    (data||[]).forEach(r=>{
      const sig = String(r.loteria||'').toUpperCase();
      const hN  = CG_horaCierre(CG_normHHMM(r.horario));
      if (sig && hN) set.add(`${r.fecha}__${sig}__${hN}`);
    });
  }catch(e){ console.warn('resultados cerrados err', e); }
  return set;
}
async function CG_topMasJugadosHoyPorTurno(vend, permitidos, modoAdmin){
  const FECHA = CG_hoyISO();
  const cerrados = await CG_getCerradosPorRango(FECHA, FECHA);

  let q = supabase.from('jugadas_enviadas')
    .select('anulado, fecha, vendedor, jugadas, numero')
    .eq('fecha', FECHA);

  // ⛳ filtros
  if (modoAdmin === 'admin') {
    q = q.gte('numero', 10000);       // solo tickets de admin (si aplicás ese criterio)
  } else if (vend) {
    q = q.eq('vendedor', vend);       // un pasador puntual
  } else if (permitidos && permitidos.length) {
    q = q.in('vendedor', permitidos); // lista de pasadores permitidos (admin hijo)
  }

  const { data: rows, error } = await q;
  if (error) { console.warn('CG_topMasJugados err', error); return new Map(); }

  const agg = new Map();
  (rows||[]).forEach(t => {
    if (t.anulado) return;
    let jug = t.jugadas;
    try { if (typeof jug === 'string') jug = JSON.parse(jug); } catch { jug = []; }
    if (!Array.isArray(jug) || !jug.length) return;

    jug.forEach(j => {
      const imp = Number(j.importe || 0);
      if (imp <= 0) return;

      const lots = Array.isArray(j.loterias) ? j.loterias : [];
      const horasPend = new Set();
      lots.forEach(code => {
        const { sigla, hora } = CG_parseLote(code);
        if (!sigla || !hora) return;
        if (CG_esPendiente(FECHA, sigla, hora, cerrados)) horasPend.add(hora);
      });
      if (!horasPend.size) return;

      const nums = [];
      const n1 = String(j.numero||'').replace(/\D/g,''); if (n1) nums.push(n1);
      const n2 = String(j.redoblona||'').replace(/\D/g,''); if (n2) nums.push(n2);

      horasPend.forEach(hora => {
        if (!agg.has(hora)) agg.set(hora, new Map());
        const byNum = agg.get(hora);
        nums.forEach(num => {
          const cur = byNum.get(num) || { veces:0, sumaImporte:0 };
          cur.veces += 1;
          cur.sumaImporte += imp;
          byNum.set(num, cur);
        });
      });
    });
  });

  const res = new Map();
  for (const [hora, byNum] of agg.entries()){
    const top = [...byNum.entries()]
      .map(([num, v]) => ({ num, veces: v.veces, premio: CG_premioPotencial(num, v.sumaImporte) }))
      .sort((a,b)=>(b.veces-a.veces)||(b.premio-a.premio)||(Number(b.num)-Number(a.num)))
      .slice(0,5);
    if (top.length) res.set(hora, top);
  }

  return new Map([...res.entries()].sort((a,b)=>{
    const [ah,am]=a[0].split(':').map(Number), [bh,bm]=b[0].split(':').map(Number);
    return ah!==bh ? ah-bh : am-bm;
  }));
}
/* pendiente = (no está en resultados) y (si es hoy: ahora <= cierre real) */
function CG_esPendiente(fecha, sigla, horaCierre, cerradosSet){
  if (!sigla||!horaCierre) return false;
  const key = `${fecha}__${sigla}__${horaCierre}`;
  if (cerradosSet.has(key)) return false;            // ya salió por resultados
  const hoy = CG_hoyISO();
  if (fecha !== hoy) return true;                    // otros días: lo dejamos
  const now = CG_ahoraAR();
  const [H,M] = horaCierre.split(':').map(Number);
  const dt = new Date(now); dt.setHours(H, M||0, 0, 0);
  return now.getTime() <= dt.getTime();              // si ya pasó el cierre → no pendiente
}
// Suma de porcentajes/commission desde liquidaciones en el rango
// ahora respeta vend O bien la lista "permitidos"
async function CG_totalPorcentajes(desde, hasta, vend, permitidos){
  let q = supabase
    .from('liquidaciones')
    .select('comision, fecha, vendedor')
    .gte('fecha', desde)
    .lte('fecha', hasta);

  if (vend) q = q.eq('vendedor', vend);
  else if (permitidos && permitidos.length) q = q.in('vendedor', permitidos);

  const { data, error } = await q;
  if (error) { console.warn('CG_totalPorcentajes error', error); return 0; }
  return (data || []).reduce((s, r) => s + (Number(r.comision) || 0), 0);
}
async function mostrarControlGeneral(){
  const zona = document.getElementById('zonaContenido'); if(!zona) return;
  const hoy = CG_hoyISO();

  zona.innerHTML = `
  <h1 style="color:#fff;margin:0 0 12px;display:flex;align-items:center;gap:8px">📈 Control General</h1>

  <div style="background:#111;border:1px solid #333;border-radius:8px;padding:10px;margin-bottom:12px">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <!-- Mitad izquierda: fechas -->
      <div style="display:flex;gap:8px;align-items:center;flex:1 1 420px;min-width:320px">
        <label style="color:#bbb">Desde</label>
        <input type="date" id="cg_desde" value="${hoy}" style="padding:6px;min-width:140px">
        <label style="color:#bbb">Hasta</label>
        <input type="date" id="cg_hasta" value="${hoy}" style="padding:6px;min-width:140px">
      </div>

      <!-- Mitad derecha: pasador + rango arrastre + actualizar -->
      <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex:1 1 420px;min-width:320px">
        <label style="color:#bbb">Pasador</label>
        <select id="cg_vend" style="padding:6px;min-width:160px">
          <option value="">(Todos)</option>
        </select>

        <label for="cg_arr_rango" style="color:#bbb">Usar rango para arrastre</label>
        <input type="checkbox" id="cg_arr_rango" style="width:18px;height:18px">

        <button id="cg_buscar" style="padding:6px 12px">Actualizar</button>
      </div>
    </div>
  </div>

  <!-- Resumen: Jugado | % | Aciertos | Reclamos | Neto | Arrastre -->
  <div id="cg_resumen" style="display:grid;grid-template-columns:repeat(6,minmax(160px,1fr));gap:10px;margin-bottom:12px"></div>

  <div style="display:flex;align-items:center;gap:8px;margin:6px 0 8px">
    <h3 style="color:#fff;margin:0">🔥 Monitor de riesgo (Top 10 por Ticket · HOY)</h3>
    <span id="cg_status" style="color:#9ad"></span>
  </div>
  <div id="cg_riesgo" style="display:grid;grid-template-columns:repeat(5,minmax(220px,1fr));gap:10px"></div>
  <div style="display:flex;align-items:center;gap:8px;margin:12px 0 6px">
  <h3 style="color:#fff;margin:0">📊 Más jugados por turno (Top 5 · HOY)</h3>
  <span id="cg_topj_status" style="color:#9ad"></span>
</div>
<div id="cg_topjug" style="display:grid;grid-template-columns:repeat(3,minmax(260px,1fr));gap:10px"></div>
`;

  await cargarVendedoresPermitidosEnSelect(document.getElementById('cg_vend'));
  document.getElementById('cg_buscar').onclick = refrescar;
  await refrescar();

  async function refrescar(){
    const desde = document.getElementById('cg_desde').value || CG_hoyISO();
    const hasta = document.getElementById('cg_hasta').value || CG_hoyISO();
    const vend  = document.getElementById('cg_vend').value;
    const usarRangoArrastre = document.getElementById('cg_arr_rango').checked;
  
    const status = document.getElementById('cg_status');
    const boxRes = document.getElementById('cg_resumen');
    const grid   = document.getElementById('cg_riesgo');
    status.textContent='Cargando…'; boxRes.innerHTML=''; grid.innerHTML='';
  
    // 🔒 Si NO es central y no eligió pasador → limitar a sus vendedores
    let permitidos = null;
    if (!window.ES_CENTRAL && !vend) {
      permitidos = await vendedoresPermitidos();
      if (!permitidos || !permitidos.length){
        boxRes.innerHTML = `<div style="grid-column:1/-1;color:#888;padding:10px;text-align:center">Sin vendedores asignados.</div>`;
        grid.innerHTML = '';
        document.getElementById('cg_topjug').innerHTML = '';
        status.textContent = '';
        const ts = document.getElementById('cg_topj_status'); if (ts) ts.textContent='';
        return;
      }
    }
  
    // Helper para aplicar el filtro de pasador/permitidos a cada query
    const apl = (q) => vend ? q.eq('vendedor', vend) : (permitidos ? q.in('vendedor', permitidos) : q);
  
    /* ===== 1) TOTALES ===== */
    // Jugado
    let qT = supabase.from('jugadas_enviadas')
      .select('total, anulado, vendedor, fecha')
      .gte('fecha', desde).lte('fecha', hasta);
    qT = apl(qT);
    const { data: tics } = await qT;
    const totalJugado = (tics || []).reduce((s, t) => s + (t.anulado ? 0 : (+t.total || 0)), 0);
  
    // Aciertos
    let qA = supabase.from('aciertos')
      .select('acierto, fecha, vendedor')
      .gte('fecha', desde).lte('fecha', hasta);
    qA = apl(qA);
    const { data: acs } = await qA;
    const totalAciertos = (acs || []).reduce((s, a) => s + (+a.acierto || 0), 0);
  
    // Reclamos
    let qR = supabase.from('reclamos')
      .select('importe, fecha, vendedor')
      .gte('fecha', desde).lte('fecha', hasta);
    qR = apl(qR);
    const { data: recs } = await qR;
    const totalReclamos = (recs || []).reduce((s, r) => s + (Number(r.importe) || 0), 0);
  
    // Porcentajes
    const totalPorcentaje = await CG_totalPorcentajes(desde, hasta, vend, permitidos);
    // (CG_totalPorcentajes ya filtra por 'vend'; si necesitás que respete 'permitidos', avisá y te paso variante)
  
    const neto = totalJugado
      - totalAciertos
      - totalPorcentaje
      - (totalReclamos > 0 ? totalReclamos : 0)
      + (totalReclamos < 0 ? Math.abs(totalReclamos) : 0);
  
    // Arrastre
    let totalArrastre = 0;
    if (vend) {
      let qL = supabase.from('liquidaciones')
        .select('saldo_final_arrastre, fecha')
        .eq('vendedor', vend)
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: false });
      const { data: liq } = await qL;
      totalArrastre = +(liq?.[0]?.saldo_final_arrastre || 0);
    } else {
      let qL = supabase.from('liquidaciones')
        .select('vendedor, saldo_final_arrastre, fecha')
        .lte('fecha', hasta)
        .order('fecha', { ascending: false });
      if (usarRangoArrastre) qL = qL.gte('fecha', desde);
      if (permitidos && permitidos.length) qL = qL.in('vendedor', permitidos);
      const { data: liqs } = await qL;
      const visto = new Set();
      (liqs || []).forEach(r => {
        if (visto.has(r.vendedor)) return;
        visto.add(r.vendedor);
        totalArrastre += +(r.saldo_final_arrastre || 0);
      });
    }
  
    // Cards
    boxRes.innerHTML = [
      { t:'Total jugado', v: CG_money(totalJugado) },
      { t:'Porcentajes',  v: CG_money(totalPorcentaje) },
      { t:'Total aciertos', v: CG_money(totalAciertos) },
      { t:'Reclamos',     v: CG_money(totalReclamos) },
      { t:'Neto',         v: CG_money(neto) },
      { t:`Arrastre ${usarRangoArrastre ? '(rango)' : '(global)'}`, v: CG_money(totalArrastre) },
    ].map(k => `
      <div style="background:#0f0f0f;border:1px solid #333;border-radius:10px;padding:12px">
        <div style="color:#bbb;font-size:12px">${k.t}</div>
        <div style="color:#fff;font-weight:800;font-size:20px">${k.v}</div>
      </div>
    `).join('');
  
    /* ===== 2) MONITOR HOY (pendientes) ===== */
    const FECHA_MONITOR = CG_hoyISO();
    let qM = supabase.from('jugadas_enviadas')
      .select('id, numero, fecha, hora, vendedor, total, anulado, jugadas')
      .eq('fecha', FECHA_MONITOR)
      .order('fecha',{ascending:false})
      .order('numero',{ascending:false});
    qM = apl(qM);
  
    const [{ data: rowsM }, cerrados] = await Promise.all([
      qM, CG_getCerradosPorRango(FECHA_MONITOR, FECHA_MONITOR)
    ]);
  
    const ticketAgg = new Map();
    (rowsM || []).forEach(t => {
      if (t.anulado) return;
      let jug = t.jugadas;
      try { if (typeof jug === 'string') jug = JSON.parse(jug); } catch { jug = []; }
      if (!Array.isArray(jug) || !jug.length) return;
  
      const cur = ticketAgg.get(t.id) || {
        id:t.id, numero:t.numero ?? t.id, vendedor:t.vendedor||'', fecha:t.fecha,
        horarios:new Set(), porLote:new Map()
      };
  
      jug.forEach(j => {
        const imp = +(j.importe||0); if (imp<=0) return;
        const lots = Array.isArray(j.loterias) ? j.loterias : [];
        lots.forEach(code=>{
          const { sigla, hora } = CG_parseLote(code);
          if (!sigla||!hora) return;
          if (!CG_esPendiente(t.fecha, sigla, hora, cerrados)) return;
          let premio = CG_premioPotencial(j.numero, imp);
          if (j.redoblona) premio += CG_premioPotencial(j.redoblona, imp);
          const key = `${sigla}__${hora}`;
          const acc = cur.porLote.get(key) || { premio_pot:0, total_apostado:0 };
          acc.premio_pot += premio; acc.total_apostado += imp;
          cur.porLote.set(key, acc);
          cur.horarios.add(hora);
        });
      });
  
      if (cur.porLote.size) ticketAgg.set(t.id, cur);
    });
  
    const resumenTickets = [...ticketAgg.values()].map(ti=>{
      let mejorKey=null, mejorPremio=0, mejorApuesta=0;
      for (const [k,v] of ti.porLote.entries()){
        if (v.premio_pot>mejorPremio){ mejorPremio=v.premio_pot; mejorApuesta=v.total_apostado; mejorKey=k; }
      }
      const mejorHora = mejorKey ? mejorKey.split('__')[1] : null;
      return { id:ti.id, numero:ti.numero, vendedor:ti.vendedor, fecha:ti.fecha,
               horarios:[...ti.horarios], hora_riesgo:mejorHora,
               total_apostado:mejorApuesta, premio_pot:mejorPremio };
    }).filter(x=>x.premio_pot>0 && x.horarios.length>0)
      .sort((a,b)=>b.premio_pot-a.premio_pot)
      .slice(0,10);
  
    if (!resumenTickets.length){
      grid.innerHTML = `<div style="grid-column:1/-1;color:#888;padding:10px;text-align:center">Sin riesgos pendientes (hoy).</div>`;
      status.textContent = '';
    } else {
      const horaBadge = (h)=>`<span style="border:1px solid #444;border-radius:8px;padding:2px 6px;font-size:12px;color:#ccc">${h}</span>`;
      grid.innerHTML = resumenTickets.map(ti=>{
        const horas = ti.horarios.sort((a,b)=>{
          const [ah,am]=a.split(':').map(Number), [bh,bm]=b.split(':').map(Number);
          return ah!==bh ? ah-bh : am-bm;
        });
        const maxShow=5, extras=Math.max(0, horas.length-maxShow);
        const horasHTML = horas.slice(0,maxShow).map(horaBadge).join(' ') + (extras?` <span style="color:#aaa;font-size:12px">+${extras}</span>`:'');
        return `
          <div style="background:#0f0f0f;border:1px solid #333;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="font-weight:900;color:#fff;font-size:18px">Ticket #${ti.numero}</div>
              <button class="cg_btn_ver_ticket" data-id="${ti.id}" style="padding:4px 8px;border:1px solid #555;border-radius:6px;background:#1a1a1a;color:#fff">Ver ticket</button>
            </div>
            <div style="display:flex;gap:10px;align-items:center">
              <div style="color:#bbb;font-size:12px">Pasador</div>
              <div style="color:#fff;font-weight:700">${ti.vendedor||'-'}</div>
              <div style="margin-left:auto;color:#888;font-size:12px">Fecha: ${ti.fecha}</div>
            </div>
            <div>
              <div style="color:#bbb;font-size:12px;margin-bottom:4px">Horarios pendientes (hoy)</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">${horasHTML || '<span style="color:#777">—</span>'}</div>
              ${ti.hora_riesgo ? `<div style="margin-top:6px;color:#ffd86b;font-size:12px">⛳ Riesgo pico: <strong>${ti.hora_riesgo}</strong></div>` : ''}
            </div>
            <div style="display:flex;gap:14px">
              <div style="flex:1">
                <div style="color:#bbb;font-size:12px">Apostado en el horario de mayor riesgo</div>
                <div style="color:#fff;font-weight:800">${CG_money(ti.total_apostado)}</div>
              </div>
              <div style="flex:1">
                <div style="color:#bbb;font-size:12px">Posible ganancia (por una lotería)</div>
                <div style="color:#ffb703;font-weight:900;font-size:20px">${CG_money(ti.premio_pot)}</div>
              </div>
            </div>
          </div>`;
      }).join('');
  
      grid.querySelectorAll('.cg_btn_ver_ticket').forEach(btn=>{
        btn.onclick = ()=>{
          const id = btn.getAttribute('data-id');
          const fila = document.createElement('tr');
          const det  = document.createElement('td');
          det.colSpan = 10; det.id = `jv_det_${id}`;
          det.style.background='#0b0b0b'; det.style.padding='10px';
          grid.after(fila); fila.appendChild(det);
          if (typeof verTicketAdminComoVendedor === 'function'){
            verTicketAdminComoVendedor(id, fila);
          } else {
            alert('No está disponible el visor de tickets en este contexto.');
          }
        };
      });
  
      status.textContent = `Actualizado ${new Date().toLocaleTimeString('es-AR',{hour12:false})}`;
    }
  
    // ====== TOP POR TURNO (honra filtros) ======
const topStatus = document.getElementById('cg_topj_status');
const topBox    = document.getElementById('cg_topjug');
if (topStatus && topBox){
  topStatus.textContent = 'Cargando…';
  topBox.innerHTML = '';

  // vend del select y lista 'permitidos' ya calculada arriba
  const modoAdmin = (vend === '__ADMIN__') ? 'admin' : null;
  const vendParam = (vend === '__ADMIN__') ? null : vend;

  const topMap = await CG_topMasJugadosHoyPorTurno(
    vendParam,
    (!window.ES_CENTRAL && !vendParam) ? permitidos : null,
    modoAdmin
  );
      if (!topMap.size){
        topBox.innerHTML = `<div style="grid-column:1/-1;color:#888;padding:10px;text-align:center">Sin datos pendientes hoy.</div>`;
        topStatus.textContent = '';
      } else {
        const card = (hora, items) => `
          <div style="background:#0f0f0f;border:1px solid #333;border-radius:10px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <div style="color:#fff;font-weight:800;font-size:16px">Turno ${hora}</div>
              <div style="color:#aaa;font-size:12px">Top 5</div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;color:#ddd">
              <thead>
                <tr style="border-bottom:1px solid #222">
                  <th style="text-align:left;padding:4px">Número</th>
                  <th style="text-align:right;padding:4px">Veces</th>
                  <th style="text-align:right;padding:4px">Posible ganancia</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => `
                  <tr style="border-bottom:1px dashed #222">
                    <td style="padding:4px">${it.num}</td>
                    <td style="padding:4px;text-align:right">${it.veces}</td>
                    <td style="padding:4px;text-align:right">${CG_money(it.premio)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
        topBox.innerHTML = [...topMap.entries()].map(([hora, items]) => card(hora, items)).join('');
        topStatus.textContent = '';
      }
    }
  
  }
}
/***** ===================== FIN 📈 CONTROL GENERAL — ADMIN (v2) ===================== *****/
function JV_setStats(count, sum) {
  const elCnt = document.getElementById('jv_cnt');
  const elSum = document.getElementById('jv_sum');
  if (elCnt) elCnt.textContent = String(count || 0);
  if (elSum) elSum.textContent = '$' + fmt1(Number(sum || 0));
}
async function buscarJugadasEnviadas() {
  const tbody = document.getElementById('jv_rows');
  if (!tbody) return;

  const desde   = document.getElementById('jv_desde').value;
  const hasta   = document.getElementById('jv_hasta').value;
  const vend    = document.getElementById('jv_vend').value.trim();
  const ticketN = (document.getElementById('jv_ticket').value || '').trim();

  tbody.innerHTML = `<tr><td colspan="10" style="padding:10px;text-align:center;color:#888">Buscando…</td></tr>`;
  JV_setStats('…', '…');

  try {
    let q = supabase
  .from('jugadas_enviadas')
  .select('id, numero, fecha, hora, vendedor, total, anulado, anulado_por, anulado_origen, anulado_motivo, anulado_at, jugadas, loterias')
  .gte('fecha', desde)
  .lte('fecha', hasta)
    .order('fecha', { ascending: false })
  .order('hora',  { ascending: false })
  .order('id',    { ascending: false });

  if (vend === '__ADMIN__') {
    q = q.gte('numero', 10000); // solo tickets de admin
  } else if (vend) {
    q = q.eq('vendedor', vend);
  }
    if (ticketN) q = q.eq('numero', Number(ticketN)); // ← filtra por numero, NO por id

    // ✅ PERMISOS: si NO es central, limitar a los pasadores creados por el usuario actual
if (!window.ES_CENTRAL) {
  const { data: vs, error: errVs } = await supabase
    .from('usuarios')
    .select('usuario')
    .eq('rol', 'vendedor')
    .eq('creado_por', window.USUARIO_ACTUAL);

  if (errVs) {
    console.warn('No se pudieron cargar vendedores del admin_hijo', errVs);
  }

  const misVendedores = (vs || []).map(v => v.usuario);

  if (!vend) {
    // Si NO eligió un pasador puntual en el select:
    if (!misVendedores.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="padding:10px;text-align:center;color:#888">Sin datos</td></tr>`;
      return;
    }
    q = q.in('vendedor', misVendedores);   // 👈 corregido: usar "q"
  } else {
    // Si eligió uno, validá que esté permitido
    if (!misVendedores.includes(vend)) {
      tbody.innerHTML = `<tr><td colspan="10" style="padding:10px;text-align:center;color:#c66">Pasador no permitido</td></tr>`;
      return;
    }
  }
}
// 👇 ACÁ — ejecutar la query y obtener los datos
const { data, error } = await q;
if (error) {
  console.error(error);
  tbody.innerHTML = `<tr><td colspan="10" style="padding:10px;text-align:center;color:#c33">Error al buscar.</td></tr>`;
  return;
}
if (!data || !data.length) {
  tbody.innerHTML = `<tr><td colspan="10" style="padding:10px;text-align:center;color:#888">No hay jugadas.</td></tr>`;
  JV_setStats(0, 0);
  return;
}
// ✅ stats: tickets + monto total (solo NO anulados)
const rowsOk = (data || []).filter(r => !r.anulado);
const cant = rowsOk.length;
const suma = rowsOk.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
JV_setStats(cant, suma);
    tbody.innerHTML = '';
    data.forEach(r => {
      // jugadas puede venir string
      let jug = r.jugadas;
      try { if (typeof jug === 'string') jug = JSON.parse(jug); } catch { jug = []; }
      const cantJugadas = Array.isArray(jug) ? jug.length : 0;
      let loterias = r.loterias;
try { if (typeof loterias === 'string') loterias = JSON.parse(loterias); } catch {}
const cantSorteos = Array.isArray(loterias)
  ? loterias.length
  : (Array.isArray(jug) ? new Set(jug.flatMap(j => j.loterias||[])).size : 0);
  const estadoTxt = r.anulado
  ? `Anulado${r.anulado_origen === 'admin' ? ' (Admin)' : ''}`
  : 'Activo';

const estadoTitle = r.anulado
  ? `Motivo: ${r.anulado_motivo || '-'}\nPor: ${r.anulado_por || '-'}\nFecha: ${r.anulado_at || '-'}`
  : '';

      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #222';
      tr.innerHTML = `
        <td style="padding:8px"><input type="checkbox" class="jv_row_chk" value="${r.id}"></td>
        <td style="padding:8px">
  #${r.numero ?? '-'}<br>
  <small style="color:#777">${r.id}</small>
</td>
        <td style="padding:8px">${r.fecha}</td>
        <td style="padding:8px">${r.hora || '-'}</td>
        <td style="padding:8px">${r.vendedor}</td>
        <td style="padding:8px;text-align:right">$${fmt1(r.total||0)}</td>
        <td style="padding:8px;text-align:right">${cantJugadas}</td>
        <td style="padding:8px;text-align:right">${cantSorteos}</td>
        <td style="padding:8px;color:${r.anulado ? '#ff7675' : '#55efc4'}" title="${estadoTitle.replace(/"/g,'&quot;')}">
  ${estadoTxt}
</td>
        <td style="padding:8px;text-align:center;white-space:nowrap">
          <button class="jv_ver" data-id="${r.id}" style="padding:4px 8px">Ver</button>
          <button class="jv_del" data-id="${r.id}" style="padding:4px 8px;background:#e67e22;color:#fff;border:none;border-radius:6px">Anular</button>
        </td>
      `;

      // Fila expandible para ver jugadas
      const det = document.createElement('tr');
      det.className = 'jv_det';
      det.style.display = 'none';
      det.innerHTML = `<td colspan="10" style="background:#0b0b0b;padding:10px;border-top:1px solid #222" id="jv_det_${r.id}"></td>`;

      tr.querySelector('.jv_ver').onclick = () => verTicketAdminComoVendedor(r.id, det);
      tr.querySelector('.jv_del').onclick = async () => {
        const motivo = prompt('Motivo de anulación (opcional):', 'Anulado por admin') || 'Anulado por admin';
        await anularTicketsAdmin([r.id], { motivo });
      };

      tbody.appendChild(tr);
      tbody.appendChild(det);
    });
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="10" style="padding:10px;text-align:center;color:#c33">Error al buscar.</td></tr>`;
    JV_setStats(0, 0);
  }
}

function renderJugadasHTML(jugadas) {
  const rows = (jugadas||[]).map((j, idx) => {
    const lots = (j.loterias||[]).join(', ');
    const posR = j.posRedoblona ?? j.pos_redoblona ?? j.posr ?? '-';
    const red   = j.redoblona ?? j.numeroR ?? j.numr ?? '-';
    return `
      <tr>
        <td style="padding:4px">${idx+1}</td>
        <td style="padding:4px">${j.numero}</td>
        <td style="padding:4px;text-align:right">${j.posicion}</td>
        <td style="padding:4px">${red || '-'}</td>
        <td style="padding:4px;text-align:right">${posR || '-'}</td>
        <td style="padding:4px;text-align:right">$${fmt1(j.importe||0)}</td>
        <td style="padding:4px">${lots}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#ddd">
        <thead>
          <tr style="background:#161616">
            <th style="padding:6px">#</th>
            <th style="padding:6px">Número</th>
            <th style="padding:6px;text-align:right">Pos</th>
            <th style="padding:6px">Redoblona</th>
            <th style="padding:6px;text-align:right">PosR</th>
            <th style="padding:6px;text-align:right">Importe</th>
            <th style="padding:6px">Loterías</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7" style="padding:8px;color:#999">Sin jugadas</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function toggleDetalleTicket(row, detTr) {
  const cont = detTr.querySelector(`#jv_det_${row.id}`);

  // helpercitos
  const fmt = (v) => (Number(v)||0).toLocaleString('es-AR');
  const fmtDin = (v) => `$${fmt(v)}`;

  // normalizar jugadas / loterías
  let jug = row.jugadas;
  try { if (typeof jug === 'string') jug = JSON.parse(jug); } catch { jug = []; }
  let lots = row.loterias;
  try { if (typeof lots === 'string') lots = JSON.parse(lots); } catch {}

  // si no hay 'loterias' a nivel ticket, las infiero desde las jugadas
  if (!Array.isArray(lots)) {
    lots = Array.isArray(jug) ? [...new Set(jug.flatMap(j => j.loterias || []))] : [];
  }

  // estilos del ticket (incrusta una sola vez)
  (function ensureTicketCss(){
    if (document.getElementById('ticket-css')) return;
    const s = document.createElement('style');
    s.id = 'ticket-css';
    s.textContent = `
      .ticket-wrap { background:#0b0b0b; border:1px solid #222; border-radius:12px; padding:16px; }
      .ticket-paper { background:#fff; color:#000; border:2px solid #000; border-radius:14px; padding:18px; max-width:520px; margin:0 auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .t-row { display:flex; justify-content:space-between; align-items:center; }
      .t-muted { color:#111; }
      .t-badges { display:flex; flex-wrap:wrap; gap:6px; }
      .t-badge { border:1px solid #000; padding:2px 6px; border-radius:6px; font-size:12px; letter-spacing:0.5px; }
      .t-sep-xl { border-top:2px solid #000; margin:10px 0; }
      .t-sep { border-top:1px solid #000; margin:8px 0; }
      .t-tab { width:100%; border-collapse:collapse; font-size:14px; }
      .t-tab th, .t-tab td { padding:4px 0; border-bottom:1px dashed #000; }
      .t-tab th { text-align:left; }
      .t-right { text-align:right; }
      .t-center { text-align:center; }
      .t-title { font-weight:900; font-size:26px; letter-spacing:1px; }
      .t-total { font-size:20px; }
      .t-pill { display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid #000; }
      .t-danger { color:#b00020; }
      .t-actions { display:flex; gap:8px; justify-content:flex-end; margin-bottom:10px; }
      .t-btn { padding:6px 10px; font-size:14px; background:#008cba; color:#fff; border:none; border-radius:6px; cursor:pointer; }
      .t-small { font-size:12px; }
    `;
    document.head.appendChild(s);
  })();

  // armar HTML del ticket
  const ticketNumero = row.numero ?? row.id; // “número humano” si existe, si no, id
  const headerEstado = row.anulado ? ` · <span class="t-danger t-pill">ANULADO</span>` : '';
  const lotBadges = (lots||[]).map(l => `<span class="t-badge">${l}</span>`).join('') || `<span class="t-muted t-small">—</span>`;

  // filas de jugadas (igual que vendedor: numero, pos/redoblona, importe y loterías)
  const jugHtml = (Array.isArray(jug) && jug.length)
    ? jug.map((j, idx) => {
        const posR = j.posRedoblona ?? j.pos_redoblona ?? j.posr ?? null;
        const red  = j.redoblona ?? j.numeroR ?? j.numr ?? null;
        const lotsJ = Array.isArray(j.loterias) ? j.loterias : [];
        const lotsTxt = lotsJ.length ? lotsJ.join(', ') : '—';
        return `
          <tr>
            <td>${String(idx+1).padStart(2,'0')}</td>
            <td>${j.numero}</td>
            <td class="t-center">${j.posicion ?? '-'}</td>
            <td>${red ? red : '-'}</td>
            <td class="t-center">${posR ? posR : '-'}</td>
            <td class="t-right">${fmtDin(j.importe || 0)}</td>
          </tr>
          <tr>
            <td></td>
            <td colspan="5" class="t-muted t-small">Loterías: ${lotsTxt}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="6" class="t-center t-muted">SIN JUGADAS</td></tr>`;

  const html = `
    <div class="ticket-wrap">
      <div class="t-actions">
        <button class="t-btn" id="btnPrint_${row.id}">🖨️ Imprimir</button>
        <button class="t-btn" id="btnPng_${row.id}">📥 Descargar PNG</button>
      </div>
      <div class="ticket-paper" id="ticketPaper_${row.id}">
        <div class="t-row" style="margin-bottom:6px">
          <div class="t-title">TICKET</div>
          <div style="font-weight:900;font-size:18px">#${ticketNumero}</div>
        </div>
        <div class="t-row t-small" style="margin-bottom:6px">
          <div>FECHA: <strong>${row.fecha || '-'}</strong></div>
          <div>HORA: <strong>${row.hora || '-'}</strong></div>
        </div>
        <div class="t-row t-small" style="margin-bottom:6px">
          <div>PASADOR: <strong>${row.vendedor || '-'}</strong></div>
          <div>ID:<span class="t-muted"> ${row.id}</span>${headerEstado}</div>
        </div>

        <div class="t-sep-xl"></div>

        <div class="t-small t-muted" style="margin-bottom:6px">SORTEOS DEL TICKET</div>
        <div class="t-badges" style="margin-bottom:6px">${lotBadges}</div>

        <div class="t-sep"></div>

        <table class="t-tab">
          <thead>
            <tr>
              <th>#</th>
              <th>NÚMERO</th>
              <th class="t-center">POS</th>
              <th>RED</th>
              <th class="t-center">POSR</th>
              <th class="t-right">IMP</th>
            </tr>
          </thead>
          <tbody>
            ${jugHtml}
          </tbody>
        </table>

        <div class="t-sep-xl"></div>

        <div class="t-row t-total">
          <div>TOTAL</div>
          <div><strong>${fmtDin(row.total || 0)}</strong></div>
        </div>
      </div>
    </div>
  `;

  if (detTr.style.display === 'none') {
    detTr.style.display = '';
    cont.innerHTML = html;

    // imprimir y PNG (sin dependencias; si tenés html2canvas cargado, usamos PNG; si no, abre print nativo)
    const paper = document.getElementById(`ticketPaper_${row.id}`);
    const btnPrint = document.getElementById(`btnPrint_${row.id}`);
    const btnPng = document.getElementById(`btnPng_${row.id}`);

    btnPrint.onclick = () => {
      // print simple: abre una ventana con el ticket y dispara print
      const win = window.open('', '_blank', 'width=640,height=800');
      win.document.write(`
        <html><head><title>Ticket #${ticketNumero}</title>
        <style>${document.getElementById('ticket-css').textContent}</style>
        </head><body>${paper.outerHTML}</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 200);
    };

    btnPng.onclick = async () => {
      if (typeof html2canvas !== 'function') {
        alert('Para descargar PNG, cargá html2canvas o usá Imprimir.');
        return;
      }
      const canvas = await html2canvas(paper, { backgroundColor: '#fff', scale: 2 });
      const link = document.createElement('a');
      link.download = `ticket_${ticketNumero}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

  } else {
    detTr.style.display = 'none';
    cont.innerHTML = '';
  }
}

async function eliminarSeleccionadosJugadas() {
  const ids = [...document.querySelectorAll('.jv_row_chk:checked')].map(ch => ch.value); // UUID string
  if (ids.length === 0) return alert('No hay seleccionados.');
  await eliminarTickets(ids);
}

// ✅ ANULAR por Admin (soft delete con rastro) + borrar aciertos del ticket
// ✅ ANULAR por Admin (soft delete + borrar aciertos por ticket_num)
async function anularTicketsAdmin(ids, { motivo = 'Anulado por admin' } = {}) {
  if (!ids || !ids.length) return alert('No hay tickets para anular.');
  if (!confirm(`¿Anular ${ids.length} ticket(s)? Se pondrán en 0 y se borrarán sus aciertos.`)) return;

  try {
    // 1) Mapear IDs -> numero (humano)
    console.log('🧾 IDs seleccionados para anular:', ids);
    const { data: rows, error: mapErr } = await supabase
      .from('jugadas_enviadas')
      .select('id, numero, fecha, vendedor')
      .in('id', ids);

    if (mapErr) {
      console.error('❌ Error trayendo tickets:', mapErr);
      alert('Error leyendo tickets.');
      return;
    }

    console.log('📦 MAP ids→numero · rows:', rows?.length || 0);
    console.table(rows || []);

    const ticketNums = (rows || [])
      .map(r => Number(r.numero))
      .filter(n => Number.isFinite(n));

    console.log('🔎 ticketNums (número humano):', ticketNums, ticketNums.map(t => typeof t));

    // 2) Borrar aciertos (tu tabla guarda el número en ticket_num)
    if (!ticketNums.length) {
      console.warn('⚠️ No pude derivar ningún número de ticket desde los IDs. Salteo borrado de aciertos.');
    } else {
      // Probe para ver qué columna matchea (debería ser ticket_num)
      const inList = `(${ticketNums.join(',')})`;
      const { data: probeRows, error: probeErr } = await supabase
        .from('aciertos')
        .select('id, id_ticket, ticket_id, ticket_num, fecha, vendedor, loteria, numero, posicion, acierto')
        .or(`id_ticket.in.${inList},ticket_id.in.${inList},ticket_num.in.${inList}`);

      console.log('🔎 PROBE aciertos → rows:', probeRows?.length || 0, 'err:', probeErr || null);
      console.table(probeRows || []);

      const cIdTicket  = (probeRows || []).filter(r => ticketNums.includes(Number(r.id_ticket))).length;
      const cTicketId  = (probeRows || []).filter(r => ticketNums.includes(Number(r.ticket_id))).length;
      const cTicketNum = (probeRows || []).filter(r => ticketNums.includes(Number(r.ticket_num))).length;
      console.log(`📊 Conteo por columna → id_ticket:${cIdTicket} | ticket_id:${cTicketId} | ticket_num:${cTicketNum}`);

      if (!probeRows || probeRows.length === 0) {
        console.warn('⚠️ No encontré aciertos para esos tickets (id_ticket/ticket_id/ticket_num). No borro nada.');
      } else {
        // Elegimos la columna real (en tu screenshot es ticket_num)
        const delCol = cTicketNum ? 'ticket_num' : (cIdTicket ? 'id_ticket' : (cTicketId ? 'ticket_id' : null));
        if (!delCol) {
          console.warn('⚠️ No pude determinar columna para borrar.');
        } else {
          console.log(`🗑️ DELETE aciertos usando columna: ${delCol}`);
          const { data: delRows, error: delErr } = await supabase
            .from('aciertos')
            .delete()
            .in(delCol, ticketNums)
            .select('id, id_ticket, ticket_id, ticket_num'); // Prefer: return=representation

          console.log('🧾 Resultado DELETE aciertos → borrados:', delRows?.length || 0, 'err:', delErr || null);
          console.table(delRows || []);
        }
      }
    }

    // 3) Marcar tickets como anulados (total=0 + rastro)
    console.log('✏️ Marcando tickets como ANULADOS…');
    const ahoraISO = new Date().toISOString();
    const { data: updData, error: updErr } = await supabase
      .from('jugadas_enviadas')
      .update({
        anulado: true,
        anulado_por: window.USUARIO_ACTUAL || 'admin',
        anulado_origen: 'admin',
        anulado_motivo: motivo || 'Anulado por admin',
        anulado_at: ahoraISO,
        total: 0
      })
      .in('id', ids)
      .select('id, numero, anulado, total, anulado_por, anulado_at');

    if (updErr) {
      console.error('❌ Error marcando tickets:', updErr);
      alert('Error marcando tickets como anulados.');
      return;
    }
    console.log('✅ Tickets actualizados:', updData?.length || 0);
    console.table(updData || []);

    // 4) Refrescar vistas
    await buscarJugadasEnviadas().catch(() => {});
    if (typeof listarAciertosDelDia === 'function') {
      try { await listarAciertosDelDia(); } catch (e) { console.warn('No pude refrescar aciertos:', e); }
    }

    const fechas = [...new Set((rows || []).map(r => r.fecha))].join(', ');
    alert(`✅ Anulados ${ids.length} ticket(s).\nFechas afectadas: ${fechas || '—'}`);
  } catch (e) {
    console.error('❌ Error anulando tickets:', e);
    alert('No se pudieron anular los tickets.');
  }
}
async function verTicketAdminComoVendedor(id, detTr){
  try {
    const { data: ticket, error } = await supabase
      .from('jugadas_enviadas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !ticket) return;

    // jugadas puede venir string
    let jugadas = ticket.jugadas;
    try { if (typeof jugadas === 'string') jugadas = JSON.parse(jugadas); } catch {}

    // === mismas funciones que usa el vendedor ===
    const ordenarLoterias = (lista) => {
  const orden  = ['NAC','PRO','SFE','COR','RIO','CTE','MZA','CHA','JUJ','SAN','NQN','CHB','RIN','LRJ','SAL','MIS','SCR','TUC','SGO','ORO'];
  return lista.sort((a,b) => {
    const ia = orden.indexOf(a.slice(0,3));
    const ib = orden.indexOf(b.slice(0,3));
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib); // los desconocidos al final
  });
};

    const grupos = {};
    (jugadas||[]).forEach(j => {
      const clave = (j.loterias||[]).join(',');
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(j);
    });

    // variables equivalentes a las del vendedor
    const numeroTicket = ticket.numero ?? ticket.id ?? '(s/n)';

// Mostrar lo que está guardado. Si falta, intentar desde created_at. Nunca “ahora”.
const fechaStr = ticket.fecha
  ?? (ticket.created_at ? String(ticket.created_at).slice(0,10) : '');

const horaStr  = ticket.hora
  ?? (ticket.created_at
        ? new Date(ticket.created_at).toLocaleTimeString('es-AR', { hour12:false })
        : '—');
    const vendedor = ticket.vendedor || '';

    let html = `
      <div style="text-align:center;margin-bottom:20px">
        <button onclick="window.print()" style="font-size:18px;padding:8px 20px;margin:6px">🖨 Imprimir</button>
        <button onclick="guardarTicketRiesgoComoImagen(${JSON.stringify(numeroTicket)})"
style="font-size:18px;padding:8px 20px;margin:6px">
📷 Guardar Imagen
</button>
        <button onclick="(function(){const tr=document.getElementById('jv_det_${id}').parentElement;tr.style.display='none';document.getElementById('jv_det_${id}').innerHTML='';})()" style="font-size:18px;padding:8px 20px;margin:6px">🔙 Cerrar</button>
      </div>
    `;

    html += `<div class="ticket-preview" style="font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;background:white;padding:20px;color:black;text-align:center;width:320px;margin:0 auto;border:2px solid #000;transform:scale(1.2);transform-origin:top center;font-weight:900">
      <div style="font-size:24px;font-weight:900;margin-bottom:10px">TICKET #${numeroTicket}</div>

      <div style="display:flex;justify-content:space-between;font-size:16px;margin-bottom:6px">
        <div style="text-align:left">
          <div><strong>Fecha:</strong> ${fechaStr}</div>
          <div><strong>Hora:</strong> ${horaStr}</div>
        </div>
        <div style="text-align:right">
          <div><strong>Pasador:</strong></div>
          <div>${vendedor}</div>
        </div>
      </div>`;

    let totalCalculado = 0;

    Object.entries(grupos).forEach(([loterias, jugas]) => {
      const ordenadas = ordenarLoterias(loterias.split(',').filter(Boolean));
      html += `<hr style="border:1px solid black;margin:4px 0">`;

      for (let i = 0; i < ordenadas.length; i += 5) {
        const fila = ordenadas.slice(i, i + 5).join(' ');
        html += `<div style="text-align:left;font-size:13px;margin-left:10px">${fila}</div>`;
      }

      html += `<hr style="border:1px solid black;margin:4px 0">`;

      jugas.forEach(j => {
        const numeroStr = '*'.repeat(4 - String(j.numero||'').length) + String(j.numero||'');
        const posicionStr = String(j.posicion||'').toString().padStart(2,'0');
        const cantLoterias = (j.loterias||[]).length;
        const importe = Number(j.importe||0);
        const importeStr = `$${importe.toLocaleString('es-AR')}`.padStart(9,' ');
        const redoblonaStr = j.redoblona
          ? ` ${'*'.repeat(4 - String(j.redoblona).length) + String(j.redoblona)} ${(j.posRedoblona??'').toString().padStart(2,' ')}`
          : '';

        html += `<div style="text-align:left;font-size:16px;line-height:1.6;margin-left:18px;font-family:monospace">
          ${numeroStr} ${posicionStr} ${importeStr}${redoblonaStr}
        </div>`;

        totalCalculado += importe * cantLoterias;
      });
    });

    const total = typeof ticket.total === 'number' ? ticket.total : totalCalculado;

    html += `
      <hr style="border:1px solid black;margin:10px 0">
      <div style="font-size:24px;font-weight:900;margin-top:10px;text-align:center">
        TOTAL: $${total.toLocaleString('es-AR')}
      </div>
      <div style="font-size:10px;text-align:center;margin-top:8px;color:gray">
        ${ticket.id}
      </div>
    </div>`;

    // pintar dentro del detalle expandible
    const cont = detTr.querySelector('#jv_det_'+id);
    if (cont) { cont.innerHTML = html; detTr.style.display = ''; }
  } catch (e) {
    console.error(e);
  }
}
/* ========== ENTER GLOBAL (ADMIN) — incluye NumpadEnter ========== */
(function () {
  const isEnter = (e) =>
    e.key === 'Enter' || e.code === 'Enter' ||
    e.key === 'NumpadEnter' || e.code === 'NumpadEnter';

  // Logger mínimo (útil si algo no responde)
  console.info('%c[ADMIN ENTER-HOOK] activo','color:#0f0');
  document.addEventListener('keydown', (e) => {
    if (!isEnter(e)) return;
    const t = e.target || {};
    // console.log('[ENTER@ADMIN]', { id:t.id, tag:t.tagName, type:t.type, code:e.code });
  }, true);

  function wireEnterClick(inputEl, buttonEl){
    if (!inputEl || !buttonEl) return;
    if (inputEl.__admEnterWired) return;
    inputEl.__admEnterWired = true;
    inputEl.addEventListener('keydown', (e)=>{
      if (!isEnter(e)) return;
      e.preventDefault();
      buttonEl.click();
    });
  }

  function wireAll(){
    // ===== Top filtros (admin) =====
    const btnRef = document.getElementById('adm_refrescar');
    ['adm_desde','adm_hasta'].forEach(id=>{
      const el = document.getElementById(id);
      if (el && btnRef) wireEnterClick(el, btnRef);
    });

    // ===== Subpanel por pasador =====
    document.querySelectorAll('#pas_desde, #pas_hasta').forEach(el=>{
      if (el.__admEnterWired) return;
      el.__admEnterWired = true;
      el.addEventListener('keydown', (e)=>{
        if (!isEnter(e)) return;
        e.preventDefault();
        // el botón puede estar dentro del mismo subpanel
        const scope = el.closest('div') || document;
        const btn = scope.querySelector('#pas_run') || document.getElementById('pas_run');
        btn?.click();
      });
    });

    // ===== (Opcional) Movimientos del admin =====
    const btnMovAdm = document.getElementById('adm_mov_agregar');
    document.querySelectorAll('#adm_mov_fecha,#adm_mov_monto,#adm_mov_nota').forEach(el=>{
      if (btnMovAdm) wireEnterClick(el, btnMovAdm);
    });

    // ===== (Opcional) Movimientos por pasador =====
    const btnMovPas = document.getElementById('pas_mov_agregar');
    document.querySelectorAll('#pas_mov_fecha,#pas_mov_monto,#pas_mov_nota').forEach(el=>{
      if (btnMovPas) wireEnterClick(el, btnMovPas);
    });

    // ===== Regla genérica para inputs de FECHA (fallback) =====
    document.querySelectorAll('input[type="date"], input[id*="fecha" i], input[name*="fecha" i]')
      .forEach(el=>{
        if (el.__admEnterGen) return;
        el.__admEnterGen = true;
        el.addEventListener('keydown', (e)=>{
          if (!isEnter(e)) return;
          const scope = el.closest('form, .card, .box, div') || document;
          const btn =
            scope.querySelector('#adm_refrescar, #pas_run, #btnEnviar, #jv_buscar, button[type="submit"]') ||
            document.getElementById('adm_refrescar');
          if (btn){ e.preventDefault(); btn.click(); }
        });
      });
  }

  document.addEventListener('DOMContentLoaded', wireAll);
  new MutationObserver(wireAll).observe(document.documentElement, { childList:true, subtree:true });
})();
// === Mobile Tabs (clona .tabs al drawer inferior y agrega botón ☰) ===
(function () {
  // no molestar en pantallas grandes
  if (window.matchMedia('(min-width: 901px)').matches) return;
  // si hay .sidebar (nuevo esquema), NO usar el cajón inferior
if (document.querySelector('.sidebar')) return;

  // ¿hay solapas declaradas?
  var tabs = document.querySelector('.tabs');
  if (!tabs) return;

  // botón hamburguesa fijo arriba
  if (!document.getElementById('hamb-btn')) {
    var btn = document.createElement('button');
    btn.id = 'hamb-btn';
    btn.className = 'hamb';
    btn.innerHTML = '<span></span>';
    btn.title = 'Menú';
    btn.onclick = function () { document.body.classList.toggle('nav-open'); };
    document.body.appendChild(btn);
  }

  // cajón inferior
  if (!document.getElementById('mobileTabs')) {
    var panel = document.createElement('div');
    panel.id = 'mobileTabs';
    panel.className = 'mobile-tabs';
    panel.innerHTML = '<div class="mt-content"></div>';
    document.body.appendChild(panel);
  }

  // clonar botones/links de la barra original
  var mt = document.querySelector('#mobileTabs .mt-content');
  if (!mt) return;

  // limpiar por si se re-ejecuta
  mt.innerHTML = '';

  // prioridades: button, a, .btn-solapa, li>button
  var items = tabs.querySelectorAll('button, a, .btn-solapa, li > button');
  items.forEach(function (el, idx) {
    // hacemos un clon visual que al click dispara el original
    var b = document.createElement('button');
    b.className = 'mt-btn';
    b.textContent = (el.textContent || el.innerText || '').trim() || ('Opción ' + (idx + 1));
    b.addEventListener('click', function () {
      try { el.click(); } catch (_) {}
      document.body.classList.remove('nav-open'); // cerrar cajón
    });
    mt.appendChild(b);
  });
})();
// Exponer por si llamás desde HTML inline
window.mostrarUsuariosAdmin = mostrarUsuariosAdmin;
window.cargarUsuariosAdmin = cargarUsuariosAdmin;
window.crearUsuarioAdmin = crearUsuarioAdmin;
window.cambiarClaveAdmin = cambiarClaveAdmin;
window.cambiarRolAdmin = cambiarRolAdmin;
window.eliminarUsuarioAdmin = eliminarUsuarioAdmin;
window.toggleBloqueoAdmin = toggleBloqueoAdmin;
// === Hamburguesa Mobile ADMIN (igual a vendedor) ===
(function () {
  if (window.__wiredHamburguesaAdmin) return;
  window.__wiredHamburguesaAdmin = true;

  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

  function ensure() {
    if (!isMobile()) {
      document.body.classList.remove('sidebar-open');
      return;
    }

    // Botón hamburguesa (izquierda)
    let btn = document.querySelector('.mobi-tabs-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'mobi-tabs-btn';
      btn.type = 'button';
      btn.innerHTML = '<span></span>';
      document.body.appendChild(btn);
    }

    // Overlay para cerrar tocando fuera
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }

    const toggle = () => document.body.classList.toggle('sidebar-open');
    const close  = () => document.body.classList.remove('sidebar-open');

    if (!btn.__wired) { btn.__wired = true; btn.addEventListener('click', toggle); }
    if (!overlay.__wired) { overlay.__wired = true; overlay.addEventListener('click', close); }

    // Delegación: si tocás un item del menú, cerrar
    const sb = document.querySelector('.sidebar');
    if (sb && !sb.__wiredClose) {
      sb.__wiredClose = true;
      sb.addEventListener('click', (e) => {
        if (e.target.closest('button, a, [role="tab"], .tab, .menu-item, .btn, [data-seccion]')) {
          if (isMobile()) close();
        }
      }, { passive: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensure, { once: true });
  } else {
    ensure();
  }
  window.addEventListener('resize', ensure);
  window.addEventListener('orientationchange', ensure);
})();

// ====== Total en vivo (ADMIN) ======
function actualizarTotalEnVivoAdmin() {
  const totalDiv = document.getElementById('totalAdmin');
  if (!totalDiv) return;

  if (!window.jugadasTempAdmin || window.jugadasTempAdmin.length === 0) {
    totalDiv.innerText = "TOTAL: $0";
    return;
  }

  let total = 0;
  window.jugadasTempAdmin.forEach(j => {
    const cantidadLoterias = Array.isArray(j.loterias) ? j.loterias.length : 1;
    const importe = Number(j.importe || 0);
    total += importe * cantidadLoterias;
  });

  totalDiv.innerText = `TOTAL: $${total.toLocaleString('es-AR')}`;
}
// 🔁 Refresco automático del total si cambia jugadasTempAdmin
const _origPush = Array.prototype.push;
Array.prototype.push = function(...args) {
  const result = _origPush.apply(this, args);
  if (this === window.jugadasTempAdmin) actualizarTotalEnVivoAdmin();
  return result;
};
async function guardarTicketRiesgoComoImagen(numeroTicket) {
  const ticketEl = document.querySelector('.ticket-preview');
  if (!ticketEl) return alert('No hay ticket');

  if (typeof html2canvas === 'undefined')
    return alert('html2canvas no está cargado');

  // 🔁 CLON EXACTO (lo que ves es lo que se guarda)
  const clone = ticketEl.cloneNode(true);
  clone.style.transform = 'none';
  clone.style.margin = '0';
  clone.style.position = 'fixed';
  clone.style.left = '-10000px';
  clone.style.top = '0';
  clone.style.background = '#fff';

  document.body.appendChild(clone);

  const canvas = await html2canvas(clone, {
    backgroundColor: '#ffffff',
    scale: Math.max(3, window.devicePixelRatio || 1),
    useCORS: true,
    logging: false
  });

  clone.remove();

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/jpeg', 0.95);
  a.download = `ticket_riesgo_${numeroTicket}.jpg`;
  a.click();
}