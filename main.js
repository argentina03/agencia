function convertirAHoraMinutos(horaStr) {
  const [h, m] = horaStr.split(":").map(Number);
  return h * 60 + m;
}
function mostrarError(msg, error = null) {
  console.error("🚨 ERROR: " + msg);
  if (error) console.error(error);
}

const SUPABASE_URL = window.__CONFIG__.SUPABASE_URL;
const SUPABASE_KEY = window.__CONFIG__.SUPABASE_KEY;

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// === Bloqueos locales de hoy (los setea el Admin en Editar Sistema) ===
function hoyISO() { 
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0,10); 
}
// 🔒 Bloqueos de hoy (local + nube)
async function getBloqueosSet() {
  const hoy = new Date(Date.now() - 3*60*60*1000).toISOString().slice(0,10);

  // local
  let arrLocal = [];
  try {
    const porDia = JSON.parse(localStorage.getItem('loterias_bloqueadas') || '{}');
    arrLocal = porDia[hoy] || [];
  } catch {}
  console.log("[BLOQ] LOCAL:", {hoy, arrLocal});

  // nube (ajustar NOMBRE de tabla si fuese distinto)
  const { data, error, status } = await supabase
  .from('bloqueos_hoy')         // 👈 tu tabla (en la UI se ve “bloqueos...”)
  .select('sigla')     // 👈 tus columnas (si no tenés hora, no pasa nada)
    .eq('fecha', hoy);

  console.log("[BLOQ] SUPABASE query:", {hoy, status, error, data});

  const arrNube = (data || []).flatMap(r => {
    const sig = (r.sigla || '').trim().toUpperCase();
    const out = [sig];                     // bloquea toda la sigla
    if (r.hora) {                          // si guardás hora, bloquea también la clave con hora
      const hh = String(r.hora).slice(0,2).padStart(2,'0');
      out.push(sig + hh);                  // ej: "TUC11"
    }
    return out;
  });

  const merged = new Set([...(arrLocal||[]), ...arrNube]);
  console.log("[BLOQ] MERGED SET:", [...merged]);
  return merged;
}

