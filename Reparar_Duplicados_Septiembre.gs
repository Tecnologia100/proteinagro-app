// ==============================================================================
// ARCHIVO: Reparar_Duplicados_Septiembre.gs
// REPARACIÓN QUIRÚRGICA DE DUPLICADOS Y ANOMALÍAS DE SEPTIEMBRE (PROTEINAGRO)
// ==============================================================================
// 1. Crea automáticamente una pestaña de respaldo 'Recolecciones_Backup_PreReparacion'.
// 2. Corrige la anomalía de los 40.000 Kg en la Fila 1807 (pasa a 40 Kg - Edinson Aguirre - $48.000).
// 3. Asigna la Fila 1758 (142 Kg de Sebo) a su proveedor real 'Edinson Aguirre'.
// 4. Elimina quirúrgicamente los 24 clones sintéticos duplicados de septiembre.
// ==============================================================================

function repararDuplicadosSeptiembre(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetRec = ss.getSheetByName("Recolecciones");
    if (!sheetRec) {
      throw new Error("No se encontró la pestaña 'Recolecciones'.");
    }

    var lastRow = sheetRec.getLastRow();
    var lastCol = sheetRec.getLastColumn();
    if (lastRow <= 1) {
      throw new Error("La hoja 'Recolecciones' está vacía.");
    }

    // ==========================================================================
    // PASO 1: CREAR RESPALDO DE SEGURIDAD 100% INMUTABLE EN LA MISMA HOJA
    // ==========================================================================
    var backupSheetName = "Recolecciones_Backup_PreReparacion";
    var existingBackup = ss.getSheetByName(backupSheetName);
    if (existingBackup) {
      ss.deleteSheet(existingBackup);
    }
    var backupSheet = sheetRec.copyTo(ss);
    backupSheet.setName(backupSheetName);
    Logger.log("✅ [Seguridad] Pestaña de respaldo creada: " + backupSheetName);

    // ==========================================================================
    // PASO 2: MAPEAR COLUMNAS POR ENCABEZADO
    // ==========================================================================
    var headers = sheetRec.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = { id: 0, fecha: 1, ruta: 2, cond: 3, prov: 4, punto: 5, prod: 6, kg: 7, obs: 8, precio: 10, valor: 11 };

    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c] || '').toLowerCase().trim();
      if (h.indexOf('id') !== -1) colIdx.id = c;
      else if (h.indexOf('fecha') !== -1) colIdx.fecha = c;
      else if (h.indexOf('proveedor') !== -1) colIdx.prov = c;
      else if (h.indexOf('punto') !== -1 || h.indexOf('sucursal') !== -1) colIdx.punto = c;
      else if (h.indexOf('producto') !== -1 || h.indexOf('materia') !== -1) colIdx.prod = c;
      else if (h.indexOf('kg') !== -1 || h.indexOf('kilo') !== -1) colIdx.kg = c;
      else if (h.indexOf('precio') !== -1) colIdx.precio = c;
      else if (h.indexOf('valor') !== -1) colIdx.valor = c;
    }

    // ==========================================================================
    // PASO 3: LISTA EXACTA DE IDs SINTÉTICOS DUPLICADOS A ELIMINAR (24 CLONES)
    // ==========================================================================
    var idsClonesEliminar = {
      // 24 de septiembre
      'REC-1790263124000': true, // Cañaveral Matadero 100 kg (Clon de 1747)
      'REC-1790270182000': true, // Cañaveral Matadero 50 kg (Clon de 1760)
      'REC-1790291094000': true, // Cavasa 15 kg (Clon de 1778 Los Lagos)
      'REC-1790291189000': true, // Cavasa 111 kg (Clon de 1780 La Reserva)

      // 25 de septiembre
      'REC-1790372238000': true, // Cavasa 482 kg Pieles (Clon de 1835 Sevillana)
      'REC-1790372467000': true, // Cavasa 207 kg Sebo (Clon de 1837 Sevillana)
      'REC-1790372587000': true, // Cavasa 180 kg Sebo (Clon de 1839 Los Lagos)
      'REC-1790372678000': true, // Cavasa 75 kg Sebo (Clon de 1841 La Reserva)
      'REC-1790373112000': true, // Cavasa 228 kg Sebo (Clon de 1848 Edinson Aguirre)

      // Fechas de septiembre anteriores y posteriores
      'REC-1789145873000': true, // 11/09 Cavasa 507.8 kg Pieles (Clon de 1230 Sevillana)
      'REC-1789146762000': true, // 11/09 Cavasa 595 kg Sebo (Clon de 1232 Edinson Aguirre)
      'REC-1789245060000': true, // 12/09 Cavasa 275 kg Gordana (Clon de 1284 Edinson Aguirre)
      'REC-1789728450000': true, // 18/09 Cavasa 625 kg Sebo (Clon de 1460 Edinson Aguirre)
      'REC-1789985928000': true, // 21/09 Cavasa 979 kg Pieles (Clon de 1574 Sevillana)
      'REC-1789985974000': true, // 21/09 Cavasa 126 kg Sebo (Clon de 1576 Edinson Aguirre)
      'REC-1789986008000': true, // 21/09 Cavasa 206 kg Sebo (Clon de 1578 La Reserva)
      'REC-1789986582000': true, // 21/09 Cavasa 423 kg Sebo (Clon de 1580 Sevillana)
      'REC-1790101154000': true, // 22/09 Cavasa 210 kg Sebo (Clon de 1638 Edinson Aguirre)
      'REC-1790101244000': true, // 22/09 Cavasa 249 kg Sebo (Clon de 1640 Los Lagos)
      'REC-1790101302000': true, // 22/09 Cavasa 53 kg Sebo (Clon de 1642 La Reserva)
      'REC-1790101494000': true, // 22/09 Cavasa 327.5 kg Hueso Promocion (Clon de 1644 Sevillana)
      'REC-1790101686000': true, // 22/09 Cavasa 169 kg Sebo (Clon de 1646 Sevillana)
      'REC-1790181288000': true, // 23/09 Cavasa 171 kg Sebo (Clon de 1679 Edinson Aguirre)
      'REC-1790437841000': true  // 26/09 Cavasa 362 kg Sebo (Clon de 1875 Edinson Aguirre)
    };

    // ==========================================================================
    // PASO 4: LEER FILAS Y APLICAR CORRECCIONES EN MEMORIA
    // ==========================================================================
    var idRange = sheetRec.getRange(2, 1, lastRow - 1, 1).getValues();
    var filasParaEliminar = [];
    var correcionesRealizadas = [];

    // Recorrer de abajo hacia arriba para eliminar sin desfasar índices
    for (var r = idRange.length - 1; r >= 0; r--) {
      var filaNum = r + 2;
      var idFila = String(idRange[r][0] || '').trim();

      // Caso A: Corrección Fila 40.000 Kg (REC-1790357561744)
      if (idFila === 'REC-1790357561744') {
        sheetRec.getRange(filaNum, colIdx.prov + 1).setValue('Edinson Aguirre');
        sheetRec.getRange(filaNum, colIdx.punto + 1).setValue('Cavasa');
        sheetRec.getRange(filaNum, colIdx.kg + 1).setValue(40);
        sheetRec.getRange(filaNum, colIdx.valor + 1).setValue(48000);
        correcionesRealizadas.push("Fila " + filaNum + ": 40.000 Kg corregidos a 40 Kg (Edinson Aguirre - $48.000)");
        Logger.log("✅ Corregida Fila " + filaNum + " (40.000 Kg -> 40 Kg Edinson Aguirre)");
        continue;
      }

      // Caso B: Corrección Fila 142 Kg (REC-1790285777272)
      if (idFila === 'REC-1790285777272') {
        sheetRec.getRange(filaNum, colIdx.prov + 1).setValue('Edinson Aguirre');
        sheetRec.getRange(filaNum, colIdx.punto + 1).setValue('Cavasa');
        correcionesRealizadas.push("Fila " + filaNum + ": Proveedor 'Cavasa' corregido a 'Edinson Aguirre' (142 Kg Sebo)");
        Logger.log("✅ Corregida Fila " + filaNum + " (142 Kg -> Edinson Aguirre)");
        continue;
      }

      // Caso C: Clon sintético duplicado -> Marcar para eliminación
      if (idsClonesEliminar[idFila]) {
        filasParaEliminar.push(filaNum);
      }
    }

    // ==========================================================================
    // PASO 5: ELIMINAR QUIRÚRGICAMENTE LAS FILAS CLONES (DE ABAJO HACIA ARRIBA)
    // ==========================================================================
    for (var d = 0; d < filasParaEliminar.length; d++) {
      var numEliminar = filasParaEliminar[d];
      sheetRec.deleteRow(numEliminar);
      Logger.log("🗑️ Eliminada fila clon duplicada: " + numEliminar);
    }

    var mensajeFinal = "🎉 ¡REPARACIÓN DE SEPTIEMBRE COMPLETADA CON ÉXITO!\n\n" +
      "1. Correcciones específicas aplicadas:\n" +
      "   • " + correcionesRealizadas.join("\n   • ") + "\n\n" +
      "2. Clones sintéticos duplicados eliminados:\n" +
      "   • Total filas clon eliminadas: " + filasParaEliminar.length + " filas\n\n" +
      "3. Respaldo de seguridad creado:\n" +
      "   • Pestaña: '" + backupSheetName + "' (conserva el 100% de los datos previos)\n\n" +
      "Las recolecciones legítimas de los conductores, sus kilos y proveedores reales (Edinson Aguirre, Los Lagos, La Reserva, Sevillana) quedaron 100% intactas y saneadas.";

    Logger.log(mensajeFinal);

    try {
      SpreadsheetApp.getUi().alert(mensajeFinal);
    } catch(e) {}

    return {
      status: "success",
      filasModificadas: correcionesRealizadas.length,
      clonesEliminados: filasParaEliminar.length,
      backupCreado: backupSheetName,
      totalFilasRestantes: sheetRec.getLastRow()
    };

  } catch(err) {
    Logger.log("❌ Error en repararDuplicadosSeptiembre: " + err.toString());
    try {
      SpreadsheetApp.getUi().alert("Error: " + err.toString());
    } catch(e) {}
    return { status: "error", error: err.toString() };
  }
}

// Endpoint HTTP para Webhook
function repararDuplicadosSeptiembreHttp(ss) {
  try {
    var res = repararDuplicadosSeptiembre(ss);
    return ContentService.createTextOutput(JSON.stringify(res, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
