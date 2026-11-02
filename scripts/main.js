// ============================================================
//  Configuración y reglas de negocio
// ============================================================
const ADMIN = { usuario: 'admin', clave: 'admin123' };
const IGV = 0.18;
const ADELANTO = 0.5;       // RN05 / RN12: adelanto y saldo del 50%
const PARCIAL = 0.5;        // RN11: porcentaje devuelto entre 15 y 29 días
const CAPACIDAD = 800;      // RN09: comensales máximos confirmados por fecha
const DIAS_MIN = 30;        // RN07
const DIAS_EXCEPCION = 10;  // RN08

// Catálogo de elementos: precio por unidad (n=nombre, p=precio, u=unidad,
// por=cada cuántos comensales se necesita 1, fijo=cantidad fija)
const CAT = {
    cafe: { n: 'Café e infusiones', p: 6, u: 'persona', por: 1 },
    sandwich: { n: 'Sándwiches variados', p: 8, u: 'persona', por: 1 },
    postres: { n: 'Postres individuales', p: 5, u: 'persona', por: 1 },
    jugos: { n: 'Jugos naturales', p: 6, u: 'persona', por: 1 },
    entrada: { n: 'Entrada fría', p: 8, u: 'persona', por: 1 },
    fondo: { n: 'Plato de fondo', p: 18, u: 'persona', por: 1 },
    bebida: { n: 'Bebida (gaseosa o chicha)', p: 4, u: 'persona', por: 1 },
    piqueos: { n: 'Piqueos de bienvenida', p: 18, u: 'docena', por: 6 },
    pisco: { n: 'Pisco sour de bienvenida', p: 14, u: 'copa', por: 1 },
    bufet: { n: 'Buffet criollo (5 platos)', p: 45, u: 'persona', por: 1 },
    vajilla: { n: 'Vajilla y cristalería', p: 6, u: 'persona', por: 1 },
    cena: { n: 'Cena de 3 tiempos', p: 85, u: 'persona', por: 1 },
    barra: { n: 'Barra libre de bebidas', p: 30, u: 'persona', por: 1 },
    torta: { n: 'Torta de matrimonio', p: 350, u: 'unidad', fijo: 1 },
    mozo: { n: 'Mozo adicional', p: 80, u: 'turno', por: 25 },
    mesas: { n: 'Mesas y sillas (set de 10)', p: 120, u: 'set', por: 10 },
    decoracion: { n: 'Decoración temática', p: 450, u: 'servicio', fijo: 1 }
};

// HU015: paquetes predefinidos (lista de elementos)
const PAQUETES = {
    'Coffee Break': ['cafe', 'sandwich', 'postres', 'jugos'],
    'Almuerzo Ejecutivo': ['entrada', 'fondo', 'bebida', 'postres'],
    'Cóctel de Bienvenida': ['piqueos', 'pisco', 'bebida'],
    'Buffet Criollo': ['bufet', 'bebida', 'postres', 'vajilla'],
    'Matrimonio Premium': ['cena', 'barra', 'torta', 'mozo', 'mesas', 'decoracion', 'vajilla'],
    'Menú a medida': []
};

// RN04: cada proforma y cada pedido tienen un solo estado a la vez
const PF = { BORR: 'Borrador', ENV: 'Enviada', CAM: 'Cambios solicitados', ACE: 'Aceptada', REC: 'Rechazada', VEN: 'Vencida', REE: 'Reemplazada' };
const PE = { PEND: 'Pendiente de adelanto', POR: 'Adelanto por confirmar', CONF: 'Confirmado', CER: 'Cerrado', CAN: 'Cancelado' };
const ESTADOS = ['Sin proforma', PF.BORR, PF.ENV, PF.CAM, PF.VEN, PF.REC, PE.PEND, PE.POR, PE.CONF, PE.CER, PE.CAN];

// ============================================================
//  Datos (RN03: nada se elimina)
// ============================================================
let db = { usuarios: [], solicitudes: [], notificaciones: [], cp: 0 };
try {
    const nuevo = JSON.parse(localStorage.getItem('catering2'));
    if (nuevo) db = { ...db, ...nuevo };
    else db.usuarios = (JSON.parse(localStorage.getItem('catering')) || {}).usuarios || [];
} catch (e) { }
const guardar = () => { try { localStorage.setItem('catering2', JSON.stringify(db)); } catch (e) { } };

// ---------- Estado de la interfaz ----------
let user = null;
try { user = JSON.parse(sessionStorage.getItem('catering_sesion')); } catch (e) { }
const guardarSesion = () => {
    try { user ? sessionStorage.setItem('catering_sesion', JSON.stringify(user)) : sessionStorage.removeItem('catering_sesion'); } catch (e) { }
};
let borrador = { items: [] };  // solicitud mientras se llena el formulario
let pedidoId = null;           // solicitud que se está viendo
let editando = false;
let verVersion = null;         // versión de proforma que se está mirando
let repintar = () => { };
let retorno = () => { };
let filtro = { texto: '', estado: '' };
let temporizador = null;

// ============================================================
//  Utilidades
// ============================================================
const $ = id => document.getElementById(id);
const valor = id => $(id).value.trim();
const soles = n => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const redondear = n => Math.round(n * 100) / 100;
const numero = id => id ? 'N° ' + String(id).padStart(3, '0') : '';
const codigo = (pref, id, n = 3) => `${pref}-${String(id).padStart(n, '0')}`;
const buscar = id => db.solicitudes.find(s => s.id == id);
const slug = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const unidadTxt = i => `${soles(i.precio)} / ${i.unidad}`;

const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoyISO = () => isoLocal(new Date());
const fechaDe = s => new Date(s + 'T00:00:00');
const fechaLarga = s => s ? fechaDe(s).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const diasHasta = s => Math.round((fechaDe(s) - fechaDe(hoyISO())) / 86400000);
const sumarDias = (s, n) => { const d = fechaDe(s); d.setDate(d.getDate() + n); return isoLocal(d); };

const telOk = t => /^9\d{8}$/.test(t.replace(/[\s-]/g, '').replace(/^\+51/, ''));
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

const totalesDe = items => {
    const sub = items.reduce((s, i) => s + i.cant * i.precio, 0);
    return { sub, igv: sub * IGV, total: sub * (1 + IGV) };
};

