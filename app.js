// === CONFIGURACIÓN DE FIREBASE & GOOGLE SHEETS ===
// TODO: Reemplazar con credenciales reales en producción
const firebaseConfig = {
  apiKey: "AIzaSyBRP71kzadR-FncCVPtPiF_U1bVKbYeTzs",
  authDomain: "proteinagro-cd5fe.firebaseapp.com",
  projectId: "proteinagro-cd5fe",
  storageBucket: "proteinagro-cd5fe.firebasestorage.app",
  messagingSenderId: "296591052004",
  appId: "1:296591052004:web:30add34e9cf5eb4b4030f1",
  measurementId: "G-TJ0THSF4RY"
};

// URL del Webhook de Google Apps Script para sincronización directa con Google Sheets
let GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycby5L1az5QJOu8IlX7JUfmg6g2AjlBd3niqpiyJaMX7WogVRCWxCAcTr5CUUB23i8uxftw/exec"; 

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// Función auxiliar para subir firma a Firebase Storage (o mantener base64 si falla/offline)
async function subirFirmaAStorage(dataUrl, recordId) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
    if (!navigator.onLine || !storage) return dataUrl;

    try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const storageRef = storage.ref().child(`firmas/${recordId}.png`);
        
        const uploadTask = storageRef.put(blob);
        const uploadPromise = new Promise((resolve, reject) => {
            uploadTask.on('state_changed', null, reject, async () => {
                const downloadURL = await storageRef.getDownloadURL();
                resolve(downloadURL);
            });
        });
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout subiendo firma a Firebase Storage")), 5000)
        );

        const urlFinal = await Promise.race([uploadPromise, timeoutPromise]);
        console.log("✅ Firma subida a Firebase Storage exitosamente:", urlFinal);
        return urlFinal;
    } catch (err) {
        console.warn("⚠️ No se pudo subir firma a Storage (se mantendrá copia local):", err);
        return dataUrl;
    }
}

// Habilitar persistencia Offline (Magia de Firebase)
db.enablePersistence()
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          console.warn('Múltiples pestañas abiertas, persistencia offline solo funciona en una.');
      } else if (err.code == 'unimplemented') {
          console.warn('Navegador no soporta persistencia offline.');
      }
  });


// === VARIABLES DE UI ===
const loginOverlay = document.getElementById('login-overlay');
const driverView = document.getElementById('driver-view');
const adminView = document.getElementById('admin-view');
const networkStatus = document.getElementById('network-status');

const btnLogin = document.getElementById('btn-login');
const btnLogoutDriver = document.getElementById('btn-logout-driver');
const btnLogoutAdmin = document.getElementById('btn-logout-admin');

// === LÓGICA DE RED (ONLINE / OFFLINE) ===
function updateNetworkStatus() {
    if (navigator.onLine) {
        networkStatus.classList.remove('offline');
        networkStatus.classList.add('online');
        networkStatus.querySelector('.text').textContent = 'Conectado';
    } else {
        networkStatus.classList.remove('online');
        networkStatus.classList.add('offline');
        networkStatus.querySelector('.text').textContent = 'Sin conexión (Guardado Local)';
    }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

// === LÓGICA DE LOGIN (Firebase Auth + PIN Legacy como fallback) ===
const handleLogin = async (e) => {
    if (e) e.preventDefault();
    const userInput = (document.getElementById('login-user')?.value || '').trim();
    const pin = (document.getElementById('login-pin')?.value || '').trim();
    const errorMsg = document.getElementById('login-error');
    if (errorMsg) errorMsg.style.display = 'none';

    const entrarComoAdmin = () => {
        loginOverlay.style.display = 'none';
        driverView.style.display = 'none';
        adminView.style.display = 'block';
        document.body.style.backgroundColor = 'var(--bg-color)';
        loadAdminData();
    };

    const entrarComoConductor = (nombre = null) => {
        loginOverlay.style.display = 'none';
        adminView.style.display = 'none';
        driverView.style.display = 'flex';
        if (nombre) {
            const select = document.getElementById('conductor');
            if (select) {
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].text.toLowerCase().includes(nombre.toLowerCase()) || select.options[i].value.toLowerCase().includes(nombre.toLowerCase())) {
                        select.selectedIndex = i;
                        break;
                    }
                }
            }
        }
    };

    // 1. Intentar Firebase Auth si el input contiene "@" (email)
    if (userInput.includes('@')) {
        try {
            const creds = await auth.signInWithEmailAndPassword(userInput, pin);
            if (creds.user) {
                // Verificar rol desde email o custom claims (basico: admin si contiene "admin")
                if (creds.user.email && creds.user.email.toLowerCase().includes('admin')) {
                    entrarComoAdmin();
                } else {
                    entrarComoConductor(userInput);
                }
                return;
            }
        } catch (authErr) {
            console.warn("⚠️ Firebase Auth falló, intentando PIN heredado:", authErr.message);
        }
    }

    // 2. Fallback a login por PIN heredado (admin/0000 ó conductor/1234)
    const userLower = userInput.toLowerCase();
    if ((userLower === 'admin' || userLower === 'administrador') && (pin === '0000' || pin === 'admin' || pin === '1234')) {
        entrarComoAdmin();
    } else if (userInput !== '' && (pin === '1234' || pin === '0000' || pin === '')) {
        entrarComoConductor(userInput);
    } else {
        if (errorMsg) errorMsg.style.display = 'block';
    }
};

document.getElementById('login-form')?.addEventListener('submit', handleLogin);
btnLogin?.addEventListener('click', handleLogin);

// Detectar sesión activa de Firebase Auth (persistencia en navegador)
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("✅ Usuario autenticado:", user.email);
    }
});

const logout = () => {
    if (auth.currentUser) {
        auth.signOut().catch(() => {});
    }
    loginOverlay.style.display = 'flex';
    driverView.style.display = 'none';
    adminView.style.display = 'none';
    document.getElementById('login-pin').value = '';
};

btnLogoutDriver.addEventListener('click', logout);
btnLogoutAdmin.addEventListener('click', logout);


// === LÓGICA DEL FORMULARIO CONDUCTOR ===
const kilosGroup = document.getElementById('kilos-group');
const kilosInput = document.getElementById('kilos');
const btnRegistrarProducto = document.getElementById('btn-registrar-producto');
const addedProductsDiv = document.getElementById('added-products');
const productsListUl = document.getElementById('products-list');
let currentProduct = null;
let collectedProducts = [];

const DEFAULT_PRODUCTOS = ["ACEITE", "CABEZAS", "DESPERDICIO", "EMPELLA", "GORDANA", "HARINA CARNE", "HARINA DE HUESO VAPORIZADA", "HUESO BLANCO", "HUESO CALCINADO", "HUESO CERDO", "HUESO SECO", "MANTECA", "MARGARINA", "PIEL POLLO", "SEBO", "SEBO EN RAMA"];
const DEFAULT_CONDUCTORES = ["Camilo Perez", "Juan Gomez", "Miguel Otero", "Felipe Montilla", "Gildardo Tejada"];
const DEFAULT_RUTAS = [
    "RUTA 1: Santa Elena / Cavasa",
    "RUTA 2: Cali (Norte / Sur / Oriente)",
    "RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance",
    "RUTA 4: Buga / Roldanillo / Zarzal / Tuluá",
    "RUTA 5: Palmira / Villagorgona / Carmelo",
    "RUTA 6: Yumbo / Otras"
];

function getEmojiForProduct(name) {
    const n = (name || '').toUpperCase();
    if (n.includes('ACEITE')) return '🛢️';
    if (n.includes('CABEZAS')) return '🐮';
    if (n.includes('DESPERDICIO')) return '🗑️';
    if (n.includes('EMPELLA')) return '🐷';
    if (n.includes('GORDANA')) return '🥓';
    if (n.includes('HARINA')) return '🥩';
    if (n.includes('HUESO')) return '🦴';
    if (n.includes('MANTECA') || n.includes('MARGARINA') || n.includes('SEBO')) return '🧈';
    if (n.includes('POLLO') || n.includes('PIEL')) return '🐔';
    return '📦';
}

function renderDynamicProducts(prods) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    grid.innerHTML = '';
    prods.forEach(pName => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'product-btn';
        btn.dataset.value = pName;
        btn.innerHTML = `${getEmojiForProduct(pName)} ${pName}`;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.product-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentProduct = pName;
            const selInput = document.getElementById('producto-seleccionado');
            if (selInput) selInput.value = currentProduct;
            if (kilosGroup) kilosGroup.style.display = 'block';
            if (kilosInput) kilosInput.focus();
        });
        grid.appendChild(btn);
    });
}

function renderDynamicDrivers(drivers) {
    const select = document.getElementById('conductor');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="" disabled selected>Seleccione su nombre</option>';
    drivers.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
}

