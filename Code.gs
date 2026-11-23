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
    if (e && e.parameter && (e.parameter.action === 'saveRecoleccion' || e.parameter.action === 'saveNovedad' || (!e.parameter.action && e.parameter.payload && !e.parameter.t))) {
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
      var prodTarget = e.parameter.producto || e.parameter.materia || '';
      return eliminarRecoleccionSheet(ss, e.parameter.id, prodTarget);
    }

    // 0.05 Si viene una petición de actualización/edición de recolección
    if (e && e.parameter && e.parameter.action === 'updateRecoleccion') {
      return actualizarRecoleccionSheet(ss, e.parameter.payload);
    }

    // 0.081 Homologar masivamente nombres de rutas y limpiar Kilos anómalos
    if (e && e.parameter && e.parameter.action === 'homologarRutas') {
      return homologarRutasYLimpiarSheet(ss);
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

    // 0.087 Habilitar columnas de Soporte de Pesaje y Visto Bueno X:Z (v1.9.8)
    if (e && e.parameter && (e.parameter.action === 'habilitarColumnasSoporte' || e.parameter.action === 'crearColumnasSoporte')) {
      return habilitarColumnasSoporteHttp(ss);
    }

    // 0.088 Aplicar novedades automáticas desde Conciliador (v1.9.1)
    if (e && e.parameter && e.parameter.action === 'aplicarNovedadesConciliacion') {
      var payloadConc = e.parameter.payload || e.parameter.data || '';
      return aplicarNovedadesConciliacionSheet(ss, payloadConc);
    }

    // 0.1 Diagnóstico en vivo de Precios y Recolecciones
    if (e && e.parameter && e.parameter.action === 'debugPrecios') {
      return diagnosticoPreciosSheet(ss, e.parameter.proveedor, e.parameter.producto);
    }

    // 0.15 Alta rápida de producto / materia prima en Tarifas y Productos (v1.9.6)
    if (e && e.parameter && e.parameter.action === 'crearProductoTarifa') {
      var pData = {};
      if (e.parameter.payload) {
        try { pData = JSON.parse(e.parameter.payload); } catch(ex) { pData = e.parameter; }
      } else {
        pData = e.parameter;
      }
      var resCrear = crearProductoTarifaSheet(ss, pData);
      return ContentService.createTextOutput(JSON.stringify(resCrear))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 0.16 Gestor Rápido de Tarifas y Vigencia Temporal (v2.0.0)
    if (e && e.parameter && e.parameter.action === 'getTarifas') {
      return obtenerTarifasHttp_(ss);
    }
    if (e && e.parameter && e.parameter.action === 'actualizarTarifasMasivo') {
      var payloadTar = e.parameter.payload || e.parameter.data || e.parameter;
      return actualizarTarifasMasivoSheet_(ss, payloadTar);
    }
    if (e && e.parameter && e.parameter.action === 'aplicarListaPreciosNov23') {
      return aplicarListaPreciosNov23Sheet_(ss);
    }
    if (e && e.parameter && e.parameter.action === 'aplicarListaPrecios2Nov23') {
      return aplicarListaPrecios2Nov23Sheet_(ss);
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
      productos = ["ACEITE", "CABEZAS", "DESPERDICIO", "EMPELLA", "GORDANA", "HUESO BLANCO", "HUESO DE CERDO", "HUESO SECO", "HUESO DE POLLO", "MANTECA", "MARGARINA", "MANTEQUILLA", "PIEL POLLO", "SEBO EN RAMA", "OREJAS DE CERDO", "PULMON DE CERDO", "CALAMBOMBO DE CERDO", "CALAMBOMBO DE RES", "TRAQUEAS", "HUESO PROMOCION", "PIELES", "LEÑA"];
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

    // Mapa dinámico de productos por proveedor desde Tarifas (v2.0.0 con Vigente_Desde)
    var sheetTarifas = ss.getSheetByName("Tarifas");
    var mapaProveedorProductos = {};
    if (sheetTarifas && sheetTarifas.getLastRow() > 1) {
      var lastRowT = sheetTarifas.getLastRow();
      var lastColT = Math.min(sheetTarifas.getMaxColumns(), Math.max(6, sheetTarifas.getLastColumn()));
      var headersT = sheetTarifas.getRange(1, 1, 1, lastColT).getValues()[0];
      var colIdxT = { prov: 1, punto: 2, prod: 3, estado: 5, vigenteDesde: (lastColT >= 8 ? 7 : -1) };
      for (var hc = 0; hc < headersT.length; hc++) {
        var hh = normalizarTexto(headersT[hc]);
        if (hh.indexOf('proveedor') !== -1) colIdxT.prov = hc;
        else if (hh.indexOf('punto') !== -1 || hh.indexOf('sucursal') !== -1) colIdxT.punto = hc;
        else if (hh.indexOf('producto') !== -1 || hh.indexOf('materia') !== -1) colIdxT.prod = hc;
        else if (hh.indexOf('estado') !== -1) colIdxT.estado = hc;
        else if (hh.indexOf('vigente') !== -1 || hh.indexOf('vigencia') !== -1) colIdxT.vigenteDesde = hc;
      }
      var hoyIso = obtenerFechaHoyIsoColombia_();
      var tData = sheetTarifas.getRange(2, 1, lastRowT - 1, lastColT).getValues();
      for (var ti = 0; ti < tData.length; ti++) {
        var tProv = homologarProveedor(tData[ti][colIdxT.prov]);
        var tPunto = homologarPunto(tData[ti][colIdxT.punto]);
        var tProd = String(tData[ti][colIdxT.prod] || '').trim().toUpperCase();
        var tEst = String(tData[ti][colIdxT.estado] || 'Activo').trim().toLowerCase();
        if (!tProv || !tProd || tEst === 'inactivo') continue;

        var rawVigT = (colIdxT.vigenteDesde !== -1 && colIdxT.vigenteDesde < tData[ti].length) ? tData[ti][colIdxT.vigenteDesde] : '';
        var tVigIso = normalizarFechaIso_(rawVigT, '2026-01-01');
        if (tVigIso > hoyIso) continue;
        
        var keyPunto = tProv + '|' + tPunto;
        if (!mapaProveedorProductos[keyPunto]) mapaProveedorProductos[keyPunto] = [];
        if (mapaProveedorProductos[keyPunto].indexOf(tProd) === -1) {
          mapaProveedorProductos[keyPunto].push(tProd);
        }
        
        if (!mapaProveedorProductos[tProv]) mapaProveedorProductos[tProv] = [];
        if (mapaProveedorProductos[tProv].indexOf(tProd) === -1) {
          mapaProveedorProductos[tProv].push(tProd);
        }
      }
    }

    var output = {
      version: "2.0.0-vigencia-tarifas",
      productos: productos,
      conductores: conductores,
      conductores_detalle: conductoresDetalle,
      admin_clave: adminClave,
      rutas: rutas,
      puntos_rutas: puntosRutas,
      proveedores: listaProveedoresCompleta,
      proveedor_productos: mapaProveedorProductos
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

    // Desactivar filtros de interfaz que puedan truncar o bloquear GViz/TSV
    try {
      var activeFilter = sheet.getFilter();
      if (activeFilter) {
        activeFilter.remove();
      }
    } catch (eFilt) {
      Logger.log("Aviso al remover filtro: " + eFilt);
    }

    var lastRow = sheet.getLastRow();
    // Leer columnas A hasta T (ID..Observaciones, Precio, Valor, Factura, Soporte)
    var numCols = Math.min(sheet.getLastColumn(), 21);
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

      var rawPrecio = row.length > 10 ? row[10] : 0;
      var numPrecio = typeof rawPrecio === 'number' ? rawPrecio : (parseFloat(String(rawPrecio).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0);
      var rawValor = row.length > 11 ? row[11] : 0;
      var numValor = typeof rawValor === 'number' ? rawValor : (parseFloat(String(rawValor).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0);

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
        precio: numPrecio,
        valor: numValor,
        numeroFactura: row.length > 14 ? String(row[14] || '').trim() : '',
        valorFactura: row.length > 15 && row[15] !== '' ? (parseFloat(String(row[15]).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0) : 0,
        fotoFactura: row.length > 16 ? String(row[16] || '').trim() : '',
        tipoSoporte: row.length > 17 ? String(row[17] || '').trim() : '',
        fotoSoporte: row.length > 18 ? String(row[18] || '').trim() : '',
        entregadoPor: row.length > 19 ? String(row[19] || '').trim() : ''
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

function guardarRecoleccionSheet(ss, rawPayload, skipLock) {
  var lock = null;
  var lockAcquired = false;
  try {
    // 1. Bloqueo de concurrencia: evitar que sincronizaciones simultáneas sobreescriban filas o colisionen
    if (!skipLock) {
      lock = LockService.getScriptLock();
      try {
        lockAcquired = lock.tryLock(20000); // 20 segundos máx de espera
      } catch (eLock) {
        Logger.log("Aviso LockService: " + eLock.toString());
      }
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
    var entregadoPor = String(data.entregadoPor || data.entregado_por || '').trim();
    var tipoSoporte = String(data.tipoSoporte || data.tipo_soporte || '').trim();
    var fotoSoporte = String(data.fotoSoporte || data.foto_soporte || '').trim();
    
    // Si no vino fotoSoporte explícita o vino texto genérico pero hay id de recolección
    if ((!fotoSoporte || fotoSoporte === 'Foto Soporte Registrada') && id && !String(id).startsWith('NOV-')) {
      fotoSoporte = 'https://proteinagro-app.vercel.app/?view=soporte&id=' + encodeURIComponent(id);
    }

    var observaciones = data.observaciones || '';
    if (entregadoPor !== '') {
      var entPrefijo = '[Entregó: ' + entregadoPor + ']';
      if (observaciones.indexOf(entPrefijo) === -1) {
        observaciones = (entPrefijo + ' ' + observaciones).trim();
      }
    }
    if (tipoSoporte !== '') {
      var sopPrefijo = '[Soporte: ' + tipoSoporte + ']';
      if (observaciones.indexOf(sopPrefijo) === -1) {
        observaciones = (sopPrefijo + ' ' + observaciones).trim();
      }
    }
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
    var preciosPreservados = (data._preciosPreservados && typeof data._preciosPreservados === 'object') ? data._preciosPreservados : null;

    var filasNuevas = [];
    var filasFactura = [];
    var filasSoporte = [];

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

      // Búsqueda inteligente en memoria (Precio preservado en edición -> Tarifas por fecha -> Histórico)
      var precio = '';
      var valor = '';
      if (esNovedad) {
        prodKilos = 0;
        precio = 0;
        valor = 0;
      } else {
        var precioPreservado = null;
        if (preciosPreservados && prodNombre) {
          var prodNormPres = normalizarTexto(prodNombre);
          if (preciosPreservados[prodNormPres] && preciosPreservados[prodNormPres] > 0) {
            precioPreservado = preciosPreservados[prodNormPres];
          } else {
            for (var pk in preciosPreservados) {
              if (preciosPreservados[pk] > 0 && productosCoinciden(pk, prodNombre)) {
                precioPreservado = preciosPreservados[pk];
                break;
              }
            }
          }
        }
        if (precioPreservado !== null) {
          precio = precioPreservado;
        } else {
          var pTarifa = buscarPrecioEnCatalogoTarifas(catalogoTarifas, proveedor, punto, prodNombre, fecha);
          if (pTarifa !== null && pTarifa > 0) {
            precio = pTarifa;
          } else {
            // Si no está en Tarifas, consultar histórico de Recolecciones (cargado a lo sumo 1 vez)
            if (!catalogoHistorico) {
              catalogoHistorico = cargarHistoricoRecolecciones(ss);
            }
            precio = buscarPrecioEnHistorico(catalogoHistorico, proveedor, punto, prodNombre);
          }
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
      filasSoporte.push([
        sanitizarParaHoja(tipoSoporte),
        sanitizarParaHoja(fotoSoporte),
        sanitizarParaHoja(aNombrePropio(entregadoPor))
      ]);

      existingRecordsMap[prodKey] = true;
      existingIdsMap[id] = true;
    }

    // 3. Escritura atómica en lote (1 sola llamada setValues para A:L, 1 para O:Q y 1 para X:Z sin tocar M:N ni R:W)
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
      // Garantizar columnas oficiales de Soporte de Pesaje X, Y, Z (Cols 24 a 26) sin tocar duplicados
      garantizarEstructuraColumnasSoporte(sheet);

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

      // Escribir columnas de Soporte de Pesaje (R:T -> Cols 18:20)
      if (tipoSoporte || fotoSoporte || entregadoPor) {
        sheet.getRange(targetRow + 1, 18, filasSoporte.length, 3).setValues(filasSoporte);
      } else {
        var cleanEmptySop = [];
        for (var cEmptyS = 0; cEmptyS < filasNuevas.length; cEmptyS++) {
          cleanEmptySop.push(['', '', '']);
        }
        sheet.getRange(targetRow + 1, 18, cleanEmptySop.length, 3).setValues(cleanEmptySop);
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
    if (lockAcquired && lock) {
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

// ==============================================================================
// GARANTIZAR ESTRUCTURA DE COLUMNAS DE SOPORTE DE PESAJE (v1.9.8)
// Habilita las columnas R:T (18 a 20) para Tipo_Soporte, Foto_Soporte, Entregado_Por
// ==============================================================================
function garantizarEstructuraColumnasSoporte(sheet) {
  if (!sheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    sheet = ss.getSheetByName("Recolecciones");
  }
  if (!sheet) return { configurado: false, razon: "No existe la hoja Recolecciones" };

  var maxCols = sheet.getMaxColumns();
  if (maxCols < 20) {
    sheet.insertColumnsAfter(maxCols, 20 - maxCols);
  }

  var hdrR = String(sheet.getRange(1, 18).getValue() || '').trim();
  var hdrS = String(sheet.getRange(1, 19).getValue() || '').trim();
  var hdrT = String(sheet.getRange(1, 20).getValue() || '').trim();

  if (hdrR === "Tipo_Soporte" && hdrS === "Foto_Soporte" && hdrT === "Entregado_Por") {
    return { configurado: true, razon: "Columnas R:T ya configuradas" };
  }

  var rangeHdr = sheet.getRange(1, 18, 1, 3);
  rangeHdr.setValues([["Tipo_Soporte", "Foto_Soporte", "Entregado_Por"]]);
  rangeHdr.setBackground('#065f46')
          .setFontColor('#ffffff')
          .setFontWeight('bold')
          .setHorizontalAlignment('center');

  return { configurado: true, razon: "Encabezados R:T configurados exitosamente" };
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

function menuHabilitarColumnasSoporte() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) {
      SpreadsheetApp.getUi().alert("Error: No se encontró la hoja Recolecciones.");
      return;
    }
    var res = garantizarEstructuraColumnasSoporte(sheet);
    SpreadsheetApp.getUi().alert(
      "✅ Columnas de Soporte Habilitadas en R:T:\n\n" +
      "1. Se configuraron los encabezados en las columnas 18, 19 y 20:\n" +
      "   - Columna R: Tipo_Soporte (Báscula, Cuaderno, Recibo)\n" +
      "   - Columna S: Foto_Soporte (Enlace a la fotografía de pesaje)\n" +
      "   - Columna T: Entregado_Por (Nombre del carnicero / responsable)\n\n" +
      "Las recolecciones registrarán automáticamente estos datos en estas columnas."
    );
  } catch(e) {
    SpreadsheetApp.getUi().alert("Error: " + e.toString());
  }
}

function habilitarColumnasSoporteHttp(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) throw new Error("No existe la hoja Recolecciones.");
    var res = garantizarEstructuraColumnasSoporte(sheet);
    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      message: "Columnas R:T (Tipo_Soporte, Foto_Soporte, Entregado_Por) configuradas exitosamente",
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
// ACTUALIZAR / CORREGIR RECOLECCIÓN EXISTENTE EN HOJA RECOLECCIONES (v2.0.0)
// Blindado con LockService y preservación de precios históricos y soportes
// ==============================================================================
function actualizarRecoleccionSheet(ss, rawPayload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    lock.waitLock(20000);
    lockAcquired = true;
  } catch (eLock) {
    return ContentService.createTextOutput(JSON.stringify({
      "result": "error",
      "error": "El servidor está ocupado procesando otra actualización. Intente en unos segundos."
    })).setMimeType(ContentService.MimeType.JSON);
  }

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
    var preciosHistoricosPorProd = {};
    var prevMeta = {
      fecha: '',
      proveedor: '',
      ubicacionGps: '',
      numeroFactura: '',
      valorFactura: '',
      fotoFactura: '',
      tipoSoporte: '',
      fotoSoporte: '',
      entregadoPor: ''
    };

    if (lastRow > 1) {
      var colsToRead = Math.min(sheet.getLastColumn(), 20);
      var allRowsData = sheet.getRange(2, 1, lastRow - 1, colsToRead).getValues();
      var rowsToDelete = [];
      for (var r = allRowsData.length - 1; r >= 0; r--) {
        var row = allRowsData[r];
        var currentId = String(row[0] || '').trim();
        if (currentId === idTarget) {
          rowsToDelete.push(r + 2); // Índice base 1

          // Preservar precios históricos por producto (> 0)
          var oldProd = colsToRead > 6 ? normalizarTexto(row[6]) : '';
          var oldPrecio = colsToRead > 10 ? parsePrecioMoneda(row[10]) : null;
          if (oldProd && oldPrecio !== null && oldPrecio > 0 && !preciosHistoricosPorProd[oldProd]) {
            preciosHistoricosPorProd[oldProd] = oldPrecio;
          }

          // Preservar metadatos existentes si el payload no los trae
          if (!prevMeta.fecha && colsToRead > 1 && row[1]) {
            prevMeta.fecha = (row[1] instanceof Date)
              ? Utilities.formatDate(row[1], "GMT-5", "d/M/yyyy HH:mm:ss")
              : String(row[1]).trim();
          }
          if (!prevMeta.proveedor && colsToRead > 4 && row[4]) {
            prevMeta.proveedor = String(row[4]).trim();
          }
          if (colsToRead > 9) {
            var gpsVal = String(row[9] || '').trim();
            if (gpsVal && gpsVal !== '0' && !prevMeta.ubicacionGps) prevMeta.ubicacionGps = gpsVal;
          }
          if (colsToRead > 14 && !prevMeta.numeroFactura) {
            var nfVal = String(row[14] || '').trim();
            if (nfVal) prevMeta.numeroFactura = nfVal;
          }
          if (colsToRead > 15 && prevMeta.valorFactura === '') {
            var vfVal = row[15];
            var vfNum = parsePrecioMoneda(vfVal);
            if (vfNum !== null && vfNum > 0) {
              prevMeta.valorFactura = vfNum;
            }
          }
          if (colsToRead > 16 && !prevMeta.fotoFactura) {
            var ffVal = String(row[16] || '').trim();
            if (ffVal) prevMeta.fotoFactura = ffVal;
          }
          if (colsToRead > 17 && !prevMeta.tipoSoporte) {
            var tsVal = String(row[17] || '').trim();
            if (tsVal) prevMeta.tipoSoporte = tsVal;
          }
          if (colsToRead > 18 && !prevMeta.fotoSoporte) {
            var fsVal = String(row[18] || '').trim();
            if (fsVal) prevMeta.fotoSoporte = fsVal;
          }
          if (colsToRead > 19 && !prevMeta.entregadoPor) {
            var epVal = String(row[19] || '').trim();
            if (epVal) prevMeta.entregadoPor = epVal;
          }
        }
      }
      for (var d = 0; d < rowsToDelete.length; d++) {
        sheet.deleteRow(rowsToDelete[d]);
      }
    }

    // Completar metadatos preservados solo si el payload entrante no los envía
    if (!data.fecha && prevMeta.fecha) data.fecha = prevMeta.fecha;
    if ((!data.ubicacionGps || String(data.ubicacionGps).trim() === '' || String(data.ubicacionGps).trim() === '0') && prevMeta.ubicacionGps) {
      data.ubicacionGps = prevMeta.ubicacionGps;
    }
    if (!String(data.numeroFactura || data.numero_factura || '').trim() && prevMeta.numeroFactura) {
      data.numeroFactura = prevMeta.numeroFactura;
    }
    var incValFact = (data.valorFactura !== undefined && data.valorFactura !== null && data.valorFactura !== '')
      ? data.valorFactura
      : data.valor_factura;
    var incValFactNum = parsePrecioMoneda(incValFact);
    if ((incValFactNum === null || incValFactNum <= 0) && prevMeta.valorFactura !== '') {
      data.valorFactura = prevMeta.valorFactura;
    }
    if (!String(data.fotoFactura || data.foto_factura || '').trim() && prevMeta.fotoFactura) {
      data.fotoFactura = prevMeta.fotoFactura;
    }
    if (!String(data.tipoSoporte || data.tipo_soporte || '').trim() && prevMeta.tipoSoporte) {
      data.tipoSoporte = prevMeta.tipoSoporte;
    }
    if (!String(data.fotoSoporte || data.foto_soporte || '').trim() && prevMeta.fotoSoporte) {
      data.fotoSoporte = prevMeta.fotoSoporte;
    }
    if (!String(data.entregadoPor || data.entregado_por || '').trim() && prevMeta.entregadoPor) {
      data.entregadoPor = prevMeta.entregadoPor;
    }
    var mismoProveedor = !prevMeta.proveedor || !data.proveedor || (normalizarTexto(data.proveedor) === normalizarTexto(prevMeta.proveedor));
    if (mismoProveedor && Object.keys(preciosHistoricosPorProd).length > 0) {
      data._preciosPreservados = preciosHistoricosPorProd;
    }

    // Re-insertar filas corregidas preservando precio histórico (skipLock = true porque ya tenemos ScriptLock)
    return guardarRecoleccionSheet(ss, data, true);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch(eRel) {}
    }
  }
}

// ==============================================================================
// APLICACIÓN AUTOMÁTICA DE NOVEDADES DESDE CONCILIADOR (v1.9.1)
// Soporta Opción 1 (1-clic individual) y Opción 2 (Sincronización masiva con lote)
// Acciones: INSERTAR_FALTANTE (crea nueva fila en Recolecciones) y AJUSTAR_PESO (actualiza Kg y Valor)
// ==============================================================================
function aplicarNovedadesConciliacionSheet(ss, rawPayload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    lockAcquired = lock.tryLock(25000);
  } catch (eLock) {
    lockAcquired = false;
  }
  if (!lockAcquired) {
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      error: "El sistema contable está procesando otra transacción concurrente. Por favor intente en unos segundos."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) throw new Error("No existe la hoja Recolecciones.");

    var data = null;
    if (typeof rawPayload === 'string') {
      try { data = JSON.parse(rawPayload); } catch(e) { data = null; }
    } else {
      data = rawPayload;
    }

    if (!data) throw new Error("Payload no válido.");
    var novedades = Array.isArray(data.novedades) ? data.novedades : (Array.isArray(data) ? data : [data]);
    if (novedades.length === 0) throw new Error("No se suministraron novedades para aplicar.");

    var lastRow = sheet.getLastRow();
    var catalogoTarifas = cargarCatalogoTarifas(ss);
    var catalogoHistorico = null;

    // Indexar filas existentes para búsquedas rápidas por ID o combinación (Fecha + Proveedor + Punto + Producto)
    var idRowIndexMap = {}; // id -> [rowIndex1, rowIndex2, ...]
    var allData = [];
    if (lastRow > 1) {
      allData = sheet.getRange(2, 1, lastRow - 1, Math.min(sheet.getLastColumn(), 17)).getValues();
      for (var r = 0; r < allData.length; r++) {
        var rowId = String(allData[r][0] || '').trim();
        if (rowId) {
          if (!idRowIndexMap[rowId]) idRowIndexMap[rowId] = [];
          idRowIndexMap[rowId].push(r + 2); // 1-based row index en hoja
        }
      }
    }

    var insertados = 0;
    var actualizados = 0;
    var detalles = [];
    var filasNuevas = [];
    var filasFactura = [];

    // Determinar última fila con datos en Col B
    var targetRow = 1;
    if (lastRow > 1) {
      var colBValues = sheet.getRange(1, 2, Math.max(lastRow, 2), 1).getValues();
      for (var b = colBValues.length - 1; b >= 0; b--) {
        if (colBValues[b][0] !== "" && colBValues[b][0] !== null) {
          targetRow = b + 1;
          break;
        }
      }
    }

    for (var i = 0; i < novedades.length; i++) {
      var nov = novedades[i];
      var tipo = String(nov.tipoNovedad || nov.tipo || '').toUpperCase().trim();
      var prodNombre = String(nov.producto || nov.materia || '').trim();
      var kgTarget = parseKilosNumero(nov.kilos !== undefined ? nov.kilos : (nov.kilosProveedor !== undefined ? nov.kilosProveedor : (nov.kg || 0)));
      var punto = nov.punto || nov.sucursal || '';
      var prov = removerEmojisDecorativos(nov.proveedor || '');
      if (prov.indexOf('/') !== -1) {
        var provParts = prov.split('/').map(function(p) { return p.trim(); }).filter(Boolean);
        if (provParts.length > 0) {
          var mejorProv = provParts[0];
          for (var pp = 0; pp < provParts.length; pp++) {
            if (buscarPrecioEnCatalogoTarifas(catalogoTarifas, provParts[pp], punto, prodNombre, nov.fechaHora || nov.fecha) > 0) {
              mejorProv = provParts[pp];
              break;
            }
          }
          prov = mejorProv;
        }
      }
      var ruta = nov.ruta || '';
      var cond = nov.conductor || '';
      var numFactura = String(nov.factura || nov.numeroFactura || nov.numero_factura || '').trim();

      if (tipo === 'AJUSTAR_PESO' || tipo === 'DESVIACION') {
        // Buscar fila existente para actualizar peso
        var rowToUpdate = -1;
        var rowArrIndex = -1;

        if (nov.id && idRowIndexMap[nov.id]) {
          var matchedRows = idRowIndexMap[nov.id];
          for (var m = 0; m < matchedRows.length; m++) {
            var rIdx = matchedRows[m];
            var rowArray = allData[rIdx - 2];
            var pHoja = String(rowArray[6] || '').trim();
            if (productosCoinciden(pHoja, prodNombre) || matchedRows.length === 1) {
              rowToUpdate = rIdx;
              rowArrIndex = rIdx - 2;
              break;
            }
          }
        }

        // Si no se ubicó por ID, buscar por Fecha + Proveedor + Producto
        if (rowToUpdate === -1 && nov.fecha && allData.length > 0) {
          var targetDateNorm = normalizarFechaDia(nov.fecha);
          var targetProvNorm = normalizarTexto(prov);
          var targetPuntoNorm = normalizarTexto(punto);
          for (var ar = allData.length - 1; ar >= 0; ar--) {
            var fHoja = normalizarFechaDia(allData[ar][1]);
            var prHoja = normalizarTexto(allData[ar][4]);
            var ptHoja = normalizarTexto(allData[ar][5]);
            var pdHoja = String(allData[ar][6] || '').trim();

            if (fHoja === targetDateNorm && productosCoinciden(pdHoja, prodNombre)) {
              if (!targetProvNorm || prHoja.indexOf(targetProvNorm) !== -1 || targetProvNorm.indexOf(prHoja) !== -1) {
                if (!targetPuntoNorm || ptHoja.indexOf(targetPuntoNorm) !== -1 || targetPuntoNorm.indexOf(ptHoja) !== -1) {
                  rowToUpdate = ar + 2;
                  rowArrIndex = ar;
                  break;
                }
              }
            }
          }
        }

        if (rowToUpdate !== -1) {
          var rowData = allData[rowArrIndex];
          var prevKg = parseKilosNumero(rowData[7]);
          var prevPrecio = parsePrecioMoneda(rowData[10]);

          if (prevPrecio === null || prevPrecio <= 0) {
            var pTarifa = buscarPrecioEnCatalogoTarifas(catalogoTarifas, prov || rowData[4], punto || rowData[5], prodNombre, rowData[1] || nov.fechaHora || nov.fecha);
            if (pTarifa !== null && pTarifa > 0) {
              prevPrecio = pTarifa;
            } else {
              if (!catalogoHistorico) catalogoHistorico = cargarHistoricoRecolecciones(ss);
              prevPrecio = buscarPrecioEnHistorico(catalogoHistorico, prov || rowData[4], punto || rowData[5], prodNombre) || 0;
            }
          }

          var nuevoValor = (prevPrecio > 0 && kgTarget > 0) ? Math.round(prevPrecio * kgTarget * 100) / 100 : '';
          var prevObs = String(rowData[8] || '').trim();
          var cambioPeso = Math.abs(prevKg - kgTarget) >= 0.001;
          var obsFinal = prevObs;
          if (cambioPeso) {
            var notaAjuste = "Ajustado por Conciliador Proveedor (Antes: " + prevKg + " Kg, Nuevo: " + kgTarget + " Kg)";
            obsFinal = prevObs ? (prevObs + " | " + notaAjuste) : notaAjuste;
          }

          // Actualizar Col H (Kg), I (Observaciones), K (Precio si estaba vacío), L (Valor)
          sheet.getRange(rowToUpdate, 8).setValue(kgTarget);
          if (cambioPeso) {
            sheet.getRange(rowToUpdate, 9).setValue(sanitizarParaHoja(capitalizarOracion(obsFinal)));
          }
          if (prevPrecio > 0) {
            sheet.getRange(rowToUpdate, 11).setValue(prevPrecio);
          }
          sheet.getRange(rowToUpdate, 12).setValue(nuevoValor);

          // Si vino factura y la celda Col O está vacía
          if (numFactura && sheet.getMaxColumns() >= 15) {
            var curFac = String(sheet.getRange(rowToUpdate, 15).getValue() || '').trim();
            if (!curFac) {
              sheet.getRange(rowToUpdate, 15).setValue(sanitizarParaHoja(numFactura));
            }
          }

          // Actualizar en memoria local
          allData[rowArrIndex][7] = kgTarget;
          allData[rowArrIndex][8] = obsFinal;
          allData[rowArrIndex][10] = prevPrecio;
          allData[rowArrIndex][11] = nuevoValor;

          actualizados++;
          detalles.push({
            id: rowData[0],
            accion: 'AJUSTADO',
            fila: rowToUpdate,
            producto: prodNombre,
            kgAnterior: prevKg,
            kgNuevo: kgTarget,
            valorNuevo: nuevoValor,
            _uid: nov._uid || ''
          });
        } else {
          detalles.push({
            id: nov.id || '',
            accion: 'NO_ENCONTRADO_PARA_AJUSTE',
            producto: prodNombre,
            _uid: nov._uid || ''
          });
        }
      } else if (tipo === 'RECLASIFICAR' || tipo === 'CAMBIAR_PRODUCTO') {
        var prodAnterior = String(nov.productoAnterior || nov.producto || '').trim();
        var prodNuevo = String(nov.productoNuevo || nov.nuevoProducto || '').trim();
        var rowToUpdate = -1;
        var rowArrIndex = -1;

        if (nov.id && idRowIndexMap[nov.id]) {
          var matchedRows = idRowIndexMap[nov.id];
          for (var m = 0; m < matchedRows.length; m++) {
            var rIdx = matchedRows[m];
            var rowArray = allData[rIdx - 2];
            var pHoja = String(rowArray[6] || '').trim();
            if (productosCoinciden(pHoja, prodAnterior) || matchedRows.length === 1) {
              rowToUpdate = rIdx;
              rowArrIndex = rIdx - 2;
              break;
            }
          }
        }

        if (rowToUpdate === -1 && nov.fecha && allData.length > 0) {
          var targetDateNorm = normalizarFechaDia(nov.fecha);
          var targetProvNorm = normalizarTexto(prov);
          var targetPuntoNorm = normalizarTexto(punto);
          for (var ar = allData.length - 1; ar >= 0; ar--) {
            var fHoja = normalizarFechaDia(allData[ar][1]);
            var prHoja = normalizarTexto(allData[ar][4]);
            var ptHoja = normalizarTexto(allData[ar][5]);
            var pdHoja = String(allData[ar][6] || '').trim();

            if (fHoja === targetDateNorm && productosCoinciden(pdHoja, prodAnterior)) {
              if (!targetProvNorm || prHoja.indexOf(targetProvNorm) !== -1 || targetProvNorm.indexOf(prHoja) !== -1) {
                if (!targetPuntoNorm || ptHoja.indexOf(targetPuntoNorm) !== -1 || targetPuntoNorm.indexOf(ptHoja) !== -1) {
                  rowToUpdate = ar + 2;
                  rowArrIndex = ar;
                  break;
                }
              }
            }
          }
        }

        if (rowToUpdate !== -1) {
          var rowData = allData[rowArrIndex];
          var curKg = kgTarget > 0 ? kgTarget : parseKilosNumero(rowData[7]);
          var nuevoPrecio = buscarPrecioEnCatalogoTarifas(catalogoTarifas, prov || rowData[4], punto || rowData[5], prodNuevo, rowData[1] || nov.fechaHora || nov.fecha);
          if (nuevoPrecio === null || nuevoPrecio <= 0) {
            if (!catalogoHistorico) catalogoHistorico = cargarHistoricoRecolecciones(ss);
            nuevoPrecio = buscarPrecioEnHistorico(catalogoHistorico, prov || rowData[4], punto || rowData[5], prodNuevo) || parsePrecioMoneda(rowData[10]) || 0;
          }

          var nuevoValor = (nuevoPrecio > 0 && curKg > 0) ? Math.round(nuevoPrecio * curKg * 100) / 100 : '';
          var prevObs = String(rowData[8] || '').trim();
          var notaReclasif = "Reclasificado por Conciliador (" + (prodAnterior || rowData[6]) + " ➔ " + aNombrePropio(prodNuevo) + ")";
          var obsFinal = prevObs ? (prevObs + " | " + notaReclasif) : notaReclasif;

          sheet.getRange(rowToUpdate, 7).setValue(sanitizarParaHoja(aNombrePropio(prodNuevo)));
          if (kgTarget > 0) {
            sheet.getRange(rowToUpdate, 8).setValue(kgTarget);
          }
          sheet.getRange(rowToUpdate, 9).setValue(sanitizarParaHoja(capitalizarOracion(obsFinal)));
          if (nuevoPrecio > 0) {
            sheet.getRange(rowToUpdate, 11).setValue(nuevoPrecio);
          }
          sheet.getRange(rowToUpdate, 12).setValue(nuevoValor);

          allData[rowArrIndex][6] = aNombrePropio(prodNuevo);
          if (kgTarget > 0) allData[rowArrIndex][7] = kgTarget;
          allData[rowArrIndex][8] = obsFinal;
          allData[rowArrIndex][10] = nuevoPrecio;
          allData[rowArrIndex][11] = nuevoValor;

          actualizados++;
          detalles.push({
            id: rowData[0],
            accion: 'RECLASIFICADO',
            fila: rowToUpdate,
            productoAnterior: prodAnterior,
            productoNuevo: aNombrePropio(prodNuevo),
            kg: curKg,
            precio: nuevoPrecio,
            valor: nuevoValor,
            _uid: nov._uid || ''
          });
        } else {
          detalles.push({
            id: nov.id || '',
            accion: 'NO_ENCONTRADO_PARA_RECLASIFICAR',
            producto: prodAnterior,
            _uid: nov._uid || ''
          });
        }
      } else if (tipo === 'ELIMINAR' || tipo === 'ELIMINAR_SOBRANTE') {
        var rowToDelete = -1;
        var rowArrIndex = -1;

        if (nov.id && idRowIndexMap[nov.id]) {
          var matchedRows = idRowIndexMap[nov.id];
          for (var m = 0; m < matchedRows.length; m++) {
            var rIdx = matchedRows[m];
            var rowArray = allData[rIdx - 2];
            var pHoja = String(rowArray[6] || '').trim();
            if (!prodNombre || productosCoinciden(pHoja, prodNombre) || matchedRows.length === 1) {
              rowToDelete = rIdx;
              rowArrIndex = rIdx - 2;
              break;
            }
          }
        }

        if (rowToDelete === -1 && nov.fecha && allData.length > 0) {
          var targetDateNorm = normalizarFechaDia(nov.fecha);
          var targetProvNorm = normalizarTexto(prov);
          var targetPuntoNorm = normalizarTexto(punto);
          for (var ar = allData.length - 1; ar >= 0; ar--) {
            var fHoja = normalizarFechaDia(allData[ar][1]);
            var prHoja = normalizarTexto(allData[ar][4]);
            var ptHoja = normalizarTexto(allData[ar][5]);
            var pdHoja = String(allData[ar][6] || '').trim();

            if (fHoja === targetDateNorm && (!prodNombre || productosCoinciden(pdHoja, prodNombre))) {
              if (!targetProvNorm || prHoja.indexOf(targetProvNorm) !== -1 || targetProvNorm.indexOf(prHoja) !== -1) {
                if (!targetPuntoNorm || ptHoja.indexOf(targetPuntoNorm) !== -1 || targetPuntoNorm.indexOf(ptHoja) !== -1) {
                  rowToDelete = ar + 2;
                  rowArrIndex = ar;
                  break;
                }
              }
            }
          }
        }

        if (rowToDelete !== -1) {
          var idBorrado = allData[rowArrIndex][0];
          sheet.deleteRow(rowToDelete);
          allData.splice(rowArrIndex, 1);
          if (targetRow >= rowToDelete) targetRow--;
          // Re-indexar idRowIndexMap para mantener índices 1-based exactos tras eliminar fila
          idRowIndexMap = {};
          for (var rr = 0; rr < allData.length; rr++) {
            var rIdCurr = String(allData[rr][0] || '').trim();
            if (rIdCurr) {
              if (!idRowIndexMap[rIdCurr]) idRowIndexMap[rIdCurr] = [];
              idRowIndexMap[rIdCurr].push(rr + 2);
            }
          }
          actualizados++;
          detalles.push({
            id: idBorrado,
            accion: 'ELIMINADO',
            fila: rowToDelete,
            producto: prodNombre,
            _uid: nov._uid || ''
          });
        } else {
          detalles.push({
            id: nov.id || '',
            accion: 'NO_ENCONTRADO_PARA_ELIMINAR',
            producto: prodNombre,
            _uid: nov._uid || ''
          });
        }
      } else {
        // INSERTAR_FALTANTE (o por defecto)
        var newId = 'REC-' + new Date().getTime() + '-' + Math.floor(1000 + Math.random() * 9000);
        var fechaStr = String(nov.fechaHora || nov.fecha || '').trim();
        if (!fechaStr) {
          fechaStr = Utilities.formatDate(new Date(), "America/Bogota", "dd/MM/yyyy HH:mm:ss");
        } else {
          var mF = fechaStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}:\d{1,2}(?::\d{1,2})?))?$/);
          if (mF) {
            var d = ('0' + mF[1]).slice(-2);
            var m = ('0' + mF[2]).slice(-2);
            var y = Number(mF[3]);
            if (y < 100) y += 2000;
            if (y < 2024 || y > 2026) y = 2026;
            var hora = mF[4] || '12:00:00';
            if (hora.split(':').length === 2) hora += ':00';
            fechaStr = d + '/' + m + '/' + y + ' ' + hora;
          }
        }

        var precioItem = '';
        var pTarifaNew = buscarPrecioEnCatalogoTarifas(catalogoTarifas, prov, punto, prodNombre, fechaStr);
        if (pTarifaNew !== null && pTarifaNew > 0) {
          precioItem = pTarifaNew;
        } else {
          if (!catalogoHistorico) catalogoHistorico = cargarHistoricoRecolecciones(ss);
          precioItem = buscarPrecioEnHistorico(catalogoHistorico, prov, punto, prodNombre) || '';
        }

        var valorItem = '';
        if (precioItem !== '' && !isNaN(parseFloat(precioItem)) && kgTarget > 0) {
          valorItem = Math.round(parseFloat(precioItem) * kgTarget * 100) / 100;
        }

        var obsFaltante = nov.observaciones || ("Conciliación Automática: Faltante de " + (prov || 'Proveedor') + (numFactura ? " (Factura " + numFactura + ")" : ""));
        var rutaFinal = homologarRuta(ruta);
        var conductorFinal = aNombrePropio(cond);
        var proveedorFinal = aNombrePropio(homologarProveedor(prov));
        var puntoFinal = aNombrePropio(punto);
        var prodNombreFinal = aNombrePropio(prodNombre);
        var obsFinalIns = capitalizarOracion(obsFaltante);

        filasNuevas.push([
          sanitizarParaHoja(newId),
          sanitizarParaHoja(fechaStr),
          sanitizarParaHoja(rutaFinal),
          sanitizarParaHoja(conductorFinal),
          sanitizarParaHoja(proveedorFinal),
          sanitizarParaHoja(puntoFinal),
          sanitizarParaHoja(prodNombreFinal),
          kgTarget,
          sanitizarParaHoja(obsFinalIns),
          'Conciliador Web (Auto)',
          precioItem,
          valorItem
        ]);

        filasFactura.push([
          sanitizarParaHoja(numFactura),
          '',
          ''
        ]);

        insertados++;
        detalles.push({
          id: newId,
          accion: 'INSERTADO',
          producto: prodNombreFinal,
          kg: kgTarget,
          precio: precioItem,
          valor: valorItem,
          fecha: fechaStr,
          _uid: nov._uid || ''
        });
      }
    }

    // Persistir filas nuevas en Recolecciones
    if (filasNuevas.length > 0) {
      var maxFilasActuales = sheet.getMaxRows();
      var filaFinalRequerida = targetRow + filasNuevas.length;
      if (filaFinalRequerida > maxFilasActuales) {
        var filasFaltantes = filaFinalRequerida - maxFilasActuales;
        sheet.insertRowsAfter(maxFilasActuales, Math.max(filasFaltantes, 200));
      }
      garantizarEstructuraColumnasFactura(sheet);

      sheet.getRange(targetRow + 1, 1, filasNuevas.length, 12).setValues(filasNuevas);
      sheet.getRange(targetRow + 1, 15, filasFactura.length, 3).setValues(filasFactura);
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      message: "Novedades de conciliación aplicadas exitosamente.",
      insertados: insertados,
      actualizados: actualizados,
      detalles: detalles
    })).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    Logger.log("Error aplicando novedades de conciliación: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      error: err.message || err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lockAcquired && lock) {
      try { lock.releaseLock(); } catch(eRel) {}
    }
  }
}