// ---------- Estados y consultas ----------
const vigente = s => s.proformas[s.proformas.length - 1];
const estadoCaso = s => s.pedido ? s.pedido.estado : s.proformas?.length ? vigente(s).estado : 'Sin proforma';
const etiqueta = e => user?.rol != 'admin' && e == PF.BORR ? 'En elaboración' : e;
const pagado = s => (s.pedido?.pagos || []).reduce((t, p) => t + p.monto, 0);
const pendientePago = s => s.pedido.estado == PE.CAN ? 0 : Math.max(0, redondear(s.pedido.total - pagado(s)));
const cancelable = s => !!s.pedido && [PE.PEND, PE.POR, PE.CONF].includes(s.pedido.estado) && diasHasta(s.fecha) >= 0;

function caso_cerrado(s) {
    return (s.pedido && [PE.CER, PE.CAN].includes(s.pedido.estado)) || (!s.pedido && s.proformas.length && vigente(s).estado == PF.REC) || s.excepcion == 'denegada';
}

function prioridad(s) {
    if (caso_cerrado(s)) return '—';
    const dias = diasHasta(s.fecha);
    return dias <= 7 ? 'Alta' : dias <= 30 ? 'Media' : 'Baja';
}

// Lo que el vendedor debe atender (HU003)
function pendiente(s) {
    if (s.excepcion == 'pendiente') return 'Autorizar excepción';
    if (s.excepcion == 'denegada') return '';
    if (s.pedido) {
        if (s.pedido.estado == PE.POR) return 'Confirmar pedido';
        if (s.pedido.estado == PE.CONF) return 'Cobrar saldo';
        return '';
    }
    if (!s.proformas.length) return 'Elaborar proforma';
    const e = vigente(s).estado;
    return e == PF.BORR ? 'Terminar proforma' : e == PF.CAM ? 'Atender cambios' : e == PF.VEN ? 'Emitir nueva versión' : '';
}

// RN09: capacidad por fecha
function disponible(fecha, com, excluir) {
    const ocupados = db.solicitudes
        .filter(x => x.id != excluir && x.fecha == fecha && x.pedido && [PE.CONF, PE.CER].includes(x.pedido.estado))
        .reduce((t, x) => t + (+x.com || 0), 0);
    return ocupados + (+com || 0) <= CAPACIDAD;
}

// RN10: las proformas enviadas vencen al pasar su fecha límite
function actualizarVencimientos() {
    let cambio = false;
    db.solicitudes.forEach(s => {
        const v = s.proformas.length ? vigente(s) : null;
        if (v && v.estado == PF.ENV && hoyISO() > v.limite) {
            v.estado = PF.VEN;
            cambio = true;
            const cod = `${codigo('PF', s.id)}-v${v.v}`;
            notificar(s.email, `La proforma ${cod} venció. Pide una nueva proforma para continuar.`, s.id);
            notificar('admin', `La proforma ${cod} de ${s.nombre} venció.`, s.id);
        }
    });
    if (cambio) guardar();
}

// ---------- Avisos (HU012) ----------
function notificar(para, texto, sid) {
    db.notificaciones.unshift({ id: Date.now() + Math.random(), para, texto, sid, fecha: new Date().toISOString(), leida: false });
}
const misAvisos = () => db.notificaciones.filter(n => n.para == (user.rol == 'admin' ? 'admin' : user.email));

// ---------- Datos para mostrar ----------
function datosSolicitud(s) {
    const t = totalesDe(s.items || []);
    const dias = s.fecha ? diasHasta(s.fecha) : null;
    return {
        ...s,
        numero: numero(s.id),
        fechaTexto: fechaLarga(s.fecha),
        anticipacion: dias == null ? '' : dias < 0 ? 'Evento realizado' : dias == 0 ? 'El evento es hoy' : `Faltan ${dias} días para el evento`,
        estado: s.proformas ? etiqueta(estadoCaso(s)) : '',
        excepcionTexto: s.excepcion == 'pendiente' ? '⚠ Menos de 30 días de anticipación: requiere autorización del vendedor.'
            : s.excepcion == 'autorizada' ? 'Excepción de anticipación autorizada por el vendedor.'
                : s.excepcion == 'denegada' ? 'Excepción denegada: registra una nueva solicitud con 30 días o más de anticipación.' : '',
        estSubtotal: soles(t.sub), estIgv: soles(t.igv), estTotal: soles(t.total)
    };
}

// Rellena cada elemento con data-campo="x" usando datos.x
function llenar(cont, datos) {
    cont.querySelectorAll('[data-campo]').forEach(el => {
        const campo = el.dataset.campo;
        if (!(campo in datos)) return;
        const v = datos[campo];
        const vacio = v === '' || v == null;
        el.textContent = vacio ? '—' : v;
        if ('ocultar' in el.dataset) el.hidden = vacio;
        if (/^(estado|\w+Estado)$/.test(campo)) el.className = 'tag est-' + slug(vacio ? '' : v);
        if (campo == 'prioridad') el.className = vacio || v == '—' ? '' : 'tag pri-' + slug(v);
    });
}

// conPrecio=false: vista del cliente antes de recibir la proforma (solo elemento y cantidad)
function pintarLineas(tbody, items, conPrecio = true) {
    tbody.innerHTML = '';
    items.forEach(i => {
        const l = $(conPrecio ? 'tplLinea' : 'tplLineaCant').content.cloneNode(true);
        llenar(l, { desc: i.desc, precioUnidad: unidadTxt(i), cant: i.cant, subLinea: soles(i.cant * i.precio) });
        tbody.append(l);
    });
}

