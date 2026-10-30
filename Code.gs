// ==============================================================================
// SCRIPT COMPLETO DE GOOGLE APPS SCRIPT PARA PROTEINAGRO (SISTEMA MATRIZ DINÁMICO)
// ==============================================================================

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 0. Si se solicita la vista del Conciliador o si se abre sin parámetros en navegador
    var isConciliador = (e && e.parameter && (e.parameter.view === 'conciliador' || e.parameter.view === 'dashboard'));
    var hasAppAction = (e && e.parameter && (e.parameter.action || e.parameter.payload || e.parameter.fecha || e.parameter.id || e.parameter.t || e.parameter.format === 'json'));

    if (isConciliador || !hasAppAction) {
      return getConciliadorHtmlOutput()
        .setTitle('Conciliador de Materias y Proveedores')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
    }

    // 0.1 Si viene una petición de guardado vía GET (Garantía 100% anti-bloqueos)
    if (e && e.parameter && (e.parameter.action === 'saveRecoleccion' || e.parameter.action === 'saveNovedad' || (e.parameter.payload && !e.parameter.t))) {
      return guardarRecoleccionSheet(ss, e.parameter.payload);
    }

    // 0.03 Obtener recolecciones para Cierre Diario y Auditoría (Garantía anti-fallo para GViz)
    if (e && e.parameter && e.parameter.action === 'getRecolecciones') {
      return obtenerRecoleccionesHttp(ss, e.parameter.fecha, e.parameter.ruta);
    }

    // 0.035 Obtener Catálogo Maestro Desacoplado de Proveedores (Totalmente independiente de Puntos_Rutas)
    if (e && e.parameter && (e.parameter.action === 'getProveedores' || e.parameter.action === 'getCatalogoProveedores')) {
      return getCatalogoProveedoresHttp(ss);
    }

    // 0.04 Si viene una petición de eliminación por ID
    if (e && e.parameter && e.parameter.action === 'deleteRecoleccion' && e.parameter.id) {
      return eliminarRecoleccionSheet(ss, e.parameter.id);
    }

    // 0.05 Si viene una petición de actualización/edición de recolección
    if (e && e.parameter && e.parameter.action === 'updateRecoleccion') {
      return actualizarRecoleccionSheet(ss, e.parameter.payload);
    }

    // 0.08 Corrección masiva de Kilos convertidos erróneamente a fechas (46.xxx -> Kilos Reales)
    // 0.081 Homologar masivamente nombres de rutas y limpiar Kilos anómalos
    if (e && e.parameter && e.parameter.action === 'homologarRutas') {
      return homologarRutasYLimpiarSheet(ss);
    }

    // 0.0815 Reclasificación histórica Ruta 1: Santa Elena / Cavasa (Bodega Santa Elena, Alejandro Garay, Sevillana)
    if (e && e.parameter && e.parameter.action === 'migrarRuta1') {
      return migrarRuta1SantaElenaHttp(ss);
    }

    // 0.0816 Actualización de tarifas individuales Ruta 1 (Opción 1: Santa Elena / Cavasa)
    if (e && e.parameter && e.parameter.action === 'migrarTarifasRuta1') {
      return migrarTarifasRuta1Http(ss);
    }

    // 0.0817 Reparación de duplicados y anomalías de septiembre (Cavasa / Cañaveral)
    if (e && e.parameter && e.parameter.action === 'repararDuplicadosSeptiembre') {
      return repararDuplicadosSeptiembreHttp(ss);
    }

    if (e && e.parameter && e.parameter.action === 'corregirKilosFechas') {
      return corregirKilosFechasSheet(ss);
    }

    // 0.082 Liquidar masivamente celdas vacías de Precio y Valor en Recolecciones
    if (e && e.parameter && e.parameter.action === 'liquidarRecolecciones') {
      return liquidarRecoleccionesPendientes(ss);
    }

    // 0.085 Restaurar encabezados de Puntos_Rutas
    if (e && e.parameter && e.parameter.action === 'restaurarEncabezados') {
      return restaurarEncabezadosPuntosRutasHttp(ss);
    }

    // 0.086 Habilitar o desplazar columnas de Factura (Caribe) O:Q hacia la derecha
    if (e && e.parameter && (e.parameter.action === 'habilitarColumnasFactura' || e.parameter.action === 'desplazarColumnasFactura')) {
      return habilitarColumnasFacturaHttp(ss);
    }

    // 0.09 Inicializar o sincronizar pestaña Tarifas (precios vigentes y pendientes)
    if (e && e.parameter && e.parameter.action === 'inicializarTarifas') {
      return inicializarPestanaTarifas(ss);
    }

    // 0.1 Diagnóstico en vivo de Precios y Recolecciones
    if (e && e.parameter && e.parameter.action === 'debugPrecios') {
      return diagnosticoPreciosSheet(ss, e.parameter.proveedor, e.parameter.producto);
    }

    // 1. Obtener Productos (filtrando Inactivos)
    var sheetProductos = ss.getSheetByName("Productos");
    var productos = [];
    if (sheetProductos && sheetProductos.getLastRow() > 1) {
      var prodData = sheetProductos.getRange(2, 1, sheetProductos.getLastRow() - 1, 2).getValues();
      for (var i = 0; i < prodData.length; i++) {
        var nombre = String(prodData[i][0] || '').trim();
        var estado = String(prodData[i][1] || 'Activo').trim().toLowerCase();
        if (nombre !== '' && estado !== 'inactivo') {
          productos.push(nombre);
        }
      }
    }
    
    // 2. Obtener Conductores (filtrando Inactivos y extrayendo Contraseña en Columna C)
    var sheetConductores = ss.getSheetByName("Conductores");
    var conductores = [];
    var conductoresDetalle = [];
    var adminClave = '';
    if (sheetConductores && sheetConductores.getLastRow() > 1) {
      var maxCols = sheetConductores.getMaxColumns();
      if (maxCols < 3) {
        sheetConductores.insertColumnsAfter(maxCols, 3 - maxCols);
      }
      var numCols = Math.max(3, sheetConductores.getLastColumn());
      var condData = sheetConductores.getRange(2, 1, sheetConductores.getLastRow() - 1, numCols).getValues();
      for (var j = 0; j < condData.length; j++) {
        var cNombre = String(condData[j][0] || '').trim();
        var cEstado = String(condData[j][1] || 'Activo').trim().toLowerCase();
        var cClave = condData[j][2] !== undefined && condData[j][2] !== null ? String(condData[j][2]).trim() : '';

        // Si es usuario administrador en la hoja, capturar su clave exclusiva
        if (cNombre.toLowerCase() === 'admin' || cNombre.toLowerCase() === 'administrador') {
          if (cClave !== '') {
            adminClave = cClave;
          }
          continue;
        }

        if (cNombre !== '' && cEstado !== 'inactivo') {
          conductores.push(cNombre);
          conductoresDetalle.push({
            nombre: cNombre,
            clave: cClave
          });
        }
      }
    }
    
    // 3. Obtener Puntos y Matriz Completa de Rutas (filtrando Inactivos)
    var sheetPuntosRutas = ss.getSheetByName("Puntos_Rutas");
    var puntosRutas = [];
    if (sheetPuntosRutas && sheetPuntosRutas.getLastRow() > 1) {
      var prData = sheetPuntosRutas.getRange(2, 1, sheetPuntosRutas.getLastRow() - 1, 8).getValues();
      for (var m = 0; m < prData.length; m++) {
        var pRuta = String(prData[m][0] || '').trim();
        var pProv = String(prData[m][1] || '').trim();
        var pPunto = String(prData[m][2] || '').trim();
        var pDir = String(prData[m][3] || '').trim();
        var pTel = String(prData[m][4] || '').trim();
        var pHoraRaw = prData[m][5];
        var pHora = '';
        if (pHoraRaw instanceof Date) {
          var hours = pHoraRaw.getHours();
          var minutes = pHoraRaw.getMinutes();
          var ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours ? hours : 12;
          var strHours = hours < 10 ? '0' + hours : hours;
          var strMinutes = minutes < 10 ? '0' + minutes : minutes;
          pHora = strHours + ':' + strMinutes + ' ' + ampm;
        } else {
          pHora = String(pHoraRaw || '').trim();
        }
        var pFrec = String(prData[m][6] || '').trim();
        var pEst = String(prData[m][7] || 'Activo').trim().toLowerCase();

        if (pPunto !== '' && pEst !== 'inactivo') {
          puntosRutas.push({
            ruta: pRuta,
            proveedor: pProv,
            punto: pPunto,
            direccion: pDir,
            telefono: pTel,
            horario: pHora,
            frecuencia: pFrec,
            estado: 'Activo'
          });
        }
      }
    }

    // 4. Obtener Rutas Básicas (filtrando Inactivos de la pestaña Rutas y Puntos_Rutas)
    var inactiveRoutesMap = {};
    var sheetRutas = ss.getSheetByName("Rutas");
    if (sheetRutas && sheetRutas.getLastRow() > 1) {
      var rutaData = sheetRutas.getRange(2, 1, sheetRutas.getLastRow() - 1, 2).getValues();
      for (var k = 0; k < rutaData.length; k++) {
        var rName = String(rutaData[k][0] || '').trim();
        var rState = String(rutaData[k][1] || 'Activo').trim().toLowerCase();
        if (rState === 'inactivo') {
          inactiveRoutesMap[rName.toLowerCase()] = true;
          // Normalización para coincidencias parciales como RUTA 6
          var rMatch = rName.match(/RUTA\s*(\d+)/i);
          if (rMatch) inactiveRoutesMap['ruta ' + rMatch[1]] = true;
        }
      }
    }

    var rutasSet = {};
    var rutas = [];
    for (var n = 0; n < puntosRutas.length; n++) {
      var rt = puntosRutas[n].ruta;
      var rtMatch = rt.match(/RUTA\s*(\d+)/i);
      var isInactive = inactiveRoutesMap[rt.toLowerCase()] || (rtMatch && inactiveRoutesMap['ruta ' + rtMatch[1]]);
      if (rt && !isInactive && !rutasSet[rt]) {
        rutasSet[rt] = true;
        rutas.push(rt);
      }
    }

    // Fallbacks de seguridad si las pestañas aún están vacías
    if (productos.length === 0) {
      productos = ["ACEITE", "CABEZAS", "DESPERDICIO", "EMPELLA", "GORDANA", "HARINA CARNE", "HUESO BLANCO", "HUESO CERDO", "HUESO SECO", "MANTECA", "MARGARINA", "PIEL POLLO", "SEBO", "SEBO EN RAMA"];
    }
    if (conductores.length === 0) {
      conductores = ["Ricardo Sepulveda", "Hernando Prado", "Emer Rodriguez", "Jairo Peña", "Carolina Becerra", "Luz Elena Lopez", "Francisco Larrahondo", "Daniela Marquez"];
      conductoresDetalle = [
        { nombre: "Ricardo Sepulveda", clave: "1649" },
        { nombre: "Hernando Prado", clave: "8063" },
        { nombre: "Emer Rodriguez", clave: "6860" },
        { nombre: "Jairo Peña", clave: "5301" },
        { nombre: "Carolina Becerra", clave: "1306" },
        { nombre: "Luz Elena Lopez", clave: "6700" },
        { nombre: "Francisco Larrahondo", clave: "1234" },
        { nombre: "Daniela Marquez", clave: "3016" }
      ];
    }
    if (rutas.length === 0) {
      rutas = [
        "RUTA 1: Santa Elena / Cavasa",
        "RUTA 2: Cali (Norte / Sur / Oriente)",
        "RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance",
        "RUTA 4: Buga / Roldanillo / Zarzal / Tuluá",
        "RUTA 5: Palmira / Villagorgona / Carmelo",
        "RUTA 6: Oriente/Sur",
        "RUTA 7: Yumbo/Belalcazar"
      ];
    }

    // 5. Catálogo Maestro Integral de Proveedores (Totalmente desacoplado de Puntos_Rutas)
    var catalogoMap = obtenerCatalogoProveedoresCompleto(ss);
    var sheetRec = ss.getSheetByName("Recolecciones");
    if (sheetRec && sheetRec.getLastRow() > 1) {
      var rData = sheetRec.getRange(2, 5, sheetRec.getLastRow() - 1, 1).getValues();
      for (var ri = 0; ri < rData.length; ri++) {
        var rp = homologarProveedor(rData[ri][0]);
        if (rp) catalogoMap[rp] = true;
      }
    }
    var listaProveedoresCompleta = Object.keys(catalogoMap).sort(function(a, b) {
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });

    var output = {
      version: "1.4.3-desacoplado-proveedores",
      productos: productos,
      conductores: conductores,
      conductores_detalle: conductoresDetalle,
      admin_clave: adminClave,
      rutas: rutas,
      puntos_rutas: puntosRutas,
      proveedores: listaProveedoresCompleta
    };

    return ContentService.createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Función de consulta directa para Cierre Diario y Auditoría (Respaldo 100% anti-fallo para GViz)
