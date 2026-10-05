// ==============================================================================
// SCRIPT COMPLETO DE GOOGLE APPS SCRIPT PARA PROTEINAGRO (SISTEMA MATRIZ DINÁMICO)
// ==============================================================================

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 0. Si se solicita la vista del Conciliador / Dashboard (soporte integrado sin conflicto)
    if (e && e.parameter && (e.parameter.view === 'conciliador' || e.parameter.view === 'dashboard')) {
      return HtmlService.createHtmlOutputFromFile('CONCILIADOR')
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
      conductores = ["Ricardo Sepulveda", "Hernando Prado", "Emer Rodriguez", "Jairo Peña", "Carolina", "Luz Elena Lopez", "Francisco Larrahondo", "Daniela"];
      conductoresDetalle = [
        { nombre: "Ricardo Sepulveda", clave: "1649" },
        { nombre: "Hernando Prado", clave: "8063" },
        { nombre: "Emer Rodriguez", clave: "6860" },
        { nombre: "Jairo Peña", clave: "5301" },
        { nombre: "Carolina", clave: "1306" },
        { nombre: "Luz Elena Lopez", clave: "6700" },
        { nombre: "Francisco Larrahondo", clave: "1234" },
        { nombre: "Daniela", clave: "1234" }
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

    var output = {
      version: "1.4.2-anti-duplicados",
      productos: productos,
      conductores: conductores,
      conductores_detalle: conductoresDetalle,
      admin_clave: adminClave,
      rutas: rutas,
      puntos_rutas: puntosRutas
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
    // Leer columnas A hasta I (ID, Fecha_Hora, Ruta, Conductor, Proveedor, Punto, Materia, Kg, Observaciones)
    var numCols = Math.min(sheet.getLastColumn(), 9);
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
        observaciones: String(row[8] || '')
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

function guardarRecoleccionSheet(ss, rawPayload) {
  try {
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
    var fecha = data.fecha ? String(data.fecha) : new Date().toLocaleString();
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

      // Búsqueda inteligente de tarifa: Primero en hoja "Tarifas", y fallback a histórico de Recolecciones
      var precio = esNovedad ? 0 : obtenerPrecioTarifa(ss, proveedor, punto, prodNombre);
      var valor = '';
      
      if (precio !== '' && !isNaN(parseFloat(precio)) && prodKilos > 0) {
        valor = Math.round(parseFloat(precio) * prodKilos * 100) / 100;
      }
      
      // Formato "Nombre Propio" automático (Title Case estilo =NOMPROPIO)
      var rutaFinal = homologarRuta(ruta);
      var conductorFinal = aNombrePropio(conductor);
      var proveedorFinal = aNombrePropio(proveedor);
      var puntoFinal = aNombrePropio(punto);
      var prodNombreFinal = aNombrePropio(prodNombre);
      var observacionesFinal = capitalizarOracion(observaciones);
      
      targetRow++;
      sheet.getRange(targetRow, 1, 1, 12).setValues([[
        id, fecha, rutaFinal, conductorFinal, proveedorFinal, puntoFinal,
        prodNombreFinal, prodKilos, observacionesFinal, ubicacionGps, precio, valor
      ]]);
      existingRecordsMap[prodKey] = true;
      existingIdsMap[id] = true;
    }

    return ContentService.createTextOutput(JSON.stringify({"result": "success", "message": "Guardado exitosamente"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
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

// Búsqueda inteligente de tarifa: Primero en hoja "Tarifas", si no existe o está vacía, busca en el histórico de "Recolecciones"
function obtenerPrecioTarifa(ss, proveedor, punto, producto) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetProv = normalizarTexto(proveedor);
    var targetPunto = normalizarTexto(punto);
    var targetProd = normalizarTexto(producto);

    // 1. INTENTAR BUSCAR EN PESTAÑA "Tarifas"
    var sheetTarifas = ss.getSheetByName("Tarifas");
    if (sheetTarifas && sheetTarifas.getLastRow() > 1) {
      var lastRow = sheetTarifas.getLastRow();
      var lastCol = sheetTarifas.getLastColumn();
      var headers = sheetTarifas.getRange(1, 1, 1, lastCol).getValues()[0];
      
      var colIdx = { prov: -1, punto: -1, prod: -1, precio: -1, estado: -1 };
      for (var c = 0; c < headers.length; c++) {
        var h = normalizarTexto(headers[c]);
        if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
        else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
        else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
        else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1) colIdx.precio = c;
        else if (h.indexOf('estado') !== -1) colIdx.estado = c;
      }

      var tarifasData = sheetTarifas.getRange(2, 1, lastRow - 1, lastCol).getValues();
      var precioExactoPunto = null;
      var precioGeneralProv = null;
      var precioParcial = null;

      var provKeywords = targetProv.split(/[\s\-]+/).filter(function(w) { return w.length > 3; });

      for (var i = 0; i < tarifasData.length; i++) {
        var row = tarifasData[i];
        var rowEstado = normalizarTexto(colIdx.estado !== -1 && colIdx.estado < row.length ? row[colIdx.estado] : 'activo');
        if (rowEstado === 'inactivo') continue;

        var rowProd = normalizarTexto(colIdx.prod !== -1 && colIdx.prod < row.length ? row[colIdx.prod] : '');
        var coincideProd = (rowProd === targetProd || rowProd.indexOf(targetProd) !== -1 || targetProd.indexOf(rowProd) !== -1);
        if (!coincideProd) continue;

        var rawPrice = colIdx.precio !== -1 && colIdx.precio < row.length ? row[colIdx.precio] : null;
        var cleanP = parsePrecioMoneda(rawPrice);
        if (cleanP === null || cleanP <= 0) continue;

        var rowProv = normalizarTexto(colIdx.prov !== -1 && colIdx.prov < row.length ? row[colIdx.prov] : '');
        var rowPunto = normalizarTexto(colIdx.punto !== -1 && colIdx.punto < row.length ? row[colIdx.punto] : '');

        // Nivel 1: Proveedor exacto + Punto exacto
        if (rowProv === targetProv && targetPunto !== '' && (rowPunto === targetPunto || rowPunto.indexOf(targetPunto) !== -1)) {
          precioExactoPunto = cleanP;
          break;
        }

        // Nivel 2: Proveedor exacto + Todas las sucursales (o general)
        if (rowProv === targetProv && (rowPunto === '' || rowPunto.indexOf('todas') !== -1 || rowPunto.indexOf('general') !== -1)) {
          if (precioGeneralProv === null) precioGeneralProv = cleanP;
        }

        // Nivel 3: Coincidencia parcial de proveedor
        if (precioParcial === null) {
          if (targetProv.indexOf(rowProv) !== -1 || rowProv.indexOf(targetProv) !== -1) {
            precioParcial = cleanP;
          } else {
            for (var k = 0; k < provKeywords.length; k++) {
              if (rowProv.indexOf(provKeywords[k]) !== -1) {
                precioParcial = cleanP;
                break;
              }
            }
          }
        }
      }

      if (precioExactoPunto !== null) return precioExactoPunto;
      if (precioGeneralProv !== null) return precioGeneralProv;
      if (precioParcial !== null) return precioParcial;
    }

    // 2. SI NO ESTÁ EN TARIFAS (O AÚN ESTÁ PENDIENTE), BUSCAR EN EL HISTÓRICO DE RECOLECCIONES (FALLBACK SEGURO)
    var sheetRec = ss.getSheetByName("Recolecciones");
    if (sheetRec) {
      return buscarPrecioHistorico(sheetRec, proveedor, punto, producto);
    }

    return '';
  } catch (err) {
    return '';
  }
}

// ==============================================================================
// MOTOR DE BÚSQUEDA DE PRECIO HISTÓRICO EN RECOLECCIONES (FALLBACK)
// ==============================================================================
function buscarPrecioHistorico(sheet, proveedor, punto, producto) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return '';

    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    // 1. Mapeo dinámico de columnas por encabezados de fila 1
    var colIdx = {
      proveedor: 4,  // Col E por defecto
      punto: 5,      // Col F por defecto
      producto: 6,   // Col G por defecto
      precio: 10     // Col K por defecto
    };

    for (var c = 0; c < headers.length; c++) {
      var h = normalizarTexto(headers[c]);
      if (h.indexOf('proveedor') !== -1) colIdx.proveedor = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.producto = c;
      else if (h.indexOf('precio') !== -1 || h.indexOf('tarifa') !== -1 || h.indexOf('unitario') !== -1) colIdx.precio = c;
    }

    var numRows = lastRow - 1;
    var allData = sheet.getRange(2, 1, numRows, lastCol).getValues();

    var targetProv = normalizarTexto(proveedor);
    var targetPunto = normalizarTexto(punto);
    var targetProd = normalizarTexto(producto);

    // Palabras clave principales del proveedor (ej. "supertienda", "canaveral", "frigorivalle")
    var provKeywords = targetProv.split(/[\s\-]+/).filter(function(w) { return w.length > 3; });

    var precioExacto = null;
    var precioParcial = null;
    var precioPunto = null;
    var precioCualquiera = null;

    // Buscar de abajo hacia arriba (desde la fila más reciente hacia la más antigua)
    for (var i = allData.length - 1; i >= 0; i--) {
      var row = allData[i];
      var rawPrecio = colIdx.precio < row.length ? row[colIdx.precio] : null;
      var cleanPrice = parsePrecioMoneda(rawPrecio);

      // ¡REGLA DE ORO!: Si esta fila histórica NO tiene precio (> 0), IGNORARLA y seguir buscando hacia atrás
      if (cleanPrice === null) continue;

      var rowProd = normalizarTexto(colIdx.producto < row.length ? row[colIdx.producto] : '');
      var rowProv = normalizarTexto(colIdx.proveedor < row.length ? row[colIdx.proveedor] : '');
      var rowPunto = normalizarTexto(colIdx.punto < row.length ? row[colIdx.punto] : '');

      // El producto debe coincidir
      var coincideProd = (rowProd === targetProd || rowProd.indexOf(targetProd) !== -1 || targetProd.indexOf(rowProd) !== -1);
      if (!coincideProd) continue;

      // Nivel 1: Coincidencia EXACTA Proveedor + Producto
      if (rowProv === targetProv) {
        precioExacto = cleanPrice;
        break; // ¡Coincidencia perfecta con precio real encontrada!
      }

      // Nivel 2: Coincidencia Parcial de Proveedor (ej. "supertienda canaveral" coincide con "supertienda canaveral - frigorivalle")
      if (precioParcial === null) {
        if (targetProv.indexOf(rowProv) !== -1 || rowProv.indexOf(targetProv) !== -1) {
          precioParcial = cleanPrice;
        } else {
          for (var k = 0; k < provKeywords.length; k++) {
            if (rowProv.indexOf(provKeywords[k]) !== -1) {
              precioParcial = cleanPrice;
              break;
            }
          }
        }
      }

      // Nivel 3: Coincidencia por Punto / Sucursal (ej. "canaveral matadero")
      if (precioPunto === null && targetPunto !== '') {
        if (rowPunto === targetPunto || targetPunto.indexOf(rowPunto) !== -1 || rowPunto.indexOf(targetPunto) !== -1) {
          precioPunto = cleanPrice;
        }
      }

      // Nivel 4: Último precio registrado para este producto (cualquier proveedor como último recurso)
      if (precioCualquiera === null) {
        precioCualquiera = cleanPrice;
      }
    }

    if (precioExacto !== null) return precioExacto;
    if (precioParcial !== null) return precioParcial;
    if (precioPunto !== null) return precioPunto;
    return precioCualquiera !== null ? precioCualquiera : '';

  } catch (err) {
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

// Menú personalizado en Google Sheets para ejecución con 1 solo clic
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("🚀 ProteinAgro")
      .addItem("Reclasificar Ruta 1 (Santa Elena)", "migrarRuta1_SantaElena")
      .addToUi();
  } catch (e) {
    // Modo headless / web app
  }
}