function renderDynamicRoutes(routes) {
    const select = document.getElementById('ruta');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="" disabled selected>Seleccione la ruta</option>';
    routes.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        select.appendChild(opt);
    });
    const optOtra = document.createElement('option');
    optOtra.value = 'OTRA';
    optOtra.textContent = '➕ Otra / Nueva Ruta...';
    select.appendChild(optOtra);
    if (currentVal) select.value = currentVal;
}

function procesarPuntosRutasDinamicos(puntosArray) {
    if (!Array.isArray(puntosArray) || puntosArray.length === 0) return;
    puntosArray.forEach(item => {
        if (!item || !item.punto || item.estado === 'Inactivo') return;
        const punto = item.punto;
        const prov = item.proveedor || 'PROVEEDOR GENERAL';
        const ruta = item.ruta || 'Ruta General';

        PUNTO_TO_PROVEEDOR_MAP[punto] = prov;

        if (!PUNTOS_POR_RUTA[ruta]) PUNTOS_POR_RUTA[ruta] = [];
        if (!PUNTOS_POR_RUTA[ruta].includes(punto)) PUNTOS_POR_RUTA[ruta].push(punto);

        if (!PROVEEDORES_POR_RUTA[ruta]) PROVEEDORES_POR_RUTA[ruta] = [];
        if (!PROVEEDORES_POR_RUTA[ruta].includes(prov)) PROVEEDORES_POR_RUTA[ruta].push(prov);

        if (item.horario && item.horario.trim() !== '') {
            if (!CRONOGRAMA_RUTAS[ruta]) CRONOGRAMA_RUTAS[ruta] = [];
            const exists = CRONOGRAMA_RUTAS[ruta].some(c => c.cliente === punto);
            if (!exists) {
                CRONOGRAMA_RUTAS[ruta].push({
                    hora: item.horario,
                    cliente: punto,
                    proveedor: prov,
                    direccion: item.direccion || '',
                    tel: item.telefono || ''
                });
            }
        }
    });
}

async function cargarCatalogosDinamicos() {
    // Limpieza de caché legada obsoleta
    try {
        const rawCached = localStorage.getItem('proteinagro_catalogos_cache');
        if (rawCached && rawCached.includes("Belalcázar / Yumbo")) {
            localStorage.removeItem('proteinagro_catalogos_cache');
        }
    } catch(e) {}

    // 1. Intentar obtener catálogos en vivo desde Google Sheets (evitando caché HTTP con timestamp)
    if (navigator.onLine && GOOGLE_SHEETS_WEBHOOK_URL) {
        try {
            const cacheBusterUrl = GOOGLE_SHEETS_WEBHOOK_URL + (GOOGLE_SHEETS_WEBHOOK_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
            const res = await fetch(cacheBusterUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && data.productos && data.productos.length > 0) {
                    renderDynamicProducts(data.productos);
                    if (data.conductores && data.conductores.length > 0) renderDynamicDrivers(data.conductores);
                    if (data.puntos_rutas && data.puntos_rutas.length > 0) procesarPuntosRutasDinamicos(data.puntos_rutas);
                    if (data.rutas && data.rutas.length > 0) {
                        renderDynamicRoutes(data.rutas);
                    }
                    localStorage.setItem('proteinagro_catalogos_cache', JSON.stringify(data));
                    console.log("✅ Catálogos dinámicos y matriz de rutas actualizados desde Google Sheets.");
                    return;
                }
            }
        } catch (err) {
            console.warn("⚠️ No se pudo obtener catálogos en vivo desde Sheets, se usan datos locales:", err);
        }
    }

    // 2. Fallback a caché local o valores por defecto si no hay conexión o falla la red
    let cached = null;
    try {
        cached = JSON.parse(localStorage.getItem('proteinagro_catalogos_cache'));
    } catch(e) {}

    const productos = (cached && cached.productos && cached.productos.length > 0) ? cached.productos : DEFAULT_PRODUCTOS;
    const conductores = (cached && cached.conductores && cached.conductores.length > 0) ? cached.conductores : DEFAULT_CONDUCTORES;
    const rutas = (cached && cached.rutas && cached.rutas.length > 0) ? cached.rutas : DEFAULT_RUTAS;

    if (cached && cached.puntos_rutas) procesarPuntosRutasDinamicos(cached.puntos_rutas);

    renderDynamicProducts(productos);
    renderDynamicDrivers(conductores);
    renderDynamicRoutes(rutas);
}

btnRegistrarProducto.addEventListener('click', () => {
    if (!currentProduct) {
        alert("Primero selecciona un producto.");
        return;
    }
    if (!kilosInput.value || kilosInput.value <= 0) {
        alert("Ingresa la cantidad en kilos.");
        kilosInput.focus();
        return;
    }
    
    // Guardar en la lista
    collectedProducts.push({
        producto: currentProduct,
        kilos: parseFloat(kilosInput.value)
    });

    renderAddedProducts();
    
    // Resetear form para el siguiente
    productBtns.forEach(b => b.classList.remove('active'));
    currentProduct = null;
    kilosInput.value = '';
    kilosGroup.style.display = 'none';
});

function renderAddedProducts() {
    if (collectedProducts.length > 0) {
        addedProductsDiv.style.display = 'block';
        productsListUl.innerHTML = '';
        collectedProducts.forEach((p, index) => {
            productsListUl.innerHTML += `
                <li>
                    <span>${p.producto}</span>
                    <span>${p.kilos} kg</span>
                </li>
            `;
        });
    } else {
        addedProductsDiv.style.display = 'none';
    }
}

// === CANVAS (FIRMA) ===
const canvas = document.getElementById('signature-pad');
const ctx = canvas.getContext('2d');
let isDrawing = false;

// Ajustar tamaño del canvas
function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
}
window.addEventListener("resize", resizeCanvas);
setTimeout(resizeCanvas, 500); // Dar tiempo a que el DOM renderice

const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
};

const startDrawing = (e) => {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
};

const draw = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
};

const stopDrawing = () => {
    isDrawing = false;
};

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

canvas.addEventListener('touchstart', startDrawing, {passive: false});
canvas.addEventListener('touchmove', draw, {passive: false});
canvas.addEventListener('touchend', stopDrawing);

document.getElementById('btn-clear-signature').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});


