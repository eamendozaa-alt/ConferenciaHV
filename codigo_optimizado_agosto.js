// ── Reloj ──────────────────────────────────────────
(function tick(){
  var el = document.getElementById("reloj-kiosko")
  if(el){
    var d = new Date()
    el.textContent = String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")
  }
  setTimeout(tick, 1000)
})()

// ── Forzar favicon ─────────────────────────────────
;(function(){
  function setFavicon(){
    document.querySelectorAll("link[rel*='icon']").forEach(function(el){ el.remove() })
    var link = document.createElement("link")
    link.rel = "icon"; link.type = "image/png"
    link.href = "https://i.imgur.com/p4njU2F.png"
    document.head.appendChild(link)
  }
  var counter = 0
  var interval = setInterval(function(){
    setFavicon(); counter++
    if(counter > 10) clearInterval(interval)
  }, 100)
})()


/* ══════════════════════════════════════════════════════
   CONFIGURACIÓN GLOBAL — API
   ── Cambia solo aquí si regeneras la API Key ──
══════════════════════════════════════════════════════ */
window._KNACK_APP_ID  = "69b6cecc75507ff4b82400f9"
window._KNACK_API_KEY = "a3da62b8-069b-4f3a-9ae2-9df9f5974d4d"

// ── DIAGNÓSTICO TEMPORAL — verificar soporte de BarcodeDetector ──
// Para usar: en la barra de direcciones del navegador (no en una pestaña
// nueva), borra todo y escribe exactamente:
//   javascript:window._diagBarcode()
// y presiona Ir/Enter. Muestra el resultado con alert(), funciona en
// cualquier navegador sin necesitar consola ni inspector remoto.
// Quitar este bloque una vez resuelto el diagnóstico del iPhone.
window._diagBarcode = function(){
  let msg = "BarcodeDetector existe: " + (typeof BarcodeDetector !== "undefined" ? "SÍ" : "NO") + "\n"
  msg += "Navegador: " + navigator.userAgent.substring(0,80) + "\n"
  if(typeof BarcodeDetector !== "undefined"){
    BarcodeDetector.getSupportedFormats().then(function(formats){
      alert(msg + "Formatos: " + formats.join(", ") + "\nSoporta QR: " + (formats.includes("qr_code") ? "SÍ" : "NO"))
    }).catch(function(e){
      alert(msg + "Error consultando formatos: " + e.message)
    })
  } else {
    alert(msg)
  }
}

// Botón visible en pantalla — alternativa al método de barra de
// direcciones (bloqueado en algunos navegadores). Se inyecta una sola vez.
function inyectarBotonDiagnostico(){
  if(document.getElementById("btn-diag-temp")) return
  const reader = document.getElementById("reader")
  if(!reader) return
  const btn = document.createElement("button")
  btn.id = "btn-diag-temp"
  btn.textContent = "🔧 Diagnóstico cámara (temporal)"
  btn.style.cssText = "margin-top:8px;padding:10px;width:100%;background:#f59e0b;color:#000;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer"
  btn.addEventListener("click", function(){ window._diagBarcode() })
  reader.parentNode.insertBefore(btn, reader.nextSibling)
}

// ── fetchSafe: fetch con reintento automático en 429 ──
window._fetchSafe = function(url, opciones, intentos){
  intentos = intentos || 0
  return fetch(url, opciones).then(function(r){
    if(r.status === 429){
      if(intentos < 4){
        var delay = 3000 * (intentos + 1)
        console.warn("429 rate limit — reintentando en " + delay + "ms (intento " + (intentos+1) + "/4)")
        return new Promise(function(resolve){
          setTimeout(function(){ resolve(window._fetchSafe(url, opciones, intentos + 1)) }, delay)
        })
      }
      throw new Error("Rate limit agotado después de 4 intentos")
    }
    return r
  })
}


/* ══════════════════════════════════════════════════════
   PARTE 1 — ESCÁNER QR
   ── Evento hardcodeado, sin llamada a object_7 ──
   ── fetchSafe con reintentos automáticos en 429 ──
══════════════════════════════════════════════════════ */

