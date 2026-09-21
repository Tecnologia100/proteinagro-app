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
let GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx4X0yiSS7Tisgyn2Xn2NuAlB9uWRwAP019Jurc4TvSyBseg3un47xA2d6o0rFs0Y5o9A/exec"; 

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

// === ESTADO DE AUTENTICACIÓN Y ROLES ===
const DEFAULT_CONDUCTORES_AUTH = {
    "Ricardo Sepulveda": "1649",
    "Hernando Prado": "8063",
    "Emer Rodriguez": "6860",
    "Jairo Peña": "5301",
    "Carolina": "1306",
    "Carolina ": "1306",
    "Luz elena lopez": "6700",
    "francisco larrahondo": "1234"
};

let CONDUCTORES_AUTH = Object.assign({}, DEFAULT_CONDUCTORES_AUTH);
let ADMIN_CLAVE_CONFIG = "0000";
let CURRENT_LOGGED_DRIVER = null;

// Cargar credenciales previas desde localStorage si existen (Soporte Offline inmediato)
try {
    const cachedAuth = localStorage.getItem('proteinagro_conductores_auth');
    if (cachedAuth) {
        const parsed = JSON.parse(cachedAuth);
        if (parsed && typeof parsed === 'object') {
            // Limpiar claves dummy obsoletas ('1234') para conductores con contraseña oficial asignada
            Object.keys(parsed).forEach(k => {
                const cleanKey = k.trim();
                if (parsed[k] === '1234' && DEFAULT_CONDUCTORES_AUTH[cleanKey] && DEFAULT_CONDUCTORES_AUTH[cleanKey] !== '1234') {
                    parsed[k] = DEFAULT_CONDUCTORES_AUTH[cleanKey];
                }
            });
            CONDUCTORES_AUTH = Object.assign({}, DEFAULT_CONDUCTORES_AUTH, parsed);
        }
    }
    const cachedAdmin = localStorage.getItem('proteinagro_admin_clave');
    if (cachedAdmin) {
        ADMIN_CLAVE_CONFIG = cachedAdmin;
    }
} catch (e) {}

// Elementos de cambio de modo en la pantalla de Login
const conductorLoginSection = document.getElementById('conductor-login-section');
const adminLoginSection = document.getElementById('admin-login-section');
const btnToggleAdminLogin = document.getElementById('btn-toggle-admin-login');
const btnBackToConductor = document.getElementById('btn-back-to-conductor');
const btnAdminSubmit = document.getElementById('btn-admin-submit');

const mostrarLoginAdmin = () => {
    if (conductorLoginSection) conductorLoginSection.style.display = 'none';
    if (adminLoginSection) adminLoginSection.style.display = 'block';
    const err = document.getElementById('login-admin-error');
    if (err) err.style.display = 'none';
    document.getElementById('login-admin-pin')?.focus();
};

const mostrarLoginConductor = () => {
    if (adminLoginSection) adminLoginSection.style.display = 'none';
    if (conductorLoginSection) conductorLoginSection.style.display = 'block';
    const err = document.getElementById('login-error');
    if (err) err.style.display = 'none';
    document.getElementById('login-conductor')?.focus();
};

btnToggleAdminLogin?.addEventListener('click', mostrarLoginAdmin);
btnBackToConductor?.addEventListener('click', mostrarLoginConductor);

// Función para ingresar como Administrador
const entrarComoAdmin = () => {
    loginOverlay.style.display = 'none';
    driverView.style.display = 'none';
    adminView.style.display = 'block';
    document.body.style.backgroundColor = 'var(--bg-color)';
    loadAdminData();
};

// Función para ingresar como Conductor (fijando y bloqueando el nombre)
const entrarComoConductor = (nombre = null) => {
    loginOverlay.style.display = 'none';
    adminView.style.display = 'none';
    driverView.style.display = 'flex';
    document.body.style.backgroundColor = 'var(--bg-color)';

    if (nombre) {
        CURRENT_LOGGED_DRIVER = nombre;
        try {
            sessionStorage.setItem('proteinagro_current_driver', nombre);
        } catch(e) {}

        const select = document.getElementById('conductor');
        if (select) {
            let found = false;
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value.toLowerCase() === nombre.toLowerCase() || select.options[i].text.toLowerCase() === nombre.toLowerCase()) {
                    select.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            if (!found) {
                const opt = document.createElement('option');
                opt.value = nombre;
                opt.textContent = nombre;
                select.appendChild(opt);
                select.value = nombre;
            }
            // Bloquear selector para evitar manipulación accidental
            select.setAttribute('disabled', 'disabled');
            select.classList.add('driver-locked');
        }

        // Mostrar badges visuales de sesión activa
        const sessionBadge = document.getElementById('conductor-session-badge');
        if (sessionBadge) sessionBadge.style.display = 'inline-flex';

        const headerBadge = document.getElementById('driver-header-badge');
        const headerName = document.getElementById('driver-header-name');
        if (headerBadge && headerName) {
            headerName.textContent = nombre;
            headerBadge.style.display = 'inline-flex';
        }
    }
};

// Login de Conductor con clave individual
const handleConductorLogin = (e) => {
    if (e) e.preventDefault();
    const driverSelect = document.getElementById('login-conductor');
    const driverName = (driverSelect?.value || '').trim();
    const pin = (document.getElementById('login-pin')?.value || '').trim();
    const errorMsg = document.getElementById('login-error');
    if (errorMsg) errorMsg.style.display = 'none';

    if (!driverName) {
        if (errorMsg) {
            errorMsg.textContent = 'Por favor seleccione su nombre de conductor';
            errorMsg.style.display = 'block';
        }
        driverSelect?.focus();
        return;
    }

    if (!pin) {
        if (errorMsg) {
            errorMsg.textContent = 'Por favor ingrese su PIN o contraseña';
            errorMsg.style.display = 'block';
        }
        document.getElementById('login-pin')?.focus();
        return;
    }

    // Verificar clave individual de Sheets o credenciales predeterminadas
    const cleanDriverName = driverName.trim();
    const expectedPin = CONDUCTORES_AUTH[cleanDriverName] || 
                        CONDUCTORES_AUTH[driverName] || 
                        DEFAULT_CONDUCTORES_AUTH[cleanDriverName] || 
                        DEFAULT_CONDUCTORES_AUTH[driverName];

    // Validación de seguridad estricta:
    // 1. Debe coincidir con la clave asignada al conductor
    // 2. O clave maestra de respaldo de administración ('0000')
    // 3. Solo si el conductor no tuviese ninguna clave asignada en el sistema, se admite '1234' o '0000'
    const pinValido = (expectedPin && expectedPin !== '' && pin === expectedPin) ||
                      (pin === '0000') ||
                      (!expectedPin && (pin === '1234' || pin === '0000'));

    if (pinValido) {
        entrarComoConductor(driverName);
    } else {
        if (errorMsg) {
            errorMsg.textContent = 'Contraseña incorrecta para ' + driverName;
            errorMsg.style.display = 'block';
        }
        const pinInput = document.getElementById('login-pin');
        if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
        }
    }
};

// Login de Administrador
const handleAdminLogin = async (e) => {
    if (e) e.preventDefault();
    const userInput = (document.getElementById('login-admin-user')?.value || '').trim();
    const pin = (document.getElementById('login-admin-pin')?.value || '').trim();
    const errorMsg = document.getElementById('login-admin-error');
    if (errorMsg) errorMsg.style.display = 'none';

    // 1. Firebase Auth si se ingresa un correo corporativo
    if (userInput.includes('@')) {
        try {
            const creds = await auth.signInWithEmailAndPassword(userInput, pin);
            if (creds.user) {
                if (creds.user.email && creds.user.email.toLowerCase().includes('admin')) {
                    entrarComoAdmin();
                } else {
                    entrarComoConductor(userInput);
                }
                return;
            }
        } catch (authErr) {
            console.warn("⚠️ Firebase Auth falló, verificando clave admin directa:", authErr.message);
        }
    }

    // 2. Validación de clave de Administrador
    const userLower = userInput.toLowerCase();
    const esUsuarioAdmin = (userLower === 'admin' || userLower === 'administrador' || userLower === '');
    const pinAdminValido = (ADMIN_CLAVE_CONFIG && pin === ADMIN_CLAVE_CONFIG) || 
                           (pin === '0000' || pin === 'admin' || pin === '1234');

    if (esUsuarioAdmin && pinAdminValido) {
        entrarComoAdmin();
    } else {
        if (errorMsg) {
            errorMsg.textContent = 'Usuario o contraseña de administrador incorrecta';
            errorMsg.style.display = 'block';
        }
        const adminPinInput = document.getElementById('login-admin-pin');
        if (adminPinInput) {
            adminPinInput.value = '';
            adminPinInput.focus();
        }
    }
};

// Escuchas de eventos para submit
document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (adminLoginSection && adminLoginSection.style.display !== 'none') {
        handleAdminLogin(e);
    } else {
        handleConductorLogin(e);
    }
});
btnAdminSubmit?.addEventListener('click', handleAdminLogin);
btnLogin?.addEventListener('click', handleConductorLogin);

// Detectar sesión activa de Firebase Auth (persistencia en navegador)
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("✅ Usuario autenticado:", user.email);
    }
});

