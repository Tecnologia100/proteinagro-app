// ==============================================================================
// ARCHIVO: Duplicados.gs
// DETECTOR AUTOMÁTICO DE DUPLICADOS Y SEMÁFORO EN TIEMPO REAL (PROTEINAGRO v1.6.9)
// Optimizado para alto rendimiento (anti-timeout 30s) y prevención de falsos positivos
// ==============================================================================

/**
 * Evento en tiempo real: Detecta duplicados al editar celdas en Recolecciones
 * Optimizado para ejecutar en < 500ms y con alertas NO bloqueantes (evita timeout de 30s)
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== "Recolecciones") return;

    var colInicio = e.range.getColumn();
    // 1. Salir de inmediato si la edición es fuera de las columnas de datos (cols 1 a 8: A a H)
    if (colInicio > 8) return;

    var filaInicio = e.range.getRow();
    var numFilasEditadas = e.range.getNumRows();
    
    // Ignorar si solo editaron encabezados (fila 1)
    if (filaInicio <= 1 && numFilasEditadas === 1) return;

    var lastRow = sheet.getLastRow();
    if (lastRow <= 2) return;

    var numColsTotal = Math.min(sheet.getLastColumn(), 12);
    // Leer solo las columnas de comparación relevantes (A a H)
    var dataCompleta = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

    for (var r = 0; r < numFilasEditadas; r++) {
      var filaActualReal = filaInicio + r;
      if (filaActualReal <= 1) continue;

      var filaValores = sheet.getRange(filaActualReal, 1, 1, 8).getValues()[0];
      var idActual = String(filaValores[0] || '').trim();
      var fechaActual = normalizarFechaDuplicado_(filaValores[1]);
      var provActual = String(filaValores[4] || '').trim().toLowerCase();
      var prodActual = String(filaValores[6] || '').trim().toLowerCase();
      var kgActual = parseNumeroDuplicado_(filaValores[7]);

      // Si no están los datos esenciales, no evaluar aún
      if (!prodActual || kgActual <= 0) continue;

      var duplicadoEncontrado = null;

      for (var i = 0; i < dataCompleta.length; i++) {
        var filaComparada = i + 2;
        if (filaComparada === filaActualReal) continue;

        var fId = String(dataCompleta[i][0] || '').trim();
        var fFecha = normalizarFechaDuplicado_(dataCompleta[i][1]);
        var fProv = String(dataCompleta[i][4] || '').trim().toLowerCase();
        var fProd = String(dataCompleta[i][6] || '').trim().toLowerCase();
        var fKg = parseNumeroDuplicado_(dataCompleta[i][7]);

        // Criterios precisos de duplicidad:
        // Criterio A: Mismo ID no vacío y mismo producto (clon de transacción)
        var esMismoIdYProd = (idActual && fId && idActual === fId && fProd === prodActual);
        
        // Criterio B: Misma fecha día, mismo proveedor, mismo producto, mismos kilos y mismo ID o ambos sin ID
        var esMismaDataExacta = (fFecha === fechaActual && fProv === provActual && fProd === prodActual && fKg === kgActual && (idActual === fId || !idActual || !fId));

        if (esMismoIdYProd || esMismaDataExacta) {
          duplicadoEncontrado = {
            fila: filaComparada,
            id: fId || 'Manual'
          };
          break; // Detener en el primer duplicado para máximo rendimiento
        }
      }

      var celdaId = sheet.getRange(filaActualReal, 1);
      var rangoFila = sheet.getRange(filaActualReal, 1, 1, numColsTotal);

      if (duplicadoEncontrado) {
        // 🔴 Pintar fila en rojo pastel
        rangoFila.setBackground("#F4C7C3");
        celdaId.setNote("⚠️ DUPLICADO DETECTADO: Coincide con Fila " + duplicadoEncontrado.fila + " (ID: " + duplicadoEncontrado.id + ")");
        
        // Notificación flotante Toast NO bloqueante (5 segundos). ¡No bloquea la UI ni causa timeout de 30s!
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "⚠️ Registro duplicado con Fila " + duplicadoEncontrado.fila + " (ID: " + duplicadoEncontrado.id + ")",
          "Alerta Duplicado",
          5
        );
      } else {
        // Limpiar marca solo si la fila tenía una nota previa de duplicado
        var notaPrevia = celdaId.getNote();
        if (notaPrevia && notaPrevia.indexOf("DUPLICADO") !== -1) {
          celdaId.clearNote();
          rangoFila.setBackground(null);
        }
      }
    }
  } catch(err) {
    Logger.log("Error en onEdit: " + err.toString());
  }
}

/**
 * Auditoría masiva de todo el histórico de Recolecciones (en memoria O(N))
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
    var id = String(data[i][0] || '').trim();
    var fecha = normalizarFechaDuplicado_(data[i][1]);
    var prov = String(data[i][4] || '').trim().toLowerCase();
    var prod = String(data[i][6] || '').trim().toLowerCase();
    var kg = parseNumeroDuplicado_(data[i][7]);

    if (!prod || kg <= 0) continue;
    // Clave precisa que combina ID si existe, o datos del registro
    var clave = (id ? (id + '|' + prod) : (fecha + '|' + prov + '|' + prod + '|' + kg));

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
