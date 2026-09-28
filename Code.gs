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

    // 0.05 Si viene una petición de actualización/edición de recolección
    if (e && e.parameter && e.parameter.action === 'updateRecoleccion') {
      return actualizarRecoleccionSheet(ss, e.parameter.payload);
    }

    // 0.08 Corrección masiva de Kilos convertidos erróneamente a fechas (46.xxx -> Kilos Reales)
    if (e && e.parameter && e.parameter.action === 'corregirKilosFechas') {
      return corregirKilosFechasSheet(ss);
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
        "RUTA 6: Belalcázar / Yumbo"
      ];
    }

    var output = {
      version: "1.4.1-nombre-propio",
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
      var rawKilos = (typeof prodItem === 'object' && prodItem.kilos !== undefined) ? prodItem.kilos : (data.totalKilos || 0);
      var prodKilos = parseKilosNumero(rawKilos);
      
      // Evitar duplicados por ID + Producto
      if (id && prodNombre && existingRecordsMap[id + '|' + String(prodNombre).trim().toLowerCase()]) {
        continue;
      }

      // Búsqueda inteligente de tarifa: Primero en hoja "Tarifas", y fallback a histórico de Recolecciones
      var precio = obtenerPrecioTarifa(ss, proveedor, punto, prodNombre);
      var valor = '';
      
      if (precio !== '' && !isNaN(parseFloat(precio)) && prodKilos > 0) {
        valor = Math.round(parseFloat(precio) * prodKilos * 100) / 100;
      }
      
      // Formato "Nombre Propio" automático (Title Case estilo =NOMPROPIO)
      var rutaFinal = aNombrePropio(ruta);
      var conductorFinal = aNombrePropio(conductor);
      var proveedorFinal = aNombrePropio(proveedor);
      var puntoFinal = aNombrePropio(punto);
      var prodNombreFinal = aNombrePropio(prodNombre);
      var observacionesFinal = capitalizarOracion(observaciones);
      
      sheet.appendRow([
        id, fecha, rutaFinal, conductorFinal, proveedorFinal, puntoFinal,
        prodNombreFinal, prodKilos, observacionesFinal, ubicacionGps, precio, valor
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
      
      var colIdx = { prov: 0, punto: 1, prod: 2, precio: 3, estado: 4 };
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
        var rowEstado = normalizarTexto(colIdx.estado < row.length ? row[colIdx.estado] : 'activo');
        if (rowEstado === 'inactivo') continue;

        var rowProd = normalizarTexto(colIdx.prod < row.length ? row[colIdx.prod] : '');
        var coincideProd = (rowProd === targetProd || rowProd.indexOf(targetProd) !== -1 || targetProd.indexOf(rowProd) !== -1);
        if (!coincideProd) continue;

        var rawPrice = colIdx.precio < row.length ? row[colIdx.precio] : null;
        var cleanP = parsePrecioMoneda(rawPrice);
        if (cleanP === null || cleanP <= 0) continue;

        var rowProv = normalizarTexto(colIdx.prov < row.length ? row[colIdx.prov] : '');
        var rowPunto = normalizarTexto(colIdx.punto < row.length ? row[colIdx.punto] : '');

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

    // 2. Procesar Puntos_Rutas y cruzar con la data histórica
    var filasTarifas = [];
    var materiasPorFilaPuntos = []; // Para actualizar Col 9 de Puntos_Rutas
    var mapClavesTarifas = {};

    if (sheetPuntos && sheetPuntos.getLastRow() > 1) {
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
              filasTarifas.push([
                ruta,
                prov,
                punto,
                prodName,
                precioVal !== "" ? precioVal : "",
                precioVal !== "" && precioVal > 0 ? "Activo" : "Pendiente Precio",
                precioVal !== "" && precioVal > 0 ? "Tarifa cruzada con histórico" : "Pendiente definir por gerencia"
              ]);
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
          listaNombresProds = ["Desperdicio", "Gordana", "Hueso Blanco", "Hueso De Cerdo", "Sebo En Rama"];
        }

        materiasPorFilaPuntos.push([listaNombresProds.join(", ")]);
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

    // 3. Agregar filas generales por Proveedor ("Todas las Sucursales") para fallback global
    var provsKeys = Object.keys(provHistory);
    for (var pr = 0; pr < provsKeys.length; pr++) {
      var pObj = provHistory[provsKeys[pr]];
      var pProds = Object.keys(pObj);
      for (var pp = 0; pp < pProds.length; pp++) {
        var itemP = pObj[pProds[pp]];
        var provGenName = aNombrePropio(provsKeys[pr]);
        var prodGenName = itemP.prodOriginal;
        var pGenVal = itemP.precio;
        var genKey = (provGenName + '|todas las sucursales|' + prodGenName).toLowerCase();
        if (!mapClavesTarifas[genKey]) {
          mapClavesTarifas[genKey] = true;
          filasTarifas.push([
            "General",
            provGenName,
            "Todas las Sucursales",
            prodGenName,
            pGenVal !== "" ? pGenVal : "",
            pGenVal !== "" && pGenVal > 0 ? "Activo" : "Pendiente Precio",
            "Tarifa General de Cadena"
          ]);
        }
      }
    }

    // 4. Ordenar filas de Tarifas alfabéticamente
    filasTarifas.sort(function(a, b) {
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