// ---------- Navegación ----------
function ir(seccion, texto = '', tipo = 'ok') {
    document.querySelectorAll('main section').forEach(s => s.hidden = s.id != seccion);
    $('menu').hidden = !user;
    document.querySelectorAll('.solo-cliente').forEach(e => e.hidden = user?.rol != 'cliente');
    document.querySelectorAll('.solo-admin').forEach(e => e.hidden = user?.rol != 'admin');
    const nav = {
        evento: 'nuevo', revision: 'nuevo', misCotizaciones: 'mis', verCotizacion: 'mis',
        comprobante: user?.rol == 'admin' ? 'sol' : 'mis', solicitudes: 'sol', gestion: 'sol', proforma: 'sol', avisos: 'av'
    }[seccion];
    document.querySelectorAll('nav [data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav == nav));
    if (user) {
        $('nombreUsuario').textContent = user.nombre;
        const n = misAvisos().filter(a => !a.leida).length;
        document.querySelectorAll('[data-badge]').forEach(b => { b.textContent = n; b.hidden = !n; });
    }
    window.scrollTo({ top: 0 });
    aviso(texto, tipo);
}

function aviso(texto, tipo = 'ok') {
    clearTimeout(temporizador);
    $('mensaje').textContent = texto;
    $('mensaje').className = tipo == 'error' ? 'error' : '';
    $('mensaje').hidden = !texto;
    if (texto) temporizador = setTimeout(() => $('mensaje').hidden = true, 5000);
}

// reglas: [[idCampo, esValido, mensaje], ...]
function validar(reglas) {
    const malas = reglas.filter(([id, ok]) => { $(id).classList.toggle('invalid', !ok); return !ok; });
    if (malas.length) { $(malas[0][0]).focus(); aviso(malas[0][2], 'error'); }
    return !malas.length;
}

// ============================================================
//  Acceso (HU013, RN13)
// ============================================================
function iniciarSesion(u) {
    const { clave, ...publico } = u;
    user = { rol: 'cliente', ...publico };
    guardarSesion();
    actualizarVencimientos();
    db.solicitudes.some(s => s.email == user.email) ? mostrarCotizaciones(`¡Hola, ${user.nombre.split(' ')[0]}!`) : nuevoEvento();
}

function entrar() {
    const email = valor('login_email').toLowerCase();
    const u = db.usuarios.find(x => x.email == email && x.clave == valor('login_clave'));
    if (!u) return aviso('Correo o contraseña incorrectos.', 'error');
    iniciarSesion(u);
}

function registrar() {
    const u = { nombre: valor('reg_nombre'), tel: valor('reg_tel'), email: valor('reg_email').toLowerCase(), clave: valor('reg_clave') };
    if (!validar([
        ['reg_nombre', u.nombre.length >= 3, 'Escribe tu nombre completo.'],
        ['reg_tel', telOk(u.tel), 'El teléfono debe tener 9 dígitos y empezar con 9.'],
        ['reg_email', emailOk(u.email), 'Ingresa un correo válido.'],
        ['reg_clave', u.clave.length >= 6, 'La contraseña debe tener al menos 6 caracteres.']
    ])) return;
    if (db.usuarios.some(x => x.email == u.email)) return aviso('Ese correo ya está registrado.', 'error');
    db.usuarios.push(u);
    guardar();
    iniciarSesion(u);
}

function entrarAdmin() {
    if (valor('admin_usuario') != ADMIN.usuario || valor('admin_clave') != ADMIN.clave) {
        return aviso('Usuario o contraseña incorrectos.', 'error');
    }
    user = { rol: 'admin', nombre: 'Vendedor' };
    guardarSesion();
    actualizarVencimientos();
    mostrarSolicitudes();
}

function salir() {
    user = null; borrador = { items: [] }; editando = false;
    guardarSesion();
    document.querySelectorAll('#login input, #registro input, #admin input').forEach(i => i.value = '');
    ir('login');
}

// ============================================================
//  Cliente: registrar solicitud (HU001, HU015) y validarla (HU002)
// ============================================================
const defCant = (c, com) => c.fijo ?? Math.max(1, Math.ceil((+com || 1) / c.por));
const itemDe = (cat, com) => { const c = CAT[cat]; return { cat, desc: c.n, unidad: c.u, precio: c.p, cant: defCant(c, com), manual: false }; };

function nuevoEvento() {
    borrador = { items: [] };
    editando = false;
    mostrarEvento();
}

function mostrarEvento() {
    const d = borrador;
    $('tituloEvento').textContent = editando ? `Modificar solicitud ${numero(pedidoId)}` : 'Nueva solicitud de catering';
    $('f_nombre').value = d.nombre ?? user.nombre;
    $('f_tel').value = d.tel ?? user.tel ?? '';
    $('f_tipo').value = d.tipo || '';
    $('f_fecha').value = d.fecha || '';
    $('f_fecha').min = sumarDias(hoyISO(), DIAS_EXCEPCION);
    $('f_com').value = d.com || '';
    $('f_ubic').value = d.ubic || '';
    $('f_specs').value = d.specs || '';
    document.querySelectorAll('#evento .invalid').forEach(e => e.classList.remove('invalid'));
    dibujarElementos();
    ir('evento');
}

function cambiarTipo() {
    borrador.items = (PAQUETES[$('f_tipo').value] || []).map(c => itemDe(c, $('f_com').value));
    dibujarElementos();
}

function recalcularCantidades() {
    borrador.items.forEach(i => { if (!i.manual && i.cat) i.cant = defCant(CAT[i.cat], $('f_com').value); });
    dibujarElementos();
}

function dibujarElementos() {
    const items = borrador.items;
    $('bloqueElementos').hidden = !$('f_tipo').value;
    $('filasElementos').innerHTML = '';
    items.forEach((it, k) => {
        const fila = $('tplElemento').content.cloneNode(true);
        llenar(fila, { desc: it.desc });
        const inp = fila.querySelector('[data-item=cant]');
        inp.value = it.cant;
        inp.oninput = () => { it.cant = Math.max(0, +inp.value || 0); it.manual = true; };
        fila.querySelector('[data-accion=quitar]').onclick = () => { items.splice(k, 1); dibujarElementos(); };
        $('filasElementos').append(fila);
    });
    const usados = new Set(items.map(i => i.cat));
    $('f_extra').innerHTML = Object.entries(CAT).filter(([id]) => !usados.has(id))
        .map(([id, c]) => `<option value="${id}">${c.n} (por ${c.u})</option>`).join('');
}

function agregarElemento() {
    const cat = $('f_extra').value;
    if (!cat) return;
    borrador.items.push(itemDe(cat, $('f_com').value));
    dibujarElementos();
}

function revisarEvento() {
    borrador = {
        nombre: valor('f_nombre'), tel: valor('f_tel'), tipo: valor('f_tipo'), fecha: valor('f_fecha'),
        com: valor('f_com'), ubic: valor('f_ubic'), specs: valor('f_specs'), items: borrador.items
    };
    const d = borrador;
    const dias = d.fecha ? diasHasta(d.fecha) : -1;
    // RN16: sin tipo de servicio, fecha, comensales y ubicación no se envía
    if (!validar([
        ['f_nombre', d.nombre.length >= 3, 'Escribe tu nombre completo.'],
        ['f_tel', telOk(d.tel), 'El teléfono debe tener 9 dígitos y empezar con 9.'],
        ['f_tipo', !!d.tipo, 'Selecciona un tipo de servicio.'],
        ['f_fecha', dias >= DIAS_EXCEPCION, `La fecha debe tener al menos ${DIAS_EXCEPCION} días de anticipación (lo normal son ${DIAS_MIN}).`],
        ['f_com', Number.isInteger(+d.com) && +d.com >= 1 && +d.com <= 5000, 'Los comensales deben ser entre 1 y 5000.'],
        ['f_extra', d.items.length > 0 && d.items.every(i => i.cant > 0), 'Agrega al menos un elemento y deja todas las cantidades mayores a 0.'],
        ['f_ubic', d.ubic.length >= 3, 'Indica la ubicación del evento.']
    ])) return;
    // RN07 / RN08
    d.excepcion = dias < DIAS_MIN ? 'pendiente' : null;
    llenar($('revDatos'), datosSolicitud(d));
    llenar($('revision'), datosSolicitud(d));
    pintarLineas($('revItems'), d.items, false);
    ir('revision');
}

function enviarEvento() {
    const d = borrador;
    const items = d.items.map(({ cat, desc, unidad, precio, cant }) => ({ cat, desc, unidad, precio, cant }));
    const campos = { nombre: d.nombre, tel: d.tel, tipo: d.tipo, fecha: d.fecha, com: d.com, ubic: d.ubic, specs: d.specs, items };
    let texto;
    if (editando) {
        const s = buscar(pedidoId);
        const exc = d.excepcion ? (s.excepcion == 'autorizada' && s.fecha == d.fecha ? 'autorizada' : 'pendiente') : null;
        Object.assign(s, campos, { excepcion: exc });
        if (exc == 'pendiente') notificar('admin', `${s.nombre} modificó la solicitud ${numero(s.id)} (requiere autorización).`, s.id);
        texto = 'Solicitud modificada correctamente.';
    } else {
        const id = db.solicitudes.reduce((m, s) => Math.max(m, s.id), 0) + 1;
        db.solicitudes.push({ id, email: user.email, ...campos, excepcion: d.excepcion, creado: hoyISO(), proformas: [], pedido: null });
        notificar('admin', `Nueva solicitud ${numero(id)} de ${d.nombre}${d.excepcion ? ' (menos de 30 días: requiere autorización)' : ''}.`, id);
        texto = d.excepcion ? 'Solicitud enviada. El vendedor debe autorizar la fecha por tener menos de 30 días.' : 'Solicitud enviada. Pronto recibirás tu proforma.';
    }
    guardar();
    borrador = { items: [] };
    editando = false;
    mostrarCotizaciones(texto);
}

// ============================================================
//  Cliente: solicitudes, proformas y pedidos (HU017, HU018)
// ============================================================
function mostrarCotizaciones(texto = '') {
    actualizarVencimientos();
    const mias = db.solicitudes.filter(s => s.email == user.email).slice().reverse();
    $('sinCotizaciones').hidden = mias.length > 0;
    $('listaCotizaciones').innerHTML = '';

    mias.forEach(s => {
        const tarjeta = $('tplCotizacion').content.cloneNode(true);
        const visibles = s.proformas.filter(p => p.estado != PF.BORR);
        const ult = visibles[visibles.length - 1];
        let total = 'Proforma en preparación';
        if (s.pedido) total = `Total del pedido: ${soles(s.pedido.total)} · Pagado: ${soles(pagado(s))}`;
        else if (ult) total = `Proforma v${ult.v}: ${soles(totalesDe(ult.items).total)}`;
        else if (s.excepcion == 'pendiente') total = 'Esperando autorización del vendedor';
        else if (s.excepcion == 'denegada') total = 'Solicitud no autorizada';
        llenar(tarjeta, {
            ...datosSolicitud(s),
            resumen: `${s.tipo} · ${fechaLarga(s.fecha)} · ${s.com} comensales`,
            totalTexto: total
        });
        tarjeta.querySelector('[data-accion=ver]').onclick = () => mostrarCotizacion(s.id);
        const bMod = tarjeta.querySelector('[data-accion=modificar]');
        if (s.proformas.length || s.pedido || s.excepcion == 'denegada') bMod.remove();
        else bMod.onclick = () => modificar(s.id);
        const bCan = tarjeta.querySelector('[data-accion=cancelar]');
        if (cancelable(s)) bCan.onclick = () => { pedidoId = s.id; cancelarPedido(); };
        else bCan.remove();
        $('listaCotizaciones').append(tarjeta);
    });

    ir('misCotizaciones', texto);
}

function modificar(id) {
    const s = buscar(id);
    borrador = {
        nombre: s.nombre, tel: s.tel, tipo: s.tipo, fecha: s.fecha, com: s.com, ubic: s.ubic, specs: s.specs,
        items: s.items.map(i => ({ ...i, manual: true }))
    };
    pedidoId = id;
    editando = true;
    mostrarEvento();
}

const versionVista = s => {
    const lista = s.proformas.filter(p => user.rol == 'admin' || p.estado != PF.BORR);
    return lista.find(p => p.v == verVersion) || lista[lista.length - 1] || null;
};

function pintarProforma(cont, s, pf) {
    const t = totalesDe(pf.items);
    const adelanto = redondear(t.total * ADELANTO);
    llenar(cont, {
        pfCodigo: `${codigo('PF', s.id)}-v${pf.v}`,
        pfEstado: pf.estado,
        pfVigencia: pf.enviada
            ? `Emitida el ${fechaLarga(pf.enviada)} · ${pf.estado == PF.VEN ? 'venció' : 'válida hasta'} el ${fechaLarga(pf.limite)}. Los precios quedan fijos mientras esté vigente.`
            : 'En elaboración.',
        subtotal: soles(t.sub), igv: soles(t.igv), total: soles(t.total),
        adelanto: soles(adelanto), saldo: soles(redondear(t.total - adelanto))
    });
    pintarLineas(cont.querySelector('[data-role=items]'), pf.items);

    const partes = [];
    if (pf.notas) partes.push('Condiciones: ' + pf.notas);
    if (pf.comentarioCliente) partes.push('Cambios solicitados: ' + pf.comentarioCliente);
    if (pf.motivoRechazo) partes.push('Motivo del rechazo: ' + pf.motivoRechazo);
    if (pf.estado == PF.REE) partes.push(`Reemplazada por la versión v${pf.v + 1}.`);
    if (pf.renovacion) partes.push('El cliente pidió una nueva proforma.');
    const nota = cont.querySelector('[data-role=nota]');
    nota.textContent = partes.join(' · ');
    nota.hidden = !partes.length;

    const sel = cont.querySelector('[data-role=version]');
    const versiones = s.proformas.filter(p => user.rol == 'admin' || p.estado != PF.BORR);
    sel.innerHTML = versiones.map(p => `<option value="${p.v}" ${p.v == pf.v ? 'selected' : ''}>v${p.v} · ${etiqueta(p.estado)}</option>`).join('');
    sel.hidden = versiones.length < 2;
    sel.onchange = () => { verVersion = +sel.value; repintar(); };
}

function pintarPedido(cont, s) {
    const pe = s.pedido;
    llenar(cont, {
        peCodigo: codigo('PE', s.id), peEstado: pe.estado,
        peTotal: soles(pe.total), peAdelanto: soles(pe.adelanto), peSaldo: soles(pe.saldo),
        pePagado: soles(pagado(s)), pePendiente: soles(pendientePago(s))
    });
    const tbody = cont.querySelector('[data-role=pagos]');
    tbody.innerHTML = '';
    pe.pagos.forEach(p => {
        const fila = $('tplPago').content.cloneNode(true);
        llenar(fila, {
            comprobante: p.comprobante, concepto: p.tipo == 'Adelanto' ? 'Pago adelantado (50%)' : 'Pago del saldo (50%)',
            fechaTexto: fechaLarga(p.fecha), metodo: p.metodo, montoTexto: soles(p.monto)
        });
        fila.querySelector('[data-accion=ver]').onclick = () => verComprobante(s.id, p.id);
        tbody.append(fila);
    });
    if (!pe.pagos.length) tbody.innerHTML = '<tr><td colspan="6" class="vacio">Aún no hay pagos registrados.</td></tr>';

    const nota = cont.querySelector('[data-role=nota]');
    const c = pe.cancelacion;
    nota.textContent = c ? `Cancelado el ${fechaLarga(c.fecha)} a ${c.dias} días del evento. Adelanto devuelto: ${soles(c.devuelto)} · retenido: ${soles(c.retenido)}.` : '';
    nota.hidden = !c;
}

function mostrarCotizacion(id, mantener = false, texto = '') {
    actualizarVencimientos();
    pedidoId = id;
    if (!mantener) verVersion = null;
    repintar = () => mostrarCotizacion(id, true);
    const s = buscar(id);
    llenar($('verCotizacion'), datosSolicitud(s));

    const pf = versionVista(s);
    $('sinProforma').hidden = !!pf;
    if (!pf) pintarLineas($('cSolicitado'), s.items, false);
    $('cProforma').hidden = !pf;
    if (pf) pintarProforma($('cProforma'), s, pf);

    const accionable = !!pf && pf === vigente(s) && !s.pedido;
    const env = accionable && pf.estado == PF.ENV;
    ['btnAceptar', 'btnCambios', 'btnRechazar'].forEach(b => $(b).hidden = !env);
    $('btnRenovar').hidden = !(accionable && pf.estado == PF.VEN && !pf.renovacion);
    $('btnImprimir').hidden = !pf;
    $('accionesProforma').hidden = !pf;

    $('cPedido').hidden = !s.pedido;
    if (s.pedido) pintarPedido($('cPedido'), s);
    $('panelPago').hidden = s.pedido?.estado != PE.PEND;
    if (s.pedido) $('pgMonto').textContent = soles(s.pedido.adelanto);
    $('pg_metodo').value = ''; $('pg_ref').value = '';
    $('btnCancelar').hidden = !cancelable(s);
    ir('verCotizacion', texto);
}

// ---------- HU007 aceptar / HU006 pedir cambios / HU008 rechazar ----------
function aceptarProforma() {
    const s = buscar(pedidoId), pf = vigente(s);
    if (pf.estado != PF.ENV) return aviso('Esta proforma ya no está disponible para aceptar.', 'error');
    if (hoyISO() > pf.limite) { actualizarVencimientos(); return mostrarCotizacion(s.id, false, 'La proforma venció. Pide una nueva proforma.'); }
    const t = totalesDe(pf.items);
    if (!confirm(`¿Aceptar la proforma por ${soles(t.total)}? Se generará tu pedido y deberás pagar el 50% de adelanto.`)) return;
    pf.estado = PF.ACE;
    const total = redondear(t.total), adelanto = redondear(total * ADELANTO);
    // RN01: el pedido nace de una proforma aceptada
    s.pedido = { estado: PE.PEND, creado: hoyISO(), v: pf.v, total, adelanto, saldo: redondear(total - adelanto), pagos: [] };
    notificar('admin', `${s.nombre} aceptó la proforma ${codigo('PF', s.id)}-v${pf.v}. Pedido ${codigo('PE', s.id)} generado.`, s.id);
    guardar();
    mostrarCotizacion(s.id, false, '¡Proforma aceptada! Registra el pago adelantado para reservar tu evento.');
}

function pedirCambios() {
    const s = buscar(pedidoId), pf = vigente(s);
    const c = prompt('¿Qué cambios necesitas en la proforma?');
    if (!c || !c.trim()) return;
    pf.estado = PF.CAM;
    pf.comentarioCliente = c.trim();
    notificar('admin', `${s.nombre} pidió cambios en ${codigo('PF', s.id)}-v${pf.v}: "${c.trim()}"`, s.id);
    guardar();
    mostrarCotizacion(s.id, false, 'Enviamos tu pedido de cambios. Recibirás una nueva versión.');
}

function rechazarProforma() {
    const s = buscar(pedidoId), pf = vigente(s);
    const m = prompt('Indica el motivo del rechazo:');
    if (!m || !m.trim()) return aviso('Para rechazar debes indicar un motivo.', 'error');
    pf.estado = PF.REC;
    pf.motivoRechazo = m.trim();
    notificar('admin', `${s.nombre} rechazó ${codigo('PF', s.id)}-v${pf.v}. Motivo: ${m.trim()}`, s.id);
    guardar();
    mostrarCotizacion(s.id, false, 'Proforma rechazada. Queda registrada en tu historial.');
}

function pedirRenovacion() {
    const s = buscar(pedidoId), pf = vigente(s);
    pf.renovacion = true;
    notificar('admin', `${s.nombre} pide una nueva proforma (la ${codigo('PF', s.id)}-v${pf.v} venció).`, s.id);
    guardar();
    mostrarCotizacion(s.id, true, 'Avisamos al vendedor para que emita una nueva proforma.');
}

// ---------- HU009 pago adelantado ----------
function nuevoPago(s, tipo, metodo, ref) {
    const id = ++db.cp;
    const pago = {
        id, tipo, monto: tipo == 'Adelanto' ? s.pedido.adelanto : s.pedido.saldo, fecha: hoyISO(), metodo, ref,
        comprobante: codigo('CP', id, 4)   // RN14: cada pago genera un comprobante
    };
    s.pedido.pagos.push(pago);
    return pago;
}

function pagarAdelanto() {
    const s = buscar(pedidoId);
    if (s.pedido?.estado != PE.PEND) return;
    if (!validar([
        ['pg_metodo', !!valor('pg_metodo'), 'Elige el método de pago.'],
        ['pg_ref', valor('pg_ref').length >= 4, 'Ingresa el N° de operación (mínimo 4 caracteres).']
    ])) return;
    const p = nuevoPago(s, 'Adelanto', valor('pg_metodo'), valor('pg_ref'));
    s.pedido.estado = PE.POR;
    notificar(user.email, `Registraste tu pago adelantado de ${soles(p.monto)}. Comprobante ${p.comprobante}. El vendedor confirmará tu pedido.`, s.id);
    notificar('admin', `${s.nombre} registró el adelanto (${soles(p.monto)}) del pedido ${codigo('PE', s.id)}. Falta confirmar.`, s.id);
    guardar();
    mostrarCotizacion(s.id, false, 'Pago adelantado registrado. Ya puedes ver tu comprobante.');
}

// ---------- HU011 cancelar pedido (RN06, RN11) ----------
function cancelarPedido() {
    const s = buscar(pedidoId);
    if (!cancelable(s)) return aviso('Este pedido ya no se puede cancelar.', 'error');
    const dias = diasHasta(s.fecha);
    const adelanto = s.pedido.pagos.filter(p => p.tipo == 'Adelanto').reduce((t, p) => t + p.monto, 0);
    const devuelto = redondear(dias >= 30 ? adelanto : dias >= 15 ? adelanto * PARCIAL : 0);
    const retenido = redondear(adelanto - devuelto);
    const regla = dias >= 30 ? 'devolución completa (30 días o más)' : dias >= 15 ? 'devolución parcial (15 a 29 días)' : 'sin devolución (menos de 15 días)';
    const msg = adelanto
        ? `Faltan ${dias} días para tu evento: ${regla}.\nAdelanto pagado: ${soles(adelanto)}\nSe devolverá: ${soles(devuelto)}\nSe retendrá: ${soles(retenido)}\n\n¿Cancelar el pedido?`
        : '¿Cancelar el pedido? Aún no registraste pagos.';
    if (!confirm(msg)) return;
    s.pedido.estado = PE.CAN;
    s.pedido.cancelacion = { fecha: hoyISO(), dias, devuelto, retenido };
    notificar('admin', `${s.nombre} canceló el pedido ${codigo('PE', s.id)} (a ${dias} días). Devolver ${soles(devuelto)}.`, s.id);
    notificar(s.email, `Cancelaste el pedido ${codigo('PE', s.id)}. Devolución del adelanto: ${soles(devuelto)}.`, s.id);
    guardar();
    mostrarCotizacion(s.id, false, adelanto ? `Pedido cancelado. Devolución: ${soles(devuelto)}.` : 'Pedido cancelado.');
}

// ---------- HU016 comprobante ----------
function verComprobante(sid, pid) {
    const s = buscar(sid), p = s.pedido.pagos.find(x => x.id == pid);
    retorno = () => user.rol == 'admin' ? gestionar(sid, true) : mostrarCotizacion(sid, true);
    const hasta = s.pedido.pagos.filter(x => x.id <= p.id).reduce((t, x) => t + x.monto, 0);
    llenar($('comprobante'), {
        cpCodigo: p.comprobante, cpFecha: fechaLarga(p.fecha), cpCliente: s.nombre, cpPedido: codigo('PE', s.id),
        cpConcepto: `${p.tipo == 'Adelanto' ? 'Pago adelantado (50%)' : 'Pago del saldo (50%)'} – ${s.tipo}`,
        cpMetodo: `${p.metodo} · Op. ${p.ref}`, cpMonto: soles(p.monto), cpSaldo: soles(Math.max(0, redondear(s.pedido.total - hasta)))
    });
    ir('comprobante');
}

// ---------- HU012 avisos ----------
function mostrarAvisos() {
    const lista = misAvisos();
    $('sinAvisos').hidden = lista.length > 0;
    $('listaAvisos').innerHTML = '';
    lista.forEach(n => {
        const t = $('tplAviso').content.cloneNode(true);
        llenar(t, { texto: n.texto, fechaTexto: new Date(n.fecha).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) });
        t.querySelector('.box').classList.toggle('nuevo', !n.leida);
        const b = t.querySelector('[data-accion=ver]');
        if (n.sid && buscar(n.sid)) b.onclick = () => user.rol == 'admin' ? gestionar(n.sid) : mostrarCotizacion(n.sid);
        else b.remove();
        $('listaAvisos').append(t);
    });
    lista.forEach(n => n.leida = true);
    guardar();
    ir('avisos');
}