// ==============================================================================
// ELIMINAR RECOLECCIÓN POR ID O ID + PRODUCTO (v1.9.8)
// ==============================================================================
function eliminarRecoleccionSheet(ss, idTarget, productoTarget) {
  try {
    var sheet = ss.getSheetByName("Recolecciones");
    if (!sheet) throw new Error("No existe la pestaña Recolecciones.");
    idTarget = String(idTarget || '').trim();
    if (!idTarget) throw new Error("ID inválido");

    // Validar formato seguro de ID contra inyecciones
    if (!/^(REC|NOV)-\d+(-[a-zA-Z0-9]+)?$/.test(idTarget)) {
      throw new Error("Formato de ID no válido para eliminación.");
    }

    productoTarget = String(productoTarget || '').trim();

    var lastRow = sheet.getLastRow();
    var deletedCount = 0;
    if (lastRow > 1) {
      var rowsData = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      for (var r = rowsData.length - 1; r >= 0; r--) {
        var currentId = String(rowsData[r][0] || '').trim();
        var currentProd = String(rowsData[r][6] || '').trim();
        if (currentId === idTarget) {
          if (!productoTarget || productosCoinciden(currentProd, productoTarget)) {
            sheet.deleteRow(r + 2);
            deletedCount++;
          }
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
// HELPERS DE VIGENCIA TEMPORAL EN COLOMBIA (GMT-5) Y ESTRUCTURA TARIFAS (v2.0.0)
// ==============================================================================

function obtenerFechaHoyIsoColombia_() {
  return Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd");
}

function normalizarFechaIso_(val, defaultIso) {
  var fallback = (defaultIso !== undefined && defaultIso !== null) ? String(defaultIso) : '2026-01-01';
  if (val === null || val === undefined || val === '') return fallback;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return fallback;
    return Utilities.formatDate(val, "GMT-5", "yyyy-MM-dd");
  }

  var s = String(val).trim();
  if (!s) return fallback;

  var y = 0, m = 0, d = 0;
  // 1. Formato ISO YYYY-MM-DD o YYYY/MM/DD (con o sin hora/sufijo)
  var mIso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:$|[\sT,;])/);
  if (mIso) {
    y = parseInt(mIso[1], 10);
    m = parseInt(mIso[2], 10);
    d = parseInt(mIso[3], 10);
  } else {
    // 2. Formato Latino DD/MM/YYYY o DD-MM-YYYY (con o sin hora/coma)
    var mLat = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:$|[\s,;])/);
    if (mLat) {
      d = parseInt(mLat[1], 10);
      m = parseInt(mLat[2], 10);
      y = parseInt(mLat[3], 10);
      if (y < 100) y += 2000;
    } else {
      // 3. Fallback usando normalizarFechaDia
      var viaDia = normalizarFechaDia(s);
      var mDia = viaDia ? viaDia.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
      if (mDia) {
        y = parseInt(mDia[1], 10);
        m = parseInt(mDia[2], 10);
        d = parseInt(mDia[3], 10);
      }
    }
  }

  if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
    return String(y) + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
  }
  return fallback;
}

