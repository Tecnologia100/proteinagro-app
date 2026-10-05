// ==============================================================================
// ARCHIVO: Migracion_Ruta1.gs
// RECLASIFICACIÓN HISTÓRICA RUTA 1: SANTA ELENA / CAVASA (VERSIÓN QUIRÚRGICA)
// ==============================================================================
// Modifica ÚNICAMENTE las Columnas E (Proveedor) y F (Punto).
// NO toca columnas con fórmulas (Col M, Col N, resúmenes), NO toca Kilos ni Precios.
// ==============================================================================

function migrarRuta1_SantaElena() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetRec = ss.getSheetByName("Recolecciones");
  if (!sheetRec) {
    Logger.log("❌ No se encontró la hoja Recolecciones.");
    return;
  }

  // 1. Escanear filas reales con ID en Columna A (evita límites de memoria o fórmulas vacías)
  var totalRows = sheetRec.getLastRow();
  if (totalRows <= 1) {
    Logger.log("Hoja vacía.");
    return;
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
    return;
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

  var msg = "✅ ¡Migración completada con éxito!\n\n" +
            "Total filas modificadas: " + mod + " de " + filasReales + "\n" +
            "  • Bodega Santa Elena: " + c1 + "\n" +
            "  • Alejandro Garay: " + c2 + "\n" +
            "  • Sevillana Santa Elena: " + c3;
  Logger.log(msg);

  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch(e) {
    // Si corre desde el editor de Apps Script
  }

  return {
    success: true,
    totalModificados: mod,
    bodegaSantaElena: c1,
    alejandroGaray: c2,
    sevillanaSantaElena: c3,
    totalFilasAuditadas: filasReales
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