function obtenerRecoleccionesHttp(ss, fechaFiltro, rutaFiltro) {
  try {
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet || sheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        result: 'success',
        recolecciones: []
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var lastRow = sheet.getLastRow();
    // Leer columnas A hasta Q (ID..Observaciones + Numero_Factura, Valor_Factura, Foto_Factura en O, P, Q)
    var numCols = Math.min(sheet.getLastColumn(), 17);
    var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var resultado = [];

    // Si viene fechaFiltro en formato YYYY-MM-DD
    var targetD = null, targetM = null, targetY = null;
    if (fechaFiltro) {
      var fParts = String(fechaFiltro).trim().split('-');
      if (fParts.length === 3) {
        targetY = parseInt(fParts[0], 10);
        targetM = parseInt(fParts[1], 10);
        targetD = parseInt(fParts[2], 10);
      }
    }

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rawFecha = row[1];
      var rowRuta = String(row[2] || '').trim();

      // Parsear fecha
      var rD = null, rM = null, rY = null;
      if (rawFecha instanceof Date) {
        rD = rawFecha.getDate();
        rM = rawFecha.getMonth() + 1;
        rY = rawFecha.getFullYear();
      } else if (rawFecha) {
        var strF = String(rawFecha).trim().split(' ')[0] || '';
        if (strF.indexOf('/') !== -1) {
          var p = strF.split('/');
          if (p.length === 3) {
            rD = parseInt(p[0], 10);
            rM = parseInt(p[1], 10);
            rY = parseInt(p[2], 10);
          }
        } else if (strF.indexOf('-') !== -1) {
          var p = strF.split('-');
          if (p.length === 3) {
            if (p[0].length === 4) {
              rY = parseInt(p[0], 10);
              rM = parseInt(p[1], 10);
              rD = parseInt(p[2], 10);
            } else {
              rD = parseInt(p[0], 10);
              rM = parseInt(p[1], 10);
              rY = parseInt(p[2], 10);
            }
          }
        }
      }

      if (targetD !== null && targetM !== null && targetY !== null) {
        if (rD !== targetD || rM !== targetM || rY !== targetY) {
          continue;
        }
      }

      var rawKg = row[7];
      var numKg = 0;
      if (typeof rawKg === 'number') {
        numKg = rawKg;
      } else if (rawKg) {
        numKg = parseFloat(String(rawKg).replace(/\./g, '').replace(',', '.')) || 0;
      }

      resultado.push({
        id: String(row[0] || ''),
        fechaHora: rawFecha instanceof Date ? Utilities.formatDate(rawFecha, "GMT-5", "d/M/yyyy HH:mm:ss") : String(rawFecha || ''),
        ruta: rowRuta,
        conductor: String(row[3] || ''),
        proveedor: String(row[4] || ''),
        sucursal: String(row[5] || ''),
        materia: String(row[6] || ''),
        totalKilos: numKg,
        observaciones: String(row[8] || ''),
        numeroFactura: row.length > 14 ? String(row[14] || '').trim() : '',
        valorFactura: row.length > 15 && row[15] !== '' ? (parseFloat(String(row[15]).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0) : 0,
        fotoFactura: row.length > 16 ? String(row[16] || '').trim() : ''
      });
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      total: resultado.length,
      recolecciones: resultado
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Sanitización contra inyección de fórmulas (CSV / Formula Injection en Google Sheets)
function sanitizarParaHoja(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  var str = String(val);
  // Si inicia con =, +, -, o @, anteponer apóstrofe ' para que Google Sheets lo almacene como texto literal puro
  if (/^[\=\+\-\@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

// Comparador robusto de productos: Exactitud estricta sin colisiones por substring
function productosCoinciden(prod1, prod2) {
  var p1 = normalizarTexto(prod1);
  var p2 = normalizarTexto(prod2);
  if (!p1 || !p2) return false;
  // 1. Coincidencia exacta 100%
  if (p1 === p2) return true;
  // 2. Tolerancia estricta solo para singular/plural de la misma palabra (ej. "piel" vs "pieles")
  // Jamás permitir que "sebo" coincida con "sebo en rama", ni "hueso" con "hueso blanco" o "hueso de cerdo"
  if (p1 + 's' === p2 || p2 + 's' === p1 || p1 + 'es' === p2 || p2 + 'es' === p1) {
    if (p1.indexOf('pollo') === -1 && p2.indexOf('pollo') === -1) {
      return true;
    }
  }
  return false;
}

function guardarRecoleccionSheet(ss, rawPayload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    // 1. Bloqueo de concurrencia: evitar que sincronizaciones simultáneas sobreescriban filas o colisionen
    try {
      lockAcquired = lock.tryLock(20000); // 20 segundos máx de espera
    } catch (eLock) {
      Logger.log("Aviso LockService: " + eLock.toString());
    }

    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) {
      sheet = ss.insertSheet("Recolecciones");
      sheet.appendRow([
        "ID_Recoleccion", "Fecha_Hora", "Ruta", "Conductor", "Proveedor",
        "Punto_Sucursal", "Materia_Producto", "Kg", "Observaciones",
        "Ubicacion_GPS_Real", "Precio", "Valor"
      ]);
    }

    var data = null;
    if (typeof rawPayload === 'string') {
      try { data = JSON.parse(rawPayload); } catch(e) { data = null; }
    } else {
      data = rawPayload;
    }
    if (!data) throw new Error("No payload recibido.");

    var id = data.id || 'REC-' + new Date().getTime();
    // Validar ID seguro contra inyección
    id = String(id).trim();
    if (!/^(REC|NOV)-\d+(-[a-zA-Z0-9]+)?$/.test(id)) {
      id = sanitizarParaHoja(id);
    }

    var fecha = data.fecha ? String(data.fecha) : new Date().toLocaleString();
    var ruta = data.ruta || '';
    var conductor = data.conductor || '';
    var proveedor = removerEmojisDecorativos(data.proveedor || '');
    var punto = data.punto || data.sucursal || '';
    var observaciones = data.observaciones || '';
    var ubicacionGps = data.ubicacionGps || '0';
    var numeroFactura = String(data.numeroFactura || data.numero_factura || '').trim();
    var valorFacturaRaw = (data.valorFactura !== undefined && data.valorFactura !== null && data.valorFactura !== '') ? data.valorFactura : ((data.valor_factura !== undefined && data.valor_factura !== null && data.valor_factura !== '') ? data.valor_factura : '');
    var valorFactura = valorFacturaRaw !== '' ? parseKilosNumero(valorFacturaRaw) : '';
    var fotoFactura = String(data.fotoFactura || data.foto_factura || '').trim();
    
    var productos = data.productos || [];
    if (typeof productos === 'string') {
      try { productos = JSON.parse(productos); } catch(err) {}
    }
    
    if (!Array.isArray(productos) || productos.length === 0) {
      productos = [{ producto: data.producto || '', kilos: data.totalKilos || 0 }];
    }
    
    var lastRowData = sheet.getLastRow();
    var existingRecordsMap = {};
    var existingIdsMap = {};

    if (lastRowData > 1) {
      // Escaneo integral de TODA la hoja Recolecciones (sin límite ciego de 200 filas)
      var numRows = lastRowData - 1;
      var idColValues = sheet.getRange(2, 1, numRows, 1).getValues();
      var prodColValues = sheet.getRange(2, 7, numRows, 1).getValues();
      for (var ex = 0; ex < numRows; ex++) {
        var exId = String(idColValues[ex][0] || '').trim();
        var exProd = String(prodColValues[ex][0] || '').trim().toLowerCase();
        if (exId) {
          existingIdsMap[exId] = true;
          if (exProd) {
            existingRecordsMap[exId + '|' + exProd] = true;
          }
        }
      }
    }

    // Detección de Novedad "Cliente Cancela Servicio"
    var causalStr = String(data.causal || '').trim();
    var esCancelacionCliente = (
      causalStr.toLowerCase().indexOf('cliente cancela') !== -1 ||
      (data.tipo === 'Novedad' && String(observaciones).toLowerCase().indexOf('cliente cancela') !== -1) ||
      (productos && productos.some(function(p) {
        var n = typeof p === 'object' ? String(p.producto || '') : String(p || '');
        return n.toLowerCase().indexOf('cliente cancela') !== -1;
      }))
    );

    // REGLA DE NEGOCIO: "Cliente Cancela Servicio" sólo antes de arribo / pesaje
    // Si ya existe un pesaje registrado con carga (> 0 Kg) en el día para este punto/proveedor, rechazar.
    if (esCancelacionCliente && lastRowData > 1) {
      var numRowsToCheck = lastRowData - 1;
      var checkData = sheet.getRange(2, 1, numRowsToCheck, 8).getValues();
      var normTargetProv = normalizarTexto(proveedor);
      var normTargetPunto = normalizarTexto(punto);
      var incomingDateStr = normalizarFechaDia(fecha) || normalizarFechaDia(new Date());

      for (var r = checkData.length - 1; r >= 0; r--) {
        var rowId = String(checkData[r][0] || '').trim();
        if (rowId && id && rowId === id) continue; // Idempotencia: omitir el mismo registro si es reintento

        var rowFecha = normalizarFechaDia(checkData[r][1]);
        if (rowFecha && incomingDateStr && rowFecha === incomingDateStr) {
          var rowProv = normalizarTexto(checkData[r][4]);
          var rowPunt = normalizarTexto(checkData[r][5]);

          var matchProv = (rowProv === normTargetProv || rowProv.indexOf(normTargetProv) !== -1 || normTargetProv.indexOf(rowProv) !== -1);
          var matchPunt = (rowPunt === normTargetPunto || rowPunt.indexOf(normTargetPunto) !== -1 || normTargetPunto.indexOf(rowPunt) !== -1);

          if (matchProv && matchPunt) {
            var rowKg = parseKilosNumero(checkData[r][7]);
            var rowProd = String(checkData[r][6] || '').toLowerCase();
            var esNovRow = (rowId.indexOf('NOV-') === 0 || rowProd.indexOf('visita fallida') !== -1 || rowProd.indexOf('novedad') !== -1);
            if (rowKg > 0 && !esNovRow) {
              throw new Error("No se puede cancelar el servicio: El vehículo ya arribó o ya existe una recolección registrada para este punto hoy");
            }
          }
        }
      }
    }
    
    // Determinar la última fila real con datos (basada en Columna B 'Fecha_Hora') para evitar saltos por filas vacías
    var targetRow = 1;
    var maxRows = Math.max(sheet.getLastRow(), 2);
    var colBValues = sheet.getRange(1, 2, maxRows, 1).getValues();
    for (var r = colBValues.length - 1; r >= 0; r--) {
      if (colBValues[r][0] !== "" && colBValues[r][0] !== null) {
        targetRow = r + 1;
        break;
      }
    }

    // 2. Optimización O(1): Cargar Tarifas una sola vez en memoria antes del bucle de productos
    var catalogoTarifas = cargarCatalogoTarifas(ss);
    var catalogoHistorico = null; // Carga perezosa si algún producto lo requiere

    var filasNuevas = [];
    var filasFactura = [];

    for (var p = 0; p < productos.length; p++) {
      var prodItem = productos[p];
      var prodNombre = '';
      if (typeof prodItem === 'object' && prodItem !== null) {
        prodNombre = String(prodItem.producto || '').trim();
      } else {
        prodNombre = String(prodItem || '').trim();
      }
      var rawKilos = (typeof prodItem === 'object' && prodItem.kilos !== undefined) ? prodItem.kilos : (data.totalKilos || 0);
      var prodKilos = parseKilosNumero(rawKilos);
      
      // Manejo especial de Novedad / Visita Fallida (0 Kg)
      var esNovedad = (data.tipo === 'Novedad' || String(id).startsWith('NOV-') || prodNombre.toLowerCase().indexOf('visita fallida') !== -1 || prodNombre.toLowerCase().indexOf('novedad') !== -1);
      if (esNovedad && !prodNombre) {
        prodNombre = 'Visita Fallida: ' + (data.causal || 'Novedad');
      }

      // Evitar registrar filas fantasmas vacías sin producto ni kilos
      if (!prodNombre && prodKilos === 0 && !esNovedad) {
        continue;
      }

      // Evitar duplicados por ID + Producto o ID de Novedad
      var prodKey = id + '|' + String(prodNombre).trim().toLowerCase();
      if (id && prodNombre && existingRecordsMap[prodKey]) {
        Logger.log("Registro duplicado omitido por ID + Producto: " + prodKey);
        continue;
      }
      if (esNovedad && id && existingIdsMap[id]) {
        Logger.log("Novedad duplicada omitida por ID: " + id);
        continue;
      }

      // Búsqueda inteligente en memoria (Tarifas primero, fallback a histórico si hace falta)
      var precio = '';
      var valor = '';
      if (esNovedad) {
        prodKilos = 0;
        precio = 0;
        valor = 0;
      } else {
        var pTarifa = buscarPrecioEnCatalogoTarifas(catalogoTarifas, proveedor, punto, prodNombre);
        if (pTarifa !== null && pTarifa > 0) {
          precio = pTarifa;
        } else {
          // Si no está en Tarifas, consultar histórico de Recolecciones (cargado a lo sumo 1 vez)
          if (!catalogoHistorico) {
            catalogoHistorico = cargarHistoricoRecolecciones(ss);
          }
          precio = buscarPrecioEnHistorico(catalogoHistorico, proveedor, punto, prodNombre);
        }
        if (precio !== '' && !isNaN(parseFloat(precio)) && prodKilos > 0) {
          valor = Math.round(parseFloat(precio) * prodKilos * 100) / 100;
        }
      }
      
      // Formato "Nombre Propio" automático (Title Case estilo =NOMPROPIO)
      var rutaFinal = homologarRuta(ruta);
      var conductorFinal = aNombrePropio(conductor);
      var proveedorFinal = aNombrePropio(homologarProveedor(proveedor));
      var puntoFinal = aNombrePropio(punto);
      var prodNombreFinal = aNombrePropio(prodNombre);
      var observacionesFinal = capitalizarOracion(observaciones);
      
      // Sanitización estricta contra inyección de fórmulas (=, +, -, @)
      filasNuevas.push([
        sanitizarParaHoja(id),
        sanitizarParaHoja(fecha),
        sanitizarParaHoja(rutaFinal),
        sanitizarParaHoja(conductorFinal),
        sanitizarParaHoja(proveedorFinal),
        sanitizarParaHoja(puntoFinal),
        sanitizarParaHoja(prodNombreFinal),
        prodKilos,
        sanitizarParaHoja(observacionesFinal),
        sanitizarParaHoja(ubicacionGps),
        precio,
        valor
      ]);
      filasFactura.push([
        sanitizarParaHoja(numeroFactura),
        (valorFactura !== '' && valorFactura > 0) ? valorFactura : '',
        sanitizarParaHoja(fotoFactura)
      ]);

      existingRecordsMap[prodKey] = true;
      existingIdsMap[id] = true;
    }

    // 3. Escritura atómica en lote (1 sola llamada setValues para A:L y 1 para O:Q sin tocar M:N)
    if (filasNuevas.length > 0) {
      // Blindaje de capacidad: asegurar que la hoja tenga suficientes renglones y columnas antes de escribir
      var maxFilasActuales = sheet.getMaxRows();
      var filaFinalRequerida = targetRow + filasNuevas.length;
      if (filaFinalRequerida > maxFilasActuales) {
        var filasFaltantes = filaFinalRequerida - maxFilasActuales;
        sheet.insertRowsAfter(maxFilasActuales, Math.max(filasFaltantes, 200));
      }
      // Garantizar que existan las columnas de Factura O, P, Q y que los duplicados estén corridos a la derecha
      garantizarEstructuraColumnasFactura(sheet);

      sheet.getRange(targetRow + 1, 1, filasNuevas.length, 12).setValues(filasNuevas);
      if (numeroFactura || (valorFactura !== '' && valorFactura > 0) || fotoFactura) {
        sheet.getRange(targetRow + 1, 15, filasFactura.length, 3).setValues(filasFactura);
      } else {
        var cleanEmpty = [];
        for (var cEmpty = 0; cEmpty < filasNuevas.length; cEmpty++) {
          cleanEmpty.push(['', '', '']);
        }
        sheet.getRange(targetRow + 1, 15, cleanEmpty.length, 3).setValues(cleanEmpty);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      "result": "success",
      "message": "Guardado exitosamente",
      "filas": filasNuevas.length
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    var errMsg = err.message || err.toString();
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": errMsg}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch(eRel) {}
    }
  }
}

// ==============================================================================
// GARANTIZAR ESTRUCTURA Y DESPLAZAMIENTO SEGURO DE COLUMNAS DE FACTURA (v1.8.8)
// Desplaza las columnas de auditoría/duplicados (antiguas P:U) 2 posiciones a la derecha
// y habilita las columnas O:Q para Numero_Factura, Valor_Factura, Foto_Factura
// ==============================================================================

function garantizarEstructuraColumnasFactura(sheet) {
  if (!sheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    sheet = ss.getSheetByName("Recolecciones");
  }
  if (!sheet) return { desplazado: false, razon: "No existe la hoja Recolecciones" };

  var maxCols = sheet.getMaxColumns();
  if (maxCols < 22) {
    sheet.insertColumnsAfter(maxCols, 22 - maxCols);
  }

  var hdrO = String(sheet.getRange(1, 15).getValue() || '').trim();
  var hdrP = String(sheet.getRange(1, 16).getValue() || '').trim();
  var hdrQ = String(sheet.getRange(1, 17).getValue() || '').trim();

  // Si ya están correctamente configuradas las 3 columnas
  if (hdrO === "Numero_Factura" && hdrP === "Valor_Factura" && hdrQ === "Foto_Factura") {
    return { desplazado: false, razon: "Columnas O:Q ya configuradas" };
  }

  // Verificar si en Columna 16 (P) o 15 (O) todavía residen los datos de duplicados
  var desplazado = false;
  var tieneDuplicadosEnP = (
    hdrP.toUpperCase().indexOf("DUPLICADO") !== -1 ||
    hdrO.toUpperCase().indexOf("DUPLICADO") !== -1 ||
    (hdrP !== "" && hdrP !== "Valor_Factura")
  );

  if (tieneDuplicadosEnP) {
    // Insertar 2 columnas después de la columna 15 (O).
    // Esto empuja todo el bloque de la antigua columna P hacia la columna R (desplazamiento seguro).
    sheet.insertColumnsAfter(15, 2);
    desplazado = true;
  }

  // Establecer encabezados limpios en O1:Q1
  var rangeHdr = sheet.getRange(1, 15, 1, 3);
  rangeHdr.setValues([["Numero_Factura", "Valor_Factura", "Foto_Factura"]]);
  rangeHdr.setBackground('#1e293b')
          .setFontColor('#ffffff')
          .setFontWeight('bold')
          .setHorizontalAlignment('center');

  // Formatear columna P (Valor_Factura) como moneda
  var lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 16, lastRow - 1, 1).setNumberFormat("$#,##0");

  return { desplazado: desplazado, razon: desplazado ? "Columnas P:U desplazadas exitosamente a R:W" : "Encabezados O:Q asegurados" };
}

function menuHabilitarColumnasFactura() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) {
      SpreadsheetApp.getUi().alert("Error: No se encontró la hoja Recolecciones.");
      return;
    }
    var res = garantizarEstructuraColumnasFactura(sheet);
    if (res.desplazado) {
      SpreadsheetApp.getUi().alert(
        "✅ Columnas Habilitadas con Éxito:\n\n" +
        "1. Se desplazaron las columnas de auditoría/duplicados 2 posiciones hacia la derecha (a partir de la columna R).\n" +
        "2. Se crearon los encabezados oficiales en las columnas O, P, Q:\n" +
        "   - Columna O: Numero_Factura\n" +
        "   - Columna P: Valor_Factura\n" +
        "   - Columna Q: Foto_Factura\n\n" +
        "Las recolecciones de Caribe y demás proveedores con factura física caerán ahora en estas columnas automáticamente."
      );
    } else {
      SpreadsheetApp.getUi().alert(
        "ℹ️ La estructura ya estaba configurada:\n\n" +
        "Las columnas O, P, Q ya corresponden a Numero_Factura, Valor_Factura y Foto_Factura."
      );
    }
  } catch(e) {
    SpreadsheetApp.getUi().alert("Error: " + e.toString());
  }
}

function habilitarColumnasFacturaHttp(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) throw new Error("No existe la hoja Recolecciones.");
    var res = garantizarEstructuraColumnasFactura(sheet);
    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      message: res.desplazado ? "Columnas desplazadas y encabezados O:Q configurados" : "Columnas O:Q ya estaban configuradas",
      detalle: res
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// ACTUALIZAR / CORREGIR RECOLECCIÓN EXISTENTE EN HOJA RECOLECCIONES (v1.4.4)
// ==============================================================================
function actualizarRecoleccionSheet(ss, rawPayload) {
  try {
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) throw new Error("No existe la pestaña Recolecciones.");
    
    var data = null;
    if (typeof rawPayload === 'string') {
      try { data = JSON.parse(rawPayload); } catch(e) { data = null; }
    } else {
      data = rawPayload;
    }
    if (!data || !data.id) throw new Error("Payload o ID inválido.");

    var idTarget = String(data.id).trim();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var idColData = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var rowsToDelete = [];
      for (var r = idColData.length - 1; r >= 0; r--) {
        var currentId = String(idColData[r][0] || '').trim();
        if (currentId === idTarget) {
          rowsToDelete.push(r + 2); // Índice base 1
        }
      }
      for (var d = 0; d < rowsToDelete.length; d++) {
        sheet.deleteRow(rowsToDelete[d]);
      }
    }

    // Re-insertar filas corregidas con cálculo de precio/valor automático
    return guardarRecoleccionSheet(ss, data);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// ELIMINAR RECOLECCIÓN POR ID (v1.4.9)
// ==============================================================================
function eliminarRecoleccionSheet(ss, idTarget) {
  try {
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) throw new Error("No existe la pestaña Recolecciones.");
    idTarget = String(idTarget || '').trim();
    if (!idTarget) throw new Error("ID inválido");

    // Validar formato seguro de ID contra inyecciones
    if (!/^(REC|NOV)-\d+(-[a-zA-Z0-9]+)?$/.test(idTarget)) {
      throw new Error("Formato de ID no válido para eliminación.");
    }

    var lastRow = sheet.getLastRow();
    var deletedCount = 0;
    if (lastRow > 1) {
      var idColData = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var r = idColData.length - 1; r >= 0; r--) {
        var currentId = String(idColData[r][0] || '').trim();
        if (currentId === idTarget) {
          sheet.deleteRow(r + 2);
          deletedCount++;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({"result": "success", "deleted": deletedCount}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// MOTOR INTELIGENTE DE TARIFA VIGENTE (HOJA TARIFAS + FALLBACK HISTÓRICO)
// ==============================================================================

// Carga del catálogo completo de Tarifas en memoria (1 sola lectura de Sheets por request)
function cargarCatalogoTarifas(ss) {
  var catalogo = [];
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTarifas = ss.getSheetByName("Tarifas");
    if (!sheetTarifas || sheetTarifas.getLastRow() <= 1) return catalogo;
    var lastRow = sheetTarifas.getLastRow();
    var lastCol = sheetTarifas.getLastColumn();
    var headers = sheetTarifas.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = { prov: 1, punto: 2, prod: 3, precio: 4, estado: 5 };
    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
      else if (h.indexOf('estado') !== -1) colIdx.estado = c;
    }
    var raw = sheetTarifas.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var i = 0; i < raw.length; i++) {
      var est = normalizarTexto(raw[i][colIdx.estado] || 'activo');
      if (est === 'inactivo') continue;
      var cleanP = parsePrecioMoneda(raw[i][colIdx.precio]);
      if (cleanP === null || cleanP <= 0) continue;
      catalogo.push({
        prov: normalizarTexto(raw[i][colIdx.prov]),
        punto: normalizarTexto(raw[i][colIdx.punto]),
        prod: normalizarTexto(raw[i][colIdx.prod]),
        precio: cleanP
      });
    }
  } catch(e) {
    Logger.log("Error cargando catalogo tarifas en memoria: " + e.toString());
  }
  return catalogo;
}

// Búsqueda en memoria de precio vigente en Tarifas con matching exacto de producto
function buscarPrecioEnCatalogoTarifas(catalogo, proveedor, punto, producto) {
  if (!catalogo || catalogo.length === 0) return null;
  var targetProv = normalizarTexto(proveedor);
  var targetPunto = normalizarTexto(punto);
  var targetProd = normalizarTexto(producto);

  var precioExactoPunto = null;
  var precioGeneralProv = null;
  var precioParcial = null;
  var provKeywords = targetProv.split(/[\s\-]+/).filter(function(w) { return w.length > 3; });

  for (var i = 0; i < catalogo.length; i++) {
    var row = catalogo[i];
    // ¡REGLA CRÍTICA!: El producto debe coincidir de forma exacta (o singular/plural idéntico)
    if (!productosCoinciden(row.prod, targetProd)) continue;

    // Nivel 1: Proveedor exacto + Punto exacto
    if (row.prov === targetProv && targetPunto !== '' && (row.punto === targetPunto || row.punto.indexOf(targetPunto) !== -1)) {
      precioExactoPunto = row.precio;
      break;
    }

    // Nivel 2: Proveedor exacto + Todas las sucursales (o general)
    if (row.prov === targetProv && (row.punto === '' || row.punto.indexOf('todas') !== -1 || row.punto.indexOf('general') !== -1)) {
      if (precioGeneralProv === null) precioGeneralProv = row.precio;
    }

    // Nivel 3: Coincidencia parcial de proveedor
    if (precioParcial === null) {
      if (targetProv.indexOf(row.prov) !== -1 || row.prov.indexOf(targetProv) !== -1) {
        precioParcial = row.precio;
      } else {
        for (var k = 0; k < provKeywords.length; k++) {
          if (row.prov.indexOf(provKeywords[k]) !== -1) {
            precioParcial = row.precio;
            break;
          }
        }
      }
    }
  }

  if (precioExactoPunto !== null) return precioExactoPunto;
  if (precioGeneralProv !== null) return precioGeneralProv;
  if (precioParcial !== null) return precioParcial;

  // Respaldo histórico específico para comercios de Ruta 1 (Santa Elena / Cavasa)
  var esProvSE = (targetProv.indexOf('santa elena') !== -1 || targetProv.indexOf('garay') !== -1 || targetPunto.indexOf('santa elena') !== -1);
  if (esProvSE) {
    for (var seI = 0; seI < catalogo.length; seI++) {
      if (catalogo[seI].prov === 'santa elena' && productosCoinciden(catalogo[seI].prod, targetProd)) {
        return catalogo[seI].precio;
      }
    }
  }

  var esPtoCV = (targetPunto.indexOf('cavasa') !== -1 || targetProv.indexOf('cavasa') !== -1);
  if (esPtoCV) {
    for (var cvI = 0; cvI < catalogo.length; cvI++) {
      if (catalogo[cvI].prov === 'cavasa' && productosCoinciden(catalogo[cvI].prod, targetProd)) {
        return catalogo[cvI].precio;
      }
    }
  }

  return null;
}

// Carga perezosa del histórico de Recolecciones en memoria (a lo sumo 1 lectura si se requiere fallback)
function cargarHistoricoRecolecciones(ss) {
  var hist = [];
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetRec = ss.getSheetByName("Recolecciones");
    if (!sheetRec || sheetRec.getLastRow() <= 1) return hist;
    var lastRow = sheetRec.getLastRow();
    var lastCol = sheetRec.getLastColumn();
    var headers = sheetRec.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = { prov: 4, punto: 5, prod: 6, precio: 10 };
    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1 || h.indexOf('unitario') !== -1) colIdx.precio = c;
    }
    var raw = sheetRec.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var r = raw.length - 1; r >= 0; r--) {
      var p = parsePrecioMoneda(raw[r][colIdx.precio]);
      if (p !== null && p > 0) {
        hist.push({
          prov: normalizarTexto(raw[r][colIdx.prov]),
          punto: normalizarTexto(raw[r][colIdx.punto]),
          prod: normalizarTexto(raw[r][colIdx.prod]),
          precio: p
        });
      }
    }
  } catch(e) {
    Logger.log("Error cargando historico recolecciones en memoria: " + e.toString());
  }
  return hist;
}