// Estilos visuales para casillas bloqueadas (gris + tachado)
(function () {
  const css = `
    .casilla-sorteo.bloq{
      background:#2b2b2b !important;
      border:2px dashed #666 !important;
      color:#aaa !important;
      cursor:not-allowed !important;
      position:relative;
      opacity:.85;
    }
    .casilla-sorteo.bloq::after{
      content:"×";
      position:absolute;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:800;
      font-size:16px;
      color:#999;
    }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

// === CONFIG: lectura con fallback (vendedor -> global -> defaults) ===
async function getConfigPara(vendedorUsuario) {
  try {
    const { data: cfgVend } = await supabase
      .from('config_vendedor')
      .select('comision_diaria_pct, bono_semanal_pct, bono_habilitado, ui_flags')
      .eq('vendedor', vendedorUsuario)
      .maybeSingle();

    const { data: cfgGlobalArr } = await supabase
      .from('config_global')
      .select('comision_diaria_pct, bono_semanal_pct, bono_habilitado')
      .limit(1);
    const cfgGlobal = Array.isArray(cfgGlobalArr) ? cfgGlobalArr[0] : cfgGlobalArr;

    const comision = Number(cfgVend?.comision_diaria_pct ?? cfgGlobal?.comision_diaria_pct ?? 20);
    const bono_pct = Number(cfgVend?.bono_semanal_pct ?? cfgGlobal?.bono_semanal_pct ?? 30);
    const bono_habilitado = (cfgVend?.bono_habilitado ?? cfgGlobal?.bono_habilitado ?? true) === true;
    const ui_flags = cfgVend?.ui_flags || {};

    return { comision, bono_pct, bono_habilitado, ui_flags };
  } catch (e) {
    console.warn('No se pudo leer config; usando defaults.', e);
    return { comision: 20, bono_pct: 30, bono_habilitado: true, ui_flags: {} };
  }
}

let vendedor = localStorage.getItem('claveVendedor') || 'SIN_VENDEDOR';
let jugadasTemp = [];
document.addEventListener("DOMContentLoaded", () => {
  // 🛑 Si no estamos en el panel, no ejecutes nada más
  if (!document.getElementById("contenidoPrincipal")) return;
  // 🔐 Solo vendedores pueden ver este panel
const rol = (localStorage.getItem('rolUsuario') || '').toLowerCase();
const usuario = localStorage.getItem('claveVendedor');

if (!usuario || !rol) { 
  window.location.href = 'index.html'; 
  return; 
}
if (rol !== 'vendedor') { 
  window.location.href = 'admin.html'; 
  return; 
}
// 🔄 Revalidar bloqueo desde la nube
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
  // 1. Limpiar datos antiguos de más de 15 días
  limpiarDatosAntiguos();  

  cargarJugadasDesdeNube();

  // Esperamos que los campos existan en el DOM
  const usuarioInput = document.getElementById('usuario');
  const claveInput = document.getElementById('clave');
  
  // Verificamos que los elementos existan en el DOM antes de agregar los listeners
  if (usuarioInput && claveInput) {
    // Evento ENTER en el campo usuario
    usuarioInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // Evita que el formulario se envíe
        claveInput.focus();  // Foco en el siguiente campo (clave)
      }
    });

    // Evento ENTER en el campo clave
    claveInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // Evita que el formulario se envíe
        login();  // Ejecutamos el login
      }
    });
  }
  
  // Función para actualizar la fecha automáticamente en el input de búsqueda de fecha
  const fechaInput = document.getElementById('buscarFecha');
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0'); // Mes siempre de 2 dígitos
  const dd = String(today.getDate()).padStart(2, '0'); // Día siempre de 2 dígitos
  const todayFormatted = `${yyyy}-${mm}-${dd}`;

  if (fechaInput) {
    fechaInput.value = todayFormatted; // Establece la fecha de hoy en el campo de búsqueda
  }

  // Si necesitas que se actualice también en otros lugares (como un span con la fecha actual)
  const fechaActualSpan = document.getElementById('fechaActual');
  if (fechaActualSpan) {
    fechaActualSpan.innerText = todayFormatted; // Actualiza la fecha en otro lugar si es necesario
  }
});

// Función para limpiar los datos que tienen más de 15 días
function limpiarDatosAntiguos() {
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - 15); // 15 días atrás
  
  // Cargar los datos de LocalStorage
  let datosResultados = JSON.parse(localStorage.getItem('resultados')) || [];
  let datosLiquidaciones = JSON.parse(localStorage.getItem('liquidaciones')) || [];

  // Filtrar los datos para mantener solo los de los últimos 15 días
  datosResultados = datosResultados.filter(result => new Date(result.fecha) >= fechaLimite);
  datosLiquidaciones = datosLiquidaciones.filter(liquidacion => new Date(liquidacion.fecha) >= fechaLimite);

  // Guardar nuevamente los datos filtrados en LocalStorage
  localStorage.setItem('resultados', JSON.stringify(datosResultados));
  localStorage.setItem('liquidaciones', JSON.stringify(datosLiquidaciones));
}

async function obtenerJugadasDesdeSupabase(diasAtras = 15) {
  const todas = jugadasEnviadas || [];
  if (!vendedor) return [];

  const desdeFecha = new Date();
  desdeFecha.setDate(desdeFecha.getDate() - diasAtras);
  const desdeISO = desdeFecha.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from("jugadas_enviadas")
    .select("*")
    .eq("vendedor", vendedor)
    .gte("fecha", desdeISO)
    .order("fecha", { ascending: true })
    .order("hora", { ascending: true });

  if (error) {
    console.error("❌ Error al obtener jugadas:", error);
    return [];
  }

  return data;
}
async function cargarJugadasDesdeNube() {
  const contenedor = document.getElementById("enviadas");
  if (!contenedor) {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      console.warn("⛔ No se encontró el contenedor 'enviadas'. Deteniendo carga.");
    }
    return;
  }

  contenedor.innerHTML = "<p style='text-align:center;color:gray'>Cargando jugadas...</p>";
  jugadasEnviadas = await obtenerJugadasDesdeSupabase();
  filtrarEnviadas();
}

async function login() {
  const usuario = document.getElementById('usuario').value.trim();
  const clave = document.getElementById('clave').value.trim();
  const mensaje = document.getElementById('mensajeError');

  if (!usuario || !clave) {
    mensaje.innerText = "Completá usuario y clave.";
    return;
  }

  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("usuario", usuario)
      .eq("clave", clave)
      .single();

    if (error || !data) {
      mensaje.innerText = "Usuario o clave incorrectos.";
      return;
    }
    // 🚫 Verificar si está bloqueado (boolean o texto)
if (data.bloqueado === true || (data.estado || '').toLowerCase() === 'bloqueado') {
  mensaje.innerText = "⛔ Tu cuenta está bloqueada. Contactá al administrador.";
  return;
}

// ✅ Guardamos usuario + rol
localStorage.setItem('claveVendedor', data.usuario);
localStorage.setItem('rolUsuario', (data.rol || 'vendedor').toLowerCase());

// 🚪 Redirección por rol
if ((data.rol || '').toLowerCase() === 'admin') {
  window.location.href = 'admin.html';
} else {
  window.location.href = 'panel.html';
}
  } catch (err) {
    console.error("Error al hacer login:", err);
    mensaje.innerText = "Error de conexión.";
  }
}

const tablaPremios = {
  normales: {
    "1c": 7,
    "2c": 70,
    "3c": 600,
    "4c": 3500
  },
  premios: {
    "2c_5": 14,
    "2c_10": 7,
    "2c_20": 3.5,
    "3c_5": 120,
    "3c_10": 60,
    "3c_20": 30,
    "4c_5": 700,
    "4c_10": 350,
    "4c_20": 175
  },
  redoblonas: {
    "cabeza_5": 1280,
    "cabeza_10": 640,
    "cabeza_20": 336.84,
    "5_5": 256,
    "5_10": 128,
    "5_20": 64,
    "10_10": 64,
    "10_20": 32,
    "20_20": 16
  }
};
let numeroTicket = 1; // global

async function obtenerUltimoTicket() {
  const { data, error } = await supabase
    .from('contadores_tickets')
    .select('ultimo_ticket')
    .eq('vendedor', vendedor)
    .single();
    
  if (data && data.ultimo_ticket !== undefined) {
    numeroTicket = data.ultimo_ticket + 1;
  }
}
let jugadasEnviadas = [];
let enterPressTime = 0;

const loterias = {
  NAC: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  PRO: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  SFE: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  COR: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  RIO: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  ORO: ["15:00", "21:00"],
  CTE: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  MZA: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  CHA: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  JUJ: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  SAN: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  MIS: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  TUC: ["11:30", "14:30", "17:30", "19:30", "21:00"],
  SCR: ["12:00", "14:30", "18:00", "21:00"],
  SGO: ["10:15", "12:00", "15:00", "19:30", "21:00"],
  SAL: ["12:00", "15:00", "18:00", "21:00"],
  NQN: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  CHB: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  RIN: ["10:15", "12:00", "15:00", "18:00", "21:00"],
  LRJ: ["10:15", "12:00", "15:00", "18:00", "21:00"]
}; // ← este corchete estaba faltando

const horarios = ["10:15", "11:30", "12:00", "14:30", "15:00", "17:30", "18:00", "19:30", "21:00"];
// Función para verificar los premios de una jugada
function bloquearCeldas() {
  const ahora = new Date();
  const ahoraArg = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const minutosAhora = ahoraArg.getHours() * 60 + ahoraArg.getMinutes();
  const diaSemana = ahoraArg.getDay(); // 0 = domingo

  document.querySelectorAll('.casilla-sorteo').forEach(celda => {
    const hora = celda.dataset.horario;
    if (!hora || diaSemana === 0) {
      // Si es domingo, bloquear todo directamente
      celda.classList.add('bloqueado');
      celda.classList.remove('activo');
      return;
    }

    const [hh, mm] = hora.split(':').map(Number);
    const minutosSorteo = hh * 60 + mm;

    if (minutosAhora >= minutosSorteo - 1) {
      celda.classList.add('bloqueado');
      celda.classList.remove('activo');
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await obtenerUltimoTicket();
  bloquearCeldas();
  setInterval(bloquearCeldas, 30000);
});
async function guardarTicketEnSupabase(ticket) {
  const url = 'https://agithblutrkibaydjbsl.supabase.co/rest/v1/jugadas_enviadas';
  const apiKey = SUPABASE_KEY;

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(ticket)
  });

  if (!respuesta.ok) {
    const error = await respuesta.text();
    console.error("❌ Error al guardar en Supabase:", error);
    return null;
  }

  const datos = await respuesta.json();
  console.log("✅ Ticket guardado en Supabase", datos);
  return datos[0]; // ⬅️ Devuelve el ticket con ID generado
}
async function actualizarUltimoTicketEnSupabase(numeroUsado) {
  try {
    const { data, error } = await supabase
      .from('contadores_tickets')
      .upsert([{ vendedor: vendedor, ultimo_ticket: numeroUsado }], { onConflict: ['vendedor'] });

    if (error) console.error("❌ Error al actualizar último ticket:", error);
    else console.log("✅ Último ticket actualizado:", numeroUsado);
  } catch (err) {
    console.error("❌ Error inesperado:", err);
  }
}

const aciertos = []; // ← aseguramos que existe
const hoy = new Date().toISOString().split('T')[0];
const aciertosPorFecha = JSON.parse(localStorage.getItem('aciertosPorFecha')) || {};
aciertosPorFecha[hoy] = aciertos;
localStorage.setItem('aciertosPorFecha', JSON.stringify(aciertosPorFecha));

function prorratearMontoTotal(jugadas, montoTotal) {
  try {
    const src = Array.isArray(jugadas) ? jugadas : [];
    const totalDeseado = Number.parseFloat(montoTotal);
    if (!src.length || !Number.isFinite(totalDeseado) || totalDeseado <= 0) return src;

    // cantidad de jugadas (números)
    const cantidadNumeros = src.length;

    // cantidad de loterías distintas seleccionadas en el ticket
    const todasLoterias = new Set();
    for (const j of src) {
      if (Array.isArray(j.loterias)) j.loterias.forEach(l => todasLoterias.add(l));
    }
    const cantidadLoterias = todasLoterias.size || 1;

    // importe por número = total / (números * loterías)
    const totalCent = Math.round(totalDeseado * 100);
    const denominador = cantidadNumeros * cantidadLoterias;
    const porNumeroCent = Math.floor(totalCent / denominador); // redondeo hacia abajo en centavos
    let restoCent = totalCent - porNumeroCent * denominador;

    // Seteamos el mismo importe a cada jugada (valor por número, NO por lotería)
    const out = src.map(j => ({ ...j, importe: +(porNumeroCent / 100).toFixed(2) }));

    // Repartimos resto en escalones de 'cantidadLoterias' centavos (sumar 1 cent a una jugada
    // incrementa el total en (cantidadLoterias) centavos)
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
async function enviarTicket() {
  const jugadas = document.querySelectorAll('#listaJugadas tr');
  if (jugadas.length === 0) return alert('No hay jugadas cargadas');

  const seleccionadas = document.querySelectorAll('.casilla-sorteo.activo');
  if (seleccionadas.length === 0) return alert('Seleccioná al menos una lotería');
  // === MODO "MONTO TOTAL": definir jugadasFuente ===
const usarMontoTotal = (window.__MTicket?.activo === true);
const montoTotalDeseado = Number(window.__MTicket?.total || 0);
if (usarMontoTotal && !(montoTotalDeseado > 0)) {
  alert('Activaste "Monto total" pero no capturaste el importe total (primer importe).');
  return;
}
const jugadasFuente = usarMontoTotal
  ? prorratearMontoTotal(jugadasTemp, montoTotalDeseado)
  : jugadasTemp;
// === FIN BLOQUE ===


  const now = new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" });
const fechaArg = new Date(now);
const fechaStr = `${fechaArg.getFullYear()}-${String(fechaArg.getMonth() + 1).padStart(2, '0')}-${String(fechaArg.getDate()).padStart(2, '0')}`;
const horaStr = `${String(fechaArg.getHours()).padStart(2, '0')}:${String(fechaArg.getMinutes()).padStart(2, '0')}:${String(fechaArg.getSeconds()).padStart(2, '0')}`;

// Si necesitas la hora en formato de 24 horas
const hora24 = horaStr; // Ejemplo: 03:07:00

const grupos = {};
(jugadasFuente || []).forEach(j => {
  const clave = j.loterias.join(',');
  if (!grupos[clave]) grupos[clave] = [];
  grupos[clave].push(j);
});

  const ordenarLoterias = (lista) => {
    const orden = ['NAC', 'PRO', 'SFE', 'COR', 'RIO', 'CTE', 'MZA', 'CHA', 'JUJ', 'SAN', 'MIS', 'ORO', 'TUC'];
    return lista.sort((a, b) => {
      const sigA = a.slice(0, 3);
      const sigB = b.slice(0, 3);
      return orden.indexOf(sigA) - orden.indexOf(sigB);
    });
  };

  let html = `
  <div style="text-align:center;margin-bottom:20px">
    <button onclick="mostrarSeccion('jugadas')" style="font-size:18px;padding:8px 20px;margin:6px">🆕 Nuevo Ticket</button>
    <button onclick="window.print()" style="font-size:18px;padding:8px 20px;margin:6px">🖨 Imprimir</button>
    <button onclick="descargarTicketComoImagen()" style="font-size:18px;padding:8px 20px;margin:6px">📷 Guardar Imagen</button>
  </div>
`;

  html += `<div class="ticket-preview" style="font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;background:white;padding:25px;color:black;text-align:center;width:320px;margin:0 auto">
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

  const jugadasFinal = [];
  let total = 0;

  Object.entries(grupos).forEach(([loterias, jugadas]) => {
    const ordenadas = ordenarLoterias(loterias.split(','));
    html += `<hr style="border:1px solid black;margin:4px 0">`;

    for (let i = 0; i < ordenadas.length; i += 5) {
      const fila = ordenadas.slice(i, i + 5).join(' ');
      html += `<div style="text-align:left;font-size:13px;margin-left:10px">${fila}</div>`;
    }

    html += `<hr style="border:1px solid black;margin:4px 0">`;

    jugadas.forEach(j => {
      const numeroStr = '*'.repeat(4 - j.numero.length) + j.numero;
      const posicionStr = j.posicion.toString().padStart(2, '0');
      const cantidadLoterias = ordenadas.length;
      const importeStr = `$${j.importe.toLocaleString('es-AR')}`.padStart(9, ' ');
      const jugadaTotal = j.importe * cantidadLoterias;
      const redoblonaStr = j.redoblona
        ? ` ${'*'.repeat(4 - j.redoblona.length) + j.redoblona} ${j.posRedoblona.toString().padStart(2, ' ')}`
        : '';

      html += `<div style="text-align:left;font-size:16px;line-height:1.6;margin-left:18px;font-family:monospace">
        ${numeroStr} ${posicionStr} ${importeStr}${redoblonaStr}
      </div>`;

      jugadasFinal.push({
        numero: j.numero,
        posicion: j.posicion,
        importe: j.importe,
        redoblona: j.redoblona,
        posRedoblona: j.posRedoblona,
        loterias: j.loterias
      });

    total += jugadaTotal;
    });
  });
  if (usarMontoTotal) total = montoTotalDeseado;
  html += `
<hr style="border:1px solid black;margin:10px 0">
<div style="font-size:24px;font-weight:900;margin-top:10px;text-align:center">
  TOTAL: $${total.toLocaleString('es-AR')}
</div>
<div id="uuidTicketReal" style="font-size:10px;text-align:center;margin-top:8px;color:gray">
  (ID pendiente...)
</div>
</div>`;
  document.getElementById('contenidoPrincipal').innerHTML = html;

  const ticket = {
    numero: numeroTicket,
    fecha: fechaStr,
    hora: horaStr,
    total,
    anulado: false,
    vendedor,
    loterias: Array.from(new Set(jugadasTemp.flatMap(j => j.loterias))),
    jugadas: jugadasFinal
  };
  
  const supaTicket = await guardarTicketEnSupabase(ticket);
  if (supaTicket) {
    ticket.id = supaTicket.id;
    jugadasEnviadas.push(ticket);
    const uuidBox = document.getElementById('uuidTicketReal');
    if (uuidBox) uuidBox.innerText = ticket.id;
  
    await actualizarUltimoTicketEnSupabase(numeroTicket); // ✅ primero subís el usado
    numeroTicket++; // ✅ recién ahora subís el local para el próximo
  }

// ⬅️ Guarda en LocalStorage con todos los tickets de todos los pasadores
const todo = JSON.parse(localStorage.getItem('jugadasEnviadasGlobal')) || {};
todo[vendedor] = todo[vendedor] || [];
todo[vendedor].push(ticket);
localStorage.setItem('jugadasEnviadasGlobal', JSON.stringify(todo));

jugadasTemp = [];

// 🔚 Apagar modos y persistir "OFF" después de ENVIAR
try {
  localStorage.setItem('montoTotalActivo','0');
  localStorage.removeItem('montoTotalValor');
  localStorage.setItem('dividirMontoActivo','0');
} catch (_) {}

if (window.__MTicket) {
  window.__MTicket.activo = false;
  window.__MTicket.total = 0;
}

desactivarMontoTotal();   // UI a gris si existe el botón
desactivarDividirMonto(); // UI a gris si existe el botón
}

function descargarTicket() {
  const ticketHTML = document.querySelector('.ticket-preview');
  if (!ticketHTML) return alert("No hay ticket para descargar");

  const contenido = ticketHTML.outerHTML;
  const blob = new Blob([contenido], { type: 'text/html' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = 'ticket.html';
  enlace.click();
}
// Función para verificar si los tickets tienen premio
function verificarAciertos() {
  // Obtenemos todos los resultados
  const resultados = [];
  
  // Recorremos todos los tickets
  jugadasEnviadas.forEach(ticket => {
    ticket.jugadas.forEach(jugada => {
      const premio = verificarPremios(jugada); // Verificamos si hay un premio para esa jugada
      if (premio > 0) { // Si tiene premio, lo agregamos a los resultados
        resultados.push({
          id: ticket.id,
          loteria: jugada.loterias.join(', '), // Unimos las loterías jugadas
          numero: jugada.numero,
          posicion: jugada.posicion,
          redoblona: jugada.redoblona || "-",
          pos_redoblona: jugada.posRedoblona || "-",
          importe: jugada.importe,
          acierto: premio // El premio es lo que se va a pagar por esa jugada
        });
      }
    });
  });

  // Ahora, vamos a mostrar estos resultados en la página
  mostrarResultados(resultados);
}
// Función para verificar el premio de un ticket específico
function verificarPremio() {
  const ticketNumero = document.getElementById('ticketNumero').value.trim();
  const resultadoElemento = document.getElementById('resultadoPremio');

  if (!ticketNumero) {
    resultadoElemento.textContent = 'Por favor, ingresá un número de ticket.';
    return;
  }

  // Buscamos en la tabla visual de resultados (no LocalStorage)
  const filas = document.querySelectorAll('#tablaAciertos tr');
  let total = 0;

  filas.forEach(tr => {
    const columnas = tr.querySelectorAll('td');
    if (columnas.length < 8) return;

    const id = columnas[0].textContent.trim();
    if (id === ticketNumero) {
      const premioTexto = columnas[7].textContent.replace(/\D/g, '');
      total += parseFloat(premioTexto || 0);
    }
  });

  if (total > 0) {
    resultadoElemento.innerHTML = `✅ El ticket #${ticketNumero} tiene un total ganado de: <strong style="color:lightgreen">$${total.toLocaleString('es-AR')}</strong>.`;
  } else {
    resultadoElemento.innerHTML = `❌ El ticket #${ticketNumero} no tiene aciertos visibles en esta tabla.`;
  }
}
// Función para mostrar los resultados en la tabla
function mostrarResultados(resultados) {
  const contenedor = document.getElementById('tablaAciertos');
  contenedor.innerHTML = '';

  if (resultados.length === 0) {
    contenedor.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 12px;">No hay aciertos para mostrar</td></tr>`;
    document.getElementById("valorTotalAciertos").textContent = `$0`;
    return;
  }

  let total = 0;

  resultados.forEach(res => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td style="padding: 10px; border: 1px solid #333; text-align: center;">${res.id}</td>
      <td style="padding: 10px; border: 1px solid #333; text-align: center;">${res.loteria}</td>
      <td style="padding: 10px; border: 1px solid #333; text-align: center;">${res.numero}</td>
      <td style="padding: 10px; border: 1px solid #333; text-align: center;">${res.posicion}</td>
      <td style="padding: 10px; border: 1px solid #333; text-align: center;">${res.redoblona}</td>
      <td style="padding: 10px; border: 1px solid #333; text-align: center;">${res.posRedoblona}</td>
      <td style="padding: 10px; border: 1px solid #333; text-align: center;">$${res.importe.toLocaleString('es-AR')}</td>
      <td style="padding: 10px; border: 1px solid #333; text-align: center; color: white; font-weight: bold;">$${res.acierto.toLocaleString('es-AR')}</td>
    `;

    contenedor.appendChild(tr);
    total += res.acierto;
  });

  document.getElementById("valorTotalAciertos").textContent = `$${total.toLocaleString('es-AR')}`;
}
// 🔐 Clave para LIQUIDACIONES
const CLAVE_SOLAPA_LIQ = "120212";

// Devuelve true si la clave es correcta
function pedirClaveLiquidaciones() {
  const ingreso = prompt("🔒 Ingresá la contraseña para LIQUIDACIONES:");
  return ingreso === CLAVE_SOLAPA_LIQ;
}
function mostrarSeccion(seccion) {
  // 🔐 Gate simple para la solapa LIQUIDACIONES
  if (seccion === 'liquidaciones') {
    if (!window.__LIQ_OK) {                 // no vuelve a pedir hasta recargar
      const ok = pedirClaveLiquidaciones(); // prompt("...") === "120212"
      if (!ok) {
        alert("❌ Contraseña incorrecta.");
        return;                              // no entra a liquidaciones
      }
      window.__LIQ_OK = true;
    }
  }

  const contenido = document.getElementById('contenidoPrincipal');
  switch (seccion) {
    case 'jugadas':
      contenido.innerHTML = `
      <div class="barra-superior">
        <div class="info-tiempo">
          <span id="fechaActual">--/--/----</span>
          <span id="horaActual">--:--:--</span>
          <span><i class="fa fa-user"></i> ${vendedor}</span>
        </div>
        <div class="atajos-info">
          <span>X = Por Afuera</span>
          <span>↑ = Posición</span>
          <span>Enter = Tab</span>
          <span>+ = Hacer bajada</span>
          <span>AvPag = Finalizar</span>
        </div>
      </div>

      <h1>Carga de Jugadas</h1>
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
        <!-- Columna Izquierda: Grilla + Inputs -->
        <div style="flex: 60%">
          <div class="seccion">
            <h3 style="display:flex;align-items:center;gap:8px;">
  Seleccioná los sorteos

  <button id="btnMontoTotal" 
    style="font-size:12px;padding:6px 10px;border-radius:8px;
           border:1px solid #777;background:#444;color:#fff;
           cursor:pointer;font-weight:600;letter-spacing:.2px">
    Monto total
  </button>

  <button id="btnDividirMonto"
    style="font-size:12px;padding:6px 10px;border-radius:8px;
           border:1px solid #777;background:#444;color:#fff;
           cursor:pointer;font-weight:600;letter-spacing:.2px">
    Dividir monto
  </button>
</h3>
            <div class="grid-sorteos">
              <table class="tabla-sorteos">
                <thead>
  <thead>
  <tr>
    <th style="width: 24px; text-align: center;">
      <input type="checkbox" id="dividirMonto" title="Dividir jugada" style="display:none">
    </th>
    <th><button id="btn-todos-sorteos">Todos</button></th>
    <th>NAC</th><th>PRO</th><th>SFE</th><th>COR</th><th>RIO</th>
    <th>CTE</th><th>MZA</th><th>CHA</th><th>JUJ</th><th>SAN</th>
    <th>NQN</th><th>CHB</th><th>RIN</th><th>LRJ</th>
    <th>SAL</th><th>MIS</th><th>SCR</th><th>TUC</th><th>SGO</th><th>ORO</th>
  </tr>
</thead>
                <tbody id="cuerpo-sorteos"></tbody>
              </table>
            </div>
          </div>

          <div class="seccion">
            <h3>Jugadas</h3>
            <div class="jugada-inputs">
              <input type="text" placeholder="Número" maxlength="4">
              <input type="text" placeholder="Posición">
              <input type="text" placeholder="Importe">
            </div>
            <h3>Redoblona</h3>
            <div class="jugada-inputs">
              <input type="text" placeholder="Número">
              <input type="text" placeholder="Posición">
            </div>
            <button class="btn-jugar">Agregar Apuesta</button>
          </div>
        </div>

        <!-- Columna Derecha: Jugadas Cargadas -->
        <div style="flex: 40%">
          <div class="tabla-jugadas">
            <h3>Jugadas cargadas:</h3>
            <table>
              <thead>
                <tr>
                  <th>NUM</th>
                  <th>POS</th>
                  <th>NUMR</th>
                  <th>POSR</th>
                  <th>LOT</th>
                  <th>IMPORTE</th>
                  <th>OPCIONES</th>
                </tr>
              </thead>
              <tbody id="listaJugadas"></tbody>
            </table>
            <div class="acciones-ticket">
             <div style="display: flex; gap: 16px; justify-content: center; align-items: center; margin-top: 10px;">
  <button class="btn-repetir" id="btnRepetir" style="
    font-size: 16px;
    padding: 10px 24px;
    border-radius: 6px;
    height: 48px;
    min-width: 130px;
    font-weight: bold;
    background-color: #7f8c8d;
    color: white;
    border: none;
    cursor: pointer;
  ">🔄 Repetir</button>

  <button class="btn-vaciar" id="btnVaciar" style="
    font-size: 16px;
    padding: 10px 24px;
    border-radius: 6px;
    height: 48px;
    min-width: 130px;
    font-weight: bold;
    background-color: #e74c3c;
    color: white;
    border: none;
    cursor: pointer;
  ">🗑 Vaciar</button>

  <button class="btn-enviar" id="btnEnviar" style="
    font-size: 16px;
    padding: 14px 26px;
    border-radius: 6px;
    height: 48px;
    min-width: 130px;
    font-weight: bold;
    background-color: #2ecc71;
    color: white;
    border: none;
    cursor: pointer;
  ">✅ Enviar</button>
</div>
            </div>
          </div>
        </div>
      </div>
    `;

    cargarGrillaSorteos();
    manejarCargaJugadas();
    // Reinicia botones según localStorage (deben quedar en OFF tras enviar)
if (typeof setupMontoTotalUI === 'function') setupMontoTotalUI();
if (typeof setupDividirMontoUI === 'function') setupDividirMontoUI();

    const btnRepetir = document.getElementById("btnRepetir");
    if (btnRepetir) {
      btnRepetir.addEventListener("click", () => {
        console.log("🔘 Click en botón Repetir");
        repetirJugadas();
      });
    } else {
      console.warn("⛔ No se encontró el botón #btnRepetir");
    }

    setTimeout(() => {
      const btn = document.getElementById('btnEnviar');
      console.log("¿Existe el botón Enviar?", btn); // Para verificar en consola
      if (btn) {
        btn.addEventListener('click', () => {
          console.log("✅ Click en Enviar");
          enviarTicket();
        });
      } else {
        console.warn("⛔ No se encontró el botón Enviar.");
      }
    }, 500); // ⏱ Le damos medio segundo para que el DOM termine de cargar
    break;
  
    case 'enviadas':
  mostrarJugadasEnviadas(); // ⬅️ Primero insertás el HTML

  const fechaInput = document.getElementById('filtroFecha');

// 🧠 Usamos variable global en memoria (no localStorage)
if (!window.fechaFiltradaEnviadas) {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  window.fechaFiltradaEnviadas = `${yyyy}-${mm}-${dd}`;
}

fechaInput.value = window.fechaFiltradaEnviadas;

fechaInput.addEventListener("change", () => {
  window.fechaFiltradaEnviadas = fechaInput.value;
});

filtrarEnviadas();
  break;

  case 'resultados':
    contenido.innerHTML = `
      <h1>Resultados</h1>
      <div id="modalTicket" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
z-index: 9999; background: white; padding: 24px; border: 3px solid black; max-width: 500px; width: 95%; box-shadow: 0 0 20px rgba(0,0,0,0.7); font-family: monospace;">
</div>
     <div style="
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
">
  <input type="date" id="buscarFecha" style="padding: 8px; font-size: 14px; width: 150px;">
  <button onclick="buscarResultados()" style="padding: 8px 14px; font-size: 14px;">Buscar</button>

  <input type="number" id="ticketNumero" placeholder="Número de ticket" style="padding: 8px; font-size: 14px; width: 150px;">
  <button onclick="verificarPremio()" style="padding: 8px 14px; font-size: 14px;">Verificar Premio</button>
  <button onclick="verTicketPremiado()" style="padding: 8px 14px; font-size: 14px;">🧾 Ver Ticket Ganador</button>
</div>

<p id="resultadoPremio" style="color: #ff9900; text-align: center; margin-bottom: 12px;"></p>

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
      <div id="totalAciertosBox" style="margin-top: 20px; background: black; color: white; padding: 12px 20px; font-size: 18px; font-weight: bold; display: flex; justify-content: space-between;">
        <div>Total Aciertos</div>
        <div id="valorTotalAciertos">$0</div>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <thead>
          <tr>
            <th style="padding: 10px; text-align: left; color: white; background-color: #222;">Ticket</th>
            <th style="padding: 10px; text-align: left; color: white; background-color: #222;">Loterías</th>
            <th style="padding: 10px; text-align: left; color: white; background-color: #222;">Número</th>
            <th style="padding: 10px; text-align: left; color: white; background-color: #222;">Posición</th>
            <th style="padding: 10px; text-align: left; color: white; background-color: #222;">Número R</th>
            <th style="padding: 10px; text-align: left; color: white; background-color: #222;">Posición R</th>
            <th style="padding: 10px; text-align: left; color: white; background-color: #222;">Importe</th>
            <th style="padding: 10px; text-align: left; color: white; background-color: #222;">Acierto</th>
          </tr>
        </thead>
        <tbody id="tablaAciertos">
          <!-- Aquí se llenarán las filas con los aciertos -->
        </tbody>
      </table>

      
    `;

    // ✅ Una vez que el HTML fue insertado, seteamos la fecha y ejecutamos la búsqueda
    setTimeout(() => {
      const fechaInput = document.getElementById('buscarFecha');
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayFormatted = `${yyyy}-${mm}-${dd}`;
    
      // ✅ Si ya se había seleccionado una fecha antes, usala
      const fechaGuardada = window.fechaFiltradaResultados;
      fechaInput.value = fechaGuardada || todayFormatted;
    
      // ✅ Guardar fecha cada vez que cambia
      fechaInput.addEventListener("change", () => {
        window.fechaFiltradaResultados = fechaInput.value;
      });
    
      buscarResultados();
    }, 10);

    break;

    case 'liquidaciones':
      mostrarJugadasEnviadas(); // ⬅️ Esto asegura que la tabla exista en el DOM
      contenido.innerHTML = `
        <h1 style="text-align:center;margin-bottom:20px">💰 LIQUIDACIÓN DIARIA</h1>
        <div style="display:flex;justify-content:space-between;margin-bottom:15px">
          <input type="date" id="buscarFecha" style="padding:10px;font-size:14px;">
          <button id="buscarFechaBtn" style="padding:10px 20px;font-size:14px">Buscar</button>
        </div>
        <div style="text-align:center;margin-bottom:20px">
          <button onclick="imprimirLiquidacion()" style="padding:10px 20px;font-size:16px">🖨 Imprimir</button>
          <button onclick="guardarLiquidacionComoImagen()" style="padding:10px 20px;font-size:16px">📷 Guardar Imagen</button>
        </div>
  <div class="liquidacion-ticket" style="font-family:monospace;background:white;padding:24px;color:black;text-align:left;width:440px;margin:0 auto;border:2px solid black">
    <div class="fecha" style="margin-bottom:10px;"></div>
  </div>
  `;

  // ✅ Prellenar la fecha con la actual
  setTimeout(() => {
    const fechaInput = document.getElementById('buscarFecha');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;
    fechaInput.value = todayFormatted;

    buscarFecha();
    generarLiquidacionDesdeResultados();
  }, 20);

  // ✅ Al hacer clic en el botón buscar
  document.getElementById('buscarFechaBtn').addEventListener('click', () => {
    buscarFecha();
    generarLiquidacionDesdeResultados();
  });

  function buscarFecha() {
    const fechaSeleccionada = document.getElementById('buscarFecha')?.value || '';
    const fechaElemento = document.querySelector('.fecha');
    if (fechaElemento) {
      fechaElemento.innerHTML = `FECHA: ${fechaSeleccionada || '--/--/----'}`;
    }
  }


// Función para imprimir la liquidación
function imprimirLiquidacion() {
  const ticket = document.querySelector('.liquidacion-ticket');
  if (!ticket) return alert("No se encontró la liquidación para imprimir");

  const ventana = window.open('', '', 'width=400,height=600');
  ventana.document.write(`
    <html>
      <head>
        <title>Imprimir Liquidación</title>
        <style>
          body { font-family: monospace; padding: 20px; }
          .ticket { border: 1px solid #000; padding: 20px; }
        </style>
      </head>
      <body>
        <div class="ticket">
          ${ticket.innerHTML}
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); }
          }
        </script>
      </body>
    </html>
  `);
  ventana.document.close();
}

// Función para guardar la liquidación
function guardarLiquidacion() {
  const contenidoLiquidacion = document.querySelector('.liquidacion-ticket').innerHTML;
  const blob = new Blob([contenidoLiquidacion], { type: 'text/plain' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = 'liquidacion.txt';
  enlace.click();
}

setTimeout(() => {
  // Botones Imprimir y Guardar Imagen
  const btnImprimir = document.querySelector('button[onclick="imprimirLiquidacion()"]');
  const btnGuardar = document.querySelector('button[onclick="guardarLiquidacion()"]');
  const fechaInput = document.getElementById('buscarFecha');

  if (btnImprimir) btnImprimir.addEventListener('click', imprimirLiquidacion);
  if (btnGuardar) btnGuardar.addEventListener('click', guardarLiquidacion);

  // Insertar la fecha de hoy automáticamente
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  const hoyFormateado = `${yyyy}-${mm}-${dd}`;
  if (fechaInput) {
    fechaInput.value = hoyFormateado;
    buscarFecha(); // Ejecuta la carga automática
  }
}, 50);

break;
  
case 'perfil':
  contenido.innerHTML = `
    <h1 style="color:white; text-align:center; margin-bottom:30px; font-size:28px">👤 Editar Perfil</h1>
    
    <div style="max-width:480px; margin:0 auto; background:#111; padding:30px; border-radius:12px; box-shadow: 0 0 12px rgba(0,0,0,0.6)">
      <div style="margin-bottom:20px">
        <label style="color:#ccc; font-weight:bold; display:block; margin-bottom:6px;">Usuario:</label>
        <input type="text" value="2323" disabled style="width:100%; padding:12px; background:#222; color:#0f0; border:none; border-radius:6px; font-size:16px">
      </div>

      <div style="margin-bottom:20px">
        <label style="color:#ccc; font-weight:bold; display:block; margin-bottom:6px;">Contraseña actual:</label>
        <input type="password" id="claveActual" placeholder="Contraseña actual" style="width:100%; padding:12px; background:#222; color:white; border:1px solid #555; border-radius:6px; font-size:16px">
      </div>

      <div style="margin-bottom:20px">
        <label style="color:#ccc; font-weight:bold; display:block; margin-bottom:6px;">Nueva contraseña:</label>
        <input type="password" id="claveNueva1" placeholder="Nueva contraseña" style="width:100%; padding:12px; background:#222; color:white; border:1px solid #555; border-radius:6px; font-size:16px">
      </div>

      <div style="margin-bottom:20px">
        <label style="color:#ccc; font-weight:bold; display:block; margin-bottom:6px;">Repetir nueva contraseña:</label>
        <input type="password" id="claveNueva2" placeholder="Repetí la nueva contraseña" style="width:100%; padding:12px; background:#222; color:white; border:1px solid #555; border-radius:6px; font-size:16px">
      </div>

      <div style="text-align:center">
        <button onclick="cambiarContrasena()" style="padding:12px 24px; font-size:16px; font-weight:bold; background-color:#2ecc71; color:white; border:none; border-radius:6px; cursor:pointer">💾 Cambiar Contraseña</button>
        <p id="mensajeClave" style="margin-top:15px; font-weight:bold;"></p>
      </div>
    </div>
  `;
  break;
  
    default:
      contenido.innerHTML = `<h1>Bienvenido a CLAU712</h1>`;
  }
}
  // Cachea bloqueos por 2 minutos para evitar flasheo visual
async function getBloqueosSetCached(fecha = hoyISO()) {
  const c = window.__BLOQ_CACHE || {};
  const ok = c.fecha === fecha && (Date.now() - (c.ts || 0) < 120000) && c.set instanceof Set;
  if (ok) return c.set;
  const set = await getBloqueosSet(fecha);
  window.__BLOQ_CACHE = { fecha, ts: Date.now(), set };
  return set;
}
// CARGAR GRILLA DE SORTEOS
async function cargarGrillaSorteos() {
  const BLOQ = await getBloqueosSetCached();
console.log("🔎 Bloqueos cargados hoy (final):", [...BLOQ]);

const cuerpo = document.getElementById("cuerpo-sorteos");
const frag = document.createDocumentFragment();
const nuevoTbody = document.createElement('tbody');
nuevoTbody.id = 'cuerpo-sorteos';
  
    const ordenPersonalizado = [
      'NAC', 'PRO', 'SFE', 'COR', 'RIO',
      'CTE', 'MZA', 'CHA', 'JUJ', 'SAN',
      'NQN', 'CHB', 'RIN', 'LRJ',
      'SAL', 'MIS', 'SCR', 'TUC', 'SGO', 'ORO'
    ];
    const horariosConBoton = ['10:15', '12:00', '15:00', '18:00', '21:00'];
    const loteriasPrincipales = ['NAC', 'PRO', 'SFE', 'COR', 'RIO'];
  
    horarios.forEach(hora => {
      const fila = document.createElement("tr");
  
      // 🟨 Celda vacía (si no hay botón), o botón chiquito
      const celdaSelector = document.createElement("td");
      celdaSelector.style.padding = "0";
      celdaSelector.style.textAlign = "center";
  
      if (horariosConBoton.includes(hora)) {
        const miniBtn = document.createElement("button");
miniBtn.innerText = "5️⃣"; // ← Acá va el emoji
miniBtn.title = "Marcar 5 principales";
miniBtn.style.fontSize = "18px"; // un poco más grande porque el emoji necesita aire
miniBtn.style.width = "26px";
miniBtn.style.height = "26px";
miniBtn.style.padding = "0";
miniBtn.style.margin = "2px";
miniBtn.style.borderRadius = "4px";
miniBtn.style.background = "#111";
miniBtn.style.color = "#0f0";
miniBtn.style.border = "1px solid #444";
miniBtn.style.cursor = "pointer";
  
        miniBtn.onclick = () => {
          const activas = loteriasPrincipales.every(sig => {
            const celda = document.querySelector(`.casilla-sorteo[data-lot="${sig}"][data-horario="${hora}"]`);
            return celda?.classList.contains("activo");
          });
  
          loteriasPrincipales.forEach(sig => {
            const celda = document.querySelector(`.casilla-sorteo[data-lot="${sig}"][data-horario="${hora}"]`);
            if (celda && celda.dataset.disabled !== '1' && !celda.classList.contains("bloqueado")) {
              celda.classList.toggle("activo", !activas);
            }
          });
        };
  
        celdaSelector.appendChild(miniBtn);
      }
  
      fila.appendChild(celdaSelector);
  
      // ⏰ Botón de hora
      const celdaHora = document.createElement("td");
      const btnHora = document.createElement("button");
      btnHora.innerText = hora;
      btnHora.classList.add("btn-fila");
      btnHora.style.fontSize = "14px";
btnHora.style.padding = "8px 14px";
btnHora.style.borderRadius = "4px";
btnHora.style.height = "90%";
btnHora.style.width = "90%";
btnHora.style.boxSizing = "border-box";
      btnHora.dataset.hora = hora;
      celdaHora.appendChild(btnHora);
      fila.appendChild(celdaHora);
  
      // 🎯 Grilla de loterías
      ordenPersonalizado.forEach(key => {
        const celda = document.createElement("td");
        if (loterias[key].includes(hora)) {
          celda.classList.add("casilla-sorteo");
          celda.dataset.lot = key;
          celda.dataset.horario = hora;
      
          const clave = key + hora.split(':')[0].padStart(2, '0'); // ej: "NAC10"
          const bloqueadaHoy = BLOQ.has(key) || BLOQ.has(clave);
      
          if (bloqueadaHoy) {
            celda.classList.add('bloq');
            celda.dataset.disabled = '1';
            celda.title = 'Bloqueada por admin (hoy)';
            // 🔊 LOG por cada celda bloqueada y con qué coincidió
            const motivo = BLOQ.has(clave) ? clave : key;
            console.log(`⛔ [BLOQ] Bloqueada ${key} ${hora} (motivo: ${motivo})`);
          } else {
            celda.onclick = () => {
              if (celda.dataset.disabled === '1' || celda.classList.contains('bloqueado')) return;
              celda.classList.toggle("activo");
            };
          }
        } else {
          celda.classList.add("no-disponible");
        }
        fila.appendChild(celda);
      });
  
      nuevoTbody.appendChild(fila);
    });
  
    // 🟢 Botón “Todos”
    document.getElementById("btn-todos-sorteos").onclick = () => {
      const celdas = document.querySelectorAll(
        ".casilla-sorteo:not(.bloqueado):not(.bloq):not([data-disabled='1'])"
      );
      const todasActivas = [...celdas].every(c => c.classList.contains("activo"));
      celdas.forEach(c => c.classList.toggle("activo", !todasActivas));
    };
  
    // 🔁 Activar fila completa al tocar hora
    setTimeout(() => {
      document.querySelectorAll(".btn-fila").forEach(btn => {
        btn.addEventListener("click", () => {
          const hora = btn.dataset.hora;
          const fila = document.querySelectorAll(
            `.casilla-sorteo[data-horario="${hora}"]:not(.bloqueado):not(.bloq):not([data-disabled='1'])`
          );
          const activa = [...fila].every(c => c.classList.contains("activo"));
          fila.forEach(c => c.classList.toggle("activo", !activa));
        });
      });
    }, 100);
    // ✅ BLOQUEAR CELDAS AL TERMINAR DE CONSTRUIR LA GRILLA
frag.appendChild(nuevoTbody);
cuerpo.parentNode.replaceChild(frag.firstChild, cuerpo);
// setTimeout(bloquearCeldas, 10);
bloquearCeldas(); // 👈 volver a aplicar cierres por hora inmediatamente
  }

  let ultimoImporte = ""; // 🧠 Guardamos el último importe ingresado
  
  function manejarCargaJugadas() {
    const campos = document.querySelectorAll('.jugada-inputs input');
    const lista = document.getElementById('listaJugadas');
    // 🗑 Delegado: eliminar cualquier jugada (incluye las creadas con '+', repetidas, editadas, etc.)
lista.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.eliminar'); // usa la clase que ya tenés en los botones
  if (!btn) return;

  const tr = btn.closest('tr');
  if (!tr) return;

  // índice de esa fila dentro de #listaJugadas
  const filas = Array.from(lista.querySelectorAll('tr'));
  const idx = filas.indexOf(tr);
  if (idx < 0) return;

  // borrar del array y del DOM sin tocar nada más
  jugadasTemp.splice(idx, 1);
  tr.remove();
});
  
    campos.forEach((campo, i) => {
      campo.addEventListener('input', () => {
        let val = campo.value;
        if (i === 0) campo.value = val.slice(0, 4).replace(/\D/g, '');
        if (i === 1 && (isNaN(val) || +val < 1 || +val > 20)) campo.value = '';
        if (i === 2 && (isNaN(val) || parseFloat(val) <= 0)) campo.value = '';
        if (i === 3) campo.value = val.slice(0, 2).replace(/\D/g, '');
        if (i === 4 && (isNaN(val) || +val < 1 || +val > 20)) campo.value = '';
      });
    });
  
    document.querySelector('.btn-jugar').onclick = () => {
      const numero = campos[0].value.trim();
      const posicion = campos[1].value.trim();
      const importe = campos[2].value.trim();
      const redoblonaNum = campos[3].value.trim();
      const redoblonaPos = campos[4].value.trim();
  
      if (!numero || !posicion || !importe)
        return alert("Faltan datos para la jugada principal");
      if ((redoblonaNum && !redoblonaPos) || (!redoblonaNum && redoblonaPos))
        return alert("Completá ambos campos de redoblona o dejalos vacíos");
      if (redoblonaNum && numero.length !== 2) {
        alert("⚠️ Si vas a cargar una redoblona, el número principal debe tener exactamente 2 cifras.");
        campos[0].focus(); campos[0].select();
        return;
      }
  
      const seleccionadas = Array.from(document.querySelectorAll('.casilla-sorteo.activo'))
        .map(c => c.dataset.lot + c.dataset.horario.split(':')[0].padStart(2, '0'));
      if (seleccionadas.length === 0) return alert('Seleccioná al menos una lotería');
      // Modo "Monto total": si está activo, prorrateamos el total al enviar
const usarMontoTotal = (window.__MTicket?.activo === true);
const montoTotalDeseado = Number(window.__MTicket?.total || 0);
if (usarMontoTotal && !(montoTotalDeseado > 0)) {
  return alert('Activaste "Monto total" pero no capturaste el importe total (primer importe).');
}
const jugadasFuente = usarMontoTotal
  ? prorratearMontoTotal(jugadasTemp, montoTotalDeseado)
  : jugadasTemp;
  
      const jugadaEditando = jugadasTemp.find(j => j._editando);
      if (jugadaEditando) {
        const nueva = {
          numero,
          posicion,
          importe: parseFloat(importe),
          redoblona: redoblonaNum || null,
          posRedoblona: redoblonaPos || null,
          loterias: [...jugadaEditando.loterias]
        };
      
        Object.freeze(nueva);
        Object.freeze(nueva.loterias);
      
        const nuevoTr = document.createElement('tr');
        nuevoTr.innerHTML = `
          <td>${nueva.numero}</td>
          <td>${nueva.posicion}</td>
          <td>${nueva.redoblona || '-'}</td>
          <td>${nueva.posRedoblona || '-'}</td>
          <td>${nueva.loterias.length}</td>
          <td>$${nueva.importe.toLocaleString('es-AR')}</td>
          <td>
            <button class='editar'>📝</button>
            <button class='eliminar'>❌</button>
          </td>
        `;
        nueva._tr = nuevoTr;
      
        // Reemplazar en array
        const i = jugadasTemp.indexOf(jugadaEditando);
        if (i !== -1) jugadasTemp.splice(i, 1, nueva);
        jugadaEditando._tr.replaceWith(nuevoTr);
      
        // Eliminar marca
        delete jugadaEditando._editando;
      
        // Activar eventos
        nuevoTr.querySelector('.editar').onclick = () => {
          jugadasTemp.forEach(j => delete j._editando);
          nueva._editando = true;
          campos[0].value = nueva.numero;
          campos[1].value = nueva.posicion;
          campos[2].value = nueva.importe;
          campos[3].value = nueva.redoblona || '';
          campos[4].value = nueva.posRedoblona || '';
          document.querySelectorAll('#listaJugadas tr').forEach(f => f.style.backgroundColor = '');
          nuevoTr.style.backgroundColor = '#ffe066';
          const btn = document.querySelector('.btn-jugar');
          btn.textContent = "Corregir Número";
          btn.style.background = "#d3a300";
          setTimeout(() => {
            campos[0].focus();
            campos[0].select();
          }, 30);
        };
      
        nuevoTr.querySelector('.eliminar').onclick = () => {
          jugadasTemp = jugadasTemp.filter(j => j !== nueva);
          nuevoTr.remove();
        };
      
        // Restaurar botón y limpiar
        const btn = document.querySelector('.btn-jugar');
        btn.textContent = "Agregar Apuesta";
        btn.style.background = "";
        campos.forEach(c => c.value = '');
        return;
      }
      if (jugadasTemp.some(j => j._editando)) {
        alert("Terminá de editar la jugada antes de cargar una nueva.");
        return;
      }
  
      // Si NO estamos editando, agregamos una nueva
      // 💡 NUEVO: Detectar si está activado el checkbox de dividir
      const dividirActivado = document.getElementById('dividirMonto')?.checked;
const importeTotal = parseFloat(importe);
const importeFinal = dividirActivado
  ? +(importeTotal / seleccionadas.length).toFixed(2)
  : importeTotal;

const jugada = {
  numero,
  posicion,
  importe: importeFinal,
  redoblona: redoblonaNum || null,
  posRedoblona: redoblonaPos || null,
  loterias: [...seleccionadas]
};
  
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${jugada.numero}</td>
        <td>${jugada.posicion}</td>
        <td>${jugada.redoblona || '-'}</td>
        <td>${jugada.posRedoblona || '-'}</td>
        <td>${jugada.loterias.length}</td>
        <td>$${jugada.importe.toLocaleString('es-AR')}</td>
        <td>
          <button class='editar'>📝</button>
          <button class='eliminar'>❌</button>
        </td>
      `;
      jugada._tr = tr;
  
      tr.querySelector('.editar').onclick = () => {
        jugadasTemp.forEach(j => delete j._editando);
      
        const editable = {
          ...jugada,
          loterias: [...jugada.loterias],
          _tr: tr,
          _editando: true
        };
      
        const index = jugadasTemp.indexOf(jugada);
        if (index !== -1) {
          jugadasTemp.splice(index, 1, editable);
        }
      
        campos[0].value = editable.numero;
        campos[1].value = editable.posicion;
        campos[2].value = editable.importe;
        campos[3].value = editable.redoblona || '';
        campos[4].value = editable.posRedoblona || '';
      
        document.querySelectorAll('#listaJugadas tr').forEach(f => f.style.backgroundColor = '');
        tr.style.backgroundColor = '#ffe066';
      
        const btn = document.querySelector('.btn-jugar');
        btn.textContent = "Corregir Número";
        btn.style.background = "#d3a300";
      
        setTimeout(() => {
          campos[0].focus();
          campos[0].select();
        }, 30);
      };
  
      tr.querySelector('.eliminar').onclick = () => {
        jugadasTemp = jugadasTemp.filter(j => j !== jugada);
        tr.remove();
      };
  
      lista.appendChild(tr);
      Object.freeze(jugada);
Object.freeze(jugada.loterias);
jugadasTemp.push(jugada);
  
      campos.forEach((c, i) => {
        if (i === 2) {
          c.value = importe;
          c.addEventListener('focus', () => c.select());
        } else {
          c.value = '';
        }
      });
  
      setTimeout(() => campos[0].focus(), 20);
  
      
    };
  }
// 🔄 BOTÓN REPETIR – SIEMPRE ACTIVO Y ADAPTABLE
function repetirJugadas() {
  console.log("🔁 Ejecutando repetirJugadas()");

  const ticketId = prompt("¿Qué número de ticket querés repetir?");
  if (!ticketId) return;

  const ticket = jugadasEnviadas.find(t => t.numero == ticketId);
  if (!ticket) {
    alert("❌ No se encontró el ticket.");
    return;
  }

  window.ticket = ticket;

  let loteriasSeleccionadas = Array.from(document.querySelectorAll('.casilla-sorteo.activo'))
    .map(c => c.dataset.lot + c.dataset.horario.split(':')[0].padStart(2, '0'));

  const ahora = new Date();
  const minutosActuales = ahora.getHours() * 60 + ahora.getMinutes();

  if (loteriasSeleccionadas.length === 0) {
    const grupos = {};
  
    for (const j of ticket.jugadas) {
      const grupo = j.loterias.map(l => l.slice(0, 3)).sort().join("-");
      if (!grupos[grupo]) grupos[grupo] = [];
      grupos[grupo].push(j);
    }
  
    let cantidadCargadas = 0;
  
    for (const grupoLoterias in grupos) {
      const originales = grupoLoterias.split("-");
      const horariosActuales = originales
        .map(sigla => {
          const turnos = loterias[sigla];
          const proximo = turnos?.find(h => {
            const [hh, mm] = h.split(":").map(Number);
            return (hh * 60 + mm) > minutosActuales;
          });
          return proximo ? sigla + proximo.slice(0, 2) : null;
        })
        .filter(Boolean);
  
      if (horariosActuales.length !== originales.length) continue;
  
      for (const j of grupos[grupoLoterias]) {
        const jugadaClon = {
          numero: j.numero,
          posicion: j.posicion,
          importe: j.importe,
          redoblona: j.redoblona,
          posRedoblona: j.posRedoblona,
          loterias: [...horariosActuales]
        };
  
        Object.freeze(jugadaClon);
        Object.freeze(jugadaClon.loterias);
        jugadasTemp.push(jugadaClon);
  
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${jugadaClon.numero}</td>
          <td>${jugadaClon.posicion}</td>
          <td>${jugadaClon.redoblona || '-'}</td>
          <td>${jugadaClon.posRedoblona || '-'}</td>
          <td>${jugadaClon.loterias.length}</td>
          <td>$${jugadaClon.importe.toLocaleString('es-AR')}</td>
          <td>
            <button class='editar'>📝</button>
            <button class='eliminar'>❌</button>
          </td>
        `;
  
        jugadaClon._tr = tr;
  
        tr.querySelector('.eliminar').onclick = () => {
          jugadasTemp = jugadasTemp.filter(jg => jg !== jugadaClon);
          tr.remove();
        };
  
        tr.querySelector('.editar').onclick = () => {
          jugadasTemp.forEach(j => delete j._editando);
          const editable = {
            ...jugadaClon,
            loterias: [...jugadaClon.loterias],
            _tr: tr,
            _editando: true
          };
          const index = jugadasTemp.indexOf(jugadaClon);
          if (index !== -1) {
            jugadasTemp.splice(index, 1, editable);
          }
  
          const campos = document.querySelectorAll('.jugada-inputs input');
          campos[0].value = editable.numero;
          campos[1].value = editable.posicion;
          campos[2].value = editable.importe;
          campos[3].value = editable.redoblona || '';
          campos[4].value = editable.posRedoblona || '';
  
          document.querySelectorAll('#listaJugadas tr').forEach(f => f.style.backgroundColor = '');
          tr.style.backgroundColor = '#ffe066';
  
          const btn = document.querySelector('.btn-jugar');
          btn.textContent = "Corregir Número";
          btn.style.background = "#d3a300";
  
          setTimeout(() => {
            campos[0].focus();
            campos[0].select();
          }, 30);
        };
  
        document.getElementById('listaJugadas').appendChild(tr);
        cantidadCargadas++;
        // Activar visualmente las casillas correspondientes en la grilla (respetando bloqueos)
document.querySelectorAll('.casilla-sorteo').forEach(c => c.classList.remove('activo'));

jugadasTemp.forEach(j => {
  j.loterias.forEach(codigo => {
    const sigla = codigo.slice(0, 3);
    const hora = codigo.slice(3);
    const celda = document.querySelector(`.casilla-sorteo[data-lot="${sigla}"][data-horario^="${hora}"]`);
    if (celda && celda.dataset.disabled !== '1' && !celda.classList.contains('bloqueado')) {
      celda.classList.add('activo');
    }
  });
});
      }
    }
  
    if (cantidadCargadas === 0) {
      alert("⚠️ Ninguna de las combinaciones originales tiene loterías disponibles para ahora.");
    } else {
      alert("✅ Ticket repetido correctamente");
      return; // 🧷 Evita que se repita el ticket nuevamente con otra lógica
    }
  }

  document.querySelectorAll('.casilla-sorteo').forEach(c => c.classList.remove('activo'));
  loteriasSeleccionadas.forEach(codigo => {
    const sigla = codigo.slice(0, 3);
    const hora = codigo.slice(3);
    const selector = `.casilla-sorteo[data-lot="${sigla}"][data-horario^="${hora}"]`;
    const celda = document.querySelector(selector);
    if (celda) celda.classList.add('activo');
  });

  ticket.jugadas.forEach(j => {
    const seleccionadas = [...loteriasSeleccionadas];
    const jugadaClon = {
      numero: j.numero,
      posicion: j.posicion,
      importe: j.importe,
      redoblona: j.redoblona,
      posRedoblona: j.posRedoblona,
      loterias: seleccionadas
    };

    Object.freeze(jugadaClon);
    Object.freeze(jugadaClon.loterias);
    jugadasTemp.push(jugadaClon);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${jugadaClon.numero}</td>
      <td>${jugadaClon.posicion}</td>
      <td>${jugadaClon.redoblona || '-'}</td>
      <td>${jugadaClon.posRedoblona || '-'}</td>
      <td>${jugadaClon.loterias.length}</td>
      <td>$${jugadaClon.importe.toLocaleString('es-AR')}</td>
      <td>
        <button class='editar'>📝</button>
        <button class='eliminar'>❌</button>
      </td>
    `;

    jugadaClon._tr = tr;

    tr.querySelector('.eliminar').onclick = () => {
      jugadasTemp = jugadasTemp.filter(jg => jg !== jugadaClon);
      tr.remove();
    };

    tr.querySelector('.editar').onclick = () => {
      jugadasTemp.forEach(j => delete j._editando);
      const editable = {
        ...jugadaClon,
        loterias: [...jugadaClon.loterias],
        _tr: tr,
        _editando: true
      };
      const index = jugadasTemp.indexOf(jugadaClon);
      if (index !== -1) {
        jugadasTemp.splice(index, 1, editable);
      }
      const campos = document.querySelectorAll('.jugada-inputs input');
      campos[0].value = editable.numero;
      campos[1].value = editable.posicion;
      campos[2].value = editable.importe;
      campos[3].value = editable.redoblona || '';
      campos[4].value = editable.posRedoblona || '';
      document.querySelectorAll('#listaJugadas tr').forEach(f => f.style.backgroundColor = '');
      tr.style.backgroundColor = '#ffe066';
      const btn = document.querySelector('.btn-jugar');
      btn.textContent = "Corregir Número";
      btn.style.background = "#d3a300";
      setTimeout(() => {
        campos[0].focus();
        campos[0].select();
      }, 30);
    };

    document.getElementById('listaJugadas').appendChild(tr);
  });

  alert("✅ Ticket repetido correctamente");
}
function mostrarJugadasEnviadas() {
  const contenido = document.getElementById('contenidoPrincipal');
  const fechaSeleccionada = document.getElementById('filtroFecha')?.value;

  contenido.innerHTML = `
    <h1 style="color:white;margin-bottom:10px">🎫 JUGADAS ENVIADAS</h1>
    
    <div style="display:flex;flex-wrap:wrap;gap:15px;margin-bottom:15px">
      <div>
        <label style="color:#aaa">Buscar por Fecha:</label><br>
        <input type="date" id="filtroFecha" style="padding:6px;font-size:14px;background:#222;color:white;border:1px solid #444">
      </div>
      <div>
        <label style="color:#aaa">Buscar por Ticket:</label><br>
        <input type="number" id="filtroTicket" placeholder="Ej: 1003" style="padding:6px;font-size:14px;background:#222;color:#0f0;border:1px solid #444">
      </div>
      <div style="align-self:end">
        <button onclick="filtrarEnviadas()" style="padding:8px 16px;background:#0a0;color:white;border:none;font-size:14px">🔍 Buscar</button>
      </div>
    </div>

    <div style="color:#00ff00;font-weight:bold;font-size:22px;margin-bottom:12px">
      Total: <span class="total-enviadas">$0</span>
    </div>

    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;background:#1e1e1e;font-family:monospace;font-size:15px">
        <thead style="background:#333;color:#00ffcc">
          <tr>
            <th style="padding:8px;border:1px solid #444">Hora</th>
            <th style="padding:8px;border:1px solid #444">Ticket</th>
            <th style="padding:8px;border:1px solid #444">Apuestas</th>
            <th style="padding:8px;border:1px solid #444">Loterías</th>
            <th style="padding:8px;border:1px solid #444">Importe</th>
            <th style="padding:8px;border:1px solid #444">Opciones</th>
          </tr>
        </thead>
        <tbody id="tablaEnviadas" style="color:white"></tbody>
      </table>
    </div>
  `;

  renderizarFiltradas(jugadasEnviadas);

  // 🔁 Actualizar total con filtro por fecha
  const totalFiltrado = jugadasEnviadas
    .filter(t => !t.anulado && (!fechaSeleccionada || t.fecha === fechaSeleccionada))
    .reduce((acc, t) => acc + t.total, 0);

  document.querySelector('.total-enviadas').innerText = `$${totalFiltrado.toLocaleString('es-AR')}`;
}
  
function renderizarFiltradas(lista) {
  const tbody = document.getElementById('tablaEnviadas');
  tbody.innerHTML = '';

  if (lista.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" style="padding:12px;color:#aaa;text-align:center">No se encontraron resultados.</td>`;
    tbody.appendChild(tr);
    return;
  }

  lista.forEach(t => {
    const tr = document.createElement('tr');
    if (t.anulado) tr.style.backgroundColor = 'rgba(255,0,0,0.15)';

    const cantidadJugadas = t.jugadas.length;
    const cantidadLoterias = new Set(t.jugadas.flatMap(j => j.loterias)).size;
    const ahora = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
    const ahoraArg = new Date(ahora);

    let botonAnular = '';

    const horasSorteo = t.jugadas.flatMap(j =>
      j.loterias.map(codigo => {
        const match = codigo.match(/\d{2,4}$/);
        if (!match) return null;
    
        const horaStr = match[0];
        const hora = parseInt(horaStr.slice(0, 2));
        let min = 0;
    
        if (horaStr.length === 4) {
          min = parseInt(horaStr.slice(2, 4));
        } else {
          const cierres = {
            10: 15,
            11: 30,
            12: 0,
            14: 30,
            15: 0,
            17: 30,
            18: 0,
            19: 30,
            21: 0
          };
          min = cierres[hora] ?? 0;
        }
    
        return new Date(`${t.fecha}T${hora.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`);
      }).filter(Boolean)
    );
    const primerSorteo = new Date(Math.min(...horasSorteo.map(d => d.getTime())));
    const esAnulable = !t.anulado && ahoraArg.getTime() < (primerSorteo.getTime() - 60000);

    if (esAnulable) {
      botonAnular = `<button class="btn-anular" data-id="${t.id}" style="font-size:18px;color:red">⛔</button>`;
    }

    tr.innerHTML = `
      <td style="padding:6px;border:1px solid #444;text-align:center">${t.hora}</td>
      <td style="padding:6px;border:1px solid #444;text-align:center">${t.numero || '¿?'}</td>
      <td style="padding:6px;border:1px solid #444;text-align:center">${cantidadJugadas}</td>
      <td style="padding:6px;border:1px solid #444;text-align:center">${cantidadLoterias}</td>
      <td style="padding:6px;border:1px solid #444;text-align:center">$${t.anulado ? '0,00' : t.total.toLocaleString('es-AR')}</td>
      <td style="padding:6px;border:1px solid #444;text-align:center">
        <button class="btn-ver" data-id="${t.id}" style="font-size:18px;margin-right:8px">📄</button>
        ${botonAnular}
      </td>
    `;

    tbody.appendChild(tr);

    const btnVer = tr.querySelector('.btn-ver');
    if (btnVer) {
      btnVer.addEventListener('click', () => verTicket(t.id));
    }

    const btnAnular = tr.querySelector('.btn-anular');
    if (btnAnular) {
      btnAnular.addEventListener('click', () => anularTicket(t.id));
    }
  });
}
  
async function filtrarEnviadas() {
  const inputFecha = document.getElementById('filtroFecha');
  if (!inputFecha) {
    console.warn("📛 No se encontró el input '#filtroFecha'. Deteniendo filtrado.");
    return;
  }
  const fechaInput = inputFecha.value;
      // 💤 Si es domingo, mostrar cartel especial y salir
  const diaSeleccionado = new Date(fechaInput + "T00:00:00").getDay();
  if (diaSeleccionado === 0) {
    const tbody = document.getElementById('tablaEnviadas');
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 30px; color: #ffc107; text-align: center; font-size: 18px; background: #111; border: 2px dashed #444;">
          💤 El día seleccionado es <strong>domingo</strong><br><br>
          No se registran jugadas ni sorteos.<br>
          Por favor seleccioná otra fecha.
        </td>
      </tr>
    `;
    document.querySelector('.total-enviadas').innerText = `$0`;
    return;
  }
    const ticketInput = document.getElementById('filtroTicket').value;
    const vendedor = localStorage.getItem('claveVendedor');
    const filtros = [];

    if (fechaInput) filtros.push(`fecha=eq.${fechaInput}`);
    if (ticketInput) filtros.push(`numero=eq.${ticketInput}`);
    if (vendedor) filtros.push(`vendedor=eq.${vendedor}`);

    const filtroFinal = filtros.length ? `?${filtros.join('&')}` : '';

    const url = `https://agithblutrkibaydjbsl.supabase.co/rest/v1/jugadas_enviadas${filtroFinal}`;
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnaXRoYmx1dHJraWJheWRqYnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NTI4MzcsImV4cCI6MjA2MzMyODgzN30.pEzQkajudq4_rOpevqp8XUCLm4AUx_XOWgWwDdBczss';

    try {
      const resp = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });

      if (!resp.ok) throw new Error(await resp.text());

      const datos = await resp.json();
      jugadasEnviadas = datos;
      datos.sort((a, b) => a.hora.localeCompare(b.hora));
      renderizarFiltradas(datos);
      jugadasEnviadas = datos;

      const fechaSeleccionada = document.getElementById('filtroFecha').value;
      const totalFiltrado = datos
        .filter(t => !t.anulado && (!fechaSeleccionada || t.fecha === fechaSeleccionada))
        .reduce((acc, t) => acc + t.total, 0);

      document.querySelector('.total-enviadas').innerText = `$${totalFiltrado.toLocaleString('es-AR')}`;
      // 🔄 Refrescar aciertos desde Supabase
const resAciertos = await fetch(`https://agithblutrkibaydjbsl.supabase.co/rest/v1/aciertos?fecha=eq.${fechaInput}`, {
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  }
});
aciertosGlobal = await resAciertos.json();

    } catch (err) {
      console.error("❌ Error al consultar Supabase:", err);
      console.warn("⚠️ Ocurrió un problema al obtener las jugadas, pero se continúa sin romper:", err.message);
    }
  }
  
  async function anularTicket(id) {
    const vendedor = localStorage.getItem('claveVendedor');
    const todo = JSON.parse(localStorage.getItem('jugadasEnviadasGlobal')) || {};
    const ticketsPasador = todo[vendedor] || [];
  
    const ticket = ticketsPasador.find(t => t.id === id);
    if (!ticket || ticket.anulado) return;
  
    // ⏰ Verificamos si se puede anular según la hora
    const ahora = new Date();
    const ahoraArg = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  
    const horasSorteo = ticket.jugadas.flatMap(j =>
      j.loterias.map(codigo => {
        const match = codigo.match(/\d{2,4}$/);
        if (!match) return null;
    
        const horaStr = match[0];
        const hora = parseInt(horaStr.slice(0, 2));
        let min = 0;
    
        if (horaStr.length === 4) {
          min = parseInt(horaStr.slice(2, 4));
        } else {
          const cierres = {
            10: 15,
            11: 30,
            12: 0,
            14: 30,
            15: 0,
            17: 30,
            18: 0,
            19: 30,
            21: 0
          };
          min = cierres[hora] ?? 0;
        }
    
        return new Date(`${ticket.fecha}T${hora.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`);
      }).filter(Boolean)
    );
    
    const primerSorteo = new Date(Math.min(...horasSorteo.map(d => d.getTime())));
    const esAnulable = ahoraArg.getTime() < (primerSorteo.getTime() - 60000); // 1 minuto antes
  
    // ✅ Solo se puede anular si todavía no sorteó la primer lotería
    if (!esAnulable) {
      alert("⛔ Ya no se puede anular este ticket porque uno o más sorteos ya están cerrados.");
      return;
    }
  
    if (confirm(`¿Anular ticket #${ticket.numero || id}?`)) {
      ticket.anulado = true;
      ticket.total = 0;
  
      // ✅ Actualizamos localStorage
      todo[vendedor] = ticketsPasador;
      localStorage.setItem('jugadasEnviadasGlobal', JSON.stringify(todo));
  
      const indexLocal = jugadasEnviadas.findIndex(t => t.id === id);
      if (indexLocal !== -1) {
        jugadasEnviadas[indexLocal].anulado = true;
        jugadasEnviadas[indexLocal].total = 0;
      }
  
      // ✅ Actualizar en Supabase con fetch
      try {
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnaXRoYmx1dHJraWJheWRqYnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NTI4MzcsImV4cCI6MjA2MzMyODgzN30.pEzQkajudq4_rOpevqp8XUCLm4AUx_XOWgWwDdBczss';
        const url = `https://agithblutrkibaydjbsl.supabase.co/rest/v1/jugadas_enviadas?id=eq.${id}`;
  
        const resp = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            anulado: true,
            total: 0
          })
        });
  
        if (!resp.ok) {
          const errorText = await resp.text();
          console.error("❌ Error al actualizar en Supabase:", errorText);
          alert("⛔ No se pudo anular el ticket en la nube.");
        } else {
          console.log("✅ Ticket anulado correctamente en Supabase.");
        }
  
      } catch (err) {
        console.error("❌ Error inesperado:", err);
        alert("⛔ Error inesperado al intentar anular en Supabase.");
      }
  
      filtrarEnviadas(); // 🔁 Refrescar tabla
    }
  }
  
  async function verTicket(id) {
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnaXRoYmx1dHJraWJheWRqYnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NTI4MzcsImV4cCI6MjA2MzMyODgzN30.pEzQkajudq4_rOpevqp8XUCLm4AUx_XOWgWwDdBczss';
    const url = `https://agithblutrkibaydjbsl.supabase.co/rest/v1/jugadas_enviadas?id=eq.${id}`;
  
    try {
      const resp = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
  
      if (!resp.ok) throw new Error(await resp.text());
  
      const [ticket] = await resp.json();
if (!ticket) return;

// Mostrar lo guardado. Si falta, intentar derivar de created_at. Nunca “ahora”.
const fecha = ticket.fecha
  ? new Date(ticket.fecha).toLocaleDateString('es-AR')
  : (ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('es-AR') : '');

const hora  = ticket.hora
  ?? (ticket.created_at
        ? new Date(ticket.created_at).toLocaleTimeString('es-AR', { hour12:false })
        : '—');
  
    let html = `
  <div style="text-align:center;margin-bottom:20px">
    <button onclick="mostrarSeccion('jugadas')" style="font-size:18px;padding:6px 12px;margin:5px">🆕 Nuevo Ticket</button>
    <button onclick="descargarTicketComoImagen()" style="font-size:18px;padding:6px 12px;margin:5px">📷 Guardar Imagen</button>
    <button onclick="mostrarSeccion('enviadas')" style="font-size:18px;padding:6px 12px;margin:5px">🔙 Volver</button>
  </div>

  <div class="ticket-preview" style="font-family:monospace;background:white;padding:20px;color:black;text-align:center;width:300px;margin:0 auto">
    <h3 style="margin:0">TICKET #${ticket.numero || '¿?'}</h3>
    <p style="margin:4px 0">Fecha: ${fecha} &nbsp;&nbsp; Hora: ${hora} &nbsp;&nbsp; Pasador: ${ticket.vendedor}</p>
`;
  
const grupos = {};
ticket.jugadas.forEach(j => {
  const clave = j.loterias.join(',');
  if (!grupos[clave]) grupos[clave] = [];
  grupos[clave].push(j);
});

const ordenarLoterias = (lista) => {
  const orden = ['NAC', 'PRO', 'SFE', 'COR', 'RIO', 'CTE', 'MZA', 'CHA', 'JUJ', 'SAN', 'MIS', 'ORO', 'TUC'];
  return lista.sort((a, b) => orden.indexOf(a.slice(0, 3)) - orden.indexOf(b.slice(0, 3)));
};

let total = 0;

Object.entries(grupos).forEach(([loterias, jugadas]) => {
  const ordenadas = ordenarLoterias(loterias.split(','));
  const lotFila1 = ordenadas.slice(0, 7).join(' ');
  const lotFila2 = ordenadas.slice(7).join(' ');
  
      html += `<hr style="border:1px solid black;margin:4px 0">
        <div style="text-align:center;font-size:13px">${lotFila1}</div>`;
      if (lotFila2) html += `<div style="text-align:center;font-size:13px">${lotFila2}</div>`;
      html += `<hr style="border:1px solid black;margin:4px 0">`;
  
      jugadas.forEach(j => {
        const numeroStr = '*'.repeat(4 - j.numero.length) + j.numero;
        const posicionStr = j.posicion.toString().padStart(2, '0');
        const importeStr = `$${j.importe.toLocaleString('es-AR')}`.padStart(9, ' ');
        const redoblonaStr = j.redoblona
          ? ` ${'*'.repeat(4 - j.redoblona.length) + j.redoblona} ${j.posRedoblona.toString().padStart(2, ' ')}`
          : '';
      
        html += `<div style="text-align:left;font-size:16px;line-height:1.6;margin-left:18px;font-family:monospace">
          ${numeroStr} ${posicionStr} ${importeStr}${redoblonaStr}
        </div>`;
      
        total += j.importe * j.loterias.length;
      });
    });
  
    html += `
<hr style="border:1px solid black;margin:10px 0">
<div style="font-size:24px;font-weight:900;margin-top:10px;text-align:center">
  TOTAL: $${ticket.total.toLocaleString('es-AR')}
</div>
<div style="font-size:10px;text-align:center;margin-top:8px;color:gray;">
  ${ticket.id}
</div>
</div>`;

document.getElementById('contenidoPrincipal').innerHTML = html;

  } catch (err) {
    console.error("❌ Error al obtener ticket desde Supabase:", err);
    // No mostrar alerta, solo log interno
  }
}
  