$.getScript("https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js", function(){

const APP_ID   = window._KNACK_APP_ID
const API_KEY  = window._KNACK_API_KEY
const HDR      = {"X-Knack-Application-Id":APP_ID,"X-Knack-REST-API-Key":API_KEY}
const HDR_JSON = Object.assign({"Content-Type":"application/json"},HDR)

let scannerIniciado     = false
let ultimoEscaneo       = ""
let tiempoUltimoEscaneo = 0
let contadorEvento      = 0
let registradosEvento   = {}
let html5QrCode         = null
let eventoActual        = ""
let procesando          = false

function initKiosko(){
  if(!document.getElementById("reader")) return
  poblarSelectorEvento()
  inyectarBotonDiagnostico()
  if(scannerIniciado) return
  scannerIniciado = true
  html5QrCode = new Html5Qrcode("reader")
  cargarCamaras()
}

$(document).on("knack-view-render.any", initKiosko)
$(document).on("knack-scene-render.any", function(){ setTimeout(initKiosko, 500) })

function poblarSelectorEvento(){
  const sel = document.getElementById("selector-evento")
  if(!sel || sel.options.length > 1) return

  // El nombre del evento sigue fijo (evita 1 llamada), pero el número de
  // inscritos sí se consulta porque cambia con el tiempo (field_63 en object_7)
  const o = document.createElement("option")
  o.value = "Conferencia de Hombres Vencedores"
  o.text  = "Conferencia de Hombres Vencedores"
  o.dataset.inscritos = 0
  sel.appendChild(o)

  const filtrosEvento = encodeURIComponent('[{"field":"field_60","operator":"is","value":"Conferencia de Hombres Vencedores"}]')
  window._fetchSafe("https://api.knack.com/v1/objects/object_7/records?rows_per_page=1&filters="+filtrosEvento, {headers:HDR})
  .then(r=>r.json())
  .then(data=>{
    if(!data.records || !data.records.length) return
    const inscritos = data.records[0].field_63 || 0
    o.dataset.inscritos = inscritos
    // Si el evento ya está seleccionado, refrescamos el contador con el dato actualizado
    if(eventoActual === o.value){
      cargarEstadisticasEvento(eventoActual, o)
    }
  })
  .catch(err=>console.error("Error cargando total de inscritos:", err))

  sel.addEventListener("change", function(){
    eventoActual = this.value
    const badge    = document.getElementById("badge-evento")
    const stats    = document.getElementById("evento-stats")
    const lista    = document.getElementById("lista-asistencia")
    const selected = this.options[this.selectedIndex]
    if(eventoActual){
      if(badge){ badge.style.display="inline-block"; badge.textContent="✓ "+eventoActual }
      if(stats) stats.textContent = eventoActual
      if(lista) lista.innerHTML = ""
      if(!registradosEvento[eventoActual]) registradosEvento[eventoActual] = new Set()
      cargarEstadisticasEvento(eventoActual, selected)
      setMensaje("Evento: "+eventoActual+" — Listo para escanear","#22c55e")
    } else {
      if(badge) badge.style.display = "none"
      if(stats) stats.textContent = "Sin evento seleccionado"
      if(lista) lista.innerHTML = ""
      actualizarContador(0)
      actualizarEstadisticas(0,0,0)
      setMensaje("Selecciona un evento para comenzar","#64748b")
    }
  })
}

function cargarEstadisticasEvento(evento, selectedOption){
  actualizarContador("...")
  actualizarEstadisticas("...","...","...")
  const inscritos = parseInt(selectedOption ? selectedOption.dataset.inscritos : 0) || 0
  const filters = encodeURIComponent('[{"field":"field_40","operator":"is","value":"'+evento+'"}]')
  window._fetchSafe("https://api.knack.com/v1/objects/object_4/records?rows_per_page=1&page=1&filters="+filters, {headers:HDR})
  .then(r=>r.json())
  .then(data=>{
    const llegaron = data.total_records || 0
    const faltan   = Math.max(0, inscritos - llegaron)
    contadorEvento = llegaron
    actualizarContador(llegaron)
    actualizarEstadisticas(llegaron, inscritos, faltan)
  })
  .catch(()=>{ actualizarContador(0); actualizarEstadisticas(0,0,0) })
}

function actualizarContador(n){
  const el = document.getElementById("contador-asistencia")
  if(el) el.textContent = n
  if(typeof n === "number") contadorEvento = n
}

function actualizarEstadisticas(llegaron, inscritos, faltan){
  const el = document.getElementById("stats-detalle")
  if(!el) return
  el.innerHTML = `
    <div style="display:flex;justify-content:space-around;margin-top:8px;gap:6px">
      <div style="text-align:center">
        <div style="font-size:22px;font-weight:800;color:#22c55e">${llegaron}</div>
        <div style="font-size:9px;color:#7dd3fc;letter-spacing:.5px">LLEGARON</div>
      </div>
      <div style="text-align:center;border-left:1px solid rgba(255,255,255,.2);border-right:1px solid rgba(255,255,255,.2);padding:0 10px">
        <div style="font-size:22px;font-weight:800;color:#fff">${inscritos}</div>
        <div style="font-size:9px;color:#7dd3fc;letter-spacing:.5px">INSCRITOS</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:22px;font-weight:800;color:#f87171">${faltan}</div>
        <div style="font-size:9px;color:#7dd3fc;letter-spacing:.5px">FALTAN</div>
      </div>
    </div>
  `
}

function cargarCamaras(){
  Html5Qrcode.getCameras().then(devices=>{
    const sel = document.getElementById("selector-camara")
    if(!sel) return
    sel.innerHTML = ""
    devices.forEach((d,i)=>{
      const o = document.createElement("option")
      o.value = d.id; o.text = d.label||"Cámara "+(i+1)
      sel.appendChild(o)
    })
    if(devices.length){ iniciarScanner(devices[0].id); sel.value = devices[0].id }
    sel.addEventListener("change", function(){ cambiarCamara(this.value) })
  })
}

function iniciarScanner(id){
  // useBarCodeDetectorIfSupported: la propia librería hace feature-detection
  // en tiempo real — si el navegador soporta la API nativa BarcodeDetector
  // (Safari moderno en iOS la trae, es el mismo motor que usa la app Cámara
  // nativa de Apple, confirmado funcionando con el QR de prueba), la usa
  // para decodificar. Si no está disponible (Android viejo, navegador sin
  // soporte), cae automáticamente al decodificador JS normal de la
  // librería — el mismo que ya funciona hoy en Android. No requiere que
  // nosotros detectemos el dispositivo: el propio html5-qrcode pregunta al
  // navegador y decide. fps, qrbox y videoConstraints quedan exactamente
  // igual que la base confirmada funcionando, sin tocarlos.
  html5QrCode.start(id,{
    fps:30,
    qrbox:function(w,h){
      const s = Math.floor(Math.min(w,h)*.75)
      return {width:s,height:s}
    },
    useBarCodeDetectorIfSupported: true
  },onScanSuccess)
}

function cambiarCamara(id){ html5QrCode.stop().then(()=>iniciarScanner(id)) }

// ── Apagar/encender cámara según visibilidad de la página ──
// Antes la cámara seguía encendida (consumiendo batería) si el operador
// salía al menú de Reporte, Admin Panel, o minimizaba/cambiaba de pestaña.
let camaraActivaId   = null  // guarda el id de la cámara que estaba corriendo
let camaraDetenida   = false // evita doble-stop o doble-start

document.addEventListener("visibilitychange", function(){
  if(!html5QrCode) return

  if(document.hidden){
    // Página oculta (otra pestaña, otro menú, minimizado) → apagar cámara
    if(!camaraDetenida){
      const sel = document.getElementById("selector-camara")
      camaraActivaId = sel ? sel.value : null
      html5QrCode.stop().then(function(){
        camaraDetenida = true
      }).catch(function(){ /* ya estaba detenida, no pasa nada */ })
    }
  } else {
    // Página visible de nuevo → reencender con la misma cámara de antes
    if(camaraDetenida && camaraActivaId){
      iniciarScanner(camaraActivaId)
      camaraDetenida = false
    }
  }
})

function onScanSuccess(qr){
  qr = qr.trim()
  const ahora = Date.now()
  if(qr===ultimoEscaneo && ahora-tiempoUltimoEscaneo<1500) return
  if(procesando) return
  ultimoEscaneo = qr
  tiempoUltimoEscaneo = ahora
  if(!eventoActual){ errorEscaneo("SELECCIONA EVENTO","Selecciona un tipo de evento primero"); return }
  buscarParticipante(qr)
}

// ── Caché en memoria de participantes ya consultados ──
// Evita re-llamar a object_5 si el mismo QR se escanea más de una vez
// (re-escaneo accidental, operador que repite, etc). Se limpia al recargar la página.
let cacheParticipantes = {}

function buscarParticipante(qr){
  procesando = true

  // Si ya consultamos este QR antes en esta sesión, usamos el caché
  // y nos saltamos directo a verificar asistencia (ahorra 1 llamada completa)
  if(cacheParticipantes[qr]){
    const cached = cacheParticipantes[qr]
    setMensaje("🔎 Verificando...","#38bdf8")
    mostrarParticipante(cached.nombre, cached.foto, cached.zona, cached.encargado)
    if(!registradosEvento[eventoActual]) registradosEvento[eventoActual] = new Set()
    if(registradosEvento[eventoActual].has(cached.id)){
      procesando=false; errorEscaneo("YA REGISTRADO","Ya registrado en "+eventoActual); return
    }
    verificarAsistenciaYRegistrar(cached.id, cached.nombre, cached.foto, cached.zona, cached.encargado, qr, cached.listaEventos)
    return
  }

  setMensaje("🔎 Buscando...","#38bdf8")
  // Esta única llamada trae nombre, foto, zona, encargado Y los eventos inscritos
  // (field_62_raw) — antes esto requería una segunda llamada a /records/{id}
  const url = "https://api.knack.com/v1/objects/object_5/records?filters="+
    encodeURIComponent('[{"field":"field_34","operator":"is","value":"'+qr+'"}]')
  window._fetchSafe(url,{headers:HDR}).then(r=>r.json()).then(data=>{
    if(!data.records||!data.records.length){
      procesando=false; errorEscaneo("NO ENCONTRADO","Participante no encontrado"); return
    }
    const p = data.records[0]
    const id = p.id
    const nombre = p.field_29||"Sin nombre"
    const zona = p.field_37||""
    const encargado = p.field_35||""
    const foto = obtenerFoto(p)

    const eventosInscritos = p.field_62_raw || p.field_62 || []
    const listaEventos = Array.isArray(eventosInscritos)
      ? eventosInscritos.map(e=> typeof e === "object" ? (e.identifier||e.name||"") : String(e))
      : String(eventosInscritos).split(",").map(e=>e.trim())

    // Guardamos en caché para futuros escaneos del mismo QR en esta sesión
    cacheParticipantes[qr] = { id, nombre, zona, encargado, foto, listaEventos }

    mostrarParticipante(nombre,foto,zona,encargado)
    if(!registradosEvento[eventoActual]) registradosEvento[eventoActual] = new Set()
    if(registradosEvento[eventoActual].has(id)){
      procesando=false; errorEscaneo("YA REGISTRADO","Ya registrado en "+eventoActual); return
    }
    verificarAsistenciaYRegistrar(id,nombre,foto,zona,encargado,qr,listaEventos)
  }).catch(()=>{ procesando=false; errorEscaneo("ERROR RED","Error de conexión") })
}

function verificarAsistenciaYRegistrar(id,nombre,foto,zona,encargado,qr,listaEventos){
  if(!listaEventos.includes(eventoActual)){
    procesando=false; errorEscaneo("NO INSCRITO","No inscrito en "+eventoActual); return
  }
  setMensaje("🔎 Verificando asistencia...","#38bdf8")
  // Esta llamada sigue siendo necesaria — consulta object_4 (tabla distinta)
  // y previene duplicados aunque dos celulares escaneen al mismo participante casi a la vez
  const urlAsist = "https://api.knack.com/v1/objects/object_4/records?filters="+
    encodeURIComponent('[{"field":"field_38","operator":"is","value":"'+id+'"}]')
  window._fetchSafe(urlAsist,{headers:HDR}).then(r=>r.json()).then(data=>{
    const yaExiste = (data.records||[]).some(r=>(r.field_40||"")===eventoActual)
    if(yaExiste){
      registradosEvento[eventoActual].add(id)
      procesando=false; errorEscaneo("YA REGISTRADO","Ya registrado en "+eventoActual); return
    }
    registrarAsistencia(id,nombre,foto,zona,encargado,qr)
  }).catch(()=>{ procesando=false; errorEscaneo("ERROR RED","Error verificando asistencia") })
}

function registrarAsistencia(id,nombre,foto,zona,encargado,qr){
  window._fetchSafe("https://api.knack.com/v1/objects/object_4/records",{
    method:"POST", headers:HDR_JSON,
    body:JSON.stringify({field_38:id, field_42:qr, field_40:eventoActual})
  }).then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.json() })
  .then(()=>{
    registradosEvento[eventoActual].add(id)
    procesando = false
    beepOk()
    semaforoVerde("✔ "+nombre)
    voz("Bienvenido "+nombre)
    setMensaje("✔ "+nombre+" — "+eventoActual,"#22c55e")
    agregarLista(nombre,foto,zona)
    contadorEvento++
    actualizarContador(contadorEvento)

    // ── Refresco del servidor cada 15 registros, no en cada uno ──
    // El contador local (líneas de arriba) ya es exacto en tiempo real.
    // Esta llamada solo corrige el total cada cierto número de personas,
    // útil por si dos celulares registran al mismo participante casi a la
    // vez (caso ya cubierto por verificarAsistenciaYRegistrar) o por
    // cualquier desfase menor. Antes se llamaba en cada registro.
    if(contadorEvento % 15 === 0){
      const sel = document.getElementById("selector-evento")
      if(sel && sel.selectedIndex > 0){
        cargarEstadisticasEvento(eventoActual, sel.options[sel.selectedIndex])
      }
    }
  }).catch(()=>{ procesando=false; errorEscaneo("ERROR","No se pudo registrar") })
}

function obtenerFoto(p){
  if(p.field_33&&p.field_33.url) return p.field_33.url
  if(p.field_33_raw&&p.field_33_raw.url) return p.field_33_raw.url
  if(Array.isArray(p.field_33)&&p.field_33.length) return p.field_33[0].url
  return "https://cdn-icons-png.flaticon.com/512/149/149071.png"
}

function mostrarParticipante(nombre,foto,zona,encargado){
  const el = document.getElementById("panel-alumno")
  if(!el) return
  el.innerHTML = `
    <img src="${foto}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'"
      style="width:58px;height:58px;border-radius:50%;object-fit:cover;border:3px solid #38bdf8;flex-shrink:0">
    <div>
      <div style="font-size:16px;font-weight:700;color:#f1f5f9">${nombre}</div>
      ${zona?`<div style="font-size:12px;color:#94a3b8;margin-top:2px">📍 ${zona}</div>`:""}
      ${encargado?`<div style="font-size:12px;color:#94a3b8">👤 ${encargado}</div>`:""}
    </div>
  `
}

function agregarLista(nombre,foto,zona){
  const lista = document.getElementById("lista-asistencia")
  if(!lista) return
  const hora = new Date().toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})
  const item = document.createElement("div")
  item.className = "lista-item"
  item.innerHTML = `
    <img src="${foto}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nombre}</div>
      <div style="font-size:11px;color:#64748b">${zona||eventoActual}</div>
    </div>
    <div style="font-size:11px;color:#475569;flex-shrink:0">${hora}</div>
  `
  lista.insertBefore(item, lista.firstChild)
}

function setMensaje(txt,color){
  const el = document.getElementById("mensaje-asistencia")
  if(el){ el.textContent=txt; el.style.color=color }
}

function semaforoVerde(txt){
  const s = document.getElementById("semaforo")
  if(!s) return
  s.style.background="#16a34a"; s.style.color="#fff"; s.textContent=txt
  setTimeout(()=>{ s.style.background="#334155"; s.textContent="LISTO PARA ESCANEAR" },2000)
}

function semaforoRojo(txt){
  const s = document.getElementById("semaforo")
  if(!s) return
  s.style.background="#dc2626"; s.style.color="#fff"; s.textContent=txt
  setTimeout(()=>{ s.style.background="#334155"; s.textContent="LISTO PARA ESCANEAR" },2000)
}

function errorEscaneo(txt,vozTxt){ beepError(); semaforoRojo(txt); voz(vozTxt); setMensaje(txt,"#ef4444") }
function voz(txt){ const m=new SpeechSynthesisUtterance(txt); m.lang="es-ES"; speechSynthesis.speak(m) }