function crearRespaldoSiNoExiste_(ss, sheet, nombreRespaldo) {
  try {
    if (!ss || !sheet || !nombreRespaldo) return '';
    if (!ss.getSheetByName(nombreRespaldo)) {
      var bak = sheet.copyTo(ss);
      bak.setName(nombreRespaldo);
    }
    return nombreRespaldo;
  } catch (eBak) {
    Logger.log("Aviso creando respaldo " + nombreRespaldo + ": " + eBak.toString());
    return '';
  }
}

// Garantiza columna Vigente_Desde estrictamente al final en Columna H (idx 7, col 8)
// sin tocar ni renombrar columnas A..G (Ruta..Observaciones, conservando Estado)
function garantizarColumnaVigenciaTarifas_(sheetTarifas) {
  if (!sheetTarifas) return 7;
  var lastCol = Math.max(sheetTarifas.getLastColumn(), 1);
  var headers = sheetTarifas.getRange(1, 1, 1, lastCol).getValues()[0];
  var vigIdx = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = normalizarTexto(headers[c]);
    if (h.indexOf('vigente') !== -1 || h.indexOf('vigencia') !== -1) {
      vigIdx = c;
      break;
    }
  }

  if (vigIdx === -1) {
    var maxCols = sheetTarifas.getMaxColumns();
    if (maxCols < 8) {
      sheetTarifas.insertColumnsAfter(maxCols, 8 - maxCols);
    }
    vigIdx = 7; // Columna H (0-based idx 7, 1-based col 8)
    var hdrCell = sheetTarifas.getRange(1, 8);
    try {
      var refCol = (lastCol >= 7 && String(headers[6] || '').trim() !== '') ? 7 : (lastCol >= 6 ? 6 : 1);
      sheetTarifas.getRange(1, refCol).copyTo(hdrCell, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    } catch (eFmt) {
      hdrCell.setBackground('#1e293b')
             .setFontColor('#ffffff')
             .setFontWeight('bold')
             .setHorizontalAlignment('center');
    }
    hdrCell.setValue('Vigente_Desde').setFontWeight('bold');
  }

  var lastRow = sheetTarifas.getLastRow();
  if (lastRow > 1) {
    var numDataRows = lastRow - 1;
    var vigCol1 = vigIdx + 1;
    var coreCols = Math.min(4, Math.max(sheetTarifas.getLastColumn(), 1));
    var coreData = sheetTarifas.getRange(2, 1, numDataRows, coreCols).getValues();
    var vigRange = sheetTarifas.getRange(2, vigCol1, numDataRows, 1);
    var vigVals = vigRange.getValues();
    var changed = false;

    for (var r = 0; r < numDataRows; r++) {
      var hasProv = coreCols > 1 && String(coreData[r][1] || '').trim() !== '';
      var hasProd = coreCols > 3 && String(coreData[r][3] || '').trim() !== '';
      var curVal = vigVals[r][0];
      var isEmpty = (curVal === null || curVal === undefined || String(curVal).trim() === '');
      if ((hasProv || hasProd) && isEmpty) {
        vigVals[r][0] = '2026-01-01';
        changed = true;
      } else if (!isEmpty && curVal instanceof Date) {
        vigVals[r][0] = normalizarFechaIso_(curVal, '2026-01-01');
        changed = true;
      }
    }

    if (changed) {
      vigRange.setNumberFormat('@');
      vigRange.setValues(vigVals);
    }
  }

  return vigIdx;
}

function esMejorTarifaTemporal_(cand, best) {
  if (!best) return true;
  if (cand.vigenteDesde > best.vigenteDesde) return true;
  if (cand.vigenteDesde === best.vigenteDesde && (cand.rowIndex || 0) >= (best.rowIndex || 0)) return true;
  return false;
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
    var colIdx = { prov: 1, punto: 2, prod: 3, precio: 4, estado: 5, vigenteDesde: (lastCol >= 8 ? 7 : -1) };
    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('estado') !== -1) colIdx.estado = c;
      else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
      else if (h.indexOf('vigente') !== -1 || h.indexOf('vigencia') !== -1) colIdx.vigenteDesde = c;
    }
    var raw = sheetTarifas.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var i = 0; i < raw.length; i++) {
      var est = normalizarTexto(raw[i][colIdx.estado] || 'activo');
      if (est === 'inactivo') continue;
      var cleanP = parsePrecioMoneda(raw[i][colIdx.precio]);
      if (cleanP === null || cleanP <= 0) continue;
      var rawVig = (colIdx.vigenteDesde !== -1 && colIdx.vigenteDesde < raw[i].length) ? raw[i][colIdx.vigenteDesde] : '';
      catalogo.push({
        prov: normalizarTexto(raw[i][colIdx.prov]),
        punto: normalizarTexto(raw[i][colIdx.punto]),
        prod: normalizarTexto(raw[i][colIdx.prod]),
        precio: cleanP,
        vigenteDesde: normalizarFechaIso_(rawVig, '2026-01-01'),
        rowIndex: i
      });
    }
  } catch(e) {
    Logger.log("Error cargando catalogo tarifas en memoria: " + e.toString());
  }
  return catalogo;
}