// Búsqueda en memoria de precio histórico en Recolecciones (FALLBACK SEGURO Y EXACTO)
function buscarPrecioEnHistorico(historico, proveedor, punto, producto) {
  if (!historico || historico.length === 0) return '';
  var targetProv = normalizarTexto(proveedor);
  var targetPunto = normalizarTexto(punto);
  var targetProd = normalizarTexto(producto);

  var precioExacto = null;
  var precioParcial = null;
  var precioPunto = null;
  var provKeywords = targetProv.split(/[\s\-]+/).filter(function(w) { return w.length > 3; });

  for (var i = 0; i < historico.length; i++) {
    var row = historico[i];
    // ¡REGLA CRÍTICA!: El producto debe coincidir de forma exacta (o singular/plural idéntico)
    if (!productosCoinciden(row.prod, targetProd)) continue;

    // Nivel 1: Coincidencia EXACTA Proveedor + Producto
    if (row.prov === targetProv) {
      precioExacto = row.precio;
      break;
    }

    // Nivel 2: Coincidencia Parcial de Proveedor
    if (precioParcial === null) {
      if (targetProv.indexOf(row.prov) !== -1 || row.prov.indexOf(targetProv) !== -1) {
        precioParcial = row.precio;
      } else {
        for (var k = 0; k < provKeywords.length; k++) {
          if (row.prov.indexOf(provKeywords[k]) !== -1) {
            precioParcial = row.precio;
            break;
          }
        }
      }
    }

    // Nivel 3: Coincidencia por Punto / Sucursal
    if (precioPunto === null && targetPunto !== '') {
      if (row.punto === targetPunto || targetPunto.indexOf(row.punto) !== -1 || row.punto.indexOf(targetPunto) !== -1) {
        precioPunto = row.precio;
      }
    }
  }

  if (precioExacto !== null) return precioExacto;
  if (precioParcial !== null) return precioParcial;
  if (precioPunto !== null) return precioPunto;

  // ¡ELIMINADO FALLBACK GENÉRICO precioCualquiera!: Si no existe tarifa configurada ni histórico
  // legítimo para este proveedor/punto, dejar en blanco para auditoría y evitar distorsión contable.
  return '';
}

// Función fachada para compatibilidad total con llamadas existentes
function obtenerPrecioTarifa(ss, proveedor, punto, producto) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var catalogo = cargarCatalogoTarifas(ss);
    var pTarifa = buscarPrecioEnCatalogoTarifas(catalogo, proveedor, punto, producto);
    if (pTarifa !== null && pTarifa > 0) return pTarifa;

    var hist = cargarHistoricoRecolecciones(ss);
    return buscarPrecioEnHistorico(hist, proveedor, punto, producto);
  } catch(e) {
    return '';
  }
}

function buscarPrecioHistorico(sheet, proveedor, punto, producto) {
  try {
    var ss = sheet && sheet.getParent ? sheet.getParent() : SpreadsheetApp.getActiveSpreadsheet();
    var hist = cargarHistoricoRecolecciones(ss);
    return buscarPrecioEnHistorico(hist, proveedor, punto, producto);
  } catch(e) {
    return '';
  }
}

// Normalización de texto: quita tildes, minúsculas, espacios extra y normaliza guiones
function normalizarTexto(str) {
  if (!str) return '';
  var s = String(str).trim().toLowerCase();
  // Quitar tildes y diacríticos (ej. Cañaveral -> canaveral, Tuluá -> tulua)
  try {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {}
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*-\s*/g, '-');
  return s;
}

// Normaliza cualquier representación de fecha a formato ISO YYYY-MM-DD para comparaciones seguras de día
function normalizarFechaDia(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = ('0' + (val.getMonth() + 1)).slice(-2);
    var d = ('0' + val.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  var str = String(val).trim().split(' ')[0] || '';
  if (str.indexOf('/') !== -1) {
    var p = str.split('/');
    if (p.length === 3) {
      if (p[0].length === 4) {
        return p[0] + '-' + ('0' + parseInt(p[1], 10)).slice(-2) + '-' + ('0' + parseInt(p[2], 10)).slice(-2);
      }
      return p[2] + '-' + ('0' + parseInt(p[1], 10)).slice(-2) + '-' + ('0' + parseInt(p[0], 10)).slice(-2);
    }
  } else if (str.indexOf('-') !== -1) {
    var p = str.split('-');
    if (p.length === 3) {
      if (p[0].length === 4) {
        return p[0] + '-' + ('0' + parseInt(p[1], 10)).slice(-2) + '-' + ('0' + parseInt(p[2], 10)).slice(-2);
      }
      return p[2] + '-' + ('0' + parseInt(p[1], 10)).slice(-2) + '-' + ('0' + parseInt(p[0], 10)).slice(-2);
    }
  }
  return '';
}

// Parser de precios adaptado al formato colombiano (punto o coma como miles, símbolo $)
function parsePrecioMoneda(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return val > 0 ? val : null;
  }
  var s = String(val).trim().replace(/\$/g, '').replace(/\s+/g, '');
  if (!s) return null;

  // Formato con punto y coma (ej. 1.800,50 o 1,800.50)
  if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // Latino: 1.800,50 -> 1800.50
    } else {
      s = s.replace(/,/g, ''); // Anglo: 1,800.50 -> 1800.50
    }
  } else if (s.indexOf('.') !== -1) {
    var partsDot = s.split('.');
    if (partsDot.length === 2 && partsDot[1].length === 3 && parseInt(partsDot[0], 10) > 0) {
      s = partsDot[0] + partsDot[1]; // Miles en Colombia: 1.800 -> 1800
    } else if (partsDot.length > 2) {
      s = partsDot.join(''); // Múltiples puntos: 1.200.000 -> 1200000
    }
  } else if (s.indexOf(',') !== -1) {
    var partsComma = s.split(',');
    if (partsComma.length === 2 && partsComma[1].length === 3) {
      s = partsComma[0] + partsComma[1]; // Miles con coma: 1,800 -> 1800
    } else {
      s = partsComma[0] + '.' + partsComma[1]; // Decimal con coma: 1800,5 -> 1800.5
    }
  }

  var num = parseFloat(s);
  return (!isNaN(num) && num > 0) ? num : null;
}

// Parser numérico estricto para kilos (garantiza que siempre sea Number y nunca String con riesgo de auto-conversión a fecha)
function parseKilosNumero(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  }
  var s = String(val).trim();
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  var num = parseFloat(s);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

// ==============================================================================
// FUNCIONES DE FORMATO DE TEXTO (NOMBRE PROPIO / CAPITALIZACIÓN)
// ==============================================================================

// ==============================================================================
// HOMOLOGACIÓN ESTÁNDAR DE RUTAS (v1.5.6)
// ==============================================================================
function homologarRuta(texto) {
  if (!texto) return 'Sin Ruta Asignada';
  var s = String(texto).trim();
  var clean = normalizarTexto(s);
  
  if (clean.indexOf('RUTA 1') !== -1 || clean.indexOf('SANTA ELENA') !== -1 || clean.indexOf('CAVASA') !== -1) {
    return 'RUTA 1: Santa Elena / Cavasa';
  }
  if (clean.indexOf('RUTA 2') !== -1 || clean.indexOf('CALI') !== -1) {
    if (clean.indexOf('SUR') !== -1 && clean.indexOf('ORIENTE') !== -1 && clean.indexOf('NORTE') === -1) {
      return 'RUTA 2: Cali Sur / Oriente/ Juanchito)';
    }
    return 'RUTA 2: Cali (Norte / Sur / Oriente juanchito)';
  }
  if (clean.indexOf('RUTA 3') !== -1 || clean.indexOf('PUERTO TEJADA') !== -1 || clean.indexOf('JAMUNDI') !== -1) {
    return 'RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance';
  }
  if (clean.indexOf('RUTA 4') !== -1 || clean.indexOf('BUGA') !== -1 || clean.indexOf('TULUA') !== -1) {
    return 'RUTA 4: Buga / Roldanillo / Zarzal / Tuluá';
  }
  if (clean.indexOf('RUTA 5') !== -1 || clean.indexOf('PALMIRA') !== -1 || clean.indexOf('VILLAGORGONA') !== -1) {
    return 'RUTA 5: Palmira / Villagorgona / Carmelo';
  }
  if (clean.indexOf('RUTA 7') !== -1 || clean.indexOf('BELALCAZAR') !== -1) {
    return 'RUTA 7: Yumbo/Belalcazar';
  }
  if (clean.indexOf('PLANTA') !== -1 || clean.indexOf('SAN JOAQUIN') !== -1) {
    return 'PLANTA SAN JOAQUIN';
  }
  if (clean.indexOf('RUTA 6') !== -1 || clean.indexOf('ORIENTE/SUR') !== -1 || clean.indexOf('OLIMPICA') !== -1 || clean.indexOf('RUTA DEL SUR') !== -1 || clean.indexOf('RUTA SUR') !== -1) {
    return 'RUTA 6: Oriente/Sur';
  }
  if (clean.indexOf('BUENAVENTURA') !== -1) {
    return 'Buenaventura';
  }
  return s;
}

// Homologar masivamente todas las rutas de la hoja 'Recolecciones' y corregir pesos anómalos
function homologarRutasYLimpiarSheet(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet || sheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ result: "info", message: "Hoja vacía o no encontrada" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    var values = range.getValues();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    var colIdx = { ruta: 2, kg: 7, prod: 6 };
    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('ruta') !== -1) colIdx.ruta = c;
      else if (h.indexOf('kg') !== -1 || h.indexOf('kilo') !== -1) colIdx.kg = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
    }
    
    var updatedRutas = 0;
    var correctedKilos = 0;
    
    for (var i = 0; i < values.length; i++) {
      // 1. Homologar Ruta
      if (colIdx.ruta !== -1 && values[i][colIdx.ruta]) {
        var rutaOriginal = String(values[i][colIdx.ruta]).trim();
        var rutaHomologada = homologarRuta(rutaOriginal);
        if (rutaOriginal !== rutaHomologada) {
          values[i][colIdx.ruta] = rutaHomologada;
          updatedRutas++;
        }
      }
      
      // 2. Corregir Kilos anómalos (> 50.000 kg por error de decimal o concatenación)
      if (colIdx.kg !== -1 && values[i][colIdx.kg]) {
        var rawKg = values[i][colIdx.kg];
        var numKg = typeof rawKg === 'number' ? rawKg : parseFloat(String(rawKg).replace(/\./g, '').replace(',', '.'));
        if (!isNaN(numKg) && numKg > 50000) {
          if (numKg > 1000000000) {
            // Ejemplo 6110999999999990 -> 611.1
            values[i][colIdx.kg] = Math.round((numKg / 10000000000000) * 100) / 100;
            correctedKilos++;
          } else if (numKg > 100000) {
            // Ejemplo 2918622 -> 2918.62
            values[i][colIdx.kg] = Math.round((numKg / 1000) * 100) / 100;
            correctedKilos++;
          }
        }
      }
    }
    
    range.setValues(values);
    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      totalFilas: lastRow - 1,
      rutasHomologadas: updatedRutas,
      kilosCorregidos: correctedKilos
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Convierte texto a formato "Nombre Propio" (Title Case estilo =NOMPROPIO() de Excel)
// Soportando caracteres con tildes, eñes y delimitadores comunes (-, /, (, ), etc.)
function aNombrePropio(texto) {
  if (!texto) return '';
  var s = String(texto).trim().toLowerCase();
  if (!s) return '';
  
  return s.replace(/(?:^|[\s\-\/\(\)\.,;:])([a-záéíóúüñ])/g, function(match) {
    return match.toUpperCase();
  });
}

// Capitaliza solo la primera letra para texto libre u observaciones (Formato Oración)
function capitalizarOracion(texto) {
  if (!texto) return '';
  var s = String(texto).trim();
  if (!s) return '';
  // Si todo viene en mayúsculas sostenidas, pasarlo a minúsculas primero
  if (s === s.toUpperCase()) {
    s = s.toLowerCase();
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Función utilitaria opcional: Ejecutable desde Apps Script para convertir
// todas las filas históricas anteriores de la hoja "Recolecciones" a Nombre Propio
function convertirHistoricoANombrePropio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Recolecciones");
  if (!sheet || sheet.getLastRow() <= 1) return "Hoja vacía o no encontrada";
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var values = range.getValues();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  var colIdx = { ruta: -1, conductor: -1, proveedor: -1, punto: -1, producto: -1, obs: -1 };
  for (var c = 0; c < headers.length; c++) {
    var h = normalizarTexto(headers[c]);
    if (h.indexOf('ruta') !== -1) colIdx.ruta = c;
    else if (h.indexOf('conductor') !== -1) colIdx.conductor = c;
    else if (h.indexOf('proveedor') !== -1) colIdx.proveedor = c;
    else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
    else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.producto = c;
    else if (h.indexOf('observacion') !== -1) colIdx.obs = c;
  }
  
  for (var i = 0; i < values.length; i++) {
    if (colIdx.ruta !== -1 && values[i][colIdx.ruta]) values[i][colIdx.ruta] = aNombrePropio(values[i][colIdx.ruta]);
    if (colIdx.conductor !== -1 && values[i][colIdx.conductor]) values[i][colIdx.conductor] = aNombrePropio(values[i][colIdx.conductor]);
    if (colIdx.proveedor !== -1 && values[i][colIdx.proveedor]) values[i][colIdx.proveedor] = aNombrePropio(values[i][colIdx.proveedor]);
    if (colIdx.punto !== -1 && values[i][colIdx.punto]) values[i][colIdx.punto] = aNombrePropio(values[i][colIdx.punto]);
    if (colIdx.producto !== -1 && values[i][colIdx.producto]) values[i][colIdx.producto] = aNombrePropio(values[i][colIdx.producto]);
    if (colIdx.obs !== -1 && values[i][colIdx.obs]) values[i][colIdx.obs] = capitalizarOracion(values[i][colIdx.obs]);
  }
  
  range.setValues(values);
  return "Se actualizaron " + (lastRow - 1) + " filas históricas a formato Nombre Propio exitosamente.";
}

// Función de diagnóstico en vivo para consultar estado de Recolecciones y Precios vía GET
function diagnosticoPreciosSheet(ss, testProv, testProd) {
  var sheet = ss.getSheetByName("Recolecciones");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: "No existe hoja Recolecciones" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  var startRow = Math.max(2, lastRow - 9);
  var numRows = lastRow - startRow + 1;
  var sampleRows = [];
  if (numRows > 0) {
    sampleRows = sheet.getRange(startRow, 1, numRows, lastCol).getValues();
  }
  
  var provsEnRecolecciones = {};
  if (lastRow > 1) {
    var allProvs = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
    for (var i = 0; i < allProvs.length; i++) {
      var p = String(allProvs[i][0] || '').trim();
      if (p) provsEnRecolecciones[p] = (provsEnRecolecciones[p] || 0) + 1;
    }
  }

  var queryProv = testProv || 'Supertienda Cañaveral - Frigorivalle';
  var queryProd = testProd || 'DESPERDICIO';
  var testResult = buscarPrecioHistorico(sheet, queryProv, '', queryProd);

  return ContentService.createTextOutput(JSON.stringify({
    version: "1.4.0-precio-fix",
    totalFilasRecolecciones: lastRow,
    encabezados: headers,
    proveedoresEnRecolecciones: Object.keys(provsEnRecolecciones),
    ultimasFilas: sampleRows,
    testBusqueda: {
      proveedorConsultado: queryProv,
      productoConsultado: queryProd,
      precioEncontrado: testResult
    }
  }, null, 2)).setMimeType(ContentService.MimeType.JSON);
}

// ==============================================================================
// CORRECCIÓN AUTOMÁTICA DE FILAS CORROMPIDAS POR FECHAS (46.xxx -> Kilos Reales)
// ==============================================================================
function corregirKilosFechasSheet(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) throw new Error("No existe la pestaña Recolecciones");

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow <= 1) {
      Logger.log("Hoja vacía");
      return ContentService.createTextOutput(JSON.stringify({ result: "info", message: "Hoja vacía" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = { id: 0, prod: 6, kg: 7, precio: 10, valor: 11 };
    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('id') !== -1) colIdx.id = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('kg') !== -1 || h.indexOf('kilo') !== -1) colIdx.kg = c;
      else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
      else if (h.indexOf('valor') !== -1 || h.indexOf('total') !== -1) colIdx.valor = c;
    }

    var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    var values = range.getValues();
    var corregidos = [];

    for (var i = 0; i < values.length; i++) {
      var cellVal = values[i][colIdx.kg];
      var recoveredKg = null;

      // Caso 1: Objeto Date nativo de Google Sheets
      if (cellVal instanceof Date) {
        var day = cellVal.getDate();
        var month = cellVal.getMonth() + 1;
        recoveredKg = parseFloat(day + '.' + month);
      }
      // Caso 2: Número de serie de fecha (rango 45000 a 48000 correspondientes a años 2023-2027)
      else if (typeof cellVal === 'number' && cellVal >= 45000 && cellVal <= 48000) {
        var d = new Date(1899, 11, 30 + Math.round(cellVal));
        var day = d.getDate();
        var month = d.getMonth() + 1;
        recoveredKg = parseFloat(day + '.' + month);
      }
      // Caso 3: String formateado como "46.081,00"
      else if (typeof cellVal === 'string') {
        var cleanStr = cellVal.replace(/\./g, '').replace(',', '.').trim();
        var num = parseFloat(cleanStr);
        if (!isNaN(num) && num >= 45000 && num <= 48000) {
          var d = new Date(1899, 11, 30 + Math.round(num));
          var day = d.getDate();
          var month = d.getMonth() + 1;
          recoveredKg = parseFloat(day + '.' + month);
        }
      }

      if (recoveredKg !== null && recoveredKg > 0) {
        var oldVal = values[i][colIdx.kg];
        values[i][colIdx.kg] = recoveredKg;

        // Recalcular Valor si existe Precio
        var rawPrecio = values[i][colIdx.precio];
        var precio = parsePrecioMoneda(rawPrecio);
        if (precio !== null && precio > 0) {
          values[i][colIdx.valor] = Math.round(precio * recoveredKg * 100) / 100;
        }

        corregidos.push({
          fila: i + 2,
          id: values[i][colIdx.id],
          producto: values[i][colIdx.prod],
          valorAnterior: oldVal,
          kilosCorregidos: recoveredKg,
          nuevoValor: values[i][colIdx.valor]
        });
      }
    }

    if (corregidos.length > 0) {
      range.setValues(values);
    }

    Logger.log("✅ Se corrigieron " + corregidos.length + " filas afectadas por fechas en Recolecciones.");

    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      totalAnalizadas: values.length,
      totalCorregidas: corregidos.length,
      corregidos: corregidos
    }, null, 2)).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// LIQUIDADOR DE RECOLECCIONES PENDIENTES (PRECIO DESDE TARIFAS + VALOR = KG * PRECIO)