function beepOk(){
  const ctx=new(window.AudioContext||window.webkitAudioContext)()
  const o=ctx.createOscillator(),g=ctx.createGain()
  o.frequency.value=880; o.connect(g); g.connect(ctx.destination)
  o.start(); g.gain.exponentialRampToValueAtTime(0.00001,ctx.currentTime+0.15); o.stop(ctx.currentTime+0.15)
}

function beepError(){
  const ctx=new(window.AudioContext||window.webkitAudioContext)()
  const o=ctx.createOscillator(),g=ctx.createGain()
  o.frequency.value=280; o.connect(g); g.connect(ctx.destination)
  o.start(); g.gain.exponentialRampToValueAtTime(0.00001,ctx.currentTime+0.3); o.stop(ctx.currentTime+0.3)
}

}) // ── FIN PARTE 1 ──────────────────────────────────────


/* ══════════════════════════════════════════════════════
   PARTE 2 — CREDENCIALES QR
══════════════════════════════════════════════════════ */

$.getScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js", function(){

  const LOGO          = "https://i.imgur.com/p4njU2F.png"
  const FALLBACK_FOTO = "https://cdn-icons-png.flaticon.com/512/149/149071.png"
  let formatoCarnet   = "horizontal"
  let modoFoto        = "foto"

  const COLORES = [
    { nombre:"Azul",       grad:"linear-gradient(180deg,#1e3a8a,#2563eb)" },
    { nombre:"Morado",     grad:"linear-gradient(180deg,#4c1d95,#7c3aed)" },
    { nombre:"Verde",      grad:"linear-gradient(180deg,#14532d,#16a34a)" },
    { nombre:"Rojo",       grad:"linear-gradient(180deg,#7f1d1d,#dc2626)" },
    { nombre:"Negro",      grad:"linear-gradient(180deg,#111827,#374151)" },
    { nombre:"Teal",       grad:"linear-gradient(180deg,#134e4a,#0d9488)" },
    { nombre:"Melocotón",  grad:"linear-gradient(180deg,#FFB2AB,#FFE0BD)" },
    { nombre:"Coral",      grad:"linear-gradient(180deg,#FF6D90,#FF909A)" },
    { nombre:"Rosa fuerte",grad:"linear-gradient(180deg,#DA5A9A,#FF909A)" },
    { nombre:"Lila",       grad:"linear-gradient(180deg,#DA5A9A,#EBA1FF)" },
    { nombre:"Menta",      grad:"linear-gradient(180deg,#A8DDBD,#CAFFD2)" },
    { nombre:"Esmeralda",  grad:"linear-gradient(180deg,#5AE0A1,#60F9B2)" },
    { nombre:"Celeste",    grad:"linear-gradient(180deg,#ABBAC5,#DDE8F3)" },
    { nombre:"Gris perla", grad:"linear-gradient(180deg,#ABBAC5,#DDE8F3)" },
  ]
  let colorActual = COLORES[0].grad

  $(document).on("knack-view-render.view_5", function(){
    crearBotones()
    generarQR()
  })

  function crearBotones(){
    if($("#imprimirTodas").length) return
    const botoresColor = COLORES.map((c,i)=>
      `<button onclick="window._setColor(${i})" title="${c.nombre}"
        style="width:24px;height:24px;border-radius:50%;border:2px solid ${i===0?'#fff':'transparent'};
        background:${c.grad};cursor:pointer;padding:0;flex-shrink:0"
        id="btn-color-${i}"></button>`
    ).join("")
    $(".kn-view").first().prepend(`
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;background:#f8fafc;padding:10px 14px;border-radius:10px;border:1px solid #e2e8f0">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;color:#64748b;font-weight:600">Formato:</span>
          <button id="btn-horizontal" onclick="window._setFormato('horizontal')"
            style="padding:6px 12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px">↔ Horizontal</button>
          <button id="btn-vertical" onclick="window._setFormato('vertical')"
            style="padding:6px 12px;background:#e2e8f0;color:#334155;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px">↕ Vertical</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;color:#64748b;font-weight:600">Color:</span>
          <div style="display:flex;gap:5px;align-items:center">${botoresColor}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;color:#64748b;font-weight:600">Círculo:</span>
          <button id="btn-foto" onclick="window._setModoFoto('foto')"
            style="padding:6px 12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px">👤 Foto</button>
          <button id="btn-logo" onclick="window._setModoFoto('logo')"
            style="padding:6px 12px;background:#e2e8f0;color:#334155;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px">🏷️ Logo</button>
        </div>
        <button id="imprimirTodas"
          style="padding:6px 14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;margin-left:auto">
          🪪 Imprimir todas</button>
      </div>
    `)
    window._setFormato = function(f){
      formatoCarnet = f
      $("#btn-horizontal").css({background:f==="horizontal"?"#2563eb":"#e2e8f0",color:f==="horizontal"?"#fff":"#334155"})
      $("#btn-vertical").css({background:f==="vertical"?"#2563eb":"#e2e8f0",color:f==="vertical"?"#fff":"#334155"})
    }
    window._setColor = function(i){
      colorActual = COLORES[i].grad
      COLORES.forEach((_,j)=>{ $("#btn-color-"+j).css("border-color",j===i?"#1e293b":"transparent") })
    }
    window._setModoFoto = function(m){
      modoFoto = m
      $("#btn-foto").css({background:m==="foto"?"#2563eb":"#e2e8f0",color:m==="foto"?"#fff":"#334155"})
      $("#btn-logo").css({background:m==="logo"?"#2563eb":"#e2e8f0",color:m==="logo"?"#fff":"#334155"})
    }
  }

  function generarQR(){
    $(".kn-table tbody tr").each(function(){
      const codigo  = $(this).find("td.field_34").text().trim()
      const nombre  = $(this).find("td.field_29").text().trim()
      let foto      = $(this).find("td.field_33\\:thumb_1 img").attr("src")
      if(!foto) foto = FALLBACK_FOTO
      if(!codigo) return
      const cont  = $("<div style='text-align:center'></div>")
      const qrDiv = $("<div style='width:120px;height:120px;margin:auto'></div>")
      const btn   = $("<button style='margin-top:6px;padding:4px 10px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px'>Imprimir</button>")
      cont.append(qrDiv).append("<br>").append(btn)
      $(this).find("td.field_44").html(cont)
      new QRCode(qrDiv[0],{text:codigo,width:120,height:120})
      btn.click(function(){
        const fila   = $(this).closest("tr")
        const evento = fila.find("td.field_62 a").first().text().trim() || fila.find("td.field_62").text().trim()
        const fecha  = fila.find("td.field_67 span").first().text().trim() || fila.find("td.field_67").text().trim()
        const lugar  = fila.find("td.field_68 span").first().text().trim() || fila.find("td.field_68").text().trim()
        imprimirCredencial(nombre, foto, qrDiv.find("canvas")[0].toDataURL("image/png"), evento, fecha, lugar)
      })
    })
  }

  function carnetHorizontal(nombre, foto, qr, evento, fecha, lugar){
    const imgCirculo = modoFoto==="logo" ? LOGO : foto
    const fallback   = modoFoto==="logo" ? LOGO : FALLBACK_FOTO
    return `<div style="width:340px;height:214px;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.25);display:inline-flex;font-family:'Segoe UI',Arial,sans-serif;box-sizing:border-box;page-break-inside:avoid;margin:8px">
      <div style="width:110px;background:${colorActual};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;gap:8px;flex-shrink:0">
        <div style="color:#fff;font-size:9px;font-weight:700;letter-spacing:.5px;text-align:center;line-height:1.3">IACYM CNC<br>2026</div>
        <img src="${imgCirculo}" style="width:62px;height:62px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.4)" onerror="this.src='${fallback}'">
      </div>
      <div style="flex:1;background:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:12px 14px">
        <div>
          <div style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;background:${colorActual};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Participante</div>
          <div style="font-size:14px;font-weight:800;color:#0f172a;line-height:1.2">${nombre}</div>
          ${evento?`<div style="font-size:10px;font-weight:600;color:#64748b;margin-top:4px">📅 ${evento}</div>`:""}
          ${fecha?`<div style="font-size:9px;color:#64748b;margin-top:2px">🕐 ${fecha}</div>`:""}
          ${lugar?`<div style="font-size:9px;color:#64748b;margin-top:2px">📍 ${lugar}</div>`:""}
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between">
          <div>
            <div style="font-size:7px;color:#94a3b8;margin-bottom:2px">Código QR de acceso</div>
            <img src="${qr}" style="width:80px;height:80px">
          </div>
          <div style="background:${colorActual};color:#fff;font-size:7px;font-weight:700;padding:3px 8px;border-radius:999px;letter-spacing:.5px;align-self:flex-end">VÁLIDO 2026</div>
        </div>
      </div>
    </div>`
  }

  function carnetVertical(nombre, foto, qr, evento, fecha, lugar){
    const imgCirculo = modoFoto==="logo" ? LOGO : foto
    const fallback   = modoFoto==="logo" ? LOGO : FALLBACK_FOTO
    return `<div style="width:214px;height:auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.25);display:inline-flex;flex-direction:column;font-family:'Segoe UI',Arial,sans-serif;box-sizing:border-box;page-break-inside:avoid;margin:8px">
      <div style="background:${colorActual};padding:14px;display:flex;flex-direction:column;align-items:center;gap:6px">
        <div style="color:#fff;font-size:10px;font-weight:700;letter-spacing:.5px;text-align:center">IACYM CNC 2026</div>
        <img src="${imgCirculo}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.5)" onerror="this.src='${fallback}'">
      </div>
      <div style="background:#fff;display:flex;flex-direction:column;align-items:center;padding:12px 10px;gap:8px">
        <div style="text-align:center;width:100%">
          <div style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;background:${colorActual};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Participante</div>
          <div style="font-size:14px;font-weight:800;color:#0f172a;line-height:1.3">${nombre}</div>
          ${evento?`<div style="font-size:9px;font-weight:600;color:#64748b;margin-top:5px;line-height:1.3">📅 ${evento}</div>`:""}
          ${fecha?`<div style="font-size:9px;color:#64748b;margin-top:3px">🕐 ${fecha}</div>`:""}
          ${lugar?`<div style="font-size:9px;color:#64748b;margin-top:3px;line-height:1.3">📍 ${lugar}</div>`:""}
        </div>
        <div style="text-align:center;margin-top:6px">
          <div style="font-size:7px;color:#94a3b8;margin-bottom:4px">Código QR de acceso</div>
          <img src="${qr}" style="width:85px;height:85px">
          <div style="background:${colorActual};color:#fff;font-size:7px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:.5px;margin-top:8px;display:inline-block">VÁLIDO 2026</div>
        </div>
      </div>
    </div>`
  }

  function carnetHTML(nombre, foto, qr, evento, fecha, lugar){
    return formatoCarnet==="vertical"
      ? carnetVertical(nombre, foto, qr, evento, fecha, lugar)
      : carnetHorizontal(nombre, foto, qr, evento, fecha, lugar)
  }

  function imprimirCredencial(nombre, foto, qr, evento, fecha, lugar){
    const v = window.open("")
    v.document.write(`<html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#f1f5f9;display:inline-flex;flex-wrap:wrap;gap:10px;padding:20px;width:auto;height:auto; }
      @media print { body { background:#fff; padding:0; } @page { size:auto; margin:8mm; } }
    </style></head><body>${carnetHTML(nombre, foto, qr, evento, fecha, lugar)}</body></html>`)
    v.document.close()
    setTimeout(()=>v.print(), 500)
  }

  $(document).on("click","#imprimirTodas",function(){
    const carnets = []
    $(".kn-table tbody tr").each(function(){
      const nombre = $(this).find("td.field_29").text().trim()
      let foto     = $(this).find("td.field_33\\:thumb_1 img").attr("src")
      if(!foto) foto = FALLBACK_FOTO
      const evento = $(this).find("td.field_62 a").first().text().trim() || $(this).find("td.field_62").text().trim()
      const fecha  = $(this).find("td.field_67 span").first().text().trim() || $(this).find("td.field_67").text().trim()
      const lugar  = $(this).find("td.field_68 span").first().text().trim() || $(this).find("td.field_68").text().trim()
      const canvas = $(this).find("canvas")[0]
      if(!canvas) return
      carnets.push(carnetHTML(nombre, foto, canvas.toDataURL("image/png"), evento, fecha, lugar))
    })
    if(!carnets.length) return
    const v = window.open("")
    v.document.write(`<html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#f1f5f9;padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;align-content:flex-start; }
      @media print { body { background:#fff; padding:6px; gap:8px; } @page { size:auto; margin:6mm; } }
    </style></head><body>`)
    carnets.forEach(c => v.document.write(c))
    v.document.write("</body></html>")
    v.document.close()
    setTimeout(()=>v.print(), 800)
  })

}) // ── FIN PARTE 2 ──────────────────────────────────────