// Búsqueda en memoria de precio vigente en Tarifas con vigencia temporal y matching exacto de producto
function buscarPrecioEnCatalogoTarifas(catalogo, proveedor, punto, producto, fechaRecoleccion) {
  if (!catalogo || catalogo.length === 0) return null;
  var targetProv = normalizarTexto(proveedor);
  var targetPunto = normalizarTexto(punto);
  var targetProd = normalizarTexto(producto);
  var fechaTarget = normalizarFechaIso_(fechaRecoleccion, obtenerFechaHoyIsoColombia_());

  var bestNivel1 = null; // Prov exacto + Punto exacto/parcial
  var bestNivel2 = null; // Prov exacto + Punto vacío/todas/general
  var bestNivel3 = null; // Prov parcial
  var provKeywords = targetProv.split(/[\s\-]+/).filter(function(w) { return w.length > 3; });

  for (var i = 0; i < catalogo.length; i++) {
    var row = catalogo[i];
    var rowVig = row.vigenteDesde || '2026-01-01';
    // ¡REGLA TEMPORAL!: Solo aplica si vigenteDesde <= fechaRecoleccion
    if (rowVig > fechaTarget) continue;

    // ¡REGLA CRÍTICA!: El producto debe coincidir de forma exacta (o singular/plural idéntico)
    if (!productosCoinciden(row.prod, targetProd)) continue;

    var cand = { precio: row.precio, vigenteDesde: rowVig, rowIndex: (row.rowIndex !== undefined ? row.rowIndex : i) };

    // Nivel 1: Proveedor exacto + Punto exacto/parcial (sin break: elegir mayor vigenteDesde)
    if (row.prov === targetProv && targetPunto !== '' && (row.punto === targetPunto || (row.punto !== '' && row.punto.indexOf(targetPunto) !== -1))) {
      if (esMejorTarifaTemporal_(cand, bestNivel1)) bestNivel1 = cand;
    }

    // Nivel 2: Proveedor exacto + Todas las sucursales (o general/vacío)
    if (row.prov === targetProv && (row.punto === '' || row.punto.indexOf('todas') !== -1 || row.punto.indexOf('general') !== -1)) {
      if (esMejorTarifaTemporal_(cand, bestNivel2)) bestNivel2 = cand;
    }

    // Nivel 3: Coincidencia parcial de proveedor
    var matchParcial = false;
    if (row.prov && targetProv) {
      if (targetProv.indexOf(row.prov) !== -1 || row.prov.indexOf(targetProv) !== -1) {
        matchParcial = true;
      } else {
        for (var k = 0; k < provKeywords.length; k++) {
          if (row.prov.indexOf(provKeywords[k]) !== -1) {
            matchParcial = true;
            break;
          }
        }
      }
    }
    if (matchParcial && esMejorTarifaTemporal_(cand, bestNivel3)) {
      bestNivel3 = cand;
    }
  }

  if (bestNivel1 !== null) return bestNivel1.precio;
  if (bestNivel2 !== null) return bestNivel2.precio;
  if (bestNivel3 !== null) return bestNivel3.precio;

  // Nivel 4: Respaldo histórico específico para comercios de Ruta 1 (Santa Elena / Cavasa)
  var esProvSE = (targetProv.indexOf('santa elena') !== -1 || targetProv.indexOf('garay') !== -1 || targetPunto.indexOf('santa elena') !== -1);
  if (esProvSE) {
    var bestSE = null;
    for (var seI = 0; seI < catalogo.length; seI++) {
      var seRow = catalogo[seI];
      var seVig = seRow.vigenteDesde || '2026-01-01';
      if (seVig > fechaTarget) continue;
      if (seRow.prov === 'santa elena' && productosCoinciden(seRow.prod, targetProd)) {
        var candSE = { precio: seRow.precio, vigenteDesde: seVig, rowIndex: (seRow.rowIndex !== undefined ? seRow.rowIndex : seI) };
        if (esMejorTarifaTemporal_(candSE, bestSE)) bestSE = candSE;
      }
    }
    if (bestSE !== null) return bestSE.precio;
  }

  var esPtoCV = (targetPunto.indexOf('cavasa') !== -1 || targetProv.indexOf('cavasa') !== -1);
  if (esPtoCV) {
    var bestCV = null;
    for (var cvI = 0; cvI < catalogo.length; cvI++) {
      var cvRow = catalogo[cvI];
      var cvVig = cvRow.vigenteDesde || '2026-01-01';
      if (cvVig > fechaTarget) continue;
      if (cvRow.prov === 'cavasa' && productosCoinciden(cvRow.prod, targetProd)) {
        var candCV = { precio: cvRow.precio, vigenteDesde: cvVig, rowIndex: (cvRow.rowIndex !== undefined ? cvRow.rowIndex : cvI) };
        if (esMejorTarifaTemporal_(candCV, bestCV)) bestCV = candCV;
      }
    }
    if (bestCV !== null) return bestCV.precio;
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
function obtenerPrecioTarifa(ss, proveedor, punto, producto, fechaRecoleccion) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var catalogo = cargarCatalogoTarifas(ss);
    var pTarifa = buscarPrecioEnCatalogoTarifas(catalogo, proveedor, punto, producto, fechaRecoleccion);
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
// LIQUIDADOR DE RECOLECCIONES PENDIENTES (PRECIO DESDE TARIFAS + VALOR = KG * PRECIO)
// v1.9.5: Respaldo previo automático + Homologación Grupo A + Escritura exclusiva K:L
// ==============================================================================
function normalizarClaveAlfanumerica_(str) {
  if (!str) return '';
  var s = String(str).trim().toLowerCase();
  try {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {}
  return s.replace(/[^a-z0-9]/g, '');
}

function buscarHomologadoGrupoA_(provClean, puntoClean, prodClean) {
  // 1 y 2. Supertienda Cañaveral (Cañaveral Matadero / Cañaveral Buga) -> SEBO = $1.200
  if (provClean === 'supertiendacanaveral' && (puntoClean === 'canaveralmatadero' || puntoClean === 'canaveralbuga') && prodClean === 'sebo') {
    return { precio: 1200, fuente: 'Tarifas Homologada (Sebo en Rama Ruta 4)' };
  }
  // 3. Supertienda Cañaveral (Cañaveral Buga) -> Hueso Cerdo = $150
  if (provClean === 'supertiendacanaveral' && prodClean === 'huesocerdo') {
    return { precio: 150, fuente: 'Tarifas Homologada (Hueso de Cerdo Cañaveral)' };
  }
  // 4. Alberto Millan -> SEBO = $1.400
  if (provClean === 'albertomillan' && prodClean === 'sebo') {
    return { precio: 1400, fuente: 'Tarifas Homologada (Sebo en Rama Alberto Millán)' };
  }
  // 5. Barbara Gomez -> Sebo = $1.200
  if (provClean === 'barbaragomez' && prodClean === 'sebo') {
    return { precio: 1200, fuente: 'Tarifas Homologada (Sebo en Rama Bárbara Gómez)' };
  }
  // 6 y 7. Belalcázar Carnes y Derivados Occidente -> HUESO BLANCO ($200), SEBO EN RAMA ($1.200)
  if (provClean.indexOf('belalcazar') === 0 && prodClean === 'huesoblanco') {
    return { precio: 200, fuente: 'Tarifas Homologada (Hueso Blanco Belalcázar)' };
  }
  if (provClean.indexOf('belalcazar') === 0 && prodClean === 'seboenrama') {
    return { precio: 1200, fuente: 'Tarifas Homologada (Sebo en Rama Belalcázar)' };
  }
  // 8. Belalcázar Rozo -> HUESO DE CERDO ($100)
  if (provClean.indexOf('belalcazar') === 0 && (prodClean === 'huesodecerdo' || prodClean === 'huesocerdo')) {
    return { precio: 100, fuente: 'Tarifas Homologada (Hueso de Cerdo Belalcázar)' };
  }
  // 9. Sevillana Frigorivalle -> HUESO PROMOCION ($1.200)
  if (provClean.indexOf('sevillana') !== -1 && prodClean === 'huesopromocion') {
    return { precio: 1200, fuente: 'Tarifas Homologada (Hueso Promoción Sevillana)' };
  }
  // 10. Ciudad del Campo -> EMPELLA ($2.000)
  if ((provClean === 'ciudaddelcampo' || puntoClean.indexOf('ciudaddelcampo') !== -1) && prodClean === 'empella') {
    return { precio: 2000, fuente: 'Tarifas Homologada (Empella Sevillana)' };
  }
  // 11. Olímpica / Cañaveral, Olímpica Guadalupe, Olímpica Los Lagos -> DESPERDICIO ($100)
  if (provClean.indexOf('olimpica') === 0 && prodClean === 'desperdicio') {
    return { precio: 100, fuente: 'Tarifas Homologada (Desperdicio Cañaveral)' };
  }
  return null;
}

function resolverTarifaPorFecha_(lista, fechaIso) {
  if (!lista || lista.length === 0) return null;
  var best = null;
  for (var k = 0; k < lista.length; k++) {
    var e = lista[k];
    if (e.vigenteDesde <= fechaIso) {
      if (!best || e.vigenteDesde > best.vigenteDesde || (e.vigenteDesde === best.vigenteDesde && e.order >= best.order)) {
        best = e;
      }
    }
  }
  return best ? best.precio : null;
}

function ejecutarLiquidacionPreciosVacios_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetRec = ss.getSheetByName("Recolecciones");
  if (!sheetRec) throw new Error("No existe la pestaña Recolecciones");

  var sheetTarifas = ss.getSheetByName("Tarifas");
  var mapExacto = {};
  var mapPuntoProd = {};
  var mapProvGeneral = {};
  var mapProvProd = {};

  // 1. Cargar catálogo de Tarifas con vigencia temporal (listas por clave para resolver por fecha)
  if (sheetTarifas && sheetTarifas.getLastRow() > 1) {
    var lastRowT = sheetTarifas.getLastRow();
    var lastColT = sheetTarifas.getLastColumn();
    var headersT = sheetTarifas.getRange(1, 1, 1, lastColT).getValues()[0];
    var colT = { prov: 1, punto: 2, prod: 3, precio: 4, estado: 5, vigenteDesde: (lastColT >= 8 ? 7 : -1) };
    for (var tc = 0; tc < headersT.length; tc++) {
      var ht = normalizarTexto(headersT[tc]);
      if (ht.indexOf('proveedor') !== -1) colT.prov = tc;
      else if (ht.indexOf('punto') !== -1 || ht.indexOf('sucursal') !== -1) colT.punto = tc;
      else if (ht.indexOf('producto') !== -1 || ht.indexOf('materia') !== -1) colT.prod = tc;
      else if (ht.indexOf('estado') !== -1) colT.estado = tc;
      else if (ht.indexOf('precio') !== -1 || ht.indexOf('tarifa') !== -1) colT.precio = tc;
      else if (ht.indexOf('vigente') !== -1 || ht.indexOf('vigencia') !== -1) colT.vigenteDesde = tc;
    }

    var dataT = sheetTarifas.getRange(2, 1, lastRowT - 1, lastColT).getValues();

    for (var t = 0; t < dataT.length; t++) {
      var tProv = normalizarClaveAlfanumerica_(dataT[t][colT.prov]);
      var tPunto = normalizarClaveAlfanumerica_(dataT[t][colT.punto]);
      var tProd = normalizarClaveAlfanumerica_(dataT[t][colT.prod]);
      var tPrecio = parsePrecioMoneda(dataT[t][colT.precio]);
      var tEstado = normalizarClaveAlfanumerica_(dataT[t][colT.estado]);
      var rawVigT = (colT.vigenteDesde !== -1 && colT.vigenteDesde < dataT[t].length) ? dataT[t][colT.vigenteDesde] : '';
      var tVig = normalizarFechaIso_(rawVigT, '2026-01-01');

      if (tPrecio !== null && tPrecio > 0 && tEstado !== 'inactivo') {
        var entry = { precio: tPrecio, vigenteDesde: tVig, order: t };
        if (tProv && tPunto && tProd) {
          var kEx = tProv + '|' + tPunto + '|' + tProd;
          if (!mapExacto[kEx]) mapExacto[kEx] = [];
          mapExacto[kEx].push(entry);
        }
        if (tPunto && tProd) {
          var kPt = tPunto + '|' + tProd;
          if (!mapPuntoProd[kPt]) mapPuntoProd[kPt] = [];
          mapPuntoProd[kPt].push(entry);
        }
        if (tProv && tProd) {
          var kPr = tProv + '|' + tProd;
          if (!tPunto || tPunto === 'todas' || tPunto === 'general') {
            if (!mapProvGeneral[kPr]) mapProvGeneral[kPr] = [];
            mapProvGeneral[kPr].push(entry);
          }
          if (!mapProvProd[kPr]) mapProvProd[kPr] = [];
          mapProvProd[kPr].push(entry);
        }
      }
    }
  }

  var lastRow = sheetRec.getLastRow();
  var lastCol = sheetRec.getLastColumn();
  if (lastRow <= 1) {
    return {
      result: "info",
      message: "Hoja Recolecciones vacía",
      totalFilas: 0,
      totalLiquidadas: 0,
      valorTotalCOP: 0,
      totalVisitasFallidas0Kg: 0,
      totalPendientesSinTarifa: 0,
      backupSheetName: ""
    };
  }

  var headers = sheetRec.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx = { id: 0, fecha: 1, prov: 4, punto: 5, prod: 6, kg: 7, precio: 10, valor: 11 };
  for (var c = 0; c < Math.min(headers.length, 12); c++) {
    var h = normalizarTexto(headers[c]);
    if (h.indexOf('id') !== -1 && c === 0) colIdx.id = c;
    else if (h.indexOf('fecha') !== -1) colIdx.fecha = c;
    else if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
    else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
    else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
    else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
    else if ((h.indexOf('kg') !== -1 || h.indexOf('kilo') !== -1) && h.indexOf('precio') === -1 && h.indexOf('tarifa') === -1) colIdx.kg = c;
    else if ((h.indexOf('valor') !== -1 || h.indexOf('total') !== -1) && h.indexOf('factura') === -1) colIdx.valor = c;
  }

  // Leer únicamente columnas de datos A:L (1..12) para velocidad y para no tocar fórmulas en M:N ni R+
  var numColsToRead = Math.max(colIdx.valor + 1, 12);
  var rawValues = sheetRec.getRange(2, 1, lastRow - 1, numColsToRead).getValues();
  var filasReales = 0;
  for (var rScan = rawValues.length - 1; rScan >= 0; rScan--) {
    var hasId = String(rawValues[rScan][0] || '').trim() !== '';
    var hasFecha = String(rawValues[rScan][1] || '').trim() !== '';
    var hasProd = String(rawValues[rScan][colIdx.prod] || '').trim() !== '';
    if (hasId || hasFecha || hasProd) {
      filasReales = rScan + 1;
      break;
    }
  }
  var values = filasReales > 0 ? rawValues.slice(0, filasReales) : [];

  // 2. Cargar histórico interno de Recolecciones para fallback inteligente
  var histExacto = {};
  var histPuntoProd = {};
  var histProvProd = {};

  for (var hIdx = 0; hIdx < values.length; hIdx++) {
    var exPrecio = parsePrecioMoneda(values[hIdx][colIdx.precio]);
    if (exPrecio !== null && exPrecio > 0) {
      var exProv = normalizarClaveAlfanumerica_(values[hIdx][colIdx.prov]);
      var exPunto = normalizarClaveAlfanumerica_(values[hIdx][colIdx.punto]);
      var exProd = normalizarClaveAlfanumerica_(values[hIdx][colIdx.prod]);
      if (exProv && exPunto && exProd && !histExacto[exProv + '|' + exPunto + '|' + exProd]) {
        histExacto[exProv + '|' + exPunto + '|' + exProd] = exPrecio;
      }
      if (exPunto && exProd && !histPuntoProd[exPunto + '|' + exProd]) {
        histPuntoProd[exPunto + '|' + exProd] = exPrecio;
      }
      if (exProv && exProd && !histProvProd[exProv + '|' + exProd]) {
        histProvProd[exProv + '|' + exProd] = exPrecio;
      }
    }
  }

  // Matriz de 2 columnas (Precio y Valor) para escritura atómica exclusiva en K:L
  var precioValorMatrix = [];
  var actualizadas = [];
  var sinTarifa = [];
  var visitasFallidas0Kg = 0;
  var valorTotalLiquidado = 0;
  var hoyIsoCol = obtenerFechaHoyIsoColombia_();

  for (var i = 0; i < values.length; i++) {
    var rawPrecio = values[i][colIdx.precio];
    var rawValor = values[i][colIdx.valor];
    var currPrecio = parsePrecioMoneda(rawPrecio);

    // Si ya tiene precio válido, RESPETAR 100% Y NO TOCAR
    if (currPrecio !== null && currPrecio > 0) {
      var currValNum = parsePrecioMoneda(rawValor);
      if ((currValNum === null || currValNum <= 0) && parseKilosNumero(values[i][colIdx.kg]) > 0) {
        rawValor = Math.round(currPrecio * parseKilosNumero(values[i][colIdx.kg]) * 100) / 100;
      }
      precioValorMatrix.push([rawPrecio, rawValor]);
      continue;
    }

    var rowIdStr = String(values[i][colIdx.id] || '').trim();
    var rowProdRaw = String(values[i][colIdx.prod] || '').trim();
    var rowProv = normalizarClaveAlfanumerica_(values[i][colIdx.prov]);
    var rowPunto = normalizarClaveAlfanumerica_(values[i][colIdx.punto]);
    var rowProd = normalizarClaveAlfanumerica_(rowProdRaw);
    var rowKg = parseKilosNumero(values[i][colIdx.kg]);
    var rowFechaIso = normalizarFechaIso_(values[i][colIdx.fecha], hoyIsoCol);

    if (!rowProd) {
      precioValorMatrix.push([rawPrecio, rawValor]);
      continue;
    }

    // Excluir Visitas Fallidas / Novedades con 0 Kg (no requieren precio)
    if (rowKg <= 0 || rowProdRaw.toLowerCase().indexOf('visita fallida') !== -1 || rowIdStr.indexOf('NOV-') === 0) {
      visitasFallidas0Kg++;
      precioValorMatrix.push([rawPrecio, rawValor]);
      continue;
    }

    // Cascada temporal de búsqueda de precio por fecha real de recolección:
    // 1. Tarifas (Prov + Punto + Prod) vigente a rowFechaIso
    // 2. Tarifas (Punto + Prod) vigente a rowFechaIso
    // 3. Tarifas (Prov + Prod general -> Prov + Prod cualquiera) vigente a rowFechaIso
    // 4. Histórico Recolecciones (Prov + Punto + Prod)
    // 5. Histórico Recolecciones (Punto + Prod)
    // 6. Histórico Recolecciones (Prov + Prod)
    // 7. Homologación Aprobada Grupo A
    var foundPrecio = null;
    var origenTarifa = '';

    var pEx = (rowProv && rowPunto) ? resolverTarifaPorFecha_(mapExacto[rowProv + '|' + rowPunto + '|' + rowProd], rowFechaIso) : null;
    var pPt = (pEx === null && rowPunto) ? resolverTarifaPorFecha_(mapPuntoProd[rowPunto + '|' + rowProd], rowFechaIso) : null;
    var pPrGen = (pEx === null && pPt === null && rowProv) ? resolverTarifaPorFecha_(mapProvGeneral[rowProv + '|' + rowProd], rowFechaIso) : null;
    var pPr = (pEx === null && pPt === null && pPrGen === null && rowProv) ? resolverTarifaPorFecha_(mapProvProd[rowProv + '|' + rowProd], rowFechaIso) : null;

    if (pEx !== null) {
      foundPrecio = pEx;
      origenTarifa = 'Tarifas (Exacta @ ' + rowFechaIso + ')';
    } else if (pPt !== null) {
      foundPrecio = pPt;
      origenTarifa = 'Tarifas (Punto @ ' + rowFechaIso + ')';
    } else if (pPrGen !== null) {
      foundPrecio = pPrGen;
      origenTarifa = 'Tarifas (Proveedor @ ' + rowFechaIso + ')';
    } else if (pPr !== null) {
      foundPrecio = pPr;
      origenTarifa = 'Tarifas (Proveedor @ ' + rowFechaIso + ')';
    } else if (rowProv && rowPunto && histExacto[rowProv + '|' + rowPunto + '|' + rowProd]) {
      foundPrecio = histExacto[rowProv + '|' + rowPunto + '|' + rowProd];
      origenTarifa = 'Histórico Recolecciones (Exacta)';
    } else if (rowPunto && histPuntoProd[rowPunto + '|' + rowProd]) {
      foundPrecio = histPuntoProd[rowPunto + '|' + rowProd];
      origenTarifa = 'Histórico Recolecciones (Punto)';
    } else if (rowProv && histProvProd[rowProv + '|' + rowProd]) {
      foundPrecio = histProvProd[rowProv + '|' + rowProd];
      origenTarifa = 'Histórico Recolecciones (Proveedor)';
    } else {
      var homA = buscarHomologadoGrupoA_(rowProv, rowPunto, rowProd);
      if (homA) {
        foundPrecio = homA.precio;
        origenTarifa = homA.fuente;
      }
    }

    if (foundPrecio !== null && foundPrecio > 0) {
      var nuevoValor = Math.round(foundPrecio * rowKg * 100) / 100;
      precioValorMatrix.push([foundPrecio, nuevoValor]);
      valorTotalLiquidado += nuevoValor;

      actualizadas.push({
        fila: i + 2,
        id: rowIdStr,
        fecha: rowFechaIso,
        proveedor: values[i][colIdx.prov],
        punto: values[i][colIdx.punto],
        producto: rowProdRaw,
        kilos: rowKg,
        precioAsignado: foundPrecio,
        valorCalculado: nuevoValor,
        fuente: origenTarifa
      });
    } else {
      precioValorMatrix.push([rawPrecio, rawValor]);
      sinTarifa.push({
        fila: i + 2,
        fecha: rowFechaIso,
        proveedor: values[i][colIdx.prov],
        punto: values[i][colIdx.punto],
        producto: rowProdRaw,
        kilos: rowKg
      });
    }
  }

  var backupName = "";
  if (actualizadas.length > 0) {
    // Paso 0 de Seguridad: Crear pestaña de respaldo congelada antes de modificar celdas
    backupName = crearRespaldoSiNoExiste_(ss, sheetRec, "Recolecciones_Backup_PreLiquidacion_" + hoyIsoCol.replace(/-/g, ''));

    // Escritura atómica EXCLUSIVA en las 2 columnas Precio (K) y Valor (L) sin tocar fórmulas M:N ni R+
    if (colIdx.valor === colIdx.precio + 1) {
      sheetRec.getRange(2, colIdx.precio + 1, precioValorMatrix.length, 2).setValues(precioValorMatrix);
    } else {
      var colPrecioArr = [];
      var colValorArr = [];
      for (var pIdx = 0; pIdx < precioValorMatrix.length; pIdx++) {
        colPrecioArr.push([precioValorMatrix[pIdx][0]]);
        colValorArr.push([precioValorMatrix[pIdx][1]]);
      }
      sheetRec.getRange(2, colIdx.precio + 1, colPrecioArr.length, 1).setValues(colPrecioArr);
      sheetRec.getRange(2, colIdx.valor + 1, colValorArr.length, 1).setValues(colValorArr);
    }
  }

  Logger.log("✅ Se liquidaron con éxito " + actualizadas.length + " recolecciones pendientes.");

  return {
    result: "success",
    totalFilas: values.length,
    totalLiquidadas: actualizadas.length,
    valorTotalCOP: Math.round(valorTotalLiquidado),
    totalVisitasFallidas0Kg: visitasFallidas0Kg,
    totalPendientesSinTarifa: sinTarifa.length,
    backupSheetName: backupName,
    muestraLiquidadas: actualizadas.slice(0, 20),
    pendientesSinTarifa: sinTarifa
  };
}

function liquidarRecoleccionesPendientes(ss) {
  try {
    var resultado = ejecutarLiquidacionPreciosVacios_(ss);
    return ContentService.createTextOutput(JSON.stringify(resultado, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("Error liquidando recolecciones: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function menuLiquidarPreciosVacios() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    '💰 Liquidar Precios Vacíos en Recolecciones',
    '¿Deseas liquidar automáticamente las recolecciones con precio pendiente usando la hoja Tarifas y las homologaciones aprobadas?\n\n' +
    '🛡️ Seguridad:\n' +
    '• Se creará primero una pestaña de respaldo automático.\n' +
    '• Los registros que ya tienen precio NO se tocarán.\n' +
    '• Solo se actualizarán las columnas Precio y Valor (K y L).',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.toast('Procesando liquidación y creando respaldo...', '💰 ProteinAgro', 10);
    var res = ejecutarLiquidacionPreciosVacios_(ss);
    var msg = '✅ Proceso completado con éxito:\n\n' +
      '• Registros liquidados: ' + res.totalLiquidadas + '\n' +
      '• Valor total liquidado: $' + Number(res.valorTotalCOP || 0).toLocaleString('es-CO') + ' COP\n' +
      '• Visitas fallidas (0 Kg) omitidas: ' + res.totalVisitasFallidas0Kg + '\n' +
      '• Pendientes por definir tarifa (Grupo B): ' + res.totalPendientesSinTarifa + '\n' +
      (res.backupSheetName ? ('• Pestaña de respaldo: ' + res.backupSheetName) : '');
    ui.alert('💰 Liquidación Completada', msg, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Error al liquidar', e.toString(), ui.ButtonSet.OK);
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
      var prodTarget = (e && e.parameter && (e.parameter.producto || e.parameter.materia)) || (payload && (payload.producto || payload.materia)) || '';
      return eliminarRecoleccionSheet(ss, targetId, prodTarget);
    }

    if (action === 'updateRecoleccion') {
      return actualizarRecoleccionSheet(ss, payload);
    }

    if (action === 'aplicarNovedadesConciliacion') {
      return aplicarNovedadesConciliacionSheet(ss, payload);
    }

    if (action === 'habilitarColumnasFactura' || action === 'desplazarColumnasFactura') {
      return habilitarColumnasFacturaHttp(ss);
    }

    if (action === 'habilitarColumnasSoporte' || action === 'crearColumnasSoporte') {
      return habilitarColumnasSoporteHttp(ss);
    }

    if (action === 'crearProductoTarifa') {
      var pData = payload;
      if (typeof pData === 'string') {
        try { pData = JSON.parse(pData); } catch(ex) {}
      }
      var resCrear = crearProductoTarifaSheet(ss, pData);
      return ContentService.createTextOutput(JSON.stringify(resCrear))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getTarifas') {
      return obtenerTarifasHttp_(ss);
    }

    if (action === 'actualizarTarifasMasivo') {
      return actualizarTarifasMasivoSheet_(ss, payload);
    }

    if (action === 'aplicarListaPreciosNov23') {
      return aplicarListaPreciosNov23Sheet_(ss);
    }

    if (action === 'aplicarListaPrecios2Nov23') {
      return aplicarListaPrecios2Nov23Sheet_(ss);
    }
    
    return guardarRecoleccionSheet(ss, payload);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// (onOpen movido al final unificado con Conciliador)



// ==============================================================================
// MENÚ INTEGRADO DE GOOGLE SHEETS: CONCILIADOR + MANTENIMIENTO PROTEINAGRO
// ==============================================================================
function onOpen() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss ? ss.getSheetByName("Recolecciones") : null;
    if (sheet) {
      garantizarEstructuraColumnasSoporte(sheet);
    }

    var ui = SpreadsheetApp.getUi();
    
    // 1. Menú Oficial del Conciliador (Operación Diaria)
    ui.createMenu('📊 Conciliador')
      .addItem('🗔 Abrir aquí en Sheets (Ventana Flotante)', 'abrirConciliadorFlotante')
      .addItem('⚖️ Conciliar Proveedor con Excel (Directo)', 'abrirConciliacionDirectaFlotante')
      .addSeparator()
      .addItem('📷 Habilitar Columnas de Soporte (R:T)', 'menuHabilitarColumnasSoporte')
      .addItem('💰 Liquidar Precios Vacíos en Recolecciones', 'menuLiquidarPreciosVacios')
      .addItem('📅 Cargar Lista de Precios 23/Nov/2026 (Idempotente)', 'menuAplicarListaPreciosNov23')
      .addItem('📅 Cargar Lista de Precios 2 (23/Nov/2026)', 'menuAplicarListaPrecios2Nov23')
      .addSeparator()
      .addItem('🚀 Abrir Conciliador (Ventana Aparte)', 'abrirConciliadorNuevaVentana')
      .addItem('📋 Descargar Plantilla Oficial (.xlsx)', 'abrirDescargaPlantillaSheets')
      .addSeparator()
      .addItem('⚙️ Configurar URL del Web App', 'configurarUrlWebApp')
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
    var colMap = { fecha: -1, proveedor: -1, punto: -1, materia: -1, kg: -1, precio: -1, valor: -1, id: -1, gps: -1, numFactura: -1, valorFactura: -1, fotoFactura: -1, tipoSoporte: -1, fotoSoporte: -1, entregadoPor: -1, observaciones: -1 };

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
      else if (/tipo_soporte/i.test(h) && colMap.tipoSoporte === -1) colMap.tipoSoporte = c;
      else if (/foto_soporte/i.test(h) && colMap.fotoSoporte === -1) colMap.fotoSoporte = c;
      else if (/entregado_por/i.test(h) && colMap.entregadoPor === -1) colMap.entregadoPor = c;
      else if (/observ/i.test(h) && colMap.observaciones === -1) colMap.observaciones = c;
      else if (/valor|total/i.test(h) && colMap.valor === -1) colMap.valor = c;
      else if (/^id/i.test(h) && colMap.id === -1) colMap.id = c;
      else if (/gps|ubicaci/i.test(h) && colMap.gps === -1) colMap.gps = c;
    }

    if (colMap.fecha === -1) colMap.fecha = 1;
    if (colMap.proveedor === -1) colMap.proveedor = 4;
    if (colMap.punto === -1) colMap.punto = 5;
    if (colMap.materia === -1) colMap.materia = 6;
    if (colMap.kg === -1) colMap.kg = 7;
    if (colMap.observaciones === -1) colMap.observaciones = 8;
    if (colMap.precio === -1) colMap.precio = 10;
    if (colMap.valor === -1) colMap.valor = 11;
    if (colMap.numFactura === -1 && headers.length >= 15) colMap.numFactura = 14;
    if (colMap.valorFactura === -1 && headers.length >= 16) colMap.valorFactura = 15;
    if (colMap.fotoFactura === -1 && headers.length >= 17) colMap.fotoFactura = 16;
    if (colMap.tipoSoporte === -1 && headers.length >= 18) colMap.tipoSoporte = 17;
    if (colMap.fotoSoporte === -1 && headers.length >= 19) colMap.fotoSoporte = 18;
    if (colMap.entregadoPor === -1 && headers.length >= 20) colMap.entregadoPor = 19;

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

      var tipoSopStr = (colMap.tipoSoporte !== -1 && row.length > colMap.tipoSoporte && row[colMap.tipoSoporte]) ? String(row[colMap.tipoSoporte]).trim() : "";
      var fotoSopStr = (colMap.fotoSoporte !== -1 && row.length > colMap.fotoSoporte && row[colMap.fotoSoporte]) ? String(row[colMap.fotoSoporte]).trim() : "";
      var entregadoStr = (colMap.entregadoPor !== -1 && row.length > colMap.entregadoPor && row[colMap.entregadoPor]) ? String(row[colMap.entregadoPor]).trim() : "";
      var obsStr = (colMap.observaciones !== -1 && row.length > colMap.observaciones && row[colMap.observaciones]) ? String(row[colMap.observaciones]).trim() : "";

      if (!entregadoStr && obsStr.indexOf('[Entregó:') !== -1) {
        var mEnt = obsStr.match(/\[Entregó:\s*([^\]]+)\]/i);
        if (mEnt) entregadoStr = mEnt[1].trim();
      }
      if (!tipoSopStr && obsStr.indexOf('[Soporte:') !== -1) {
        var mSop = obsStr.match(/\[Soporte:\s*([^\]]+)\]/i);
        if (mSop) tipoSopStr = mSop[1].trim();
      }

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
        FOTO_FACTURA: fotoFactStr,
        TIPO_SOPORTE: tipoSopStr,
        FOTO_SOPORTE: fotoSopStr,
        ENTREGADO_POR: entregadoStr,
        OBSERVACIONES: obsStr
      });
    }

    var provList = Object.keys(proveedoresSet).sort(function(a, b) {
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });

    var productosOficiales = [];
    var sheetProd = ss.getSheetByName("Productos");
    if (sheetProd && sheetProd.getLastRow() > 1) {
      var pData = sheetProd.getRange(2, 1, sheetProd.getLastRow() - 1, 2).getValues();
      for (var pi = 0; pi < pData.length; pi++) {
        var pNom = String(pData[pi][0] || '').trim().toUpperCase();
        var pEst = String(pData[pi][1] || 'Activo').trim().toLowerCase();
        if (pNom !== '' && pEst !== 'inactivo') {
          productosOficiales.push(pNom);
        }
      }
    }

    return {
      success: true,
      data: data,
      proveedores: provList,
      productos: productosOficiales
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

var CANONICOS_PUNTOS = {
  'lantanademorichal': 'La Montaña Morichal',
  'lamontanamorichal': 'La Montaña Morichal',
  'lamontanademorichal': 'La Montaña Morichal',
  'ciudadeladelrio': 'Ciudadela del Río'
};

function homologarPunto(texto) {
  if (!texto) return '';
  var s = String(texto).trim().replace(/\s+/g, ' ');
  if (!s) return '';
  var k = normalizarClaveAlfanumerica_(s);
  if (CANONICOS_PUNTOS[k]) return CANONICOS_PUNTOS[k];

  var conectores = { 'de': true, 'del': true, 'la': true, 'las': true, 'los': true, 'y': true, 'en': true };
  var siglas = { 'lg': true, 'sas': true, 'ips': true, 'eps': true, 'pwa': true, 'ii': true, 'iii': true, 'iv': true };
  var tokens = s.toLowerCase().split(/\s+/);
  var out = [];
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    var clean = token.replace(/[^a-záéíóúüñ]/g, '');
    if (siglas[clean]) {
      out.push(token.toUpperCase());
    } else if (i > 0 && conectores[clean]) {
      out.push(token.toLowerCase());
    } else {
      out.push(token.replace(/(?:^|[\(\[\/\-])([a-záéíóúüñ])/g, function(m) {
        return m.toUpperCase();
      }));
    }
  }
  return out.join(' ');
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

// ==============================================================================
// HELPER MAESTRO DE PRODUCTOS: ASEGURAR PRODUCTOS ACTIVOS EN HOJA PRODUCTOS
// ==============================================================================
function asegurarProductosEnMaestro_(ss, listaProductos) {
  var agregados = [];
  if (!ss || !Array.isArray(listaProductos) || listaProductos.length === 0) return agregados;

  var sheetProductos = ss.getSheetByName("Productos");
  if (!sheetProductos) return agregados;

  var existentes = {};
  var lastRowProd = sheetProductos.getLastRow();
  if (lastRowProd > 1) {
    var prodData = sheetProductos.getRange(2, 1, lastRowProd - 1, 1).getValues();
    for (var p = 0; p < prodData.length; p++) {
      var k = normalizarTexto(prodData[p][0]);
      if (k) existentes[k] = true;
    }
  }

  var nuevasFilas = [];
  for (var i = 0; i < listaProductos.length; i++) {
    var prodClean = sanitizarParaHoja(String(listaProductos[i] || '').trim().toUpperCase());
    var prodKey = normalizarTexto(prodClean);
    if (prodClean && prodKey && !existentes[prodKey]) {
      nuevasFilas.push([prodClean, 'Activo']);
      existentes[prodKey] = true;
      agregados.push(prodClean);
    }
  }

  if (nuevasFilas.length > 0) {
    var maxFilas = sheetProductos.getMaxRows();
    var targetEnd = sheetProductos.getLastRow() + nuevasFilas.length;
    if (targetEnd > maxFilas) {
      sheetProductos.insertRowsAfter(maxFilas, Math.max(targetEnd - maxFilas, 20));
    }
    sheetProductos.getRange(sheetProductos.getLastRow() + 1, 1, nuevasFilas.length, 2).setValues(nuevasFilas);
  }

  return agregados;
}

// ==============================================================================
// ALTA RÁPIDA DE MATERIA PRIMA / PRODUCTO EN TARIFAS Y PRODUCTOS (v2.0.0)
// Soporta Vigente_Desde en Columna H sin sobrescribir vigencias históricas ni sucursales
// ==============================================================================
function crearProductoTarifaSheet(ss, payload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    lock.waitLock(20000);
    lockAcquired = true;
  } catch (e) {
    return { success: false, error: 'Servidor ocupado. Intente nuevamente en unos segundos.' };
  }

  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Payload inválido.' };
    }

    var ruta = sanitizarParaHoja(payload.ruta || 'Ruta General');
    var proveedor = homologarProveedor(payload.proveedor || '');
    var puntoRaw = (payload.punto !== undefined && payload.punto !== null) ? String(payload.punto).trim() : '';
    var punto = (puntoRaw === '' || puntoRaw.toLowerCase() === '(general)' || puntoRaw.toLowerCase() === 'general')
      ? ''
      : homologarPunto(puntoRaw);
    var producto = sanitizarParaHoja((payload.producto || '').toString().trim().toUpperCase());
    var precioRaw = payload.precio;
    var precio = (precioRaw !== undefined && precioRaw !== null && String(precioRaw).trim() !== '')
      ? Number(String(precioRaw).replace(/[^0-9.-]/g, ''))
      : '';
    var tienePrecioValido = precio !== '' && !isNaN(precio) && Number(precio) > 0;
    var estado = tienePrecioValido ? 'Activo' : 'Pendiente Precio';
    var observaciones = sanitizarParaHoja(String(payload.observaciones || 'Alta rápida desde App').trim());
    var vigenteDesde = normalizarFechaIso_(payload.vigenteDesde, obtenerFechaHoyIsoColombia_());

    if (!proveedor || !producto) {
      return { success: false, error: 'Proveedor y Producto son campos obligatorios.' };
    }

    var sheetTarifas = ss.getSheetByName("Tarifas");
    if (!sheetTarifas) {
      return { success: false, error: 'No se encontró la pestaña Tarifas en Google Sheets.' };
    }

    // Garantizar Columna H Vigente_Desde sin tocar A..G
    var vigColIdx = garantizarColumnaVigenciaTarifas_(sheetTarifas);

    // 1. Revisar si ya existe este producto para este proveedor, punto EXACTO y MISMA vigencia
    var lastRowTarifas = sheetTarifas.getLastRow();
    var yaExisteEnTarifas = false;
    var filaExistente = -1;

    if (lastRowTarifas > 1) {
      var readCols = Math.max(8, sheetTarifas.getLastColumn(), vigColIdx + 1);
      var dataTarifas = sheetTarifas.getRange(2, 1, lastRowTarifas - 1, readCols).getValues();
      var provNorm = normalizarTexto(proveedor);
      var puntoNorm = normalizarTexto(punto);
      var prodNorm = normalizarTexto(producto);

      for (var i = 0; i < dataTarifas.length; i++) {
        var rowProv = normalizarTexto(dataTarifas[i][1]);
        var rowPunto = normalizarTexto(dataTarifas[i][2]);
        var rowProd = normalizarTexto(dataTarifas[i][3]);
        var rowVig = normalizarFechaIso_(dataTarifas[i][vigColIdx], '2026-01-01');

        if (rowProv === provNorm && productosCoinciden(rowProd, prodNorm) && rowVig === vigenteDesde) {
          // Si punto está vacío, SOLO hacer match con filas de punto vacío (no sobrescribir sucursal específica)
          var puntoCoincide = (puntoNorm === '') ? (rowPunto === '') : (rowPunto === puntoNorm);
          if (puntoCoincide) {
            yaExisteEnTarifas = true;
            filaExistente = i + 2;
            break;
          }
        }
      }
    }

    if (yaExisteEnTarifas) {
      if (tienePrecioValido) {
        sheetTarifas.getRange(filaExistente, 5).setValue(Number(precio));
        sheetTarifas.getRange(filaExistente, 6).setValue('Activo');
        if (payload.observaciones) {
          sheetTarifas.getRange(filaExistente, 7).setValue(observaciones);
        }
        return {
          success: true,
          mensaje: 'Tarifa actualizada a $' + precio + ' para ' + producto + ' en ' + proveedor + ' (Vigente desde ' + vigenteDesde + ')',
          producto: producto,
          proveedor: proveedor,
          punto: punto,
          precio: Number(precio),
          vigenteDesde: vigenteDesde,
          actualizado: true
        };
      }
      return {
        success: true,
        mensaje: 'El producto ' + producto + ' ya se encuentra configurado para ' + proveedor + ' (Vigente desde ' + vigenteDesde + ')',
        producto: producto,
        proveedor: proveedor,
        punto: punto,
        vigenteDesde: vigenteDesde,
        yaExiste: true
      };
    }

    // 2. Si no existe para esta vigencia, insertar nueva fila de 8 columnas sin dañar la tarifa histórica anterior
    if (sheetTarifas.getLastRow() >= sheetTarifas.getMaxRows()) {
      sheetTarifas.insertRowsAfter(sheetTarifas.getMaxRows(), 50);
    }

    var nextRowTarifas = sheetTarifas.getLastRow() + 1;
    var rowWidth = Math.max(8, vigColIdx + 1);
    var nuevaFila = [];
    for (var cInit = 0; cInit < rowWidth; cInit++) nuevaFila.push('');
    nuevaFila[0] = ruta;
    nuevaFila[1] = sanitizarParaHoja(proveedor);
    nuevaFila[2] = sanitizarParaHoja(punto);
    nuevaFila[3] = producto;
    nuevaFila[4] = tienePrecioValido ? Number(precio) : '';
    nuevaFila[5] = estado;
    nuevaFila[6] = observaciones;
    nuevaFila[vigColIdx] = vigenteDesde;

    sheetTarifas.getRange(nextRowTarifas, vigColIdx + 1).setNumberFormat('@');
    sheetTarifas.getRange(nextRowTarifas, 1, 1, rowWidth).setValues([nuevaFila]);

    // 3. Revisar si existe en pestaña Productos; si no, agregarlo
    var prodsAgregados = asegurarProductosEnMaestro_(ss, [producto]);
    var agregadoAProductos = prodsAgregados.length > 0;

    return {
      success: true,
      mensaje: 'Producto ' + producto + ' asociado exitosamente a ' + proveedor + ' (Vigente desde ' + vigenteDesde + ')',
      producto: producto,
      proveedor: proveedor,
      punto: punto,
      precio: tienePrecioValido ? Number(precio) : null,
      vigenteDesde: vigenteDesde,
      agregadoAProductos: agregadoAProductos
    };
  } catch (err) {
    Logger.log("Error en crearProductoTarifaSheet: " + err.toString());
    return { success: false, error: err.toString() };
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  }
}

// ==============================================================================
// LISTA OFICIAL DE PRECIOS VIGENCIA 23/11/2026 (86 FILAS VERIFICADAS)
// Fuente: LISTA_DE_PRECIOS.xlsx — Carga 100% idempotente con Vigente_Desde = '2026-11-23'
// ==============================================================================
var LISTA_PRECIOS_NOV23_2026 = [
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "El Rebajón", punto: "", producto: "SEBO EN RAMA", precio: 900, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "El Rebajón", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "El Rebajón", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana Santa Elena", punto: "Sevillana Santa Elena", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana", punto: "Cavasa", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana República de Israel", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Sevillana", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Sevillana", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Sevillana", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana Santa Elena", punto: "Sevillana Santa Elena", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana", punto: "Cavasa", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana", punto: "", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana República de Israel", punto: "", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Sevillana", punto: "", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Sevillana", punto: "", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Sevillana", punto: "", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana Santa Elena", punto: "Sevillana Santa Elena", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana", punto: "Cavasa", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana", punto: "", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana República de Israel", punto: "", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Sevillana", punto: "", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Sevillana", punto: "", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Sevillana", punto: "", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana Santa Elena", punto: "Sevillana Santa Elena", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana", punto: "Cavasa", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana República de Israel", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Sevillana", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Sevillana", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Sevillana", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana Santa Elena", punto: "Sevillana Santa Elena", producto: "PIELES", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana", punto: "Cavasa", producto: "PIELES", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana", punto: "", producto: "PIELES", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Sevillana República de Israel", punto: "", producto: "PIELES", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Sevillana", punto: "", producto: "PIELES", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Sevillana", punto: "", producto: "PIELES", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Sevillana", punto: "", producto: "PIELES", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Bodega Santa Elena", punto: "Santa Elena", producto: "MANTECA", precio: 3200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Alejandro Garay", punto: "Santa Elena", producto: "MANTECA", precio: 3200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Sevillana Santa Elena", punto: "Sevillana Santa Elena", producto: "MANTECA", precio: 3200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Santa Elena", punto: "", producto: "MANTECA", precio: 3200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Caribe", punto: "Cavasa", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 3: Puerto Tejada / Villarica / Jamundí / Pance", proveedor: "Caribe", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Caribe", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Caribe", punto: "Cavasa", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 3: Puerto Tejada / Villarica / Jamundí / Pance", proveedor: "Caribe", punto: "", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Caribe", punto: "", producto: "SEBO EN RAMA", precio: 1200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Caribe", punto: "Cavasa", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 3: Puerto Tejada / Villarica / Jamundí / Pance", proveedor: "Caribe", punto: "", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Caribe", punto: "", producto: "GORDANA", precio: 1500, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Caribe", punto: "Cavasa", producto: "PIEL POLLO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 3: Puerto Tejada / Villarica / Jamundí / Pance", proveedor: "Caribe", punto: "", producto: "PIEL POLLO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Caribe", punto: "", producto: "PIEL POLLO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Caribe", punto: "Cavasa", producto: "HUESO DE POLLO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 3: Puerto Tejada / Villarica / Jamundí / Pance", proveedor: "Caribe", punto: "", producto: "HUESO DE POLLO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Caribe", punto: "", producto: "HUESO DE POLLO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Caribe", punto: "Cavasa", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 3: Puerto Tejada / Villarica / Jamundí / Pance", proveedor: "Caribe", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Caribe", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Caribe", punto: "Cavasa", producto: "HUESO DE CERDO", precio: 150, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 3: Puerto Tejada / Villarica / Jamundí / Pance", proveedor: "Caribe", punto: "", producto: "HUESO DE CERDO", precio: 150, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Caribe", punto: "", producto: "HUESO DE CERDO", precio: 150, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Carnes Maiale", punto: "", producto: "HUESO BLANCO", precio: 100, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Carnes Maiale", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Carnes Maiale", punto: "", producto: "SEBO EN RAMA", precio: 900, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Los Lagos", punto: "Cavasa", producto: "SEBO EN RAMA", precio: 1100, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Super Carnes Los Andes", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Orlando Martinez", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Super Carnes Los Andes", punto: "", producto: "SEBO EN RAMA", precio: 1000, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Orlando Martinez", punto: "", producto: "SEBO EN RAMA", precio: 1000, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Super Carnes Los Andes", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Orlando Martinez", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "Barbara Gomez", punto: "Cavasa", producto: "SEBO EN RAMA", precio: 1100, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 1: Santa Elena / Cavasa", proveedor: "La Reserva", punto: "Cavasa", producto: "SEBO EN RAMA", precio: 1100, vigenteDesde: "2026-11-23" },
  { ruta: "Planta San Joaquin", proveedor: "Barbara Gomez", punto: "", producto: "SEBO EN RAMA", precio: 1100, vigenteDesde: "2026-11-23" },
  { ruta: "Planta San Joaquin", proveedor: "Miguel Angel Otero", punto: "", producto: "HUESO BLANCO", precio: 300, vigenteDesde: "2026-11-23" },
  { ruta: "Planta San Joaquin", proveedor: "Miguel Angel Otero", punto: "", producto: "SEBO EN RAMA", precio: 1300, vigenteDesde: "2026-11-23" },
  { ruta: "Planta San Joaquin", proveedor: "Miguel Angel Otero", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Distribuidora de Carnes Millan", punto: "", producto: "HUESO DE CERDO", precio: 150, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Frigorivalle", punto: "", producto: "HUESO BLANCO", precio: 250, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Frigorivalle", punto: "", producto: "SEBO EN RAMA", precio: 1250, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Mercaunion", punto: "", producto: "HUESO BLANCO", precio: 200, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Mercaunion", punto: "", producto: "SEBO EN RAMA", precio: 900, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "Mercaunion", punto: "", producto: "DESPERDICIO", precio: 50, vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 4: Buga / Roldanillo / Zarzal / Tuluá", proveedor: "Jhonatan Martinez", punto: "", producto: "SEBO EN RAMA", precio: 1000, vigenteDesde: "2026-11-23" }
];
var LISTA_PRECIOS2_NOV23_2026 = [
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Districarnes LG", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Districarnes LG", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Districarnes LG", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "La Cosecha de Mi Tierra", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "La Cosecha de Mi Tierra", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "La Cosecha de Mi Tierra", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Comercializadora R Y E", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Comercializadora R Y E", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Comercializadora R Y E", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Comercializadora R Y E", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Baratón Carnes Berlín", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Baratón Carnes Berlín", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Baratón Carnes Berlín", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Baratón Carnes Berlín", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Granahorrar", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Granahorrar", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Granahorrar", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Granahorrar", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Granahorrar", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Granahorrar", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Granahorrar", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Granahorrar", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Surtimercar", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Surtimercar", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Surtimercar", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Surtimercar", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Surtimercar", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Surtimercar", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Surtimercar", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Surtimercar", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Punto Rojo", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Punto Rojo", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Punto Rojo", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali (Norte / Centro / Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Punto Rojo", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Punto Rojo", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Punto Rojo", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Punto Rojo", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudad del Campo", punto: "Ciudad del Campo Punto Rojo", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Jaime Zuluaga", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Jaime Zuluaga", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Jaime Zuluaga", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Jaime Zuluaga", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Milton Muñoz", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Milton Muñoz", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Milton Muñoz", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Milton Muñoz", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudadela del Río", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudadela del Río", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudadela del Río", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Ciudadela del Río", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026) | Retirar desde 2027-01-01 (Último día: 31/12/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Carnicos La Fama", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Carnicos La Fama", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Carnicos La Fama", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Carnicos La Fama", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Carnicos La Fama", punto: "", producto: "MANTECA", precio: 2500, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 2: Cali Sur / Oriente/ Juanchito)", proveedor: "Carnicos La Fama", punto: "", producto: "ACEITE", precio: "", estado: "Inactivo", observaciones: "Aceite no se recibe hasta nuevo aviso - Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Nutrialimentos Valdez (Villagorgona)", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Nutrialimentos Valdez (Villagorgona)", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Nutrialimentos Valdez (Villagorgona)", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Nutrialimentos Valdez (Villagorgona)", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Yénifer Díaz (Villagorgona)", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Yénifer Díaz (Villagorgona)", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Yénifer Díaz (Villagorgona)", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Yénifer Díaz (Villagorgona)", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Yénifer Díaz (Villagorgona)", punto: "", producto: "MANTECA", precio: 2500, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Yénifer Díaz (Villagorgona)", punto: "", producto: "ACEITE", precio: "", estado: "Inactivo", observaciones: "Aceite no se recibe hasta nuevo aviso - Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Jorge Adrián Rodas (Villagorgona)", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Jorge Adrián Rodas (Villagorgona)", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Jorge Adrián Rodas (Villagorgona)", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Jorge Adrián Rodas (Villagorgona)", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Ricardo Gil", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Ricardo Gil", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Ricardo Gil", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Ricardo Gil", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Central Henry Martinez", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Central Henry Martinez", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Central Henry Martinez", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Central Henry Martinez", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Orlando Giraldo", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Orlando Giraldo", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Orlando Giraldo", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Orlando Giraldo", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Carnicería Fabián López (Águila Roja)", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Carnicería Fabián López (Águila Roja)", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Carnicería Fabián López (Águila Roja)", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Carnicería Fabián López (Águila Roja)", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Jose Alex Pareja", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Jose Alex Pareja", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Jose Alex Pareja", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 5: Palmira / Villagorgona / Carmelo", proveedor: "Jose Alex Pareja", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "La Esperanza", punto: "", producto: "HUESO BLANCO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "La Esperanza", punto: "", producto: "HUESO DE CERDO", precio: 200, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "La Esperanza", punto: "", producto: "SEBO EN RAMA", precio: 900, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "La Esperanza", punto: "", producto: "DESPERDICIO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" },
  { ruta: "Ruta 6: Oriente/Sur", proveedor: "La Esperanza", punto: "", producto: "PIEL POLLO", precio: 50, estado: "Activo", observaciones: "Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)", vigenteDesde: "2026-11-23" }
];


