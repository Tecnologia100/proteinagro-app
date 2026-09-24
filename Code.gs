// ==============================================================================
// SCRIPT COMPLETO DE GOOGLE APPS SCRIPT PARA PROTEINAGRO (SISTEMA MATRIZ DINÁMICO)
// ==============================================================================

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 0. Si viene una petición de guardado vía GET (Garantía 100% anti-bloqueos)
    if (e && e.parameter && (e.parameter.action === 'saveRecoleccion' || (e.parameter.payload && !e.parameter.t))) {
      return guardarRecoleccionSheet(ss, e.parameter.payload);
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
      conductores = ["Ricardo Sepulveda", "Hernando Prado", "Emer Rodriguez", "Jairo Peña", "Carolina", "Luz elena lopez", "francisco larrahondo"];
      conductoresDetalle = [
        { nombre: "Ricardo Sepulveda", clave: "1649" },
        { nombre: "Hernando Prado", clave: "8063" },
        { nombre: "Emer Rodriguez", clave: "6860" },
        { nombre: "Jairo Peña", clave: "5301" },
        { nombre: "Carolina", clave: "1306" },
        { nombre: "Luz elena lopez", clave: "6700" },
        { nombre: "francisco larrahondo", clave: "1234" }
      ];
    }
    if (rutas.length === 0) {
      rutas = [
        "RUTA 1: Santa Elena / Cavasa",
        "RUTA 2: Cali (Norte / Sur / Oriente)",
        "RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance",
        "RUTA 4: Buga / Roldanillo / Zarzal / Tuluá",
        "RUTA 5: Palmira / Villagorgona / Carmelo",
        "RUTA 6: Belalcázar / Yumbo"
      ];
    }

    var output = {
      version: "1.4.0-precio-fix",
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

    if (lastRowData > 1) {
      var startCheckRow = Math.max(2, lastRowData - 200);
      var numRowsToCheck = lastRowData - startCheckRow + 1;
      var existingData = sheet.getRange(startCheckRow, 1, numRowsToCheck, Math.min(sheet.getLastColumn(), 7)).getValues();
      for (var ex = 0; ex < existingData.length; ex++) {
        var exId = String(existingData[ex][0] || '').trim();
        var exProd = String(existingData[ex][6] || '').trim();
        if (exId && exProd) {
          existingRecordsMap[exId + '|' + exProd.toLowerCase()] = true;
        }
      }
    }
    
    for (var p = 0; p < productos.length; p++) {
      var prodItem = productos[p];
      var prodNombre = (typeof prodItem === 'object' && prodItem.producto) ? prodItem.producto : String(prodItem);
      var prodKilos = (typeof prodItem === 'object' && prodItem.kilos !== undefined) ? prodItem.kilos : (data.totalKilos || 0);
      
      // Evitar duplicados por ID + Producto
      if (id && prodNombre && existingRecordsMap[id + '|' + String(prodNombre).trim().toLowerCase()]) {
        continue;
      }

      // Búsqueda inteligente del precio histórico (insensible a mayúsculas, espacios, guiones y tildes)
      var precio = buscarPrecioHistorico(sheet, proveedor, punto, prodNombre);
      var valor = '';
      
      if (precio !== '' && !isNaN(parseFloat(precio)) && !isNaN(parseFloat(prodKilos))) {
        valor = Math.round(parseFloat(precio) * parseFloat(prodKilos) * 100) / 100;
      }
      
      sheet.appendRow([
        id, fecha, ruta, conductor, proveedor, punto,
        prodNombre, prodKilos, observaciones, ubicacionGps, precio, valor
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({"result": "success", "message": "Guardado exitosamente"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// MOTOR INTELIGENTE DE BÚSQUEDA DE PRECIO HISTÓRICO
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

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var payload = null;
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
    ["RUTA 2: Cali (Norte / Sur / Oriente)", "Activo"],
    ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "Activo"],
    ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "Activo"],
    ["RUTA 5: Palmira / Villagorgona / Carmelo", "Activo"],
    ["RUTA 6: Yumbo / Otras", "Inactivo"]
  ];
  sheetRutas.getRange(2, 1, defaultRutas.length, 2).setValues(defaultRutas);

  // 4. Pestaña Puntos_Rutas (Matriz Consolidada)
  var sheetPuntosRutas = ss.getSheetByName("Puntos_Rutas") || ss.insertSheet("Puntos_Rutas");
  sheetPuntosRutas.clearContents();
  sheetPuntosRutas.appendRow(["Ruta", "Proveedor", "Punto_Sucursal", "Direccion", "Telefono", "Horario_Estimado", "Frecuencia_Dias", "Estado"]);
  
  var masterRecords = [["RUTA 1: Santa Elena / Cavasa", "MIGAN CAPITAL", "BODEGA SANTA ELENA", "Santa Elena", "", "", "Lunes a Sábado", "Activo"], ["RUTA 1: Santa Elena / Cavasa", "MIGAN CAPITAL", "GARAY SANTA ELENA", "Santa Elena", "", "", "Lunes a Sábado", "Activo"], ["RUTA 1: Santa Elena / Cavasa", "MIGAN CAPITAL", "CAVASA", "Cavasa", "", "", "Lunes a Sábado", "Activo"], ["RUTA 1: Santa Elena / Cavasa", "CUENTA SEVILLANA", "SEVILLANA SANTA ELENA", "Santa Elena", "", "", "Lunes / Miércoles / Viernes", "Activo"], ["RUTA 1: Santa Elena / Cavasa", "MIGAN CAPITAL", "CIUDAD DEL CAMPO GRANAHORRAR", "Ciudad del Campo", "", "", "Lunes / Miércoles / Viernes", "Activo"], ["RUTA 1: Santa Elena / Cavasa", "MIGAN CAPITAL", "CIUDAD DEL CAMPO PUNTO ROJO", "Ciudad del Campo", "", "", "Lunes / Miércoles / Viernes", "Activo"], ["RUTA 1: Santa Elena / Cavasa", "MIGAN CAPITAL", "CIUDAD DEL CAMPO SURTIMERCAR", "Ciudad del Campo", "", "", "Lunes / Miércoles / Viernes", "Activo"], ["RUTA 1: Santa Elena / Cavasa", "CUENTA PROVEEDORES HUESO", "LOS LAGOS ORLANDO MARTINEZ", "Los Lagos", "", "", "Miércoles / Sábado", "Activo"], ["RUTA 1: Santa Elena / Cavasa", "CUENTA 2026", "LA ESPERANZA", "La Esperanza", "", "", "Sábado", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Cliente", "Dirección", "Teléfono", "Hora", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Punto 14", "Cra. 5 #14-37", "3244935167", "06:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Centenario", "Av. 4 Norte #46-64", "3102022829", "07:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Montaña Av. 6A", "Av. 6A N #30N-47", "", "07:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Prados del Norte", "Av.2B Norte #34N-19", "", "08:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Carnes Maiale", "Cra.1G #69-02 Esquina", "", "09:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Districarnes LG", "Cra.4C #65B-18", "", "09:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Álamos", "Calle75C N #2 Bis-100", "3243192838", "10:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Los Pinos", "Calle70 #7M Bis-64", "3243192839", "10:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral La Primera", "Cra.1A #44-50", "3184277811", "11:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Montaña Torres", "Cra.1 #56-20", "", "11:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Super Carnes Los Andes", "Cra.1D #52-05", "", "12:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Cosecha de Mi Tierra", "Cra.15 Calle54 Esquina", "", "13:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "COMERCIALIZADORA R Y E", "Carnes RYE", "Cra.17F #33A-45", "", "13:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Baratón Carnes Berlín", "Calle44 #19-65", "", "14:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "El Rebajón", "Calle 44", "", "14:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Montaña Calima", "Pendiente", "", "15:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Cliente", "Dirección", "Teléfono", "Hora", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Ingenio", "Pendiente actualizar", "", "07:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Limonar", "Pendiente actualizar", "", "07:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Pasoancho", "Pendiente actualizar", "", "08:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "CUENTA SEVILLANA", "Sevillana Pasoancho", "Pendiente actualizar", "", "08:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Montaña Pasoancho", "Calle 14C #25-16", "", "09:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "CUENTA SEVILLANA", "Sevillana Lourdes", "Transv. 29D #29-50", "", "09:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Montaña Guadalupe", "Pendiente actualizar", "", "10:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Montaña Cosmocentro", "Pendiente actualizar", "", "10:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Montaña Cristales", "Pendiente actualizar", "", "11:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Villanueva", "Calle 13 #75A-185", "", "11:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "SUPERTIENDA CAÑAVERAL", "Cañaveral Cootraemcali", "Cra.70 #13B-18", "", "12:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Mercaunión", "Calle 25 #85B-100", "", "12:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "CUENTA SEVILLANA", "Sevillana República de Israel", "Calle 16A #121A-334", "", "13:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Jaime Zuluaga", "Pendiente actualizar", "", "13:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Milton Muñoz", "Pendiente actualizar", "", "14:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Montaña Decepaz", "Pendiente actualizar", "", "14:30", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "Ciudadela del Río", "Pendiente actualizar", "", "15:00", "Programada", "Activo"], ["RUTA 2: Cali (Norte / Sur / Oriente)", "MIGAN CAPITAL", "La Montaña Morichal", "Pendiente actualizar", "", "15:30", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "RECORRIDO", "", "", "DIA", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "PUERTO TEJADA-VILLARICA-JAMUNDI-PANCE", "", "", "MIERCOLES", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "Municipio", "Punto", "Dirección", "#", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "CARIBE", "Puerto Tejada", "Centro", "Cra. 19 #17-45", "1", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "CARIBE", "Puerto Tejada", "Punto 2", "Cl. 16 #20-60", "2", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "CARIBE", "Villa Rica", "Caribe", "Cra. 3 #2-60", "3", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "Jamundí", "Terranova", "Cra. 51 Sur #16C-04", "4", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "Jamundí", "Farallones", "Cl. 12 Sur #10A-77", "5", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "Jamundí", "Surtimayorista", "Cra. 10 #11-66", "6", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "Jamundí", "Rosario", "Cra. 11 #3-93", "7", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "Jamundí", "Principal", "Cra. 7 #10-48", "8", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "Jamundí", "Centro", "Cl. 11 #9-58", "9", "Programada", "Activo"], ["RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance", "SUPERTIENDA CAÑAVERAL", "Jamundí", "Panamericana", "Cra. 3D #11-145", "10", "Programada", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "CUENTA FABRICA", "Frigorífico Buga", "Buga", "", "06:00 AM", "Lunes / Martes / Miércoles / Sábado", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "SUPERTIENDA CAÑAVERAL", "Cañaveral Tuluá - Buga", "Tuluá / Buga", "", "07:30 AM", "Martes", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "SUPERTIENDA CAÑAVERAL", "Cañaveral Roldanillo - Zarzal", "Roldanillo / Zarzal", "", "09:00 AM", "Martes", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "CUENTA SEVILLANA", "Sevillana Guacarí", "Guacarí", "", "10:30 AM", "Miércoles", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "CARIBE", "Caribe Buga", "Buga", "", "11:30 AM", "Miércoles", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "CUENTA ALBERTO MILLAN", "Alberto Millán Buga", "Buga", "", "01:00 PM", "Jueves", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "BELALCAZAR", "B1-PRINCIPAL (Carrera 5 # 5-48)", "CARRERA 5 # 5-48", "", "", "Diario", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "BELALCAZAR", "B2- GALERIA (Calle 9 # 2-26)", "CALLE 9 # 2-26", "", "", "Diario", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "BELALCAZAR", "B3- PLANTA BELOMO (Carrera 4 # 14-66)", "CARRERA 4 # 14-66", "", "", "Diario", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "BELALCAZAR", "B5- GUACANDA (Transversal 6 # 13-194)", "TRANSVERSAL 6 # 13-194", "", "", "Diario", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "BELALCAZAR", "B6- ROZO (Calle 10 N # 14 A 211 Rozo- Palmira)", "CALLE 10 N # 14 A 211 ROZO- PALMIRA", "", "", "Diario", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "BELALCAZAR", "B8- BOLIVAR (Carrera 3 # 13-44)", "CARRERA 3 # 13-44", "", "", "Diario", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "BELALCAZAR", "B9- URIBE (Carrera 12 # 11-03)", "CARRERA 12 # 11-03", "", "", "Diario", "Activo"], ["RUTA 4: Buga / Roldanillo / Zarzal / Tuluá", "BELALCAZAR", "B11- GUABINAS (Calle 8 #19 B 55)", "CALLE 8 #19 B 55", "", "", "Diario", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "MIGAN CAPITAL", "Mercamio Palmira", "Palmira", "", "07:00 AM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "SUPERTIENDA CAÑAVERAL", "Cañaveral Palmitex (Palmira)", "Palmira", "", "08:00 AM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "SUPERTIENDA CAÑAVERAL", "Cañaveral Palmicentro (Palmira)", "Palmira", "", "09:00 AM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "CUENTA SEVILLANA", "Sevillana Palmira / Villagorgona", "Palmira / Villagorgona", "", "10:00 AM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "MIGAN CAPITAL", "La Montaña Palmira", "Palmira", "", "11:00 AM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "SUPERTIENDA CAÑAVERAL", "Cañaveral Villagorgona 1", "Villagorgona", "", "12:00 PM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "SUPERTIENDA CAÑAVERAL", "Cañaveral Villagorgona 2", "Villagorgona", "", "01:00 PM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "MIGAN CAPITAL", "Nutrialimentos Valdez (Villagorgona)", "Villagorgona", "", "01:30 PM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "MIGAN CAPITAL", "Yénifer Díaz (Villagorgona)", "Villagorgona", "", "02:00 PM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "MIGAN CAPITAL", "Jorge Adrián Rodas (Villagorgona)", "Villagorgona", "", "02:30 PM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "MIGAN CAPITAL", "Carnicería JAP (Carmelo)", "Carmelo", "", "03:00 PM", "Jueves", "Activo"], ["RUTA 5: Palmira / Villagorgona / Carmelo", "MIGAN CAPITAL", "Carnicería Fabián López (Águila Roja)", "Águila Roja", "", "03:30 PM", "Jueves", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "BELALCAZAR", "Belalcázar Centro", "Belalcázar", "", "08:00 AM", "Diario", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "CUENTA FABRICA", "Yumbo", "Yumbo", "", "10:00 AM", "Diario", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "BELALCAZAR", "B1-PRINCIPAL (Carrera 5 # 5-48)", "CARRERA 5 # 5-48", "", "", "Diario", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "BELALCAZAR", "B2- GALERIA (Calle 9 # 2-26)", "CALLE 9 # 2-26", "", "", "Diario", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "BELALCAZAR", "B3- PLANTA BELOMO (Carrera 4 # 14-66)", "CARRERA 4 # 14-66", "", "", "Diario", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "BELALCAZAR", "B5- GUACANDA (Transversal 6 # 13-194)", "TRANSVERSAL 6 # 13-194", "", "", "Diario", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "BELALCAZAR", "B6- ROZO (Calle 10 N # 14 A 211 Rozo- Palmira)", "CALLE 10 N # 14 A 211 ROZO- PALMIRA", "", "", "Diario", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "BELALCAZAR", "B8- BOLIVAR (Carrera 3 # 13-44)", "CARRERA 3 # 13-44", "", "", "Diario", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "BELALCAZAR", "B9- URIBE (Carrera 12 # 11-03)", "CARRERA 12 # 11-03", "", "", "Diario", "Activo"], ["RUTA 6: Belalcázar / Yumbo", "BELALCAZAR", "B11- GUABINAS (Calle 8 #19 B 55)", "CALLE 8 #19 B 55", "", "", "Diario", "Activo"]];
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

  Logger.log("✅ ¡ÉXITO! Se han limpiado y poblado automáticamente las pestañas Productos, Conductores, Rutas, Puntos_Rutas (con 94 puntos de recolección) y Recolecciones.");
}
