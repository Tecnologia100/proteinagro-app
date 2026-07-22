# 🌿 Sistema Digital de Recolección Materia Prima - ProteinAgro

Este proyecto es una solución web de recolección de materia prima diseñada para eliminar el diligenciamiento físico de planillas y la digitación manual en oficinas.

---

## 🏗️ Arquitectura del Sistema

El sistema utiliza una arquitectura **Serverless & Cloud Dual-Persistence**:

1. **Frontend Web App (HTML5 / Vanilla CSS / JS):**
   - Publicada en **Vercel** (`https://proteinagro-app.vercel.app`).
   - Accesible desde cualquier navegador móvil/desktop sin instalar aplicaciones (PWA-ready).
   - UX optimizada para conductores: "cero tipeo", botones táctiles grandes para selección de productos e ingreso de kilos.
   - Canvas interactivo para captura de firma digital del proveedor.
   - Retención del nombre del conductor seleccionado tras cada guardado para agilizar recolecciones continuas.

2. **Capa de Persistencia Nube (Firebase Firestore):**
   - Proyecto Firebase: `proteinagro-cd5fe`.
   - Persistencia **Offline** habilitada: si el conductor pierde señal en carretera, los datos se guardan en el almacenamiento local del dispositivo y se sincronizan en la nube automáticamente al recuperar conexión.

3. **Sincronización Automatizada (Google Apps Script Webhook):**
   - Webhook HTTP POST integrado a Google Sheets (`DB_App_Conductores.gsheet`).
   - Método de envío mediante formulario HTML e iframe oculto para evitar bloqueos por CORS o redirecciones de Google.

4. **Dashboard Administrativo Integrado:**
   - Panel accesible con rol de administrador (`admin` / `0000`).
   - Gráficas estadísticas en tiempo real creadas con Chart.js (Kilos por Proveedor y Kilos por Producto).
   - Exportación de reportes consolidados en formato CSV / Excel.

---

## 📊 Estructura de Datos en Google Sheets (`Recolecciones`)

La hoja de Google Sheets recibe una fila independiente por cada producto recolectado en una transacción con las siguientes 10 columnas en orden exacto:

| Columna | Campo | Descripción |
|---|---|---|
| **A** | `ID_Recoleccion` | Código único de la recolección (`REC-XXXXX`) |
| **B** | `Fecha_Hora` | Timestamp formateado (`DD/MM/YYYY, HH:MM AM/PM`) |
| **C** | `Ruta` | Nombre de la ruta de recolección seleccionada |
| **D** | `Conductor` | Nombre del conductor que realizó la recolección |
| **E** | `Proveedor` | Nombre del proveedor/cliente |
| **F** | `Materia/Producto` | Nombre del producto recolectado (ej: Hueso Blanco, Sebo) |
| **G** | `Kg` | Cantidad de kilos recolectados |
| **H** | `Ubicacion_GPS_Real` | Coordenadas GPS del dispositivo (o `0` por defecto) |
| **I** | `Precio` | **Precio unitario por kg**: Calculado automáticamente por el script buscando el precio histórico más reciente de ese producto |
| **J** | `Valor` | **Valor Total**: Resultado automático de la multiplicación (`Kg * Precio`) |

> 🔒 **Nota de Seguridad & Negocio:** El conductor **nunca ve los precios ni valores** en la aplicación móvil. El cálculo de `Precio` y `Valor` ocurre exclusivamente en el servidor/hoja contable.

---

## 🛠️ Código de Google Apps Script (`doPost`)

Este es el script activo en el proyecto de Google Sheets (`DB_App_Conductores`):

```javascript
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Recolecciones") || ss.getSheets()[0];

    var data = {};
    if (e.parameter && e.parameter.payload) {
      data = JSON.parse(e.parameter.payload);
    } else if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["ID_Recoleccion", "Fecha_Hora", "Ruta", "Conductor", "Proveedor", "Materia/Producto", "Kg", "Ubicacion_GPS_Real", "Precio", "Valor"]);
    }

    var idRecoleccion = data.id || "REC-" + Date.now();
    var fechaHora = data.fecha ? new Date(data.fecha).toLocaleString("es-CO") : new Date().toLocaleString("es-CO");
    var ruta = data.ruta || "";
    var conductor = data.conductor || "";
    var proveedor = data.proveedor || "";
    var ubicacionGps = data.ubicacionGps || "0";

    function obtenerUltimoPrecio(nombreProducto) {
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) return 0;
      var values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
      for (var i = values.length - 1; i >= 0; i--) {
        var prod = values[i][5];   // Columna F (Materia/Producto)
        var precio = values[i][8]; // Columna I (Precio)
        if (prod && prod.toString().trim().toLowerCase() === nombreProducto.trim().toLowerCase()) {
          var p = parseFloat(precio);
          if (!isNaN(p) && p > 0) return p;
        }
      }
      return 0;
    }

    var productos = data.productos && Array.isArray(data.productos) && data.productos.length > 0
      ? data.productos
      : [{ producto: "Materia Prima", kilos: data.totalKilos || 0 }];

    productos.forEach(function(item) {
      var nombre = item.producto || item.nombre || "Materia Prima";
      var kg = parseFloat(item.kilos) || 0;
      var precio = obtenerUltimoPrecio(nombre);
      var valor = precio * kg;

      sheet.appendRow([
        idRecoleccion, fechaHora, ruta, conductor, proveedor, nombre, kg, ubicacionGps, precio, valor
      ]);
    });

    return ContentService.createTextOutput("OK");
  } catch (err) {
    return ContentService.createTextOutput("ERROR: " + err.toString());
  }
}
```

---

## 📌 Pendientes y Próximos Pasos (TODOs)

- [ ] **1. Mapeo Dinámico de Sectores/Rutas:** Cargar la lista de Rutas y Proveedores dinámicamente desde la pestaña `Proveedores` y `Rutas` de Google Sheets.
- [ ] **2. Autenticación con Firebase Auth:** Migrar la validación de PIN a usuarios individuales con roles estrictos (Conductor / Administrador / Auditor).
- [ ] **3. Firma Digital en Google Drive:** Guardar la imagen en Base64 de la firma como un archivo comprimido en una carpeta de Google Drive e insertar su enlace directo en la hoja de cálculo.
- [ ] **4. Geolocalización GPS Nativa:** Activar `navigator.geolocation` con permisos en el móvil para capturar latitud y longitud reales al guardar.
- [ ] **5. Notificaciones Automáticas (WhatsApp / Email):** Configurar un trigger en Google Apps Script para enviar un resumen automático por correo/WhatsApp al proveedor tras cada recolección.