// ============================================================
//  Vendedor: bandeja (HU003)
// ============================================================
function dibujarSolicitudes() {
    const todas = db.solicitudes;
    const cuenta = f => todas.filter(f).length;
    const vendido = todas.filter(s => s.pedido && [PE.CONF, PE.CER].includes(s.pedido.estado)).reduce((t, s) => t + s.pedido.total, 0);
    const porCobrar = todas.filter(s => s.pedido?.estado == PE.CONF).reduce((t, s) => t + pendientePago(s), 0);
    $('stats').innerHTML = `
        <div class="stat"><b>${cuenta(s => pendiente(s))}</b><span>Requieren atención</span></div>
        <div class="stat"><b>${cuenta(s => !s.pedido && s.proformas.length && vigente(s).estado == PF.ENV)}</b><span>Proformas enviadas</span></div>
        <div class="stat"><b>${cuenta(s => s.pedido?.estado == PE.POR)}</b><span>Por confirmar</span></div>
        <div class="stat"><b>${cuenta(s => s.pedido?.estado == PE.CONF)}</b><span>Confirmados</span></div>
        <div class="stat"><b>${soles(vendido)}</b><span>Ventas confirmadas</span></div>
        <div class="stat"><b>${soles(porCobrar)}</b><span>Saldo por cobrar</span></div>`;

    const texto = filtro.texto.toLowerCase();
    const lista = todas
        .filter(s => !filtro.estado || estadoCaso(s) == filtro.estado)
        .filter(s => !texto || [s.nombre, s.tipo, s.ubic, numero(s.id), s.email].join(' ').toLowerCase().includes(texto))
        .sort((a, b) => caso_cerrado(a) - caso_cerrado(b) || !pendiente(b) - !pendiente(a) || a.fecha.localeCompare(b.fecha));

    $('sinSolicitudes').hidden = lista.length > 0;
    $('tablaSolicitudes').hidden = lista.length == 0;
    $('filasSolicitudes').innerHTML = '';
    lista.forEach(s => {
        const fila = $('tplSolicitud').content.cloneNode(true);
        const pend = pendiente(s);
        llenar(fila, {
            ...datosSolicitud(s),
            descripcion: `${s.tipo} · ${s.com} comensales`,
            pendiente: pend,
            prioridad: prioridad(s)
        });
        fila.querySelector('[data-campo=pendiente]').className = pend ? 'tag atencion' : '';
        fila.querySelector('[data-accion=abrir]').onclick = () => gestionar(s.id);
        $('filasSolicitudes').append(fila);
    });
}