function cerrarSesion() {
  window.__LIQ_OK = false; // 🔄 resetea el gate
  window.location.href = "index.html";
}
  
  // RELOJ
  setInterval(() => {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-AR', { hour12: false });
    const fecha = ahora.toLocaleDateString('es-AR');
    const horaSpan = document.getElementById('horaActual');
    const fechaSpan = document.getElementById('fechaActual');
    if (horaSpan && fechaSpan) {
      horaSpan.innerText = hora;
      fechaSpan.innerText = fecha;
    }
  }, 1000);
  
  // ATAJOS
document.addEventListener('keydown', (e) => {
    const focused = document.activeElement;
    const activeTag = focused?.tagName;

    // ❌ SOLO EVITA DESMARCAR SI FUE MARCADO CON EL MOUSE (no bloquea el doble enter)
    if (
      e.code === 'Enter' &&
      (
        document.activeElement.classList.contains('opcion-loteria') ||
        document.activeElement.classList.contains('opcion-horario')
      )
    ) {
      e.preventDefault(); // evita desmarcado
      // simula Tab: enfoca el siguiente input (número o importe)
      const inputs = document.querySelectorAll('.jugada-inputs input');
      for (let i = 0; i < inputs.length; i++) {
        if (document.activeElement === inputs[i] && inputs[i + 1]) {
          inputs[i + 1].focus();
          inputs[i + 1].select();
          break;
        }
      }
      return;
    }
    
  
    // AVPAG = ENVIAR JUGADA
    if (e.code === 'PageDown') {
      document.getElementById('btnEnviar')?.click();
      return;
    }
  
    // FLECHA ARRIBA = VOLVER CAMPO
    if (e.code === 'ArrowUp') {
      const inputs = document.querySelectorAll('.jugada-inputs input');
      for (let i = 1; i < inputs.length; i++) {
        if (focused === inputs[i]) {
          e.preventDefault();
          const anterior = inputs[i - 1];
          anterior.focus();
          anterior.select(); // 👈 Esto hace que al escribir se reemplace directamente
          return;
        }
      }
    }
  
    // + = Hacer bajada en orden: primero terno, luego ambo
    // + = Hacer bajada
    if (e.key === '+') {
      const lista = document.querySelectorAll('#listaJugadas tr');
      if (lista.length === 0) return;
    
      const ultimaOriginal = jugadasTemp[jugadasTemp.length - 1];

// 💥 Clonar la última jugada para poder modificarla
const ultima = {
  ...ultimaOriginal,
  loterias: [...ultimaOriginal.loterias],
  _bajadasRealizadas: [...(ultimaOriginal._bajadasRealizadas || [])]
};

const num = ultima.numero;
const base = num.length;
    
      if (base < 3) return;
    
      ultima._bajadasRealizadas = ultima._bajadasRealizadas || [];
    
      let nuevoNumero = null;
    
      if (base === 4) {
        if (!ultima._bajadasRealizadas.includes('terno')) {
          nuevoNumero = num.slice(1); // 321
          ultima._bajadasRealizadas.push('terno');
        } else if (!ultima._bajadasRealizadas.includes('ambo')) {
          nuevoNumero = num.slice(-2); // 21
          ultima._bajadasRealizadas.push('ambo');
        } else {
          return; // Ya bajó las dos
        }
      } else if (base === 3) {
        if (!ultima._bajadasRealizadas.includes('ambo')) {
          nuevoNumero = num.slice(-2); // 32
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
    
      jugadasTemp.push(nuevaJugada);
      Object.freeze(nuevaJugada);
Object.freeze(nuevaJugada.loterias);
    
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${nuevaJugada.numero}</td>
        <td>${nuevaJugada.posicion}</td>
        <td>${nuevaJugada.redoblona || '-'}</td>
        <td>${nuevaJugada.posRedoblona || '-'}</td>
        <td>${nuevaJugada.loterias.length}</td>
        <td>$${nuevaJugada.importe.toLocaleString('es-AR')}</td>
        <td>
          <button class='editar'>📝</button>
          <button class='eliminar'>❌</button>
        </td>
      `;
    
      // 🗑 Eliminar jugada bajada
      tr.querySelector('.editar').onclick = () => {
        jugadasTemp.forEach(j => delete j._editando);
      
        const editable = {
          ...nuevaJugada,
          loterias: [...nuevaJugada.loterias],
          _tr: tr,
          _editando: true
        };
      
        const index = jugadasTemp.indexOf(nuevaJugada);
        if (index !== -1) {
          jugadasTemp.splice(index, 1, editable);
        }
      
        const campos = document.querySelectorAll('.jugada-inputs input');
        campos[0].value = editable.numero;
        campos[1].value = editable.posicion;
        campos[2].value = editable.importe;
        campos[3].value = editable.redoblona || '';
        campos[4].value = editable.posRedoblona || '';
      
        document.querySelectorAll('#listaJugadas tr').forEach(f => f.style.backgroundColor = '');
        tr.style.backgroundColor = '#ffe066';
      
        const btn = document.querySelector('.btn-jugar');
        btn.textContent = "Corregir Número";
        btn.style.background = "#d3a300";
      
        setTimeout(() => {
          campos[0].focus();
          campos[0].select();
        }, 30);
      };
    
      document.getElementById('listaJugadas').appendChild(tr);
      return;
    }
  
    // ENTER = salto entre campos o doble enter para arrancar desde grilla
if (e.code === 'Enter') {
    const now = Date.now();
    const inputs = document.querySelectorAll('.jugada-inputs input');
  
    // DOBLE ENTER desde grilla (sin desmarcar nada)
    if (activeTag !== 'INPUT') {
      if (now - enterPressTime < 300) {
        const campoNumero = inputs[0];
        if (campoNumero) {
          setTimeout(() => campoNumero.focus(), 50); // ✅ Previene glitch visual
        }
        enterPressTime = 0; // resetea para que no lo repita
        return;
      } else {
        enterPressTime = now;
        return;
      }
    }
  
    // FLUJO ENTRE CAMPOS con validaciones mejoradas
for (let i = 0; i < inputs.length; i++) {
  if (focused === inputs[i]) {
    e.preventDefault();

    const val = (i) => inputs[i].value.trim();

    // 🔒 Bloquea si no hay número principal
    if (i === 0 && !val(0)) {
      alert('Completá el número principal');
      inputs[0].focus();
      return;
    }

    // ✅ Si estamos en campo número (0), autocompleta posición y salta al importe
    if (i === 0) {
      inputs[1].value = "1";
      inputs[2].focus();
      return;
    }

    // ✅ Si estamos en Importe (2), va a redoblona número (3)
    if (i === 2) {
      inputs[3].focus();
      return;
    }

    // 🔒 Si puso número redoblona pero no posición → obligar completar
    const redobloNum = val(3);
    const redobloPos = val(4);

    if (i === 3 && redobloNum && !redobloPos) {
      inputs[4].focus();
      return;
    }

    if (i === 4 && !redobloNum && redobloPos) {
      inputs[3].focus();
      return;
    }

    // ✅ Si estamos en el último campo (posRedoblona), enviamos si está todo bien
    if (i === inputs.length - 1) {
      document.querySelector('.btn-jugar')?.click();
      inputs[0].focus();
      return;
    }

    // 👉 Por defecto: saltar al siguiente campo
    inputs[i + 1].focus();
    break;
  }
}
  }// 🔄 Actualiza las jugadas si se cambian las loterías a mano

    }); // ✅ ESTA LLAVE CIERRA el addEventListener

    // 🔄 Actualiza las jugadas si se cambian las loterías a mano
document.body.addEventListener('click', function (e) {
  if (e.target.classList.contains('casilla-sorteo')) {
    setTimeout(() => {
      const nuevasLoterias = Array.from(document.querySelectorAll('.casilla-sorteo.activo'))
        .map(c => c.dataset.lot + c.dataset.horario.split(':')[0].padStart(2, '0'));

      if (jugadasTemp.length === 0 || nuevasLoterias.length === 0) return;

      jugadasTemp.forEach(j => j.loterias = [...nuevasLoterias]);

      const filas = document.querySelectorAll('#listaJugadas tr');
      filas.forEach((tr, i) => {
        const tdLoteria = tr.children[4];
        tdLoteria.textContent = jugadasTemp[i].loterias.length;
      });
    }, 50);
  }
}); // ✅ Esto cierra correctamente el addEventListener

// ⬇⬇⬇ FUNCION FUERA del addEventListener, completamente aislada
function descargarTicketComoImagen() {
  const ticket = document.querySelector('.ticket-preview');
  if (!ticket) return alert("No se encontró el ticket para guardar");

  html2canvas(ticket).then(canvas => {
    const enlace = document.createElement('a');
    enlace.href = canvas.toDataURL('image/jpeg');
    enlace.download = `ticket_${Date.now()}.jpeg`;
    enlace.click();
  });
}

function guardarLiquidacionComoImagen() {
  const ticket = document.querySelector('.liquidacion-ticket');
  if (!ticket) return alert("No se encontró la liquidación para guardar");

  html2canvas(ticket).then(canvas => {
    const enlace = document.createElement('a');
    enlace.href = canvas.toDataURL('image/jpeg');
    enlace.download = `liquidacion_${Date.now()}.jpeg`;
    enlace.click();
  });
}
async function generarLiquidacionDesdeResultados() {
  const fechaSeleccionada = document.getElementById("buscarFecha")?.value || new Date().toISOString().split('T')[0];
  const vendedor = localStorage.getItem("claveVendedor") || "SIN_VENDEDOR";

  const contenedor = document.querySelector(".liquidacion-ticket");
  if (!contenedor) return console.error("No se encontró el contenedor");

  // Verificamos si es domingo
  const diaSeleccionado = new Date(fechaSeleccionada + "T00:00:00").getDay();
  if (diaSeleccionado === 0) {
    contenedor.innerHTML = `
      <div style="text-align:center; padding: 40px; font-size: 18px; color: #ffcc00; background: #111; border: 2px dashed #444; border-radius: 12px;">
        💤 <strong>Domingo sin actividad</strong><br><br>
        Ese día no se realizan sorteos ni liquidaciones.<br>
        Elegí una fecha de <strong>lunes a sábado</strong>.
      </div>
    `;
    return;
  }

  // 🔄 Buscar liquidación desde la nube
  const { data: liquidacion, error } = await supabase
    .from("liquidaciones")
    .select("*")
    .eq("fecha", fechaSeleccionada)
    .eq("vendedor", vendedor)
    .single();

    if (!liquidacion) {
      contenedor.innerHTML = `
        <div style="text-align:center; padding: 40px; font-size: 18px; color: gray; background: #111; border: 2px dashed #444; border-radius: 12px;">
          📭 <strong>Día sin liquidar</strong><br><br>
          No se encontraron datos de liquidación para esta fecha.<br>
          Probá con otra fecha o volvé más tarde.
        </div>
      `;
      return;
    }

  let total_pase = 0,
    comision = 0,
    total_aciertos = 0,
    saldo = 0,
    saldo_final_arrastre = 0,
    bono_vendedor = 0;

if (liquidacion) {
  total_pase = liquidacion.total_pase || 0;
  comision = liquidacion.comision || 0;
  total_aciertos = liquidacion.total_aciertos || 0;
  saldo = liquidacion.saldo || 0;
  saldo_final_arrastre = liquidacion.saldo_final_arrastre || 0;
  bono_vendedor = liquidacion.bono_vendedor || 0;
}
// 👇 NUEVO: tomar reclamos desde la liquidación (o 0 si no hay)
const reclamos = Number(liquidacion?.reclamos ?? 0);

// 🧪 Logs por si algo raro
console.log('🧾 Liquidación recibida:', liquidacion);
console.log('💬 Reclamos (vendedor):', reclamos);
// ⚙️ Lee config para este vendedor (solo para etiquetas/visibilidad)
const cfg = await getConfigPara(vendedor);
const mostrarBono = cfg.bono_habilitado === true;

let monto_previa = 0;
let monto_primera = 0;
let monto_matutina = 0;
let monto_vespertina = 0;
let monto_nocturna = 0;
  // 🔁 Calcular montos por turno desde jugadas_enviadas en Supabase
const { data: tickets, error: errorTickets } = await supabase
.from("jugadas_enviadas")
.select("total, jugadas, anulado")
.eq("fecha", fechaSeleccionada)
.eq("vendedor", vendedor);

if (!errorTickets && Array.isArray(tickets)) {
monto_previa = 0;
monto_primera = 0;
monto_matutina = 0;
monto_vespertina = 0;
monto_nocturna = 0;

tickets.forEach(ticket => {
  if (ticket.anulado) return;

  const horas = ticket.jugadas
    .flatMap(j => (j.loterias || []).map(l => parseInt(l.slice(3))))
    .filter(h => !isNaN(h));

  const horaMin = Math.min(...horas, 99);
  const minutos = horaMin * 60;

  if (minutos < 660) monto_previa += ticket.total;
  else if (minutos < 780) monto_primera += ticket.total;
  else if (minutos < 960) monto_matutina += ticket.total;
  else if (minutos < 1140) monto_vespertina += ticket.total;
  else monto_nocturna += ticket.total;
});
}
// 🧾 Obtener aciertos desde Supabase
const { data: aciertosData, error: aciertosError } = await supabase
  .from("aciertos")
  .select("*")
  .eq("fecha", fechaSeleccionada)
  .eq("vendedor", vendedor);

let aciertosHTML = "";

if (!aciertosError && Array.isArray(aciertosData) && aciertosData.length > 0) {
  aciertosData.forEach(a => {
    const lot = a.loteria || "-";
    const num = a.numero || "-";
    const numRaw = String(num); // ⬅️ Acá definimos `numRaw` para usarlo después
    const pos = a.posicion || "-";
    const apo = `$${parseFloat(a.importe || 0).toLocaleString('es-AR')}`;
    const gano = `$${parseFloat(a.acierto || 0).toLocaleString('es-AR')}`;
    const redoblona = a.redoblona || "-";
    const posRedoblona = a.pos_redoblona || "-";

    if (redoblona !== "-" && posRedoblona !== "-") {
      aciertosHTML += `
        <tr>
          <td>${lot}</td>
          <td>**${num}</td>
          <td>${pos}</td>
          <td>${apo}</td>
          <td style="text-align:right">-------</td>
        </tr>
        <tr>
          <td></td>
          <td>:${redoblona}</td>
          <td>${posRedoblona}</td>
          <td></td>
          <td style="text-align:right">${gano}</td>
        </tr>
      `;
    } else {
      const ubi = a.posicion || "-";
      const numFormateado = (numRaw.length === 4) ? numRaw
        : (numRaw.length === 3) ? `*${numRaw}`
        : (numRaw.length === 2) ? `**${numRaw}`
        : (numRaw.length === 1) ? `***${numRaw}`
        : numRaw;
    
      aciertosHTML += `
        <tr>
          <td>${lot}</td>
          <td>${numFormateado}</td>
          <td>${ubi}</td>
          <td>${apo}</td>
          <td style="text-align:right">${gano}</td>
        </tr>
      `;
    }
  });
} else {
  aciertosHTML = `<tr><td colspan="5" style="padding:8px;text-align:center;color:#888">SIN ACIERTOS PARA MOSTRAR</td></tr>`;
}
// === Helpers de formato (poner ANTES del contenedor.innerHTML) ===
// 1 decimal si tiene decimales, 0 si es entero
function fmt1(n) {
  const v = Number(n) || 0;
  const hasDecimals = Math.abs(v % 1) > 0;
  const opts = hasDecimals ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : {};
  return v.toLocaleString('es-AR', opts);
}
// Dinero con signo delante del símbolo de $
function money(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  return `${sign}$${fmt1(Math.abs(v))}`;
}

contenedor.innerHTML = `
  <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:26px;font-weight:bold;margin-bottom:6px">
    <div>LIQUIDACIÓN</div>
    <div>${vendedor}</div>
  </div>

  <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:15px;margin-bottom:10px">
    <div>FECHA: ${fechaSeleccionada}</div>
    <div>CLAU712</div>
  </div>

  <hr style="border:1.5px solid black;margin:10px 0">

  <table style="width:100%;font-family:monospace;font-size:16px;border-collapse:collapse">
    <thead>
      <tr>
        <th style="text-align:left;padding-right:10px">LOT</th>
        <th style="text-align:left;padding-right:20px">NUM</th>
        <th style="text-align:left;padding-right:20px">UBI</th>
        <th style="text-align:left;padding-right:20px">APO</th>
        <th style="text-align:right;padding-right:0px">GANÓ</th>
      </tr>
    </thead>
    <tbody>
      ${aciertosHTML}
    </tbody>
  </table>

  <hr style="border:1.5px solid black;margin:10px 0">

  <div style="font-family:monospace;font-size:16px;margin-bottom:10px">
    <div>PREVIA:     <span style="float:right">$${fmt1(monto_previa)}</span></div>
    <div>PRIMERA:    <span style="float:right">$${fmt1(monto_primera)}</span></div>
    <div>MATUTINA:   <span style="float:right">$${fmt1(monto_matutina)}</span></div>
    <div>VESPERTINA: <span style="float:right">$${fmt1(monto_vespertina)}</span></div>
    <div>NOCTURNA:   <span style="float:right">$${fmt1(monto_nocturna)}</span></div>
  </div>

  <hr style="border:1.5px solid black;margin:10px 0">

  <div style="font-family:monospace;font-size:16px;margin-bottom:10px">
    <div>TOTAL PASE:      <span style="float:right">$${fmt1(total_pase)}</span></div>
    <div>COMISIÓN (${cfg.comision}%): <span style="float:right">$${fmt1(comision)}</span></div>
    <div>TOTAL ACIERTOS:  <span style="float:right">$${fmt1(total_aciertos)}</span></div>
    ${reclamos ? `<div>RECLAMOS: <span style="float:right">${money(reclamos)}</span></div>` : ""}
  </div>

  <hr style="border:1.5px solid black;margin:10px 0">

  <div style="font-family:monospace;font-size:18px;font-weight:bold;margin-bottom:10px">
    SALDO FINAL: <span style="float:right">${money(saldo)}</span>
  </div>

  <hr style="border:1.5px solid black;margin:10px 0">

  ${(mostrarBono && bono_vendedor > 0)
    ? `<div style="font-family:monospace;font-size:16px;font-weight:bold;color:green;margin-bottom:10px">
         BONO VENDEDOR (${cfg.bono_pct}%): <span style="float:right">$${fmt1(bono_vendedor)}</span>
       </div>`
    : ""
  }

  <div style="font-family:monospace;font-size:16px">
    ARRASTRE ANTERIOR: <span style="float:right">${money(saldo_final_arrastre - saldo)}</span>
  </div>
  <div style="font-family:monospace;font-size:16px;font-weight:bold">
    SALDO + ARRASTRE: <span style="float:right">${money(saldo_final_arrastre)}</span>
  </div>
`;
}
async function verTicketPremiado() {
  const ticketNumero = parseInt(document.getElementById('ticketNumero').value.trim());
  if (!ticketNumero || isNaN(ticketNumero)) {
    alert("Ingresá un número de ticket válido");
    return;
  }

  const fecha = document.getElementById('buscarFecha').value;
  const vendedor = localStorage.getItem('claveVendedor');
  const aciertos = window.arrayResultados?.filter(a =>
    parseInt(a.ticket_id) === ticketNumero &&
    a.fecha === fecha &&
    a.vendedor === vendedor
  ) || [];

  if (aciertos.length === 0) {
    alert("Ese ticket no tiene aciertos.");
    return;
  }

  let total = 0;
  let html = `
    <div style="text-align:center;margin-bottom:20px">
      <button onclick="cerrarModalTicket()" style="font-size:18px;padding:8px 20px;margin:6px">⬅️ Volver</button>
      <button onclick="guardarTicketGanadorComoImagen()" style="font-size:18px;padding:8px 20px;margin:6px">📷 Guardar Imagen</button>
    </div>

    <div class="ticket-preview" style="font-family:monospace;background:white;padding:24px;color:black;text-align:left;width:440px;margin:0 auto;border:2px solid black">
      <div style="display:flex;justify-content:space-between;font-size:21px;font-weight:bold;margin-bottom:6px">
        <div>TICKET #${ticketNumero}</div>
        <div>PREMIADO</div>
      </div>
      <div style="font-size:15px;margin-bottom:12px;text-align:center;font-family:monospace">
        <span><strong>Fecha:</strong> ${fecha}</span> - 
        <span><strong>Pasador:</strong> <span style="font-size:16px;font-weight:bold">${vendedor}</span></span>
      </div>
  `;

  const agrupados = {};
  aciertos.forEach(a => {
    if (!agrupados[a.loteria]) agrupados[a.loteria] = [];
    agrupados[a.loteria].push(a);
  });

  for (const clave in agrupados) {
    const grupo = agrupados[clave];
    html += `
      <hr style="border:2px solid black;margin:6px 0">
      <div style="text-align:center;font-size:15.5px;margin-bottom:4px">${clave}</div>
      <hr style="border:2px solid black;margin:6px 0">
    `;

    grupo.forEach(j => {
      total += parseFloat(j.acierto);
      const linea1 = `🎯 ${j.numero} ${j.posicion} x $${j.importe}`;
      const linea2 = (j.redoblona !== '-' && j.pos_redoblona !== '-') ? `⭐ ${j.redoblona.padStart(2, '*')} ${j.pos_redoblona}` : "";

      html += `
        <div style="display:flex;justify-content:space-between;margin:2px 8px;font-family:monospace">
          <div style="text-align:left;font-size:17.5px;">
            ${linea1}${linea2 ? `<br>${linea2}` : ""}
          </div>
          <div style="color:green;font-size:17.5px;text-align:right">💰 $${parseFloat(j.acierto).toLocaleString('es-AR')}</div>
        </div>
      `;
    });
  }

  html += `
    <hr style="border:2px solid black;margin:8px 0">
    <div style="font-size:22px;font-weight:bold;text-align:center;margin-top:8px">
      TOTAL GANADO:<br><span style="color:green;font-size:28px">$${total.toLocaleString('es-AR')}</span>
    </div>
  </div>
  `;

  document.getElementById("modalTicket").innerHTML = html;
  document.getElementById("modalTicket").style.display = "block";
}

function cerrarModalTicket() {
  document.getElementById("modalTicket").style.display = "none";
}

function guardarTicketGanadorComoImagen() {
  const ticket = document.querySelector('.ticket-preview');
  if (!ticket) return alert("No se encontró el ticket para guardar");

  html2canvas(ticket).then(canvas => {
    const enlace = document.createElement('a');
    enlace.href = canvas.toDataURL('image/jpeg');
    enlace.download = `ticket_ganador_${Date.now()}.jpeg`;
    enlace.click();
  });
}
async function buscarResultados() {
  const fecha = document.getElementById('buscarFecha').value;
  if (!fecha) {
    alert("Seleccioná una fecha");
    return;
  }

  const diaSeleccionado = new Date(fecha + "T00:00:00").getDay();
  if (diaSeleccionado === 0) {
    document.getElementById("tablaAciertos").innerHTML = `
      <tr><td colspan="8" style="text-align:center; padding: 20px; color: #ffcc00; background: #111; border: 2px dashed #444;">
        💤 Es <strong>domingo</strong><br><br>
        No hay sorteos ni aciertos para este día.<br>
        Elegí otra fecha.
      </td></tr>
    `;
    document.getElementById("valorTotalAciertos").textContent = `$0`;
    return;
  }

  const vendedor = String(localStorage.getItem("claveVendedor") || '').trim();

  const { data: aciertos, error } = await supabase
  .from("aciertos")
  .select("*")
  .eq("fecha", fecha)
  .eq("vendedor", vendedor)
  .order('id', { ascending: false }); // 👈 más nuevo primero

  console.log("🔑 Vendedor:", vendedor);
  console.log("📅 Fecha buscada:", fecha);
  console.log("📦 Aciertos obtenidos:", aciertos);
  console.log("❌ Error si hubo:", error);

  if (error) {
    console.error("❌ Error al buscar aciertos en Supabase:", error);
    alert("Hubo un error al consultar los aciertos");
    return;
  }

  const ordenados = (aciertos || []).slice().sort((a, b) => {
    if (a.id != null && b.id != null) return b.id - a.id;      // id desc
    const f = (b.fecha || '').localeCompare(a.fecha || '');    // fallback por fecha
    if (f !== 0) return f;
    return (b.id_ticket || 0) - (a.id_ticket || 0);            // último fallback
  });
  
  mostrarResultados(ordenados);
  window.arrayResultados = ordenados;
}

function calcularPremioUnitario(jugada, numeros, claveLoteria) {
  const cabeza = numeros[0];
  const zona5 = numeros.slice(0, 5);
  const zona10 = numeros.slice(0, 10);
  const zona20 = numeros.slice(0, 20);

  const numOriginal = jugada.numero; // tal como se cargó
const num = numOriginal.padStart(4, '0'); // lo usás para redoblonas o AMBO si querés
  const redoblona = jugada.redoblona?.padStart(2, '0');
  const posRedoblona = parseInt(jugada.posRedoblona);
  const posicion = parseInt(jugada.posicion);
  const importe = parseFloat(jugada.importe);

  let total = 0;

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

  if ([5, 10, 20].includes(posicion) && !(redoblona && posRedoblona)) {
    const zona = posicion === 5 ? zona5 : posicion === 10 ? zona10 : zona20;
  
    // 4 cifras exactas
    if (numOriginal.length === 4 && zona.includes(num)) {
      total += { 5: 700, 10: 350, 20: 175 }[posicion] * importe;
    }
  
    // 3 cifras exactas
    else if (numOriginal.length === 3 && zona.some(n => n.endsWith(num.slice(-3)))) {
      total += { 5: 120, 10: 60, 20: 30 }[posicion] * importe;
    }
  
    // 2 cifras exactas
    else if (numOriginal.length === 2 && zona.some(n => n.endsWith(num.slice(-2)))) {
      total += { 5: 14, 10: 7, 20: 3.5 }[posicion] * importe;
    }
  }

  if (redoblona && posRedoblona) {
    const premioRedoblona = calcularPremioRedoblona(jugada, numeros);
    total += premioRedoblona;
  }

  return total; // ✅ Este es el único return total al final de la función
}
function calcularPremioRedoblona(jugada, numeros, claveLoteria = '') {
  const cabeza = numeros[0];
  const zona5 = numeros.slice(0, 5);
  const zona10 = numeros.slice(0, 10);
  const zona20 = numeros.slice(0, 20);

  const num = jugada.numero; // sin padStart
  const redoblona = jugada.redoblona?.padStart(2, '0');
  const pos = parseInt(jugada.posicion);
  const posR = parseInt(jugada.posRedoblona);
  const importe = parseFloat(jugada.importe);

  const pagos = {
    "1-5": 1280,
    "1-10": 640,
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

  const zonaRedoblona =
  pos === 1 && posR === 5 ? numeros.slice(1, 6) :
  pos === 1 && posR === 10 ? numeros.slice(1, 11) :
    pos === 1 && posR === 20 ? zona20 :
    [5, 10, 20].includes(pos) && [5, 10, 20].includes(posR)
  ? zonaPorPosicion(posR, numeros)
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

    // ⚠️ USAMOS LA MISMA FUNCIÓN que en Resultados
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
// ✅ AGREGAR EXTRACTO DE PRUEBA SOLO SI NO EXISTE YA
(function agregarExtractoTest() {
  const hoy = new Date().toISOString().split('T')[0];
  const resultados = JSON.parse(localStorage.getItem('resultados')) || [];

  const yaExiste = resultados.some(r => r.fecha === hoy && r.loteria === "PRO10");
  if (!yaExiste) {
    resultados.push({
      fecha: hoy,
      loteria: "PRO10",
      numeros: [
        "1932",  // cabeza
        "9321",
        "2121",
        "4467",
        "5128",
        "8833",
        "7754",
        "6003",
        "4412",
        "8882",
        "3075",
        "1247",
        "0099",
        "6610",
        "1423",
        "7811",
        "3006",
        "7284",
        "6431",
        "2215"
      ]
    });

    localStorage.setItem('resultados', JSON.stringify(resultados));
    console.log("✅ Se agregó el extracto PRO10 para hoy");
  } else {
    console.log("🟡 El extracto PRO10 ya estaba cargado para hoy");
  }
})();
// 🕛 Verifica si ya cambió el día para "resetear visualmente"
let ultimaFechaVisual = new Date().toLocaleDateString('es-AR');

setInterval(() => {
  const ahora = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
  const hoy = new Date(ahora).toLocaleDateString('es-AR');

  if (hoy !== ultimaFechaVisual) {
    console.log("🕛 Nuevo día detectado, reiniciando visual");
    ultimaFechaVisual = hoy;

    // Limpiamos jugadasTemp y tabla visible
    jugadasTemp = [];
    const tabla = document.getElementById('listaJugadas');
    if (tabla) tabla.innerHTML = '';

    // Actualizamos fecha visible si hace falta
    const fechaSpan = document.getElementById('fechaActual');
    if (fechaSpan) fechaSpan.innerText = hoy;

    // Reiniciamos número de ticket si querés (opcional)
    // numeroTicket = 1; ← solo si querés reiniciar tickets a diario
  }
}, 15000); // chequea cada 15 segundos
// 🕚 Genera la liquidación automáticamente a las 23:00
let liquidacionYaGenerada = false;

setInterval(() => {
  const ahora = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
  const hora = new Date(ahora).getHours();
  const minutos = new Date(ahora).getMinutes();

if (hora === 23 && minutos === 0 && !liquidacionYaGenerada) {
  console.log("⏱ Generando liquidación automática de las 23:00...");
  generarLiquidacionDesdeResultados();
  setTimeout(guardarLiquidacionSupabase, 1000); // espera 1 segundo antes de subir
  liquidacionYaGenerada = true;
}

if (hora === 0 && minutos === 1) {
  liquidacionYaGenerada = false;
}
}, 30000); // 🔁 Cada 30 segundos chequea la hora
// ✅ GUARDA LA LIQUIDACIÓN EN SUPABASE
async function guardarLiquidacionSupabase() {
  const fecha = new Date().toISOString().split('T')[0];

  const liquidaciones = JSON.parse(localStorage.getItem('liquidaciones')) || [];
  const liquidacionHoy = liquidaciones.find(l => l.fecha === fecha);
  if (!liquidacionHoy) {
    console.log("🟡 No hay liquidación generada aún para guardar.");
    return;
  }

  const data = {
    fecha: liquidacionHoy.fecha,
    pasador: localStorage.getItem('claveVendedor') || 'SIN_VENDEDOR',
    total_pase: liquidacionHoy.totalPase,
    comision: liquidacionHoy.comision,
    total_aciertos: liquidacionHoy.totalAciertos,
    saldo: liquidacionHoy.saldo,
    saldo_final_arr: liquidacionHoy.saldoFinalConArrastre,
    bono_vendedor: liquidacionHoy.bonoVendedor,
    saldo_final: liquidacionHoy.saldoFinal
  };

  try {
    console.log("📤 Enviando liquidación a Supabase:", data);
    const resp = await fetch("https://agithblutrkibaydjbsl.supabase.co/rest/v1/liquidaciones", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=representation"
      },
      body: JSON.stringify(data)
    });

    if (!resp.ok) {
      const error = await resp.text();
      console.error("❌ Error al guardar liquidación:", error);
    } else {
      console.log("✅ Liquidación guardada en Supabase correctamente.");
    }
  } catch (err) {
    console.error("❌ Error inesperado al guardar en Supabase:", err);
  }
}
async function guardarAciertosEnSupabase(aciertos) {
  for (const acierto of aciertos) {
    const aciertoParaSubir = {
      ...acierto,
      ticket_id: String(acierto.ticket_id).trim(),
      pos_redoblona: acierto.posRedoblona || "-"
    };

    delete aciertoParaSubir.ticket;
    delete aciertoParaSubir.posRedoblona;

    console.log("🎯 Enviando acierto a Supabase:", aciertoParaSubir);

    const resp = await fetch("https://agithblutrkibaydjbsl.supabase.co/rest/v1/aciertos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnaXRoYmx1dHJraWJheWRqYnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NTI4MzcsImV4cCI6MjA2MzMyODgzN30.pEzQkajudq4_rOpevqp8XUCLm4AUx_XOWgWwDdBczss",
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnaXRoYmx1dHJraWJheWRqYnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NTI4MzcsImV4cCI6MjA2MzMyODgzN30.pEzQkajudq4_rOpevqp8XUCLm4AUx_XOWgWwDdBczss"
      },
      body: JSON.stringify(aciertoParaSubir)
    });

    if (!resp.ok) {
      const error = await resp.text();
      console.error("❌ Error al guardar ticket:", error);
      alert("Error al guardar el ticket en la nube");
    } else {
      const respuesta = await resp.json();
      console.log("✅ Ticket guardado correctamente:", respuesta);
    }
  }
}

function mostrarResultados(aciertos) {
  const tabla = document.getElementById("tablaAciertos");
  const total = aciertos.reduce((suma, a) => suma + parseFloat(a.acierto), 0);
  document.getElementById("valorTotalAciertos").textContent = `$${total.toLocaleString('es-AR')}`;

  if (aciertos.length === 0) {
    tabla.innerHTML = `
      <tr><td colspan="8" style="text-align:center; padding: 12px;">No hubo aciertos en esta fecha</td></tr>
    `;
    return;
  }

  tabla.innerHTML = "";
  aciertos.forEach((a, i) => {
    tabla.innerHTML += `
      <tr>
        <td style="text-align:center;">${a.numero_ticket || a.ticket_id || a.ticket || "-"}</td>
        <td style="text-align:center;">${a.loteria}</td>
        <td style="text-align:center;">${a.numero}</td>
        <td style="text-align:center;">${a.posicion}</td>
        <td style="text-align:center;">${a.redoblona !== "-" ? a.redoblona : ""}</td>
        <td style="text-align:center;">${a.pos_redoblona !== "-" ? a.pos_redoblona : ""}</td>
        <td style="text-align:center;">$${parseFloat(a.importe).toLocaleString('es-AR')}</td>
        <td style="text-align:center; font-weight:bold">$${parseFloat(a.acierto).toLocaleString('es-AR')}</td>
      </tr>
    `;
  });
}
async function actualizarPremiosDesdeResultados() {
  const { data: resultados } = await supabase
    .from('resultados')
    .select('*');

  if (!resultados) return;

  const jugadasGuardadas = JSON.parse(localStorage.getItem('jugadasEnviadas') || '[]');
  const jugadasActualizadas = [];

  for (let jugada of jugadasGuardadas) {
    let totalPremio = 0;
    let nuevosPremios = [];

    for (let grupo of jugada.loterias) {
      const codigoLoteria = grupo.codigo;
      const resultado = resultados.find(r => r.loteria === codigoLoteria && r.fecha === jugada.fecha);

      if (!resultado) continue;

      const numerosGanadores = resultado.posiciones;

      for (let j of grupo.jugadas) {
        let premio = 0;
        let numero = j.numero.padStart(4, '0');

        // Revisión normal
        const index = numerosGanadores.indexOf(numero);
        if (index !== -1) {
          const posicion = parseInt(j.posicion);
          const posGanadora = index + 1;
          if (posicion === posGanadora || [1, 5, 10, 15, 20].includes(posGanadora)) {
            premio += calcularPremio(posGanadora, j.importe);
          }
        }

        // Revisión redoblona
        if (j.redoblona && j.posRedoblona) {
          const redobloNum = j.redoblona.padStart(2, '0');
          const redobloIndex = numerosGanadores.indexOf(redobloNum);
          if (redobloIndex !== -1) {
            const posRedoblona = redobloIndex + 1;
            const tipo = `${j.posicion}-${j.posRedoblona}`;
            const pago = calcularPremioRedoblona(j.numero, j.redoblona, tipo, numerosGanadores);
            premio += pago * parseFloat(j.importe);
          }
        }

        if (premio > 0) {
          nuevosPremios.push({
            numero: j.numero,
            importe: j.importe,
            premio
          });
          totalPremio += premio;
        }
      }
    }

    jugada.premios = nuevosPremios;
    jugada.totalPremio = totalPremio;
    jugadasActualizadas.push(jugada);
  }

  localStorage.setItem('jugadasEnviadas', JSON.stringify(jugadasActualizadas));
  console.log("✅ Jugadas reevaluadas y premios actualizados.");
}
document.addEventListener('click', (e) => {
  const boton = e.target.closest('.btn-vaciar');
  if (!boton) return;

  console.log("🧹 Botón 'Vaciar' presionado");
  if (confirm("¿Vaciar todas las jugadas cargadas?")) {
    jugadasTemp = [];
    const lista = document.getElementById('listaJugadas');
    if (lista) lista.innerHTML = '';
  }
});
async function cambiarContrasena() {
  const actual = document.getElementById('claveActual').value.trim();
  const nueva1 = document.getElementById('claveNueva1').value.trim();
  const nueva2 = document.getElementById('claveNueva2').value.trim();
  const mensaje = document.getElementById('mensajeClave');

  if (!actual || !nueva1 || !nueva2) {
    mensaje.style.color = '#ffcc00';
    mensaje.textContent = '⚠️ Completá todos los campos.';
    return;
  }

  const usuario = localStorage.getItem('claveVendedor');

  // 🔍 Buscar en Supabase si coincide la clave actual
  const { data: usuarioData, error: fetchError } = await supabase
    .from('usuarios')
    .select('clave')
    .eq('usuario', usuario)
    .single();

  if (fetchError || !usuarioData) {
    mensaje.style.color = 'orange';
    mensaje.textContent = '⚠️ Error al verificar la clave actual.';
    return;
  }

  if (usuarioData.clave !== actual) {
    mensaje.style.color = '#ff3333';
    mensaje.textContent = '❌ La contraseña actual es incorrecta.';
    return;
  }

  if (nueva1 !== nueva2) {
    mensaje.style.color = '#ff6600';
    mensaje.textContent = '❌ Las nuevas contraseñas no coinciden.';
    return;
  }

  // ✅ Actualizar en Supabase
  const { error: updateError } = await supabase
    .from('usuarios')
    .update({ clave: nueva1 })
    .eq('usuario', usuario);

  if (updateError) {
    mensaje.style.color = 'red';
    mensaje.textContent = '❌ Error al actualizar la contraseña.';
  } else {
    mensaje.style.color = '#00ff00';
    mensaje.textContent = '✅ Contraseña cambiada correctamente.';
    localStorage.setItem('claveVendedor', nueva1); // opcional, actualiza local también
  }
}
// === UI helper: botón "Monto total" (al lado de Seleccioná los sorteos) ===
function setupMontoTotalUI() {
  const btn = document.getElementById('btnMontoTotal');
  const importeInput = document.querySelectorAll('.jugada-inputs input')[2]; // campo Importe
  if (!btn || !importeInput) return;

  // estado inicial
  if (!window.__MTicket) window.__MTicket = { activo: false, total: 0 };
  const savedOn = localStorage.getItem('montoTotalActivo') === '1';
  const savedVal = Number(localStorage.getItem('montoTotalValor') || 0);
  window.__MTicket.activo = savedOn;
  window.__MTicket.total  = savedVal > 0 ? savedVal : 0;
  let captured = savedVal > 0;

  function paint(on) {
    btn.style.backgroundColor = on ? '#2ecc71' : '#444';
    btn.style.borderColor = on ? '#27ae60' : '#777';
    const tot = Number(window.__MTicket?.total || 0);
    btn.textContent = on
      ? (tot > 0 ? `Total: $${tot}` : 'Monto total: ON')
      : 'Monto total';
  }
  paint(window.__MTicket.activo);

  // toggle
  btn.addEventListener('click', () => {
    const next = !window.__MTicket.activo;
    window.__MTicket.activo = next;
    if (!next) {
      window.__MTicket.total = 0;
      localStorage.removeItem('montoTotalValor');
      captured = false;
    }
    localStorage.setItem('montoTotalActivo', next ? '1' : '0');
    paint(next);
      // 🔒 Exclusivo: si se activó Monto total, apago "Dividir monto"
  if (next) {
    try { desactivarDividirMonto(); } catch (_) {}
  }
  });

  // capturar el primer importe como total cuando esté activo
  importeInput.addEventListener('change', () => {
    if (!window.__MTicket.activo || captured) return;
    const v = parseFloat(importeInput.value);
    if (Number.isFinite(v) && v > 0) {
      window.__MTicket.total = v;
      localStorage.setItem('montoTotalValor', String(v));
      captured = true;
      paint(true);
    }
  });
}
// === Apagar Monto total y resetear UI ===
function desactivarMontoTotal() {
  window.__MTicket = window.__MTicket || { activo: false, total: 0 };
  window.__MTicket.activo = false;
  window.__MTicket.total = 0;

  localStorage.removeItem('montoTotalActivo');
  localStorage.removeItem('montoTotalValor');

  const btn = document.getElementById('btnMontoTotal');
  if (btn) {
    btn.style.backgroundColor = '#444';
    btn.style.borderColor = '#777';
    btn.textContent = 'Monto total';
  }
}
// === UI helper: botón "Dividir monto" (sin checkbox visible) ===
function updateDividirBtnUI(active) {
  const btn = document.getElementById('btnDividirMonto');
  if (!btn) return;
  btn.style.backgroundColor = active ? '#2ecc71' : '#444';
  btn.style.borderColor = active ? '#27ae60' : '#777';
  btn.textContent = active ? 'Dividir monto: ON' : 'Dividir monto';
}

function setupDividirMontoUI() {
  const btn = document.getElementById('btnDividirMonto');
  const chk = document.getElementById('dividirMonto'); // sigue existiendo, pero oculto
  if (!btn || !chk) return;

  // estado inicial
  const saved = localStorage.getItem('dividirMontoActivo');
  const initialActive = saved === '1' || (saved === null && !!chk.checked);
  chk.checked = !!initialActive;
  updateDividirBtnUI(chk.checked);

  // click del botón -> alterna estado del checkbox oculto, persiste y notifica
  btn.addEventListener('click', () => {
    chk.checked = !chk.checked;
    localStorage.setItem('dividirMontoActivo', chk.checked ? '1' : '0');
    updateDividirBtnUI(chk.checked);
    // Por si hay listeners existentes sobre el checkbox
    try { chk.dispatchEvent(new Event('change')); } catch (_) {}
      // 🔒 Exclusivo: si se activó Dividir monto, apago "Monto total"
  if (chk.checked) {
    try { desactivarMontoTotal(); } catch (_) {}
  }
  });

  // si por alguna razón alguien modifica el checkbox por código, sincronizamos
  chk.addEventListener('change', () => {
    localStorage.setItem('dividirMontoActivo', chk.checked ? '1' : '0');
    updateDividirBtnUI(chk.checked);
    if (chk.checked) { try { desactivarMontoTotal(); } catch (_) {} }
  });
    // 🧹 Si quedaron ambos activos por storage viejo, priorizo "Monto total"
    try {
      const mtOn = !!(window.__MTicket && window.__MTicket.activo);
      if (mtOn && chk.checked) desactivarDividirMonto();
    } catch (_) {}
}
// === ENTER en la fecha -> click en Enviar (parche local y seguro)
(function wireFiltroFechaLocal(){
  const fecha = document.querySelector('#filtroFecha');
  const btn   = document.querySelector('#btnEnviar');

  console.log('[WIRE filtroFecha] fecha=', !!fecha, 'btn=', !!btn);
  if (!fecha || !btn) return;

  if (!fecha.__wiredEnterLocal){
    fecha.__wiredEnterLocal = true;
    fecha.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.code === 'Enter' || e.key === 'NumpadEnter' || e.code === 'NumpadEnter'){
        e.preventDefault();
        console.log('[ENTER filtroFecha] disparo click en #btnEnviar');
        btn.click();
      }
    });
  }
})();
// === Apagar "Dividir monto" y resetear UI ===
function desactivarDividirMonto() {
  const chk = document.getElementById('dividirMonto'); // el checkbox (aunque esté oculto)
  if (chk) {
    chk.checked = false;
    // persistencia
    try { localStorage.setItem('dividirMontoActivo', '0'); } catch (_) {}
  }
  // botón verde/gris
  try { updateDividirBtnUI(false); } catch (_) {}
}
/* ========== ENTER GLOBAL (incluye NumpadEnter) ========== */
(function () {
  const isEnter = (e) =>
    e.key === 'Enter' || e.code === 'Enter' ||
    e.key === 'NumpadEnter' || e.code === 'NumpadEnter';

  // 1) Log mínimo (sirve para ver qué input lo dispara)
  console.info('%c[ENTER-HOOK] inicializado','color:#0f0');
  document.addEventListener('keydown', (e) => {
    if (!isEnter(e)) return;
    const t = e.target || {};
    console.log('[ENTER]', { id: t.id, name: t.name, tag: t.tagName, type: t.type, code: e.code });
  }, true);

  // 2) Helper: Enter en un input -> click en un botón
  function wireEnterClick(inputSel, buttonSel){
    const el  = document.querySelector(inputSel);
    const btn = typeof buttonSel === 'string' ? document.querySelector(buttonSel) : buttonSel;
    if (!el)  { console.warn('[wireEnterClick] no existe', inputSel); return; }
    if (!btn) { console.warn('[wireEnterClick] no existe', buttonSel); return; }
    if (el.__wiredEnter) return;
    el.__wiredEnter = true;
    el.addEventListener('keydown',(e)=>{
      if (!isEnter(e)) return;
      e.preventDefault();
      console.log('[ENTER] wireEnterClick =>', inputSel, '→', buttonSel);
      btn.click();
    });
  }

  // 3) Helper: Enter en un input -> ejecuta una función
  function wireEnterRun(inputSel, fn){
    const el = document.querySelector(inputSel);
    if (!el){ console.warn('[wireEnterRun] no existe', inputSel); return; }
    if (el.__wiredEnterRun) return;
    el.__wiredEnterRun = true;
    el.addEventListener('keydown',(e)=>{
      if (!isEnter(e)) return;
      e.preventDefault();
      try { fn(); } catch(err){ console.error('wireEnterRun error', err); }
    });
  }

  // 4) Regla genérica: si es un input de FECHA, Enter busca el botón más cercano
  function genericDateEnter(e){
    if (!isEnter(e)) return;
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;

    const looksLikeDateId = /fecha/i.test(t.id || '') || /fecha/i.test(t.name || '');
    const isDateType      = (t.type || '').toLowerCase() === 'date';

    if (!(isDateType || looksLikeDateId)) return;

    // Busco un botón cercano dentro del bloque/section/form
    let scope = t.closest('form, section, .card, .box, div') || document;
    let btn =
      scope.querySelector('button#btnEnviar, input#btnEnviar') ||
      scope.querySelector('button#jv_buscar, input#jv_buscar') ||
      scope.querySelector('button#adm_refrescar, input#adm_refrescar') ||
      scope.querySelector('button#pas_run, input#pas_run') ||
      scope.querySelector('button[type="submit"], input[type="submit"]') ||
      scope.querySelector('button, input[type="button"]');

    if (btn){
      e.preventDefault();
      console.log('[ENTER→GENÉRICO] Click en', btn.id || btn.textContent?.trim());
      btn.click();
    } else {
      console.warn('[ENTER→GENÉRICO] No encontré botón cercano para', t.id || t.name);
    }
  }
  document.addEventListener('keydown', genericDateEnter, true);

  /* ========== Cableados concretos (si existen esos IDs) ========== */

  function wireAll(){
    // LOGIN: usuario → focus en clave; clave → click login
    const usuario = document.querySelector('#usuario');
    const clave   = document.querySelector('#clave');
    const btnLog  = document.querySelector('#btnLogin');
    if (usuario && !usuario.__goClave){
      usuario.__goClave = true;
      usuario.addEventListener('keydown', (e)=>{
        if (!isEnter(e)) return;
        if (clave){ e.preventDefault(); clave.focus(); }
      });
    }
    if (clave && btnLog) wireEnterClick('#clave', '#btnLogin');

    // ADMIN filtros
    if (document.querySelector('#adm_desde') && document.querySelector('#adm_refrescar'))
      wireEnterClick('#adm_desde', '#adm_refrescar');
    if (document.querySelector('#adm_hasta') && document.querySelector('#adm_refrescar'))
      wireEnterClick('#adm_hasta', '#adm_refrescar');

    // SUBPANEL PASADOR
    if (document.querySelector('#pas_desde') && document.querySelector('#pas_run'))
      wireEnterClick('#pas_desde', '#pas_run');
    if (document.querySelector('#pas_hasta') && document.querySelector('#pas_run'))
      wireEnterClick('#pas_hasta', '#pas_run');

    // JUGADAS ENVIADAS
    if (document.querySelector('#jv_desde') && document.querySelector('#jv_buscar'))
      wireEnterClick('#jv_desde', '#jv_buscar');
    if (document.querySelector('#jv_hasta') && document.querySelector('#jv_buscar'))
      wireEnterClick('#jv_hasta', '#jv_buscar');

    // PANEL VENDEDOR (tu campo de arriba “fecha del día”)
    if (document.querySelector('#filtroFecha') && document.querySelector('#btnEnviar'))
      wireEnterClick('#filtroFecha', '#btnEnviar');
    if (document.querySelector('#buscarFecha') && document.querySelector('#btnEnviar'))
      wireEnterClick('#buscarFecha', '#btnEnviar');

    // Reclamos: Enter en fecha ⇒ listar
    if (document.querySelector('#recFecha'))
      wireEnterRun('#recFecha', ()=>{ try{ listarReclamosDia(); }catch(_){} });
  }

  // Engancho ahora y cada vez que se agregue algo al DOM
  document.addEventListener('DOMContentLoaded', wireAll);
  new MutationObserver(wireAll).observe(document.documentElement, { childList:true, subtree:true });
})();
/* ========== PATCH: Enter para LOGIN (robusto) ========== */
(function loginEnterPatch(){
  const isEnter = (e) =>
    e.key === 'Enter' || e.code === 'Enter' ||
    e.key === 'NumpadEnter' || e.code === 'NumpadEnter';

  function doLogin(){
    const scope =
      document.querySelector('#clave')?.closest('form, .card, .box, div') ||
      document;
    const btn =
      scope.querySelector('#btnLogin, #btnIngresar, .btn-login, button[type="submit"]');
    if (btn) { btn.click(); return true; }
    if (typeof window.login === 'function')         { window.login(); return true; }
    if (typeof window.iniciarSesion === 'function') { window.iniciarSesion(); return true; }
    console.warn('[ENTER-LOGIN] No encontré botón ni función de login');
    return false;
  }

  function wire(){
    const u = document.querySelector('#usuario');
    const p = document.querySelector('#clave');

    if (u && !u.__loginWire){
      u.__loginWire = true;
      u.addEventListener('keydown', (e)=>{
        if (!isEnter(e)) return;
        e.preventDefault();
        if (p) p.focus();
      });
    }

    if (p && !p.__loginWire){
      p.__loginWire = true;
      p.addEventListener('keydown', (e)=>{
        if (!isEnter(e)) return;
        e.preventDefault();
        doLogin();
      });
    }
  }

  // engancho ahora y también si el DOM cambia
  document.addEventListener('DOMContentLoaded', wire);
  new MutationObserver(wire).observe(document.documentElement, { childList:true, subtree:true });
})();
// ====== Fallback robusto para #filtroFecha ======
(function(){
  const isEnter = (e)=> e.key==='Enter' || e.code==='Enter' || e.key==='NumpadEnter' || e.code==='NumpadEnter';

  function clickNearestBuscar(input){
    // 1) Intento por id comunes
    let btn = input.closest('form, .card, .box, .contenedor, body')
      ?.querySelector('#btnEnviar, #btnBuscar, .btn-buscar, button[type="submit"]');

    // 2) Si no hay, busco un botón visible que diga "Buscar" o "Enviar"
    if (!btn){
      const candidates = [...(input.closest('form, .card, .box, .contenedor, body')||document).querySelectorAll('button, input[type="button"], input[type="submit"]')];
      btn = candidates.find(b => /buscar|enviar/i.test((b.innerText||b.value||'').trim()));
    }

    if (btn){ btn.click(); return true; }
    console.warn('[ENTER→GENÉRICO] No encontré botón cercano para filtroFecha');
    return false;
  }

  function wireFiltro(){
    const f = document.querySelector('#filtroFecha');
    if (!f || f.__wiredFiltroFecha) return;
    f.__wiredFiltroFecha = true;
    f.addEventListener('keydown', (e)=>{
      if (!isEnter(e)) return;
      e.preventDefault();
      clickNearestBuscar(f);
    });
  }

  document.addEventListener('DOMContentLoaded', wireFiltro);
  new MutationObserver(wireFiltro).observe(document.documentElement, { childList:true, subtree:true });
})();
// === Mobile Tabs (clona .tabs al drawer inferior y agrega botón ☰) ===
(function () {
  // no molestar en pantallas grandes
  if (window.matchMedia('(min-width: 901px)').matches) return;

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