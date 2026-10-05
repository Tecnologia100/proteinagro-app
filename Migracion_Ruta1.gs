// ==============================================================================
// ARCHIVO: Migracion_Ruta1.gs
// RECLASIFICACIÓN HISTÓRICA RUTA 1: SANTA ELENA / CAVASA
// ==============================================================================
// Este script reclasifica las 276 filas históricas de la Ruta 1 (Santa Elena)
// en la hoja 'Recolecciones' e invierte Proveedor <-> Sucursal:
//
// 1. Bodega Santa Elena: Proveedor -> "Bodega Santa Elena" | Punto -> "Santa Elena"
// 2. Garay:              Proveedor -> "Alejandro Garay"    | Punto -> "Santa Elena"
// 3. Sevillana:          Proveedor -> "Sevillana Santa Elena" | Punto -> "Sevillana Santa Elena"
//
// TOTALMENTE ATÓMICO: NO toca Kilos, Precios, Valores, Fechas ni otras rutas.
// ==============================================================================

function migrarRuta1_SantaElena() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetRec = ss.getSheetByName("Recolecciones");
  if (!sheetRec) {
    SpreadsheetApp.getUi().alert("Error: No se encontró la pestaña 'Recolecciones'.");
    return;
  }

  var lr = sheetRec.getLastRow();
  var lc = sheetRec.getLastColumn();
  if (lr <= 1) {
    Logger.log("Hoja Recolecciones vacía.");
    return;
  }

  // Identificar dinámicamente las columnas para seguridad total
  var headers = sheetRec.getRange(1, 1, 1, lc).getValues()[0];
  var colRuta = 2; // Col C base 0
  var colProv = 4; // Col E base 0
  var colPto  = 5; // Col F base 0

  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || '').toLowerCase().trim();
    if (h.indexOf('ruta') !== -1) colRuta = c;
    else if (h.indexOf('proveedor') !== -1) colProv = c;
    else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colPto = c;
  }

  var range = sheetRec.getRange(2, 1, lr - 1, lc);
  var values = range.getValues();

  var c1 = 0; // Bodega Santa Elena
  var c2 = 0; // Alejandro Garay
  var c3 = 0; // Sevillana Santa Elena
  var totalMod = 0;

  for (var i = 0; i < values.length; i++) {
    var ruta = String(values[i][colRuta] || '').trim().toLowerCase();
    var prov = String(values[i][colProv] || '').trim().toLowerCase();
    var pto  = String(values[i][colPto]  || '').trim().toLowerCase();

    var esRuta1 = (ruta.indexOf('ruta 1') !== -1) || (ruta.indexOf('santa elena') !== -1);

    if (esRuta1) {
      // Caso 1: Bodega Santa Elena
      if (pto.indexOf('bodega santa elena') !== -1 || (prov === 'santa elena' && pto.indexOf('bodega') !== -1)) {
        values[i][colProv] = 'Bodega Santa Elena';
        values[i][colPto]  = 'Santa Elena';
        c1++;
        totalMod++;
      }
      // Caso 2: Alejandro Garay
      else if (pto.indexOf('garay') !== -1 || prov.indexOf('garay') !== -1) {
        values[i][colProv] = 'Alejandro Garay';
        values[i][colPto]  = 'Santa Elena';
        c2++;
        totalMod++;
      }
      // Caso 3: Sevillana Santa Elena
      else if (pto.indexOf('sevillana santa elena') !== -1 || (prov === 'santa elena' && pto.indexOf('sevillana') !== -1) || (prov === 'sevillana' && pto.indexOf('sevillana santa elena') !== -1)) {
        values[i][colProv] = 'Sevillana Santa Elena';
        values[i][colPto]  = 'Sevillana Santa Elena';
        c3++;
        totalMod++;
      }
    }
  }

  // Guardado atómico en un solo bloque en Recolecciones
  range.setValues(values);
  var mensajeRec = "✅ Recolecciones actualizadas: " + totalMod + " filas.\n" +
                   "  • Bodega Santa Elena: " + c1 + "\n" +
                   "  • Alejandro Garay: " + c2 + "\n" +
                   "  • Sevillana Santa Elena: " + c3;
  Logger.log(mensajeRec);

  // Actualizar también la matriz en Puntos_Rutas
  var sheetPuntos = ss.getSheetByName("Puntos_Rutas");
  var puntosMod = 0;
  if (sheetPuntos && sheetPuntos.getLastRow() > 1) {
    var prRange = sheetPuntos.getRange(2, 1, sheetPuntos.getLastRow() - 1, Math.max(3, sheetPuntos.getLastColumn()));
    var prValues = prRange.getValues();
    for (var j = 0; j < prValues.length; j++) {
      var pRuta = String(prValues[j][0] || '').toLowerCase();
      var pPto  = String(prValues[j][2] || '').toLowerCase().trim();
      if (pRuta.indexOf('ruta 1') !== -1 || pRuta.indexOf('santa elena') !== -1) {
        if (pPto.indexOf('bodega') !== -1) {
          prValues[j][1] = 'Bodega Santa Elena';
          prValues[j][2] = 'Santa Elena';
          puntosMod++;
        } else if (pPto.indexOf('garay') !== -1) {
          prValues[j][1] = 'Alejandro Garay';
          prValues[j][2] = 'Santa Elena';
          puntosMod++;
        } else if (pPto.indexOf('sevillana') !== -1) {
          prValues[j][1] = 'Sevillana Santa Elena';
          prValues[j][2] = 'Sevillana Santa Elena';
          puntosMod++;
        }
      }
    }
    prRange.setValues(prValues);
    Logger.log("✅ Puntos_Rutas actualizadas: " + puntosMod + " filas.");
  }

  try {
    SpreadsheetApp.getUi().alert("¡Migración Completada con Éxito!\n\n" + mensajeRec + "\n\nMatriz Puntos_Rutas actualizada: " + puntosMod + " filas.");
  } catch(e) {
    // Si se ejecutó desde el editor de Apps Script o consola
  }

  return {
    success: true,
    totalModificados: totalMod,
    bodegaSantaElena: c1,
    alejandroGaray: c2,
    sevillanaSantaElena: c3,
    puntosRutasModificados: puntosMod
  };
}

// Menú personalizado en Google Sheets
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("🚀 ProteinAgro")
      .addItem("Reclasificar Ruta 1 (Santa Elena)", "migrarRuta1_SantaElena")
      .addToUi();
  } catch (e) {}
}
