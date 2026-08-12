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
    
    // 2. Obtener Conductores (filtrando Inactivos)
    var sheetConductores = ss.getSheetByName("Conductores");
    var conductores = [];
    if (sheetConductores && sheetConductores.getLastRow() > 1) {
      var condData = sheetConductores.getRange(2, 1, sheetConductores.getLastRow() - 1, 2).getValues();
      for (var j = 0; j < condData.length; j++) {
        var cNombre = String(condData[j][0] || '').trim();
        var cEstado = String(condData[j][1] || 'Activo').trim().toLowerCase();
        if (cNombre !== '' && cEstado !== 'inactivo') {
          conductores.push(cNombre);
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
      conductores = ["Camilo Perez", "Juan Gomez", "Miguel Otero", "Felipe Montilla", "Gildardo Tejada"];
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
      productos: productos,
      conductores: conductores,
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
    }

    return ContentService.createTextOutput(JSON.stringify({"result": "success", "message": "Guardado exitosamente"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": err.toString()}))
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
    sheetCond.appendRow(["Nombre", "Estado"]);
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
