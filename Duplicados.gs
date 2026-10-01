// ==============================================================================
// ARCHIVO: Duplicados.gs
// DETECTOR AUTOMÁTICO DE DUPLICADOS Y SEMÁFORO EN TIEMPO REAL (PROTEINAGRO)
// ==============================================================================

/**
 * Evento en tiempo real: Detecta duplicados al escribir o al copiar/pegar filas
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== "Recolecciones") return;

    var filaInicio = e.range.getRow();
    var numFilasEditadas = e.range.getNumRows();
    
    // Ignorar si solo editaron el encabezado (Fila 1)
    if (filaInicio <= 1 && numFilasEditadas === 1) return;
    
    var lastRow = sheet.getLastRow();
    if (lastRow <= 2) return;

    var numColsTotal = Math.min(sheet.getLastColumn(), 12);
    var dataCompleta = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

    // Revisar cada una de las filas que fueron editadas o pegadas
    for (var r = 0; r < numFilasEditadas; r++) {
      var filaActualReal = filaInicio + r;
      if (filaActualReal <= 1) continue; // Saltar encabezado

      var filaValores = sheet.getRange(filaActualReal, 1, 1, 8).getValues()[0];
      var fechaActual = normalizarFechaDuplicado_(filaValores[1]);
      var provActual = String(filaValores[4] || '').trim().toLowerCase();
      var prodActual = String(filaValores[6] || '').trim().toLowerCase();
      var kgActual = parseNumeroDuplicado_(filaValores[7]);

      // Si no están los 4 datos completos, no evaluar aún
      if (!fechaActual || !provActual || !prodActual || kgActual <= 0) continue;

      var duplicados = [];

      for (var i = 0; i < dataCompleta.length; i++) {
        var filaComparada = i + 2;
        if (filaComparada === filaActualReal) continue; // No compararse consigo misma

        var fFecha = normalizarFechaDuplicado_(dataCompleta[i][1]);
        var fProv = String(dataCompleta[i][4] || '').trim().toLowerCase();
        var fProd = String(dataCompleta[i][6] || '').trim().toLowerCase();
        var fKg = parseNumeroDuplicado_(dataCompleta[i][7]);

        if (fFecha === fechaActual && fProv === provActual && fProd === prodActual && fKg === kgActual) {
          duplicados.push({
            fila: filaComparada,
            id: dataCompleta[i][0] || 'Manual'
          });
        }
      }

      var rangoFila = sheet.getRange(filaActualReal, 1, 1, numColsTotal);

      if (duplicados.length > 0) {
        // 🔴 Pintar la fila en rojo pastel
        rangoFila.setBackground("#F4C7C3");

        var primero = duplicados[0];
        var mensaje = "🚨 ¡ATENCIÓN! REGISTRO DUPLICADO DETECTADO\n\n" +
                      "• Proveedor: " + filaValores[4] + "\n" +
                      "• Materia Prima: " + filaValores[6] + "\n" +
                      "• Peso: " + kgActual + " Kg\n" +
                      "• Fecha: " + fechaActual + "\n\n" +
                      "⚠️ Ya existe exactamente este mismo registro en la FILA " + primero.fila + " (ID: " + primero.id + ").";

        // Mostrar alerta emergente en pantalla
        SpreadsheetApp.getUi().alert("ALERTA DE DUPLICIDAD", mensaje, SpreadsheetApp.getUi().ButtonSet.OK);
      } else {
        rangoFila.setBackground(null);
      }
    }

  } catch(err) {
    Logger.log("Error en onEdit: " + err.toString());
  }
}

/**
 * Auditoría masiva de todo el histórico de Recolecciones
 */
function auditarYMarcarDuplicadosRecolecciones() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Recolecciones");
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow <= 2) return;

  var numCols = Math.min(sheet.getLastColumn(), 12);
  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var registrosVistos = {};
  var filasDuplicadas = [];

  for (var i = 0; i < data.length; i++) {
    var filaReal = i + 2;
    var fecha = normalizarFechaDuplicado_(data[i][1]);
    var prov = String(data[i][4] || '').trim().toLowerCase();
    var prod = String(data[i][6] || '').trim().toLowerCase();
    var kg = parseNumeroDuplicado_(data[i][7]);

    if (!fecha || !prov || !prod || kg <= 0) continue;
    var clave = fecha + "|" + prov + "|" + prod + "|" + kg;

    if (registrosVistos[clave]) {
      filasDuplicadas.push(filaReal);
    } else {
      registrosVistos[clave] = filaReal;
    }
  }

  for (var d = 0; d < filasDuplicadas.length; d++) {
    sheet.getRange(filasDuplicadas[d], 1, 1, numCols).setBackground("#F4C7C3");
  }

  var resumen = filasDuplicadas.length > 0 
    ? "⚠️ Se encontraron y resaltaron " + filasDuplicadas.length + " filas duplicadas en color ROJO."
    : "✅ No se encontró ningún registro duplicado en la hoja.";

  SpreadsheetApp.getUi().alert("Auditoría Finalizada", resumen, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Limpiar marcas de color
 */
function limpiarColoresRecolecciones() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Recolecciones");
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, Math.min(sheet.getLastColumn(), 12)).setBackground(null);
  }
}

/**
 * Normaliza cualquier tipo de fecha (objeto Date, texto con hora, o serial numérico)
 */
function normalizarFechaDuplicado_(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "America/Bogota", "yyyy-MM-dd");
  }
  if (typeof val === 'number' && val > 30000) {
    var d = new Date((val - 25569) * 86400 * 1000);
    return Utilities.formatDate(d, "America/Bogota", "yyyy-MM-dd");
  }
  var str = String(val).trim();
  var match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    var dia = match[1].length === 1 ? '0' + match[1] : match[1];
    var mes = match[2].length === 1 ? '0' + match[2] : match[2];
    var anio = match[3];
    return anio + "-" + mes + "-" + dia;
  }
  return str.split(" ")[0];
}

/**
 * Normaliza números con coma o punto decimal
 */
function parseNumeroDuplicado_(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  var limpio = String(val).replace(/,/g, '.').replace(/[^\d.-]/g, '');
  var num = parseFloat(limpio);
  return isNaN(num) ? 0 : num;
}