function mostrarSolicitudes(texto = '') {
    actualizarVencimientos();
    dibujarSolicitudes();
    ir('solicitudes', texto);
}

// ============================================================
//  Vendedor: gestionar una solicitud
// ============================================================
function gestionar(id, mantener = false, texto = '') {
    actualizarVencimientos();
    pedidoId = id;
    if (!mantener) verVersion = null;
    repintar = () => gestionar(id, true);
    const s = buscar(id);
    llenar($('gestion'), datosSolicitud(s));
    pintarLineas($('gSolicitado'), s.items);
    $('gExcepcion').hidden = s.excepcion != 'pendiente';

    const pf = versionVista(s);
    $('gProforma').hidden = !pf;
    if (pf) pintarProforma($('gProforma'), s, pf);
    $('gPedido').hidden = !s.pedido;
    if (s.pedido) pintarPedido($('gPedido'), s);

    const v = s.proformas.length ? vigente(s) : null;
    $('gbCrear').hidden = !(!s.proformas.length && !s.pedido && s.excepcion != 'pendiente' && s.excepcion != 'denegada');
    $('gbEditar').hidden = !(v && v.estado == PF.BORR);
    $('gbNueva').hidden = !(v && !s.pedido && [PF.CAM, PF.VEN, PF.ENV].includes(v.estado));
    $('gbConfirmar').hidden = s.pedido?.estado != PE.POR;
    $('panelSaldo').hidden = s.pedido?.estado != PE.CONF;
    if (s.pedido) $('sdMonto').textContent = soles(s.pedido.saldo);
    $('sd_metodo').value = ''; $('sd_ref').value = '';
    ir('gestion', texto);
}