// === GUARDAR EN FIREBASE ===
document.getElementById('recoleccion-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const conductorSel = document.getElementById('conductor');
    const conductorName = conductorSel.options[conductorSel.selectedIndex]?.text || conductorSel.value;
    
    const rutaSel = document.getElementById('ruta');
    let rutaName = rutaSel.value;
    if (rutaSel.value === 'OTRA') {
        rutaName = document.getElementById('custom-ruta')?.value.trim() || 'Ruta Personalizada';
    } else if (rutaSel.selectedIndex >= 0) {
        rutaName = rutaSel.options[rutaSel.selectedIndex].text;
    }
    
    const proveedorSel = document.getElementById('proveedor');
    let proveedorName = proveedorSel.value;
    if (proveedorSel.value === 'OTRO') {
        proveedorName = document.getElementById('custom-proveedor')?.value.trim() || 'Proveedor Personalizado';
    } else if (proveedorSel.selectedIndex >= 0) {
        proveedorName = proveedorSel.options[proveedorSel.selectedIndex].text;
    }

    const sucursalSel = document.getElementById('sucursal');
    let sucursalName = 'General';
    if (sucursalSel && sucursalSel.value) {
        if (sucursalSel.value === 'OTRA_SUCURSAL') {
            sucursalName = document.getElementById('custom-sucursal')?.value.trim() || 'Sucursal Personalizada';
        } else if (sucursalSel.selectedIndex >= 0) {
            sucursalName = sucursalSel.options[sucursalSel.selectedIndex].text;
        }
    }
    
    // Validar
    if (collectedProducts.length === 0) {
        if (currentProduct && kilosInput.value) {
            alert("No has registrado el producto. Haz clic en '➕ Registrar producto' antes de guardar.");
        } else {
            alert("Debe registrar al menos un producto en la lista.");
        }
        return;
    }
    
    if (currentProduct && kilosInput.value) {
        alert("Tienes un producto pendiente sin registrar. Haz clic en '➕ Registrar producto' antes de guardar, o bórralo.");
        return;
    }

    // Calcular totales
    let totalKilos = 0;
    collectedProducts.forEach(p => totalKilos += p.kilos);

    const btnSubmit = document.getElementById('btn-submit');
    const spinner = btnSubmit.querySelector('.spinner');
    const textSpan = btnSubmit.querySelector('.btn-text-content');
    
    textSpan.style.display = 'none';
    spinner.style.display = 'block';
    btnSubmit.disabled = true;

    // Obtener observaciones
    const observacionesVal = document.getElementById('observaciones')?.value.trim() || '';

    // Obtener firma base64
    const firmaDataUrl = canvas.toDataURL();

    const data = {
        conductor: conductorName,
        ruta: rutaName,
        proveedor: proveedorName,
        sucursal: sucursalName,
        punto: sucursalName,
        productos: collectedProducts,
        totalKilos: totalKilos,
        observaciones: observacionesVal,
        ubicacionGps: "0",
        firma: firmaDataUrl,
        fecha: (() => {
            const now = new Date();
            const d = now.getDate();
            const m = now.getMonth() + 1;
            const y = now.getFullYear();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            return d + '/' + m + '/' + y + ' ' + hh + ':' + mm + ':' + ss;
        })(),
        estado: navigator.onLine ? 'Sincronizado' : 'Offline'
    };

    try {
        // 0. Generar ID único de recolección
        const recordId = 'REC-' + Date.now();

        // 0.1 Intentar subir firma a Firebase Storage (o mantener base64 offline)
        let firmaURL = firmaDataUrl;
        if (navigator.onLine) {
            firmaURL = await subirFirmaAStorage(firmaDataUrl, recordId);
        }

        // 1. Guardar en respaldo local (LocalStorage) de inmediato
        let savedBackup = JSON.parse(localStorage.getItem('recolecciones_backup') || '[]');
        const dataForBackup = { ...data, firma: firmaURL, id: recordId };
        // El backup local guarda URL o base64 para factibilidad futura
        savedBackup.unshift(dataForBackup);
        localStorage.setItem('recolecciones_backup', JSON.stringify(savedBackup));

        // 2. Sincronizar inmediatamente con Google Sheets (vía webhook sin bloquear) - con URL de firma
        if (GOOGLE_SHEETS_WEBHOOK_URL && GOOGLE_SHEETS_WEBHOOK_URL.trim() !== "") {
            enviarAGoogleSheets({ ...data, firma: firmaURL, id: recordId });
        }

        // 3. Intentar guardar en Firebase con un tiempo límite de 4 segundos
        try {
            const firestorePromise = db.collection('recolecciones').add({ ...data, firma: firmaURL });
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Timeout de conexión a Firebase")), 4000)
            );
            await Promise.race([firestorePromise, timeoutPromise]);
        } catch (fsErr) {
            console.warn("⚠️ Firebase no respondió a tiempo, pero los datos se guardaron localmente y en Google Sheets:", fsErr);
        }

        // Limpiar form conservando el nombre del conductor
        const conductorActual = document.getElementById('conductor').value;
        document.getElementById('recoleccion-form').reset();
        document.getElementById('conductor').value = conductorActual;
        
        // Resetear selectores dinámicos
        document.getElementById('custom-ruta-group').style.display = 'none';
        document.getElementById('custom-proveedor-group').style.display = 'none';
        if (document.getElementById('custom-sucursal-group')) document.getElementById('custom-sucursal-group').style.display = 'none';
        
        document.getElementById('proveedor').disabled = true;
        document.getElementById('proveedor').innerHTML = '<option value="" disabled selected>Seleccione primero una ruta</option>';
        if (document.getElementById('sucursal')) {
            document.getElementById('sucursal').disabled = true;
            document.getElementById('sucursal').innerHTML = '<option value="" selected>Seleccione primero un proveedor (opcional)</option>';
        }
        
        collectedProducts = [];
        renderAddedProducts();
        kilosGroup.style.display = 'none';
        productBtns.forEach(b => b.classList.remove('active'));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Mostrar Comprobante Digital Modal al conductor e información del recibo
        mostrarComprobanteDigital({ ...data, firma: firmaURL, id: recordId });

    } catch (error) {
        console.error("Error guardando documento: ", error);
        alert("Hubo un error guardando la recolección.");
    } finally {
        textSpan.style.display = 'block';
        spinner.style.display = 'none';
        btnSubmit.disabled = false;
    }
});


// === LÓGICA DEL ADMIN DASHBOARD & CHART.JS ===
let chartProveedor = null;
let chartProducto = null;