// ==============================================================================
function liquidarRecoleccionesPendientes(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetRec = ss.getSheetByName("Recolecciones");
    if (!sheetRec) throw new Error("No existe la pestaña Recolecciones");

    var sheetTarifas = ss.getSheetByName("Tarifas");
    var mapExacto = {};
    var mapPuntoProd = {};
    var mapProvProd = {};

    // 1. Cargar catálogo de Tarifas vigentes
    if (sheetTarifas && sheetTarifas.getLastRow() > 1) {
      var lastRowT = sheetTarifas.getLastRow();
      var lastColT = sheetTarifas.getLastColumn();
      var dataT = sheetTarifas.getRange(2, 1, lastRowT - 1, lastColT).getValues();

      for (var t = 0; t < dataT.length; t++) {
        var tProv = normalizarTexto(dataT[t][1]);
        var tPunto = normalizarTexto(dataT[t][2]);
        var tProd = normalizarTexto(dataT[t][3]);
        var tPrecio = parsePrecioMoneda(dataT[t][4]);
        var tEstado = normalizarTexto(dataT[t][5]);

        if (tPrecio !== null && tPrecio > 0 && tEstado !== 'inactivo') {
          if (tProv && tPunto && tProd) mapExacto[tProv + '|' + tPunto + '|' + tProd] = tPrecio;
          if (tPunto && tProd) mapPuntoProd[tPunto + '|' + tProd] = tPrecio;
          if (tProv && tProd) mapProvProd[tProv + '|' + tProd] = tPrecio;
        }
      }
    }

    var lastRow = sheetRec.getLastRow();
    var lastCol = sheetRec.getLastColumn();
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ result: "info", message: "Hoja Recolecciones vacía" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = sheetRec.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = { id: 0, prov: 4, punto: 5, prod: 6, kg: 7, precio: 10, valor: 11 };
    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('id') !== -1) colIdx.id = c;
      else if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('kg') !== -1 || h.indexOf('kilo') !== -1) colIdx.kg = c;
      else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
      else if (h.indexOf('valor') !== -1 || h.indexOf('total') !== -1) colIdx.valor = c;
    }

    // 2. Cargar histórico interno de Recolecciones para fallback inteligente
    var histPuntoProd = {};
    var histProvProd = {};
    var range = sheetRec.getRange(2, 1, lastRow - 1, lastCol);
    var values = range.getValues();

    for (var h = 0; h < values.length; h++) {
      var exPrecio = parsePrecioMoneda(values[h][colIdx.precio]);
      if (exPrecio !== null && exPrecio > 0) {
        var exProv = normalizarTexto(values[h][colIdx.prov]);
        var exPunto = normalizarTexto(values[h][colIdx.punto]);
        var exProd = normalizarTexto(values[h][colIdx.prod]);
        if (exPunto && exProd && !histPuntoProd[exPunto + '|' + exProd]) histPuntoProd[exPunto + '|' + exProd] = exPrecio;
        if (exProv && exProd && !histProvProd[exProv + '|' + exProd]) histProvProd[exProv + '|' + exProd] = exPrecio;
      }
    }

    // 3. Procesar filas que tengan Precio vacío o 0
    var actualizadas = [];
    var sinTarifa = [];

    for (var i = 0; i < values.length; i++) {
      var currPrecio = parsePrecioMoneda(values[i][colIdx.precio]);
      // Si ya tiene precio válido, RESPETAR 100% Y NO TOCAR
      if (currPrecio !== null && currPrecio > 0) continue;

      var rowProv = normalizarTexto(values[i][colIdx.prov]);
      var rowPunto = normalizarTexto(values[i][colIdx.punto]);
      var rowProd = normalizarTexto(values[i][colIdx.prod]);
      var rowKg = parseKilosNumero(values[i][colIdx.kg]);

      if (!rowProd) continue;

      // Cascada de búsqueda de precio:
      // 1. Tarifas (Prov + Punto + Prod)
      // 2. Tarifas (Punto + Prod)
      // 3. Tarifas (Prov + Prod)
      // 4. Histórico Recolecciones (Punto + Prod)
      // 5. Histórico Recolecciones (Prov + Prod)
      var foundPrecio = null;
      var origenTarifa = '';

      if (rowProv && rowPunto && mapExacto[rowProv + '|' + rowPunto + '|' + rowProd]) {
        foundPrecio = mapExacto[rowProv + '|' + rowPunto + '|' + rowProd];
        origenTarifa = 'Tarifas (Exacta)';
      } else if (rowPunto && mapPuntoProd[rowPunto + '|' + rowProd]) {
        foundPrecio = mapPuntoProd[rowPunto + '|' + rowProd];
        origenTarifa = 'Tarifas (Punto)';
      } else if (rowProv && mapProvProd[rowProv + '|' + rowProd]) {
        foundPrecio = mapProvProd[rowProv + '|' + rowProd];
        origenTarifa = 'Tarifas (Proveedor)';
      } else if (rowPunto && histPuntoProd[rowPunto + '|' + rowProd]) {
        foundPrecio = histPuntoProd[rowPunto + '|' + rowProd];
        origenTarifa = 'Histórico Recolecciones (Punto)';
      } else if (rowProv && histProvProd[rowProv + '|' + rowProd]) {
        foundPrecio = histProvProd[rowProv + '|' + rowProd];
        origenTarifa = 'Histórico Recolecciones (Proveedor)';
      }

      if (foundPrecio !== null && foundPrecio > 0) {
        var nuevoValor = Math.round(foundPrecio * rowKg * 100) / 100;
        values[i][colIdx.precio] = foundPrecio;
        values[i][colIdx.valor] = nuevoValor;

        actualizadas.push({
          fila: i + 2,
          id: values[i][colIdx.id],
          proveedor: values[i][colIdx.prov],
          punto: values[i][colIdx.punto],
          producto: values[i][colIdx.prod],
          kilos: rowKg,
          precioAsignado: foundPrecio,
          valorCalculado: nuevoValor,
          fuente: origenTarifa
        });
      } else {
        sinTarifa.push({
          fila: i + 2,
          proveedor: values[i][colIdx.prov],
          punto: values[i][colIdx.punto],
          producto: values[i][colIdx.prod],
          kilos: rowKg
        });
      }
    }

    // 4. Escribir cambios a la hoja
    if (actualizadas.length > 0) {
      range.setValues(values);
    }

    Logger.log("✅ Se liquidaron con éxito " + actualizadas.length + " recolecciones pendientes.");

    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      totalFilas: values.length,
      totalLiquidadas: actualizadas.length,
      totalPendientesSinTarifa: sinTarifa.length,
      muestraLiquidadas: actualizadas.slice(0, 15),
      pendientesSinTarifa: sinTarifa.slice(0, 10)
    }, null, 2)).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("Error liquidando recolecciones: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Función para calcular peso/orden de ruta: Ruta 1 a 6 primero, y PLANTA siempre de último
function obtenerPesoRuta(nombreRuta) {
  if (!nombreRuta) return 999;
  var r = normalizarTexto(nombreRuta);
  if (r.indexOf("ruta 1") !== -1) return 1;
  if (r.indexOf("ruta 2") !== -1) return 2;
  if (r.indexOf("ruta 3") !== -1) return 3;
  if (r.indexOf("ruta 4") !== -1) return 4;
  if (r.indexOf("ruta 5") !== -1) return 5;
  if (r.indexOf("ruta 6") !== -1) return 6;
  if (r.indexOf("ruta 7") !== -1) return 7;
  if (r.indexOf("planta") !== -1) return 900; // Siempre al final
  return 500;
}

// ==============================================================================
// RESTAURADOR DE ENCABEZADOS DE PUNTOS_RUTAS (9 COLUMNAS OFICIALES)
// ==============================================================================
function restaurarEncabezadosPuntosRutas(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Asegurar PLANTA SAN JOAQUIN en pestaña Rutas
  var sheetRutas = ss.getSheetByName("Rutas");
  if (sheetRutas) {
    var lastRowR = sheetRutas.getLastRow();
    var rutasExistentes = [];
    if (lastRowR > 1) {
      rutasExistentes = sheetRutas.getRange(2, 1, lastRowR - 1, 1).getValues().map(function(r) { return normalizarTexto(r[0]); });
    }
    if (rutasExistentes.indexOf("planta san joaquin") === -1) {
      sheetRutas.appendRow(["PLANTA SAN JOAQUIN", "Activo"]);
    }
  }

  // 2. Asegurar encabezados oficiales en Puntos_Rutas
  var sheetPuntos = ss.getSheetByName("Puntos_Rutas");
  if (!sheetPuntos) sheetPuntos = ss.insertSheet("Puntos_Rutas");

  var headersOficiales = [
    "Ruta", "Proveedor", "Punto_Sucursal", "Direccion", 
    "Telefono", "Horario_Estimado", "Frecuencia_Dias", "Estado", "Materias_Frecuentes"
  ];
  sheetPuntos.getRange(1, 1, 1, headersOficiales.length).setValues([headersOficiales]);
  sheetPuntos.getRange(1, 1, 1, headersOficiales.length)
    .setFontWeight("bold")
    .setBackground("#1b4d3e")
    .setFontColor("#ffffff");

  // 3. Verificar y restaurar puntos de PLANTA SAN JOAQUIN si faltan
  var plantaRecords = [["PLANTA SAN JOAQUIN","HEBER GAMBOA","HEBER GAMBOA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MILSON GONSALEZ","MILSON GONSALEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MIRIAM CUARAN","MIRIAM CUARAN","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","CARLOS CAICEDO","CARLOS CAICEDO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","FREDDY FERNANDEZ","FREDDY FERNANDEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","CARLOS MARTINEZ","CARLOS MARTINEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","CRHISTIAN CEDEÑO","CRHISTIAN CEDEÑO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","GILDARDO TEJADA","GILDARDO TEJADA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MIGUEL ANGEL OTERO","MIGUEL ANGEL OTERO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MARIA ELSI ALEGRIA","MARIA ELSI ALEGRIA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","WILMER BUSTAMANTE","WILMER BUSTAMANTE","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","JAIRO MOSQUERA","JAIRO MOSQUERA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MARTIN PEREZ","MARTIN PEREZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","OSCAR LARA","OSCAR LARA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","JULIAN LUNA","JULIAN LUNA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","DIEGO BUITRAGO","DIEGO BUITRAGO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","FREDDY HERNANDEZ","FREDDY HERNANDEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","BARBARA GOMEZ","BARBARA GOMEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","HERNANDO HIDALGO","HERNANDO HIDALGO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","GRAXPRO","GRAXPRO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","AUGUSTO MUÑOZ","AUGUSTO MUÑOZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","FABIAN LOPEZ","FABIAN LOPEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"]];
  var lastRowP = sheetPuntos.getLastRow();
  var puntosExistentes = {};
  if (lastRowP > 1) {
    var dataExistente = sheetPuntos.getRange(2, 1, lastRowP - 1, 3).getValues();
    for (var k = 0; k < dataExistente.length; k++) {
      var key = (dataExistente[k][0] + "|" + dataExistente[k][1] + "|" + dataExistente[k][2]).toLowerCase();
      puntosExistentes[key] = true;
    }
  }

  var aInsertar = [];
  for (var p = 0; p < plantaRecords.length; p++) {
    var checkKey = (plantaRecords[p][0] + "|" + plantaRecords[p][1] + "|" + plantaRecords[p][2]).toLowerCase();
    if (!puntosExistentes[checkKey]) {
      aInsertar.push(plantaRecords[p]);
    }
  }

  if (aInsertar.length > 0) {
    sheetPuntos.getRange(sheetPuntos.getLastRow() + 1, 1, aInsertar.length, 8).setValues(aInsertar);
    Logger.log("✅ Se restauraron " + aInsertar.length + " puntos de PLANTA SAN JOAQUIN en Puntos_Rutas.");
  }

  // 4. Ordenar Puntos_Rutas: Ruta 1..6 primero y PLANTA siempre al final
  var totalRowsP = sheetPuntos.getLastRow();
  var totalColsP = Math.max(9, sheetPuntos.getLastColumn());
  if (totalRowsP > 2) {
    var rangeDataP = sheetPuntos.getRange(2, 1, totalRowsP - 1, totalColsP);
    var allRowsP = rangeDataP.getValues();
    allRowsP.sort(function(a, b) {
      var wA = obtenerPesoRuta(a[0]);
      var wB = obtenerPesoRuta(b[0]);
      if (wA !== wB) return wA - wB;
      var cProv = String(a[1] || "").localeCompare(String(b[1] || ""), "es");
      if (cProv !== 0) return cProv;
      return String(a[2] || "").localeCompare(String(b[2] || ""), "es");
    });
    rangeDataP.setValues(allRowsP);
  }

  // 5. Ordenar pestaña Rutas: Ruta 1..6 y PLANTA de último
  if (sheetRutas && sheetRutas.getLastRow() > 2) {
    var rRange = sheetRutas.getRange(2, 1, sheetRutas.getLastRow() - 1, 2);
    var rRows = rRange.getValues();
    rRows.sort(function(a, b) {
      return obtenerPesoRuta(a[0]) - obtenerPesoRuta(b[0]);
    });
    rRange.setValues(rRows);
  }

  Logger.log("✅ Encabezados, Rutas y Planta San Joaquín (al final) organizados y restaurados exitosamente.");
  return "Organizado por Rutas (Planta de último) y restaurado con éxito (" + aInsertar.length + " puntos agregados). Total puntos: " + (sheetPuntos.getLastRow() - 1);
}

function restaurarPlantaSanJoaquin(ss) {
  return restaurarEncabezadosPuntosRutas(ss);
}

function restaurarEncabezadosPuntosRutasHttp(ss) {
  try {
    var msg = restaurarEncabezadosPuntosRutas(ss);
    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      mensaje: msg
    }, null, 2)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// GESTOR DE HOJA DE TARIFAS (CRUCE DE PUNTOS_RUTAS + HISTÓRICO RECOLECCIONES)
// ==============================================================================
function inicializarPestanaTarifas(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTarifas = ss.getSheetByName("Tarifas") || ss.insertSheet("Tarifas");
    var sheetRec = ss.getSheetByName("Recolecciones");
    var sheetPuntos = ss.getSheetByName("Puntos_Rutas");

    // 1. Escanear Recolecciones para mapear materias y últimos precios por Punto y por Proveedor
    var puntoHistory = {}; // "puntoNorm" -> { "prodNorm": { prodOriginal: "GORDANA", precio: 1300 } }
    var provHistory = {};  // "provNorm"  -> { "prodNorm": { prodOriginal: "GORDANA", precio: 1300 } }

    if (sheetRec && sheetRec.getLastRow() > 1) {
      var lastRow = sheetRec.getLastRow();
      var lastCol = sheetRec.getLastColumn();
      var headersRec = sheetRec.getRange(1, 1, 1, lastCol).getValues()[0];
      
      var colRec = { prov: 4, punto: 5, prod: 6, precio: 10 };
      for (var c = 0; c < headersRec.length; c++) {
        var h = normalizarTexto(headersRec[c]);
        if (h.indexOf('proveedor') !== -1) colRec.prov = c;
        else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colRec.punto = c;
        else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colRec.prod = c;
        else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colRec.precio = c;
      }

      var dataRec = sheetRec.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (var i = 0; i < dataRec.length; i++) {
        var rawProv = aNombrePropio(dataRec[i][colRec.prov]);
        var rawPunto = aNombrePropio(dataRec[i][colRec.punto]);
        var rawProd = String(dataRec[i][colRec.prod] || '').trim().toUpperCase();
        var rawPrecio = colRec.precio < dataRec[i].length ? dataRec[i][colRec.precio] : null;
        var precioNum = parsePrecioMoneda(rawPrecio);

        if (!rawProd) continue;
        var prodNorm = normalizarTexto(rawProd);

        if (rawPunto) {
          var pKey = normalizarTexto(rawPunto);
          if (!puntoHistory[pKey]) puntoHistory[pKey] = {};
          if (precioNum !== null && precioNum > 0 || !puntoHistory[pKey][prodNorm]) {
            puntoHistory[pKey][prodNorm] = { prodOriginal: rawProd, precio: (precioNum !== null && precioNum > 0 ? precioNum : "") };
          }
        }

        if (rawProv) {
          var prKey = normalizarTexto(rawProv);
          if (!provHistory[prKey]) provHistory[prKey] = {};
          if (precioNum !== null && precioNum > 0 || !provHistory[prKey][prodNorm]) {
            provHistory[prKey][prodNorm] = { prodOriginal: rawProd, precio: (precioNum !== null && precioNum > 0 ? precioNum : "") };
          }
        }
      }
    }

    // 1.1 LEER Y MAPEAR TODAS LAS TARIFAS EXISTENTES EN HOJA "Tarifas" (PRESERVACIÓN 100% INMUTABLE)
    var existingTarifasMap = {};
    if (sheetTarifas && sheetTarifas.getLastRow() > 1) {
      var lastRowT = sheetTarifas.getLastRow();
      var lastColT = sheetTarifas.getLastColumn();
      var dataT = sheetTarifas.getRange(2, 1, lastRowT - 1, lastColT).getValues();
      for (var t = 0; t < dataT.length; t++) {
        var rRuta = dataT[t][0];
        var rProv = dataT[t][1];
        var rPunto = dataT[t][2];
        var rProd = dataT[t][3];
        var rPrecio = dataT[t][4];
        var rEstado = dataT[t][5];
        var rObs = dataT[t][6];
        if (rProv && rPunto && rProd) {
          var keyT = (String(rProv).trim() + '|' + String(rPunto).trim() + '|' + String(rProd).trim()).toLowerCase();
          existingTarifasMap[keyT] = [rRuta, rProv, rPunto, rProd, rPrecio, rEstado, rObs];
        }
      }
    }

    // 2. Procesar Puntos_Rutas y cruzar con la data histórica (respetando precios existentes)
    var filasTarifas = [];
    var materiasPorFilaPuntos = []; // Para actualizar Col 9 de Puntos_Rutas
    var mapClavesTarifas = {};

    if (sheetPuntos && sheetPuntos.getLastRow() > 1) {
      // Garantizar que la fila 1 de Puntos_Rutas conserve siempre sus encabezados oficiales completos
      var headersOficiales = ["Ruta", "Proveedor", "Punto_Sucursal", "Direccion", "Telefono", "Horario_Estimado", "Frecuencia_Dias", "Estado", "Materias_Frecuentes"];
      sheetPuntos.getRange(1, 1, 1, headersOficiales.length).setValues([headersOficiales]);
      sheetPuntos.getRange(1, 1, 1, headersOficiales.length)
        .setFontWeight("bold")
        .setBackground("#1b4d3e")
        .setFontColor("#ffffff");

      var lastRowPuntos = sheetPuntos.getLastRow();
      var lastColPuntos = sheetPuntos.getLastColumn();
      var headersPuntos = sheetPuntos.getRange(1, 1, 1, lastColPuntos).getValues()[0];

      var colPuntos = { ruta: 0, prov: 1, punto: 2 };
      for (var cp = 0; cp < headersPuntos.length; cp++) {
        var hp = normalizarTexto(headersPuntos[cp]);
        if (hp.indexOf('ruta') !== -1) colPuntos.ruta = cp;
        else if (hp.indexOf('proveedor') !== -1) colPuntos.prov = cp;
        else if (hp.indexOf('punto') !== -1 || hp.indexOf('sucursal') !== -1) colPuntos.punto = cp;
      }

      var dataPuntos = sheetPuntos.getRange(2, 1, lastRowPuntos - 1, lastColPuntos).getValues();

      for (var p = 0; p < dataPuntos.length; p++) {
        var ruta = aNombrePropio(dataPuntos[p][colPuntos.ruta]);
        var prov = aNombrePropio(dataPuntos[p][colPuntos.prov]);
        var punto = aNombrePropio(dataPuntos[p][colPuntos.punto]);

        if (!punto || normalizarTexto(punto) === 'punto' || normalizarTexto(punto) === 'punto_sucursal') {
          materiasPorFilaPuntos.push([""]);
          continue;
        }

        var pKey = normalizarTexto(punto);
        var prKey = normalizarTexto(prov);

        // Obtener productos de este punto (del histórico del punto o del proveedor)
        var prodsPunto = {};
        if (puntoHistory[pKey]) {
          prodsPunto = puntoHistory[pKey];
        } else if (provHistory[prKey]) {
          prodsPunto = provHistory[prKey];
        }

        var listaNombresProds = [];
        var prodsKeys = Object.keys(prodsPunto);

        if (prodsKeys.length > 0) {
          for (var pk = 0; pk < prodsKeys.length; pk++) {
            var itemProd = prodsPunto[prodsKeys[pk]];
            var prodName = itemProd.prodOriginal;
            var precioVal = itemProd.precio;
            listaNombresProds.push(aNombrePropio(prodName));

            var tKey = (prov + '|' + punto + '|' + prodName).toLowerCase();
            if (!mapClavesTarifas[tKey]) {
              mapClavesTarifas[tKey] = true;
              if (existingTarifasMap[tKey]) {
                // Conservar 100% intacta la tarifa existente con su precio configurado
                filasTarifas.push(existingTarifasMap[tKey]);
              } else {
                filasTarifas.push([
                  ruta,
                  prov,
                  punto,
                  prodName,
                  precioVal !== "" && precioVal !== null ? precioVal : "",
                  precioVal !== "" && precioVal > 0 ? "Activo" : "Pendiente Precio",
                  precioVal !== "" && precioVal > 0 ? "Tarifa cruzada con histórico" : "Pendiente cotizar"
                ]);
              }
            }
          }
        } else {
          // Si el punto es totalmente nuevo, asignarle productos estándar de recolección
          var standardProds = ["DESPERDICIO", "GORDANA", "HUESO BLANCO", "HUESO DE CERDO", "SEBO EN RAMA"];
          for (var sp = 0; sp < standardProds.length; sp++) {
            var sProd = standardProds[sp];
            var tKey = (prov + '|' + punto + '|' + sProd).toLowerCase();
            if (!mapClavesTarifas[tKey]) {
              mapClavesTarifas[tKey] = true;
              if (existingTarifasMap[tKey]) {
                // Conservar 100% intacta la tarifa existente con su precio configurado
                filasTarifas.push(existingTarifasMap[tKey]);
              } else {
                filasTarifas.push([
                  ruta,
                  prov,
                  punto,
                  sProd,
                  "",
                  "Pendiente Precio",
                  "Punto sin histórico - Pendiente cotizar"
                ]);
              }
            }
          }
          listaNombresProds = ["Desperdicio", "Gordana", "Hueso Blanco", "Hueso De Cerdo", "Sebo En Rama"];
        }

        materiasPorFilaPuntos.push([listaNombresProds.join(", ")]);
      }

      // Reincorporar cualquier tarifa preexistente que estuviese en Tarifas y no coincida con los puntos iterados
      var allExKeys = Object.keys(existingTarifasMap);
      for (var ek = 0; ek < allExKeys.length; ek++) {
        var exK = allExKeys[ek];
        if (!mapClavesTarifas[exK]) {
          mapClavesTarifas[exK] = true;
          filasTarifas.push(existingTarifasMap[exK]);
        }
      }

      // Actualizar columna 9 en Puntos_Rutas con las materias frecuentes
      try {
        sheetPuntos.getRange(1, 9).setValue("Materias_Frecuentes");
        if (materiasPorFilaPuntos.length > 0) {
          sheetPuntos.getRange(2, 9, materiasPorFilaPuntos.length, 1).setValues(materiasPorFilaPuntos);
        }
      } catch (errPuntos) {
        Logger.log("Nota: No se pudo actualizar columna 9 en Puntos_Rutas: " + errPuntos.toString());
      }
    }

    // 3. Ordenar filas de Tarifas: Primero por orden de Ruta (Ruta 1..6 y Planta al final), luego por Proveedor, Punto y Producto
    filasTarifas.sort(function(a, b) {
      var wA = obtenerPesoRuta(a[0]);
      var wB = obtenerPesoRuta(b[0]);
      if (wA !== wB) return wA - wB;
      var c1 = a[1].localeCompare(b[1], 'es'); // Proveedor
      if (c1 !== 0) return c1;
      var c2 = a[2].localeCompare(b[2], 'es'); // Punto
      if (c2 !== 0) return c2;
      return a[3].localeCompare(b[3], 'es');   // Producto
    });

    // 5. Escribir encabezados y filas en la pestaña "Tarifas"
    sheetTarifas.clearContents();
    sheetTarifas.appendRow([
      "Ruta", "Proveedor", "Punto_Sucursal", "Producto", "Precio_Kg", "Estado", "Observaciones"
    ]);

    if (filasTarifas.length > 0) {
      sheetTarifas.getRange(2, 1, filasTarifas.length, 7).setValues(filasTarifas);
    }

    Logger.log("✅ Pestaña Tarifas cruzada con éxito: " + filasTarifas.length + " filas generadas. Puntos_Rutas enriquecida con Materias_Frecuentes.");

    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      totalTarifas: filasTarifas.length,
      puntosEnriquecidos: materiasPorFilaPuntos.length,
      mensaje: "Cruce completado con éxito: " + filasTarifas.length + " tarifas configuradas y Puntos_Rutas actualizado."
    }, null, 2)).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("Error inicializando tarifas cruzadas: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var payload = null;
    var action = (e && e.parameter && e.parameter.action) || 'saveRecoleccion';
    
    if (e && e.parameter && e.parameter.payload) {
      payload = e.parameter.payload;
    } else if (e && e.postData && e.postData.contents) {
      var raw = e.postData.contents;
      if (raw.indexOf('payload=') === 0) {
        payload = decodeURIComponent(raw.substring(8).replace(/\+/g, ' '));
      } else {
        payload = raw;
      }
    }

    // Si viene la acción dentro del JSON del payload
    if (payload && typeof payload === 'string' && payload.indexOf('"action"') !== -1) {
      try {
        var parsed = JSON.parse(payload);
        if (parsed.action) action = parsed.action;
      } catch(ignore) {}
    }

    if (action === 'deleteRecoleccion' && ((e && e.parameter && e.parameter.id) || (payload && typeof payload === 'object' && payload.id))) {
      var targetId = (e && e.parameter && e.parameter.id) || payload.id;
      return eliminarRecoleccionSheet(ss, targetId);
    }

    if (action === 'updateRecoleccion') {
      return actualizarRecoleccionSheet(ss, payload);
    }

    if (action === 'habilitarColumnasFactura' || action === 'desplazarColumnasFactura') {
      return habilitarColumnasFacturaHttp(ss);
    }
    
    return guardarRecoleccionSheet(ss, payload);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- FUNCIÓN DE AUTO-POBLADO Y CREACIÓN DE MATRIZ DE RUTAS (Puntos_Rutas) ---
function inicializarTablasYCatalogos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Pestaña Productos
  var sheetProd = ss.getSheetByName("Productos") || ss.insertSheet("Productos");
  sheetProd.clearContents();
  sheetProd.appendRow(["Producto", "Estado"]);
  var defaultProds = [
    ["ACEITE", "Activo"], ["CABEZAS", "Activo"], ["DESPERDICIO", "Activo"],
    ["EMPELLA", "Activo"], ["GORDANA", "Activo"], ["HARINA CARNE", "Activo"],
    ["HARINA DE HUESO VAPORIZADA", "Activo"], ["HUESO BLANCO", "Activo"],
    ["HUESO CERDO", "Activo"], ["HUESO SECO", "Activo"], ["MANTECA", "Activo"],
    ["MARGARINA", "Activo"], ["PIEL POLLO", "Activo"], ["SEBO", "Activo"], ["SEBO EN RAMA", "Activo"]
  ];
  sheetProd.getRange(2, 1, defaultProds.length, 2).setValues(defaultProds);

  // 2. Pestaña Conductores (Solo inicializa si está completamente vacía)
  var sheetCond = ss.getSheetByName("Conductores") || ss.insertSheet("Conductores");
  if (sheetCond.getLastRow() <= 1) {
    sheetCond.clearContents();
    sheetCond.appendRow(["Nombre", "Estado", "Contraseña"]);
  }

  // 3. Pestaña Rutas
  var sheetRutas = ss.getSheetByName("Rutas") || ss.insertSheet("Rutas");
  sheetRutas.clearContents();
  sheetRutas.appendRow(["Ruta", "Estado"]);
  var defaultRutas = [
    ["RUTA 1: Santa Elena / Cavasa", "Activo"],
    ["RUTA 2: Cali (Norte / Centro / Sur / Oriente)", "Activo"],
    ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "Activo"],
    ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "Activo"],
    ["RUTA 5: Palmira / Villagorgona / Carmelo", "Activo"],
    ["RUTA 6: Oriente/Sur", "Activo"],
    ["RUTA 7: Yumbo/Belalcazar", "Activo"],
    ["PLANTA SAN JOAQUIN", "Activo"]
  ];
  sheetRutas.getRange(2, 1, defaultRutas.length, 2).setValues(defaultRutas);

  // 4. Pestaña Puntos_Rutas (Matriz Consolidada)
  var sheetPuntosRutas = ss.getSheetByName("Puntos_Rutas") || ss.insertSheet("Puntos_Rutas");
  sheetPuntosRutas.clearContents();
  sheetPuntosRutas.appendRow(["Ruta", "Proveedor", "Punto_Sucursal", "Direccion", "Telefono", "Horario_Estimado", "Frecuencia_Dias", "Estado", "Materias_Frecuentes"]);
  
  var masterRecords = [["RUTA 1: Santa Elena / Cavasa","BODEGA SANTA ELENA","Santa Elena","Santa Elena","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","ALEJANDRO GARAY","Santa Elena","Santa Elena","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","CAVASA","BARBARA GOMEZ","BARBARA GOMEZ","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","CAVASA","DIEGO BUITRAGO","DIEGO BUITRAGO","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","CAVASA","CARIBE","CARIBE","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","CAVASA","SEVILLANA","SEVILLANA","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","CAVASA","MIGAN CAPITAL","MIGAN CAPITAL","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","CAVASA","FREDDY HERNANDEZ","FREDDY HERNANDEZ","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","CAVASA","EDINSON AGUIRRE","EDINSON AGUIRRE","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","CAVASA","LA RESERVA","LA RESERVA","","","Lunes a Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","SEVILLANA SANTA ELENA","Sevillana Santa Elena","Santa Elena","","","Lunes / Miércoles / Viernes","Activo"],["RUTA 1: Santa Elena / Cavasa","Santa Elena","CIUDAD DEL CAMPO GRANAHORRAR","Ciudad del Campo","","","Lunes / Miércoles / Viernes","Activo"],["RUTA 1: Santa Elena / Cavasa","Santa Elena","CIUDAD DEL CAMPO PUNTO ROJO","Ciudad del Campo","","","Lunes / Miércoles / Viernes","Activo"],["RUTA 1: Santa Elena / Cavasa","Santa Elena","CIUDAD DEL CAMPO SURTIMERCAR","Ciudad del Campo","","","Lunes / Miércoles / Viernes","Activo"],["RUTA 1: Santa Elena / Cavasa","Santa Elena","ORLANDO MARTINEZ","Carniceria la paz","","","Miércoles / Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","Santa Elena","LA ESPERANZA","La Esperanza","","","Sábado","Activo"],["RUTA 1: Santa Elena / Cavasa","Santa Elena","DISTRIBUIDORA DE CARNES MILLAN","DISTRIBUIDORA DE CARNES MILLAN","","","Miercoles/sabado","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Punto 14","Cra. 5 #14-37","3244935167","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Centenario","Av. 4 Norte #46-64","3102022829","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","MIGAN CAPITAL","La Montaña Av. 6A","Av. 6A N #30N-47","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Prados del Norte","Av.2B Norte #34N-19","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","carnes maiale","Carnes Maiale","Cra.1G #69-02 Esquina","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","Districarnes LG","Districarnes LG","Cra.4C #65B-18","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Álamos","Calle75C N #2 Bis-100","3243192838","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Los Pinos","Calle70 #7M Bis-64","3243192839","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral La Primera","Cra.1A #44-50","3184277811","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","MIGAN CAPITAL","La Montaña Torres","Cra.1 #56-20","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","Super Carnes Los Andes","Super Carnes Los Andes","Cra.1D #52-05","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","La Cosecha de Mi Tierra","La Cosecha de Mi Tierra","Cra.15 Calle54 Esquina","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","COMERCIALIZADORA R Y E","Carnes RYE","Cra.17F #33A-45","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","Baratón Carnes Berlín","Baratón Carnes Berlín","Calle44 #19-65","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","El Rebajón","El Rebajón","Calle 44","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","MIGAN CAPITAL","La Montaña Calima","","","","Viernes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Ingenio","Ingenio","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Limonar","Limonar","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Pasoancho","Pasoancho","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SEVILLANA","Sevillana Pasoancho","Pasoancho","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","MIGAN CAPITAL","La Montaña Pasoancho","Calle 14C #25-16","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SEVILLANA","Sevillana Lourdes","Transv. 29D #29-50","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","MIGAN CAPITAL","La Montaña Guadalupe","Guadalupe","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","MIGAN CAPITAL","La Montaña Cosmocentro","Cosmocentro","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","MIGAN CAPITAL","La Montaña Cristales","Cristales","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Villanueva","Calle 13 #75A-185","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","SUPERTIENDA CAÑAVERAL","Cañaveral Cootraemcali","Cra.70 #13B-18","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","Mercaunión","Mercaunión","Calle 25 #85B-100","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","Sevillana República de Israel","Sevillana República de Israel","","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","Jaime Zuluaga","Jaime Zuluaga","","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","Milton Muñoz","Milton Muñoz","","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","MIGAN CAPITAL","La Montaña Decepaz","","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","Ciudadela del Río","Ciudadela del Río","","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","MIGAN CAPITAL","La Montaña Morichal","","","","Martes","Activo"],["RUTA 2: Cali (Norte / Centro / Sur / Oriente)","CARNICOS LA FAMA","CARNICOS LA FAMA","juanchito","","","Martes","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Puerto Tejada Centro","Cra.19 #17-45","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Puerto Tejada Punto 2","Cl. 16 #20-60","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Villa Rica Caribe","Cra. 3 #2-60","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Jamundí Terranova","Cra. 51 Sur #16C-04","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Jamundí Farallones","Cl. 12 Sur #10A-77","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Jamundí Surtimayorista","Cra. 10 #11-66","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Jamundí Rosario","Cra. 11 #3-93","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Jamundí Principal","Cra. 7 #10-48","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Jamundí Centro","Cl. 11 #9-58","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","CARIBE","Jamundí Panamericana","Cra. 3D #11-145","","","Miércoles","Activo"],["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance","SUPERTIENDA CAÑAVERAL","Cañaveral pance","","","","jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","SUPERTIENDA CAÑAVERAL- FRIGORIVALLE","cañaveral matadero","","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","FRIGORIVALLE","frigorivalle matadero","","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","JHONATAN MARTINEZ","frigorifico buga","","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","YIMI SANCLEMENTE","frigorifico buga","","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","SUPERTIENDA CAÑAVERAL","Cañaveral Tuluá","tulua","","","Martes","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","SUPERTIENDA CAÑAVERAL","Cañaveral Buga albergue","albergue","","","Martes","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","SUPERTIENDA CAÑAVERAL","Cañaveral Buga merino","merino","","","miércoles","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","SUPERTIENDA CAÑAVERAL","cañaveral zarzal","zarzal","","","jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","SUPERTIENDA CAÑAVERAL","Cañaveral Roldanillo","Roldanillo","","","Martes","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","SEVILLANA","Sevillana Guacarí","Guacarí","","","Miércoles","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","CARIBE","Caribe Buga","Buga","","","Miércoles","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","ALBERTO MILLAN","Alberto Millán","Buga","","","Jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","ALBERTO MILLAN","Alberto Millán","cerrito","","","Jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","HERNANDO HIDALGO","HERNANDO HIDALGO","Buga","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","BELALCAZAR","B1-PRINCIPAL (Carrera 5 # 5-48)","CARRERA 5 # 5-48","","","Jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","BELALCAZAR","B2- GALERIA (Calle 9 # 2-26)","CALLE 9 # 2-26","","","Jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","BELALCAZAR","B3- PLANTA BELOMO (Carrera 4 # 14-66)","CARRERA 4 # 14-66","","","Jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","BELALCAZAR","B5- GUACANDA (Transversal 6 # 13-194)","TRANSVERSAL 6 # 13-194","","","Jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","BELALCAZAR","B6- ROZO (Calle 10 N # 14 A 211 Rozo- Palmira)","CALLE 10 N # 14 A 211 ROZO- PALMIRA","","","Jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","BELALCAZAR","B8- BOLIVAR (Carrera 3 # 13-44)","CARRERA 3 # 13-44","","","Jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","BELALCAZAR","B9- URIBE (Carrera 12 # 11-03)","CARRERA 12 # 11-03","","","Jueves","Activo"],["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá/yumbo/Rozo","BELALCAZAR","B11- GUABINAS (Calle 8 #19 B 55)","CALLE 8 #19 B 55","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","MERCAMIO","Mercamio Palmira","Palmira","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","SUPERTIENDA CAÑAVERAL","Cañaveral Palmitex (Palmira)","Palmira","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","SUPERTIENDA CAÑAVERAL","Cañaveral Palmicentro (Palmira)","Palmira","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","SEVILLANA","Sevillana Palmira / Villagorgona","Palmira / Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","MIGAN CAPITAL","La Montaña Palmira","Palmira","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","SUPERTIENDA CAÑAVERAL","Cañaveral Villagorgona 1","Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","SUPERTIENDA CAÑAVERAL","Cañaveral Villagorgona 2","Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","Nutrialimentos Valdez (Villagorgona)","Nutrialimentos Valdez (Villagorgona)","Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","Yénifer Díaz (Villagorgona)","Yénifer Díaz (Villagorgona)","Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","Jorge Adrián Rodas (Villagorgona)","Jorge Adrián Rodas (Villagorgona)","Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","RICARDO GIL","RICARDO GIL","Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","CENTRAL HENRY MARTINEZ","CENTRAL HENRY MARTINEZ","Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","CARLOS REBOLLEDO","CARLOS REBOLLEDO","Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","ORLANDO GIRALDO","ORLANDO GIRALDO","Villagorgona","","","Jueves","Activo"],["RUTA 5: Palmira / Villagorgona / Carmelo","Carnicería Fabián López (Águila Roja)","Carnicería Fabián López (Águila Roja)","Águila Roja","","","Jueves","Activo"],["PLANTA SAN JOAQUIN","HEBER GAMBOA","HEBER GAMBOA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MILSON GONSALEZ","MILSON GONSALEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MIRIAM CUARAN","MIRIAM CUARAN","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","CARLOS CAICEDO","CARLOS CAICEDO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","FREDDY FERNANDEZ","FREDDY FERNANDEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","CARLOS MARTINEZ","CARLOS MARTINEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","CRHISTIAN CEDEÑO","CRHISTIAN CEDEÑO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","GILDARDO TEJADA","GILDARDO TEJADA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MIGUEL ANGEL OTERO","MIGUEL ANGEL OTERO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MARIA ELSI ALEGRIA","MARIA ELSI ALEGRIA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","WILMER BUSTAMANTE","WILMER BUSTAMANTE","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","JAIRO MOSQUERA","JAIRO MOSQUERA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","MARTIN PEREZ","MARTIN PEREZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","OSCAR LARA","OSCAR LARA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","JULIAN LUNA","JULIAN LUNA","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","DIEGO BUITRAGO","DIEGO BUITRAGO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","FREDDY HERNANDEZ","FREDDY HERNANDEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","BARBARA GOMEZ","BARBARA GOMEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","HERNANDO HIDALGO","HERNANDO HIDALGO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","GRAXPRO","GRAXPRO","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","AUGUSTO MUÑOZ","AUGUSTO MUÑOZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"],["PLANTA SAN JOAQUIN","FABIAN LOPEZ","FABIAN LOPEZ","PLANTA SAN JOAUIN","","","Lunes / Martes / Miércoles / Jueves / Viernes / Sábado","Activo"]];
  sheetPuntosRutas.getRange(2, 1, masterRecords.length, 8).setValues(masterRecords);

  // 5. Pestaña Recolecciones
  var sheetRec = ss.getSheetByName("Recolecciones");
  if (!sheetRec) {
    sheetRec = ss.insertSheet("Recolecciones");
  }
  if (sheetRec.getLastRow() === 0) {
    sheetRec.appendRow([
      "ID_Recoleccion", "Fecha_Hora", "Ruta", "Conductor", "Proveedor",
      "Punto_Sucursal", "Materia_Producto", "Kg", "Observaciones",
      "Ubicacion_GPS_Real", "Precio", "Valor"
    ]);
  }

  Logger.log("✅ ¡ÉXITO! Se han limpiado y poblado automáticamente las pestañas Productos, Conductores, Rutas, Puntos_Rutas (con 122 puntos de recolección incluyendo Planta San Joaquín) y Recolecciones.");
}