// RN08: autorizar o denegar solicitudes con poca anticipación
function resolverExcepcion(ok) {
    const s = buscar(pedidoId);
    if (ok && !disponible(s.fecha, s.com, s.id)) return aviso('No hay capacidad disponible en esa fecha; no se puede autorizar.', 'error');
    s.excepcion = ok ? 'autorizada' : 'denegada';
    notificar(s.email, ok ? `Autorizamos tu solicitud ${numero(s.id)} con poca anticipación. Pronto recibirás tu proforma.`
        : `No pudimos autorizar tu solicitud ${numero(s.id)} por la anticipación. Registra una nueva con 30 días o más.`, s.id);
    guardar();
    gestionar(s.id, false, ok ? 'Excepción autorizada.' : 'Excepción denegada.');
}

// ---------- HU004 elaborar proforma / HU005 nueva versión ----------
const copiar = items => items.map(({ cat, desc, unidad, precio, cant }) => ({ cat, desc, unidad, precio, cant }));

function crearProforma() {
    const s = buscar(pedidoId);
    s.proformas.push({ v: 1, items: copiar(s.items), validez: 7, notas: 'Adelanto del 50% para reservar; saldo del 50% antes del evento.', estado: PF.BORR, creada: hoyISO() });
    guardar();
    editarProforma();
}