// ==============================================================================
// GESTOR RÁPIDO DE TARIFAS ADMIN: CONSULTA HTTP (action=getTarifas)
// ==============================================================================
function obtenerTarifasHttp_(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoy = obtenerFechaHoyIsoColombia_();
    var sheetTarifas = ss.getSheetByName("Tarifas");
    if (!sheetTarifas || sheetTarifas.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        result: 'success',
        hoy: hoy,
        total: 0,
        tarifas: [],
        nov23YaCargada: false,
        nov23Count: 0,
        nov23Total: LISTA_PRECIOS_NOV23_2026.length,
        lista2YaCargada: false,
        lista2Count: 0,
        lista2Total: LISTA_PRECIOS2_NOV23_2026.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var lastRow = sheetTarifas.getLastRow();
    var lastCol = sheetTarifas.getLastColumn();
    var headers = sheetTarifas.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = { ruta: 0, prov: 1, punto: 2, prod: 3, precio: 4, estado: 5, obs: 6, vigenteDesde: (lastCol >= 8 ? 7 : -1) };
    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('ruta') !== -1) colIdx.ruta = c;
      else if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('estado') !== -1) colIdx.estado = c;
      else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
      else if (h.indexOf('observ') !== -1) colIdx.obs = c;
      else if (h.indexOf('vigente') !== -1 || h.indexOf('vigencia') !== -1) colIdx.vigenteDesde = c;
    }

    var raw = sheetTarifas.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var tarifas = [];
    var clavesEnHoja = {};

    for (var i = 0; i < raw.length; i++) {
      var rRuta = String(raw[i][colIdx.ruta] || '').trim();
      var rProv = String(raw[i][colIdx.prov] || '').trim();
      var rPunto = String(raw[i][colIdx.punto] || '').trim();
      var rProd = String(raw[i][colIdx.prod] || '').trim().toUpperCase();
      if (!rProv && !rProd) continue;

      var rPrecio = parsePrecioMoneda(raw[i][colIdx.precio]);
      var rEstado = String(raw[i][colIdx.estado] || 'Activo').trim();
      var rObs = (colIdx.obs !== -1 && colIdx.obs < raw[i].length) ? String(raw[i][colIdx.obs] || '').trim() : '';
      var rawVig = (colIdx.vigenteDesde !== -1 && colIdx.vigenteDesde < raw[i].length) ? raw[i][colIdx.vigenteDesde] : '';
      var rVig = normalizarFechaIso_(rawVig, '2026-01-01');

      tarifas.push({
        fila: i + 2,
        ruta: rRuta,
        proveedor: rProv,
        proveedorHomologado: homologarProveedor(rProv),
        punto: rPunto,
        producto: rProd,
        precio: rPrecio !== null ? rPrecio : 0,
        estado: rEstado,
        observaciones: rObs,
        vigenteDesde: rVig
      });

      var kNov = normalizarTexto(rRuta) + '|' + normalizarTexto(rProv) + '|' + normalizarTexto(rPunto) + '|' + normalizarTexto(rProd) + '|' + rVig;
      clavesEnHoja[kNov] = true;
    }

    var nov23Count = 0;
    for (var n = 0; n < LISTA_PRECIOS_NOV23_2026.length; n++) {
      var item = LISTA_PRECIOS_NOV23_2026[n];
      var kSpec = normalizarTexto(item.ruta) + '|' + normalizarTexto(item.proveedor) + '|' + normalizarTexto(item.punto) + '|' + normalizarTexto(item.producto) + '|' + item.vigenteDesde;
      if (clavesEnHoja[kSpec]) {
        nov23Count++;
      }
    }

    var lista2Count = 0;
    for (var n2 = 0; n2 < LISTA_PRECIOS2_NOV23_2026.length; n2++) {
      var item2 = LISTA_PRECIOS2_NOV23_2026[n2];
      var vig2 = item2.vigenteDesde || '2026-11-23';
      var kSpec2 = normalizarTexto(item2.ruta) + '|' + normalizarTexto(item2.proveedor) + '|' + normalizarTexto(item2.punto) + '|' + normalizarTexto(item2.producto) + '|' + vig2;
      if (clavesEnHoja[kSpec2]) {
        lista2Count++;
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      hoy: hoy,
      total: tarifas.length,
      tarifas: tarifas,
      nov23YaCargada: (nov23Count >= LISTA_PRECIOS_NOV23_2026.length),
      nov23Count: nov23Count,
      nov23Total: LISTA_PRECIOS_NOV23_2026.length,
      lista2YaCargada: (lista2Count >= LISTA_PRECIOS2_NOV23_2026.length),
      lista2Count: lista2Count,
      lista2Total: LISTA_PRECIOS2_NOV23_2026.length
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("Error en obtenerTarifasHttp_: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// RE-LIQUIDACIÓN QUIRÚRGICA POR RANGO DE FECHAS EN RECOLECCIONES (v2.0.0)
// ==============================================================================
function reliquidarRecoleccionesPorRango_(ss, opts) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetRec = ss.getSheetByName("Recolecciones");
  if (!sheetRec || sheetRec.getLastRow() <= 1) {
    return { filasActualizadas: 0, valorAnteriorCOP: 0, valorNuevoCOP: 0, backupSheetName: '' };
  }

  var normProvTarget = normalizarTexto(opts.proveedor || '');
  var puntoScopeRaw = String(opts.puntoScope || 'TODAS').trim();
  var aplicarFiltroPunto = (
    puntoScopeRaw !== '' &&
    puntoScopeRaw.toUpperCase() !== 'TODAS' &&
    puntoScopeRaw.toLowerCase() !== '(general)' &&
    puntoScopeRaw.toLowerCase() !== 'general'
  );
  var puntoScopeNorm = aplicarFiltroPunto ? normalizarTexto(puntoScopeRaw) : '';
  var desdeIso = normalizarFechaIso_(opts.fechaDesde, '');
  var hastaIso = normalizarFechaIso_(opts.fechaHasta, '');
  var cambiosValidos = Array.isArray(opts.cambios) ? opts.cambios : [];

  if (!normProvTarget || !desdeIso || !hastaIso || desdeIso > hastaIso || cambiosValidos.length === 0) {
    return { filasActualizadas: 0, valorAnteriorCOP: 0, valorNuevoCOP: 0, backupSheetName: '' };
  }

  var lastRow = sheetRec.getLastRow();
  var lastCol = sheetRec.getLastColumn();
  var headers = sheetRec.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx = { id: 0, fecha: 1, prov: 4, punto: 5, prod: 6, kg: 7, precio: 10, valor: 11 };
  for (var c = 0; c < Math.min(headers.length, 12); c++) {
    var h = normalizarTexto(headers[c]);
    if (h.indexOf('id') !== -1 && c === 0) colIdx.id = c;
    else if (h.indexOf('fecha') !== -1) colIdx.fecha = c;
    else if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
    else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
    else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
    else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
    else if ((h.indexOf('kg') !== -1 || h.indexOf('kilo') !== -1) && h.indexOf('precio') === -1 && h.indexOf('tarifa') === -1) colIdx.kg = c;
    else if ((h.indexOf('valor') !== -1 || h.indexOf('total') !== -1) && h.indexOf('factura') === -1) colIdx.valor = c;
  }

  var numColsToRead = Math.max(colIdx.valor + 1, 12);
  var rawValues = sheetRec.getRange(2, 1, lastRow - 1, numColsToRead).getValues();
  var filasReales = 0;
  for (var rScan = rawValues.length - 1; rScan >= 0; rScan--) {
    var hasId = String(rawValues[rScan][0] || '').trim() !== '';
    var hasFecha = String(rawValues[rScan][1] || '').trim() !== '';
    var hasProd = String(rawValues[rScan][colIdx.prod] || '').trim() !== '';
    if (hasId || hasFecha || hasProd) {
      filasReales = rScan + 1;
      break;
    }
  }
  var values = filasReales > 0 ? rawValues.slice(0, filasReales) : [];
  if (values.length === 0) {
    return { filasActualizadas: 0, valorAnteriorCOP: 0, valorNuevoCOP: 0, backupSheetName: '' };
  }

  var precioValorMatrix = [];
  var filasActualizadas = 0;
  var valorAnteriorCOP = 0;
  var valorNuevoCOP = 0;

  for (var i = 0; i < values.length; i++) {
    var rawPrecio = values[i][colIdx.precio];
    var rawValor = values[i][colIdx.valor];
    var rowIdStr = String(values[i][colIdx.id] || '').trim();
    var rowProdRaw = String(values[i][colIdx.prod] || '').trim();
    var rowKg = parseKilosNumero(values[i][colIdx.kg]);

    if (rowKg <= 0 || !rowProdRaw || rowProdRaw.toLowerCase().indexOf('visita fallida') !== -1 || rowIdStr.indexOf('NOV-') === 0) {
      precioValorMatrix.push([rawPrecio, rawValor]);
      continue;
    }

    var rowFechaIso = normalizarFechaIso_(values[i][colIdx.fecha], '');
    if (!rowFechaIso || rowFechaIso < desdeIso || rowFechaIso > hastaIso) {
      precioValorMatrix.push([rawPrecio, rawValor]);
      continue;
    }

    var rowProvNorm = normalizarTexto(values[i][colIdx.prov]);
    if (rowProvNorm !== normProvTarget) {
      precioValorMatrix.push([rawPrecio, rawValor]);
      continue;
    }

    if (aplicarFiltroPunto) {
      var rowPuntoNorm = normalizarTexto(values[i][colIdx.punto]);
      var puntoOk = (rowPuntoNorm !== '' && (rowPuntoNorm === puntoScopeNorm || rowPuntoNorm.indexOf(puntoScopeNorm) !== -1 || puntoScopeNorm.indexOf(rowPuntoNorm) !== -1));
      if (!puntoOk) {
        precioValorMatrix.push([rawPrecio, rawValor]);
        continue;
      }
    }

    var matchedPrecio = null;
    for (var cb = 0; cb < cambiosValidos.length; cb++) {
      if (productosCoinciden(rowProdRaw, cambiosValidos[cb].producto)) {
        matchedPrecio = cambiosValidos[cb].precio;
        break;
      }
    }

    if (matchedPrecio !== null && matchedPrecio > 0) {
      var prevValNum = parsePrecioMoneda(rawValor) || 0;
      var nuevoValor = Math.round(matchedPrecio * rowKg * 100) / 100;
      precioValorMatrix.push([matchedPrecio, nuevoValor]);
      filasActualizadas++;
      valorAnteriorCOP += prevValNum;
      valorNuevoCOP += nuevoValor;
    } else {
      precioValorMatrix.push([rawPrecio, rawValor]);
    }
  }

  var backupSheetName = '';
  if (filasActualizadas > 0) {
    var hoyCompact = obtenerFechaHoyIsoColombia_().replace(/-/g, '');
    backupSheetName = crearRespaldoSiNoExiste_(ss, sheetRec, 'Recolecciones_Backup_PreReliq_' + hoyCompact);

    if (colIdx.valor === colIdx.precio + 1) {
      sheetRec.getRange(2, colIdx.precio + 1, precioValorMatrix.length, 2).setValues(precioValorMatrix);
    } else {
      var colPrecioArr = [];
      var colValorArr = [];
      for (var pIdx = 0; pIdx < precioValorMatrix.length; pIdx++) {
        colPrecioArr.push([precioValorMatrix[pIdx][0]]);
        colValorArr.push([precioValorMatrix[pIdx][1]]);
      }
      sheetRec.getRange(2, colIdx.precio + 1, colPrecioArr.length, 1).setValues(colPrecioArr);
      sheetRec.getRange(2, colIdx.valor + 1, colValorArr.length, 1).setValues(colValorArr);
    }
  }

  return {
    filasActualizadas: filasActualizadas,
    valorAnteriorCOP: Math.round(valorAnteriorCOP),
    valorNuevoCOP: Math.round(valorNuevoCOP),
    backupSheetName: backupSheetName
  };
}

// ==============================================================================
// GESTOR RÁPIDO DE TARIFAS ADMIN: ACTUALIZACIÓN MASIVA POR PROVEEDOR (v2.0.0)
// ==============================================================================
function actualizarTarifasMasivoSheet_(ss, rawPayload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    lock.waitLock(25000);
    lockAcquired = true;
  } catch (eLock) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: 'El servidor está procesando otra operación contable. Intente nuevamente en unos segundos.'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTarifas = ss.getSheetByName("Tarifas");
    if (!sheetTarifas) throw new Error("No existe la pestaña Tarifas.");

    var data = null;
    if (typeof rawPayload === 'string') {
      try { data = JSON.parse(rawPayload); } catch (e) { data = null; }
    } else {
      data = rawPayload;
    }
    if (!data || typeof data !== 'object') throw new Error("Payload inválido.");

    var proveedor = String(data.proveedor || '').trim();
    if (!proveedor) throw new Error("El campo proveedor es obligatorio.");

    var cambiosRaw = data.cambios;
    if (typeof cambiosRaw === 'string') {
      try { cambiosRaw = JSON.parse(cambiosRaw); } catch (eC) { cambiosRaw = []; }
    }
    if (!Array.isArray(cambiosRaw) || cambiosRaw.length === 0) {
      throw new Error("Debe suministrar al menos un cambio de precio en cambios[].");
    }

    var cambios = [];
    var productosLista = [];
    for (var ci = 0; ci < cambiosRaw.length; ci++) {
      var ch = cambiosRaw[ci];
      if (!ch) continue;
      var prodU = String(ch.producto || '').trim().toUpperCase();
      var precN = parsePrecioMoneda(ch.precio);
      if (!prodU || precN === null || precN <= 0) continue;
      cambios.push({
        producto: prodU,
        precio: precN,
        estado: String(ch.estado || 'Activo').trim() || 'Activo',
        observaciones: ch.observaciones ? String(ch.observaciones).trim() : ''
      });
      productosLista.push(prodU);
    }
    if (cambios.length === 0) {
      throw new Error("No hay cambios válidos (producto no vacío y precio > 0).");
    }

    var hoyIso = obtenerFechaHoyIsoColombia_();
    var hoyCompact = hoyIso.replace(/-/g, '');
    var vigenteDesde = normalizarFechaIso_(data.vigenteDesde, hoyIso);
    var puntoScopeRaw = 'TODAS';
    if (data.puntoScope !== undefined && data.puntoScope !== null && String(data.puntoScope).trim() !== '') {
      puntoScopeRaw = String(data.puntoScope).trim();
    } else if (String(data.alcancePunto || '').trim().toUpperCase() === 'UNA' && data.punto !== undefined && data.punto !== null && String(data.punto).trim() !== '') {
      puntoScopeRaw = String(data.punto).trim();
    } else if (data.punto !== undefined && data.punto !== null && String(data.punto).trim() !== '') {
      puntoScopeRaw = String(data.punto).trim();
    }
    var fechaDesdeParam = data.fechaDesde || data.rangoDesde || '';
    var fechaHastaParam = data.fechaHasta || data.rangoHasta || '';
    var modoAplicacion = String(data.modoAplicacion || 'solo_futuras').trim().toLowerCase();
    var obsDefault = String(data.observaciones || ('Actualización rápida Admin (Vigencia ' + vigenteDesde + ')')).trim();

    // 1. Respaldo automático de Tarifas antes de mutar
    var backupTarifas = crearRespaldoSiNoExiste_(ss, sheetTarifas, 'Tarifas_Backup_' + hoyCompact);

    // 2. Garantizar Columna H Vigente_Desde sin alterar A..G
    var vigColIdx = garantizarColumnaVigenciaTarifas_(sheetTarifas);

    // 3. Leer estructura y filas actuales de Tarifas
    var lastRow = sheetTarifas.getLastRow();
    var lastCol = Math.max(8, sheetTarifas.getLastColumn(), vigColIdx + 1);
    var headers = sheetTarifas.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = { ruta: 0, prov: 1, punto: 2, prod: 3, precio: 4, estado: 5, obs: 6, vigenteDesde: vigColIdx };
    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('ruta') !== -1) colIdx.ruta = c;
      else if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('estado') !== -1) colIdx.estado = c;
      else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
      else if (h.indexOf('observ') !== -1) colIdx.obs = c;
      else if (h.indexOf('vigente') !== -1 || h.indexOf('vigencia') !== -1) colIdx.vigenteDesde = c;
    }

    var rawData = (lastRow > 1) ? sheetTarifas.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    var normProvTarget = normalizarTexto(proveedor);

    // Indexar filas existentes y recolectar rutas/puntos del proveedor
    var indexConRuta = {};     // ruta|prov|punto|prod|vig -> row1
    var indexSinRuta = {};     // prov|punto|prod|vig -> [row1, ...]
    var destinosMap = {};      // rutaNorm|puntoNorm -> { ruta, proveedor, punto }
    var primeraRutaProv = '';
    var provNombreHoja = proveedor;

    for (var i = 0; i < rawData.length; i++) {
      var rRuta = String(rawData[i][colIdx.ruta] || '').trim();
      var rProv = String(rawData[i][colIdx.prov] || '').trim();
      var rPunto = String(rawData[i][colIdx.punto] || '').trim();
      var rProd = String(rawData[i][colIdx.prod] || '').trim();
      var rVig = normalizarFechaIso_(rawData[i][colIdx.vigenteDesde], '2026-01-01');

      var kConR = normalizarTexto(rRuta) + '|' + normalizarTexto(rProv) + '|' + normalizarTexto(rPunto) + '|' + normalizarTexto(rProd) + '|' + rVig;
      var kSinR = normalizarTexto(rProv) + '|' + normalizarTexto(rPunto) + '|' + normalizarTexto(rProd) + '|' + rVig;
      indexConRuta[kConR] = i + 2;
      if (!indexSinRuta[kSinR]) indexSinRuta[kSinR] = [];
      indexSinRuta[kSinR].push(i + 2);

      if (normalizarTexto(rProv) === normProvTarget) {
        if (!primeraRutaProv && rRuta) primeraRutaProv = rRuta;
        if (rProv) provNombreHoja = rProv;
        var kDest = normalizarTexto(rRuta) + '|' + normalizarTexto(rPunto);
        if (!destinosMap[kDest]) {
          destinosMap[kDest] = { ruta: rRuta || 'Ruta General', proveedor: rProv, punto: rPunto };
        }
      }
    }

    // 4. Resolver destinos según puntoScope
    var destinos = [];
    var esTodas = (puntoScopeRaw.toUpperCase() === 'TODAS');
    var esGeneral = (puntoScopeRaw === '' || puntoScopeRaw.toLowerCase() === '(general)' || puntoScopeRaw.toLowerCase() === 'general');

    if (esTodas) {
      for (var dk in destinosMap) {
        destinos.push(destinosMap[dk]);
      }
      if (destinos.length === 0) {
        destinos.push({ ruta: String(data.ruta || 'Ruta General').trim(), proveedor: provNombreHoja, punto: '' });
      }
    } else if (esGeneral) {
      for (var dkG in destinosMap) {
        if (normalizarTexto(destinosMap[dkG].punto) === '') {
          destinos.push(destinosMap[dkG]);
        }
      }
      if (destinos.length === 0) {
        destinos.push({ ruta: primeraRutaProv || String(data.ruta || 'Ruta General').trim(), proveedor: provNombreHoja, punto: '' });
      }
    } else {
      var targetPuntoNorm = normalizarTexto(puntoScopeRaw);
      for (var dkP in destinosMap) {
        if (normalizarTexto(destinosMap[dkP].punto) === targetPuntoNorm) {
          destinos.push(destinosMap[dkP]);
        }
      }
      if (destinos.length === 0) {
        destinos.push({ ruta: primeraRutaProv || String(data.ruta || 'Ruta General').trim(), proveedor: provNombreHoja, punto: puntoScopeRaw });
      }
    }

    // 5. Aplicar cada (destino, cambio) preservando vigencias anteriores
    var actualizadas = 0;
    var insertadas = 0;
    var filasNuevas = [];

    for (var d = 0; d < destinos.length; d++) {
      var dest = destinos[d];
      for (var j = 0; j < cambios.length; j++) {
        var cam = cambios[j];
        var obsFinal = sanitizarParaHoja(cam.observaciones || obsDefault);
        var keyExacta = normalizarTexto(dest.ruta) + '|' + normalizarTexto(dest.proveedor) + '|' + normalizarTexto(dest.punto) + '|' + normalizarTexto(cam.producto) + '|' + vigenteDesde;
        var keySinR = normalizarTexto(dest.proveedor) + '|' + normalizarTexto(dest.punto) + '|' + normalizarTexto(cam.producto) + '|' + vigenteDesde;

        var filaMatch = indexConRuta[keyExacta] || -1;
        if (filaMatch === -1 && indexSinRuta[keySinR] && indexSinRuta[keySinR].length === 1) {
          filaMatch = indexSinRuta[keySinR][0];
        }

        if (filaMatch > 0) {
          sheetTarifas.getRange(filaMatch, colIdx.precio + 1).setValue(cam.precio);
          sheetTarifas.getRange(filaMatch, colIdx.estado + 1).setValue(cam.estado);
          if (colIdx.obs !== -1) {
            sheetTarifas.getRange(filaMatch, colIdx.obs + 1).setValue(obsFinal);
          }
          actualizadas++;
        } else {
          var nuevaFila = [];
          for (var cInit = 0; cInit < lastCol; cInit++) nuevaFila.push('');
          nuevaFila[colIdx.ruta] = sanitizarParaHoja(dest.ruta);
          nuevaFila[colIdx.prov] = sanitizarParaHoja(dest.proveedor);
          nuevaFila[colIdx.punto] = sanitizarParaHoja(dest.punto);
          nuevaFila[colIdx.prod] = sanitizarParaHoja(cam.producto);
          nuevaFila[colIdx.precio] = cam.precio;
          nuevaFila[colIdx.estado] = cam.estado;
          if (colIdx.obs !== -1) nuevaFila[colIdx.obs] = obsFinal;
          nuevaFila[colIdx.vigenteDesde] = vigenteDesde;

          filasNuevas.push(nuevaFila);
          insertadas++;
          indexConRuta[keyExacta] = -2; // Prevenir duplicado en mismo lote
        }
      }
    }

    if (filasNuevas.length > 0) {
      var curLastRow = sheetTarifas.getLastRow();
      var maxFilas = sheetTarifas.getMaxRows();
      var reqEndRow = curLastRow + filasNuevas.length;
      if (reqEndRow > maxFilas) {
        sheetTarifas.insertRowsAfter(maxFilas, Math.max(reqEndRow - maxFilas, 100));
      }
      sheetTarifas.getRange(curLastRow + 1, colIdx.vigenteDesde + 1, filasNuevas.length, 1).setNumberFormat('@');
      sheetTarifas.getRange(curLastRow + 1, 1, filasNuevas.length, lastCol).setValues(filasNuevas);
    }

    // 6. Asegurar que los productos modificados existan en maestro Productos
    var productosAgregados = asegurarProductosEnMaestro_(ss, productosLista);

    // 7. Modo de aplicación contable en Recolecciones
    var resLiqPendientes = null;
    var resReliqRango = null;
    if (modoAplicacion === 'pendientes') {
      resLiqPendientes = ejecutarLiquidacionPreciosVacios_(ss);
    } else if (modoAplicacion === 'rango' && fechaDesdeParam && fechaHastaParam) {
      resReliqRango = reliquidarRecoleccionesPorRango_(ss, {
        proveedor: provNombreHoja,
        puntoScope: puntoScopeRaw,
        cambios: cambios,
        fechaDesde: fechaDesdeParam,
        fechaHasta: fechaHastaParam
      });
    }

    var totalReliq = 0;
    if (resReliqRango && resReliqRango.filasActualizadas) {
      totalReliq += resReliqRango.filasActualizadas;
    }
    if (resLiqPendientes && resLiqPendientes.totalLiquidadas) {
      totalReliq += resLiqPendientes.totalLiquidadas;
    }
    var backupRec = (resReliqRango && resReliqRango.backupSheetName) || (resLiqPendientes && resLiqPendientes.backupSheetName) || '';
    var msgFinal = 'Tarifas actualizadas para ' + provNombreHoja + ' (Vigencia ' + vigenteDesde + '): ' + insertadas + ' nuevas, ' + actualizadas + ' actualizadas.';

    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      mensaje: msgFinal,
      message: msgFinal,
      proveedor: provNombreHoja,
      puntoScope: puntoScopeRaw,
      vigenteDesde: vigenteDesde,
      destinosAplicados: destinos.length,
      insertadas: insertadas,
      actualizadas: actualizadas,
      tarifasInsertadas: insertadas,
      tarifasActualizadas: actualizadas,
      reliquidadas: totalReliq,
      productosAgregados: productosAgregados,
      backupTarifas: backupTarifas,
      backupSheetName: backupTarifas,
      backupRecolecciones: backupRec,
      liquidacionPendientes: resLiqPendientes,
      reliquidacionRango: resReliqRango
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("Error en actualizarTarifasMasivoSheet_: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: err.message || err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  }
}