// Cierre de sesión (Logout)
const logout = () => {
    if (auth.currentUser) {
        auth.signOut().catch(() => {});
    }
    CURRENT_LOGGED_DRIVER = null;
    try {
        sessionStorage.removeItem('proteinagro_current_driver');
    } catch(e) {}

    loginOverlay.style.display = 'flex';
    driverView.style.display = 'none';
    adminView.style.display = 'none';
    
    // Limpiar contraseñas
    const pinInput = document.getElementById('login-pin');
    if (pinInput) pinInput.value = '';
    const adminPinInput = document.getElementById('login-admin-pin');
    if (adminPinInput) adminPinInput.value = '';

    // Restablecer modo conductor por defecto
    mostrarLoginConductor();

    // Desbloquear select de conductor para siguiente sesión
    const select = document.getElementById('conductor');
    if (select) {
        select.removeAttribute('disabled');
        select.classList.remove('driver-locked');
    }
    const sessionBadge = document.getElementById('conductor-session-badge');
    if (sessionBadge) sessionBadge.style.display = 'none';
    const headerBadge = document.getElementById('driver-header-badge');
    if (headerBadge) headerBadge.style.display = 'none';
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

const DEFAULT_PRODUCTOS = [
    "ACEITE",
    "CABEZAS",
    "CALAMBOMBO DE CERDO",
    "CALAMBOMBO DE RES",
    "DESPERDICIO",
    "EMPELLA",
    "GORDANA",
    "HUESO BLANCO",
    "HUESO DE CERDO",
    "HUESO PROMOCION",
    "HUESO SECO",
    "LEÑA",
    "MANTECA",
    "MANTEQUILLA",
    "MARGARINA",
    "OREJAS DE CERDO",
    "PIEL POLLO",
    "PULMON DE CERDO",
    "SEBO EN RAMA",
    "TRAQUEAS"
];
const DEFAULT_CONDUCTORES = [
    "Ricardo Sepulveda",
    "Hernando Prado",
    "Emer Rodriguez",
    "Jairo Peña",
    "Carolina",
    "Luz elena lopez",
    "francisco larrahondo"
];
const DEFAULT_RUTAS = [
    "RUTA 1: Santa Elena / Cavasa",
    "RUTA 2: Cali (Norte / Centro / Sur / Oriente)",
    "RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance",
    "RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo",
    "RUTA 5: Palmira / Villagorgona / Carmelo",
    "PLANTA SAN JOAQUIN"
];

const PRODUCT_DISPLAY_MAP = {
    "ACEITE": { emoji: "🛢️", label: "ACEITE" },
    "CABEZAS": { emoji: "🐮", label: "CABEZAS" },
    "CALAMBOMBO DE CERDO": { emoji: "🦴", label: "CALAMBOMBO CERDO" },
    "CALAMBOMBO CERDO": { emoji: "🦴", label: "CALAMBOMBO CERDO" },
    "CALAMBOMBO DE RES": { emoji: "🦴", label: "CALAMBOMBO RES" },
    "CALAMBOMBO RES": { emoji: "🦴", label: "CALAMBOMBO RES" },
    "DESPERDICIO": { emoji: "🗑️", label: "DESPERDICIO" },
    "EMPELLA": { emoji: "🐷", label: "EMPELLA" },
    "GORDANA": { emoji: "🥓", label: "GORDANA" },
    "HARINA CARNE": { emoji: "🥩", label: "HARINA CARNE" },
    "HARINA DE HUESO VAPORIZADA": { emoji: "🦴", label: "H. VAPORIZADO" },
    "HUESO BLANCO": { emoji: "🦴", label: "HUESO BLANCO" },
    "HUESO CALCINADO": { emoji: "🦴", label: "HUESO CALCINADO" },
    "HUESO DE CERDO": { emoji: "🐷", label: "HUESO CERDO" },
    "HUESO CERDO": { emoji: "🐷", label: "HUESO CERDO" },
    "HUESO PROMOCION": { emoji: "🦴", label: "H. PROMOCION" },
    "HUESO SECO": { emoji: "🦴", label: "HUESO SECO" },
    "LEÑA": { emoji: "🪵", label: "LEÑA" },
    "MANTECA": { emoji: "🧈", label: "MANTECA" },
    "MANTEQUILLA": { emoji: "🧈", label: "MANTEQUILLA" },
    "MARGARINA": { emoji: "🧈", label: "MARGARINA" },
    "OREJAS DE CERDO": { emoji: "🐷", label: "OREJAS CERDO" },
    "OREJAS CERDO": { emoji: "🐷", label: "OREJAS CERDO" },
    "PIEL POLLO": { emoji: "🐔", label: "PIEL POLLO" },
    "PULMON DE CERDO": { emoji: "🫁", label: "PULMON CERDO" },
    "PULMON CERDO": { emoji: "🫁", label: "PULMON CERDO" },
    "SEBO": { emoji: "🧈", label: "SEBO" },
    "SEBO EN RAMA": { emoji: "🧈", label: "SEBO EN RAMA" },
    "TRAQUEAS": { emoji: "🥩", label: "TRAQUEAS" }
};

function getEmojiForProduct(name) {
    const key = (name || '').trim().toUpperCase();
    if (PRODUCT_DISPLAY_MAP[key]) return PRODUCT_DISPLAY_MAP[key].emoji;

    if (key.includes('ACEITE')) return '🛢️';
    if (key.includes('CABEZAS')) return '🐮';
    if (key.includes('CALAMBOMBO')) return '🦴';
    if (key.includes('DESPERDICIO')) return '🗑️';
    if (key.includes('OREJAS')) return '🐷';
    if (key.includes('EMPELLA')) return '🐷';
    if (key.includes('HUESO') && (key.includes('CERDO') || key.includes('PUERCO') || key.includes('COCHINO'))) return '🐷';
    if (key.includes('HUESO')) return '🦴';
    if (key.includes('GORDANA')) return '🥓';
    if (key.includes('HARINA')) return '🥩';
    if (key.includes('LEÑA') || key.includes('LENA')) return '🪵';
    if (key.includes('MANTECA') || key.includes('MARGARINA') || key.includes('MANTEQUILLA') || key.includes('SEBO')) return '🧈';
    if (key.includes('POLLO') || key.includes('PIEL')) return '🐔';
    if (key.includes('PULMON')) return '🫁';
    if (key.includes('TRAQUEAS') || key.includes('CARNE')) return '🥩';
    return '📦';
}

function getDisplayLabelForProduct(name) {
    const key = (name || '').trim().toUpperCase();
    if (PRODUCT_DISPLAY_MAP[key]) return PRODUCT_DISPLAY_MAP[key].label;
    return name;
}

function obtenerPuntoSeleccionado() {
    const sucursalSel = document.getElementById('sucursal');
    if (!sucursalSel) return '';
    const val = (sucursalSel.value || '').trim();
    if (!val) return '';
    if (val === 'OTRA_SUCURSAL') {
        const customInput = document.getElementById('custom-sucursal');
        return customInput ? customInput.value.trim() : '';
    }
    return sucursalSel.options[sucursalSel.selectedIndex]?.text || val;
}

function validarPuntoObligatorio(mostrarAlerta = true) {
    const sucursalSel = document.getElementById('sucursal');
    const customSuc = document.getElementById('custom-sucursal');
    const errorMsg = document.getElementById('sucursal-error');
    const customErrorMsg = document.getElementById('custom-sucursal-error');

    // Limpiar errores previos
    if (sucursalSel) sucursalSel.classList.remove('input-error');
    if (customSuc) customSuc.classList.remove('input-error');
    if (errorMsg) errorMsg.style.display = 'none';
    if (customErrorMsg) customErrorMsg.style.display = 'none';

    if (!sucursalSel || !sucursalSel.value || sucursalSel.value === '') {
        if (sucursalSel) {
            sucursalSel.classList.add('input-error');
            sucursalSel.focus();
            sucursalSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (errorMsg) errorMsg.style.display = 'block';
        if (mostrarAlerta) {
            alert('⚠️ Campo Obligatorio: Debe registrar o seleccionar el Punto / Lugar de Recolección antes de continuar.');
        }
        return false;
    }

    if (sucursalSel.value === 'OTRA_SUCURSAL') {
        const customVal = customSuc ? customSuc.value.trim() : '';
        if (!customVal) {
            if (customSuc) {
                customSuc.classList.add('input-error');
                customSuc.focus();
                customSuc.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            if (customErrorMsg) customErrorMsg.style.display = 'block';
            if (mostrarAlerta) {
                alert('⚠️ Campo Obligatorio: Por favor escriba el nombre del nuevo Punto / Sucursal.');
            }
            return false;
        }
    }

    return true;
}

function renderDynamicProducts(prods) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    grid.innerHTML = '';
    // Ordenar siempre los productos alfabéticamente de la A a la Z
    const prodsOrdenados = (Array.isArray(prods) ? prods.slice() : []).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    prodsOrdenados.forEach(pName => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'product-btn';
        btn.dataset.value = pName;
        btn.innerHTML = `${getEmojiForProduct(pName)} ${getDisplayLabelForProduct(pName)}`;
        btn.addEventListener('click', () => {
            // 1. Validar que Conductor esté seleccionado
            const conductorSel = document.getElementById('conductor');
            if (!conductorSel || !conductorSel.value) {
                if (conductorSel) {
                    conductorSel.classList.add('input-error');
                    conductorSel.focus();
                    conductorSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                alert("⚠️ Por favor seleccione primero el Conductor.");
                return;
            } else {
                conductorSel.classList.remove('input-error');
            }

            // 2. Validar que Ruta esté seleccionada
            const rutaSel = document.getElementById('ruta');
            if (!rutaSel || !rutaSel.value) {
                if (rutaSel) {
                    rutaSel.classList.add('input-error');
                    rutaSel.focus();
                    rutaSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                alert("⚠️ Por favor seleccione primero la Ruta de Recolección.");
                return;
            } else {
                rutaSel.classList.remove('input-error');
            }

            // 3. Validar que Proveedor esté seleccionado
            const provSel = document.getElementById('proveedor');
            if (!provSel || !provSel.value) {
                if (provSel) {
                    provSel.classList.add('input-error');
                    provSel.focus();
                    provSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                alert("⚠️ Por favor seleccione primero el Proveedor / Razón Social.");
                return;
            } else {
                provSel.classList.remove('input-error');
            }

            // 4. Validar que Punto / Lugar de Recolección esté seleccionado
            if (!validarPuntoObligatorio(true)) {
                return;
            }

            document.querySelectorAll('.product-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentProduct = pName;
            const selInput = document.getElementById('producto-seleccionado');
            if (selInput) selInput.value = currentProduct;
            if (kilosGroup) kilosGroup.style.display = 'block';
            if (kilosInput) {
                kilosInput.focus();
                kilosInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
        grid.appendChild(btn);
    });
}

function renderDynamicDrivers(drivers) {
    // 1. Selector en Formulario de Recolección
    const select = document.getElementById('conductor');
    if (select) {
        const currentVal = CURRENT_LOGGED_DRIVER || select.value;
        select.innerHTML = '<option value="" disabled selected>Seleccione su nombre</option>';
        drivers.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            select.appendChild(opt);
        });
        if (currentVal) {
            select.value = currentVal;
            if (CURRENT_LOGGED_DRIVER) {
                select.setAttribute('disabled', 'disabled');
                select.classList.add('driver-locked');
            }
        }
    }

    // 2. Selector en Pantalla de Login Conductor
    const loginSelect = document.getElementById('login-conductor');
    if (loginSelect) {
        const currentLoginVal = loginSelect.value;
        loginSelect.innerHTML = '<option value="" disabled selected>Seleccione su nombre...</option>';
        drivers.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            loginSelect.appendChild(opt);
        });
        if (currentLoginVal) loginSelect.value = currentLoginVal;
    }
}

function renderDynamicRoutes(routes) {
    const select = document.getElementById('ruta');
    if (!select) return;
    const currentVal = select.value || '';
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
    if (currentVal) {
        select.value = currentVal;
    }
    const activeProv = document.getElementById('proveedor')?.value || '';
    if (activeProv && activeProv !== 'OTRO' && activeProv !== 'TODOS') {
        populardropdownSucursales(activeProv);
    } else {
        resetearDropdownSucursal();
    }
    if (select.value) {
        renderizarCronogramaRuta(select.value);
    }
}

function procesarPuntosRutasDinamicos(puntosArray) {
    if (!Array.isArray(puntosArray) || puntosArray.length === 0) return;

    MATRIZ_PUNTOS_RUTAS = puntosArray.filter(item => item && item.punto && item.estado !== 'Inactivo');

    // Limpiar mapas dinámicos previos para evitar arrastrar datos obsoletos
    for (let k in PUNTO_TO_PROVEEDOR_MAP) delete PUNTO_TO_PROVEEDOR_MAP[k];
    for (let k in PUNTOS_POR_RUTA) delete PUNTOS_POR_RUTA[k];
    for (let k in PROVEEDORES_POR_RUTA) delete PROVEEDORES_POR_RUTA[k];
    for (let k in CRONOGRAMA_RUTAS) delete CRONOGRAMA_RUTAS[k];

    MATRIZ_PUNTOS_RUTAS.forEach(item => {
        const punto = (item.punto || '').trim();
        const prov = (item.proveedor || 'PROVEEDOR GENERAL').trim();
        const ruta = (item.ruta || 'Ruta General').trim();

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

    const activeRuta = document.getElementById('ruta')?.value || '';
    populardropdownProveedoresPorRuta(activeRuta);
    const activeProv = document.getElementById('proveedor')?.value || '';
    if (activeProv && activeProv !== 'OTRO' && activeProv !== 'TODOS') {
        populardropdownSucursales(activeProv);
    } else {
        resetearDropdownSucursal();
    }
}

// Sincronización directa en vivo con la hoja de Conductores de Google Sheets vía Gviz
async function sincronizarCredencialesDesdeGviz() {
    try {
        const gvizUrl = 'https://docs.google.com/spreadsheets/d/1eQSRvG7vWkIoW3AT5e6Ahi7ndWF6P4OG_Alxo2Go0lU/gviz/tq?tqx=out:csv&sheet=Conductores&t=' + Date.now();
        const res = await fetch(gvizUrl);
        if (res.ok) {
            const csvText = await res.text();
            const lines = csvText.split(/\r?\n/);
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const cols = [];
                let cur = '';
                let inQuotes = false;
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        cols.push(cur.trim());
                        cur = '';
                    } else {
                        cur += char;
                    }
                }
                cols.push(cur.trim());

                const nombre = cols[0] ? cols[0].replace(/^"|"$/g, '').trim() : '';
                const estado = (cols[1] ? cols[1].replace(/^"|"$/g, '').trim() : 'Activo').toLowerCase();
                const clave = cols[2] !== undefined ? cols[2].replace(/^"|"$/g, '').trim() : '';

                if (nombre && estado !== 'inactivo') {
                    if (nombre.toLowerCase() === 'admin' || nombre.toLowerCase() === 'administrador') {
                        if (clave) {
                            ADMIN_CLAVE_CONFIG = clave;
                            try { localStorage.setItem('proteinagro_admin_clave', clave); } catch(e) {}
                        }
                    } else if (clave) {
                        CONDUCTORES_AUTH[nombre] = clave;
                        if (nombre.trim() !== nombre) {
                            CONDUCTORES_AUTH[nombre.trim()] = clave;
                        }
                    }
                }
            }
            try {
                localStorage.setItem('proteinagro_conductores_auth', JSON.stringify(CONDUCTORES_AUTH));
            } catch(e) {}
            console.log("✅ Credenciales de conductores sincronizadas en vivo vía Google Sheets Gviz.");
        }
    } catch (err) {
        console.warn("⚠️ No se pudo sincronizar credenciales vía Google Sheets Gviz:", err);
    }
}

async function cargarCatalogosDinamicos() {
    // Eliminar cachés obsoletas para garantizar sincronicidad 100% en vivo con Google Sheets
    try {
        localStorage.removeItem('proteinagro_catalogos_cache');
        localStorage.removeItem('proteinagro_rutas_config');
    } catch(e) {}

    // Sincronizar credenciales en vivo directamente desde Google Sheets Gviz
    await sincronizarCredencialesDesdeGviz();

    // 1. Obtener catálogos en vivo desde Google Sheets (evitando caché HTTP con timestamp)
    if (navigator.onLine && GOOGLE_SHEETS_WEBHOOK_URL) {
        try {
            const cacheBusterUrl = GOOGLE_SHEETS_WEBHOOK_URL + (GOOGLE_SHEETS_WEBHOOK_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
            const res = await fetch(cacheBusterUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && data.productos && data.productos.length > 0) {
                    if (data.puntos_rutas && data.puntos_rutas.length > 0) procesarPuntosRutasDinamicos(data.puntos_rutas);
                    renderDynamicProducts(data.productos);
                    if (data.conductores && data.conductores.length > 0) {
                        renderDynamicDrivers(data.conductores);
                        try {
                            localStorage.setItem('proteinagro_conductores_cache', JSON.stringify(data.conductores));
                        } catch(e) {}
                    }
                    if (data.rutas && data.rutas.length > 0) renderDynamicRoutes(data.rutas);

                    // Sincronizar credenciales individuales de conductores desde Sheets si vienen en webhook
                    if (data.conductores_detalle && Array.isArray(data.conductores_detalle)) {
                        data.conductores_detalle.forEach(c => {
                            if (c && c.nombre) {
                                const clave = String(c.clave !== undefined && c.clave !== null ? c.clave : '').trim();
                                if (clave) {
                                    CONDUCTORES_AUTH[c.nombre.trim()] = clave;
                                    CONDUCTORES_AUTH[c.nombre] = clave;
                                }
                            }
                        });
                        try {
                            localStorage.setItem('proteinagro_conductores_auth', JSON.stringify(CONDUCTORES_AUTH));
                        } catch(e) {}
                    }
                    if (data.admin_clave) {
                        ADMIN_CLAVE_CONFIG = String(data.admin_clave).trim();
                        try {
                            localStorage.setItem('proteinagro_admin_clave', ADMIN_CLAVE_CONFIG);
                        } catch(e) {}
                    }

                    console.log("✅ Catálogos 100% dinámicos y claves individuales cargadas en vivo desde Google Sheets.");
                    return;
                }
            }
        } catch (err) {
            console.warn("⚠️ No se pudo obtener catálogos en vivo desde Sheets, se usan datos locales:", err);
        }
    }

    // 2. Fallback a valores por defecto y caché local si no hay conexión
    try {
        const cachedAuth = localStorage.getItem('proteinagro_conductores_auth');
        if (cachedAuth) {
            const parsed = JSON.parse(cachedAuth);
            if (parsed && typeof parsed === 'object') {
                CONDUCTORES_AUTH = Object.assign({}, DEFAULT_CONDUCTORES_AUTH, parsed);
            }
        }
        const cachedAdmin = localStorage.getItem('proteinagro_admin_clave');
        if (cachedAdmin) {
            ADMIN_CLAVE_CONFIG = cachedAdmin;
        }
    } catch(e) {}

    // Garantizar credenciales oficiales por defecto
    CONDUCTORES_AUTH = Object.assign({}, DEFAULT_CONDUCTORES_AUTH, CONDUCTORES_AUTH);

    renderDynamicProducts(DEFAULT_PRODUCTOS);
    renderDynamicDrivers(DEFAULT_CONDUCTORES);
    renderDynamicRoutes(DEFAULT_RUTAS);
}

btnRegistrarProducto.addEventListener('click', () => {
    // Validar Punto / Lugar de Recolección antes de registrar producto
    if (!validarPuntoObligatorio(true)) {
        return;
    }
    if (!currentProduct) {
        alert("Primero selecciona un producto.");
        return;
    }
    if (!kilosInput.value || parseFloat(kilosInput.value) <= 0) {
        alert("Ingresa la cantidad en kilos (debe ser mayor a 0).");
        kilosInput.focus();
        return;
    }
    
    // Guardar en la lista (redondeado a 2 decimales para evitar imprecisión de punto flotante)
    collectedProducts.push({
        producto: currentProduct,
        kilos: Math.round(parseFloat(kilosInput.value) * 100) / 100
    });

    // Mantener la lista de productos recolectados siempre organizada en orden alfabético
    collectedProducts.sort((a, b) => a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' }));

    renderAddedProducts();
    
    // Resetear form para el siguiente
    document.querySelectorAll('.product-btn').forEach(b => b.classList.remove('active'));
    currentProduct = null;
    kilosInput.value = '';
    if (kilosGroup) kilosGroup.style.display = 'none';
});

function renderAddedProducts() {
    if (collectedProducts.length > 0) {
        addedProductsDiv.style.display = 'block';
        productsListUl.innerHTML = '';
        collectedProducts.forEach((p, index) => {
            productsListUl.innerHTML += `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
                    <span style="font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                        <span style="font-size: 1.1rem;">${getEmojiForProduct(p.producto)}</span>
                        <span>${p.producto}</span>
                    </span>
                    <span style="display: flex; align-items: center; gap: 10px;">
                        <strong style="color: #0284c7;">${p.kilos} kg</strong>
                        <button type="button" onclick="eliminarProductoRegistrado(${index})" title="Borrar este producto" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444; border-radius: 4px; padding: 2px 8px; font-size: 0.8rem; cursor: pointer;">✕ Borrar</button>
                    </span>
                </li>
            `;
        });
    } else {
        addedProductsDiv.style.display = 'none';
    }
}

window.eliminarProductoRegistrado = function(index) {
    if (index >= 0 && index < collectedProducts.length) {
        collectedProducts.splice(index, 1);
        renderAddedProducts();
    }
};

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
document.getElementById('btn-submit')?.addEventListener('click', (e) => {
    if (!validarPuntoObligatorio(true)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
});

document.getElementById('recoleccion-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // 1. Validar Conductor
    const conductorSel = document.getElementById('conductor');
    const conductorName = conductorSel.options[conductorSel.selectedIndex]?.text || conductorSel.value;
    if (!conductorSel.value) {
        conductorSel.classList.add('input-error');
        conductorSel.focus();
        conductorSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        alert("⚠️ Por favor seleccione el Conductor.");
        return;
    }
    conductorSel.classList.remove('input-error');

    // 2. Validar Ruta
    const rutaSel = document.getElementById('ruta');
    let rutaName = rutaSel.value;
    if (!rutaSel.value) {
        rutaSel.classList.add('input-error');
        rutaSel.focus();
        rutaSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        alert("⚠️ Por favor seleccione la Ruta de Recolección.");
        return;
    }
    rutaSel.classList.remove('input-error');
    if (rutaSel.value === 'OTRA') {
        rutaName = document.getElementById('custom-ruta')?.value.trim();
        if (!rutaName) {
            document.getElementById('custom-ruta')?.classList.add('input-error');
            document.getElementById('custom-ruta')?.focus();
            alert("⚠️ Por favor escriba el nombre de la nueva ruta.");
            return;
        }
    } else if (rutaSel.selectedIndex >= 0) {
        rutaName = rutaSel.options[rutaSel.selectedIndex].text;
    }
    
    // 3. Validar Proveedor
    const proveedorSel = document.getElementById('proveedor');
    let proveedorName = proveedorSel.value;
    if (!proveedorSel.value) {
        proveedorSel.classList.add('input-error');
        proveedorSel.focus();
        proveedorSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        alert("⚠️ Por favor seleccione el Proveedor / Razón Social.");
        return;
    }
    proveedorSel.classList.remove('input-error');
    if (proveedorSel.value === 'OTRO') {
        proveedorName = document.getElementById('custom-proveedor')?.value.trim();
        if (!proveedorName) {
            document.getElementById('custom-proveedor')?.classList.add('input-error');
            document.getElementById('custom-proveedor')?.focus();
            alert("⚠️ Por favor escriba el nombre del nuevo proveedor.");
            return;
        }
    } else if (proveedorSel.selectedIndex >= 0) {
        proveedorName = proveedorSel.options[proveedorSel.selectedIndex].text;
    }

    // 4. Validar Punto / Lugar de Recolección
    if (!validarPuntoObligatorio(true)) {
        return;
    }
    const sucursalName = obtenerPuntoSeleccionado();
    
    // Auto-registrar cualquier producto que el usuario haya seleccionado y colocado kilos pero no haya hecho clic en +
    if (currentProduct && kilosInput && kilosInput.value && parseFloat(kilosInput.value) > 0) {
        collectedProducts.push({
            producto: currentProduct,
            kilos: Math.round(parseFloat(kilosInput.value) * 100) / 100
        });
        currentProduct = null;
        kilosInput.value = '';
        if (kilosGroup) kilosGroup.style.display = 'none';
        document.querySelectorAll('.product-btn').forEach(b => b.classList.remove('active'));
        renderAddedProducts();
    }
    
    // Validar que exista al menos un producto registrado
    if (collectedProducts.length === 0) {
        alert("Debe registrar al menos un producto con su cantidad en kilos.");
        return;
    }

    // Calcular totales redondeando a 2 decimales para evitar problemas de precisión en coma flotante (IEEE 754)
    let totalKilos = 0;
    collectedProducts.forEach(p => totalKilos += (Number(p.kilos) || 0));
    totalKilos = Math.round(totalKilos * 100) / 100;

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
    const recordId = 'REC-' + Date.now();
    const tsNow = Date.now();

    const data = {
        id: recordId,
        timestamp: tsNow,
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

        // Limpiar form conservando el nombre del conductor fijado y bloqueado
        const conductorEl = document.getElementById('conductor');
        const conductorActual = CURRENT_LOGGED_DRIVER || (conductorEl ? conductorEl.value : '');
        document.getElementById('recoleccion-form').reset();
        if (conductorEl && conductorActual) {
            conductorEl.value = conductorActual;
            conductorEl.setAttribute('disabled', 'disabled');
            conductorEl.classList.add('driver-locked');
        }
        
        // Resetear selectores dinámicos
        if (document.getElementById('custom-ruta-group')) document.getElementById('custom-ruta-group').style.display = 'none';
        if (document.getElementById('custom-proveedor-group')) document.getElementById('custom-proveedor-group').style.display = 'none';
        if (document.getElementById('custom-sucursal-group')) document.getElementById('custom-sucursal-group').style.display = 'none';
        if (document.getElementById('custom-sucursal')) document.getElementById('custom-sucursal').required = false;
        
        collectedProducts = [];
        renderAddedProducts();
        if (kilosGroup) kilosGroup.style.display = 'none';
        document.querySelectorAll('.product-btn').forEach(b => b.classList.remove('active'));
        if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        resetearDropdownSucursal("Primero seleccione un proveedor");

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
        kilosPorProveedor[prov] = Math.round(((kilosPorProveedor[prov] || 0) + (Number(r.totalKilos) || 0)) * 100) / 100;

        // Agrupar por producto
        if (r.productos && Array.isArray(r.productos)) {
            r.productos.forEach(p => {
                const prodName = p.producto || p.nombre || 'Otros';
                kilosPorProducto[prodName] = Math.round(((kilosPorProducto[prodName] || 0) + (Number(p.kilos) || 0)) * 100) / 100;
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

// ==============================================================================
// GESTIÓN DE FECHAS Y DATOS ADMINISTRATIVOS
// ==============================================================================
let adminRecordsCache = [];

function parseFechaRecoleccion(fechaStr) {
    if (!fechaStr) return new Date(0);
    if (fechaStr instanceof Date) return fechaStr;
    if (typeof fechaStr.toDate === 'function') return fechaStr.toDate();
    if (typeof fechaStr === 'number') return new Date(fechaStr);
    
    const str = String(fechaStr).trim();
    // Prioridad 1: Formato latino DD/MM/YYYY HH:MM:SS
    const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (match) {
        const dia = parseInt(match[1], 10);
        const mes = parseInt(match[2], 10) - 1;
        const anio = parseInt(match[3], 10);
        const hora = match[4] ? parseInt(match[4], 10) : 0;
        const min = match[5] ? parseInt(match[5], 10) : 0;
        const seg = match[6] ? parseInt(match[6], 10) : 0;
        return new Date(anio, mes, dia, hora, min, seg);
    }
    
    // Prioridad 2: Formato ISO YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (isoMatch) {
        const anio = parseInt(isoMatch[1], 10);
        const mes = parseInt(isoMatch[2], 10) - 1;
        const dia = parseInt(isoMatch[3], 10);
        return new Date(anio, mes, dia);
    }
    
    const fallback = new Date(str);
    return isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

function formatFechaParaMostrar(fechaVal) {
    if (!fechaVal) return '-';
    const d = parseFechaRecoleccion(fechaVal);
    if (isNaN(d.getTime()) || d.getTime() === 0) return String(fechaVal);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dia}/${mes}/${anio} ${hh}:${mm}:${ss}`;
}

function coincideFechaRecoleccion(fechaRegistro, fechaBuscadaIso) {
    if (!fechaRegistro || !fechaBuscadaIso) return false;
    const [bYear, bMonth, bDay] = fechaBuscadaIso.split('-').map(Number);
    const d = parseFechaRecoleccion(fechaRegistro);
    if (isNaN(d.getTime()) || d.getTime() === 0) return false;
    return d.getFullYear() === bYear && (d.getMonth() + 1) === bMonth && d.getDate() === bDay;
}

function loadAdminData() {
    const tbody = document.getElementById('admin-table-body');
    if (!tbody) return;
    
    db.collection('recolecciones').orderBy('timestamp', 'desc').limit(200)
      .onSnapshot((querySnapshot) => {
          tbody.innerHTML = '';
          const records = [];
          
          querySnapshot.forEach((doc) => {
              const data = doc.data();
              data._docId = doc.id;
              records.push(data);
          });
          
          // Ordenar cronológicamente descendente asegurando que registros de hoy siempre estén arriba
          records.sort((a, b) => {
              const tA = (a.timestamp && typeof a.timestamp === 'number') ? a.timestamp : parseFechaRecoleccion(a.fecha).getTime();
              const tB = (b.timestamp && typeof b.timestamp === 'number') ? b.timestamp : parseFechaRecoleccion(b.fecha).getTime();
              return tB - tA;
          });
          
          adminRecordsCache = records;
          
          if (records.length === 0) {
              // Si Firebase está vacío, intentar cargar respaldo local
              let savedBackup = JSON.parse(localStorage.getItem('recolecciones_backup') || '[]');
              if (savedBackup.length > 0) {
                  savedBackup.sort((a, b) => {
                      const tA = (a.timestamp && typeof a.timestamp === 'number') ? a.timestamp : parseFechaRecoleccion(a.fecha).getTime();
                      const tB = (b.timestamp && typeof b.timestamp === 'number') ? b.timestamp : parseFechaRecoleccion(b.fecha).getTime();
                      return tB - tA;
                  });
                  renderRecordsInTable(savedBackup, tbody);
                  renderCharts(savedBackup);
                  return;
              }
              tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px;">No hay recolecciones guardadas aún. Haz una prueba desde el formulario.</td></tr>';
          } else {
              renderRecordsInTable(records, tbody);
              renderCharts(records);
          }
      }, (error) => {
          console.error("Error cargando recolecciones: ", error);
          let savedBackup = JSON.parse(localStorage.getItem('recolecciones_backup') || '[]');
          if (savedBackup.length > 0) {
              savedBackup.sort((a, b) => {
                  const tA = (a.timestamp && typeof a.timestamp === 'number') ? a.timestamp : parseFechaRecoleccion(a.fecha).getTime();
                  const tB = (b.timestamp && typeof b.timestamp === 'number') ? b.timestamp : parseFechaRecoleccion(b.fecha).getTime();
                  return tB - tA;
              });
              renderRecordsInTable(savedBackup, tbody);
              renderCharts(savedBackup);
          } else {
              tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px; color: red;">Error de permisos o conexión en Firebase. Revisa las reglas de Firestore en Firebase Console.</td></tr>';
          }
      });
}

function renderRecordsInTable(records, tbody) {
    if (!tbody) return;
    tbody.innerHTML = '';
    adminRecordsCache = records;
    records.forEach(data => {
        const fechaTexto = formatFechaParaMostrar(data.fecha || data.timestamp);
        const badgeClass = data.estado === 'Sincronizado' ? 'badge-online' : 'badge-offline';
        const ruta = data.ruta ? data.ruta.replace('_', ' ') : 'N/A';
        const obsText = data.observaciones ? data.observaciones : '-';

        const provDisplay = data.proveedor || 'N/A';
        const sucDisplay = data.punto || data.sucursal || 'General';
        const cleanTotalKg = Math.round((Number(data.totalKilos) || 0) * 100) / 100;
        const recordLocalId = data.id || '';
        const docId = data._docId || '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500; white-space: nowrap;">${fechaTexto}</td>
            <td style="text-transform: capitalize;">${data.conductor || '-'}</td>
            <td style="text-transform: capitalize;">${ruta}</td>
            <td style="text-transform: capitalize;">${provDisplay}</td>
            <td style="font-size: 0.85rem; color: #0284c7; font-weight: 500;">${sucDisplay}</td>
            <td style="font-weight: bold;">${cleanTotalKg} kg</td>
            <td style="max-width: 200px; font-size: 0.85rem; color: #475569;">${obsText}</td>
            <td><span class="badge ${badgeClass}">${data.estado || 'Sincronizado'}</span></td>
            <td><img src="${data.firma || ''}" style="height: 30px; border: 1px solid #ccc; background: white;" alt="firma"></td>
            <td style="white-space: nowrap;">
                <button onclick="verSoporteDesdeTabla('${docId}', '${recordLocalId}')" style="background: #0284c7; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px;">
                    📄 Soporte
                </button>
                <button onclick="eliminarRecoleccion('${docId}', '${recordLocalId}')" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px;">
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

// === EXPORTAR A EXCEL / CSV ===
document.getElementById('btn-export')?.addEventListener('click', async () => {
    try {
        const snapshot = await db.collection('recolecciones').orderBy('timestamp', 'desc').get();
        if (snapshot.empty) {
            alert('No hay recolecciones para exportar.');
            return;
        }

        let csvContent = "\uFEFF"; // UTF-8 BOM para abrir correctamente en Excel
        csvContent += "ID,Fecha,Conductor,Ruta,Proveedor,Sucursal/Punto,Productos,Total Kilos,Observaciones,Estado\n";

        snapshot.forEach(doc => {
            const data = doc.data();
            const fechaFormatted = `"${formatFechaParaMostrar(data.fecha || data.timestamp)}"`;
            const conductor = `"${data.conductor || ''}"`;
            const ruta = `"${(data.ruta || '').replace('_', ' ')}"`;
            const proveedor = `"${(data.proveedor || '').replace('_', ' ')}"`;
            const sucursal = `"${(data.punto || data.sucursal || 'General')}"`;
            
            let productosStr = '';
            if (data.productos && Array.isArray(data.productos)) {
                productosStr = data.productos.map(p => {
                    const nom = p.producto || p.nombre || '';
                    const kg = p.kilos ? ` (${p.kilos} kg)` : '';
                    return nom + kg;
                }).join(', ');
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


// === ENVIAR A GOOGLE SHEETS (Envío Único en Segundo Plano) ===
async function enviarAGoogleSheets(data) {
    if (!GOOGLE_SHEETS_WEBHOOK_URL) return;

    // Crear objeto ligero sin firma base64 pesada para el envío a Sheets
    const dataLight = { ...data };
    if (dataLight.firma && dataLight.firma.length > 300) {
        dataLight.firma = "Firma Registrada";
    }

    try {
        const payloadParam = encodeURIComponent(JSON.stringify(dataLight));
        const getUrl = GOOGLE_SHEETS_WEBHOOK_URL + '?action=saveRecoleccion&payload=' + payloadParam;
        await fetch(getUrl, { method: 'GET', mode: 'no-cors' });
        console.log("✅ Datos de recolección enviados a Google Sheets correctamente.");
    } catch (e) {
        console.warn("⚠️ Error enviando a Google Sheets:", e);
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
    "RUTA 2: Cali (Norte / Centro / Sur / Oriente)": [
        "SUPERTIENDA CAÑAVERAL",
        "COMERCIALIZADORA R Y E",
        "CUENTA SEVILLANA",
        "MIGAN CAPITAL"
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
        "BELALCAZAR",
        "MATADERO"
    ],
    "RUTA 5: Palmira / Villagorgona / Carmelo": [
        "SUPERTIENDA CAÑAVERAL",
        "CUENTA SEVILLANA",
        "JHOANATAN MARTINEZ",
        "MIGAN CAPITAL"
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

    // Solo poblar selector si no fue poblado dinámicamente
    if (rutaSelect.options.length <= 1) {
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
    }

    if (rutaSelect.dataset.listenersAttached) return;
    rutaSelect.dataset.listenersAttached = 'true';

    // Inicializar proveedores y puntos por defecto activados desde el inicio
    const initialRuta = rutaSelect.value || '';
    populardropdownProveedoresPorRuta(initialRuta);
    resetearDropdownSucursal("Primero seleccione un proveedor");

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
        if (document.getElementById('custom-sucursal')) document.getElementById('custom-sucursal').required = false;

        // Poblar proveedores correspondientes a la ruta seleccionada
        populardropdownProveedoresPorRuta(selectedRuta);

        // Resetear el selector de sucursal para que espere al proveedor
        resetearDropdownSucursal("Primero seleccione un proveedor");

        if (selectedRuta === 'OTRA') {
            customRutaGroup.style.display = 'block';
            document.getElementById('custom-ruta').required = true;
        }
        renderizarCronogramaRuta(selectedRuta);
    });

    // Event listener al cambiar Punto / Sucursal (AUTOCOMPLETA EL PROVEEDOR)
    sucursalSelect.addEventListener('change', () => {
        sucursalSelect.classList.remove('input-error');
        const errorMsg = document.getElementById('sucursal-error');
        if (errorMsg) errorMsg.style.display = 'none';

        const selectedPunto = sucursalSelect.value;
        const customSucInput = document.getElementById('custom-sucursal');
        if (customSucursalGroup) customSucursalGroup.style.display = 'none';
        if (customSucInput) {
            customSucInput.required = false;
            customSucInput.classList.remove('input-error');
        }

        if (selectedPunto === 'OTRA_SUCURSAL') {
            if (customSucursalGroup) customSucursalGroup.style.display = 'block';
            if (customSucInput) {
                customSucInput.required = true;
                customSucInput.focus();
            }
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
            if (!found && targetProv) {
                const opt = document.createElement('option');
                opt.value = targetProv;
                opt.textContent = targetProv;
                proveedorSelect.appendChild(opt);
                proveedorSelect.value = targetProv;
                found = true;
            }
            if (found && autofillBadge) {
                autofillBadge.style.display = 'inline-block';
            }
        }
    });

    document.getElementById('custom-sucursal')?.addEventListener('input', () => {
        document.getElementById('custom-sucursal')?.classList.remove('input-error');
        const customErrorMsg = document.getElementById('custom-sucursal-error');
        if (customErrorMsg) customErrorMsg.style.display = 'none';
    });

    // Event listener al cambiar Proveedor manualmente
    proveedorSelect.addEventListener('change', () => {
        const selectedProv = proveedorSelect.value;
        if (autofillBadge) autofillBadge.style.display = 'none';

        if (selectedProv === 'TODOS') {
            const currentRuta = rutaSelect.value || '';
            populardropdownProveedoresPorRuta(currentRuta, true);
            resetearDropdownSucursal("Seleccione un proveedor de la lista");
            return;
        }

        if (selectedProv === 'OTRO') {
            customProveedorGroup.style.display = 'block';
            document.getElementById('custom-proveedor').required = true;
            sucursalSelect.disabled = false;
            sucursalSelect.innerHTML = '<option value="OTRA_SUCURSAL" selected>➕ Otro Punto / Sucursal...</option>';
            if (customSucursalGroup) customSucursalGroup.style.display = 'block';
            const customSucInput = document.getElementById('custom-sucursal');
            if (customSucInput) {
                customSucInput.required = true;
                customSucInput.focus();
            }
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

// Matriz consolidada de Puntos_Rutas pre-cargada con los 122 puntos oficiales de Google Sheets (0ms de latencia, 100% offline-ready)
const CATALOGO_PUNTOS_RUTAS_DEFAULT = [{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"Santa Elena","punto":"BODEGA SANTA ELENA","direccion":"Santa Elena","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"Santa Elena","punto":"GARAY SANTA ELENA","direccion":"Santa Elena","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"CAVASA","punto":"BARBARA GOMEZ","direccion":"BARBARA GOMEZ","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"CAVASA","punto":"DIEGO BUITRAGO","direccion":"DIEGO BUITRAGO","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"CAVASA","punto":"CARIBE","direccion":"CARIBE","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"CAVASA","punto":"SEVILLANA","direccion":"SEVILLANA","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"CAVASA","punto":"MIGAN CAPITAL","direccion":"MIGAN CAPITAL","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"CAVASA","punto":"FREDDY HERNANDEZ","direccion":"FREDDY HERNANDEZ","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"CAVASA","punto":"EDINSON AGUIRRE","direccion":"EDINSON AGUIRRE","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"CAVASA","punto":"LA RESERVA","direccion":"LA RESERVA","telefono":"","horario":"","frecuencia":"Lunes a Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"Santa Elena","punto":"SEVILLANA SANTA ELENA","direccion":"Santa Elena","telefono":"","horario":"","frecuencia":"Lunes / Miércoles / Viernes","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"Santa Elena","punto":"CIUDAD DEL CAMPO GRANAHORRAR","direccion":"Ciudad del Campo","telefono":"","horario":"","frecuencia":"Lunes / Miércoles / Viernes","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"Santa Elena","punto":"CIUDAD DEL CAMPO PUNTO ROJO","direccion":"Ciudad del Campo","telefono":"","horario":"","frecuencia":"Lunes / Miércoles / Viernes","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"Santa Elena","punto":"CIUDAD DEL CAMPO SURTIMERCAR","direccion":"Ciudad del Campo","telefono":"","horario":"","frecuencia":"Lunes / Miércoles / Viernes","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"Santa Elena","punto":"ORLANDO MARTINEZ","direccion":"Carniceria la paz","telefono":"","horario":"","frecuencia":"Miércoles / Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"Santa Elena","punto":"LA ESPERANZA","direccion":"La Esperanza","telefono":"","horario":"","frecuencia":"Sábado","estado":"Activo"},{"ruta":"RUTA 1: Santa Elena / Cavasa","proveedor":"Santa Elena","punto":"DISTRIBUIDORA DE CARNES MILLAN","direccion":"DISTRIBUIDORA DE CARNES MILLAN","telefono":"","horario":"","frecuencia":"Miercoles/sabado","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Punto 14","direccion":"Cra. 5 #14-37","telefono":"3244935167","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Centenario","direccion":"Av. 4 Norte #46-64","telefono":"3102022829","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"MIGAN CAPITAL","punto":"La Montaña Av. 6A","direccion":"Av. 6A N #30N-47","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Prados del Norte","direccion":"Av.2B Norte #34N-19","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"carnes maiale","punto":"Carnes Maiale","direccion":"Cra.1G #69-02 Esquina","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"Districarnes LG","punto":"Districarnes LG","direccion":"Cra.4C #65B-18","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Álamos","direccion":"Calle75C N #2 Bis-100","telefono":"3243192838","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Los Pinos","direccion":"Calle70 #7M Bis-64","telefono":"3243192839","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral La Primera","direccion":"Cra.1A #44-50","telefono":"3184277811","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"MIGAN CAPITAL","punto":"La Montaña Torres","direccion":"Cra.1 #56-20","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"Super Carnes Los Andes","punto":"Super Carnes Los Andes","direccion":"Cra.1D #52-05","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"La Cosecha de Mi Tierra","punto":"La Cosecha de Mi Tierra","direccion":"Cra.15 Calle54 Esquina","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"COMERCIALIZADORA R Y E","punto":"Carnes RYE","direccion":"Cra.17F #33A-45","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"Baratón Carnes Berlín","punto":"Baratón Carnes Berlín","direccion":"Calle44 #19-65","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"El Rebajón","punto":"El Rebajón","direccion":"Calle 44","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"MIGAN CAPITAL","punto":"La Montaña Calima","direccion":"","telefono":"","horario":"","frecuencia":"Viernes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Ingenio","direccion":"Ingenio","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Limonar","direccion":"Limonar","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Pasoancho","direccion":"Pasoancho","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SEVILLANA","punto":"Sevillana Pasoancho","direccion":"Pasoancho","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"MIGAN CAPITAL","punto":"La Montaña Pasoancho","direccion":"Calle 14C #25-16","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SEVILLANA","punto":"Sevillana Lourdes","direccion":"Transv. 29D #29-50","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"MIGAN CAPITAL","punto":"La Montaña Guadalupe","direccion":"Guadalupe","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"MIGAN CAPITAL","punto":"La Montaña Cosmocentro","direccion":"Cosmocentro","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"MIGAN CAPITAL","punto":"La Montaña Cristales","direccion":"Cristales","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Villanueva","direccion":"Calle 13 #75A-185","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Cootraemcali","direccion":"Cra.70 #13B-18","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"Mercaunión","punto":"Mercaunión","direccion":"Calle 25 #85B-100","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"Sevillana República de Israel","punto":"Sevillana República de Israel","direccion":"","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"Jaime Zuluaga","punto":"Jaime Zuluaga","direccion":"","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"Milton Muñoz","punto":"Milton Muñoz","direccion":"","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"MIGAN CAPITAL","punto":"La Montaña Decepaz","direccion":"","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"Ciudadela del Río","punto":"Ciudadela del Río","direccion":"","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"MIGAN CAPITAL","punto":"La Montaña Morichal","direccion":"","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 2: Cali (Norte / Centro / Sur / Oriente)","proveedor":"CARNICOS LA FAMA","punto":"CARNICOS LA FAMA","direccion":"juanchito","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Puerto Tejada Centro","direccion":"Cra.19 #17-45","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Puerto Tejada Punto 2","direccion":"Cl. 16 #20-60","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Villa Rica Caribe","direccion":"Cra. 3 #2-60","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Jamundí Terranova","direccion":"Cra. 51 Sur #16C-04","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Jamundí Farallones","direccion":"Cl. 12 Sur #10A-77","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Jamundí Surtimayorista","direccion":"Cra. 10 #11-66","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Jamundí Rosario","direccion":"Cra. 11 #3-93","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Jamundí Principal","direccion":"Cra. 7 #10-48","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Jamundí Centro","direccion":"Cl. 11 #9-58","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"CARIBE","punto":"Jamundí Panamericana","direccion":"Cra. 3D #11-145","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral pance","direccion":"","telefono":"","horario":"","frecuencia":"jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"SUPERTIENDA CAÑAVERAL- FRIGORIVALLE","punto":"cañaveral matadero","direccion":"","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"FRIGORIVALLE","punto":"frigorivalle matadero","direccion":"","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"JHONATAN MARTINEZ","punto":"frigorifico buga","direccion":"","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"YIMI SANCLEMENTE","punto":"frigorifico buga","direccion":"","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Tuluá","direccion":"tulua","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Buga albergue","direccion":"albergue","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Buga merino","direccion":"merino","telefono":"","horario":"","frecuencia":"miércoles","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"cañaveral zarzal","direccion":"zarzal","telefono":"","horario":"","frecuencia":"jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Roldanillo","direccion":"Roldanillo","telefono":"","horario":"","frecuencia":"Martes","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"SEVILLANA","punto":"Sevillana Guacarí","direccion":"Guacarí","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"CARIBE","punto":"Caribe Buga","direccion":"Buga","telefono":"","horario":"","frecuencia":"Miércoles","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"ALBERTO MILLAN","punto":"Alberto Millán","direccion":"Buga","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"ALBERTO MILLAN","punto":"Alberto Millán","direccion":"cerrito","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"HERNANDO HIDALGO","punto":"HERNANDO HIDALGO","direccion":"Buga","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"BELALCAZAR","punto":"B1-PRINCIPAL (Carrera 5 # 5-48)","direccion":"CARRERA 5 # 5-48","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"BELALCAZAR","punto":"B2- GALERIA (Calle 9 # 2-26)","direccion":"CALLE 9 # 2-26","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"BELALCAZAR","punto":"B3- PLANTA BELOMO (Carrera 4 # 14-66)","direccion":"CARRERA 4 # 14-66","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"BELALCAZAR","punto":"B5- GUACANDA (Transversal 6 # 13-194)","direccion":"TRANSVERSAL 6 # 13-194","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"BELALCAZAR","punto":"B6- ROZO (Calle 10 N # 14 A 211 Rozo- Palmira)","direccion":"CALLE 10 N # 14 A 211 ROZO- PALMIRA","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"BELALCAZAR","punto":"B8- BOLIVAR (Carrera 3 # 13-44)","direccion":"CARRERA 3 # 13-44","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"BELALCAZAR","punto":"B9- URIBE (Carrera 12 # 11-03)","direccion":"CARRERA 12 # 11-03","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","proveedor":"BELALCAZAR","punto":"B11- GUABINAS (Calle 8 #19 B 55)","direccion":"CALLE 8 #19 B 55","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"MERCAMIO","punto":"Mercamio Palmira","direccion":"Palmira","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Palmitex (Palmira)","direccion":"Palmira","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Palmicentro (Palmira)","direccion":"Palmira","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"SEVILLANA","punto":"Sevillana Palmira / Villagorgona","direccion":"Palmira / Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"MIGAN CAPITAL","punto":"La Montaña Palmira","direccion":"Palmira","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Villagorgona 1","direccion":"Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"SUPERTIENDA CAÑAVERAL","punto":"Cañaveral Villagorgona 2","direccion":"Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"Nutrialimentos Valdez (Villagorgona)","punto":"Nutrialimentos Valdez (Villagorgona)","direccion":"Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"Yénifer Díaz (Villagorgona)","punto":"Yénifer Díaz (Villagorgona)","direccion":"Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"Jorge Adrián Rodas (Villagorgona)","punto":"Jorge Adrián Rodas (Villagorgona)","direccion":"Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"RICARDO GIL","punto":"RICARDO GIL","direccion":"Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"CENTRAL HENRY MARTINEZ","punto":"CENTRAL HENRY MARTINEZ","direccion":"Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"CARLOS REBOLLEDO","punto":"CARLOS REBOLLEDO","direccion":"Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"ORLANDO GIRALDO","punto":"ORLANDO GIRALDO","direccion":"Villagorgona","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"RUTA 5: Palmira / Villagorgona / Carmelo","proveedor":"Carnicería Fabián López (Águila Roja)","punto":"Carnicería Fabián López (Águila Roja)","direccion":"Águila Roja","telefono":"","horario":"","frecuencia":"Jueves","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"HEBER GAMBOA","punto":"HEBER GAMBOA","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"MILSON GONSALEZ","punto":"MILSON GONSALEZ","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"MIRIAM CUARAN","punto":"MIRIAM CUARAN","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"CARLOS CAICEDO","punto":"CARLOS CAICEDO","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"FREDDY FERNANDEZ","punto":"FREDDY FERNANDEZ","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"CARLOS MARTINEZ","punto":"CARLOS MARTINEZ","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"CRHISTIAN CEDEÑO","punto":"CRHISTIAN CEDEÑO","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"GILDARDO TEJADA","punto":"GILDARDO TEJADA","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"MIGUEL ANGEL OTERO","punto":"MIGUEL ANGEL OTERO","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"MARIA ELSI ALEGRIA","punto":"MARIA ELSI ALEGRIA","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"WILMER BUSTAMANTE","punto":"WILMER BUSTAMANTE","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"JAIRO MOSQUERA","punto":"JAIRO MOSQUERA","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"MARTIN PEREZ","punto":"MARTIN PEREZ","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"OSCAR LARA","punto":"OSCAR LARA","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"JULIAN LUNA","punto":"JULIAN LUNA","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"DIEGO BUITRAGO","punto":"DIEGO BUITRAGO","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"FREDDY HERNANDEZ","punto":"FREDDY HERNANDEZ","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"BARBARA GOMEZ","punto":"BARBARA GOMEZ","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"HERNANDO HIDALGO","punto":"HERNANDO HIDALGO","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"GRAXPRO","punto":"GRAXPRO","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"AUGUSTO MUÑOZ","punto":"AUGUSTO MUÑOZ","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"},{"ruta":"PLANTA SAN JOAQUIN","proveedor":"FABIAN LOPEZ","punto":"FABIAN LOPEZ","direccion":"PLANTA SAN JOAUIN","telefono":"","horario":"","frecuencia":"Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","estado":"Activo"}];
let MATRIZ_PUNTOS_RUTAS = CATALOGO_PUNTOS_RUTAS_DEFAULT.slice();

// Mapa Punto → Proveedor (se llena dinámicamente desde Google Sheets via procesarPuntosRutasDinamicos)
const PUNTO_TO_PROVEEDOR_MAP = {};

// Puntos por Ruta (se llena dinámicamente desde Google Sheets via procesarPuntosRutasDinamicos)
const PUNTOS_POR_RUTA = {};

// Proveedores por Ruta (se llena dinámicamente desde Google Sheets via procesarPuntosRutasDinamicos)
const PROVEEDORES_POR_RUTA = {};

function resetearDropdownSucursal(mensaje = "Primero seleccione un proveedor") {
    const sucursalSelect = document.getElementById('sucursal');
    if (!sucursalSelect) return;
    sucursalSelect.disabled = true;
    sucursalSelect.innerHTML = `<option value="" disabled selected>${mensaje}</option>`;
    sucursalSelect.classList.remove('input-error');
    const errorMsg = document.getElementById('sucursal-error');
    if (errorMsg) errorMsg.style.display = 'none';
}

function getPuntosParaProveedor(rutaSeleccionada, proveedorSeleccionado) {
    if (!proveedorSeleccionado || proveedorSeleccionado === 'TODOS' || proveedorSeleccionado === 'OTRO') {
        return [];
    }

    const cleanStr = str => (str || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const normRuta = cleanStr(rutaSeleccionada);
    const normProv = cleanStr(proveedorSeleccionado);
    const matchNum = rutaSeleccionada ? rutaSeleccionada.match(/RUTA\s*(\d+)/i) : null;
    const rutaNum = matchNum ? matchNum[1] : null;

    const puntosEncontrados = [];

    const rutaCoincide = (itRutaStr) => {
        if (!normRuta || normRuta === 'otra') return true;
        const itRuta = cleanStr(itRutaStr);
        if (itRuta === normRuta || normRuta.includes(itRuta) || itRuta.includes(normRuta)) return true;
        if (rutaNum) {
            const itNumMatch = (itRutaStr || '').match(/RUTA\s*(\d+)/i);
            if (itNumMatch && itNumMatch[1] === rutaNum) return true;
        }
        return false;
    };

    // 1. Buscar en la matriz consolidada de Google Sheets
    if (Array.isArray(MATRIZ_PUNTOS_RUTAS) && MATRIZ_PUNTOS_RUTAS.length > 0) {
        // Pase 1: Coincidencia EXACTA del nombre del proveedor en la ruta seleccionada
        for (const it of MATRIZ_PUNTOS_RUTAS) {
            if (it.estado === 'Inactivo') continue;
            const itProv = cleanStr(it.proveedor);
            const itPunto = (it.punto || '').trim();
            if (!itPunto) continue;

            if (rutaCoincide(it.ruta) && itProv === normProv) {
                if (!puntosEncontrados.includes(itPunto)) puntosEncontrados.push(itPunto);
            }
        }

        // Pase 2: Coincidencia flexible (substring) si no hubo exacta en la ruta
        if (puntosEncontrados.length === 0) {
            for (const it of MATRIZ_PUNTOS_RUTAS) {
                if (it.estado === 'Inactivo') continue;
                const itProv = cleanStr(it.proveedor);
                const itPunto = (it.punto || '').trim();
                if (!itPunto) continue;

                if (rutaCoincide(it.ruta) && (itProv.includes(normProv) || normProv.includes(itProv))) {
                    if (!puntosEncontrados.includes(itPunto)) puntosEncontrados.push(itPunto);
                }
            }
        }

        // Pase 3: Fallback si el proveedor está registrado en la matriz pero en otra ruta
        if (puntosEncontrados.length === 0) {
            for (const it of MATRIZ_PUNTOS_RUTAS) {
                if (it.estado === 'Inactivo') continue;
                const itProv = cleanStr(it.proveedor);
                const itPunto = (it.punto || '').trim();
                if (!itPunto) continue;

                if (itProv === normProv || itProv.includes(normProv) || normProv.includes(itProv)) {
                    if (!puntosEncontrados.includes(itPunto)) puntosEncontrados.push(itPunto);
                }
            }
        }

        if (puntosEncontrados.length > 0) {
            return puntosEncontrados.sort((a, b) => a.localeCompare(b));
        }
    }

    // 2. Fallback con mapas existentes (PUNTO_TO_PROVEEDOR_MAP y PUNTOS_POR_RUTA)
    const puntosBase = (rutaSeleccionada && rutaSeleccionada !== 'OTRA') ? getPuntosParaRuta(rutaSeleccionada) : Object.keys(PUNTO_TO_PROVEEDOR_MAP);
    const puntosMap = puntosBase.filter(punto => {
        const target = cleanStr(PUNTO_TO_PROVEEDOR_MAP[punto] || '');
        return target === normProv || target.includes(normProv) || normProv.includes(target);
    });

    return puntosMap.sort((a, b) => a.localeCompare(b));
}

function getPuntosParaRuta(rutaSeleccionada) {
    if (!rutaSeleccionada) return Object.keys(PUNTO_TO_PROVEEDOR_MAP);
    
    // 1. Coincidencia exacta
    if (PUNTOS_POR_RUTA[rutaSeleccionada] && PUNTOS_POR_RUTA[rutaSeleccionada].length > 0) {
        return PUNTOS_POR_RUTA[rutaSeleccionada];
    }

    const cleanStr = str => (str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const normSelected = cleanStr(rutaSeleccionada);

    // 2. Coincidencia normalizada
    for (const key in PUNTOS_POR_RUTA) {
        if (cleanStr(key) === normSelected && PUNTOS_POR_RUTA[key].length > 0) {
            return PUNTOS_POR_RUTA[key];
        }
    }

    // 3. Coincidencia flexible por número de ruta (ej: "RUTA 1", "RUTA 2", "RUTA 3", etc.)
    const matchNum = rutaSeleccionada.match(/RUTA\s*(\d+)/i);
    if (matchNum) {
        const num = matchNum[1];
        let combinados = [];
        for (const key in PUNTOS_POR_RUTA) {
            const keyNumMatch = key.match(/RUTA\s*(\d+)/i);
            if (keyNumMatch && keyNumMatch[1] === num) {
                combinados = combinados.concat(PUNTOS_POR_RUTA[key]);
            }
        }
        if (combinados.length > 0) {
            return Array.from(new Set(combinados));
        }
    }

    // 4. Coincidencia por subcadena
    for (const key in PUNTOS_POR_RUTA) {
        const normKey = cleanStr(key);
        if ((normKey.includes(normSelected) || normSelected.includes(normKey)) && PUNTOS_POR_RUTA[key].length > 0) {
            return PUNTOS_POR_RUTA[key];
        }
    }

    // 5. Fallback general: mostrar todos los puntos cargados para no bloquear al usuario
    return Object.keys(PUNTO_TO_PROVEEDOR_MAP);
}

function getTodosLosProveedores() {
    const provsSet = new Set(TODOS_LOS_PROVEEDORES);
    Object.values(PUNTO_TO_PROVEEDOR_MAP).forEach(prov => {
        if (prov && prov !== 'PROVEEDOR GENERAL') provsSet.add(prov);
    });
    for (const rt in PROVEEDORES_POR_RUTA) {
        (PROVEEDORES_POR_RUTA[rt] || []).forEach(prov => {
            if (prov && prov !== 'PROVEEDOR GENERAL') provsSet.add(prov);
        });
    }
    return Array.from(provsSet).filter(p => p && p.trim() !== '').sort((a, b) => a.localeCompare(b));
}

function getProveedoresParaRuta(rutaSeleccionada) {
    if (!rutaSeleccionada || rutaSeleccionada === 'OTRA' || rutaSeleccionada.includes('Pendiente por definir')) {
        return getTodosLosProveedores();
    }

    const cleanStr = str => (str || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const normSelected = cleanStr(rutaSeleccionada);
    const matchNum = rutaSeleccionada.match(/RUTA\s*(\d+)/i);
    const num = matchNum ? matchNum[1] : null;

    const provsSet = new Set();

    // 1. Si MATRIZ_PUNTOS_RUTAS está disponible, extraer directamente los proveedores únicos de esa ruta
    if (Array.isArray(MATRIZ_PUNTOS_RUTAS) && MATRIZ_PUNTOS_RUTAS.length > 0) {
        MATRIZ_PUNTOS_RUTAS.forEach(it => {
            if (it.estado === 'Inactivo') return;
            const itRuta = cleanStr(it.ruta);
            let coincide = (itRuta === normSelected) || normSelected.includes(itRuta) || itRuta.includes(normSelected);
            if (!coincide && num) {
                const itNumMatch = (it.ruta || '').match(/RUTA\s*(\d+)/i);
                if (itNumMatch && itNumMatch[1] === num) coincide = true;
            }
            if (coincide && it.proveedor && it.proveedor.trim() !== '' && it.proveedor !== 'PROVEEDOR GENERAL') {
                provsSet.add(it.proveedor.trim());
            }
        });
    }

    // 2. Fallback con PROVEEDORES_POR_RUTA si no se encontraron en MATRIZ
    if (provsSet.size === 0) {
        for (const key in PROVEEDORES_POR_RUTA) {
            const normKey = cleanStr(key);
            const keyNumMatch = key.match(/RUTA\s*(\d+)/i);
            const keyNum = keyNumMatch ? keyNumMatch[1] : null;

            if (normKey === normSelected || (num && keyNum === num) || normKey.includes(normSelected) || normSelected.includes(normKey)) {
                (PROVEEDORES_POR_RUTA[key] || []).forEach(pr => provsSet.add(pr));
            }
        }
    }

    const resultado = Array.from(provsSet).filter(p => p && p.trim() !== '').sort((a, b) => a.localeCompare(b));
    return resultado.length > 0 ? resultado : getTodosLosProveedores();
}

function populardropdownSucursalesPorRuta(rutaSeleccionada) {
    const provSel = document.getElementById('proveedor')?.value;
    if (provSel && provSel !== 'TODOS' && provSel !== 'OTRO') {
        populardropdownSucursales(provSel);
    } else {
        resetearDropdownSucursal("Primero seleccione un proveedor");
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
    if (!sucursalSelect) return;

    if (!proveedorSeleccionado || proveedorSeleccionado === 'TODOS') {
        resetearDropdownSucursal("Primero seleccione un proveedor");
        return;
    }

    sucursalSelect.disabled = false;
    const rutaSel = document.getElementById('ruta')?.value || '';
    const listaSucursales = getPuntosParaProveedor(rutaSel, proveedorSeleccionado);

    sucursalSelect.innerHTML = '<option value="" disabled selected>Seleccione el punto de recolección</option>';

    if (listaSucursales.length > 0) {
        listaSucursales.forEach(suc => {
            const opt = document.createElement('option');
            opt.value = suc;
            opt.textContent = suc;
            sucursalSelect.appendChild(opt);
        });

        // Si el proveedor tiene exactamente 1 punto registrado, preseleccionarlo automáticamente para ahorrar tiempo al conductor
        if (listaSucursales.length === 1) {
            sucursalSelect.value = listaSucursales[0];
            sucursalSelect.classList.remove('input-error');
            const errorMsg = document.getElementById('sucursal-error');
            if (errorMsg) errorMsg.style.display = 'none';
        }
    } else {
        const optGen = document.createElement('option');
        optGen.value = 'Sede Principal / General';
        optGen.textContent = 'Sede Principal / General';
        sucursalSelect.appendChild(optGen);
        sucursalSelect.value = 'Sede Principal / General';
    }

    const optOtra = document.createElement('option');
    optOtra.value = 'OTRA_SUCURSAL';
    optOtra.textContent = '➕ Otro Punto / Sucursal...';
    sucursalSelect.appendChild(optOtra);
}

// Cronograma de Rutas (se llena dinámicamente desde Google Sheets via procesarPuntosRutasDinamicos)
const CRONOGRAMA_RUTAS = {};

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

function populardropdownProveedoresPorRuta(rutaSeleccionada, mostrandoTodos = false) {
    const proveedorSelect = document.getElementById('proveedor');
    if (!proveedorSelect) return;

    proveedorSelect.disabled = false;
    proveedorSelect.innerHTML = '<option value="" disabled selected>Seleccione el proveedor</option>';

    const listaProveedores = mostrandoTodos ? getTodosLosProveedores() : getProveedoresParaRuta(rutaSeleccionada);

    listaProveedores.forEach(prov => {
        const opt = document.createElement('option');
        opt.value = prov;
        opt.textContent = prov;
        proveedorSelect.appendChild(opt);
    });

    if (!mostrandoTodos && rutaSeleccionada && rutaSeleccionada !== 'OTRA') {
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

// Alias de compatibilidad
function populardropdownProveedores(proveedoresList, mostrandoTodos) {
    const rutaActual = document.getElementById('ruta')?.value || '';
    populardropdownProveedoresPorRuta(rutaActual, mostrandoTodos);
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
    const parsedDate = parseFechaRecoleccion(data.fecha || data.timestamp);
    const d = (isNaN(parsedDate.getTime()) || parsedDate.getTime() === 0) ? new Date() : parsedDate;
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const receiptDateStr = `${dia}/${mes}/${anio}`;
    const receiptTimeStr = `${hh}:${mm}:${ss}`;

    document.getElementById('receipt-number').textContent = `N° ${data.id || (data._docId ? data._docId : 'REC-' + Date.now())}`;
    document.getElementById('receipt-date').textContent = receiptDateStr;
    document.getElementById('receipt-time').textContent = receiptTimeStr;
    document.getElementById('receipt-driver').textContent = data.conductor || '-';
    document.getElementById('receipt-route').textContent = data.ruta || '-';
    document.getElementById('receipt-provider').textContent = data.proveedor || '-';
    document.getElementById('receipt-branch').textContent = data.punto || data.sucursal || 'General';

    // Rellenar tabla de items ordenada alfabéticamente
    const tbody = document.getElementById('receipt-items-body');
    tbody.innerHTML = '';
    if (data.productos && Array.isArray(data.productos)) {
        const prodsSorted = data.productos.slice().sort((a, b) => (a.producto || '').localeCompare(b.producto || '', 'es', { sensitivity: 'base' }));
        prodsSorted.forEach(p => {
            const cleanKg = Math.round((Number(p.kilos) || 0) * 100) / 100;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-weight: 500; color: #1e293b;">${getEmojiForProduct(p.producto)} ${p.producto}</td>
                <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #0284c7;">${cleanKg} KG</td>
            `;
            tbody.appendChild(tr);
        });
    }

    const cleanReceiptTotal = Math.round((Number(data.totalKilos) || 0) * 100) / 100;
    document.getElementById('receipt-total-kilos').textContent = `${cleanReceiptTotal} KG`;

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
    let fechaMsg = d.fecha;
    if (!fechaMsg) {
        const dateObj = new Date();
        fechaMsg = `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}`;
    }

    let prodsTxt = '';
    if (d.productos && Array.isArray(d.productos)) {
        const prodsSorted = d.productos.slice().sort((a, b) => (a.producto || '').localeCompare(b.producto || '', 'es', { sensitivity: 'base' }));
        prodsTxt = prodsSorted.map(p => {
            const k = Math.round((Number(p.kilos) || 0) * 100) / 100;
            return `  • ${getEmojiForProduct(p.producto)} ${p.producto}: *${k} KG*`;
        }).join('\n');
    }

    const cleanTotalKg = Math.round((Number(d.totalKilos) || 0) * 100) / 100;

    const msg = `🌿 *PROTEINAGRO - COMPROBANTE DE RECOLECCIÓN*\n` +
        `-----------------------------------------\n` +
        `📄 *N° Recibo:* ${d.id || d._docId || 'N/A'}\n` +
        `📅 *Fecha:* ${fechaMsg}\n` +
        `🚛 *Conductor:* ${d.conductor}\n` +
        `🗺️ *Ruta:* ${d.ruta}\n` +
        `🏬 *Proveedor:* ${d.proveedor}\n` +
        `📍 *Sucursal/Punto:* ${d.punto || d.sucursal || 'General'}\n` +
        `-----------------------------------------\n` +
        `📦 *PRODUCTOS RECOLECTADOS:*\n${prodsTxt}\n` +
        `-----------------------------------------\n` +
        `⚖️ *TOTAL RECOLECTADO: ${cleanTotalKg} KG*\n` +
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

// Función global para forzar recarga y limpiar cachés en cualquier celular o PC
window.forzarActualizacionApp = async function() {
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
        try {
            localStorage.removeItem('proteinagro_catalogos_cache');
            localStorage.removeItem('proteinagro_rutas_config');
        } catch(e) {}
    } catch (err) {
        console.warn('Error limpiando caché:', err);
    }
    window.location.href = window.location.origin + window.location.pathname + '?v=1.3.7&t=' + Date.now();
};

// ==============================================================================
// SISTEMA DE EMISIÓN DE SOPORTE OFICIAL PARA ROL ADMINISTRADOR (100% VISUAL)
// ==============================================================================
let currentAdminFoundRecord = null;

window.verSoporteDesdeTabla = function(docId, recordLocalId) {
    let match = adminRecordsCache.find(r => (docId && r._docId === docId) || (recordLocalId && (r.id === recordLocalId || r._docId === recordLocalId)));
    if (!match && docId && navigator.onLine) {
        db.collection('recolecciones').doc(docId).get().then(doc => {
            if (doc.exists) {
                const d = doc.data();
                d._docId = doc.id;
                mostrarComprobanteDigital(d);
            } else {
                alert("No se encontró el registro en la base de datos.");
            }
        }).catch(err => alert("Error consultando recolección: " + err.message));
        return;
    }
    if (match) {
        mostrarComprobanteDigital(match);
    } else {
        alert("No se pudo localizar el registro para generar el soporte.");
    }
};

function initAdminSupportModal() {
    const btnOpen = document.getElementById('btn-admin-support-modal');
    const modal = document.getElementById('admin-support-modal');
    const btnClose = document.getElementById('btn-close-admin-support-modal');
    const dateInput = document.getElementById('admin-search-date');
    const provSelect = document.getElementById('admin-search-provider');
    const pointSelect = document.getElementById('admin-search-point');
    const multipleBox = document.getElementById('admin-search-multiple-box');
    const multipleSelect = document.getElementById('admin-search-multiple-select');
    const resultBox = document.getElementById('admin-search-result-box');
    const emptyBox = document.getElementById('admin-search-empty-box');
    const loadingBox = document.getElementById('admin-search-loading');
    const btnViewVoucher = document.getElementById('btn-admin-view-voucher');

    if (!btnOpen || !modal) return;

    const popularProveedoresAdmin = () => {
        provSelect.innerHTML = '<option value="" disabled selected>Seleccione un proveedor</option>';
        const provsSet = new Set(TODOS_LOS_PROVEEDORES);
        adminRecordsCache.forEach(r => {
            if (r.proveedor) provsSet.add(r.proveedor.trim());
        });
        const provsList = Array.from(provsSet).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        provsList.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            provSelect.appendChild(opt);
        });
    };

    btnOpen.addEventListener('click', () => {
        modal.style.display = 'flex';
        if (!dateInput.value) {
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${y}-${m}-${d}`;
        }
        popularProveedoresAdmin();
        pointSelect.disabled = true;
        pointSelect.innerHTML = '<option value="" disabled selected>Primero seleccione un proveedor</option>';
        resultBox.style.display = 'none';
        emptyBox.style.display = 'none';
        multipleBox.style.display = 'none';
    });

    btnClose?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    provSelect.addEventListener('change', () => {
        const provVal = provSelect.value;
        if (!provVal) {
            pointSelect.disabled = true;
            pointSelect.innerHTML = '<option value="" disabled selected>Primero seleccione un proveedor</option>';
            ejecutarBusqueda();
            return;
        }

        pointSelect.disabled = false;
        pointSelect.innerHTML = '<option value="" disabled selected>Seleccione el punto de recolección</option>';

        const cleanStr = s => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        const targetProv = cleanStr(provVal);
        const puntosSet = new Set();

        const puntosCat = getPuntosParaProveedor('', provVal);
        puntosCat.forEach(pt => puntosSet.add(pt));

        adminRecordsCache.forEach(r => {
            if (cleanStr(r.proveedor) === targetProv) {
                const pt = r.punto || r.sucursal;
                if (pt) puntosSet.add(pt);
            }
        });

        const puntosList = Array.from(puntosSet).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        if (puntosList.length > 0) {
            puntosList.forEach(pt => {
                const opt = document.createElement('option');
                opt.value = pt;
                opt.textContent = pt;
                pointSelect.appendChild(opt);
            });
            if (puntosList.length === 1) {
                pointSelect.value = puntosList[0];
            }
        } else {
            const optGen = document.createElement('option');
            optGen.value = 'Sede Principal / General';
            optGen.textContent = 'Sede Principal / General';
            pointSelect.appendChild(optGen);
            pointSelect.value = 'Sede Principal / General';
        }

        ejecutarBusqueda();
    });

    dateInput.addEventListener('change', ejecutarBusqueda);
    pointSelect.addEventListener('change', ejecutarBusqueda);

    async function ejecutarBusqueda() {
        const dateVal = dateInput.value;
        const provVal = provSelect.value;
        const pointVal = pointSelect.value;

        resultBox.style.display = 'none';
        emptyBox.style.display = 'none';
        multipleBox.style.display = 'none';

        if (!dateVal || !provVal || !pointVal) {
            return;
        }

        loadingBox.style.display = 'block';

        const cleanStr = s => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        const targetProv = cleanStr(provVal);
        const targetPoint = cleanStr(pointVal);

        let matches = adminRecordsCache.filter(r => {
            const matchDate = coincideFechaRecoleccion(r.fecha, dateVal);
            const matchProv = cleanStr(r.proveedor) === targetProv;
            const pt = cleanStr(r.punto || r.sucursal);
            const matchPoint = pt === targetPoint || pt.includes(targetPoint) || targetPoint.includes(pt);
            return matchDate && matchProv && matchPoint;
        });

        if (matches.length === 0 && navigator.onLine) {
            try {
                const snapshot = await db.collection('recolecciones')
                    .where('proveedor', '==', provVal)
                    .get();
                snapshot.forEach(doc => {
                    const d = doc.data();
                    d._docId = doc.id;
                    if (coincideFechaRecoleccion(d.fecha, dateVal)) {
                        const pt = cleanStr(d.punto || d.sucursal);
                        if (pt === targetPoint || pt.includes(targetPoint) || targetPoint.includes(pt)) {
                            matches.push(d);
                            if (!adminRecordsCache.some(c => c._docId === doc.id)) {
                                adminRecordsCache.push(d);
                            }
                        }
                    }
                });
            } catch (err) {
                console.warn("Consulta extendida Firestore en Admin:", err);
            }
        }

        loadingBox.style.display = 'none';

        matches.sort((a, b) => {
            const tA = (a.timestamp && typeof a.timestamp === 'number') ? a.timestamp : parseFechaRecoleccion(a.fecha).getTime();
            const tB = (b.timestamp && typeof b.timestamp === 'number') ? b.timestamp : parseFechaRecoleccion(b.fecha).getTime();
            return tB - tA;
        });

        if (matches.length === 0) {
            emptyBox.style.display = 'block';
            currentAdminFoundRecord = null;
            return;
        }

        if (matches.length > 1) {
            multipleBox.style.display = 'block';
            multipleSelect.innerHTML = '';
            matches.forEach((m, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = `Viaje #${idx + 1} (${m.fecha}) - ${m.conductor || 'Sin conductor'} (${m.totalKilos || 0} kg)`;
                multipleSelect.appendChild(opt);
            });
            multipleSelect.onchange = () => {
                renderizarPreview(matches[Number(multipleSelect.value)]);
            };
            renderizarPreview(matches[0]);
        } else {
            renderizarPreview(matches[0]);
        }
    }

    function renderizarPreview(rec) {
        currentAdminFoundRecord = rec;
        resultBox.style.display = 'block';
        emptyBox.style.display = 'none';

        document.getElementById('admin-search-receipt-id').textContent = rec.id || rec._docId || 'N/A';
        
        const metaDiv = document.getElementById('admin-search-meta');
        metaDiv.innerHTML = `
            <div><strong>🚛 Conductor:</strong> <span style="text-transform: capitalize;">${rec.conductor || '-'}</span></div>
            <div><strong>🗺️ Ruta:</strong> <span style="text-transform: capitalize;">${rec.ruta || '-'}</span></div>
            <div><strong>📅 Fecha/Hora:</strong> ${rec.fecha || '-'}</div>
            <div><strong>📍 Punto:</strong> ${rec.punto || rec.sucursal || 'General'}</div>
            ${rec.observaciones ? `<div><strong>📝 Observaciones:</strong> ${rec.observaciones}</div>` : ''}
        `;

        const prodsDiv = document.getElementById('admin-search-products-preview');
        prodsDiv.innerHTML = '';
        if (rec.productos && Array.isArray(rec.productos)) {
            const prodsSorted = rec.productos.slice().sort((a, b) => (a.producto || '').localeCompare(b.producto || '', 'es', { sensitivity: 'base' }));
            prodsSorted.forEach(p => {
                const k = Math.round((Number(p.kilos) || 0) * 100) / 100;
                const itemDiv = document.createElement('div');
                itemDiv.style.display = 'flex';
                itemDiv.style.justifyContent = 'space-between';
                itemDiv.style.alignItems = 'center';
                itemDiv.style.padding = '4px 0';
                itemDiv.style.borderBottom = '1px dashed #f1f5f9';
                itemDiv.innerHTML = `
                    <span>${getEmojiForProduct(p.producto)} <strong>${p.producto}</strong></span>
                    <span style="color: #0284c7; font-weight: 700;">${k} KG</span>
                `;
                prodsDiv.appendChild(itemDiv);
            });
        } else {
            prodsDiv.innerHTML = `<div style="color: #64748b;">Producto: ${rec.producto || 'N/A'} - ${rec.totalKilos || 0} KG</div>`;
        }

        const totalKg = Math.round((Number(rec.totalKilos) || 0) * 100) / 100;
        document.getElementById('admin-search-total').innerHTML = `⚖️ Total Recolectado: <span style="font-size: 1.25rem;">${totalKg} KG</span>`;
    }

    btnViewVoucher.addEventListener('click', () => {
        if (currentAdminFoundRecord) {
            modal.style.display = 'none';
            mostrarComprobanteDigital(currentAdminFoundRecord);
        }
    });
}

// Inicializar selectores dinámicos y catálogos al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializar inmediatamente con catálogo base pre-cargado (0ms de latencia, 100% offline-ready)
    procesarPuntosRutasDinamicos(CATALOGO_PUNTOS_RUTAS_DEFAULT);
    renderDynamicProducts(DEFAULT_PRODUCTOS);
    
    // Cargar conductores activos de inmediato desde caché local o valores por defecto reales
    let initialDrivers = DEFAULT_CONDUCTORES;
    try {
        const cachedDrivers = localStorage.getItem('proteinagro_conductores_cache');
        if (cachedDrivers) {
            const parsed = JSON.parse(cachedDrivers);
            if (Array.isArray(parsed) && parsed.length > 0) initialDrivers = parsed;
        }
    } catch(e) {}
    renderDynamicDrivers(initialDrivers);

    renderDynamicRoutes(DEFAULT_RUTAS);
    initRutasYProveedores();
    initAdminSupportModal();

    // 2. Sincronizar en segundo plano con Google Sheets si hay internet
    cargarCatalogosDinamicos();

    // 3. Restaurar sesión activa de conductor si la página fue refrescada
    try {
        const savedDriver = sessionStorage.getItem('proteinagro_current_driver');
        if (savedDriver) {
            entrarComoConductor(savedDriver);
        }
    } catch(e) {}

    // 4. Registrar Service Worker v1.3.8 para PWA instalable con actualización automática inmediata
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js?v=1.3.8')
                .then(reg => {
                    console.log('✅ Service Worker v1.3.8 activo (PWA instalable):', reg.scope);
                    reg.update();
                })
                .catch(err => console.warn('⚠️ Error registrando Service Worker:', err));
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                console.log('🔄 Nuevo Service Worker detectado, recargando página...');
                window.location.reload();
            }
        });

        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.action === 'RELOAD_PAGE') {
                if (!refreshing) {
                    refreshing = true;
                    console.log('🔄 Mensaje de recarga recibido del Service Worker...');
                    window.location.reload();
                }
            }
        });
    }
});