function nuevaVersion() {
    const s = buscar(pedidoId), pf = vigente(s);
    if (s.pedido) return aviso('Una proforma aceptada no se edita.', 'error');   // RN02
    if (![PF.CAM, PF.VEN, PF.ENV].includes(pf.estado)) return;
    pf.estado = PF.REE;                                                         // el historial se conserva
    s.proformas.push({
        v: pf.v + 1, items: copiar(pf.items), validez: pf.validez, notas: pf.notas, estado: PF.BORR, creada: hoyISO(),
        atiende: pf.comentarioCliente || (pf.renovacion ? 'El cliente pidió una nueva proforma por vencimiento.' : '')
    });
    guardar();
    editarProforma();
}

function editarProforma() {
    const pf = vigente(buscar(pedidoId));
    $('p_validez').value = pf.validez;
    $('p_notas').value = pf.notas || '';
    llenarCatalogo();
    dibujarItems();
    ir('proforma');
}

function dibujarItems() {
    const pf = vigente(buscar(pedidoId));
    $('filasItems').innerHTML = '';
    pf.items.forEach((item, k) => {
        const fila = $('tplItem').content.cloneNode(true);
        fila.querySelectorAll('[data-item]').forEach(input => {
            const campo = input.dataset.item;
            input.value = item[campo];
            input.oninput = () => {
                item[campo] = campo == 'desc' || campo == 'unidad' ? input.value : Math.max(0, +input.value || 0);
                guardar();
                actualizarTotales();
            };
        });
        fila.querySelector('[data-accion=quitar]').onclick = () => { pf.items.splice(k, 1); guardar(); dibujarItems(); };
        $('filasItems').append(fila);
    });
    actualizarTotales();
}