// ==============================================================================
// CARGA IDEMPOTENTE DE LISTAS DE PRECIOS (MOTOR GENERALIZADO + LISTA 1 Y LISTA 2)
// ==============================================================================
function ejecutarAplicarListaEspecifica_(ss, lista, opts) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    lock.waitLock(25000);
    lockAcquired = true;
  } catch (eLock) {
    throw new Error('El servidor está procesando otra operación. Intente nuevamente en unos segundos.');
  }

  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTarifas = ss.getSheetByName("Tarifas");
    if (!sheetTarifas) throw new Error("No existe la pestaña Tarifas.");

    var opciones = opts || {};
    var hoyIso = obtenerFechaHoyIsoColombia_();
    var hoyCompact = hoyIso.replace(/-/g, '');
    var backupPrefix = opciones.backupPrefix || 'Tarifas_Backup_PreNov23_';
    var backupSheetName = crearRespaldoSiNoExiste_(ss, sheetTarifas, backupPrefix + hoyCompact);

    // Garantizar Columna H Vigente_Desde (dejando '2026-01-01' en todas las filas existentes)
    var vigColIdx = garantizarColumnaVigenciaTarifas_(sheetTarifas);

    var lastRow = sheetTarifas.getLastRow();
    var lastCol = Math.max(8, sheetTarifas.getLastColumn(), vigColIdx + 1);
    var headers = sheetTarifas.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = { ruta: 0, prov: 1, punto: 2, prod: 3, precio: 4, estado: 5, obs: 6, vigenteDesde: vigColIdx };
    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('ruta') !== -1) colIdx.ruta = c;
      else if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('estado') !== -1) colIdx.estado = c;
      else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
      else if (h.indexOf('observ') !== -1) colIdx.obs = c;
      else if (h.indexOf('vigente') !== -1 || h.indexOf('vigencia') !== -1) colIdx.vigenteDesde = c;
    }

    var existentesMap = {};
    var rawData = (lastRow > 1) ? sheetTarifas.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    for (var i = 0; i < rawData.length; i++) {
      var rRuta = String(rawData[i][colIdx.ruta] || '').trim();
      var rProv = String(rawData[i][colIdx.prov] || '').trim();
      var rPunto = String(rawData[i][colIdx.punto] || '').trim();
      var rProd = String(rawData[i][colIdx.prod] || '').trim();
      var rVig = normalizarFechaIso_(rawData[i][colIdx.vigenteDesde], '2026-01-01');
      var k = normalizarTexto(rRuta) + '|' + normalizarTexto(rProv) + '|' + normalizarTexto(rPunto) + '|' + normalizarTexto(rProd) + '|' + rVig;
      existentesMap[k] = {
        row1: i + 2,
        precio: parsePrecioMoneda(rawData[i][colIdx.precio]),
        estado: String(rawData[i][colIdx.estado] || '').trim(),
        obs: (colIdx.obs !== -1 && colIdx.obs < rawData[i].length) ? String(rawData[i][colIdx.obs] || '').trim() : ''
      };
    }

    var defaultObs = opciones.defaultObs || 'Actualización LISTA_DE_PRECIOS.xlsx (Vigencia 23/11/2026)';
    var insertadas = 0;
    var actualizadas = 0;
    var sinCambios = 0;
    var filasNuevas = [];
    var productosLista = [];
    var inactivarAnterioresMap = {};

    for (var n = 0; n < lista.length; n++) {
      var item = lista[n];
      var vig = item.vigenteDesde || '2026-11-23';
      var itemEstado = String(item.estado || 'Activo').trim() || 'Activo';
      var esInactivo = (itemEstado.toLowerCase() === 'inactivo');
      var itemObs = (item.observaciones !== undefined && item.observaciones !== null && String(item.observaciones).trim() !== '')
        ? String(item.observaciones).trim()
        : defaultObs;
      var itemPrecioNorm = parsePrecioMoneda(item.precio);
      var itemPrecioCelda = (item.precio === '' || item.precio === null || item.precio === undefined) ? '' : item.precio;

      if (!esInactivo) {
        productosLista.push(item.producto);
      } else {
        var key3Inact = normalizarTexto(item.proveedor) + '|' + normalizarTexto(item.punto) + '|' + normalizarTexto(item.producto);
        if (!inactivarAnterioresMap[key3Inact] || vig > inactivarAnterioresMap[key3Inact]) {
          inactivarAnterioresMap[key3Inact] = vig;
        }
      }

      var kSpec = normalizarTexto(item.ruta) + '|' + normalizarTexto(item.proveedor) + '|' + normalizarTexto(item.punto) + '|' + normalizarTexto(item.producto) + '|' + vig;
      var match = existentesMap[kSpec];

      if (match) {
        if (match.precio !== itemPrecioNorm || match.estado.toLowerCase() !== itemEstado.toLowerCase() || match.obs !== itemObs) {
          sheetTarifas.getRange(match.row1, colIdx.precio + 1).setValue(itemPrecioCelda);
          sheetTarifas.getRange(match.row1, colIdx.estado + 1).setValue(itemEstado);
          if (colIdx.obs !== -1) {
            sheetTarifas.getRange(match.row1, colIdx.obs + 1).setValue(itemObs);
          }
          actualizadas++;
        } else {
          sinCambios++;
        }
      } else {
        var nuevaFila = [];
        for (var cInit = 0; cInit < lastCol; cInit++) nuevaFila.push('');
        nuevaFila[colIdx.ruta] = sanitizarParaHoja(item.ruta);
        nuevaFila[colIdx.prov] = sanitizarParaHoja(item.proveedor);
        nuevaFila[colIdx.punto] = sanitizarParaHoja(item.punto);
        nuevaFila[colIdx.prod] = sanitizarParaHoja(item.producto);
        nuevaFila[colIdx.precio] = itemPrecioCelda;
        nuevaFila[colIdx.estado] = itemEstado;
        if (colIdx.obs !== -1) nuevaFila[colIdx.obs] = itemObs;
        nuevaFila[colIdx.vigenteDesde] = vig;

        filasNuevas.push(nuevaFila);
        insertadas++;
        existentesMap[kSpec] = { row1: -1, precio: itemPrecioNorm, estado: itemEstado, obs: itemObs };
      }
    }

    if (filasNuevas.length > 0) {
      var curLastRow = sheetTarifas.getLastRow();
      var maxFilas = sheetTarifas.getMaxRows();
      var reqEndRow = curLastRow + filasNuevas.length;
      if (reqEndRow > maxFilas) {
        sheetTarifas.insertRowsAfter(maxFilas, Math.max(reqEndRow - maxFilas, 100));
      }
      sheetTarifas.getRange(curLastRow + 1, colIdx.vigenteDesde + 1, filasNuevas.length, 1).setNumberFormat('@');
      sheetTarifas.getRange(curLastRow + 1, 1, filasNuevas.length, lastCol).setValues(filasNuevas);
    }

    // Si algún ítem viene marcado 'Inactivo' (ej. ACEITE en puntos suspendidos),
    // marcar también cualquier fila anterior de ese Proveedor + Punto + Producto como 'Inactivo'
    // cuando hoy ya es >= vigenteDesde para ocultarlo inmediatamente en doGet y GViz.
    var inactivadasAnteriores = 0;
    var keysInactivar = Object.keys(inactivarAnterioresMap);
    if (keysInactivar.length > 0 && rawData.length > 0) {
      for (var rIdx = 0; rIdx < rawData.length; rIdx++) {
        var prevProv = String(rawData[rIdx][colIdx.prov] || '').trim();
        var prevPunto = String(rawData[rIdx][colIdx.punto] || '').trim();
        var prevProd = String(rawData[rIdx][colIdx.prod] || '').trim();
        var prevKey3 = normalizarTexto(prevProv) + '|' + normalizarTexto(prevPunto) + '|' + normalizarTexto(prevProd);
        var vigLimite = inactivarAnterioresMap[prevKey3];
        if (!vigLimite || hoyIso < vigLimite) continue;

        var prevVig = normalizarFechaIso_(rawData[rIdx][colIdx.vigenteDesde], '2026-01-01');
        if (prevVig < vigLimite) {
          var prevEstado = String(rawData[rIdx][colIdx.estado] || '').trim().toLowerCase();
          if (prevEstado !== 'inactivo') {
            sheetTarifas.getRange(rIdx + 2, colIdx.estado + 1).setValue('Inactivo');
            inactivadasAnteriores++;
          }
        }
      }
    }

    // Asegurar productos activos nuevos en pestaña Productos como Activo
    var productosAgregados = asegurarProductosEnMaestro_(ss, productosLista);

    var labelLista = opciones.labelLista || ('Lista de precios 23/11/2026 procesada (' + lista.length + ' filas)');
    var msgRes = labelLista + ': ' + insertadas + ' insertadas, ' + actualizadas + ' actualizadas, ' + sinCambios + ' sin cambios' +
      (inactivadasAnteriores > 0 ? (', ' + inactivadasAnteriores + ' filas anteriores inactivadas.') : '.');
    return {
      result: 'success',
      vigencia: '2026-11-23',
      totalLista: lista.length,
      insertadas: insertadas,
      actualizadas: actualizadas,
      sinCambios: sinCambios,
      inactivadasAnteriores: inactivadasAnteriores,
      productosAgregados: productosAgregados,
      backupSheetName: backupSheetName,
      mensaje: msgRes,
      message: msgRes
    };
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  }
}