/* ══════════════════════════════════════════════════════
   PARTE 3 — DESCARGAR ENTRADA (PNG)
══════════════════════════════════════════════════════ */

$.getScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js", function(){
$.getScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", function(){

  $(document).on("knack-view-render.view_8", function(e, view){
    $("#btn-descargar-entrada").remove()
    setTimeout(function(){
      if(!$(".kn-table tbody tr").length) return
      const fila = $(".kn-table tbody tr").first()
      if(!fila.find("td.field_34").length) return
      if(!fila.find("td.field_29").length) return
      inyectarBotonDescarga()
    }, 600)
  })

  function inyectarBotonDescarga(){
    const fila = $(".kn-table tbody tr").first()
    if(!fila.length) return
    $(".kn-table").last().after(`
      <div id="btn-descargar-entrada" style="margin-top:16px;text-align:center">
        <button id="btn-png"
          style="padding:12px 28px;background:#dc2626;color:#fff;border:none;border-radius:10px;
          font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(220,38,38,.3)">
          📥 Descargar mi entrada (PNG)
        </button>
        <div id="preview-entrada" style="margin-top:16px;display:flex;justify-content:center"></div>
      </div>
    `)
    $("#btn-png").click(function(){ generarEntradaPNG(fila) })
  }

  function generarEntradaPNG(fila){
    const nombre = fila.find("td.field_29").text().trim()
    const codigo = fila.find("td.field_34").text().trim()
    const evento = fila.find("td.field_62 a").first().text().trim() || fila.find("td.field_62").text().trim()
    const fecha  = fila.find("td.field_67 span").first().text().trim() || fila.find("td.field_67").text().trim()
    const lugar  = fila.find("td.field_68 span").first().text().trim() || fila.find("td.field_68").text().trim()
    if(!codigo){ alert("No se encontró el código QR del participante."); return }

    const contenedor = $("<div>").css({position:"fixed",left:"-9999px",top:"0"}).appendTo("body")
    const qrDiv = $("<div>").css({width:"120px",height:"120px"}).appendTo(contenedor)
    new QRCode(qrDiv[0], {text:codigo, width:120, height:120})

    setTimeout(function(){
      const qrCanvas = qrDiv.find("canvas")[0]
      if(!qrCanvas){ contenedor.remove(); alert("Error generando QR"); return }
      const qrData   = qrCanvas.toDataURL("image/png")
      const LOGO_URL = "https://i.imgur.com/p4njU2F.png"
      const GRAD     = "linear-gradient(180deg,#7f1d1d,#dc2626)"
      const FALLBACK = "https://cdn-icons-png.flaticon.com/512/149/149071.png"

      const carnetDiv = $(`
        <div style="width:340px;height:auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;flex-direction:column;font-family:'Segoe UI',Arial,sans-serif;background:#fff">
          <div style="background:${GRAD};padding:14px;display:flex;flex-direction:column;align-items:center;gap:8px">
            <div style="color:#fff;font-size:11px;font-weight:700;letter-spacing:.5px;text-align:center">IACYM CNC 2026</div>
            <img src="${LOGO_URL}" crossorigin="anonymous" style="width:90px;height:90px;object-fit:contain" onerror="this.src='${FALLBACK}'">
          </div>
          <div style="padding:14px 14px 16px;display:flex;flex-direction:column;align-items:center;gap:6px">
            <div style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#dc2626">Participante</div>
            <div style="font-size:16px;font-weight:800;color:#0f172a;text-align:center;line-height:1.3">${nombre}</div>
            ${evento?`<div style="font-size:10px;font-weight:600;color:#64748b;text-align:center">📅 ${evento}</div>`:""}
            ${fecha?`<div style="font-size:10px;color:#64748b">🕐 ${fecha}</div>`:""}
            ${lugar?`<div style="font-size:10px;color:#64748b;text-align:center">📍 ${lugar}</div>`:""}
            <div style="margin-top:8px;text-align:center">
              <div style="font-size:8px;color:#94a3b8;margin-bottom:4px">Código QR de acceso</div>
              <img src="${qrData}" style="width:110px;height:110px">
            </div>
            <div style="background:${GRAD};color:#fff;font-size:8px;font-weight:700;padding:4px 14px;border-radius:999px;letter-spacing:.5px;margin-top:4px">VÁLIDO 2026</div>
          </div>
        </div>
      `).appendTo(contenedor)

      const imgEl = carnetDiv.find("img").first()[0]
      function capturar(){
        html2canvas(carnetDiv[0], {scale:3,useCORS:true,allowTaint:true,backgroundColor:"#ffffff"})
        .then(function(canvas){
          contenedor.remove()
          const preview = document.getElementById("preview-entrada")
          preview.innerHTML = ""
          const imgPreview = document.createElement("img")
          imgPreview.src = canvas.toDataURL("image/png")
          imgPreview.style.cssText = "max-width:340px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.2)"
          preview.appendChild(imgPreview)
          const link = document.createElement("a")
          link.download = "entrada-" + nombre.replace(/\s+/g,"-") + ".png"
          link.href = canvas.toDataURL("image/png")
          link.click()
        }).catch(function(err){
          contenedor.remove()
          console.error("html2canvas error:", err)
          alert("Error al generar la imagen.")
        })
      }
      if(imgEl.complete){ capturar() }
      else { imgEl.onload = capturar; imgEl.onerror = capturar }
    }, 400)
  }

}) // fin html2canvas
}) // fin qrcodejs


/* ══════════════════════════════════════════════════════
   PARTE 4 — WHATSAPP AL REGISTRARSE
══════════════════════════════════════════════════════ */

$(document).on("knack-record-create.view_13", function(e, view, record){
  setTimeout(function(){ enviarWhatsApp(record) }, 2000)
})

function enviarWhatsApp(record){
  const nombre   = record.field_29  || record.field_29_raw  || ""
  const dni      = record.field_34  || record.field_34_raw  || ""
  const password = record.field_69  || record.field_69_raw  || ""
  const telefono = record.field_47  || record.field_47_raw  || ""
  const evento   = record.field_62  || record.field_62_raw  || ""

  if(!telefono){ console.warn("Sin teléfono, no se envía WA"); return }

  const tel         = String(telefono).replace(/\D/g,"")
  const telCompleto = tel.startsWith("51") ? tel : "51" + tel

  let nombreEvento = ""
  if(typeof evento === "object" && evento !== null){
    nombreEvento = evento.identifier || evento.name || ""
  } else {
    const tmp = document.createElement("div")
    tmp.innerHTML = String(evento)
    nombreEvento = (tmp.textContent || tmp.innerText || "").trim()
  }

  // Ya no marcamos "pendiente" — esa llamada se sobreescribía segundos después
  // por Make.com con el valor real (whatsapp/sms). El campo queda vacío
  // brevemente y luego Make.com lo llena igual, sin perder el dato de auditoría.

  const payload = {
    record_id: record.id,
    nombre:    String(nombre).trim(),
    dni:       String(dni).trim(),
    password:  String(password).trim(),
    telefono:  String(telCompleto).trim(),
    evento:    String(nombreEvento).trim(),
    enlace:    "https://cnc.knack.com/hombres-vencedores#descargar-entrada/"
  }

  fetch("https://hook.us2.make.com/osnaqwex9pqsewrq61xib38l6koubf66", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload)
  })
  .then(r => r.text())
  .then(body => console.log("✅ Webhook enviado:", body))
  .catch(err => console.error("❌ Error webhook:", err))
}