// ==============================================================================
// GESTOR DE INSTALACIÓN PWA (Botón "📲 Instalar Aplicación")
// ==============================================================================
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const loginInstallBtn = document.getElementById('btn-pwa-install');
    const headerInstallBtn = document.getElementById('btn-pwa-install-header');
    if (loginInstallBtn) loginInstallBtn.style.display = 'flex';
    if (headerInstallBtn) headerInstallBtn.style.display = 'inline-flex';
    console.log('📲 PWA lista para ser instalada');
});

function handlePwaInstall() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(({ outcome }) => {
            if (outcome === 'accepted') {
                console.log('✅ El usuario aceptó instalar ProteinAgro');
            }
            deferredInstallPrompt = null;
            document.querySelectorAll('#btn-pwa-install, #btn-pwa-install-header').forEach(b => b.style.display = 'none');
        });
    } else {
        alert('📲 Para instalar ProteinAgro en tu dispositivo:\n\n• En Android (Chrome): Toca los tres puntos (⋮) arriba a la derecha y selecciona "Instalar aplicación" o "Agregar a la pantalla principal".\n\n• En iPhone / iPad (Safari): Toca el botón Compartir (el cuadrado con la flecha hacia arriba 📤) y selecciona "Agregar a la pantalla de inicio".\n\n• En PC / Mac (Chrome / Edge): Haz clic en el ícono de instalar en la barra de direcciones (arriba a la derecha).');
    }
}

document.getElementById('btn-pwa-install')?.addEventListener('click', handlePwaInstall);
document.getElementById('btn-pwa-install-header')?.addEventListener('click', handlePwaInstall);

window.addEventListener('appinstalled', () => {
    console.log('🎉 ProteinAgro instalada con éxito como PWA nativa');
    document.querySelectorAll('#btn-pwa-install, #btn-pwa-install-header').forEach(b => b.style.display = 'none');
});