function actualizarTotales() {
    const s = buscar(pedidoId), pf = vigente(s), t = totalesDe(pf.items);
    llenar($('proforma'), {
        ...datosSolicitud(s),
        pfCodigo: `${codigo('PF', s.id)}-v${pf.v}`, pfEstado: pf.estado,
        atiende: pf.atiende ? 'Cambios pedidos por el cliente: ' + pf.atiende : '',
        subtotal: soles(t.sub), igv: soles(t.igv), total: soles(t.total), adelanto: soles(redondear(t.total * ADELANTO))
    });
    [...$('filasItems').children].forEach((fila, k) => {
        fila.querySelector('[data-campo=subLinea]').textContent = soles(pf.items[k].cant * pf.items[k].precio);
    });
}

// Ítem en blanco: el vendedor escribe descripción, unidad, cantidad y precio
function agregarItem() {
    vigente(buscar(pedidoId)).items.push({ desc: '', unidad: 'unidad', cant: 1, precio: 0 });
    guardar();
    dibujarItems();
    const inputs = $('filasItems').querySelectorAll('[data-item=desc]');
    inputs[inputs.length - 1]?.focus();
}

// Ítem del catálogo: llega con precio y cantidad según los comensales; luego se puede editar todo
function llenarCatalogo() {
    $('p_catalogo').innerHTML = Object.entries(CAT)
        .map(([id, c]) => `<option value="${id}">${c.n} · ${soles(c.p)} / ${c.u}</option>`)
        .join('');
}

function agregarDelCatalogo() {
    const s = buscar(pedidoId), pf = vigente(s), id = $('p_catalogo').value, c = CAT[id];
    if (!c || s.pedido || pf.estado != PF.BORR) return;
    pf.items.push({ cat: id, desc: c.n, unidad: c.u, precio: c.p, cant: defCant(c, s.com) });
    guardar();
    dibujarItems();
}

function guardarBorrador() {
    guardar();
    aviso('Borrador guardado.');
}

function enviarProforma() {
    const s = buscar(pedidoId), pf = vigente(s);
    pf.items = pf.items.filter(i => i.desc.trim() && i.cant > 0);
    if (!pf.items.length) {
        dibujarItems();
        return aviso('Agrega al menos un ítem con descripción y cantidad mayor a 0.', 'error');
    }
    pf.estado = PF.ENV;
    pf.enviada = hoyISO();
    pf.limite = sumarDias(pf.enviada, pf.validez || 7);   // RN10: fecha límite de validez
    notificar(s.email, `Recibiste la proforma ${codigo('PF', s.id)}-v${pf.v} por ${soles(totalesDe(pf.items).total)}, válida hasta el ${fechaLarga(pf.limite)}.`, s.id);
    guardar();
    gestionar(s.id, false, `Proforma ${codigo('PF', s.id)}-v${pf.v} enviada al cliente.`);
}

// ---------- HU010 confirmar pedido / HU014 pago del saldo ----------
function confirmarPedido() {
    const s = buscar(pedidoId);
    if (s.pedido?.estado != PE.POR) return;
    if (!disponible(s.fecha, s.com, s.id)) {   // RN09
        return aviso(`No se puede confirmar: la fecha supera la capacidad de ${CAPACIDAD} comensales con otros pedidos confirmados.`, 'error');
    }
    s.pedido.estado = PE.CONF;                 // RN05: adelanto registrado
    notificar(s.email, `Tu pedido ${codigo('PE', s.id)} quedó confirmado para el ${fechaLarga(s.fecha)}. Recuerda pagar el saldo antes del evento.`, s.id);
    guardar();
    gestionar(s.id, false, 'Pedido confirmado.');
}

function cobrarSaldo() {
    const s = buscar(pedidoId);
    if (s.pedido?.estado != PE.CONF) return;
    if (diasHasta(s.fecha) < 1) return aviso('El saldo debe registrarse antes de la fecha del evento.', 'error');   // RN12
    if (!validar([
        ['sd_metodo', !!valor('sd_metodo'), 'Elige el método de pago.'],
        ['sd_ref', valor('sd_ref').length >= 3, 'Ingresa el N° de operación o recibo.']
    ])) return;
    const p = nuevoPago(s, 'Saldo', valor('sd_metodo'), valor('sd_ref'));
    s.pedido.estado = PE.CER;
    notificar(s.email, `Registramos el pago del saldo (${soles(p.monto)}). Comprobante ${p.comprobante}. Tu pedido está al día.`, s.id);
    guardar();
    gestionar(s.id, false, 'Saldo registrado. Pedido cerrado sin pendientes.');
}

// ============================================================
//  Inicio
// ============================================================
$('f_tipo').innerHTML = '<option value="">Seleccione un paquete</option>' +
    Object.entries(PAQUETES).map(([n, l]) => `<option value="${n}">${n} – ${l.length ? l.length + ' elementos' : 'arma el tuyo'}</option>`).join('');
$('filtroEstado').innerHTML = '<option value="">Todos</option>' + ESTADOS.map(e => `<option>${e}</option>`).join('');

$('cProforma').append($('tplProforma').content.cloneNode(true));
$('gProforma').append($('tplProforma').content.cloneNode(true));
$('cPedido').append($('tplPedido').content.cloneNode(true));
$('gPedido').append($('tplPedido').content.cloneNode(true));

document.querySelectorAll('form[data-accion]').forEach(f => {
    f.onsubmit = e => { e.preventDefault(); window[f.dataset.accion](); };
});
document.addEventListener('input', e => e.target.classList?.remove('invalid'));
$('f_tipo').onchange = cambiarTipo;
$('f_com').oninput = recalcularCantidades;
$('buscar').oninput = e => { filtro.texto = e.target.value.trim(); dibujarSolicitudes(); };
$('filtroEstado').onchange = e => { filtro.estado = e.target.value; dibujarSolicitudes(); };
$('p_validez').oninput = () => { vigente(buscar(pedidoId)).validez = Math.min(90, Math.max(1, +$('p_validez').value || 7)); guardar(); };
$('p_notas').oninput = () => { vigente(buscar(pedidoId)).notas = $('p_notas').value.trim(); guardar(); };

actualizarVencimientos();
if (user?.rol == 'admin') mostrarSolicitudes();
else if (user) mostrarCotizaciones();
else ir('login');