function actualizarCanalEnvio(recordId, valor){
  const APP_ID  = window._KNACK_APP_ID
  const API_KEY = window._KNACK_API_KEY
  window._fetchSafe("https://api.knack.com/v1/objects/object_5/records/" + recordId, {
    method:  "PUT",
    headers: {
      "Content-Type":           "application/json",
      "X-Knack-Application-Id": APP_ID,
      "X-Knack-REST-API-Key":   API_KEY
    },
    body: JSON.stringify({ field_106: valor })
  })
  .then(r => r.json())
  .then(() => console.log("✅ field_106 =", valor))
  .catch(err => console.error("❌ Error actualizando field_106:", err))
}


/* ══════════════════════════════════════════════════════
   PARTE 5 — BANNER DE PREVENTA + PRECIO AUTOMÁTICO
   + VALIDACIÓN DE MONTO PAGADO + OCR VOUCHER + BECAS
══════════════════════════════════════════════════════ */

$(document).on("knack-view-render.any", function(e, view){
  if(!view) return
  if(view.key === "view_13") setTimeout(function(){ mostrarBannerPreventa() }, 300)
  if(view.key === "view_11") setTimeout(function(){ mostrarBannerInformativo() }, 300)
})

function calcularPrecio(){
  const hoy      = new Date()
  const yyyymmdd = hoy.getFullYear() * 10000 + (hoy.getMonth()+1) * 100 + hoy.getDate()
  let precio=45, descuento=0, periodo="01 Jun - 28 Jun"
  let etiqueta="📌 Precio único", colorBg="#7f1d1d", colorBadge="#D86363"
  if(yyyymmdd >= 20260415 && yyyymmdd <= 20260430){
    precio=35; descuento=30; periodo="15 Abr - 30 Abr"
    etiqueta="🔥 PREVENTA 1"; colorBg="#7f1d1d"; colorBadge="#dc2626"
  } else if(yyyymmdd >= 20260501 && yyyymmdd <= 20260531){
    precio=40; descuento=20; periodo="01 May - 31 May"
    etiqueta="⚡ PREVENTA 2"; colorBg="#78350f"; colorBadge="#f59e0b"
  } else if(yyyymmdd >= 20260601 && yyyymmdd <= 20260628){
    precio=45; descuento=10; periodo="01 Jun - 28 Jun"
    etiqueta="✨ PRECIO FINAL"; colorBg="#14532d"; colorBadge="#16a34a"
  }
  return { precio, descuento, periodo, etiqueta, colorBg, colorBadge, yyyymmdd }
}

function construirTabla(yyyymmdd){
  const periodos = [
    { desde:"15 Abr", hasta:"30 Abr", desc:30, precio:35, rango:[20260415,20260430] },
    { desde:"01 May", hasta:"31 May", desc:20, precio:40, rango:[20260501,20260531] },
    { desde:"01 Jun", hasta:"28 Jun", desc:10, precio:45, rango:[20260601,20260628] },
  ]
  return periodos.map(p=>{
    const esActual = yyyymmdd >= p.rango[0] && yyyymmdd <= p.rango[1]
    return `<tr>
      <td style="padding:8px 12px;font-size:13px;color:${esActual?"#fff":"rgba(255,255,255,.55)"};font-weight:${esActual?"700":"400"}">
        ${esActual?"👉 ":""}${p.desde} — ${p.hasta}</td>
      <td style="padding:8px 12px;font-size:13px;color:${esActual?"#fde68a":"rgba(255,255,255,.55)"};font-weight:${esActual?"700":"400"};text-align:center">
        ${p.desc > 0 ? p.desc+"% OFF" : "—"}</td>
      <td style="padding:8px 12px;font-size:${esActual?"16":"13"}px;color:${esActual?"#fff":"rgba(255,255,255,.45)"};font-weight:${esActual?"800":"400"};text-align:right">
        S/ ${p.precio}</td>
    </tr>`
  }).join("")
}

