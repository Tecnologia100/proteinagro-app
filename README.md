# 🌿 Sistema Digital de Recolección Materia Prima - ProteinAgro
> **Versión Actual:** `v=1.2.9` | **Despliegue Vercel:** [https://proteinagro-app.vercel.app](https://proteinagro-app.vercel.app)  
> *Para consultar la documentación técnica y funcional completa, ver [PROYECTO.md](PROYECTO.md).*

Este proyecto es una solución web de recolección de materia prima diseñada para eliminar el diligenciamiento físico de planillas y la digitación manual en oficinas.

---

## 🏗️ Arquitectura del Sistema

El sistema utiliza una arquitectura **Serverless & Cloud Tri-Persistence**:

1. **Frontend Web App (HTML5 / Vanilla CSS / JS):**
   - Publicada en **Vercel** (`https://proteinagro-app.vercel.app`).
   - Accesible desde cualquier navegador móvil/desktop sin instalar aplicaciones (PWA-ready).
   - UX optimizada para conductores: "cero tipeo", botones táctiles grandes para selección de productos e ingreso de kilos.
   - **Validación obligatoria de Punto / Lugar de Recolección (v1.2.6)**: Bloquea selección de productos o kilos si el punto no ha sido seleccionado.
   - Catálogo de 16 materias primas: ACEITE, CABEZAS, DESPERDICIO, EMPELLA, GORDANA, HARINA DE CARNE, HARINA DE HUESO VAPORIZADA, HUESO BLANCO, HUESO CALCINADO, HUESO DE CERDO, HUESO SECO, MANTECA, MARGARINA, PIEL DE POLLO, SEBO, SEBO EN RAMA.
   - Canvas interactivo para captura de firma digital del proveedor.
   - Campo para ingreso de **Observaciones** (novedades de la recolección).
   - Comprobante digital inmediato con soporte para compartir por WhatsApp o imprimir.
   - Retención del nombre del conductor seleccionado tras cada guardado para agilizar recolecciones continuas.

2. **Capa de Persistencia Nube (Firebase Firestore + Firebase Storage):**
   - Proyecto Firebase: `proteinagro-cd5fe`.
   - Persistencia **Offline** habilitada y manejo de fallbacks/timeouts para garantizar la disponibilidad del servicio.
   - **Firmas digitales almacenadas en Firebase Storage** (ruta `firmas/REC-XXXXX.png`) con URL pública guardada en Firestore/Sheets.
   - Mecanismo de fallback offline: si no hay conexión, la firma se guarda en base64 local hasta que se recupere la señal.
   - Respaldo automático inmediato en `localStorage` del navegador.

3. **Sincronización Automatizada (Google Apps Script Webhook):**
   - Webhook HTTP POST integrado a Google Sheets (`DB_App_Conductores.gsheet`).
   - Envío automático de recolecciones, kilos y observaciones.

4. **Dashboard Administrativo Integrado:**
    - Panel accesible con rol de administrador (`admin@proteinagro.com` o `admin` / `0000` como fallback).
    - **Autenticación con Firebase Auth** (email/contraseña) con fallback a PIN heredado.
    - Gráficas estadísticas en tiempo real creadas con Chart.js (Kilos por Proveedor y Kilos por Producto).
    - Visualización de la columna **Observaciones** para control de novedades.
    - Exportación de reportes consolidados en formato CSV / Excel.

---

## 📊 Estructura de Datos en Google Sheets (`Recolecciones`)

La hoja de Google Sheets recibe una fila independiente por cada producto recolectado en una transacción con las siguientes **12 columnas** en orden exacto:

| Columna | Campo | Descripción |
|---|---|---|
| **A** | `ID_Recoleccion` | Código único de la recolección (`REC-XXXXX`) |
| **B** | `Fecha_Hora` | Timestamp formateado (`DD/MM/YYYY, HH:MM AM/PM`) |
| **C** | `Ruta` | Nombre de la ruta de recolección seleccionada |
| **D** | `Conductor` | Nombre del conductor que realizó la recolección |
| **E** | `Proveedor` | Nombre del proveedor/cliente |
| **F** | `Punto_Sucursal` | Punto o sucursal exacta de la recolección |
| **G** | `Materia_Producto` | Nombre del producto recolectado (ej: Hueso Blanco, Sebo) |
| **H** | `Kg` | Cantidad de kilos recolectados |
| **I** | `Observaciones` | Novedades u observaciones escritas por el conductor |
| **J** | `Ubicacion_GPS_Real` | Coordenadas GPS del dispositivo (o `0` por defecto) |
| **K** | `Precio` | **Precio unitario por kg**: Calculado automáticamente por el script buscando el precio histórico más reciente de ese producto |
| **L** | `Valor` | **Valor Total**: Resultado automático de la multiplicación (`Kg * Precio`) |

> 🔒 **Nota de Seguridad & Negocio:** El conductor **nunca ve los precios ni valores** en la aplicación móvil. El cálculo de `Precio` y `Valor` ocurre exclusivamente en el servidor/hoja contable.

---

## 🛠️ Código de Google Apps Script (`doPost`)

Este es el script activo en el proyecto de Google Sheets (`DB_App_Conductores`):

```javascript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = null;

    if (e && e.parameter && e.parameter.payload) {
      data = typeof e.parameter.payload === 'string' ? JSON.parse(e.parameter.payload) : e.parameter.payload;
    } else if (e && e.postData && e.postData.contents) {
      var raw = e.postData.contents;
      if (raw.indexOf('payload=') === 0) {
        var decoded = decodeURIComponent(raw.substring(8).replace(/\+/g, ' '));
        data = JSON.parse(decoded);
      } else {
        data = JSON.parse(raw);
      }
    }

    if (!data) throw new Error("No se recibieron datos.");

    var id = data.id || 'REC-' + new Date().getTime();
    var fecha = data.fecha ? data.fecha.toString() : '';
    var ruta = data.ruta || '';
    var conductor = data.conductor || '';
    var proveedor = data.proveedor || '';
    var punto = data.punto || data.sucursal || '';
    var observaciones = data.observaciones || '';
    var ubicacionGps = data.ubicacionGps || '0';
    
    var productos = data.productos || [];
    if (typeof productos === 'string') {
      try { productos = JSON.parse(productos); } catch(err) {}
    }
    
    if (!Array.isArray(productos) || productos.length === 0) {
      productos = [{ producto: data.producto || '', kilos: data.totalKilos || 0 }];
    }
    
    var lastRowData = sheet.getLastRow();
    var searchRange = [];
    if (lastRowData > 1) {
      searchRange = sheet.getRange(2, 5, lastRowData - 1, 7).getValues(); 
    }
    
    for (var p = 0; p < productos.length; p++) {
      var prodItem = productos[p];
      var prodNombre = (typeof prodItem === 'object' && prodItem.producto) ? prodItem.producto : String(prodItem);
      var prodKilos = (typeof prodItem === 'object' && prodItem.kilos !== undefined) ? prodItem.kilos : (data.totalKilos || 0);
      
      var precio = '';
      var valor = '';
      
      if (searchRange.length > 0) {
        for (var i = searchRange.length - 1; i >= 0; i--) {
          var rowProv = String(searchRange[i][0] || '').trim();
          var rowProd = String(searchRange[i][2] || '').trim();
          
          if (rowProv === String(proveedor).trim() && rowProd === String(prodNombre).trim()) {
            precio = searchRange[i][6];
            break;
          }
        }
      }
      
      if (precio !== '' && !isNaN(parseFloat(precio)) && !isNaN(parseFloat(prodKilos))) {
        valor = parseFloat(precio) * parseFloat(prodKilos);
      }
      
      sheet.appendRow([
        id, fecha, ruta, conductor, proveedor, punto,
        prodNombre, prodKilos, observaciones, ubicacionGps, precio, valor
      ]);
      
      var currentRow = sheet.getLastRow();
      sheet.getRange(currentRow, 2).setNumberFormat('@STRING@');
    }

    return ContentService.createTextOutput(JSON.stringify({"result": "success"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

## 📌 Pendientes y Próximos Pasos (TODOs)

- [x] **1. Mapeo Dinámico de Sectores/Rutas:** Cargar la lista de Rutas y Proveedores dinámicamente desde la pestaña `Proveedores` y `Rutas` de Google Sheets.
- [x] **2. Autenticación con Firebase Auth:** Migrar la validación de PIN a usuarios individuales con roles estrictos (Conductor / Administrador / Auditor).
- [x] **3. Firma Digital en Firebase Storage:** La firma se sube como imagen PNG a Firebase Storage (`firmas/REC-XXXXX.png`) y se guarda únicamente la URL de descarga en Firestore y Google Sheets.
- [ ] **4. Geolocalización GPS Nativa:** Activar `navigator.geolocation` con permisos en el móvil para capturar latitud y longitud reales al guardar.
- [ ] **5. Notificaciones Automáticas (WhatsApp / Email):** Configurar un trigger en Google Apps Script para enviar un resumen automático por correo/WhatsApp al proveedor tras cada recolección.
- [ ] **6. Migrar a creación de usuarios reales en Firebase Auth:** Enviar correos de invitación a conductores y administradores con credenciales individuales.
- [ ] **7. Sincronización Automática de Firmas Offline:** Reintentar subir firmas pendientes a Firebase Storage cuando el dispositivo recupere conexión a internet.
