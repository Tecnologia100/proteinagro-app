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
    const rutaName = rutaSel.options[rutaSel.selectedIndex]?.text || rutaSel.value;
    
    const proveedorSel = document.getElementById('proveedor');
    const proveedorName = proveedorSel.options[proveedorSel.selectedIndex]?.text || proveedorSel.value;
    
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
              tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px;">No hay recolecciones guardadas aún. Haz una prueba desde el formulario.</td></tr>';
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
        csvContent += "ID,Fecha,Conductor,Ruta,Proveedor,Productos,Total Kilos,Observaciones,Estado\n";

        snapshot.forEach(doc => {
            const data = doc.data();
            const dateObj = new Date(data.fecha);
            const fechaFormatted = `"${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}"`;
            const conductor = `"${data.conductor || ''}"`;
            const ruta = `"${(data.ruta || '').replace('_', ' ')}"`;
            const proveedor = `"${(data.proveedor || '').replace('_', ' ')}"`;
            
            let productosStr = '';
            if (data.productos && Array.isArray(data.productos)) {
                productosStr = data.productos.map(p => `${p.producto}: ${p.kilos}kg`).join(' | ');
            }
            productosStr = `"${productosStr}"`;

            const totalKilos = data.totalKilos || 0;
            const observaciones = `"${(data.observaciones || '').replace(/"/g, '""')}"`;
            const estado = `"${data.estado || ''}"`;

            csvContent += `${doc.id},${fechaFormatted},${conductor},${ruta},${proveedor},${productosStr},${totalKilos},${observaciones},${estado}\n`;
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
