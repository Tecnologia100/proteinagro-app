// === CONFIGURACIÓN DE FIREBASE & GOOGLE SHEETS ===
// TODO: Reemplazar con credenciales reales en producción
const firebaseConfig = {
  apiKey: "AIzaSyC9zOPHxrxq7jezYCfDRwU3IUdvJfFTvTA",
  authDomain: "inventario-la15.firebaseapp.com",
  databaseURL: "https://inventario-la15-default-rtdb.firebaseio.com",
  projectId: "inventario-la15",
  storageBucket: "inventario-la15.firebasestorage.app",
  messagingSenderId: "318205537009",
  appId: "1:318205537009:web:6cb17449ce2189e2041750"
};

// URL del Webhook de Google Apps Script para sincronización directa con Google Sheets
let GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycby5L1az5QJOu8IlX7JUfmg6g2AjlBd3niqpiyJaMX7WogVRCWxCAcTr5CUUB23i8uxftw/exec"; 

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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

// === LÓGICA DE LOGIN ===
btnLogin.addEventListener('click', () => {
    const user = document.getElementById('login-user').value.trim().toLowerCase();
    const pin = document.getElementById('login-pin').value;
    const errorMsg = document.getElementById('login-error');

    if (user === 'admin' && pin === '0000') {
        // Entrar a vista de administrador
        loginOverlay.style.display = 'none';
        driverView.style.display = 'none';
        adminView.style.display = 'block';
        document.body.style.backgroundColor = 'var(--bg-color)';
        loadAdminData();
    } else if (user !== '' && pin === '1234') {
        // Entrar a vista de conductor
        loginOverlay.style.display = 'none';
        adminView.style.display = 'none';
        driverView.style.display = 'flex';
        // Autoseleccionar conductor si coincide el nombre
        const select = document.getElementById('conductor');
        for(let i=0; i<select.options.length; i++) {
            if(select.options[i].text.toLowerCase().includes(user)) {
                select.selectedIndex = i;
                break;
            }
        }
    } else {
        errorMsg.style.display = 'block';
    }
});

const logout = () => {
    loginOverlay.style.display = 'flex';
    driverView.style.display = 'none';
    adminView.style.display = 'none';
    document.getElementById('login-pin').value = '';
};

btnLogoutDriver.addEventListener('click', logout);
btnLogoutAdmin.addEventListener('click', logout);


// === LÓGICA DEL FORMULARIO CONDUCTOR ===
const productBtns = document.querySelectorAll('.product-btn');
const kilosGroup = document.getElementById('kilos-group');
const kilosInput = document.getElementById('kilos');
const btnRegistrarProducto = document.getElementById('btn-registrar-producto');
const addedProductsDiv = document.getElementById('added-products');
const productsListUl = document.getElementById('products-list');
let currentProduct = null;
let collectedProducts = [];

productBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Desmarcar todos
        productBtns.forEach(b => b.classList.remove('active'));
        // Marcar el seleccionado
        btn.classList.add('active');
        currentProduct = btn.dataset.value;
        document.getElementById('producto-seleccionado').value = currentProduct;
        
        // Mostrar campo de kilos
        kilosGroup.style.display = 'block';
        kilosInput.focus();
    });
});

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
        productos: collectedProducts,
        totalKilos: totalKilos,
        observaciones: observacionesVal,
        ubicacionGps: "0",
        firma: firmaDataUrl,
        fecha: new Date().toISOString(),
        estado: navigator.onLine ? 'Sincronizado' : 'Offline'
    };

    try {
        // 1. Guardar en respaldo local (LocalStorage) de inmediato
        let savedBackup = JSON.parse(localStorage.getItem('recolecciones_backup') || '[]');
        const recordId = 'REC-' + Date.now();
        const dataWithId = { ...data, id: recordId };
        savedBackup.unshift(dataWithId);
        localStorage.setItem('recolecciones_backup', JSON.stringify(savedBackup));

        // 2. Sincronizar inmediatamente con Google Sheets (vía webhook sin bloquear)
        if (GOOGLE_SHEETS_WEBHOOK_URL && GOOGLE_SHEETS_WEBHOOK_URL.trim() !== "") {
            enviarAGoogleSheets(dataWithId);
        }

        // 3. Intentar guardar en Firebase con un tiempo límite de 4 segundos
        try {
            const firestorePromise = db.collection('recolecciones').add(data);
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
        
        // Mostrar Toast
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);

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

              const tr = document.createElement('tr');
              tr.innerHTML = `
                  <td>${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}</td>
                  <td style="text-transform: capitalize;">${data.conductor}</td>
                  <td style="text-transform: capitalize;">${ruta}</td>
                  <td style="text-transform: capitalize;">${data.proveedor.replace('_', ' ')}</td>
                  <td style="font-size: 0.9rem; color: #0284c7;">${data.sucursal || 'General'}</td>
                  <td style="font-weight: bold;">${data.totalKilos} kg</td>
                  <td style="max-width: 200px; font-size: 0.85rem; color: #475569;">${obsText}</td>
                  <td><span class="badge ${badgeClass}">${data.estado}</span></td>
                  <td><img src="${data.firma}" style="height: 30px; border: 1px solid #ccc; background: white;" alt="firma"></td>
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
              tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">No hay recolecciones guardadas aún. Haz una prueba desde el formulario.</td></tr>';
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
              tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px; color: red;">Error de permisos o conexión en Firebase. Revisa las reglas de Firestore en Firebase Console.</td></tr>';
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

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}</td>
            <td style="text-transform: capitalize;">${data.conductor}</td>
            <td style="text-transform: capitalize;">${ruta}</td>
            <td style="text-transform: capitalize;">${data.proveedor.replace('_', ' ')}</td>
            <td style="font-size: 0.9rem; color: #0284c7;">${data.sucursal || 'General'}</td>
            <td style="font-weight: bold;">${data.totalKilos} kg</td>
            <td style="max-width: 200px; font-size: 0.85rem; color: #475569;">${obsText}</td>
            <td><span class="badge ${badgeClass}">${data.estado}</span></td>
            <td><img src="${data.firma}" style="height: 30px; border: 1px solid #ccc; background: white;" alt="firma"></td>
        `;
        tbody.appendChild(tr);
    });
}

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
                productosStr = data.productos.map(p => `${p.producto}: ${p.kilos}kg`).join(' | ');
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
        "CUENTA FABRICA"
    ],
    "RUTA 5: Palmira / Villagorgona / Carmelo": [
        "SUPERTIENDA CAÑAVERAL",
        "CUENTA SEVILLANA",
        "JHOANATAN MARTINEZ",
        "MIGAN CAPITAL"
    ],
    "RUTA 6: Belalcázar / Yumbo": [
        "BELALCAZAR",
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

let rutasConfig = JSON.parse(localStorage.getItem('proteinagro_rutas_config')) || DEFAULT_RUTAS_DATA;

function initRutasYProveedores() {
    const rutaSelect = document.getElementById('ruta');
    const proveedorSelect = document.getElementById('proveedor');
    const customRutaGroup = document.getElementById('custom-ruta-group');
    const customProveedorGroup = document.getElementById('custom-proveedor-group');

    if (!rutaSelect || !proveedorSelect) return;

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

    // Event listener al cambiar la Ruta
    rutaSelect.addEventListener('change', () => {
        const selectedRuta = rutaSelect.value;

        // Reset custom fields
        customRutaGroup.style.display = 'none';
        customProveedorGroup.style.display = 'none';
        document.getElementById('custom-ruta').required = false;
        document.getElementById('custom-proveedor').required = false;

        if (selectedRuta === 'OTRA') {
            customRutaGroup.style.display = 'block';
            document.getElementById('custom-ruta').required = true;
            populardropdownProveedores(TODOS_LOS_PROVEEDORES, true);
            renderizarCronogramaRuta('');
        } else if (rutasConfig[selectedRuta]) {
            const proveedoresDeRuta = rutasConfig[selectedRuta];
            populardropdownProveedores(proveedoresDeRuta, false);
            renderizarCronogramaRuta(selectedRuta);
        }
    });

    // Event listener al cambiar Proveedor
    proveedorSelect.addEventListener('change', () => {
        const selectedProv = proveedorSelect.value;
        if (selectedProv === 'OTRO') {
            customProveedorGroup.style.display = 'block';
            document.getElementById('custom-proveedor').required = true;
            populardropdownSucursales('');
        } else if (selectedProv === 'TODOS') {
            customProveedorGroup.style.display = 'none';
            document.getElementById('custom-proveedor').required = false;
            populardropdownProveedores(TODOS_LOS_PROVEEDORES, true);
            populardropdownSucursales('');
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

const SUCURSALES_DATA = {
    "SUPERTIENDA CAÑAVERAL": [
        "Sede Principal / General",
        "Cañaveral Punto 14 (Cra. 5 #14-37)",
        "Cañaveral Centenario (Av. 4N #46-64)",
        "Cañaveral Prados del Norte (Av. 2BN #34N-19)",
        "Cañaveral Álamos (Cl. 75CN #2 Bis-100)",
        "Cañaveral Los Pinos (Cl. 70 #7M Bis-64)",
        "Cañaveral La Primera (Cra. 1A #44-50)",
        "Cañaveral Ingenio",
        "Cañaveral Limonar",
        "Cañaveral Pasoancho",
        "Cañaveral Villanueva (Cl. 13 #75A-185)",
        "Cañaveral Cootraemcali (Cra. 70 #13B-18)",
        "Cañaveral Jamundí Terranova",
        "Cañaveral Jamundí Farallones",
        "Cañaveral Jamundí Surtimayorista",
        "Cañaveral Jamundí Rosario",
        "Cañaveral Jamundí Principal",
        "Cañaveral Jamundí Centro",
        "Cañaveral Jamundí Panamericana",
        "Cañaveral Tuluá - Buga",
        "Cañaveral Roldanillo - Zarzal",
        "Cañaveral Palmitex (Palmira)",
        "Cañaveral Palmicentro (Palmira)",
        "Cañaveral Villagorgona 1",
        "Cañaveral Villagorgona 2"
    ],
    "CARIBE": [
        "Sede Principal / General",
        "Caribe Puerto Tejada Centro (Cra. 19 #17-45)",
        "Caribe Puerto Tejada Punto 2 (Cl. 16 #20-60)",
        "Caribe Villa Rica (Cra. 3 #2-60)",
        "Caribe Buga"
    ],
    "CUENTA SEVILLANA": [
        "Sede Principal / General",
        "Sevillana Santa Elena",
        "Sevillana Pasoancho",
        "Sevillana Lourdes (Transv. 29D #29-50)",
        "Sevillana República de Israel",
        "Sevillana Guacarí",
        "Sevillana Palmira / Villagorgona"
    ],
    "MIGAN CAPITAL": [
        "Sede Principal / General",
        "Bodega Santa Elena",
        "Ciudad del Campo Granahorrar",
        "Ciudad del Campo Punto Rojo",
        "Ciudad del Campo Surtimercar",
        "Mercamio Palmira",
        "Nutrialimentos Valdez (Villagorgona)",
        "Yénifer Díaz (Villagorgona)",
        "Jorge Adrián Rodas (Villagorgona)"
    ],
    "COMERCIALIZADORA R Y E": [
        "Sede Principal / General",
        "Carnes RYE (Cra. 17F #33A-45)"
    ],
    "BELALCAZAR": [
        "Sede Principal / General",
        "Belalcázar Centro",
        "Yumbo"
    ],
    "CUENTA ALBERTO MILLAN": [
        "Sede Principal / General",
        "Alberto Millán Buga"
    ]
};

function actualizarItinerarioDelDia() {
    const bannerText = document.getElementById('day-schedule-text');
    if (!bannerText) return;

    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const hoyIndex = new Date().getDay();
    const hoyNombre = dias[hoyIndex];

    const itinerarioMap = {
        'Lunes': 'RUTA 1 (Santa Elena), RUTA 4 (Frigorífico Buga), RUTA 6 (Belalcázar/Yumbo)',
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
    sucursalSelect.innerHTML = '<option value="" selected>Sede Principal / General</option>';

    const listaSucursales = SUCURSALES_DATA[proveedorSeleccionado] || [];
    listaSucursales.forEach(suc => {
        if (suc !== "Sede Principal / General") {
            const opt = document.createElement('option');
            opt.value = suc;
            opt.textContent = suc;
            sucursalSelect.appendChild(opt);
        }
    });

    const optOtra = document.createElement('option');
    optOtra.value = 'OTRA_SUCURSAL';
    optOtra.textContent = '➕ Otra Sucursal...';
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
            if (remoteConfig && typeof remoteConfig === 'object' && Object.keys(remoteConfig).length > 0) {
                rutasConfig = remoteConfig;
                localStorage.setItem('proteinagro_rutas_config', JSON.stringify(remoteConfig));
                console.log("🔄 Configuración de rutas actualizada dinámicamente desde Google Sheets.");
            }
        }
    } catch (e) {
        console.log("ℹ️ Usando configuración de rutas local/en caché.");
    }
}

// Inicializar selectores dinámicos al cargar el DOM
document.addEventListener('DOMContentLoaded', initRutasYProveedores);
