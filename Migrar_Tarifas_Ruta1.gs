// ==============================================================================
// ARCHIVO: Migrar_Tarifas_Ruta1.gs
// ACTUALIZACIÓN DE TARIFAS RUTA 1: SANTA ELENA / CAVASA (OPCIÓN 1)
// ==============================================================================
// Asigna tarifas individuales a cada uno de los 11 proveedores oficiales de la Ruta 1:
// • 3 Proveedores Santa Elena: Bodega Santa Elena, Alejandro Garay, Sevillana Santa Elena
// • 8 Proveedores Cavasa: Barbara Gomez, Los Lagos, Caribe, Sevillana, Migan Capital, 
//                         Freddy Hernandez, Edinson Aguirre, La Reserva
// Mantiene intactas al 100% las demás rutas y conserva tarifas de respaldo para Santa Elena y Cavasa.
// ==============================================================================

function migrarTarifasRuta1(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTarifas = ss.getSheetByName("Tarifas");
    if (!sheetTarifas) {
      sheetTarifas = ss.insertSheet("Tarifas");
    }

    var lastRow = sheetTarifas.getLastRow();
    var lastCol = Math.max(sheetTarifas.getLastColumn(), 7);

    // 1. Extraer tarifas base históricas de Santa Elena y Cavasa, y conservar otras rutas
    var tarifasSantaElena = [];
    var tarifasCavasa = [];
    var otrasRutas = [];

    if (lastRow > 1) {
      var data = sheetTarifas.getRange(2, 1, lastRow - 1, lastCol).getValues();

      for (var i = 0; i < data.length; i++) {
        var ruta = String(data[i][0] || '').trim();
        var prov = String(data[i][1] || '').trim();
        var punto = String(data[i][2] || '').trim();
        var prod = String(data[i][3] || '').trim();
        var precio = data[i][4];
        var estado = String(data[i][5] || '').trim();
        var obs = String(data[i][6] || '').trim();

        var esRuta1 = (ruta.toLowerCase().indexOf('ruta 1') !== -1 || ruta.toLowerCase().indexOf('santa elena') !== -1);

        if (esRuta1) {
          if (prov.toLowerCase() === 'santa elena') {
            tarifasSantaElena.push({ prod: prod, precio: precio, estado: estado, obs: obs });
          } else if (prov.toLowerCase() === 'cavasa') {
            tarifasCavasa.push({ prod: prod, precio: precio, estado: estado, obs: obs });
          }
          // Omitir si ya había sido migrado antes para no duplicar
        } else if (ruta !== '') {
          otrasRutas.push([ruta, prov, punto, prod, precio, estado, obs]);
        }
      }
    }

    // Si la hoja estaba vacía o no tenía datos base de Ruta 1, usar tarifas oficiales del sistema
    if (tarifasSantaElena.length === 0) {
      tarifasSantaElena = [
        { prod: 'ACEITE', precio: 3600, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'CALAMBOMBO DE CERDO', precio: '', estado: 'Pendiente Precio', obs: 'Pendiente cotizar' },
        { prod: 'DESPERDICIO', precio: 150, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'EMPELLA', precio: 2000, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'GORDANA', precio: '', estado: 'Pendiente Precio', obs: 'Pendiente cotizar' },
        { prod: 'HUESO BLANCO', precio: 300, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO DE CERDO', precio: 150, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO SECO', precio: 700, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'MANTECA', precio: 3500, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'SEBO EN RAMA', precio: 1300, estado: 'Activo', obs: 'Tarifa histórica' }
      ];
    }

    if (tarifasCavasa.length === 0) {
      tarifasCavasa = [
        { prod: 'GORDANA', precio: 2000, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO BLANCO', precio: 350, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO DE CERDO', precio: 250, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'HUESO PROMOCION', precio: 1200, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'PIELES', precio: 100, estado: 'Activo', obs: 'Tarifa histórica' },
        { prod: 'SEBO EN RAMA', precio: 1200, estado: 'Activo', obs: 'Tarifa histórica' }
      ];
    }

    // 2. Generar las filas individuales para cada proveedor oficial de Ruta 1
    var nuevasFilasRuta1 = [];
    var nombreRuta1 = "Ruta 1: Santa Elena / Cavasa";

    // 2.1 Proveedores Santa Elena (3)
    var provsSantaElena = [
      { prov: "Bodega Santa Elena", punto: "Santa Elena" },
      { prov: "Alejandro Garay", punto: "Santa Elena" },
      { prov: "Sevillana Santa Elena", punto: "Sevillana Santa Elena" }
    ];

    for (var s = 0; s < provsSantaElena.length; s++) {
      var pInfo = provsSantaElena[s];
      for (var seIdx = 0; seIdx < tarifasSantaElena.length; seIdx++) {
        var itemSE = tarifasSantaElena[seIdx];
        nuevasFilasRuta1.push([
          nombreRuta1,
          pInfo.prov,
          pInfo.punto,
          itemSE.prod,
          itemSE.precio,
          itemSE.estado,
          "Tarifa heredada Santa Elena"
        ]);
      }
    }

    // 2.2 Proveedores Cavasa (8)
    var provsCavasa = [
      { prov: "Barbara Gomez", punto: "Cavasa" },
      { prov: "Los Lagos", punto: "Cavasa" },
      { prov: "Caribe", punto: "Cavasa" },
      { prov: "Sevillana", punto: "Cavasa" },
      { prov: "Migan Capital", punto: "Cavasa" },
      { prov: "Freddy Hernandez", punto: "Cavasa" },
      { prov: "Edinson Aguirre", punto: "Cavasa" },
      { prov: "La Reserva", punto: "Cavasa" }
    ];

    for (var c = 0; c < provsCavasa.length; c++) {
      var cInfo = provsCavasa[c];
      for (var cvIdx = 0; cvIdx < tarifasCavasa.length; cvIdx++) {
        var itemCV = tarifasCavasa[cvIdx];
        nuevasFilasRuta1.push([
          nombreRuta1,
          cInfo.prov,
          cInfo.punto,
          itemCV.prod,
          itemCV.precio,
          itemCV.estado,
          "Tarifa heredada Cavasa"
        ]);
      }
    }

    // 2.3 Filas de respaldo histórico para Santa Elena y Cavasa
    for (var rSE = 0; rSE < tarifasSantaElena.length; rSE++) {
      var itemRSE = tarifasSantaElena[rSE];
      nuevasFilasRuta1.push([
        nombreRuta1,
        "Santa Elena",
        "",
        itemRSE.prod,
        itemRSE.precio,
        itemRSE.estado,
        "Tarifa respaldo histórica"
      ]);
    }

    for (var rCV = 0; rCV < tarifasCavasa.length; rCV++) {
      var itemRCV = tarifasCavasa[rCV];
      nuevasFilasRuta1.push([
        nombreRuta1,
        "Cavasa",
        "",
        itemRCV.prod,
        itemRCV.precio,
        itemRCV.estado,
        "Tarifa respaldo histórica"
      ]);
    }

    // 3. Unir Ruta 1 + Otras Rutas (Intactas)
    var matrizFinal = nuevasFilasRuta1.concat(otrasRutas);

    // 4. Escribir encabezados si es necesario
    var headers = ["Ruta", "Proveedor", "Punto_Sucursal", "Producto", "Precio_Kg", "Estado", "Observaciones"];
    sheetTarifas.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Limpiar filas anteriores por seguridad
    if (lastRow > 1) {
      sheetTarifas.getRange(2, 1, Math.max(lastRow - 1, 1), headers.length).clearContent();
    }

    // Escribir nueva matriz
    sheetTarifas.getRange(2, 1, matrizFinal.length, headers.length).setValues(matrizFinal);

    // Formatear columna E (Precio_Kg) como moneda
    sheetTarifas.getRange(2, 5, matrizFinal.length, 1).setNumberFormat("$#,##0");

    var resumenMsg = "✅ ¡Tarifario de Ruta 1 actualizado con éxito (Opción 1)!\n\n" +
                     "• Nuevas tarifas asignadas en Ruta 1: " + (provsSantaElena.length * tarifasSantaElena.length + provsCavasa.length * tarifasCavasa.length) + " filas\n" +
                     "  - 3 Proveedores Santa Elena: " + (provsSantaElena.length * tarifasSantaElena.length) + " filas\n" +
                     "  - 8 Proveedores Cavasa: " + (provsCavasa.length * tarifasCavasa.length) + " filas\n" +
                     "  - Respaldo Santa Elena y Cavasa: " + (tarifasSantaElena.length + tarifasCavasa.length) + " filas\n" +
                     "• Filas de demás rutas intactas: " + otrasRutas.length + " filas\n" +
                     "• Total filas en pestaña Tarifas: " + matrizFinal.length + " filas.";

    Logger.log(resumenMsg);

    try {
      SpreadsheetApp.getUi().alert(resumenMsg);
    } catch(e) {
      // Modo sin UI
    }

    return {
      status: "success",
      totalTarifasRuta1: nuevasFilasRuta1.length,
      tarifasSantaElenaAsignadas: provsSantaElena.length * tarifasSantaElena.length,
      tarifasCavasaAsignadas: provsCavasa.length * tarifasCavasa.length,
      otrasRutasPreservadas: otrasRutas.length,
      totalFilasTarifas: matrizFinal.length
    };

  } catch(err) {
    Logger.log("❌ Error en migrarTarifasRuta1: " + err.toString());
    try {
      SpreadsheetApp.getUi().alert("Error: " + err.toString());
    } catch(e) {}
    return { status: "error", error: err.toString() };
  }
}

// Endpoint HTTP para Apps Script Webhook
function migrarTarifasRuta1Http(ss) {
  try {
    var res = migrarTarifasRuta1(ss);
    return ContentService.createTextOutput(JSON.stringify(res, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