function ejecutarAplicarListaPreciosNov23_(ss) {
  return ejecutarAplicarListaEspecifica_(ss, LISTA_PRECIOS_NOV23_2026, {
    backupPrefix: 'Tarifas_Backup_PreNov23_',
    defaultObs: 'Actualización LISTA_DE_PRECIOS.xlsx (Vigencia 23/11/2026)',
    labelLista: 'Lista de precios 23/11/2026 procesada (' + LISTA_PRECIOS_NOV23_2026.length + ' filas)'
  });
}

function ejecutarAplicarListaPrecios2Nov23_(ss) {
  return ejecutarAplicarListaEspecifica_(ss, LISTA_PRECIOS2_NOV23_2026, {
    backupPrefix: 'Tarifas_Backup_PreLista2_',
    defaultObs: 'Actualización LISTA_DE_PRECIOS2.xlsx (Vigencia 23/11/2026)',
    labelLista: 'Lista de precios 2 (23/11/2026) procesada (' + LISTA_PRECIOS2_NOV23_2026.length + ' filas)'
  });
}

function aplicarListaPreciosNov23Sheet_(ss) {
  try {
    var res = ejecutarAplicarListaPreciosNov23_(ss);
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("Error en aplicarListaPreciosNov23Sheet_: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: err.message || err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function aplicarListaPrecios2Nov23Sheet_(ss) {
  try {
    var res = ejecutarAplicarListaPrecios2Nov23_(ss);
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("Error en aplicarListaPrecios2Nov23Sheet_: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: err.message || err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function menuAplicarListaPreciosNov23() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    '📅 Cargar Lista de Precios 23/Nov/2026 (Idempotente)',
    '¿Deseas cargar las 86 tarifas oficiales de LISTA_DE_PRECIOS.xlsx con vigencia desde 2026-11-23?\n\n' +
    '🛡️ Seguridad:\n' +
    '• Se creará un respaldo automático de la pestaña Tarifas.\n' +
    '• Se agregará la columna Vigente_Desde en Columna H (sin tocar A..G).\n' +
    '• Todas las tarifas actuales quedarán protegidas con vigencia 2026-01-01.\n' +
    '• Los nuevos precios SOLO aplicarán a recolecciones desde el 23/11/2026.\n' +
    '• Es 100% idempotente: puedes ejecutarlo varias veces sin crear duplicados.',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.toast('Cargando lista de precios 23/11/2026 y creando respaldo...', '📅 ProteinAgro', 10);
    var res = ejecutarAplicarListaPreciosNov23_(ss);
    var msg = '✅ Proceso completado con éxito:\n\n' +
      '• Total lista oficial: ' + res.totalLista + ' tarifas\n' +
      '• Nuevas filas insertadas: ' + res.insertadas + '\n' +
      '• Filas actualizadas: ' + res.actualizadas + '\n' +
      '• Filas ya existentes sin cambios: ' + res.sinCambios + '\n' +
      '• Productos nuevos agregados a maestro: ' + (res.productosAgregados.length > 0 ? res.productosAgregados.join(', ') : 'Ninguno') + '\n' +
      (res.backupSheetName ? ('• Pestaña de respaldo: ' + res.backupSheetName) : '');
    ui.alert('📅 Lista de Precios 23/Nov/2026', msg, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Error al cargar lista de precios', e.toString(), ui.ButtonSet.OK);
  }
}

function menuAplicarListaPrecios2Nov23() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    '📅 Cargar Lista de Precios 2 (23/Nov/2026)',
    '¿Deseas cargar las 103 tarifas oficiales de LISTA_DE_PRECIOS2.xlsx con vigencia desde 2026-11-23?\n\n' +
    '🛡️ Seguridad:\n' +
    '• Se creará un respaldo automático Tarifas_Backup_PreLista2_YYYYMMDD.\n' +
    '• Se garantizará la columna Vigente_Desde en Columna H (sin tocar A..G).\n' +
    '• Se respetarán estados Inactivo (ej. ACEITE en puntos suspendidos).\n' +
    '• Es 100% idempotente: puedes ejecutarlo varias veces sin crear duplicados.',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.toast('Cargando Lista de Precios 2 (23/11/2026) y creando respaldo...', '📅 ProteinAgro', 10);
    var res = ejecutarAplicarListaPrecios2Nov23_(ss);
    var msg = '✅ Proceso completado con éxito:\n\n' +
      '• Total Lista 2 oficial: ' + res.totalLista + ' tarifas\n' +
      '• Nuevas filas insertadas: ' + res.insertadas + '\n' +
      '• Filas actualizadas: ' + res.actualizadas + '\n' +
      '• Filas ya existentes sin cambios: ' + res.sinCambios + '\n' +
      '• Filas anteriores inactivadas: ' + res.inactivadasAnteriores + '\n' +
      '• Productos nuevos agregados a maestro: ' + (res.productosAgregados.length > 0 ? res.productosAgregados.join(', ') : 'Ninguno') + '\n' +
      (res.backupSheetName ? ('• Pestaña de respaldo: ' + res.backupSheetName) : '');
    ui.alert('📅 Lista de Precios 2 (23/Nov/2026)', msg, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Error al cargar Lista de Precios 2', e.toString(), ui.ButtonSet.OK);
  }
}