// ==============================================================================
// MIGRACIÓN Y RECLASIFICACIÓN HISTÓRICA RUTA 1: SANTA ELENA (OCTUBRE 2026)
// ==============================================================================
function migrarRuta1_SantaElena(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetRec = ss.getSheetByName("Recolecciones");
  if (!sheetRec) {
    Logger.log("❌ No se encontró la hoja Recolecciones.");
    return { status: "error", message: "No se encontró la hoja Recolecciones" };
  }

  // 1. Escanear filas reales con ID en Columna A (evita límites de memoria o fórmulas vacías)
  var totalRows = sheetRec.getLastRow();
  if (totalRows <= 1) {
    Logger.log("Hoja vacía.");
    return { status: "empty" };
  }

  var idCol = sheetRec.getRange(2, 1, totalRows - 1, 1).getValues();
  var filasReales = 0;
  for (var r = idCol.length - 1; r >= 0; r--) {
    if (String(idCol[r][0] || '').trim() !== '') {
      filasReales = r + 1;
      break;
    }
  }

  if (filasReales === 0) {
    Logger.log("No se encontraron registros con ID.");
    return { status: "empty" };
  }

  // 2. Leer ÚNICAMENTE Columnas C a F (Ruta, Conductor, Proveedor, Punto)
  // Col C (3), D (4), E (5), F (6) -> 4 columnas
  var datosLectura = sheetRec.getRange(2, 3, filasReales, 4).getValues();

  // 3. Preparar nuevos valores ÚNICAMENTE para Columnas E y F (Proveedor y Punto)
  var nuevosValoresEF = [];
  var c1 = 0, c2 = 0, c3 = 0, mod = 0;

  for (var i = 0; i < datosLectura.length; i++) {
    var ruta = String(datosLectura[i][0] || '').trim().toLowerCase(); // Col C
    var provOriginal = String(datosLectura[i][2] || '').trim();       // Col E
    var ptoOriginal  = String(datosLectura[i][3] || '').trim();       // Col F

    var provLower = provOriginal.toLowerCase();
    var ptoLower  = ptoOriginal.toLowerCase();
    var esRuta1   = (ruta.indexOf('ruta 1') !== -1) || (ruta.indexOf('santa elena') !== -1);

    var nuevoProv = provOriginal;
    var nuevoPto  = ptoOriginal;

    if (esRuta1) {
      // Caso 1: Bodega Santa Elena
      if (ptoLower.indexOf('bodega santa elena') !== -1 || (provLower === 'santa elena' && ptoLower.indexOf('bodega') !== -1)) {
        nuevoProv = 'Bodega Santa Elena';
        nuevoPto  = 'Santa Elena';
        c1++; mod++;
      }
      // Caso 2: Alejandro Garay
      else if (ptoLower.indexOf('garay') !== -1 || provLower.indexOf('garay') !== -1) {
        nuevoProv = 'Alejandro Garay';
        nuevoPto  = 'Santa Elena';
        c2++; mod++;
      }
      // Caso 3: Sevillana Santa Elena
      else if (ptoLower.indexOf('sevillana santa elena') !== -1 || provLower === 'sevillana' || (provLower === 'santa elena' && ptoLower.indexOf('sevillana') !== -1)) {
        nuevoProv = 'Sevillana Santa Elena';
        nuevoPto  = 'Sevillana Santa Elena';
        c3++; mod++;
      }
    }

    nuevosValoresEF.push([nuevoProv, nuevoPto]);
  }

  // 4. Escribir ÚNICAMENTE en Columnas E y F (Fila 2, Columna 5, filasReales, 2 columnas)
  // ¡0 conflicto con fórmulas, 0 error desconocido, 100% seguro!
  sheetRec.getRange(2, 5, filasReales, 2).setValues(nuevosValoresEF);

  Logger.log("✅ [Recolecciones] Modificadas: " + mod + " filas (Bodega: " + c1 + ", Garay: " + c2 + ", Sevillana: " + c3 + ")");

  return {
    status: "success",
    totalModificados: mod,
    bodegaSantaElena: c1,
    alejandroGaray: c2,
    sevillanaSantaElena: c3,
    totalFilasAuditadas: filasReales
  };
}