function construirBannerHTML(data, filasTabla){
  const { precio, descuento, periodo, etiqueta, colorBg, colorBadge } = data
  return `
    <div style="background:linear-gradient(135deg,${colorBg},${colorBadge});border-radius:14px;padding:20px 24px;margin-bottom:20px;font-family:'Segoe UI',Arial,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
        <div>
          <div style="font-size:10px;color:rgba(255,255,255,.7);font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Conferencia de Hombres Vencedores</div>
          <div style="font-size:20px;font-weight:800;color:#fff">🎟️ Precio de inscripción</div>
        </div>
        <div style="background:rgba(0,0,0,.25);border-radius:12px;padding:12px 20px;text-align:center;min-width:120px">
          <div style="font-size:11px;color:rgba(255,255,255,.8);font-weight:700;letter-spacing:.5px">${etiqueta}</div>
          <div style="font-size:38px;font-weight:900;color:#fff;line-height:1.1">S/ ${precio}</div>
          ${descuento>0
            ? `<div style="background:rgba(255,255,255,.2);border-radius:999px;padding:2px 10px;font-size:11px;color:#fde68a;font-weight:700;margin-top:4px;display:inline-block">${descuento}% de descuento</div>`
            : `<div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:4px">Precio final</div>`}
        </div>
      </div>
      <div style="background:rgba(0,0,0,.2);border-radius:10px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid rgba(255,255,255,.12)">
            <th style="padding:8px 12px;font-size:10px;color:rgba(255,255,255,.5);font-weight:600;text-align:left;letter-spacing:.5px;text-transform:uppercase">Período</th>
            <th style="padding:8px 12px;font-size:10px;color:rgba(255,255,255,.5);font-weight:600;text-align:center;letter-spacing:.5px;text-transform:uppercase">Descuento</th>
            <th style="padding:8px 12px;font-size:10px;color:rgba(255,255,255,.5);font-weight:600;text-align:right;letter-spacing:.5px;text-transform:uppercase">Precio</th>
          </tr></thead>
          <tbody>${filasTabla}</tbody>
        </table>
      </div>
      <div style="margin-top:12px;font-size:11px;color:rgba(255,255,255,.55);text-align:center">
        💡 El precio se aplica automáticamente según la fecha de inscripción
      </div>
    </div>
  `
}

function mostrarBannerInformativo(){
  if($("#banner-preventa-info").length) return
  const data       = calcularPrecio()
  const filasTabla = construirTabla(data.yyyymmdd)
  const bannerHTML = construirBannerHTML(data, filasTabla)
  $("#view_11").prepend(bannerHTML.replace('<div style="', '<div id="banner-preventa-info" style="'))
}

function ocultarCamposPago(){
  ["field_70","field_71","field_72","field_73","field_77"].forEach(function(id){
    $("#kn-input-"+id).hide()
  })
}

function mostrarCamposPago(){
  ["field_70","field_71","field_72","field_73","field_77"].forEach(function(id){
    $("#kn-input-"+id).show()
  })
}

function cargarConfigBecas(callback){
  // ── Caché en localStorage: la config de becas casi nunca cambia durante
  // el evento, así que la reutilizamos por 30 minutos en vez de llamar a
  // object_13 cada vez que alguien abre el formulario de inscripción.
  const CACHE_KEY = "_cacheBecas"
  const CACHE_MS  = 30 * 60 * 1000 // 30 minutos

  try {
    const cacheado = JSON.parse(localStorage.getItem(CACHE_KEY) || "null")
    if(cacheado && (Date.now() - cacheado.timestamp) < CACHE_MS){
      window._configBecas = cacheado.config
      callback(cacheado.config)
      return
    }
  } catch(e){ /* localStorage no disponible o dato corrupto, seguimos a la API */ }

  const APP_ID  = window._KNACK_APP_ID
  const API_KEY = window._KNACK_API_KEY
  const HDR     = {"X-Knack-Application-Id":APP_ID,"X-Knack-REST-API-Key":API_KEY}
  window._fetchSafe("https://api.knack.com/v1/objects/object_13/records?rows_per_page=100", {headers:HDR})
  .then(r=>r.json())
  .then(data=>{
    const config = { mediaBeca:null, becaCompleta:null, vale:null }
    ;(data.records||[]).forEach(function(r){
      const tipo = (r.field_134||"").toString().trim().toUpperCase()
      if(tipo === "MEDIA BECA"){
        config.mediaBeca = { codigo:(r.field_133||"").toString().trim(), precio:parseFloat(r.field_135)||0 }
      } else if(tipo === "BECA COMPLETA"){
        config.becaCompleta = { codigo:(r.field_129||"").toString().trim(), precio:0 }
      } else if(tipo === "VALE"){
        config.vale = { codigo:(r.field_137||"").toString().trim(), descuento:parseFloat(r.field_135)||10 }
      }
    })
    window._configBecas = config
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ config: config, timestamp: Date.now() }))
    } catch(e){ /* si localStorage falla, simplemente no cacheamos, no rompe nada */ }
    callback(config)
  })
  .catch(function(){ window._configBecas = null; callback(null) })
}

function inyectarBloqueBeca(){
  if($("#bloque-beca").length) return
  const bloque = `
    <div id="bloque-beca" style="background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:14px;padding:18px 20px;margin-bottom:16px;font-family:'Segoe UI',Arial,sans-serif;box-shadow:0 4px 16px rgba(37,99,235,.3)">
      <div style="font-size:14px;font-weight:800;color:#fff;margin-bottom:4px">🎓 ¿Tienes una beca o vale?</div>
      <div style="font-size:12px;color:rgba(255,255,255,.7);margin-bottom:12px">Si el pastor te otorgó una beca o vale de descuento, ingresa el código aquí</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="input-codigo-beca" type="text" placeholder="Ingresa tu código..."
          style="flex:1;min-width:200px;padding:10px 14px;border-radius:8px;border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;font-size:13px;outline:none;font-family:'Segoe UI',Arial,sans-serif"
          oninput="this.value=this.value.toUpperCase()">
        <button id="btn-aplicar-beca" type="button"
          style="padding:10px 18px;background:#fff;color:#1e3a8a;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap">
          Aplicar código
        </button>
      </div>
      <div id="msg-beca" style="margin-top:10px;font-size:13px;font-weight:600;min-height:20px"></div>
    </div>
  `
  $("#msg-monto").before(bloque)
  $("#btn-aplicar-beca").on("click", function(){ aplicarCodigoBeca() })
  $("#input-codigo-beca").on("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); aplicarCodigoBeca() } })
}

function aplicarCodigoBeca(){
  const config = window._configBecas
  if(!config){ $("#msg-beca").html('<span style="color:#fde68a">⚠️ No se pudo cargar la configuración</span>'); return }
  const codigo = $("#input-codigo-beca").val().trim().toUpperCase()
  if(!codigo){ $("#msg-beca").html('<span style="color:#fde68a">⚠️ Ingresa un código</span>'); return }

  if(config.mediaBeca && codigo === config.mediaBeca.codigo){
    const precio = config.mediaBeca.precio
    window._precioEsperado = precio; window._tipoBeca = "MEDIA BECA"; window._becaCompleta = false
    mostrarCamposPago()
    $("#field_77").val(precio).trigger("input")
    $("#msg-beca").html(`<span style="color:#86efac">✅ Media beca aplicada — Debes pagar <strong>S/ ${precio}</strong>. Sube tu voucher por ese monto.</span>`)
  } else if(config.becaCompleta && codigo === config.becaCompleta.codigo){
    window._precioEsperado = 0; window._tipoBeca = "BECA COMPLETA"; window._becaCompleta = true
    $("#field_77").val(0)
    $("#msg-monto").hide()
    $("#msg-beca").html('<span style="color:#86efac">✅ Beca completa aplicada — No necesitas realizar ningún pago 🎉</span>')
    setTimeout(function(){ ocultarCamposPago() }, 300)
  } else if(config.vale && codigo === config.vale.codigo){
    const precioBase = calcularPrecio().precio
    const descuento  = config.vale.descuento
    const precioFinal = Math.max(0, precioBase - descuento)
    window._precioEsperado = precioFinal; window._tipoBeca = "VALE"; window._becaCompleta = false
    mostrarCamposPago()
    $("#field_77").val(precioFinal).trigger("input")
    $("#msg-beca").html(`<span style="color:#86efac">✅ Vale aplicado — Descuento de S/ ${descuento} — Debes pagar <strong>S/ ${precioFinal}</strong>. Sube tu voucher por ese monto.</span>`)
  } else {
    window._tipoBeca = ""; window._becaCompleta = false
    mostrarCamposPago()
    $("#msg-beca").html('<span style="color:#fca5a5">❌ Código incorrecto. Verifica e intenta nuevamente.</span>')
  }
}

function mostrarBannerPreventa(){
  if(!$("#kn-input-field_37").length) return
  if($("#banner-preventa").length) return
  const data = calcularPrecio()
  const { precio, descuento, periodo, yyyymmdd } = data
  const filasTabla = construirTabla(yyyymmdd)
  const bannerHTML = construirBannerHTML(data, filasTabla)
    .replace('<div style="background:linear-gradient', '<div id="banner-preventa" style="background:linear-gradient')

  window._precioEsperado  = precio
  window._descuentoActual = descuento
  window._periodoActual   = periodo
  window._ultimoVoucher   = ""
  window._tipoBeca        = ""
  window._becaCompleta    = false

  $("#kn-input-field_37").closest("ul").parent().before(
    bannerHTML +
    `<div id="msg-monto" style="display:none;margin-bottom:12px;border-radius:10px;font-size:13px;font-weight:600;text-align:center"></div>`
  )

  $("#field_74").closest(".kn-input").hide()
  $("#field_75").closest(".kn-input").hide()
  $("#field_76").closest(".kn-input").hide()

  $("#field_77").prop("readonly", true)
    .css({"background":"#f1f5f9","color":"#64748b","cursor":"not-allowed"})

  cargarConfigBecas(function(config){ inyectarBloqueBeca() })

  $(document).off("click.preventa").on("click.preventa", "#view_13 .kn-button.is-primary, #view_13 input[type=submit], #view_13 button[type=submit]", function(e){
    if(window._becaCompleta) return
    const precioEsperado = window._precioEsperado
    const montoPagado    = parseFloat($("#field_77").val()) || 0
    if(montoPagado !== precioEsperado){
      e.preventDefault(); e.stopImmediatePropagation()
      $("#msg-monto").show().html(`
        <span style="color:#fff;background:#dc2626;padding:12px 16px;border-radius:10px;display:block;margin-top:8px">
          ❌ Monto incorrecto — Ingresaste S/ ${montoPagado} pero el precio es <strong>S/ ${precioEsperado}</strong>. Por favor corrígelo antes de continuar.
        </span>`)
      $("html, body").animate({ scrollTop: $("#msg-monto").offset().top - 120 }, 400)
      return false
    }
  })

  $(document).off("input.preventa blur.preventa")
  .on("input.preventa blur.preventa", "#field_77", function(){ validarMonto() })

  if(window._observerVoucher) window._observerVoucher.disconnect()
  window._observerVoucher = new MutationObserver(function(){
    const fileInput = document.querySelector("#field_70_upload")
    if(fileInput && fileInput.files && fileInput.files[0]){
      const file = fileInput.files[0]
      if(file.name !== window._ultimoVoucher){
        window._ultimoVoucher = file.name
        if(file.type.startsWith("image/")) procesarVoucherOCR(file)
      }
    }
  })
  window._observerVoucher.observe(document.body, { childList:true, subtree:true, attributes:true })

  setTimeout(function(){
    const fileInput = document.querySelector("#field_70_upload")
    if(fileInput){
      fileInput.addEventListener("change", function(){
        const file = this.files[0]
        if(file && file.type.startsWith("image/")){
          window._ultimoVoucher = file.name
          procesarVoucherOCR(file)
        }
      })
    }
  }, 800)
}

function validarMonto(){
  if(window._becaCompleta) return
  const precioEsperado = window._precioEsperado
  if(precioEsperado === undefined || precioEsperado === null) return
  const montoPagado = parseFloat($("#field_77").val()) || 0
  const msg = $("#msg-monto")
  if(!montoPagado){ msg.hide(); return }
  if(montoPagado === precioEsperado){
    msg.show().html(`<span style="color:#fff;background:#16a34a;padding:12px 16px;border-radius:10px;display:block;margin-top:8px">✅ Monto correcto — S/ ${montoPagado} corresponde al precio activo (S/ ${precioEsperado})</span>`)
  } else {
    msg.show().html(`<span style="color:#fff;background:#dc2626;padding:12px 16px;border-radius:10px;display:block;margin-top:8px">❌ Monto incorrecto — Ingresaste S/ ${montoPagado} pero el precio es <strong>S/ ${precioEsperado}</strong></span>`)
  }
}

function procesarVoucherOCR(file){
  $("#msg-monto").show().html(`<span style="color:#fff;background:#2563eb;padding:12px 16px;border-radius:10px;display:block;margin-top:8px">🔍 Leyendo voucher... Por favor espera.</span>`)
  const reader = new FileReader()
  reader.onload = function(e){
    const base64    = e.target.result.split(",")[1]
    const mediaType = file.type
    fetch("https://hook.us2.make.com/iidpsa046gqte37bsof0vi5976l9ee8j", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: base64, media_type: mediaType, file_name: file.name })
    })
    .then(r => r.json())
    .then(data => {
      console.log("📦 Respuesta OCR completa:", JSON.stringify(data))
      const monto = parseFloat(data.monto)
      const nroOp = (data.nro_operacion || "").toString().trim()
      if(isNaN(monto)){
        $("#msg-monto").show().html(`<span style="color:#fff;background:#f59e0b;padding:12px 16px;border-radius:10px;display:block;margin-top:8px">⚠️ No se pudo leer el monto automáticamente. Por favor ingrésalo manualmente.</span>`)
        return
      }
      $("#field_77").val(monto).trigger("input")
      if(nroOp) $("#field_72").val(nroOp)
      $("html, body").animate({ scrollTop: $("#msg-monto").offset().top - 120 }, 400)
    })
    .catch(err => {
      console.error("❌ Error OCR Make:", err)
      $("#msg-monto").show().html(`<span style="color:#fff;background:#dc2626;padding:12px 16px;border-radius:10px;display:block;margin-top:8px">❌ Error al leer el voucher. Por favor ingresa el monto manualmente.</span>`)
    })
  }
  reader.readAsDataURL(file)
}

$(document).on("knack-record-create.view_13", function(e, view, record){
  const APP_ID   = window._KNACK_APP_ID
  const API_KEY  = window._KNACK_API_KEY
  const HDR_JSON = { "Content-Type":"application/json", "X-Knack-Application-Id":APP_ID, "X-Knack-REST-API-Key":API_KEY }
  const tipoBeca = window._tipoBeca || ""
  const nroOp    = $("#field_72").val() || ""

  let precio, descuento, periodo
  if(tipoBeca === "BECA COMPLETA"){
    precio = 0; descuento = 100; periodo = "Beca completa"
  } else if(tipoBeca === "MEDIA BECA"){
    precio = window._precioEsperado||0; descuento = window._descuentoActual||0; periodo = "Media beca"
  } else if(tipoBeca === "VALE"){
    precio = window._precioEsperado||0; descuento = window._descuentoActual||0; periodo = "Vale descuento"
  } else {
    precio = window._precioEsperado||45; descuento = window._descuentoActual||0; periodo = window._periodoActual||"01 Jun - 28 Jun"
  }

  const body = { field_74: precio, field_75: periodo, field_76: descuento, field_72: nroOp }
  if(tipoBeca) body.field_136 = tipoBeca

  window._fetchSafe("https://api.knack.com/v1/objects/object_5/records/" + record.id, {
    method: "PUT", headers: HDR_JSON, body: JSON.stringify(body)
  })
  .then(r => r.json())
  .then(data => console.log("✅ Registro guardado:", data.field_74, data.field_75, data.field_76, data.field_136))
  .catch(err => console.error("❌ Error guardando registro:", err))
})


/* ══════════════════════════════════════════════════════
   PARTE 6 — REPORTE GENERAL
   ── Solo carga al presionar botón ──
══════════════════════════════════════════════════════ */

$(document).on("knack-scene-render.any", function(){
  if(!document.getElementById("reporte-root")) return
  setTimeout(function(){
    const btn = document.getElementById("btn-cargar-reporte")
    if(!btn) return
    btn.addEventListener("click", function(){
      btn.disabled = true
      btn.textContent = "⏳ Cargando..."
      btn.style.opacity = "0.7"
      window._cargarReporte()
    })
  }, 400)
})

window._cargarReporte = function(){
  const APP_ID  = window._KNACK_APP_ID
  const API_KEY = window._KNACK_API_KEY
  const HDR     = {"X-Knack-Application-Id": APP_ID, "X-Knack-REST-API-Key": API_KEY}

  ;["num-inscritos","num-asistentes","num-ausentes","num-pct"].forEach(function(id){
    const el = document.getElementById(id); if(el) el.textContent = "…"
  })

  // ── KPI cards: 1 sola llamada a object_15 (ESTADISTICAS) ──
  // Los campos Σ ahí ya traen los totales calculados por Knack — evita
  // esperar a que terminen de bajar los 2000+ registros completos solo para 4 números.
  window._fetchSafe("https://api.knack.com/v1/objects/object_15/records?rows_per_page=1", {headers:HDR})
  .then(r=>r.json())
  .then(data=>{
    if(!data.records || !data.records.length) return
    const stats = data.records[0]
    const totalInscritos  = stats.field_152 || 0
    const totalAsistentes = stats.field_155 || 0
    const totalAusentes   = stats.field_156 !== undefined ? stats.field_156 : Math.max(0, totalInscritos - totalAsistentes)
    const pct = totalInscritos > 0 ? Math.round(totalAsistentes / totalInscritos * 100) : 0

    document.getElementById("num-inscritos").textContent  = totalInscritos
    document.getElementById("num-asistentes").textContent = totalAsistentes
    document.getElementById("num-ausentes").textContent   = totalAusentes
    document.getElementById("num-pct").textContent        = pct + "%"
  })
  .catch(function(err){ console.error("Error cargando KPIs desde ESTADISTICAS:", err) })

  function fetchAll(url, acum, intentos){
    acum = acum || []; intentos = intentos || 0
    return window._fetchSafe(url, {headers: HDR})
    .then(function(r){ return r.json() })
    .then(function(data){
      if(!data || !data.records) return acum
      const todos = acum.concat(data.records)
      if(data.current_page < data.total_pages){
        const next = url.replace(/page=\d+/, "page=" + (data.current_page + 1))
        return fetchAll(next, todos, 0)
      }
      return todos
    })
  }

  // ── Tablas de desglose por evento y zona: necesitan el detalle, siguen igual ──
  Promise.all([
    fetchAll("https://api.knack.com/v1/objects/object_5/records?rows_per_page=1000&page=1"),
    fetchAll("https://api.knack.com/v1/objects/object_4/records?rows_per_page=1000&page=1")
  ]).then(function(resultados){
    const participantes = resultados[0]
    const asistencias   = resultados[1]

    const btn = document.getElementById("btn-cargar-reporte")
    if(btn) btn.style.display = "none"

    const eventoMap = {}
    participantes.forEach(function(p){
      const eventosRaw = p.field_62_raw || p.field_62 || []
      const lista = Array.isArray(eventosRaw)
        ? eventosRaw.map(function(e){ return typeof e === "object" ? (e.identifier || e.name || "") : String(e) })
        : String(eventosRaw).split(",").map(function(e){ return e.trim() })
      lista.forEach(function(ev){
        if(!ev) return
        if(!eventoMap[ev]) eventoMap[ev] = { inscritos:0, asistentes:0 }
        eventoMap[ev].inscritos++
      })
    })
    asistencias.forEach(function(a){
      const ev = (a.field_40 || "").trim()
      if(!ev) return
      if(!eventoMap[ev]) eventoMap[ev] = { inscritos:0, asistentes:0 }
      eventoMap[ev].asistentes++
    })

    const maxAsisteEvento = Math.max.apply(null, Object.values(eventoMap).map(function(v){ return v.asistentes })) || 1
    let htmlEventos = '<table class="rep-table"><thead><tr><th>Evento</th><th>Inscritos</th><th>Asistentes</th><th>Ausentes</th><th>% Asist.</th><th></th></tr></thead><tbody>'
    Object.keys(eventoMap).sort().forEach(function(ev){
      const d = eventoMap[ev]
      const aus = Math.max(0, d.inscritos - d.asistentes)
      const p2  = d.inscritos > 0 ? Math.round(d.asistentes / d.inscritos * 100) : 0
      const w   = Math.round(d.asistentes / maxAsisteEvento * 100)
      htmlEventos += '<tr><td style="font-weight:600;color:#1e2a38">'+ev+'</td><td>'+d.inscritos+'</td><td style="color:#16a34a;font-weight:700">'+d.asistentes+'</td><td style="color:#dc2626">'+aus+'</td><td style="font-weight:700">'+p2+'%</td><td style="width:100px"><div class="barra-wrap"><div class="barra-fill" style="width:'+w+'%"></div></div></td></tr>'
    })
    htmlEventos += '</tbody></table>'
    document.getElementById("tabla-eventos").innerHTML = htmlEventos

    const zonaMap = {}
    participantes.forEach(function(p){
      const zona = (p.field_37 || "Sin zona").trim()
      if(!zonaMap[zona]) zonaMap[zona] = { inscritos:0, asistentes:0 }
      zonaMap[zona].inscritos++
    })
    asistencias.forEach(function(a){
      const zona = (a.field_45 || "Sin zona").trim()
      if(!zonaMap[zona]) zonaMap[zona] = { inscritos:0, asistentes:0 }
      zonaMap[zona].asistentes++
    })

    const maxAsisteZona = Math.max.apply(null, Object.values(zonaMap).map(function(v){ return v.asistentes })) || 1
    let htmlZonas = '<table class="rep-table"><thead><tr><th>Zona</th><th>Inscritos</th><th>Asistentes</th><th>Ausentes</th><th>% Asist.</th><th></th></tr></thead><tbody>'
    Object.keys(zonaMap).sort().forEach(function(zona){
      const insc  = zonaMap[zona].inscritos
      const asist = zonaMap[zona].asistentes
      const aus   = Math.max(0, insc - asist)
      const p2    = insc > 0 ? Math.round(asist / insc * 100) : 0
      const w     = Math.round(asist / maxAsisteZona * 100)
      htmlZonas += '<tr><td style="font-weight:600;color:#1e2a38">'+zona+'</td><td>'+insc+'</td><td style="color:#16a34a;font-weight:700">'+asist+'</td><td style="color:#dc2626">'+aus+'</td><td style="font-weight:700">'+p2+'%</td><td style="width:100px"><div class="barra-wrap"><div class="barra-fill" style="width:'+w+'%"></div></div></td></tr>'
    })
    const totalInsc  = Object.values(zonaMap).reduce(function(s,v){ return s+v.inscritos },0)
    const totalAsist = Object.values(zonaMap).reduce(function(s,v){ return s+v.asistentes },0)
    const totalAus   = Math.max(0, totalInsc - totalAsist)
    const totalPct   = totalInsc > 0 ? Math.round(totalAsist / totalInsc * 100) : 0
    htmlZonas += '<tr style="border-top:2px solid #f5e0e0;background:#fef2f2"><td style="font-weight:800;color:#1e2a38">TOTAL</td><td style="font-weight:800">'+totalInsc+'</td><td style="color:#16a34a;font-weight:800">'+totalAsist+'</td><td style="color:#dc2626;font-weight:800">'+totalAus+'</td><td style="font-weight:800">'+totalPct+'%</td><td></td></tr>'
    htmlZonas += '</tbody></table>'
    document.getElementById("tabla-zonas").innerHTML = htmlZonas

    const ts = document.getElementById("ultima-actualizacion")
    if(ts) ts.textContent = new Date().toLocaleTimeString("es-PE", {hour:"2-digit", minute:"2-digit", second:"2-digit"})

  }).catch(function(err){
    console.error("Error cargando reporte:", err)
    const btn = document.getElementById("btn-cargar-reporte")
    if(btn){ btn.disabled = false; btn.textContent = "🔄 Reintentar"; btn.style.opacity = "1" }
  })
}


/* ══════════════════════════════════════════════════════
   PARTE 7 — ADMIN PANEL
   ── Solo carga al presionar botón ──
══════════════════════════════════════════════════════ */

$(document).on("knack-scene-render.any", function(){
  if(!document.getElementById("admin-root")) return
  setTimeout(function(){
    const btnCargar = document.getElementById("btn-cargar-admin")
    if(!btnCargar) return
    btnCargar.addEventListener("click", function(){
      btnCargar.disabled = true
      btnCargar.textContent = "⏳ Cargando datos..."
      btnCargar.style.opacity = "0.7"
      window._initAdminPanel()
    })
  }, 600)
})

window._initAdminPanel = function(){
  const APP_ID  = window._KNACK_APP_ID
  const API_KEY = window._KNACK_API_KEY
  const HDR     = {"X-Knack-Application-Id": APP_ID, "X-Knack-REST-API-Key": API_KEY}

  let todosParticipantes = []
  let todasAsistencias   = []

  function fetchAll(url, acum){
    acum = acum || []
    return window._fetchSafe(url, {headers: HDR})
    .then(function(r){ return r.json() })
    .then(function(data){
      if(!data || !data.records) return acum
      const todos = acum.concat(data.records)
      if(data.current_page < data.total_pages){
        const next = url.replace(/page=\d+/, "page=" + (data.current_page + 1))
        return fetchAll(next, todos)
      }
      return todos
    })
  }

  Promise.all([
    fetchAll("https://api.knack.com/v1/objects/object_5/records?rows_per_page=1000&page=1"),
    fetchAll("https://api.knack.com/v1/objects/object_4/records?rows_per_page=1000&page=1")
  ]).then(function(res){
    todosParticipantes = res[0]
    todasAsistencias   = res[1]

    window._mapaAsistencias = {}
    todasAsistencias.forEach(function(a){
      const pid = obtenerPid(a)
      if(!pid) return
      if(!window._mapaAsistencias[pid]) window._mapaAsistencias[pid] = []
      window._mapaAsistencias[pid].push(a)
    })

    const btnCargar = document.getElementById("btn-cargar-admin")
    if(btnCargar) btnCargar.style.display = "none"

    renderSeguimiento()
  }).catch(function(err){
    console.error("Error cargando admin panel:", err)
    const btnCargar = document.getElementById("btn-cargar-admin")
    if(btnCargar){ btnCargar.disabled = false; btnCargar.textContent = "🔄 Reintentar"; btnCargar.style.opacity = "1" }
  })

  function obtenerPid(a){
    if(a.field_38_raw){
      if(Array.isArray(a.field_38_raw) && a.field_38_raw[0]) return a.field_38_raw[0].id
      if(typeof a.field_38_raw === "object" && a.field_38_raw.id) return a.field_38_raw.id
      if(typeof a.field_38_raw === "string") return a.field_38_raw
    }
    return a.field_38 || null
  }

  function obtenerEncargado(p){
    if(p.field_35_raw){
      if(Array.isArray(p.field_35_raw) && p.field_35_raw[0])
        return p.field_35_raw[0].identifier || p.field_35_raw[0].name || String(p.field_35_raw[0]) || "—"
      if(typeof p.field_35_raw === "object") return p.field_35_raw.identifier || p.field_35_raw.name || "—"
      if(typeof p.field_35_raw === "string" && p.field_35_raw.trim()) return p.field_35_raw.trim()
    }
    if(p.field_35 && typeof p.field_35 === "string" && p.field_35.trim()) return p.field_35.trim()
    return "—"
  }

  function getEventosParticipante(p){
    const ev = p.field_62_raw || p.field_62 || []
    const lista = Array.isArray(ev)
      ? ev.map(function(e){ return typeof e === "object" ? (e.identifier || e.name || "") : String(e) })
      : String(ev).split(",").map(function(e){ return e.trim() })
    return lista.filter(function(e){ return e })
  }

  function renderSeguimiento(){
    const todos = todosParticipantes.slice().sort(function(a, b){
      const zonaA = (a.field_37 || "").trim()
      const zonaB = (b.field_37 || "").trim()
      if(zonaA !== zonaB) return zonaA.localeCompare(zonaB, "es")
      return (a.field_29 || "").localeCompare(b.field_29 || "", "es")
    })

    const sinAsist = todos.filter(function(p){
      return !window._mapaAsistencias[p.id] || window._mapaAsistencias[p.id].length === 0
    })

    const countEl = document.getElementById("admin-sin-asistencia-count")
    if(countEl) countEl.textContent = sinAsist.length + " sin asistencia de " + todos.length + " inscritos"

    const zonasSet = new Set()
    todos.forEach(function(p){ if(p.field_37) zonasSet.add(p.field_37.trim()) })
    let opcionesZona = '<option value="">Todas las zonas</option>'
    Array.from(zonasSet).sort().forEach(function(z){ opcionesZona += '<option value="'+z+'">'+z+'</option>' })

    const eventosSet = new Set()
    todos.forEach(function(p){ getEventosParticipante(p).forEach(function(e){ if(e) eventosSet.add(e) }) })
    let opcionesEvento = '<option value="">Todos los eventos</option>'
    Array.from(eventosSet).sort().forEach(function(e){ opcionesEvento += '<option value="'+e+'">'+e+'</option>' })

    document.getElementById("admin-sin-asistencia-wrap").innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:16px;">
        <div>
          <label style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Buscar nombre/DNI</label>
          <input id="sa-search" type="text" placeholder="Escribe para buscar..." style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;width:190px;outline:none;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Evento</label>
          <select id="sa-evento" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none;background:#fff;">${opcionesEvento}</select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Zona</label>
          <select id="sa-zona" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none;background:#fff;">${opcionesZona}</select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Asistencia</label>
          <select id="sa-estado" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none;background:#fff;">
            <option value="">Todos</option>
            <option value="ausente">❌ Sin asistencia</option>
            <option value="asistio">✅ Asistió</option>
          </select>
        </div>
        <button id="sa-btn-buscar" style="padding:8px 16px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">🔍 Buscar</button>
        <span id="sa-contador" style="font-size:12px;color:#888;font-weight:600;align-self:center;"></span>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button id="btn-imprimir-ausentes" style="padding:8px 16px;background:#f59e0b;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">🖨️ Imprimir</button>
          <button id="btn-exportar-ausentes" style="padding:8px 16px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">📤 Exportar CSV</button>
        </div>
      </div>
      <div id="sa-tabla-wrap"></div>
    `

    function filtrarSA(){
      const buscar = (document.getElementById("sa-search").value || "").toLowerCase().trim()
      const evento = document.getElementById("sa-evento").value
      const zona   = document.getElementById("sa-zona").value
      const estado = document.getElementById("sa-estado").value
      return todos.filter(function(p){
        const nombre     = (p.field_29 || "").toLowerCase()
        const dni        = (p.field_34 || "").toLowerCase()
        const pZona      = (p.field_37 || "").trim()
        const evs        = getEventosParticipante(p)
        const tieneAsist = window._mapaAsistencias[p.id] && window._mapaAsistencias[p.id].length > 0
        if(buscar && !nombre.includes(buscar) && !dni.includes(buscar)) return false
        if(evento && !evs.includes(evento)) return false
        if(zona && pZona !== zona) return false
        if(estado === "ausente" && tieneAsist) return false
        if(estado === "asistio" && !tieneAsist) return false
        return true
      })
    }

    function renderTablaSA(lista){
      const contador = document.getElementById("sa-contador")
      if(contador) contador.textContent = lista.length + " persona" + (lista.length !== 1 ? "s" : "")
      if(!lista.length){
        document.getElementById("sa-tabla-wrap").innerHTML = '<p style="color:#aaa;text-align:center;padding:24px;font-size:13px;">Sin resultados</p>'
        return
      }
      let html = '<table class="admin-table"><thead><tr><th>Nombre</th><th>DNI / Código</th><th>Zona</th><th>Evento(s)</th><th>Encargado Zonal</th><th>Asistencia</th></tr></thead><tbody>'
      lista.forEach(function(p){
        const evs       = getEventosParticipante(p).join(", ") || "—"
        const encargado = obtenerEncargado(p)
        const tieneAsist = window._mapaAsistencias[p.id] && window._mapaAsistencias[p.id].length > 0
        const badge = tieneAsist ? '<span class="badge-asistio">✅ Asistió</span>' : '<span class="badge-ausente">❌ Ausente</span>'
        html += '<tr><td style="font-weight:600">'+(p.field_29||"—")+'</td><td style="color:#64748b">'+(p.field_34||"—")+'</td><td>'+(p.field_37||"—")+'</td><td style="color:#64748b;font-size:12px">'+evs+'</td><td style="color:#64748b">'+encargado+'</td><td>'+badge+'</td></tr>'
      })
      html += '</tbody></table>'
      document.getElementById("sa-tabla-wrap").innerHTML = html
    }

    function aplicarFiltroSA(){ renderTablaSA(filtrarSA()) }

    document.getElementById("sa-estado").value = "ausente"
    renderTablaSA(sinAsist)
    const contador = document.getElementById("sa-contador")
    if(contador) contador.textContent = sinAsist.length + " persona" + (sinAsist.length !== 1 ? "s" : "")

    document.getElementById("sa-btn-buscar").addEventListener("click", aplicarFiltroSA)
    document.getElementById("sa-search").addEventListener("keydown", function(e){ if(e.key === "Enter") aplicarFiltroSA() })
    ;["sa-zona","sa-evento","sa-estado"].forEach(function(id){
      const el = document.getElementById(id)
      if(el) el.addEventListener("change", aplicarFiltroSA)
    })

    document.getElementById("btn-imprimir-ausentes").addEventListener("click", function(){
      const lista = filtrarSA()
      const v = window.open("")
      v.document.write(`<html><head><style>
        body { font-family:'Segoe UI',Arial,sans-serif; padding:20px; }
        h2 { color:#1e2a38; margin-bottom:8px; }
        p { color:#888; font-size:12px; margin-bottom:16px; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        th { background:#fef2f2; padding:10px 14px; text-align:left; font-size:11px; color:#888; font-weight:700; letter-spacing:.5px; text-transform:uppercase; border-bottom:1px solid #f5e0e0; }
        td { padding:10px 14px; border-bottom:1px solid #fafafa; color:#334155; }
        .badge-asistio { background:#dcfce7; color:#16a34a; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; }
        .badge-ausente { background:#fee2e2; color:#dc2626; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; }
        @media print { @page { margin:10mm; } }
      </style></head><body>
        <h2>📋 Seguimiento de Inscritos — IACYM CNC 2026</h2>
        <p>Total: ${lista.length} personas · ${new Date().toLocaleDateString("es-PE")}</p>
      `)
      let tbl = '<table><thead><tr><th>Nombre</th><th>DNI</th><th>Zona</th><th>Evento(s)</th><th>Encargado Zonal</th><th>Asistencia</th></tr></thead><tbody>'
      lista.forEach(function(p){
        const evs       = getEventosParticipante(p).join(", ") || "—"
        const encargado = obtenerEncargado(p)
        const tieneAsist = window._mapaAsistencias[p.id] && window._mapaAsistencias[p.id].length > 0
        const badge = tieneAsist ? '<span class="badge-asistio">✅ Asistió</span>' : '<span class="badge-ausente">❌ Ausente</span>'
        tbl += '<tr><td style="padding:10px 14px;border-bottom:1px solid #fafafa;font-weight:600">'+(p.field_29||"—")+'</td><td style="padding:10px 14px;border-bottom:1px solid #fafafa;color:#64748b">'+(p.field_34||"—")+'</td><td style="padding:10px 14px;border-bottom:1px solid #fafafa">'+(p.field_37||"—")+'</td><td style="padding:10px 14px;border-bottom:1px solid #fafafa;color:#64748b">'+evs+'</td><td style="padding:10px 14px;border-bottom:1px solid #fafafa;color:#64748b">'+encargado+'</td><td style="padding:10px 14px;border-bottom:1px solid #fafafa">'+badge+'</td></tr>'
      })
      tbl += '</tbody></table>'
      v.document.write(tbl)
      v.document.write("</body></html>")
      v.document.close()
      setTimeout(function(){ v.print() }, 500)
    })

    document.getElementById("btn-exportar-ausentes").addEventListener("click", function(){
      const lista = filtrarSA()
      let csv = "Nombre,DNI,Zona,Evento(s),Encargado Zonal,Asistencia\n"
      lista.forEach(function(p){
        const evs       = getEventosParticipante(p).join("; ") || ""
        const encargado = obtenerEncargado(p)
        const tieneAsist = window._mapaAsistencias[p.id] && window._mapaAsistencias[p.id].length > 0
        csv += ['"'+(p.field_29||"").replace(/"/g,'""')+'"','"'+(p.field_34||"")+'"','"'+(p.field_37||"")+'"','"'+evs+'"','"'+encargado+'"',tieneAsist?"Asistió":"Ausente"].join(",") + "\n"
      })
      const blob = new Blob(["\uFEFF" + csv], {type:"text/csv;charset=utf-8;"})
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = "seguimiento-" + new Date().toISOString().slice(0,10) + ".csv"
      link.click()
    })
  }
}