function renderCharts(records) {
    const kilosPorProveedor = {};
    const kilosPorProducto = {};

    records.forEach(r => {
        // Agrupar por proveedor
        const prov = (r.proveedor || 'Desconocido').replace('_', ' ');
        kilosPorProveedor[prov] = (kilosPorProveedor[prov] || 0) + r.totalKilos;

        // Agrupar por producto
        if (r.productos && Array.isArray(r.productos)) {
            r.productos.forEach(p => {
                const prodName = p.producto || p.nombre || 'Otros';
                kilosPorProducto[prodName] = (kilosPorProducto[prodName] || 0) + p.kilos;
            });
        }
    });

    const provLabels = Object.keys(kilosPorProveedor);
    const provData = Object.values(kilosPorProveedor);

    const prodLabels = Object.keys(kilosPorProducto);
    const prodData = Object.values(kilosPorProducto);

    // Gráfico Proveedor (Barras)
    if (chartProveedor) chartProveedor.destroy();
    const ctxProv = document.getElementById('chart-proveedor').getContext('2d');
    chartProveedor = new Chart(ctxProv, {
        type: 'bar',
        data: {
            labels: provLabels,
            datasets: [{
                label: 'Kilos Totales',
                data: provData,
                backgroundColor: '#22c55e',
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Gráfico Producto (Torta)
    if (chartProducto) chartProducto.destroy();
    const ctxProd = document.getElementById('chart-producto').getContext('2d');
    chartProducto = new Chart(ctxProd, {
        type: 'doughnut',
        data: {
            labels: prodLabels,
            datasets: [{
                data: prodData,
                backgroundColor: ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#64748b', '#ec4899', '#14b8a6']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function loadAdminData() {
    const tbody = document.getElementById('admin-table-body');
    
    db.collection('recolecciones').orderBy('fecha', 'desc').limit(100)
      .onSnapshot((querySnapshot) => {
          tbody.innerHTML = '';
          const records = [];
          
          querySnapshot.forEach((doc) => {
              const data = doc.data();
              records.push(data);
              
              const dateObj = new Date(data.fecha);
              const badgeClass = data.estado === 'Sincronizado' ? 'badge-online' : 'badge-offline';
              const ruta = data.ruta ? data.ruta.replace('_', ' ') : 'N/A';

              const obsText = data.observaciones ? data.observaciones : '-';
              const provDisplay = data.proveedor || 'N/A';
              const sucDisplay = data.punto || data.sucursal || 'General';
              const docId = doc.id;
              const recordLocalId = data.id || '';

              const tr = document.createElement('tr');
              tr.innerHTML = `
                  <td>${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}</td>
                  <td style="text-transform: capitalize;">${data.conductor}</td>
                  <td style="text-transform: capitalize;">${ruta}</td>
                  <td style="text-transform: capitalize;">${provDisplay}</td>
                  <td style="font-size: 0.85rem; color: #0284c7; font-weight: 500;">${sucDisplay}</td>
                  <td style="font-weight: bold;">${data.totalKilos} kg</td>
                  <td style="max-width: 200px; font-size: 0.85rem; color: #475569;">${obsText}</td>
                  <td><span class="badge ${badgeClass}">${data.estado}</span></td>
                  <td><img src="${data.firma}" style="height: 30px; border: 1px solid #ccc; background: white;" alt="firma"></td>
                  <td>
                      <button onclick="eliminarRecoleccion('${docId}', '${recordLocalId}')" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px;">
                          🗑️ Eliminar
                      </button>
                  </td>
              `;
              tbody.appendChild(tr);
          });
          
          if (records.length === 0) {
              // Si Firebase está vacío, intentar cargar respaldo local
              let savedBackup = JSON.parse(localStorage.getItem('recolecciones_backup') || '[]');
              if (savedBackup.length > 0) {
                  renderRecordsInTable(savedBackup, tbody);
                  renderCharts(savedBackup);
                  return;
              }
              tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px;">No hay recolecciones guardadas aún. Haz una prueba desde el formulario.</td></tr>';
          } else {
              renderCharts(records);
          }
      }, (error) => {
          console.error("Error cargando recolecciones: ", error);
          let savedBackup = JSON.parse(localStorage.getItem('recolecciones_backup') || '[]');
          if (savedBackup.length > 0) {
              renderRecordsInTable(savedBackup, tbody);
              renderCharts(savedBackup);
          } else {
              tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px; color: red;">Error de permisos o conexión en Firebase. Revisa las reglas de Firestore en Firebase Console.</td></tr>';
          }
      });
}

function renderRecordsInTable(records, tbody) {
    tbody.innerHTML = '';
    records.forEach(data => {
        const dateObj = new Date(data.fecha);
        const badgeClass = data.estado === 'Sincronizado' ? 'badge-online' : 'badge-offline';
        const ruta = data.ruta ? data.ruta.replace('_', ' ') : 'N/A';
        const obsText = data.observaciones ? data.observaciones : '-';

        const provDisplay = data.proveedor || 'N/A';
        const sucDisplay = data.punto || data.sucursal || 'General';
        const recordLocalId = data.id || '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}</td>
            <td style="text-transform: capitalize;">${data.conductor}</td>
            <td style="text-transform: capitalize;">${ruta}</td>
            <td style="text-transform: capitalize;">${provDisplay}</td>
            <td style="font-size: 0.85rem; color: #0284c7; font-weight: 500;">${sucDisplay}</td>
            <td style="font-weight: bold;">${data.totalKilos} kg</td>
            <td style="max-width: 200px; font-size: 0.85rem; color: #475569;">${obsText}</td>
            <td><span class="badge ${badgeClass}">${data.estado}</span></td>
            <td><img src="${data.firma}" style="height: 30px; border: 1px solid #ccc; background: white;" alt="firma"></td>
            <td>
                <button onclick="eliminarRecoleccion('', '${recordLocalId}')" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px;">
                    🗑️ Eliminar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Función global para eliminar un registro individual
async function eliminarRecoleccion(firestoreDocId, localRecordId) {
    if (!confirm('¿Está seguro de que desea eliminar esta recolección?')) {
        return;
    }

    try {
        if (firestoreDocId) {
            await db.collection('recolecciones').doc(firestoreDocId).delete();
        }
        
        // Limpiar también de respaldo en localStorage
        let savedBackup = JSON.parse(localStorage.getItem('recolecciones_backup') || '[]');
        if (localRecordId || firestoreDocId) {
            savedBackup = savedBackup.filter(r => r.id !== localRecordId && r.id !== firestoreDocId);
            localStorage.setItem('recolecciones_backup', JSON.stringify(savedBackup));
        }

        console.log("✅ Recolección eliminada correctamente.");
    } catch (e) {
        console.error("Error al eliminar recolección: ", e);
        alert("Hubo un error al eliminar el registro: " + e.message);
    }
}

// Borrado masivo de pruebas
document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
    const confirmPass = prompt('⚠️ ¡ATENCIÓN! Esto borrará todas las recolecciones guardadas en el panel.\n\nEscriba BORRAR para confirmar:');
    if (!confirmPass) return;

    if (confirmPass.trim().toUpperCase() !== 'BORRAR') {
        alert('Operación cancelada. Debe escribir BORRAR en mayúsculas.');
        return;
    }

    try {
        const snapshot = await db.collection('recolecciones').get();
        if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }

        localStorage.removeItem('recolecciones_backup');

        // Refrescar automáticamente la interfaz y gráficas
        const tbody = document.getElementById('admin-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px;">No hay recolecciones guardadas aún. Haz una prueba desde el formulario.</td></tr>';
        }
        renderCharts([]);

        alert('✅ Se han eliminado todas las recolecciones con éxito y el panel se ha actualizado.');
    } catch (e) {
        console.error("Error borrando todas las recolecciones:", e);
        // Fallback limpiar local si Firebase falla
        localStorage.removeItem('recolecciones_backup');
        location.reload();
    }
});

// === EXPORTAR A EXCEL / CSV ===
document.getElementById('btn-export')?.addEventListener('click', async () => {
    try {
        const snapshot = await db.collection('recolecciones').orderBy('fecha', 'desc').get();
        if (snapshot.empty) {
            alert('No hay recolecciones para exportar.');
            return;
        }

        let csvContent = "\uFEFF"; // UTF-8 BOM para abrir correctamente en Excel
        csvContent += "ID,Fecha,Conductor,Ruta,Proveedor,Sucursal/Punto,Productos,Total Kilos,Observaciones,Estado\n";

        snapshot.forEach(doc => {
            const data = doc.data();
            const dateObj = new Date(data.fecha);
            const fechaFormatted = `"${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}"`;
            const conductor = `"${data.conductor || ''}"`;
            const ruta = `"${(data.ruta || '').replace('_', ' ')}"`;
            const proveedor = `"${(data.proveedor || '').replace('_', ' ')}"`;
            const sucursal = `"${(data.sucursal || 'General')}"`;
            
            let productosStr = '';
            if (data.productos && Array.isArray(data.productos)) {
                productosStr = data.productos.map(p => p.producto).join(', ');
            }
            productosStr = `"${productosStr}"`;

            const totalKilos = data.totalKilos || 0;
            const observaciones = `"${(data.observaciones || '').replace(/"/g, '""')}"`;
            const estado = `"${data.estado || ''}"`;

            csvContent += `${doc.id},${fechaFormatted},${conductor},${ruta},${proveedor},${sucursal},${productosStr},${totalKilos},${observaciones},${estado}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `recolecciones_proteinagro_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error("Error al exportar:", err);
        alert("Error al exportar los datos: " + err.message);
    }
});


// === ENVIAR A GOOGLE SHEETS (Formulario oculto - Sin problemas de CORS) ===
function enviarAGoogleSheets(data) {
    try {
        // Crear iframe oculto para recibir la respuesta sin redirigir la página
        let iframe = document.getElementById('sheets-iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'sheets-iframe';
            iframe.name = 'sheets-iframe';
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
        }

        // Crear formulario oculto
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = GOOGLE_SHEETS_WEBHOOK_URL;
        form.target = 'sheets-iframe';
        form.style.display = 'none';

        // Agregar los datos como campo oculto
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'payload';
        input.value = JSON.stringify(data);
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();

        // Limpiar el formulario del DOM
        setTimeout(() => {
            document.body.removeChild(form);
        }, 2000);

        console.log("✅ Datos enviados a Google Sheets correctamente.");
    } catch (err) {
        console.warn("⚠️ Error enviando a Google Sheets:", err);
    }
}


// === SISTEMA DE RUTAS Y PROVEEDORES DINÁMICOS ===
const DEFAULT_RUTAS_DATA = {
    "RUTA 1: Santa Elena / Cavasa": [
        "CUENTA SEVILLANA",
        "MIGAN CAPITAL",
        "CUENTA PROVEEDORES HUESO",
        "CUENTA 2026"
    ],
    "RUTA 2: Cali (Norte / Sur / Oriente)": [
        "SUPERTIENDA CAÑAVERAL",
        "COMERCIALIZADORA R Y E",
        "CUENTA SEVILLANA",
        "MIGAN CAPITAL",
        "CUENTA 2026"
    ],
    "RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance": [
        "CARIBE",
        "SUPERTIENDA CAÑAVERAL",
        "CUENTA 2026"
    ],
    "RUTA 4: Buga / Roldanillo / Zarzal / Tuluá": [
        "CUENTA ALBERTO MILLAN",
        "CARIBE",
        "SUPERTIENDA CAÑAVERAL",
        "CUENTA SEVILLANA",
        "ANGELO PAREDES PROTEINCOL",
        "CUENTA FABRICA",
        "BELALCAZAR"
    ],
    "RUTA 5: Palmira / Villagorgona / Carmelo": [
        "SUPERTIENDA CAÑAVERAL",
        "CUENTA SEVILLANA",
        "JHOANATAN MARTINEZ",
        "MIGAN CAPITAL"
    ],
    "RUTA 6: Yumbo / Otras": [
        "CUENTA FABRICA",
        "CUENTA PROVEEDORES HUESO"
    ]
};

const TODOS_LOS_PROVEEDORES = [
    "ANGELO PAREDES PROTEINCOL",
    "BELALCAZAR",
    "CARIBE",
    "COMERCIALIZADORA R Y E",
    "CUENTA 2026",
    "CUENTA ALBERTO MILLAN",
    "CUENTA FABRICA",
    "CUENTA PROVEEDORES HUESO",
    "CUENTA SEVILLANA",
    "JHOANATAN MARTINEZ",
    "MIGAN CAPITAL",
    "SUPERTIENDA CAÑAVERAL"
];

let savedRutasConfig = null;
try {
    const rawRutas = localStorage.getItem('proteinagro_rutas_config');
    if (rawRutas) {
        const parsed = JSON.parse(rawRutas);
        if (parsed && typeof parsed === 'object' && !parsed.productos && Object.keys(parsed).length > 0) {
            delete parsed["RUTA 6: Belalcázar / Yumbo"];
            savedRutasConfig = parsed;
        } else {
            localStorage.removeItem('proteinagro_rutas_config');
        }
    }
} catch (e) {
    localStorage.removeItem('proteinagro_rutas_config');
}
let rutasConfig = savedRutasConfig || DEFAULT_RUTAS_DATA;

function initRutasYProveedores() {
    const rutaSelect = document.getElementById('ruta');
    const sucursalSelect = document.getElementById('sucursal');
    const proveedorSelect = document.getElementById('proveedor');
    const customRutaGroup = document.getElementById('custom-ruta-group');
    const customProveedorGroup = document.getElementById('custom-proveedor-group');
    const customSucursalGroup = document.getElementById('custom-sucursal-group');
    const autofillBadge = document.getElementById('autofill-badge');

    if (!rutaSelect || !proveedorSelect || !sucursalSelect) return;

    // Poblar selector de rutas
    rutaSelect.innerHTML = '<option value="" disabled selected>Seleccione la ruta</option>';
    Object.keys(rutasConfig).forEach(rutaKey => {
        const opt = document.createElement('option');
        opt.value = rutaKey;
        opt.textContent = rutaKey;
        rutaSelect.appendChild(opt);
    });

    // Opción para nueva ruta
    const optOtraRuta = document.createElement('option');
    optOtraRuta.value = 'OTRA';
    optOtraRuta.textContent = '➕ Otra / Nueva Ruta...';
    rutaSelect.appendChild(optOtraRuta);

    // Inicializar proveedores y puntos por defecto activados desde el inicio
    populardropdownProveedores(TODOS_LOS_PROVEEDORES, true);
    populardropdownSucursalesPorRuta('');

    // Event listener al cambiar la Ruta
    rutaSelect.addEventListener('change', () => {
        const selectedRuta = rutaSelect.value;

        // Reset custom fields y badges
        customRutaGroup.style.display = 'none';
        customProveedorGroup.style.display = 'none';
        if (customSucursalGroup) customSucursalGroup.style.display = 'none';
        if (autofillBadge) autofillBadge.style.display = 'none';

        document.getElementById('custom-ruta').required = false;
        document.getElementById('custom-proveedor').required = false;

        // Poblar proveedores completo por defecto
        populardropdownProveedores(TODOS_LOS_PROVEEDORES, true);

        if (selectedRuta === 'OTRA' || selectedRuta.includes('Pendiente por definir')) {
            if (selectedRuta === 'OTRA') {
                customRutaGroup.style.display = 'block';
                document.getElementById('custom-ruta').required = true;
            }
            populardropdownSucursalesPorRuta('');
            renderizarCronogramaRuta(selectedRuta);
        } else {
            populardropdownSucursalesPorRuta(selectedRuta);
            renderizarCronogramaRuta(selectedRuta);
        }
    });

    // Event listener al cambiar Punto / Sucursal (AUTOCOMPLETA EL PROVEEDOR)
    sucursalSelect.addEventListener('change', () => {
        const selectedPunto = sucursalSelect.value;
        if (customSucursalGroup) customSucursalGroup.style.display = 'none';

        if (selectedPunto === 'OTRA_SUCURSAL') {
            if (customSucursalGroup) customSucursalGroup.style.display = 'block';
            if (autofillBadge) autofillBadge.style.display = 'none';
        } else if (PUNTO_TO_PROVEEDOR_MAP[selectedPunto]) {
            const targetProv = PUNTO_TO_PROVEEDOR_MAP[selectedPunto];
            let found = false;
            for (let i = 0; i < proveedorSelect.options.length; i++) {
                if (proveedorSelect.options[i].value === targetProv) {
                    proveedorSelect.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            if (found && autofillBadge) {
                autofillBadge.style.display = 'inline-block';
            }
        }
    });

    // Event listener al cambiar Proveedor manualmente
    proveedorSelect.addEventListener('change', () => {
        const selectedProv = proveedorSelect.value;
        if (autofillBadge) autofillBadge.style.display = 'none';

        if (selectedProv === 'OTRO') {
            customProveedorGroup.style.display = 'block';
            document.getElementById('custom-proveedor').required = true;
        } else {
            customProveedorGroup.style.display = 'none';
            document.getElementById('custom-proveedor').required = false;
            populardropdownSucursales(selectedProv);
        }
    });

    // Cargar banner con itinerario recomendado según día de la semana
    actualizarItinerarioDelDia();

    // Sincronizar dinámicamente en segundo plano
    sincronizarRutasDesdeSheets();
}

const PUNTO_TO_PROVEEDOR_MAP = {
    // RUTA 1 - Santa Elena / Cavasa
    "Bodega Santa Elena": "MIGAN CAPITAL",
    "Garay Santa Elena": "MIGAN CAPITAL",
    "Cavasa": "MIGAN CAPITAL",
    "Sevillana Santa Elena": "CUENTA SEVILLANA",
    "Ciudad del Campo Granahorrar": "MIGAN CAPITAL",
    "Ciudad del Campo Punto Rojo": "MIGAN CAPITAL",
    "Ciudad del Campo Surtimercar": "MIGAN CAPITAL",
    "Los Lagos Orlando Martínez": "CUENTA PROVEEDORES HUESO",
    "La Esperanza": "CUENTA 2026",

    // RUTA 2 - Cali
    "Cañaveral Punto 14 (Cra. 5 #14-37)": "SUPERTIENDA CAÑAVERAL",
    "Cañaveral Centenario (Av. 4N #46-64)": "SUPERTIENDA CAÑAVERAL",
    "La Montaña Av. 6A (Av. 6AN #30N-47)": "MIGAN CAPITAL",
    "Cañaveral Prados del Norte (Av. 2BN #34N-19)": "SUPERTIENDA CAÑAVERAL",
    "Carnes Maiale (Cra. 1G #69-02)": "MIGAN CAPITAL",
    "Districarnes LG (Cra. 4C #65B-18)": "MIGAN CAPITAL",
    "Cañaveral Álamos (Cl. 75CN #2 Bis-100)": "SUPERTIENDA CAÑAVERAL",
    "Cañaveral Los Pinos (Cl. 70 #7M Bis-64)": "SUPERTIENDA CAÑAVERAL",
    "Cañaveral La Primera (Cra. 1A #44-50)": "SUPERTIENDA CAÑAVERAL",
    "La Montaña Torres (Cra. 1 #56-20)": "MIGAN CAPITAL",
    "Super Carnes Los Andes (Cra. 1D #52-05)": "MIGAN CAPITAL",
    "La Cosecha de Mi Tierra": "MIGAN CAPITAL",
    "Carnes RYE (Cra. 17F #33A-45)": "COMERCIALIZADORA R Y E",
    "Baratón Carnes Berlín (Calle 44 #19-65)": "MIGAN CAPITAL",
    "El Rebajón": "MIGAN CAPITAL",
    "La Montaña Calima": "MIGAN CAPITAL",
    "Cañaveral Ingenio": "SUPERTIENDA CAÑAVERAL",
    "Cañaveral Limonar": "SUPERTIENDA CAÑAVERAL",
    "Cañaveral Pasoancho": "SUPERTIENDA CAÑAVERAL",
    "Sevillana Pasoancho": "CUENTA SEVILLANA",
    "La Montaña Pasoancho": "MIGAN CAPITAL",
    "Sevillana Lourdes": "CUENTA SEVILLANA",
    "La Montaña Guadalupe": "MIGAN CAPITAL",
    "La Montaña Cosmocentro": "MIGAN CAPITAL",
    "La Montaña Cristales": "MIGAN CAPITAL",
    "Cañaveral Villanueva": "SUPERTIENDA CAÑAVERAL",
    "Cañaveral Cootraemcali": "SUPERTIENDA CAÑAVERAL",
    "Mercaunión": "MIGAN CAPITAL",
    "Sevillana República de Israel": "CUENTA SEVILLANA",
    "Jaime Zuluaga": "MIGAN CAPITAL",
    "Milton Muñoz": "MIGAN CAPITAL",
    "La Montaña Decepaz": "MIGAN CAPITAL",
    "Ciudadela del Río": "MIGAN CAPITAL",
    "La Montaña Morichal": "MIGAN CAPITAL",

    // RUTA 3 - Puerto Tejada / Villarica / Jamundí / Pance
    "Puerto Tejada Centro (Cra. 19 #17-45)": "CARIBE",
    "Puerto Tejada Punto 2 (Cl. 16 #20-60)": "CARIBE",
    "Villa Rica Caribe (Cra. 3 #2-60)": "CARIBE",
    "Jamundí Terranova (Cra. 51 Sur #16C-04)": "SUPERTIENDA CAÑAVERAL",
    "Jamundí Farallones (Cl. 12 Sur #10A-77)": "SUPERTIENDA CAÑAVERAL",
    "Jamundí Surtimayorista": "SUPERTIENDA CAÑAVERAL",
    "Jamundí Rosario": "SUPERTIENDA CAÑAVERAL",
    "Jamundí Principal": "SUPERTIENDA CAÑAVERAL",
    "Jamundí Centro": "SUPERTIENDA CAÑAVERAL",
    "Jamundí Panamericana": "SUPERTIENDA CAÑAVERAL",

    // RUTA 4 - Buga / Roldanillo / Zarzal / Tuluá
    "Frigorífico Buga": "CUENTA FABRICA",
    "Cañaveral Tuluá - Buga": "SUPERTIENDA CAÑAVERAL",
    "Cañaveral Roldanillo - Zarzal": "SUPERTIENDA CAÑAVERAL",
    "Sevillana Guacarí": "CUENTA SEVILLANA",
    "Caribe Buga": "CARIBE",
    "Alberto Millán Buga": "CUENTA ALBERTO MILLAN",
    "B1-PRINCIPAL (Carrera 5 # 5-48)": "BELALCAZAR",
    "B2- GALERIA (Calle 9 # 2-26)": "BELALCAZAR",
    "B3- PLANTA BELOMO (Carrera 4 # 14-66)": "BELALCAZAR",
    "B5- GUACANDA (Transversal 6 # 13-194)": "BELALCAZAR",
    "B6- ROZO (Calle 10 N # 14 A 211 Rozo- Palmira)": "BELALCAZAR",
    "B8- BOLIVAR (Carrera 3 # 13-44)": "BELALCAZAR",
    "B9- URIBE (Carrera 12 # 11-03)": "BELALCAZAR",
    "B11- GUABINAS (Calle 8 #19 B 55)": "BELALCAZAR",

    // RUTA 5 - Palmira / Villagorgona / Carmelo
    "Mercamio Palmira": "MIGAN CAPITAL",
    "Cañaveral Palmitex (Palmira)": "SUPERTIENDA CAÑAVERAL",
    "Cañaveral Palmicentro (Palmira)": "SUPERTIENDA CAÑAVERAL",
    "Sevillana Palmira / Villagorgona": "CUENTA SEVILLANA",
    "La Montaña Palmira": "MIGAN CAPITAL",
    "Cañaveral Villagorgona 1": "SUPERTIENDA CAÑAVERAL",
    "Cañaveral Villagorgona 2": "SUPERTIENDA CAÑAVERAL",
    "Nutrialimentos Valdez (Villagorgona)": "MIGAN CAPITAL",
    "Yénifer Díaz (Villagorgona)": "MIGAN CAPITAL",
    "Jorge Adrián Rodas (Villagorgona)": "MIGAN CAPITAL",
    "Carnicería JAP (Carmelo)": "MIGAN CAPITAL",
    "Carnicería Fabián López (Águila Roja)": "MIGAN CAPITAL",

    // RUTA 6 - Belalcázar / Yumbo
    "Belalcázar Centro": "BELALCAZAR",
    "Yumbo": "CUENTA FABRICA"
};

const PUNTOS_POR_RUTA = {
    "RUTA 1: Santa Elena / Cavasa": [
        "Bodega Santa Elena",
        "Garay Santa Elena",
        "Cavasa",
        "Sevillana Santa Elena",
        "Ciudad del Campo Granahorrar",
        "Ciudad del Campo Punto Rojo",
        "Ciudad del Campo Surtimercar",
        "Los Lagos Orlando Martínez",
        "La Esperanza"
    ],
    "RUTA 2: Cali (Norte / Sur / Oriente)": [
        "Cañaveral Punto 14 (Cra. 5 #14-37)",
        "Cañaveral Centenario (Av. 4N #46-64)",
        "La Montaña Av. 6A (Av. 6AN #30N-47)",
        "Cañaveral Prados del Norte (Av. 2BN #34N-19)",
        "Carnes Maiale (Cra. 1G #69-02)",
        "Districarnes LG (Cra. 4C #65B-18)",
        "Cañaveral Álamos (Cl. 75CN #2 Bis-100)",
        "Cañaveral Los Pinos (Cl. 70 #7M Bis-64)",
        "Cañaveral La Primera (Cra. 1A #44-50)",
        "La Montaña Torres (Cra. 1 #56-20)",
        "Super Carnes Los Andes (Cra. 1D #52-05)",
        "La Cosecha de Mi Tierra",
        "Carnes RYE (Cra. 17F #33A-45)",
        "Baratón Carnes Berlín (Calle 44 #19-65)",
        "El Rebajón",
        "La Montaña Calima",
        "Cañaveral Ingenio",
        "Cañaveral Limonar",
        "Cañaveral Pasoancho",
        "Sevillana Pasoancho",
        "La Montaña Pasoancho",
        "Sevillana Lourdes",
        "La Montaña Guadalupe",
        "La Montaña Cosmocentro",
        "La Montaña Cristales",
        "Cañaveral Villanueva",
        "Cañaveral Cootraemcali",
        "Mercaunión",
        "Sevillana República de Israel",
        "Jaime Zuluaga",
        "Milton Muñoz",
        "La Montaña Decepaz",
        "Ciudadela del Río",
        "La Montaña Morichal"
    ],
    "RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance": [
        "Puerto Tejada Centro (Cra. 19 #17-45)",
        "Puerto Tejada Punto 2 (Cl. 16 #20-60)",
        "Villa Rica Caribe (Cra. 3 #2-60)",
        "Jamundí Terranova (Cra. 51 Sur #16C-04)",
        "Jamundí Farallones (Cl. 12 Sur #10A-77)",
        "Jamundí Surtimayorista",
        "Jamundí Rosario",
        "Jamundí Principal",
        "Jamundí Centro",
        "Jamundí Panamericana"
    ],
    "RUTA 4: Buga / Roldanillo / Zarzal / Tuluá": [
        "Frigorífico Buga",
        "Cañaveral Tuluá - Buga",
        "Cañaveral Roldanillo - Zarzal",
        "Sevillana Guacarí",
        "Caribe Buga",
        "Alberto Millán Buga",
        "B1-PRINCIPAL (Carrera 5 # 5-48)",
        "B2- GALERIA (Calle 9 # 2-26)",
        "B3- PLANTA BELOMO (Carrera 4 # 14-66)",
        "B5- GUACANDA (Transversal 6 # 13-194)",
        "B6- ROZO (Calle 10 N # 14 A 211 Rozo- Palmira)",
        "B8- BOLIVAR (Carrera 3 # 13-44)",
        "B9- URIBE (Carrera 12 # 11-03)",
        "B11- GUABINAS (Calle 8 #19 B 55)"
    ],
    "RUTA 5: Palmira / Villagorgona / Carmelo": [
        "Mercamio Palmira",
        "Cañaveral Palmitex (Palmira)",
        "Cañaveral Palmicentro (Palmira)",
        "Sevillana Palmira / Villagorgona",
        "La Montaña Palmira",
        "Cañaveral Villagorgona 1",
        "Cañaveral Villagorgona 2",
        "Nutrialimentos Valdez (Villagorgona)",
        "Yénifer Díaz (Villagorgona)",
        "Jorge Adrián Rodas (Villagorgona)",
        "Carnicería JAP (Carmelo)",
        "Carnicería Fabián López (Águila Roja)"
    ],
    "RUTA 6: Yumbo / Otras": [
        "Yumbo"
    ]
};

function getPuntosParaRuta(rutaSeleccionada) {
    if (!rutaSeleccionada) return [];
    if (PUNTOS_POR_RUTA[rutaSeleccionada]) return PUNTOS_POR_RUTA[rutaSeleccionada];
    
    // Fuzzy match por número de ruta ("RUTA 1", "RUTA 4", etc.)
    const match = rutaSeleccionada.match(/RUTA\s*(\d+)/i);
    if (match) {
        const num = match[1];
        for (const key in PUNTOS_POR_RUTA) {
            if (key.includes(`RUTA ${num}`) || key.includes(`RUTA${num}`)) {
                return PUNTOS_POR_RUTA[key];
            }
        }
    }
    return [];
}

function populardropdownSucursalesPorRuta(rutaSeleccionada) {
    const sucursalSelect = document.getElementById('sucursal');
    const proveedorSelect = document.getElementById('proveedor');
    if (!sucursalSelect) return;

    sucursalSelect.disabled = false;
    sucursalSelect.innerHTML = '<option value="" disabled selected>Seleccione el punto de recolección</option>';

    let listaPuntos = getPuntosParaRuta(rutaSeleccionada);
    if (listaPuntos.length === 0) {
        // Mostrar todos si es ruta genérica o no definida
        listaPuntos = Object.keys(PUNTO_TO_PROVEEDOR_MAP);
    }

    listaPuntos.forEach(pt => {
        const opt = document.createElement('option');
        opt.value = pt;
        opt.textContent = pt;
        sucursalSelect.appendChild(opt);
    });

    const optOtra = document.createElement('option');
    optOtra.value = 'OTRA_SUCURSAL';
    optOtra.textContent = '➕ Otro Punto / Sucursal...';
    sucursalSelect.appendChild(optOtra);

    if (proveedorSelect) {
        proveedorSelect.disabled = false;
    }
}

function actualizarItinerarioDelDia() {
    const bannerText = document.getElementById('day-schedule-text');
    if (!bannerText) return;

    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const hoyIndex = new Date().getDay();
    const hoyNombre = dias[hoyIndex];

    const itinerarioMap = {
        'Lunes': 'RUTA 1 (Santa Elena), RUTA 4 (Frigorífico Buga)',
        'Martes': 'RUTA 2 (Cali Norte/Centro), RUTA 4 (Cañaveral Tuluá/Buga), RUTA 1',
        'Miércoles': 'RUTA 3 (Puerto Tejada/Jamundí), RUTA 1 (Sevillana Santa Elena), RUTA 4 (Guacarí/Buga)',
        'Jueves': 'RUTA 5 (Palmira/Villagorgona/Carmelo), RUTA 4 (Alberto Millán)',
        'Viernes': 'RUTA 2 (Cali Sur/Oriente), RUTA 1 (Sevillana/Ciudad del Campo)',
        'Sábado': 'RUTA 1 (Santa Elena/Los Lagos/La Esperanza), RUTA 4 (Frigorífico Buga)',
        'Domingo': 'Día sin programación regular. Selección libre de ruta.'
    };

    const itinHoy = itinerarioMap[hoyNombre] || 'Programación general activa';
    bannerText.innerHTML = `📅 <strong>Hoy es ${hoyNombre}:</strong> ${itinHoy}`;
}

function populardropdownSucursales(proveedorSeleccionado) {
    const sucursalSelect = document.getElementById('sucursal');
    const customSucursalGroup = document.getElementById('custom-sucursal-group');
    if (!sucursalSelect) return;

    sucursalSelect.disabled = false;

    if (!proveedorSeleccionado) {
        sucursalSelect.innerHTML = '<option value="" selected>Sede Principal / General</option>';
        return;
    }

    const normProv = proveedorSeleccionado.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const listaSucursales = Object.keys(PUNTO_TO_PROVEEDOR_MAP).filter(punto => {
        const target = (PUNTO_TO_PROVEEDOR_MAP[punto] || '').trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return target === normProv || target.includes(normProv) || normProv.includes(target);
    });
    
    if (listaSucursales.length > 0) {
        sucursalSelect.innerHTML = '<option value="" disabled selected>Seleccione el punto de recolección</option>';
        listaSucursales.forEach(suc => {
            const opt = document.createElement('option');
            opt.value = suc;
            opt.textContent = suc;
            sucursalSelect.appendChild(opt);
        });
    } else {
        sucursalSelect.innerHTML = '<option value="" selected>Sede Principal / General</option>';
    }

    const optOtra = document.createElement('option');
    optOtra.value = 'OTRA_SUCURSAL';
    optOtra.textContent = '➕ Otro Punto / Sucursal...';
    sucursalSelect.appendChild(optOtra);

    sucursalSelect.onchange = () => {
        if (sucursalSelect.value === 'OTRA_SUCURSAL') {
            if (customSucursalGroup) customSucursalGroup.style.display = 'block';
        } else {
            if (customSucursalGroup) customSucursalGroup.style.display = 'none';
        }
    };
}

const CRONOGRAMA_RUTAS = {
    "RUTA 2: Cali (Norte / Sur / Oriente)": [
        { hora: "06:30 AM", cliente: "Cañaveral Punto 14", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cra. 5 #14-37", tel: "3244935167" },
        { hora: "07:00 AM", cliente: "Cañaveral Centenario", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Av. 4 Norte #46-64", tel: "3102022829" },
        { hora: "07:30 AM", cliente: "La Montaña Av. 6A", proveedor: "MIGAN CAPITAL", direccion: "Av. 6A N #30N-47", tel: "" },
        { hora: "08:00 AM", cliente: "Cañaveral Prados del Norte", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Av. 2B Norte #34N-19", tel: "" },
        { hora: "09:00 AM", cliente: "Carnes Maiale", proveedor: "MIGAN CAPITAL", direccion: "Cra. 1G #69-02 Esquina", tel: "" },
        { hora: "09:30 AM", cliente: "Districarnes LG", proveedor: "MIGAN CAPITAL", direccion: "Cra. 4C #65B-18", tel: "" },
        { hora: "10:00 AM", cliente: "Cañaveral Álamos", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Calle 75C N #2 Bis-100", tel: "3243192838" },
        { hora: "10:30 AM", cliente: "Cañaveral Los Pinos", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Calle 70 #7M Bis-64", tel: "3243192839" },
        { hora: "11:00 AM", cliente: "Cañaveral La Primera", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cra. 1A #44-50", tel: "3184277811" },
        { hora: "11:30 AM", cliente: "La Montaña Torres", proveedor: "MIGAN CAPITAL", direccion: "Cra. 1 #56-20", tel: "" },
        { hora: "12:00 PM", cliente: "Super Carnes Los Andes", proveedor: "MIGAN CAPITAL", direccion: "Cra. 1D #52-05", tel: "" },
        { hora: "01:00 PM", cliente: "La Cosecha de Mi Tierra", proveedor: "MIGAN CAPITAL", direccion: "Cra. 15 Calle 54 Esquina", tel: "" },
        { hora: "01:30 PM", cliente: "Carnes RYE", proveedor: "COMERCIALIZADORA R Y E", direccion: "Cra. 17F #33A-45", tel: "" },
        { hora: "02:00 PM", cliente: "Baratón Carnes Berlín", proveedor: "MIGAN CAPITAL", direccion: "Calle 44 #19-65", tel: "" },
        { hora: "02:30 PM", cliente: "El Rebajón", proveedor: "MIGAN CAPITAL", direccion: "Calle 44", tel: "" },
        { hora: "03:00 PM", cliente: "La Montaña Calima", proveedor: "MIGAN CAPITAL", direccion: "Calima", tel: "" },
        
        { hora: "07:00 AM", cliente: "Cañaveral Ingenio (Viernes Sur)", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Ingenio", tel: "" },
        { hora: "07:30 AM", cliente: "Cañaveral Limonar", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Limonar", tel: "" },
        { hora: "08:00 AM", cliente: "Cañaveral Pasoancho", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Pasoancho", tel: "" },
        { hora: "08:30 AM", cliente: "Sevillana Pasoancho", proveedor: "CUENTA SEVILLANA", direccion: "Pasoancho", tel: "" },
        { hora: "09:00 AM", cliente: "La Montaña Pasoancho", proveedor: "MIGAN CAPITAL", direccion: "Calle 14C #25-16", tel: "" },
        { hora: "09:30 AM", cliente: "Sevillana Lourdes", proveedor: "CUENTA SEVILLANA", direccion: "Transv. 29D #29-50", tel: "" },
        { hora: "10:00 AM", cliente: "La Montaña Guadalupe", proveedor: "MIGAN CAPITAL", direccion: "Guadalupe", tel: "" },
        { hora: "10:30 AM", cliente: "La Montaña Cosmocentro", proveedor: "MIGAN CAPITAL", direccion: "Cosmocentro", tel: "" },
        { hora: "11:00 AM", cliente: "La Montaña Cristales", proveedor: "MIGAN CAPITAL", direccion: "Cristales", tel: "" },
        { hora: "11:30 AM", cliente: "Cañaveral Villanueva", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Calle 13 #75A-185", tel: "" },
        { hora: "12:00 PM", cliente: "Cañaveral Cootraemcali", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cra. 70 #13B-18", tel: "" },
        { hora: "12:30 PM", cliente: "Mercaunión", proveedor: "MIGAN CAPITAL", direccion: "Calle 25 #85B-100", tel: "" },
        { hora: "01:00 PM", cliente: "Sevillana República de Israel", proveedor: "CUENTA SEVILLANA", direccion: "Calle 16A #121A-334", tel: "" },
        { hora: "01:30 PM", cliente: "Jaime Zuluaga", proveedor: "MIGAN CAPITAL", direccion: "Sur", tel: "" },
        { hora: "02:00 PM", cliente: "Milton Muñoz", proveedor: "MIGAN CAPITAL", direccion: "Sur", tel: "" },
        { hora: "02:30 PM", cliente: "La Montaña Decepaz", proveedor: "MIGAN CAPITAL", direccion: "Decepaz", tel: "" },
        { hora: "03:00 PM", cliente: "Ciudadela del Río", proveedor: "MIGAN CAPITAL", direccion: "Oriente", tel: "" },
        { hora: "03:30 PM", cliente: "La Montaña Morichal", proveedor: "MIGAN CAPITAL", direccion: "Morichal", tel: "" }
    ],
    "RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance": [
        { hora: "07:00 AM", cliente: "Puerto Tejada Centro", proveedor: "CARIBE", direccion: "Cra. 19 #17-45", tel: "" },
        { hora: "08:00 AM", cliente: "Puerto Tejada Punto 2", proveedor: "CARIBE", direccion: "Cl. 16 #20-60", tel: "" },
        { hora: "09:00 AM", cliente: "Villa Rica Caribe", proveedor: "CARIBE", direccion: "Cra. 3 #2-60", tel: "" },
        { hora: "10:00 AM", cliente: "Jamundí Terranova", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cra. 51 Sur #16C-04", tel: "" },
        { hora: "11:00 AM", cliente: "Jamundí Farallones", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cl. 12 Sur #10A-77", tel: "" },
        { hora: "11:30 AM", cliente: "Jamundí Surtimayorista", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cra. 10 #11-66", tel: "" },
        { hora: "12:00 PM", cliente: "Jamundí Rosario", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cra. 11 #3-93", tel: "" },
        { hora: "01:00 PM", cliente: "Jamundí Principal", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cra. 7 #10-48", tel: "" },
        { hora: "01:30 PM", cliente: "Jamundí Centro", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cl. 11 #9-58", tel: "" },
        { hora: "02:00 PM", cliente: "Jamundí Panamericana", proveedor: "SUPERTIENDA CAÑAVERAL", direccion: "Cra. 3D #11-145", tel: "" }
    ]
};

function renderizarCronogramaRuta(rutaSeleccionada) {
    const container = document.getElementById('route-schedule-container');
    const timelineList = document.getElementById('schedule-timeline-list');

    if (!container || !timelineList) return;

    const paradas = CRONOGRAMA_RUTAS[rutaSeleccionada];
    if (!paradas || paradas.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    timelineList.innerHTML = '';

    paradas.forEach(p => {
        const item = document.createElement('div');
        item.style.cssText = 'background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid #38bdf8; transition: background 0.2s;';
        
        item.innerHTML = `
            <div>
                <span style="font-weight: bold; color: #38bdf8; font-size: 0.85rem;">⏰ ${p.hora}</span> - 
                <span style="color: #f8fafc; font-size: 0.85rem; font-weight: 500;">${p.cliente}</span>
                <div style="font-size: 0.75rem; color: #94a3b8;">📍 ${p.direccion} ${p.tel ? ' | 📞 ' + p.tel : ''}</div>
            </div>
            <button type="button" style="background: #0284c7; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">Seleccionar</button>
        `;

        item.onmouseover = () => item.style.background = 'rgba(56, 189, 248, 0.15)';
        item.onmouseout = () => item.style.background = 'rgba(255,255,255,0.05)';

        item.onclick = () => {
            // Autocompletar proveedor y sucursal
            const proveedorSelect = document.getElementById('proveedor');
            if (proveedorSelect) {
                for (let i = 0; i < proveedorSelect.options.length; i++) {
                    if (proveedorSelect.options[i].value === p.proveedor) {
                        proveedorSelect.selectedIndex = i;
                        populardropdownSucursales(p.proveedor);
                        break;
                    }
                }
            }

            const sucursalSelect = document.getElementById('sucursal');
            if (sucursalSelect) {
                let found = false;
                for (let i = 0; i < sucursalSelect.options.length; i++) {
                    if (sucursalSelect.options[i].text.toLowerCase().includes(p.cliente.toLowerCase())) {
                        sucursalSelect.selectedIndex = i;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    const opt = document.createElement('option');
                    opt.value = p.cliente + ' (' + p.direccion + ')';
                    opt.textContent = p.cliente + ' (' + p.direccion + ')';
                    sucursalSelect.appendChild(opt);
                    sucursalSelect.value = opt.value;
                }
            }
        };

        timelineList.appendChild(item);
    });
}

function populardropdownProveedores(proveedoresList, mostrandoTodos) {
    const proveedorSelect = document.getElementById('proveedor');
    proveedorSelect.disabled = false;
    proveedorSelect.innerHTML = '<option value="" disabled selected>Seleccione el proveedor</option>';

    proveedoresList.forEach(prov => {
        const opt = document.createElement('option');
        opt.value = prov;
        opt.textContent = prov;
        proveedorSelect.appendChild(opt);
    });

    if (!mostrandoTodos) {
        const optTodos = document.createElement('option');
        optTodos.value = 'TODOS';
        optTodos.textContent = '📋 -- Mostrar todos los proveedores --';
        proveedorSelect.appendChild(optTodos);
    }

    const optOtro = document.createElement('option');
    optOtro.value = 'OTRO';
    optOtro.textContent = '➕ Otro Proveedor...';
    proveedorSelect.appendChild(optOtro);
}

// Carga en segundo plano desde el backend si hay actualización de rutas
async function sincronizarRutasDesdeSheets() {
    if (!GOOGLE_SHEETS_WEBHOOK_URL) return;
    try {
        const response = await fetch(`${GOOGLE_SHEETS_WEBHOOK_URL}?action=getRutas`);
        if (response.ok) {
            const remoteConfig = await response.json();
            if (remoteConfig && typeof remoteConfig === 'object' && !remoteConfig.productos && Object.keys(remoteConfig).length > 0) {
                rutasConfig = remoteConfig;
                localStorage.setItem('proteinagro_rutas_config', JSON.stringify(remoteConfig));
                console.log("🔄 Configuración de rutas actualizada dinámicamente desde Google Sheets.");
            } else {
                localStorage.removeItem('proteinagro_rutas_config');
            }
        }
    } catch (e) {
        console.log("ℹ️ Usando configuración de rutas local/en caché.");
    }
}

// === SISTEMA DE COMPROBANTE DIGITAL / VOUCHER DE RECOLECCIÓN ===
let currentReceiptData = null;

function mostrarComprobanteDigital(data) {
    currentReceiptData = data;
    const modal = document.getElementById('receipt-modal');
    if (!modal) return;

    const dateObj = new Date(data.fecha || Date.now());
    document.getElementById('receipt-number').textContent = `N° ${data.id || 'REC-' + Date.now()}`;
    document.getElementById('receipt-date').textContent = dateObj.toLocaleDateString();
    document.getElementById('receipt-time').textContent = dateObj.toLocaleTimeString();
    document.getElementById('receipt-driver').textContent = data.conductor || '-';
    document.getElementById('receipt-route').textContent = data.ruta || '-';
    document.getElementById('receipt-provider').textContent = data.proveedor || '-';
    document.getElementById('receipt-branch').textContent = data.punto || data.sucursal || 'General';

    // Rellenar tabla de items
    const tbody = document.getElementById('receipt-items-body');
    tbody.innerHTML = '';
    if (data.productos && Array.isArray(data.productos)) {
        data.productos.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-weight: 500; color: #1e293b;">${p.producto}</td>
                <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #0284c7;">${p.kilos} KG</td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('receipt-total-kilos').textContent = `${data.totalKilos || 0} KG`;

    const obsContainer = document.getElementById('receipt-obs-container');
    if (data.observaciones && data.observaciones.trim() !== '') {
        obsContainer.style.display = 'block';
        document.getElementById('receipt-obs').textContent = data.observaciones;
    } else {
        obsContainer.style.display = 'none';
    }

    const sigImg = document.getElementById('receipt-signature-img');
    if (data.firma) {
        sigImg.src = data.firma;
        sigImg.style.display = 'inline-block';
    } else {
        sigImg.style.display = 'none';
    }

    modal.style.display = 'flex';
}

document.getElementById('btn-close-receipt')?.addEventListener('click', () => {
    const modal = document.getElementById('receipt-modal');
    if (modal) modal.style.display = 'none';
});

document.getElementById('btn-share-whatsapp')?.addEventListener('click', () => {
    if (!currentReceiptData) return;
    const d = currentReceiptData;
    const dateObj = new Date(d.fecha || Date.now());

    let prodsTxt = '';
    if (d.productos && Array.isArray(d.productos)) {
        prodsTxt = d.productos.map(p => `  • ${p.producto}: *${p.kilos} KG*`).join('\n');
    }

    const msg = `🌿 *PROTEINAGRO - COMPROBANTE DE RECOLECCIÓN*\n` +
        `-----------------------------------------\n` +
        `📄 *N° Recibo:* ${d.id || 'N/A'}\n` +
        `📅 *Fecha:* ${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}\n` +
        `🚛 *Conductor:* ${d.conductor}\n` +
        `🗺️ *Ruta:* ${d.ruta}\n` +
        `🏬 *Proveedor:* ${d.proveedor}\n` +
        `📍 *Sucursal/Punto:* ${d.punto || d.sucursal || 'General'}\n` +
        `-----------------------------------------\n` +
        `📦 *PRODUCTOS RECOLECTADOS:*\n${prodsTxt}\n` +
        `-----------------------------------------\n` +
        `⚖️ *TOTAL RECOLECTADO: ${d.totalKilos} KG*\n` +
        (d.observaciones ? `📝 *Observaciones:* ${d.observaciones}\n` : '') +
        `✍️ *Firma Registrada:* OK\n` +
        `-----------------------------------------\n` +
        `_Certificado digital emitido en punto por ProteinAgro_`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
});

document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
    window.print();
});

// Inicializar selectores dinámicos y catálogos al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    initRutasYProveedores();
    cargarCatalogosDinamicos();
});
