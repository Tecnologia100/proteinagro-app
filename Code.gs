// ==============================================================================
// SCRIPT COMPLETO DE GOOGLE APPS SCRIPT PARA PROTEINAGRO (SIN UI.ALERT)
// ==============================================================================

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
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
    
    // 3. Obtener Rutas (filtrando Inactivos)
    var sheetRutas = ss.getSheetByName("Rutas");
    var rutas = [];
    if (sheetRutas && sheetRutas.getLastRow() > 1) {
      var rutaData = sheetRutas.getRange(2, 1, sheetRutas.getLastRow() - 1, 2).getValues();
      for (var k = 0; k < rutaData.length; k++) {
        var rNombre = String(rutaData[k][0] || '').trim();
        var rEstado = String(rutaData[k][1] || 'Activo').trim().toLowerCase();
        if (rNombre !== '' && rEstado !== 'inactivo' && rNombre.toUpperCase().indexOf('RUTA') === 0) {
          rutas.push(rNombre);
        }
      }
    }

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
      rutas: rutas
    };

    return ContentService.createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Recolecciones") || ss.getActiveSheet();
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
    var fecha = data.fecha ? new Date(data.fecha).toLocaleString() : new Date().toLocaleString();
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

    return ContentService.createTextOutput(JSON.stringify({"result": "success"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "error": error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- FUNCIÓN DE AUTO-POBLADO Y CREACIÓN DE PESTAÑAS (SIN ALERTAS BLOQUEANTES) ---
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

  // 2. Pestaña Conductores
  var sheetCond = ss.getSheetByName("Conductores") || ss.insertSheet("Conductores");
  sheetCond.clearContents();
  sheetCond.appendRow(["Nombre", "Estado"]);
  var defaultConds = [
    ["Camilo Perez", "Activo"], ["Juan Gomez", "Activo"],
    ["Miguel Otero", "Activo"], ["Felipe Montilla", "Activo"], ["Gildardo Tejada", "Activo"]
  ];
  sheetCond.getRange(2, 1, defaultConds.length, 2).setValues(defaultConds);

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
    ["RUTA 6: Belalcázar / Yumbo", "Activo"]
  ];
  sheetRutas.getRange(2, 1, defaultRutas.length, 2).setValues(defaultRutas);

  // 4. Pestaña Recolecciones
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

  Logger.log("✅ ¡ÉXITO! Se han limpiado y poblado correctamente las pestañas Productos, Conductores, Rutas y Recolecciones.");
}