function migrarRuta1SantaElenaHttp(ss) {
  try {
    var res = migrarRuta1_SantaElena(ss);
    return ContentService.createTextOutput(JSON.stringify(res, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// (onOpen movido al final unificado con Conciliador)

// ==============================================================================
// ACTUALIZACIÓN DE TARIFAS RUTA 1: SANTA ELENA / CAVASA (OPCIÓN 1)
// ==============================================================================
function migrarTarifasRuta1(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTarifas = ss.getSheetByName("Tarifas");
    if (!sheetTarifas) {
      sheetTarifas = ss.insertSheet("Tarifas");
    }

    var lastRow = sheetTarifas.getLastRow();
    var lastCol = Math.max(sheetTarifas.getLastColumn(), 7);

    // 1. Extraer tarifas base históricas de Santa Elena y Cavasa, y conservar otras rutas
    var tarifasSantaElena = [];
    var tarifasCavasa = [];
    var otrasRutas = [];

    if (lastRow > 1) {
      var data = sheetTarifas.getRange(2, 1, lastRow - 1, lastCol).getValues();

      for (var i = 0; i < data.length; i++) {
        var ruta = String(data[i][0] || '').trim();
        var prov = String(data[i][1] || '').trim();
        var punto = String(data[i][2] || '').trim();
        var prod = String(data[i][3] || '').trim();
        var precio = data[i][4];
        var estado = String(data[i][5] || '').trim();
        var obs = String(data[i][6] || '').trim();

        var esRuta1 = (ruta.toLowerCase().indexOf('ruta 1') !== -1 || ruta.toLowerCase().indexOf('santa elena') !== -1);

        if (esRuta1) {
          if (prov.toLowerCase() === 'santa elena') {
            tarifasSantaElena.push({ prod: prod, precio: precio, estado: estado, obs: obs });
          } else if (prov.toLowerCase() === 'cavasa') {
            tarifasCavasa.push({ prod: prod, precio: precio, estado: estado, obs: obs });
          }
        } else if (ruta !== '') {
          otrasRutas.push([ruta, prov, punto, prod, precio, estado, obs]);
        }
      }
    }

    if (tarifasSantaElena.length === 0) {
      tarifasSantaElena = [
        { prod: 'ACEITE', precio: 3600, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'CALAMBOMBO DE CERDO', precio: '', estado: 'Pendiente Precio', obs: 'Pendiente cotizar' },
        { prod: 'DESPERDICIO', precio: 150, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'EMPELLA', precio: 2000, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'GORDANA', precio: '', estado: 'Pendiente Precio', obs: 'Pendiente cotizar' },
        { prod: 'HUESO BLANCO', precio: 300, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO DE CERDO', precio: 150, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO SECO', precio: 700, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'MANTECA', precio: 3500, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'SEBO EN RAMA', precio: 1300, estado: 'Activo', obs: 'Tarifa histórica' }
      ];
    }

    if (tarifasCavasa.length === 0) {
      tarifasCavasa = [
        { prod: 'GORDANA', precio: 2000, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO BLANCO', precio: 350, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO DE CERDO', precio: 250, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO PROMOCION', precio: 1200, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'PIELES', precio: 100, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'SEBO EN RAMA', precio: 1200, estado: 'Activo', obs: 'Tarifa histórica' }
      ];
    }

    var nuevasFilasRuta1 = [];
    var nombreRuta1 = "Ruta 1: Santa Elena / Cavasa";

    // 2.1 Proveedores Santa Elena (3)
    var provsSantaElena = [
      { prov: "Bodega Santa Elena", punto: "Santa Elena" },
      { prov: "Alejandro Garay", punto: "Santa Elena" },
      { prov: "Sevillana Santa Elena", punto: "Sevillana Santa Elena" }
    ];

    for (var s = 0; s < provsSantaElena.length; s++) {
      var pInfo = provsSantaElena[s];
      for (var seIdx = 0; seIdx < tarifasSantaElena.length; seIdx++) {
        var itemSE = tarifasSantaElena[seIdx];
        nuevasFilasRuta1.push([
          nombreRuta1,
          pInfo.prov,
          pInfo.punto,
          itemSE.prod,
          itemSE.precio,
          itemSE.estado,
          "Tarifa heredada Santa Elena"
        ]);
      }
    }

    // 2.2 Proveedores Cavasa (8)
    var provsCavasa = [
      { prov: "Barbara Gomez", punto: "Cavasa" },
      { prov: "Los Lagos", punto: "Cavasa" },
      { prov: "Caribe", punto: "Cavasa" },
      { prov: "Sevillana", punto: "Cavasa" },
      { prov: "Migan Capital", punto: "Cavasa" },
      { prov: "Freddy Hernandez", punto: "Cavasa" },
      { prov: "Edinson Aguirre", punto: "Cavasa" },
      { prov: "La Reserva", punto: "Cavasa" }
    ];

    for (var c = 0; c < provsCavasa.length; c++) {
      var cInfo = provsCavasa[c];
      for (var cvIdx = 0; cvIdx < tarifasCavasa.length; cvIdx++) {
        var itemCV = tarifasCavasa[cvIdx];
        nuevasFilasRuta1.push([
          nombreRuta1,
          cInfo.prov,
          cInfo.punto,
          itemCV.prod,
          itemCV.precio,
          itemCV.estado,
          "Tarifa heredada Cavasa"
        ]);
      }
    }

    // 2.3 Filas de respaldo histórico para Santa Elena y Cavasa
    for (var rSE = 0; rSE < tarifasSantaElena.length; rSE++) {
      var itemRSE = tarifasSantaElena[rSE];
      nuevasFilasRuta1.push([
        nombreRuta1,
        "Santa Elena",
        "",
        itemRSE.prod,
        itemRSE.precio,
        itemRSE.estado,
        "Tarifa respaldo histórica"
      ]);
    }

    for (var rCV = 0; rCV < tarifasCavasa.length; rCV++) {
      var itemRCV = tarifasCavasa[rCV];
      nuevasFilasRuta1.push([
        nombreRuta1,
        "Cavasa",
        "",
        itemRCV.prod,
        itemRCV.precio,
        itemRCV.estado,
        "Tarifa respaldo histórica"
      ]);
    }

    var matrizFinal = nuevasFilasRuta1.concat(otrasRutas);

    var headers = ["Ruta", "Proveedor", "Punto_Sucursal", "Producto", "Precio_Kg", "Estado", "Observaciones"];
    sheetTarifas.getRange(1, 1, 1, headers.length).setValues([headers]);

    if (lastRow > 1) {
      sheetTarifas.getRange(2, 1, Math.max(lastRow - 1, 1), headers.length).clearContent();
    }

    sheetTarifas.getRange(2, 1, matrizFinal.length, headers.length).setValues(matrizFinal);
    sheetTarifas.getRange(2, 5, matrizFinal.length, 1).setNumberFormat("$#,##0");

    var resumenMsg = "✅ ¡Tarifario de Ruta 1 actualizado con éxito (Opción 1)!\n\n" +
                     "• Nuevas tarifas asignadas en Ruta 1: " + (provsSantaElena.length * tarifasSantaElena.length + provsCavasa.length * tarifasCavasa.length) + " filas\n" +
                     "  - 3 Proveedores Santa Elena: " + (provsSantaElena.length * tarifasSantaElena.length) + " filas\n" +
                     "  - 8 Proveedores Cavasa: " + (provsCavasa.length * tarifasCavasa.length) + " filas\n" +
                     "  - Respaldo Santa Elena y Cavasa: " + (tarifasSantaElena.length + tarifasCavasa.length) + " filas\n" +
                     "• Filas de demás rutas intactas: " + otrasRutas.length + " filas\n" +
                     "• Total filas en pestaña Tarifas: " + matrizFinal.length + " filas.";

    Logger.log(resumenMsg);

    try {
      SpreadsheetApp.getUi().alert(resumenMsg);
    } catch(e) {}

    return {
      status: "success",
      totalTarifasRuta1: nuevasFilasRuta1.length,
      tarifasSantaElenaAsignadas: provsSantaElena.length * tarifasSantaElena.length,
      tarifasCavasaAsignadas: provsCavasa.length * tarifasCavasa.length,
      otrasRutasPreservadas: otrasRutas.length,
      totalFilasTarifas: matrizFinal.length
    };

  } catch(err) {
    Logger.log("❌ Error en migrarTarifasRuta1: " + err.toString());
    try {
      SpreadsheetApp.getUi().alert("Error: " + err.toString());
    } catch(e) {}
    return { status: "error", error: err.toString() };
  }
}

function migrarTarifasRuta1Http(ss) {
  try {
    var res = migrarTarifasRuta1(ss);
    return ContentService.createTextOutput(JSON.stringify(res, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// REPARACIÓN QUIRÚRGICA DE DUPLICADOS Y ANOMALÍAS DE SEPTIEMBRE
// ==============================================================================
function repararDuplicadosSeptiembre(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetRec = ss.getSheetByName("Recolecciones");
    if (!sheetRec) {
      throw new Error("No se encontró la pestaña 'Recolecciones'.");
    }

    var lastRow = sheetRec.getLastRow();
    var lastCol = sheetRec.getLastColumn();
    if (lastRow <= 1) {
      throw new Error("La hoja 'Recolecciones' está vacía.");
    }

    // PASO 1: CREAR RESPALDO DE SEGURIDAD 100% INMUTABLE
    var backupSheetName = "Recolecciones_Backup_PreReparacion";
    var existingBackup = ss.getSheetByName(backupSheetName);
    if (existingBackup) {
      ss.deleteSheet(existingBackup);
    }
    var backupSheet = sheetRec.copyTo(ss);
    backupSheet.setName(backupSheetName);
    Logger.log("✅ [Seguridad] Pestaña de respaldo creada: " + backupSheetName);

    // PASO 2: MAPEAR COLUMNAS
    var headers = sheetRec.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = { id: 0, fecha: 1, ruta: 2, cond: 3, prov: 4, punto: 5, prod: 6, kg: 7, obs: 8, precio: 10, valor: 11 };

    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c] || '').toLowerCase().trim();
      if (h.indexOf('id') !== -1) colIdx.id = c;
      else if (h.indexOf('fecha') !== -1) colIdx.fecha = c;
      else if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('kg') !== -1 || h.indexOf('kilo') !== -1) colIdx.kg = c;
      else if (h.indexOf('precio') !== -1) colIdx.precio = c;
      else if (h.indexOf('valor') !== -1) colIdx.valor = c;
    }

    // PASO 3: LISTA EXACTA DE IDs SINTÉTICOS DUPLICADOS A ELIMINAR (24 CLONES)
    var idsClonesEliminar = {
      'REC-1790263124000': true, // 24/09 Cañaveral Matadero 100 kg
      'REC-1790270182000': true, // 24/09 Cañaveral Matadero 50 kg
      'REC-1790291094000': true, // 24/09 Cavasa 15 kg (Los Lagos)
      'REC-1790291189000': true, // 24/09 Cavasa 111 kg (La Reserva)
      'REC-1790372238000': true, // 25/09 Cavasa 482 kg Pieles (Sevillana)
      'REC-1790372467000': true, // 25/09 Cavasa 207 kg Sebo (Sevillana)
      'REC-1790372587000': true, // 25/09 Cavasa 180 kg Sebo (Los Lagos)
      'REC-1790372678000': true, // 25/09 Cavasa 75 kg Sebo (La Reserva)
      'REC-1790373112000': true, // 25/09 Cavasa 228 kg Sebo (Edinson Aguirre)
      'REC-1789145873000': true, // 11/09 Cavasa 507.8 kg Pieles
      'REC-1789146762000': true, // 11/09 Cavasa 595 kg Sebo
      'REC-1789245060000': true, // 12/09 Cavasa 275 kg Gordana
      'REC-1789728450000': true, // 18/09 Cavasa 625 kg Sebo
      'REC-1789985928000': true, // 21/09 Cavasa 979 kg Pieles
      'REC-1789985974000': true, // 21/09 Cavasa 126 kg Sebo
      'REC-1789986008000': true, // 21/09 Cavasa 206 kg Sebo
      'REC-1789986582000': true, // 21/09 Cavasa 423 kg Sebo
      'REC-1790101154000': true, // 22/09 Cavasa 210 kg Sebo
      'REC-1790101244000': true, // 22/09 Cavasa 249 kg Sebo
      'REC-1790101302000': true, // 22/09 Cavasa 53 kg Sebo
      'REC-1790101494000': true, // 22/09 Cavasa 327.5 kg Hueso Promocion
      'REC-1790101686000': true, // 22/09 Cavasa 169 kg Sebo
      'REC-1790181288000': true, // 23/09 Cavasa 171 kg Sebo
      'REC-1790437841000': true, // 26/09 Cavasa 362 kg Sebo

      // Filas de Suma Total Duplicada en Santa Elena (Doble conteo)
      'REC-1790267623000': true, // 24/09 Bodega Santa Elena 8.051 kg (Suma doble de 3423 + 3307 + 1321)
      'REC-1790267710000': true, // 24/09 Garay Santa Elena 207 kg (Suma doble de 56 + 151)
      'REC-1790371544000': true, // 25/09 Bodega Santa Elena 5.515 kg (Suma doble de 3464 + 519 + 1532)
      'REC-1790372033000': true, // 25/09 Garay Santa Elena 448 kg (Suma doble de 29 + 419)
      'REC-1790373021000': true  // 25/09 Sevillana Santa Elena 915.2 kg (Suma doble de 620 + 134.6 + 122 + 38.6)
    };

    // PASO 4: APLICAR CORRECCIONES EN MEMORIA Y MARCAR CLONES
    var idRange = sheetRec.getRange(2, 1, lastRow - 1, 1).getValues();
    var filasParaEliminar = [];
    var correcionesRealizadas = [];

    for (var r = idRange.length - 1; r >= 0; r--) {
      var filaNum = r + 2;
      var idFila = String(idRange[r][0] || '').trim();

      // Caso A: Corrección Fila 40.000 Kg (REC-1790357561744)
      if (idFila === 'REC-1790357561744') {
        sheetRec.getRange(filaNum, colIdx.prov + 1).setValue('Edinson Aguirre');
        sheetRec.getRange(filaNum, colIdx.punto + 1).setValue('Cavasa');
        sheetRec.getRange(filaNum, colIdx.kg + 1).setValue(40);
        sheetRec.getRange(filaNum, colIdx.valor + 1).setValue(48000);
        correcionesRealizadas.push("Fila " + filaNum + ": 40.000 Kg corregidos a 40 Kg (Edinson Aguirre - $48.000)");
        Logger.log("✅ Corregida Fila " + filaNum + " (40.000 Kg -> 40 Kg Edinson Aguirre)");
        continue;
      }

      // Caso B: Corrección Fila 142 Kg (REC-1790285777272)
      if (idFila === 'REC-1790285777272') {
        sheetRec.getRange(filaNum, colIdx.prov + 1).setValue('Edinson Aguirre');
        sheetRec.getRange(filaNum, colIdx.punto + 1).setValue('Cavasa');
        correcionesRealizadas.push("Fila " + filaNum + ": Proveedor 'Cavasa' corregido a 'Edinson Aguirre' (142 Kg Sebo)");
        Logger.log("✅ Corregida Fila " + filaNum + " (142 Kg -> Edinson Aguirre)");
        continue;
      }

      // Caso C: Clon sintético duplicado -> Marcar para eliminación
      if (idsClonesEliminar[idFila]) {
        filasParaEliminar.push(filaNum);
      }
    }

    // PASO 5: ELIMINAR CLONES DE ABAJO HACIA ARRIBA
    for (var d = 0; d < filasParaEliminar.length; d++) {
      var numEliminar = filasParaEliminar[d];
      sheetRec.deleteRow(numEliminar);
      Logger.log("🗑️ Eliminada fila clon duplicada: " + numEliminar);
    }

    var mensajeFinal = "🎉 ¡REPARACIÓN DE SEPTIEMBRE COMPLETADA CON ÉXITO!\n\n" +
      "1. Correcciones específicas aplicadas:\n" +
      "   • " + correcionesRealizadas.join("\n   • ") + "\n\n" +
      "2. Clones sintéticos duplicados eliminados:\n" +
      "   • Total filas clon eliminadas: " + filasParaEliminar.length + " filas\n\n" +
      "3. Respaldo de seguridad creado:\n" +
      "   • Pestaña: '" + backupSheetName + "' (conserva el 100% de los datos previos)\n\n" +
      "Las recolecciones legítimas de los conductores, sus kilos y proveedores reales (Edinson Aguirre, Los Lagos, La Reserva, Sevillana) quedaron 100% intactas y saneadas.";

    Logger.log(mensajeFinal);

    try {
      SpreadsheetApp.getUi().alert(mensajeFinal);
    } catch(e) {}

    return {
      status: "success",
      filasModificadas: correcionesRealizadas.length,
      clonesEliminados: filasParaEliminar.length,
      backupCreado: backupSheetName,
      totalFilasRestantes: sheetRec.getLastRow()
    };

  } catch(err) {
    Logger.log("❌ Error en repararDuplicadosSeptiembre: " + err.toString());
    try {
      SpreadsheetApp.getUi().alert("Error: " + err.toString());
    } catch(e) {}
    return { status: "error", error: err.toString() };
  }
}

function repararDuplicadosSeptiembreHttp(ss) {
  try {
    var res = repararDuplicadosSeptiembre(ss);
    return ContentService.createTextOutput(JSON.stringify(res, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}



// ==============================================================================
// MENÚ INTEGRADO DE GOOGLE SHEETS: CONCILIADOR + MANTENIMIENTO PROTEINAGRO
// ==============================================================================
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    
    // 1. Menú Oficial del Conciliador (Operación Diaria)
    ui.createMenu('📊 Conciliador')
      .addItem('🗔 Abrir aquí en Sheets (Ventana Flotante)', 'abrirConciliadorFlotante')
      .addItem('⚖️ Conciliar Proveedor con Excel (Directo)', 'abrirConciliacionDirectaFlotante')
      .addSeparator()
      .addItem('🚀 Abrir Conciliador (Ventana Aparte)', 'abrirConciliadorNuevaVentana')
      .addItem('📋 Descargar Plantilla Oficial (.xlsx)', 'abrirDescargaPlantillaSheets')
      .addSeparator()
      .addItem('⚙️ Configurar URL del Web App', 'configurarUrlWebApp')
      .addToUi();

    // 2. Menú de Mantenimiento ProteinAgro (Herramientas Técnicas)
    ui.createMenu('🚀 ProteinAgro')
      .addItem('Reclasificar Ruta 1 (Santa Elena)', 'migrarRuta1_SantaElena')
      .addItem('Actualizar Tarifario Ruta 1 (Opción 1)', 'migrarTarifasRuta1')
      .addItem('🔧 Reparar Duplicados de Septiembre', 'repararDuplicadosSeptiembre')
      .addSeparator()
      .addItem('🧹 Homologar Rutas y Limpiar Kilos', 'homologarRutasYLimpiarSheet')
      .addItem('🥩 Corregir Kilos Convertidos a Fechas', 'corregirKilosFechasSheet')
      .addItem('💰 Liquidar Recolecciones Pendientes', 'liquidarRecoleccionesPendientes')
      .addItem('📋 Organizar Rutas y Planta San Joaquín', 'restaurarEncabezadosPuntosRutas')
      .addSeparator()
      .addItem('🧾 Habilitar Columnas Factura Caribe (Desplazar a la derecha)', 'menuHabilitarColumnasFactura')
      .addToUi();
  } catch (e) {
    Logger.log('Error creando menús: ' + e.toString());
  }
}

// ==============================================================================
// FUNCIONES Y MENÚS DEL SISTEMA CONCILIADOR (INTEGRADO PROTEINAGRO)
// ==============================================================================

var SPREADSHEET_ID_DB = '1eQSRvG7vWkIoW3AT5e6Ahi7ndWF6P4OG_Alxo2Go0lU';

function getConciliadorWebAppUrl() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("CONCILIADOR_URL");
  if (!url) {
    try {
      url = ScriptApp.getService().getUrl();
    } catch (e) {
      Logger.log("ScriptApp.getService().getUrl() no disponible: " + e.toString());
    }
  }
  if (!url || url.indexOf("macros/s") === -1) {
    url = "https://script.google.com/macros/s/AKfycbx4X0yiSS7Tisgyn2Xn2NuAlB9uWRwAP019Jurc4TvSyBseg3un47xA2d6o0rFs0Y5o9A/exec";
  }
  if (url.indexOf("view=conciliador") === -1) {
    url += (url.indexOf("?") === -1 ? "?" : "&") + "view=conciliador";
  }
  return url;
}

function configurarUrlWebApp() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var actual = props.getProperty("CONCILIADOR_URL") || "";
  var prompt = ui.prompt(
    "Configurar URL del Web App",
    "Pega aquí la URL de la implementación (/exec) del Web App:\n(Actual: " + (actual || "No configurada") + ")",
    ui.ButtonSet.OK_CANCEL
  );
  if (prompt.getSelectedButton() === ui.Button.OK) {
    var nueva = prompt.getResponseText().trim();
    if (nueva && nueva.indexOf("https://") === 0) {
      props.setProperty("CONCILIADOR_URL", nueva);
      ui.alert("✅ URL configurada correctamente.\n" + nueva);
    } else if (!nueva) {
      props.deleteProperty("CONCILIADOR_URL");
      ui.alert("Se eliminó la URL personalizada. Se usará la detección automática.");
    } else {
      ui.alert("⚠️ La URL debe iniciar con https://");
    }
  }
}

function getConciliadorHtmlOutput() {
  // 1. Sincronización en vivo desde GitHub (Garantiza que Google Sheets use siempre la última versión oficial desplegada)
  try {
    var urlGitHub = "https://raw.githubusercontent.com/Tecnologia100/proteinagro-app/main/CONCILIADOR.html";
    var res = UrlFetchApp.fetch(urlGitHub + "?_ts=" + new Date().getTime(), { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      var htmlText = res.getContentText();
      if (htmlText && htmlText.indexOf("<!DOCTYPE html>") !== -1) {
        return HtmlService.createHtmlOutput(htmlText);
      }
    }
  } catch(e) {
    Logger.log("No se pudo cargar CONCILIADOR desde GitHub en vivo: " + e.toString());
  }

  // 2. Respaldo de contingencia: archivo local interno en Apps Script
  try {
    return HtmlService.createHtmlOutputFromFile('CONCILIADOR');
  } catch(e1) {
    try {
      return HtmlService.createHtmlOutputFromFile('CONCILIADOR.html');
    } catch(e2) {
      throw new Error("No se encontró el archivo HTML 'CONCILIADOR'. Asegúrate de tener conexión a GitHub o de que exista el archivo en Apps Script.");
    }
  }
}

function abrirConciliadorNuevaVentana() {
  var url = getConciliadorWebAppUrl();
  var htmlContent = '<!DOCTYPE html><html><head><base target="_blank">' +
    '<style>' +
    '  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }' +
    '  .btn { display: inline-flex; align-items: center; gap: 8px; background: #0f172a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); transition: all 0.2s; }' +
    '  .btn:hover { background: #1e293b; transform: translateY(-1px); }' +
    '  p { margin: 8px 0 16px 0; color: #64748b; font-size: 13px; text-align: center; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '  <h3 style="margin: 0; color: #0f172a;">🚀 Abriendo Conciliador...</h3>' +
    '  <p>Si la ventana no se abrió automáticamente, haz clic en el botón:</p>' +
    '  <a href="' + url + '" target="_blank" class="btn" id="btnOpen">Abrir Conciliador en Pantalla Completa ↗</a>' +
    '  <script>' +
    '    window.onload = function() {' +
    '      try {' +
    '        var win = window.open("' + url + '", "_blank");' +
    '        if (win) {' +
    '          setTimeout(function() { google.script.host.close(); }, 800);' +
    '        }' +
    '      } catch(e) {}' +
    '    };' +
    '  </script>' +
    '</body>' +
    '</html>';

  var htmlOutput = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(460)
    .setHeight(215);
    
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, '🚀 Conciliador - Ventana Aparte');
}

function abrirConciliadorFlotante() {
  var html = getConciliadorHtmlOutput()
    .setWidth(1350)
    .setHeight(850)
    .setTitle('📊 Conciliador de Materias y Proveedores');
  SpreadsheetApp.getUi().showModelessDialog(html, '📊 Conciliador de Materias y Proveedores (Flotante)');
}

function abrirConciliacionDirectaFlotante() {
  var html = getConciliadorHtmlOutput()
    .setWidth(1350)
    .setHeight(850)
    .setTitle('⚖️ Conciliar Proveedor con Excel');
  html.append('<script>setTimeout(function(){ if(typeof abrirModalConciliacion==="function") abrirModalConciliacion(); }, 500);</script>');
  SpreadsheetApp.getUi().showModelessDialog(html, '⚖️ Conciliar Proveedor con Excel (Flotante)');
}

function abrirDescargaPlantillaSheets() {
  var htmlContent = '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '  <base target="_top">' +
    '  <style>' +
    '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 18px; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; }' +
    '    .title { font-size: 16px; font-weight: 700; color: #1e3a8a; margin-bottom: 6px; display: flex; align-items: center; justify-content: center; gap: 8px; }' +
    '    .desc { font-size: 12.5px; color: #64748b; margin-bottom: 16px; line-height: 1.4; }' +
    '    .actions { display: flex; gap: 10px; margin-top: 20px; }' +
    '    .btn { flex: 1; padding: 10px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; border: none; text-align: center; }' +
    '    .btn-primary { background: #0f172a; color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }' +
    '    .btn-primary:hover { background: #1e293b; }' +
    '    .btn-secondary { background: #e2e8f0; color: #334155; }' +
    '    .btn-secondary:hover { background: #cbd5e1; }' +
    '    #status { font-size: 12px; margin-top: 10px; text-align: center; color: #15803d; font-weight: 600; min-height: 18px; }' +
    '  </style>' +
    '  <script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>' +
    '  <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>' +
    '</head>' +
    '<body>' +
    '  <div class="title">📋 Plantilla Estándar de Conciliación (.xlsx)</div>' +
    '  <div class="desc">Descarga la plantilla oficial en Excel lista para registrar o pegar los despachos de cualquier proveedor (Matriz diaria tipo Frigorivalle con autosumas y formato vertical).</div>' +
    '  <div class="actions">' +
    '    <button class="btn btn-secondary" onclick="google.script.host.close()">Cerrar</button>' +
    '    <button class="btn btn-primary" id="btnDescargar" onclick="generarPlantilla()">📥 Descargar Plantilla (.xlsx)</button>' +
    '  </div>' +
    '  <div id="status"></div>' +
    '  <script>' +
    '    async function generarPlantilla() {' +
    '      var btn = document.getElementById("btnDescargar");' +
    '      var status = document.getElementById("status");' +
    '      btn.disabled = true;' +
    '      status.innerText = "⏳ Generando archivo Excel oficial...";' +
    '      try {' +
    '        var wb = new ExcelJS.Workbook();' +
    '        wb.creator = "PROTEINAGRO S.A.S.";' +
    '        var wsMat = wb.addWorksheet("PLANTILLA_CONSOLIDADO");' +
    '        wsMat.views = [{ showGridLines: true }];' +
    '        wsMat.columns = [' +
    '          { width: 14 }, { width: 20 }, { width: 14 }, { width: 16 }, { width: 16 },' +
    '          { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 28 }' +
    '        ];' +
    '        wsMat.addRow(["PROTEINAGRO S.A.S. - PLANTILLA ESTÁNDAR DE CONCILIACIÓN DE PROVEEDORES"]);' +
    '        wsMat.addRow(["Proveedor: FRIGORIVALLE / SANTA HELENA / PROVEEDOR GENERAL"]);' +
    '        wsMat.addRow([]);' +
    '        wsMat.addRow(["FECHA", "TIQUETE / REMISIÓN", "SEBO (kg)", "HUESO BLANCO (kg)", "GORDANA (kg)", "HUESO DE CERDO (kg)", "CABEZAS (kg)", "MANTECA (kg)", "EMPELLA (kg)", "TOTAL DÍA (kg)", "OBSERVACIONES"]);' +
    '        var headerRow = wsMat.getRow(4);' +
    '        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };' +
    '        headerRow.alignment = { vertical: "middle", horizontal: "center" };' +
    '        headerRow.eachCell(function(cell) { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F497D" } }; });' +
    '        for (var d = 1; d <= 30; d++) {' +
    '          var r = wsMat.addRow([d + "-sep", "", "", "", "", "", "", "", "", { formula: "SUM(C" + (d+4) + ":I" + (d+4) + ")" }, ""]);' +
    '          r.getCell(1).alignment = { horizontal: "center" };' +
    '        }' +
    '        var totRow = wsMat.addRow(["TOTAL GENERAL", "", { formula: "SUM(C5:C34)" }, { formula: "SUM(D5:D34)" }, { formula: "SUM(E5:E34)" }, { formula: "SUM(F5:F34)" }, { formula: "SUM(G5:G34)" }, { formula: "SUM(H5:H34)" }, { formula: "SUM(I5:I34)" }, { formula: "SUM(J5:J34)" }, ""]);' +
    '        totRow.font = { bold: true };' +
    '        var buf = await wb.xlsx.writeBuffer();' +
    '        var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });' +
    '        saveAs(blob, "PLANTILLA_OFICIAL_CONCILIACION_PROVEEDORES.xlsx");' +
    '        status.innerText = "✅ Descargada con éxito. Cerrando ventana...";' +
    '        setTimeout(function() { google.script.host.close(); }, 1800);' +
    '      } catch(e) {' +
    '        status.innerText = "❌ Error: " + e.message;' +
    '        btn.disabled = false;' +
    '      }' +
    '    }' +
    '  </script>' +
    '</body>' +
    '</html>';

  var htmlOutput = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(520)
    .setHeight(280);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, '📋 Descargar Plantilla Oficial');
}

function getDashboardDataRaw() {
  try {
    var ss = null;
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(eAct) {}
    if (!ss || !ss.getSheetByName("Recolecciones")) {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID_DB);
    }
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) {
      return { success: false, error: "No se encontró la pestaña 'Recolecciones' en DB_App_Conductores." };
    }

    var values = sheet.getDataRange().getValues();
    if (!values || values.length <= 1) {
      return { success: true, data: [], proveedores: [] };
    }

    var headers = values[0];
    var colMap = { fecha: -1, proveedor: -1, punto: -1, materia: -1, kg: -1, precio: -1, valor: -1, id: -1, gps: -1, numFactura: -1, valorFactura: -1, fotoFactura: -1 };

    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c] || "").trim().toLowerCase();
      if (/fecha/i.test(h) && colMap.fecha === -1) colMap.fecha = c;
      else if (/proveedor/i.test(h) && colMap.proveedor === -1) colMap.proveedor = c;
      else if (/^punto/i.test(h) && colMap.punto === -1) colMap.punto = c;
      else if (/materia|producto/i.test(h) && colMap.materia === -1) colMap.materia = c;
      else if (/^kg|kilos|peso/i.test(h) && colMap.kg === -1) colMap.kg = c;
      else if (/precio|tarifa/i.test(h) && colMap.precio === -1) colMap.precio = c;
      else if (/numero_factura|num_factura|nro_factura/i.test(h) && colMap.numFactura === -1) colMap.numFactura = c;
      else if (/valor_factura|total_factura/i.test(h) && colMap.valorFactura === -1) colMap.valorFactura = c;
      else if (/foto_factura|soporte_factura/i.test(h) && colMap.fotoFactura === -1) colMap.fotoFactura = c;
      else if (/valor|total/i.test(h) && colMap.valor === -1) colMap.valor = c;
      else if (/^id/i.test(h) && colMap.id === -1) colMap.id = c;
      else if (/gps|ubicaci/i.test(h) && colMap.gps === -1) colMap.gps = c;
    }

    if (colMap.fecha === -1) colMap.fecha = 1;
    if (colMap.proveedor === -1) colMap.proveedor = 4;
    if (colMap.punto === -1) colMap.punto = 5;
    if (colMap.materia === -1) colMap.materia = 6;
    if (colMap.kg === -1) colMap.kg = 7;
    if (colMap.precio === -1) colMap.precio = 10;
    if (colMap.valor === -1) colMap.valor = 11;
    if (colMap.numFactura === -1 && headers.length >= 15) colMap.numFactura = 14;
    if (colMap.valorFactura === -1 && headers.length >= 16) colMap.valorFactura = 15;
    if (colMap.fotoFactura === -1 && headers.length >= 17) colMap.fotoFactura = 16;

    var timeZone = ss.getSpreadsheetTimeZone() || "America/Bogota";
    var data = [];
    var proveedoresSet = {};

    for (var vi = 1; vi < values.length; vi++) {
      var row = values[vi];
      var rawProv = String(row[colMap.proveedor] || "").trim();
      var rawFecha = row[colMap.fecha];
      var rawMat = String(row[colMap.materia] || "").trim();

      if (!rawProv && !rawFecha && !rawMat) continue;

      var fechaStr = "";
      if (rawFecha instanceof Date && !isNaN(rawFecha.getTime())) {
        fechaStr = Utilities.formatDate(rawFecha, timeZone, "d/M/yyyy");
      } else if (rawFecha) {
        fechaStr = String(rawFecha).trim().split(/\s+/)[0];
      }

      var provClean = homologarProveedor(rawProv);
      var rawKg = row[colMap.kg];
      var kg = 0;
      if (typeof rawKg === 'number') kg = rawKg;
      else if (rawKg) kg = parseFloat(String(rawKg).replace(/\./g, '').replace(',', '.')) || 0;

      var rawPrecio = colMap.precio !== -1 ? row[colMap.precio] : 0;
      var precio = 0;
      if (typeof rawPrecio === 'number') precio = rawPrecio;
      else if (rawPrecio) precio = parseFloat(String(rawPrecio).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
      if (precio > 0 && precio < 20) precio = Math.round(precio * 1000);

      var rawVal = colMap.valor !== -1 ? row[colMap.valor] : 0;
      var valor = 0;
      if (typeof rawVal === 'number') valor = rawVal;
      else if (rawVal) valor = parseFloat(String(rawVal).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
      if ((!valor || valor < kg * 50) && kg > 0 && precio > 0) valor = kg * precio;

      if (provClean) proveedoresSet[provClean] = true;

      var numFactStr = (colMap.numFactura !== -1 && row.length > colMap.numFactura && row[colMap.numFactura] !== null && row[colMap.numFactura] !== undefined) ? String(row[colMap.numFactura]).trim() : "";
      var rawValFact = (colMap.valorFactura !== -1 && row.length > colMap.valorFactura) ? row[colMap.valorFactura] : 0;
      var valFactNum = 0;
      if (typeof rawValFact === 'number') valFactNum = rawValFact;
      else if (rawValFact) valFactNum = parseFloat(String(rawValFact).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
      var fotoFactStr = (colMap.fotoFactura !== -1 && row.length > colMap.fotoFactura && row[colMap.fotoFactura] !== null && row[colMap.fotoFactura] !== undefined) ? String(row[colMap.fotoFactura]).trim() : "";

      data.push({
        FECHA: fechaStr,
        PROVEEDOR: provClean,
        PUNTO: String(row[colMap.punto] || "").trim(),
        MATERIA: rawMat,
        KG: kg,
        PRECIO: precio,
        VALOR: valor,
        ID: colMap.id !== -1 ? String(row[colMap.id] || "").trim() : "",
        NUMERO_FACTURA: numFactStr,
        VALOR_FACTURA: valFactNum,
        FOTO_FACTURA: fotoFactStr
      });
    }

    var provList = Object.keys(proveedoresSet).sort(function(a, b) {
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });

    return {
      success: true,
      data: data,
      proveedores: provList
    };
  } catch (err) {
    Logger.log("Error en getDashboardDataRaw: " + err.toString());
    return {
      success: false,
      error: err.toString(),
      data: [],
      proveedores: []
    };
  }
}

var MAPA_HOMOLOGACION_PROVEEDORES = {
  "AGROPECUARIA R. CARNES MAIALE": "Agropecuaria R. Carnes Maiale",
  "ALBERTO MILLAN": "Alberto Millán",
  "ALEJANDRO GARAY": "Alejandro Garay",
  "ANGELO PAREDES": "Angelo Paredes",
  "ARCESIO GIRALDO": "Arcesio Giraldo",
  "AUGUSTO MUNOZ": "Augusto Muñoz",
  "AUTOSERVICIO SURTIMERCAR": "Autoservicio Surtimercar",
  "BARATON CARNES BERLIN": "Baratón Carnes Berlín",
  "BARBARA GOMEZ": "Bárbara Gómez",
  "BELALCAZAR": "Belalcázar",
  "BELALCAZAR BOLIVAR": "Belalcázar Bolívar",
  "BELALCAZAR CARNES Y DERIBADOS OCCIDENTE": "Belalcázar Carnes y Derivados Occidente",
  "BELALCAZAR GALERIA": "Belalcázar Galería",
  "BELALCAZAR GUABINAS": "Belalcázar Guabinas",
  "BELALCAZAR GUACANDAY": "Belalcázar Guacanday",
  "BELALCAZAR PRINCIPAL": "Belalcázar Principal",
  "BELALCAZAR ROZO": "Belalcázar Rozo",
  "BELALCAZAR URIBE": "Belalcázar Uribe",
  "BELOMO": "Belomo",
  "CARIBE": "Caribe",
  "CARIBE BUGA": "Caribe Buga",
  "CARIBE CARNES Y DERIVADOS DE OCC.": "Caribe Carnes y Derivados de Occ.",
  "CARLOS CAICEDO": "Carlos Caicedo",
  "CARLOS REBOLLEDO": "Carlos Rebolledo",
  "CARNES HERNANCHO": "Carnes Hernancho",
  "CARNES MAIALE": "Carnes Maiale",
  "CARNICERIA FABIAN LOPEZ (AGUILA ROJA)": "Carnicería Fabián López (Águila Roja)",
  "CARNICOS LA FAMA": "Cárnicos La Fama",
  "CAVASA": "Cavasa",
  "CENTRAL HENRY MARTINEZ": "Central Henry Martínez",
  "CIUDAD DEL CAMPO": "Ciudad del Campo",
  "CIUDADELA DEL RIO": "Ciudadela del Río",
  "COMERCIALIZADORA R Y E": "Comercializadora R Y E",
  "CRHISTIAN CEDENO": "Crhistian Cedeño",
  "CRISTIAN CEDENO": "Crhistian Cedeño",
  "CUENTA SEVILLANA": "Sevillana",
  "DIEGO BUITRAGO": "Diego Buitrago",
  "DISTRIBUIDORA CARNES MILLAN": "Distribuidora de Carnes Millán",
  "DISTRIBUIDORA DE CARNES MILLAN": "Distribuidora de Carnes Millán",
  "DISTRICARNES LG": "Districarnes LG",
  "EDINSON AGUIRRE": "Edinson Aguirre",
  "EL REBAJON": "El Rebajón",
  "ESTIVEN RIVERA": "Estiven Rivera",
  "FABIAN LOPEZ": "Fabián López",
  "FABIAN RODAS": "Fabián Rodas",
  "FERNANDO LENIS": "Fernando Lenis",
  "FREDY FERNANDEZ": "Fredy Fernández",
  "FRIGOCARNES DEL VALLE SAS": "Frigocarnes del Valle SAS",
  "FRIGORIVALLE": "Frigorivalle",
  "GENERAL": "General",
  "GRAXPRO": "Graxpro",
  "GUACARY SEVILLANA": "Guacarí Sevillana",
  "HEBER GAMBOA": "Heber Gamboa",
  "HENRRY MARTINEZ": "Henry Martínez",
  "HERNANDO HIDALGO": "Hernando Hidalgo",
  "JAIME ZULUAGA": "Jaime Zuluaga",
  "JHON FREDY PINEDA": "Jhon Fredy Pineda",
  "JHON JAIRO BARELA": "Jhon Jairo Barela",
  "JHON VALDEZ": "Jhon Valdez",
  "JHONATAN MARTINEZ": "Jhonatan Martínez",
  "JIMMY SANCLEMENTE": "Yimi Sanclemente",
  "YIMI SANCLEMENTE": "Yimi Sanclemente",
  "JORGE ADRIAN RODAS (VILLAGORGONA)": "Jorge Adrián Rodas (Villagorgona)",
  "JOSE ALEX PAREJA": "José Alexander Pareja",
  "JOSE ALEXANDER PAREJA": "José Alexander Pareja",
  "LA COSECHA DE MI TIERRA": "La Cosecha de Mi Tierra",
  "LA COSECHA MI TIERRA": "La Cosecha de Mi Tierra",
  "LA ESPERANZA": "La Esperanza",
  "LA MONTANA": "La Montaña",
  "LA RESERVA": "La Reserva",
  "LA SEVILLANA": "Sevillana",
  "LA SEVILLANA CARNES Y DERIVADOS DE OCC": "Sevillana Carnes y Derivados de Occ.",
  "LA SEVILLANA FRIGORIVALLE": "Sevillana Frigorivalle",
  "LENA EULER": "Leña Euler",
  "LOS LAGOS": "Los Lagos",
  "MERCAMIO": "Mercamio",
  "MERCAUNION": "Mercaunión",
  "MIGAN CAPITAL": "Migan Capital",
  "MIGUEL ANGEL OTERO": "Miguel Ángel Otero",
  "MILSON GONSALEZ": "Milson González",
  "MILTON MUNOZ": "Milton Muñoz",
  "MIRIAM CUARAN": "Miriam Cuarán",
  "NUTRIALIMENTOS CARNICOS SAS": "Nutrialimentos Cárnicos SAS",
  "NUTRIALIMENTOS VALDEZ (VILLAGORGONA)": "Nutrialimentos Valdez (Villagorgona)",
  "OLIMPICA": "Olímpica",
  "OLIMPICA / CANAVERAL": "Olímpica / Cañaveral",
  "OLIMPICA GUADALUPE": "Olímpica Guadalupe",
  "OLIMPICA LOS LAGOS": "Olímpica Los Lagos",
  "ORLANDO CASTANEDA": "Orlando Castañeda",
  "ORLANDO GIRALDO": "Orlando Giraldo",
  "ORLANDO MARTINEZ": "Orlando Martínez",
  "RICARDO GIL": "Ricardo Gil",
  "SANTA ELENA": "Santa Elena",
  "SEVILLANA": "Sevillana",
  "SEVILLANA ISRAEL PLAZA": "Sevillana Israel Plaza",
  "SEVILLANA LOURDES": "Sevillana Lourdes",
  "SEVILLANA PALMIRA": "Sevillana Palmira",
  "SEVILLANA PASOANCHO": "Sevillana Pasoancho",
  "SEVILLANA REPUBLICA DE ISRAEL": "Sevillana República de Israel",
  "SEVILLANA SANTA ELENA": "Sevillana Santa Elena",
  "SUPER CARNES LA PAZ": "Super Carnes La Paz",
  "SUPER CARNES LOS ANDES": "Super Carnes Los Andes",
  "SUPER CARNES PUNTO ROJO": "Super Carnes Punto Rojo",
  "SUPERTIENDA CANAVERAL": "Supertienda Cañaveral",
  "SUPERTIENDA CANAVERAL - FRIGORIVALLE": "Supertienda Cañaveral - Frigorivalle",
  "YENIFER DIAZ (VILLAGORGONA)": "Yénifer Díaz (Villagorgona)"
};

/**
 * Obtiene el catálogo maestro integral de proveedores de ProteinAgro,
 * totalmente desacoplado de los filtros visuales o restricciones de Puntos_Rutas.
 * Lee Puntos_Rutas (Col B), Tarifas (Col B) y el mapa oficial de homologación.
 */
function obtenerCatalogoProveedoresCompleto(ss) {
  var provSet = {};

  // 1. Catálogo Maestro Puntos_Rutas (Columna B: Proveedor)
  try {
    var sheetPuntos = ss.getSheetByName("Puntos_Rutas");
    if (sheetPuntos && sheetPuntos.getLastRow() > 1) {
      var prData = sheetPuntos.getRange(2, 2, sheetPuntos.getLastRow() - 1, 1).getValues();
      for (var pi = 0; pi < prData.length; pi++) {
        var pProv = homologarProveedor(prData[pi][0]);
        if (pProv) provSet[pProv] = true;
      }
    }
  } catch (ePuntos) {
    Logger.log("Aviso: no se pudo leer Puntos_Rutas para catálogo: " + ePuntos);
  }

  // 2. Catálogo Tarifas (Columna B: Proveedor)
  try {
    var sheetTarifas = ss.getSheetByName("Tarifas");
    if (sheetTarifas && sheetTarifas.getLastRow() > 1) {
      var tarData = sheetTarifas.getRange(2, 2, sheetTarifas.getLastRow() - 1, 1).getValues();
      for (var ti = 0; ti < tarData.length; ti++) {
        var tProv = homologarProveedor(tarData[ti][0]);
        if (tProv) provSet[tProv] = true;
      }
    }
  } catch (eTarifas) {
    Logger.log("Aviso: no se pudo leer Tarifas para catálogo: " + eTarifas);
  }

  // 3. Diccionario oficial en memoria
  if (typeof MAPA_HOMOLOGACION_PROVEEDORES === 'object') {
    for (var k in MAPA_HOMOLOGACION_PROVEEDORES) {
      var ofProv = MAPA_HOMOLOGACION_PROVEEDORES[k];
      if (ofProv) provSet[ofProv] = true;
    }
  }

  return provSet;
}

function getCatalogoProveedoresHttp(ss) {
  try {
    var provSet = obtenerCatalogoProveedoresCompleto(ss);
    var sheetRec = ss.getSheetByName("Recolecciones");
    if (sheetRec && sheetRec.getLastRow() > 1) {
      var rData = sheetRec.getRange(2, 5, sheetRec.getLastRow() - 1, 1).getValues();
      for (var ri = 0; ri < rData.length; ri++) {
        var rp = homologarProveedor(rData[ri][0]);
        if (rp) provSet[rp] = true;
      }
    }
    var lista = Object.keys(provSet).sort(function(a, b) {
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
    return ContentService.createTextOutput(JSON.stringify({ success: true, proveedores: lista }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString(), proveedores: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function removerEmojisDecorativos(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u2B50\u2605\u2728\u2729\u2730\uFE0E\uFE0F]/g, '')
    .replace(/^[*•·\-\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function homologarProveedor(nombreOriginal) {
  if (!nombreOriginal) return "";
  var raw = String(nombreOriginal).trim();
  if (!raw) return "";
  var key = raw.toUpperCase();
  try {
    key = key.normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch(e) {}
  key = key.replace(/\s*-\s*/g, " - ").replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();

  if (typeof MAPA_HOMOLOGACION_PROVEEDORES === 'object' && MAPA_HOMOLOGACION_PROVEEDORES[key]) {
    return MAPA_HOMOLOGACION_PROVEEDORES[key];
  }

  if (!nombreOriginal) return "";
  var raw = String(nombreOriginal).trim();
  if (!raw) return "";
  var key = raw.toUpperCase();
  try {
    key = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch(e) {}
  key = key.replace(/\s*-\s*/g, " - ").replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();

  if (key.indexOf("FRIGORIVALLE") !== -1 && key.indexOf("CANAVERAL") === -1) return "Frigorivalle";
  if (key.indexOf("CANAVERAL") !== -1 || key.indexOf("CAÑAVERAL") !== -1) return "Supertienda Cañaveral";
  if (key.indexOf("SEVILLANA") !== -1) return "Sevillana";
  if (key.indexOf("CARIBE") !== -1) return "Caribe";
  if (key.indexOf("MIGAN CAPITAL") !== -1 || key.indexOf("LA MONTANA") !== -1) return "Migan Capital";
  if (key.indexOf("BODEGA SANTA ELENA") !== -1 || key.indexOf("BODEGA SANTA HELENA") !== -1) return "Bodega Santa Elena";
  if (key.indexOf("SANTA ELENA") !== -1 || key.indexOf("SANTA HELENA") !== -1) return "Santa Elena";
  if (key.indexOf("BELALCAZAR") !== -1) return "Belalcazar";
  if (key.indexOf("MERCAMIO") !== -1) return "Mercamio";
  return aNombrePropio(raw);
}


// ==============================================================================
// FUNCIONES RPC EXCLUSIVAS DEL CONCILIADOR (google.script.run)
// Garantizan 100% compatibilidad en Google Sheets sin interferir con la TWA
// ==============================================================================

/**
 * Consulta independiente del catálogo completo de proveedores (vía google.script.run)
 */
function getCatalogoProveedores() {
  try {
    var ss = null;
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
    if (!ss) {
      var dbId = (typeof SPREADSHEET_ID_DB !== 'undefined') ? SPREADSHEET_ID_DB : "1eQSRvG7vWkIoW3AT5e6Ahi7ndWF6P4OG_Alxo2Go0lU";
      ss = SpreadsheetApp.openById(dbId);
    }
    var provSet = obtenerCatalogoProveedoresCompleto(ss);
    var sheetRec = ss.getSheetByName("Recolecciones");
    if (sheetRec && sheetRec.getLastRow() > 1) {
      var rData = sheetRec.getRange(2, 5, sheetRec.getLastRow() - 1, 1).getValues();
      for (var ri = 0; ri < rData.length; ri++) {
        var rp = homologarProveedor(rData[ri][0]);
        if (rp) provSet[rp] = true;
      }
    }
    var lista = Object.keys(provSet).sort(function(a, b) {
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
    return { success: true, proveedores: lista };
  } catch (err) {
    return { success: false, error: err.toString(), proveedores: [] };
  }
}

/**
 * Persistencia en la nube (PropertiesService) para la Memoria de Equivalencias de Productos por Proveedor
 */
function obtenerMapaProveedoresServer() {
  try {
    var props = PropertiesService.getScriptProperties();
    return props.getProperty('PROTEINAGRO_MAPA_PROVEEDORES_V1') || '{}';
  } catch (e) {
    return '{}';
  }
}

function guardarMapaProveedoresServer(jsonStr) {
  try {
    if (!jsonStr) return false;
    var props = PropertiesService.getScriptProperties();
    props.setProperty('PROTEINAGRO_MAPA_PROVEEDORES_V1', String(jsonStr));
    return true;
  } catch (e) {
    Logger.log('Error en guardarMapaProveedoresServer: ' + e.toString());
    return false;
  }
}

/**
 * Limpieza de números para liquidaciones
 */
function cleanNumberValue(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;

  var s = String(val).trim().replace(/[$\s]/g, '');
  if (!s) return 0;

  if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.indexOf(',') !== -1) {
    s = s.replace(',', '.');
  } else if (s.indexOf('.') !== -1) {
    var parts = s.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      s = parts[0] + parts[1];
    }
  }

  var num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

/**
 * Extrae o deduce el nombre del proveedor a partir del nombre del archivo Excel
 */
function extraerProveedorDeNombreArchivo(fileName) {
  if (!fileName) return "VARIOS PROVEEDORES";
  var m = fileName.match(/^Liquidacion_(.+?)_(?:\d{4}-\d{2}-\d{2}|desde_\d{4}-\d{2}-\d{2}|\d{4})/i);
  if (m) {
    var raw = m[1].replace(/_/g, ' ').trim().toUpperCase();
    if (raw.indexOf("PROVEEDORES") !== -1) {
      return "VARIOS PROVEEDORES";
    }
    return homologarProveedor(raw) || raw;
  }
  if (fileName.indexOf("INFORME_MATERIA_PRIMA") !== -1) {
    return "INFORMES MATERIA PRIMA";
  }
  return "VARIOS PROVEEDORES";
}

/**
 * Obtiene la carpeta de destino organizada en Google Drive:
 * PROTEINAGRO > PROVEEDORES > DOCUMENTOS COMPARTIDOS > LIQUIDACIONES {AÑO} > {PROVEEDOR}
 */
function getCarpetaLiquidacionesDestino(proveedorNombre) {
  var root = DriveApp.getRootFolder();
  var pFolders = root.getFoldersByName("PROTEINAGRO");
  var proveedoresFolder = null;

  while (pFolders.hasNext()) {
    var pFolder = pFolders.next();
    var provFolders = pFolder.getFoldersByName("PROVEEDORES");
    if (!provFolders.hasNext()) {
      provFolders = pFolder.getFoldersByName("Proveedores");
    }
    if (provFolders.hasNext()) {
      proveedoresFolder = provFolders.next();
      break;
    }
  }

  if (!proveedoresFolder) {
    var allProvFolders = DriveApp.getFoldersByName("PROVEEDORES");
    while (allProvFolders.hasNext()) {
      var f = allProvFolders.next();
      var parents = f.getParents();
      if (parents.hasNext() && parents.next().getName().toUpperCase() === "PROTEINAGRO") {
        proveedoresFolder = f;
        break;
      }
    }
  }

  if (!proveedoresFolder) {
    var parentP = root.getFoldersByName("PROTEINAGRO");
    var baseP = parentP.hasNext() ? parentP.next() : root;
    proveedoresFolder = baseP.createFolder("PROVEEDORES");
  }

  var docCompFolders = proveedoresFolder.getFoldersByName("DOCUMENTOS COMPARTIDOS");
  if (!docCompFolders.hasNext()) {
    docCompFolders = proveedoresFolder.getFoldersByName("Documentos compartidos");
  }
  var docCompFolder = docCompFolders.hasNext() ? docCompFolders.next() : proveedoresFolder.createFolder("DOCUMENTOS COMPARTIDOS");

  var anioFolderName = "LIQUIDACIONES " + (new Date().getFullYear());
  var anioFolders = docCompFolder.getFoldersByName(anioFolderName);
  var anioFolder = anioFolders.hasNext() ? anioFolders.next() : docCompFolder.createFolder(anioFolderName);

  var provClean = (proveedorNombre || "VARIOS PROVEEDORES").trim().toUpperCase();
  provClean = provClean.replace(/[/\\?%*:|"<>]/g, '').trim() || "VARIOS PROVEEDORES";

  var provFoldersDest = anioFolder.getFoldersByName(provClean);
  var provFolder = provFoldersDest.hasNext() ? provFoldersDest.next() : anioFolder.createFolder(provClean);

  return {
    targetFolder: provFolder,
    folderName: anioFolderName + " / " + provClean,
    folderUrl: provFolder.getUrl(),
    docCompUrl: docCompFolder.getUrl()
  };
}

/**
 * Guarda el archivo Excel de liquidación o informe en la carpeta compartida de Google Drive
 */
function saveExcelToDriveFolder(base64Data, fileName, optProvName) {
  try {
    var provName = optProvName;
    if (!provName) {
      provName = extraerProveedorDeNombreArchivo(fileName);
    }

    var dest = getCarpetaLiquidacionesDestino(provName);
    var targetFolder = dest.targetFolder;

    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(
      decoded,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName
    );

    var existingFiles = targetFolder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      try { existingFiles.next().setTrashed(true); } catch (eTrash) {}
    }
    var file = targetFolder.createFile(blob);

    return {
      success: true,
      fileUrl: file.getUrl(),
      fileName: file.getName(),
      folderUrl: targetFolder.getUrl(),
      folderName: dest.folderName,
      docCompUrl: dest.docCompUrl
    };
  } catch (err) {
    Logger.log("Error en saveExcelToDriveFolder: " + err.toString());
    return {
      success: false,
      error: err.message || err.toString()
    };
  }
}
