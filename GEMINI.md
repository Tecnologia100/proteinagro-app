# MEMORIA DEL PROYECTO: PROTEINAGRO (SISTEMA MATRIZ)

> **Documento de Memoria y Reglas de Trabajo Permanente**  
> **Última Actualización:** Octubre 2026 (Versión 1.8.3)  
> **Repositorio:** `https://github.com/Tecnologia100/proteinagro-app.git`  
> **Producción Web:** `https://proteinagro-app.vercel.app`  
> **Base de Datos Google Sheets:** `https://docs.google.com/spreadsheets/d/1eQSRvG7vWkIoW3AT5e6Ahi7ndWF6P4OG_Alxo2Go0lU/edit?usp=sharing`  
> **Webhook Apps Script:** `https://script.google.com/macros/s/AKfycbx4X0yiSS7Tisgyn2Xn2NuAlB9uWRwAP019Jurc4TvSyBseg3un47xA2d6o0rFs0Y5o9A/exec`

---

## 🏗️ 1. Arquitectura General del Sistema

- **Frontend:** Single Page Application (PWA) construida en Vanilla JavaScript (`app.js`, `index.html`, `styles.css`, `sw.js`). Desplegada automáticamente en Vercel vía GitHub (`main`).
- **Persistencia Primaria (Conductores en Campo):** LocalStorage (`recolecciones_backup`) con soporte offline total.
- **Persistencia en la Nube (Tiempo Real):** Firebase Firestore (colecciones `recolecciones` y soporte offline nativo).
- **Base Contable Oficial:** Google Sheets (hojas `Recolecciones`, `Conductores`, `Productos`, `Puntos_Rutas`, `Tarifas`).
- **Backend / Webhook:** Google Apps Script (`Code.gs`) que recibe transacciones vía `POST` (con fallback transparente a `GET`).

---

## 🔑 2. Módulos y Reglas Críticas

### 1. Sistema Anti-Duplicados y Re-Sincronización (`v1.6.2`)
- **Regla en Cliente (`app.js`):** El botón "🔄 Re-sincronizar Sheets" (`resincronizarTodoAGoogleSheets`) **NUNCA** debe re-enviar registros a ciegas. Debe filtrar primero aquellos con `!item.sync_sheets` o `estado === 'Offline'`. Si todos están sincronizados, cancela el envío y alerta preventivamente al usuario.
- **Regla en Servidor (`Code.gs`):** `guardarRecoleccionSheet` debe escanear **TODA** la hoja `Recolecciones` (desde la fila 2 hasta la última fila real con datos) indexando `id` y `id + '|' + producto`. Jamás restringir la búsqueda a ventanas fijas (ej. últimas 200 filas), ya que las fórmulas `ARRAYFORMULA` extienden el conteo de filas de la hoja. Si un ID o par ID/Producto ya existe, debe omitirse silenciosamente (`Logger.log`) y no insertar filas duplicadas.
- **Semáforo en Hoja:** Columnas M (`ID_Clave`) y N (`Alerta`) evalúan duplicados históricos con `COUNTIF > 1` (`🚨 DUPLICADO` / `✅ OK`).

### 2. Módulo de Cierre Diario y Cobertura de Rutas (`v1.6.4`)
- **Arquitectura de Auditoría en 4 Capas Anti-Fallo:**
  1. *Capa 1 (Google Sheets GViz CSV):* Consulta directa en vivo. En `sw.js`, `docs.google.com` está explícitamente excluido del interceptor para evitar errores 503 o bloqueos de caché.
  2. *Capa 2 (Webhook Google Apps Script):* Acción `action=getRecolecciones&fecha=...` en `Code.gs` para eludir 100% ad-blockers, extensiones de privacidad o bloqueos CORS de Google Visualization.
  3. *Capa 3 (Firebase Firestore):* Consulta directa a la colección `recolecciones` en la nube si Google Sheets no responde.
  4. *Capa 4 (LocalStorage Offline):* Consulta a `recolecciones_backup` en memoria del dispositivo si no hay red disponible.
- **Badge Semafórico de Fuente:** La interfaz muestra en tiempo real la procedencia de los datos auditados (`Google Sheets (En Vivo)`, `Google Sheets (Webhook)`, `Firestore (Nube)`, `Memoria Local (Offline)`).
- **Blindaje de Formateo Decimal (`formatKilosDisplay`):** Redondeo a 2 decimales y acotamiento `minimumFractionDigits <= maximumFractionDigits` para evitar excepciones `RangeError` por residuos flotantes.
- **Normalización de Fechas:** Estricta sin ceros a la izquierda (ej. `1/10/2026` vs `01/10/2026`), convirtiendo siempre a `D/M/YYYY` numérico.
- **Tolerancia a Diacríticos:** Comparación de nombres de proveedores y sucursales insensible a tildes (ej. *Cañaveral*, *Martínez*, *Villagorgona*) para evitar discrepancias con la hoja `Puntos_Rutas`.
- **Estados Semafóricos del Checklist:**
  - 🟢 `Auditado en Base`: Recolección con Kilos confirmada en Google Sheets.
  - 🟡 `Visita Fallida`: Novedad o punto con 0 Kg justificado.
  - 🔴 `No ha llegado a la Data`: Punto sin registrar en la base de datos hoy.

### 3. Sincronización en Vivo y Homologación de Proveedores Oficiales (`v1.6.5`)
- **Fuente Oficial de Proveedores:** La lista de proveedores se obtiene **exclusivamente** desde la hoja `Puntos_Rutas` en Google Sheets mediante `refrescarPuntosRutasDesdeSheets()` y `getProveedoresOficialesSheets()`.
- **Eliminación de Nombres Obsoletos/Contables:** Se eliminó la inyección de nombres contables heredados (`CUENTA 2026`, `CUENTA FABRICA`, `CUENTA SEVILLANA`, etc.).
- **Homologación de Mayúsculas y Minúsculas (`homologarNombreProveedor` / `homologarNombrePunto`):** Todos los nombres provenientes de Google Sheets, Firebase, catálogos locales o entradas de usuario se normalizan y homologan automáticamente a formato Nombre Propio / Title Case (ej. *SUPERTIENDA CAÑAVERAL* ➔ *Supertienda Cañaveral*, *la gran colombia* ➔ *La Gran Colombia*, *MIGAN CAPITAL* ➔ *Migan Capital*), preservando acrónimos comerciales (*LG*, *SAS*, *R y E*).
- **Refresco Automático y Manual al Emitir Soporte:** Al abrir el modal "Emitir Soporte Oficial", se refresca de inmediato en segundo plano la matriz de proveedores desde Google Sheets en vivo, además de contar con el botón interactivo `🔄 Refrescar Sheets` para sincronización manual inmediata.
- **Edición Administrativa Blindada:** El datalist de edición administrativa (`#edit-prov-list` y `#edit-point-list`) se alimenta de la misma fuente limpia y homologada.

### 4. Matriz de Rutas y Homologación
- Rutas soportadas: **Ruta 1 a Ruta 7** y **Planta San Joaquín**.
- Todos los nombres de rutas deben pasar por la función `homologarRuta(texto)` antes de ser persistidos o comparados.

### 5. Tarifario Cruzado Dinámico
- Los precios se obtienen automáticamente en `Code.gs` desde la pestaña `Tarifas`.
- Fallback al histórico de `Recolecciones` en caso de no existir tarifa específica.

### 6. Reclasificación y Matriz Ruta 1: Santa Elena / Cavasa (`v1.6.5`)
- **Esquema Proveedor <-> Sucursal invertido para comercios de Santa Elena:**
  - `Bodega Santa Elena`: Proveedor: `Bodega Santa Elena` | Sucursal/Punto: `Santa Elena`.
  - `Alejandro Garay`: Proveedor: `Alejandro Garay` | Sucursal/Punto: `Santa Elena`.
  - `Sevillana Santa Elena`: Proveedor: `Sevillana Santa Elena` | Sucursal/Punto: `Sevillana Santa Elena`.
- **Garantía Histórica:** Reclasificación atómica ejecutada con éxito en Google Sheets `Recolecciones`: **340 filas actualizadas** (192 Bodega Santa Elena, 63 Alejandro Garay, 85 Sevillana Santa Elena), manteniendo las 1.815 filas de las demás rutas 100% intactas, e inmutables los pesos (`Kg`), precios, valores, IDs y marcas de tiempo.
- **Catálogo Web App & Offline:** Sincronizado en `DEFAULT_RUTAS_DATA` y `CATALOGO_PUNTOS_RUTAS_DEFAULT` en `app.js` v1.6.5.

### 7. Tarifario Individualizado Ruta 1: Santa Elena / Cavasa (Opción 1 - `v1.6.6`)
- **Desglose Individual por Comercio:**
  - 3 Proveedores Santa Elena (`Bodega Santa Elena`, `Alejandro Garay`, `Sevillana Santa Elena`) con 10 materias primas heredadas de Santa Elena (30 filas).
  - 8 Proveedores Cavasa (`Barbara Gomez`, `Los Lagos`, `Caribe`, `Sevillana`, `Migan Capital`, `Freddy Hernandez`, `Edinson Aguirre`, `La Reserva`) con 6 materias primas heredadas de Cavasa (48 filas).
  - 16 filas de respaldo histórico para `Santa Elena` (10 filas) y `Cavasa` (6 filas).
  - Matriz resultante en pestaña `Tarifas`: **372 filas de datos** (+ 1 fila de encabezado = 373 filas), con las 278 filas de demás rutas 100% intactas.
- **Herramientas de Sincronización:**
  - `Migrar_Tarifas_Ruta1.gs`: Script de Google Apps Script ejecutable desde el menú *🚀 ProteinAgro > Actualizar Tarifario Ruta 1 (Opción 1)* o consola de Apps Script para actualización atómica en vivo de la pestaña `Tarifas`.
  - `Code.gs`: Endpoint `action=migrarTarifasRuta1` y fallback de respaldo inteligente en `obtenerPrecioTarifa`.
  - Archivos Excel y CSV actualizados: `Tarifario_Completo_Reparado_2026_Actualizado.xlsx`, `Tarifario_Por_Proveedor_2026_Actualizado.xlsx`, `tarifario.xlsx`, `Tarifas_GoogleSheets_Actualizado.xlsx` y `Tarifas_GoogleSheets_Actualizado.csv`.

### 8. Saneamiento Quirúrgico de Duplicados y Anomalías de Septiembre (`v1.6.7`)
- **Diagnóstico y Causa Raíz:**
  - *Error Tipográfico 40.000 Kg:* Fila 1807 (`REC-1790357561744`, 25/09 12:32:41) registró 40.000 Kg con valor de \$48.000.000. Corregido quirúrgicamente a **40 Kg** a \$1.200/Kg = **\$48.000**, asignado a su proveedor real **Edinson Aguirre** (Punto Cavasa).
  - *Identificación 142 Kg Cavasa:* Fila 1758 (`REC-1790285777272`, 24/09 16:36:17) registrada genéricamente como "Cavasa Cavasa" corregida a su proveedor real **Edinson Aguirre** (Punto Cavasa).
  - *Clones Sintéticos con IDs `REC-...000`:* Creados a finales de septiembre por copias de filas sin ID donde un script rellenó IDs evaluando fechas texto en UTC (`...000` con desfase de 5 horas / 18.000.000 ms), burlando la regla de ID duplicado. Se identificaron y eliminaron quirúrgicamente **24 clones sintéticos** (entre ellos Cañaveral Matadero 100 kg y 50 kg de Carolina, y clones de Cavasa del 11 al 26 de septiembre).
  - *Filas de Suma Total Doble en Santa Elena:* Se identificaron **5 filas de totalización duplicada** (8.051 kg, 5.515 kg, etc.) que sumaban todos los productos de un viaje de Santa Elena y los volvían a facturar como "Hueso Blanco", duplicando artificialmente las toneladas.
- **Salvaguarda y Ejecución Segura:**
  - Creación automática previa de la pestaña congelada **`Recolecciones_Backup_PreReparacion`** en Google Sheets.
  - Eliminación inversa (*bottom-up*) de las **29 filas duplicadas** (24 clones + 5 sumas dobles) y actualización puntual de las 2 filas afectadas.
  - Las 2.166 filas de recolecciones legítimas de los conductores, sus kilos y proveedores reales permanecen 100% intactas.
  - Homologación local en **`original.xlsx`**: Pestaña `original_homologado` con 361 filas limpias mapeadas a `Puntos_Rutas`, pestaña `clones_duplicados_retirados` con las 27 filas de Ruta 1 retiradas, y la fuente original cruda preservada.
  - Scripts de soporte: `Reparar_Duplicados_Septiembre.gs`, función `repararDuplicadosSeptiembre` en `Code.gs` y menú directo *🚀 ProteinAgro > 🔧 Reparar Duplicados de Septiembre*.

### 9. Blindaje de Autenticación, Idempotencia y Plausibilidad (`v1.6.8`)
- **Seguridad de Acceso:**
  - Clave de Administrador actualizada a **`2615`** como credencial oficial y segura.
  - Eliminación total del bypass `"0000"` en el login de administrador y conductores. Se limpió cualquier residuo de `"0000"` en el almacenamiento local (`localStorage`) forzando la actualización a `2615`.
  - Los conductores deben ingresar obligatoriamente su PIN asignado (o `1234` si no tienen PIN configurado).
- **Validación de Plausibilidad de Pesaje (Anti-Error Tipográfico):**
  - Alerta y confirmación interactiva si el pesaje de cualquier materia prima supera **2.500 Kg** (prevención contra errores de digitación de puntos como `40.000` vs `40`).
  - Alerta y confirmación interactiva si la recolección total del viaje supera **10.000 Kg** (10 toneladas).
  - Verificación idéntica integrada en el modal de Edición Administrativa de recolecciones.
- **Idempotencia Absoluta en Persistencia:**
  - Identificadores únicos con entropía aleatoria: `REC-[timestamp]-[rand4]` y `NOV-[timestamp]-[rand4]`.
  - Reemplazo de `.add(...)` por `.doc(recordId).set(...)` en Firestore para recolecciones y visitas fallidas / novedades. Si ocurre reintento o doble clic, el documento se actualiza sobre su clave primaria sin generar duplicados.
- **Sincronización Bidireccional de Eliminación:**
  - Al eliminar un registro desde la tabla administrativa (`eliminarRecoleccion`), además de borrarse en Firestore y LocalStorage, se envía la petición de eliminación a Google Sheets (`action=deleteRecoleccion&id=...`) evitando filas huérfanas en el Cierre Diario.
  - Se añadió trazabilidad de auditoría `modificadoPor: 'Administrador'` en la edición de registros.

### 10. Blindaje Contable, Sanitización y Rendimiento Webhook (`v1.6.9`)
- **Matching Exacto de Productos:**
  - Función `productosCoinciden(prod1, prod2)` que erradica colisiones por substring en los motores de búsqueda de tarifas (`Tarifas` e histórico de `Recolecciones`).
  - Previene que *"SEBO"* coincida con *"SEBO EN RAMA"*, *"HUESO"* con *"HUESO BLANCO"* o *"PIEL"* con *"PIEL POLLO"*, garantizando la liquidación del precio unitario legítimo de cada materia prima.
- **Erradicación de Fallback Ciego `precioCualquiera`:**
  - Eliminado el nivel de búsqueda que tomaba el último precio de cualquier proveedor ajeno cuando no había tarifa ni histórico.
  - Si un producto no tiene tarifa configurada para ese proveedor ni registro previo, el precio y valor quedan vacíos (`''`) para auditoría y revisión administrativa, impidiendo inventar valores contables arbitrarios.
- **Sanitización contra Inyección de Fórmulas:**
  - Función `sanitizarParaHoja(val)` que antepone un apóstrofe `'` a cualquier cadena que empiece por `=`, `+`, `-`, `@`, neutralizando ataques de ejecución o inyección de fórmulas (Formula Injection) en `Recolecciones`.
  - Validación estricta de identificadores mediante expresión regular `/^(REC|NOV)-\d+(-[a-zA-Z0-9]+)?$/` en la persistencia y en `eliminarRecoleccionSheet`.
- **Rendimiento y Escalabilidad O(1) en Webhook (`Code.gs`):**
  - `cargarCatalogoTarifas(ss)` lee la pestaña `Tarifas` una sola vez por petición en memoria, reduciendo el costo de I/O de $O(\text{productos} \times \text{filas})$ a $O(1)$.
  - Carga perezosa del histórico de `Recolecciones` a lo sumo una vez por transacción si algún producto requiere búsqueda histórica.
  - Escritura atómica en lote (un único `setValues` para todos los productos de la recolección en lugar de llamadas individuales fila a fila).
  - Control de concurrencia con `LockService` (`tryLock(20000)`), previniendo sobreescritura de filas y condiciones de carrera entre conductores simultáneos.
- **Optimización y Desbloqueo de `Duplicados.gs`:**
  - Salida inmediata en `onEdit(e)` si la edición ocurre fuera de las columnas de datos (A:H, cols 1 a 8).
  - Comparación refinada por ID de transacción y fecha/hora para prevenir falsos positivos en viajes legítimos del mismo día con igual peso.
  - Reemplazo del cuadro modal bloqueante `SpreadsheetApp.getUi().alert(...)` por una notificación flotante no bloqueante `SpreadsheetApp.getActiveSpreadsheet().toast(...)` (5s) y nota en celda (`setNote`), eliminando los fallos por timeout de 30 segundos de Apps Script.
- **Priorización de Mutaciones por POST:**
  - `eliminarRecoleccion` en `app.js` prioriza envío por `POST` manteniendo `GET` como fallback redundante con ID validado.

### 11. Módulo de Unidades Diferenciadas: Soporte de Atados para Leña y Segregación Contable (`v1.7.0`)
- **Naturaleza Operativa de la Leña:**
  - La materia prima `LEÑA` no se pesa en kilogramos, sino que se cobra por **Atado** (unidad equivalente a un viaje completo de camión).
  - Límite operativo infranqueable: **Máximo 5 atados por recolección**.
- **Interfaz Reactiva en Formulario del Conductor (`app.js` / `index.html`):**
  - Al seleccionar `🪵 LEÑA`:
    - Etiqueta conmuta de *Cantidad (Kilos)* a *Cantidad (Atados)*.
    - Badge indicador cambia de `KG` a `ATADOS`.
    - Placeholder cambia a `1 - 5`.
    - Botón de adición cambia a *➕ Registrar atados*.
    - Banner informativo visible: *🪵 Atado de Leña: Equivale a 1 viaje completo de camión (Máximo 5 atados)*.
  - Al seleccionar cualquier otra materia cárnica, retorna automáticamente a *Cantidad (Kilos)* y `KG`.
- **Validaciones de Capacidad y Plausibilidad Inviolables:**
  - Validación individual y acumulativa: Se bloquea la adición si la cantidad individual o acumulada en la recolección supera 5 atados (`kilosVal > 5`, `atadosPrevios + kilosVal > 5` o `totalAtados > 5`).
  - Para productos en Kg, se mantiene la alerta anti-error tipográfico si supera 2.500 Kg o 10.000 Kg en el viaje.
- **Segregación Aritmética y Contable Total:**
  - En ningún punto del sistema se mezclan o suman kilogramos con atados de leña en una sola cifra.
  - Se calculan y persisten campos independientes: `totalKilos` (peso cárnico en Kg) y `totalAtados` (unidades de atado), además del atributo `unidad: 'Atado' | 'Kg'` por cada línea de producto.
  - Función de formateo unívoco `formatResumenTotales`:
    - Recolección mixta: `X.XXX KG | Y ATADOS`.
    - Recolección exclusiva de leña: `Y ATADOS` (o `1 ATADO`).
    - Recolección cárnica estándar: `X.XXX KG`.
- **Comprobantes Digitales y WhatsApp:**
  - El modal de recibo digital y el soporte oficial administrativo discriminan cada renglón (`100 KG` en azul vs `2 ATADOS` en ámbar `#b45309`) y muestran el total segregado.
  - El texto generado para compartir por WhatsApp refleja claramente los atados y el resumen exacto.
- **Panel Administrativo y Edición:**
  - En `admin-edit-modal`, cada fila renderiza un badge en tiempo real (`Atados` vs `KG`) que conmuta dinámicamente al cambiar el producto en el selector.
  - La vista previa `recalcularTotalEditKilos` y la persistencia administran ambos totales de forma independiente.
  - Compatibilidad retroactiva con registros históricos planos donde sólo existía `rec.producto` y `rec.totalKilos`.
- **Cierre Diario, Gráficos y Exportación CSV:**
  - El motor de Cierre Diario en 4 capas audita `kilosTotalesRuta` y `atadosTotalesRuta`, reportando por ejemplo `3.450 kg + 4 atados`.
  - El gráfico de barras por proveedor (`chart-proveedor`) agrupa exclusivamente kilogramos de carga cárnica para no inflar artificialmente las toneladas recibidas en planta.
  - El gráfico por producto (`chart-producto`) rotula la porción como `LEÑA (Atados)`.
  - La exportación CSV especifica las unidades en los ítems y en la columna de total.

### 12. Optimización Visual y Selector Rápido de Atados (`v1.7.1`)
- **Resolución de Colisión Visual:** Se erradicó la superposición gráfica entre el valor ingresado y el indicador `ATADOS` mediante la regla `.input-with-unit.unit-atados .huge-input` con `padding-right: 130px` y estilización del badge en pastilla ámbar de alto contraste (`#fef3c7`, borde `#fde68a`, texto `#b45309`).
- **Selector Rápido Táctil (1 a 5 Atados):** Botonera de pulsación directa `[1] [2] [3] [4] [5]` (`.atados-quick-selector` / `.btn-quick-atado`) integrada en el formulario del conductor. Facilita la operación en campo al registrar viajes de camión con un solo toque en pantalla táctil sin desplegar teclado virtual.
- **Sincronización Bidireccional Reactiva:** El valor seleccionado por botón o ingresado manualmente conmuta el estado visual `.active` de los botones. Placeholder simplificado a `0` para una lectura visual limpia.
- **Actualización de Caché PWA:** Bumping de versión a `v1.7.1` en `sw.js`, Service Worker y hashes de recursos para forzar la actualización transparente e inmediata en todos los dispositivos de conductores y administradores.

### 13. Filtro por Frecuencia de Itinerario Semanal en Cierre Diario y Cobertura (`v1.7.2`)
- **Problema Diagnosticado:**
  Al auditar una fecha de la semana (por ejemplo, Martes en Ruta 4), el sistema cargaba ciegamente todos los 13 puntos semanales del catálogo de la ruta, incluyendo puntos exclusivos de Miércoles (Cañaveral Buga Merino, Sevillana Guacarí, Caribe Buga) o Jueves (Cañaveral Zarzal, Alberto Millán). Al aparecer como '❌ PENDIENTE' ('No ha llegado a la Data'), inflaban artificialmente el denominador y deprimían la cobertura real del 38% (3/8) al 23% (3/13).
- **Causa Raíz Delimitada:**
  1. *Falta de filtro por frecuencia en el cierre:* `MATRIZ_PUNTOS_RUTAS` leía la columna `Frecuencia_Dias`, pero `generarCierreDiarioAdmin` sólo filtraba por ruta y estado activo, ignorando el campo `frecuencia`.
  2. *Desfase de zona horaria al instanciar fechas:* `new Date("YYYY-MM-DD")` en UTC produce las 00:00:00Z, que en Colombia (UTC-5) desfasa al día anterior (Lunes 19:00 en lugar de Martes). Corregido blindando la instanciación a `new Date(targetYear, targetMonth - 1, targetDay, 12, 0, 0)` a mediodía local.
  3. *Evaluación flexible de días y rangos (`puntoAplicaParaDia`):* Normalización diacrítica (insensible a tildes, mayúsculas y espacios), interpretando rangos continuos ('Lunes a Sábado', 'Lunes a Viernes'), expresiones cotidianas ('Diario', 'Todos los días'), separadores con barras/comas/guiones ('Lunes / Viernes', 'Miércoles / Sábado') o días únicos.
  4. *Conmutador Dinámico y Respeto a Visitas Reales:* Checkbox `#cierre-solo-dia` activo por defecto que filtra únicamente los puntos programados para el día auditado, pero **incluye automáticamente cualquier visita adicional o extra registrada en campo hoy** (con badge azul `⚡ Visita Adicional`) para que ningún kilo ni visita real quede excluida de la auditoría.
- **Etiquetado e Indicadores Reactivos:**
  - Píldora de día auditado `#cierre-dia-semana-pill` (ej. `📅 Día auditado: Martes`).
  - Título dinámico `#cierre-titulo-cobertura` (`Progreso de Cobertura (Martes)` vs `Progreso de Cobertura (Semanal)`).
  - Contador dinámico `#cierre-label-puntos` (`Puntos Programados (Martes): 3 / 8` vs `Puntos Asignados (Semanal): 3 / 13`).
  - Badge de itinerario en cada fila del checklist: `📅 Frecuencia: ...` o `⚡ Visita Adicional (Prog: ...)`.
  - Re-evaluación reactiva instantánea al cambiar el checkbox `#cierre-solo-dia` sin necesidad de volver a pulsar el botón.
- **Verificación Técnica de Cobertura:**
  - Ruta 4 en Martes: 8 puntos programados (5 diarios + 3 de martes). 3 cubiertos = 38% de cobertura (vs 23% anterior).
  - Puntos de Miércoles y Jueves correctamente excluidos del denominador y del checklist de pendientes del día martes.

### 14. Blindaje de Capacidad de Hoja y Corrección de Conciliador (`v1.7.3`)
- **Auto-Expansión Dinámica de Renglones en Google Sheets (`Code.gs`):**
  - Si un usuario elimina filas vacías sobrantes al final de `Recolecciones`, la cuadrícula de la hoja se ajusta exactamente al último registro.
  - Al ingresar nuevas recolecciones, `sheet.getRange(targetRow + 1, ...).setValues(...)` fallaría con excepción `INVALID_RANGE` si `filaFinalRequerida > maxFilasActuales`.
  - Se implementó detección proactiva de capacidad: si `filaFinalRequerida > maxFilasActuales`, Apps Script invoca automáticamente `sheet.insertRowsAfter(maxFilasActuales, Math.max(filasFaltantes, 200))` antes de persistir, garantizando que **jamás se rechace o pierda una recolección por falta de renglones en la hoja**.
- **Aclaración Operativa de Cuadrícula en Google Sheets:**
  - El botón inferior `Añade [ 1000 ] filas más al final` es un componente nativo de Google Sheets cuando una hoja agota sus filas disponibles.
  - Al pulsar "Añadir", Google Sheets simplemente agrega espacio en blanco al final de la cuadrícula. El backend de ProteinAgro busca siempre el último registro real en la Columna B (`Fecha_Hora`), por lo que **nunca saltará filas vacías** y seguirá escribiendo de forma 100% continua y secuencial.
- **Saneamiento y Control de Versiones de `CONCILIADOR.html`:**
  - Se corrigió el error de sintaxis en `fetchDataViaJSONP` (donde la URL `script.src = `https:` quedó accidentalmente truncada, provocando `Uncaught SyntaxError: Unexpected identifier 'https' (Línea 398)`).
  - Se integró el archivo [`CONCILIADOR.html`](./CONCILIADOR.html) en la raíz del repositorio Git para control de versiones y respaldo permanente.
- **Unificación Monolítica Anti-Conflicto en Apps Script (`Code.gs`):**
  - Se consolidaron todas las funciones del Conciliador (`getConciliadorWebAppUrl`, `configurarUrlWebApp`, `abrirConciliadorFlotante`, `abrirConciliacionDirectaFlotante`, `abrirDescargaPlantillaSheets`, `getDashboardDataRaw`, `homologarProveedor`) y los dos menús (`📊 Conciliador` y `🚀 ProteinAgro`) en un único `onOpen()` dentro de `Code.gs`. Esto erradica el conflicto donde múltiples archivos `.gs` sobreescribían el menú o `doGet`.
  - Se blindó la lógica de enrutamiento en `doGet(e)`: si un usuario visita la URL en el navegador sin parámetros, abre el Conciliador visual; y si la PWA solicita catálogos con cache-buster `?t=...` o ejecuta mutaciones, responde con el JSON correspondiente sin interferencias.

### 15. Novedad 'Cliente Cancela Servicio' y Validación de Estado Previo al Arribo (`v1.7.4`)
- **Regla de Negocio y Condición de Disparo:**
  - La causal `"Cliente Cancela Servicio"` sólo puede registrarse **antes de que el vehículo llegue al punto** (servicio asignado / en ruta de desplazamiento hacia el origen, sin arribo marcado ni inicio de pesaje).
- **Validación Bidireccional Anti-Inconsistencias (Cliente y Backend):**
  - *Frontend (`app.js`):* `verificarPesajePrevioHoy` evalúa la memoria local y el formulario activo. Si el punto ya tiene pesaje (> 0 Kg) o recolección registrada hoy, la selección de la causal o el intento de envío es bloqueado de inmediato alertando al conductor.
  - *Backend Webhook (`Code.gs`):* `guardarRecoleccionSheet` escanea cronológicamente la hoja `Recolecciones`. Si para la fecha evaluada ya existe un pesaje con carga para ese proveedor y punto, se rechaza la transacción con excepción: `"No se puede cancelar el servicio: El vehículo ya arribó o ya existe una recolección registrada para este punto hoy"`.
- **Flexibilidad de Evidencia en Ruta:**
  - Al ocurrir antes de llegar al establecimiento físico, la interfaz (`actualizarVistaEvidenciaSegunCausal`) conmuta el campo de fotografía para permitir adjuntar captura del mensaje/llamada del cliente o ingresar una nota explicativa detallada.
- **Segregación Contable y Liberación de Itinerario:**
  - La novedad se registra con `0 Kg`, `Precio = 0` y `Valor = 0`, asignando el estado `'Servicio Cancelado'`.
  - En el Cierre Diario y Cobertura, el punto computa en `visitadosNovedad` sumando a `totalCubiertos` con badge visual `🚫 CANCELADO`, liberando al conductor y vehículo de la parada sin sumar kilos ficticios a la planta.
- **Cero Regresiones Garantizado:**
  - Todas las demás causales habituales (`Establecimiento Cerrado`, `Sin Materia Prima Disponible (0 Kg)`, etc.) mantienen su flujo original intacto con captura fotográfica obligatoria del establecimiento en sitio.

### 16. Blindaje de Re-Sincronización con Verificación Dual (Webhook + GViz CSV) (`v1.7.4`)
- **Problema Diagnosticado:**
  Al pulsar el botón administrativo *"🔄 Re-sincronizar Sheets"*, el sistema alertaba: *"Se detectaron 199 registro(s) en la nube pendientes de ingresar a Google Sheets (de 200 auditados)"*, a pesar de que dichos registros ya se encontraban físicamente en la hoja `Recolecciones`.
- **Causa Raíz:**
  1. La consulta al Webhook (`action=getRecolecciones`) fallaba o devolvía HTML, dejando vacío el conjunto `existingIdsInSheets` (`size === 0`).
  2. Al estar vacío, el sistema evaluaba ciegamente `item.sync_sheets !== true`. Los 200 registros consultados de Firestore en la nube no poseen dicho atributo booleano (que solo se usa en `localStorage` del dispositivo local), provocando que 199 documentos históricos se marcaran erróneamente como "pendientes".
- **Solución Implementada:**
  1. *Verificación Dual en 2 Capas:* Si la Capa 1 (Webhook Apps Script) no devuelve IDs, se activa inmediatamente la Capa 2 consultando directamente Google Sheets GViz CSV en vivo (`tqx=out:csv&sheet=Recolecciones`).
  2. *Detección de IDs Existentes:* GViz extrae los más de 1.150 IDs únicos registrados en la hoja de cálculo.
  3. *Erradicación de Falsos Positivos:* Si un ID ya está en Google Sheets, se descarta de la lista de faltantes.
  4. *Prevención de Re-envíos Falsos:* Si ambas capas fallan (sin conexión), el sistema solo evalúa registros locales que estén explícitamente marcados como `Offline` o `sync_sheets: false`, y si todos están en orden, alerta que no es necesario re-sincronizar para proteger la hoja contra duplicados.

### 17. Sincronización Oficial de Conductores y Blindaje Anti-Sobreescritura (`v1.7.5`)
- **Problema Diagnosticado:**
  En la aplicación móvil / TWA, los nombres de los conductores no coincidían con la pestaña `Conductores` de Google Sheets: aparecían "Carolina" y "Daniela" en lugar de sus nombres oficiales completos "Carolina Becerra" y "Daniela Marquez", y el PIN asignado a Daniela en la app no admitía el acceso con su contraseña oficial `3016`.
- **Causa Raíz:**
  1. *Truncamiento en Configuración Predeterminada:* `DEFAULT_CONDUCTORES` y `DEFAULT_CONDUCTORES_AUTH` en `app.js` y `Code.gs` contenían los nombres truncados `"Carolina"` y `"Daniela"`, y a Daniela se le asignaba la clave dummy `'1234'`.
  2. *Sobreescritura Destructiva en Flujo de Inicio (`cargarCatalogosDinamicos`):* `sincronizarCredencialesDesdeGviz()` leía en vivo los 8 conductores con nombres completos desde Google Sheets vía GViz CSV y los renderizaba. Sin embargo, inmediatamente después, `cargarCatalogosDinamicos()` intentaba consultar el Webhook Apps Script (`GOOGLE_SHEETS_WEBHOOK_URL`). Al retornar HTML (`CONCILIADOR`) en peticiones GET, la función caía en el bloque de fallback y ejecutaba ciegamente `renderDynamicDrivers(DEFAULT_CONDUCTORES)`, sobreescribiendo los 8 conductores recién leídos con los nombres truncados heredados.
  3. *Eliminación Innecesaria de Caché Offline:* La línea `localStorage.removeItem('proteinagro_conductores_cache')` purgaba la memoria local en cada inicio de la app, degradando la capacidad offline.
  4. *Modal de Edición Administrativa:* `#edit-conductor` leía directamente `DEFAULT_CONDUCTORES` en lugar de la lista en memoria o sincronizada.
- **Solución Implementada:**
  1. *Alineación de Catálogo y Credenciales:* `DEFAULT_CONDUCTORES` actualizado a los 8 conductores oficiales de la hoja (`Ricardo Sepulveda`, `Hernando Prado`, `Emer Rodriguez`, `Jairo Peña`, `Carolina Becerra`, `Luz Elena Lopez`, `Francisco Larrahondo`, `Daniela Marquez`). `DEFAULT_CONDUCTORES_AUTH` mapea sus claves exactas (`1649`, `8063`, `6860`, `5301`, `1306`, `6700`, `1234`, `3016`) preservando alias para retrocompatibilidad total.
  2. *Blindaje Anti-Sobreescritura:* En el fallback de `cargarCatalogosDinamicos()`, se prioriza la lista sincronizada en caché (`proteinagro_conductores_cache`) y `DEFAULT_CONDUCTORES` homologado, impidiendo que los selectores de conductores se degraden.
  3. *Migración Proactiva de Caché Local:* Al cargar el DOM, si el almacenamiento local aún conserva `"Carolina"` o `"Daniela"`, se mapean de inmediato a `"Carolina Becerra"` y `"Daniela Marquez"` sin latencia, y las claves dummy `'1234'` se actualizan automáticamente al PIN oficial `3016`.
  4. *Sincronización en Edición Administrativa:* `#edit-conductor` lee la fuente oficial sincronizada.
  5. *Bumping Global a `v1.7.5` y Limpieza:* Parámetros de caché actualizados en `index.html`, `app.js` y `sw.js` para forzar la recarga transparente en todos los dispositivos móviles y navegadores.

### 18. Desacoplamiento de Proveedores con Agrupación Optgroup y Catálogo Maestro (`v1.7.6`)
- **Problema Operativo Resuelto:**
  - En la aplicación móvil / TWA, al seleccionar una ruta el menú desplegable de proveedores se restringía exclusivamente a los puntos de esa ruta específica. Si un conductor realizaba un servicio imprevisto o adicional en un punto fuera de su itinerario, el formulario le impedía registrarlo o lo forzaba a seleccionar `"OTRO"`.
- **Solución de Experiencia de Usuario (Agrupación `<optgroup>`):**
  - El selector de proveedores `#proveedor` ahora organiza dinámicamente las opciones en dos grupos jerárquicos:
    1. `📍 EN TU RUTA PROGRAMADA (N)`: Marcados con estrella (`⭐`), aparecen en primer lugar para facilitar el registro de las paradas planificadas del día.
    2. `🏬 OTROS PROVEEDORES DEL CATÁLOGO (N)`: Lista completa de todos los demás proveedores del sistema, permitiendo registrar cualquier parada adicional con un solo toque y sin cambiar de pantalla.
- **Backend y Catálogo Maestro Desacoplado (`Code.gs`):**
  - Implementación de `obtenerCatalogoProveedoresCompleto(ss)` y endpoint `action=getCatalogoProveedores` que consolida en tiempo real los proveedores desde `Puntos_Rutas`, `Tarifas` y el histórico de `Recolecciones`, garantizando que ningún proveedor activo quede excluido.
- **Soporte Offline y Conciliador:**
  - Soporte integrado en `CONCILIADOR.html` mediante `recolecciones_cache.js` para acelerar las auditorías masivas sin saturar las cuotas de red.

### 19. Separación Operativa y Auditoría Retrocompatible de Sub-Rutas Hermanas: Ruta 2 Norte vs. Sur (`v1.7.7`)
- **Problema Diagnosticado (Incidente Martes 20/10/2026):**
  - El conductor **Emer Rodríguez** ejecutó la **Ruta 2 Sur** recolectando **1.675,20 Kg** en **24 transacciones** (12 de 17 puntos visitados, 70,6% de cobertura real).
  - Sin embargo, en el selector `<select id="ruta">` del conductor solo aparecía una opción de Ruta 2 (`"RUTA 2: Cali (Norte / Sur / Oriente juanchito)"`), porque `sincronizarCatalogosDesdeGviz` deduplicaba por número de ruta (`seenRutaNums.has("2")`) y descartaba silenciosamente la segunda fila (`"RUTA 2: Cali Sur / Oriente/ Juanchito)"`).
  - Al guardarse las 24 recolecciones bajo la etiqueta del Norte, el Cierre Diario para `"Ruta 2: Cali Sur / Oriente/ Juanchito)"` reportaba falsamente **0 recolecciones y 0% de cobertura (17 puntos en rojo)**.
- **Solución Quirúrgica 100% Retrocompatible (Sin Alterar Datos en Sheets/Firestore):**
  1. *Deduplicación por Clave Completa (`seenRutaKeys`):* En `sincronizarCatalogosDesdeGviz()`, se reemplazó `seenRutaNums` por `normalizarClaveRuta(rName)`, permitiendo que coexistan todas las sub-rutas activas con el mismo número (**9 rutas activas** en total, incluyendo Ruta 2 Norte y Ruta 2 Sur).
  2. *Identificación Visual de Día en Selector (`obtenerEtiquetaRutaVisible`):* `renderDynamicRoutes()` conserva `option.value` idéntico al valor oficial de la hoja, pero añade en `option.textContent` el sufijo de programación (`·  📅 Viernes` para Ruta 2 Norte y `·  📅 Martes` para Ruta 2 Sur).
  3. *Segregación de Proveedores y Puntos por Sub-Ruta (`rutasCoinciden`, `getSubRuta`, `getNumeroRuta`):*
     - Al elegir Ruta 2 Sur, el grupo `📍 EN TU RUTA PROGRAMADA` lista únicamente los 10 proveedores del Sur (y al elegir Norte, los 10 del Norte).
     - `getPuntosParaProveedor` prioriza en primer lugar las sucursales de la sub-ruta elegida y muestra a continuación las de la sub-ruta hermana sin duplicados.
  4. *Atribución Inteligente en Cierre Diario (`registroPerteneceARutaCierre` en las 4 Capas):*
     - Cuando una ruta tiene sub-rutas hermanas (Ruta 2 Norte/Sur) y el registro histórico viene con la etiqueta ambigua `"RUTA 2: Cali (Norte / Sur / Oriente juanchito)"`, el motor de Cierre Diario atribuye el registro a `NORTE` o `SUR` según el catálogo `MATRIZ_PUNTOS_RUTAS` del par `(proveedor, sucursal)` y, para puntos compartidos (*Ciudad del Campo*), desempata por la frecuencia del día auditado (`Martes` ➔ Sur, `Viernes` ➔ Norte).
     - Incluye homologación canónica tolerante para digitaciones manuales (`Megan Capital` ➔ `Migan Capital`, `Lantaña De Morichal` ➔ `La Montaña Morichal`, `Ciudadela Delrio` ➔ `Ciudadela del Río`).
  5. *Resultado Verificado en Vivo (20/10/2026):* Ruta 2 Sur audita **24 transacciones (1.675,20 Kg)** de Emer Rodríguez con **12 / 17 puntos cubiertos (71%)**, mientras Ruta 2 Norte aisla las **2 transacciones (228,40 Kg)** de Carolina Becerra en `La Montaña Av. 6A`, sin alterar ni una sola celda de Google Sheets.

---

### 20. Saneamiento de Emojis y Sufijos en Selectores Móviles PWA / TWA (`v1.7.8`)
- **Problema Diagnosticado:**
  - En la versión `v1.7.6`, para guiar visualmente al conductor sobre sus paradas asignadas, se introdujo el agrupamiento `<optgroup label="📍 EN TU RUTA PROGRAMADA">` donde cada `<option>` mostraba una estrella decorativa (`opt.textContent = "⭐ " + prov`).
  - Al persistir las recolecciones (`btnGuardarRecoleccion`) o las novedades (`formNovedad`), el código obtenía el nombre del proveedor leyendo accidentalmente `proveedorSel.options[proveedorSel.selectedIndex].text` en vez de su valor unívoco `proveedorSel.value`.
  - Esta lectura causó que el carácter emoji `"⭐ "` se guardara directamente en Firebase Firestore y Google Sheets dentro del campo `proveedor` (ej. `"⭐ Bodega Santa Elena"`), apareciendo con estrella en la tabla de *Recolecciones en Vivo* y en los comprobantes.
  - De forma idéntica, la selección de ruta (`rutaSel`) leía el `.text` en lugar de `.value`, arriesgando capturar el sufijo informativo de frecuencia `" · 📅 [Día]"` introducido en `v1.7.7`.
- **Solución Quirúrgica y Preservación Total de la Experiencia Móvil TWA:**
  1. *Preservación Visual para Conductores:* La experiencia táctil en campo no sufre ninguna merma: el selector de proveedores sigue destacando con `⭐` las paradas de la ruta programada en el `<optgroup>`.
  2. *Lectura Estricta por `.value` al Guardar:*
     - En `recoleccion-form` (`btnGuardarRecoleccion`): Se corrigió a `rutaName = rutaSel.value;` y `proveedorName = homologarNombreProveedor(proveedorSel.value);`.
     - En `initNovedadesModal` (previsualización y guardado de novedades en dos etapas): Se corrigió a `rutaName = rutaSel.value;` y `provName = homologarNombreProveedor(provSel.value);`.
  3. *Sanitización Preventiva en `homologarNombreProveedor`*:
     - Se añadió la regla regular `let s = String(texto || '').replace(/^[⭐\u2B50\u2605\u2728*•\s]+/, '').trim();` antes de cualquier búsqueda canónica o formateo Nombre Propio.
     - Neutraliza de raíz cualquier emoji de estrella (`⭐`, `✨`, `★`), asterisco o viñeta que pueda filtrarse accidentalmente desde cualquier fuente.
  4. *Limpieza Retroactiva en Tabla en Vivo (`renderRecordsInTable`)*:
     - Se envolvió la visualización de la celda de proveedor con `data.proveedor ? homologarNombreProveedor(data.proveedor) : 'N/A'`.
     - Con esto, los registros históricos que ya se habían guardado con estrella en la base de datos se limpian dinámicamente al renderizarse, mostrándose impecablemente como `"Bodega Santa Elena"`.
  5. *Bumping Global a `v1.7.8`*:
     - `sw.js`: `CACHE_NAME = 'proteinagro-v1.7.8'` y console log correspondiente.
     - `index.html`: Parámetros `?v=1.7.8` en CSS/JS y badges interactivos `🔄 v1.7.8`.
     - `app.js`: Referencias internas de registro de Service Worker y funciones de recarga forzada (`forzarActualizacionApp`) migradas de `1.7.5` a `1.7.8`.

---

### 21. Aislamiento y Desacoplamiento Definitivo entre TWA y Conciliador (`v1.7.9`)
- **Problema Diagnosticado:**
  - Existía interferencia cruzada entre el proyecto móvil de conductores (`PROTEINAGRO` / TWA) y el proyecto administrativo `CONCILIADOR`:
    1. *Colisión de Service Worker y Origen:* Al desplegarse bajo el mismo host en Vercel o puerto local, `sw.js` (con `Scope: '/'`) interceptaba `CONCILIADOR.html`, lo metía en la caché de la TWA y enviaba mensajes `RELOAD_PAGE` a todas las pestañas abiertas cuando la TWA cambiaba de versión.
    2. *Archivos Espejo Desfasados en Disco:* Existía una copia antigua de `CONCILIADOR.html` (393 KB) y `recolecciones_cache.js` en la raíz de `PROTEINAGRO`, compitiendo con la versión evolucionada de `G:\Mi unidad\Antigravity\CONCILIADOR\CONCILIADOR.html` (464 KB).
    3. *Acoplamiento en Vercel:* Cada commit de la TWA publicaba en producción la copia desactualizada de `CONCILIADOR.html`.
- **Solución Quirúrgica de Aislamiento en 4 Capas:**
  1. *Blindaje en `sw.js` (`proteinagro-v1.7.9`):*
     - Exclusión explícita en el listener `fetch` para ignorar cualquier ruta o parámetro con `conciliador`, `recolecciones_cache` o `view=conciliador`.
     - Filtro en el listener `activate` (`!client.url.toLowerCase().includes('conciliador')`) para jamás enviar recargas forzadas (`RELOAD_PAGE`) a pestañas del Conciliador.
  2. *Desvinculación de Archivos Espejo:* Retiro de las copias huérfanas de `CONCILIADOR.html` y `recolecciones_cache.js` de la raíz de `PROTEINAGRO` (resguardadas en backup), dejando a `G:\Mi unidad\Antigravity\CONCILIADOR` como única fuente de verdad del Conciliador.
  3. *Reglas en `.vercelignore`:* Exclusión de `CONCILIADOR*`, `recolecciones_cache.js`, `*.zip`, `*.py`, `*.gs` y carpetas de backup del despliegue de la TWA en Vercel.
  4. *Separación de Puertos Locales (`.vscode/settings.json`):* Puerto `5500` asignado a `PROTEINAGRO` (TWA) y Puerto `5501` asignado a `CONCILIADOR`, aislando al 100% el `localStorage`, `IndexedDB` y Service Workers en el navegador.

---

### 22. Desacoplamiento Visual y Sanitización de Emojis en Persistencia (`v1.8.0`)
- **Problema Diagnosticado:**
  - En la aplicación móvil TWA, las paradas asignadas de la ruta programada se visualizaban con una estrella amarilla (`⭐`) en el menú desplegable.
  - Al registrar o sincronizar la transacción, si el navegador o WebView tomaba el texto del elemento seleccionado, la estrella (`⭐`) viajaba en el payload y se persistía en Google Sheets y Firebase, alterando la base contable.
- **Solución Arquitectónica en Tres Capas (Triple Escudo):**
  1. *Capa de Presentación Desacoplada (Frontend TWA - `app.js`):*
     - En `populardropdownProveedoresPorRuta`: el atributo `opt.value` se asigna exclusivamente con el nombre limpio en texto plano (`opt.value = provLimpio`), mientras que la estrella queda aislada como adorno puramente visual en la interfaz (`opt.textContent = '⭐ ' + provLimpio`).
  2. *Capa de Sanitización en Captura y Payload (`app.js`):*
     - Función `removerEmojisDecorativos(str)` que elimina de forma infalible caracteres `⭐`, `⭐`, `️` (selectores de variación), `✨`, viñetas y espacios residuales.
     - Aplicada en los handlers de formulario (`btnGuardarRecoleccion`, `formNovedad`) y como salvaguarda preventiva en `enviarAGoogleSheets(data)`.
  3. *Capa de Blindaje en Servidor (`Code.gs`):*
     - Inyección de `removerEmojisDecorativos` en `guardarRecoleccionSheet` y `homologarProveedor`. Aunque un cliente envíe una estrella decorativa, el servidor de Google Apps Script la purga antes de insertar la fila en la hoja `Recolecciones`.
     - Sincronizado en `PROTEINAGRO/Code.gs` y `CONCILIADOR/Codigo_Integrado_App_Y_Conciliador.gs`.

---

### 23. Captura y Conciliación de Facturas Físicas en Sitio para Caribe (`v1.8.1`)
- **Problema Resuelto:**
  - En clientes multisucursal como **Caribe Supermercados**, el libro auxiliar contable sólo registra la razón social y el número de factura física sin detallar la sucursal, mientras que la plataforma operativa registraba la sucursal y los kilos sin el número de factura, obligando a cruzar cada soporte manualmente.
- **Solución E2E Implementada:**
  1. *Exclusividad y Activación Inteligente (`esProveedorCaribe`):*
     - La tarjeta `#factura-caribe-container` se despliega y exige campos obligatorios **exclusivamente** cuando el proveedor seleccionado es **Caribe Supermercados** (Rutas 3 y 4) o **Caribe** (Ruta 1 Cavasa). Para el resto de proveedores permanece 100% oculta.
  2. *Alerta Informativa de Discrepancia en Tiempo Real:*
     - Calcula el importe esperado (`Peso × Tarifa Referencia Caribe`) y lo compara contra el `valor_factura` digitado. Si existe una diferencia mayor a `$500 COP`, muestra un banner informativo con el desglose exacto sin bloquear el envío.
  3. *Soporte Fotográfico Comprimido y Offline-First:*
     - Compresión automática en Canvas (`max-width: 1200px`, JPEG `0.72` < 180 KB), subida a Firebase Storage (`facturas/${recordId}.jpg`) y respaldo Base64 offline en `localStorage` para sincronización diferida.
  4. *Esquema Seguro en Google Sheets (`Columnas O, P y Q`):*
     - Escritura separada en dos bloques: `A:L` (Cols 1-12) y `O:Q` (Cols 15-17: `Numero_Factura`, `Valor_Factura`, `Foto_Factura`), dejando **100% intactas las columnas `M` (`ID_Clave`) y `N` (`Alerta`)**.
  5. *Integración en Reportes y Conciliador:*
     - Visualización de badge de factura y enlace a foto en tabla administrativa, comprobante digital, WhatsApp, exportación CSV y matriz Excel de `CONCILIADOR.html` para cruce directo (`BUSCARV` / `XLOOKUP`) contra el libro auxiliar contable.

---

---

### 24. Motor Universal de Conciliación por Lotes sin Fecha Calendario (`v1.8.2`)
- **Problema Resuelto:**
  - Boletines de liquidación por períodos/lotes (ej. `CARNES Y DERIVADOS DE OCCIDENTE S.A.` / `PROTEINAGRO_SEPT_2026.xlsx`) traen el nombre del proveedor desplazado en columnas superiores (`C2`), etiquetas de período en lugar de fechas (`AGOSTO PDTE`, `SEPTIEMBRE` y celdas en blanco), columnas simultáneas de unidades (`PIELES`) y peso (`PIELES KILOS`), y bloques de pie de factura (`CANTIDAD / PRECIO / FACTURAR / TOTAL FACTURA`).
- **Solución Implementada en `CONCILIADOR.html` (`v1.8.2 · Lotes`):**
  1. *Autodetección Expandida (12 filas × 20 columnas):* Identifica `CARNES Y DERIVADOS` -> `Sevillana Carnes y Derivados de Occ.` (Cavasa) y excluye `"PROTEINAGRO"` como falso nombre de proveedor en el fallback por nombre de archivo.
  2. *Desambiguación Unidades vs. Kilos y Pie de Factura:* Descarta automáticamente la columna `PIELES` (unidades) cuando coexiste con `PIELES KILOS`, ignora `RECIBO`, y bloquea filas de resumen (`CANTIDAD`, `FACTURAR`, `TOTAL FACTURA`) para evitar lecturas espurias.
  3. *Motor Forense `PASADA 0` en 3 Fases (`0A`, `0B`, `0C`):*
     - **0A (Individual Exacto):** Cruza ítems de lotes sin día contra recolecciones individuales del período por peso y compatibilidad de materia (`SEBO` / `GORDANA` / `SEBO EN RAMA`, `HUESO RES` / `HUESO BLANCO`).
     - **0B (Suma de 2 Viajes Consecutivos):** Detecta lotes acumulados en dos recolecciones consecutivas (ej. `01/09 + 02/09`).
     - **0C (Desviación de Báscula / Canastillas y Mes Previo):** Empareja desviaciones cercanas (`≤ 10%` ó `≤ 15 Kg`) incluyendo lotes pendientes del mes anterior (`AGOSTO PDTE`) sin contaminar los sobrantes del mes auditado.

### 25. Procesamiento y Conciliación Nativa de Facturas Electrónicas PDF (`v1.8.3`)
- **Problema Resuelto:**
  - Los proveedores emiten Facturas Electrónicas de Venta (DIAN / Comerssia / PDF) que agrupan los despachos de la quincena o mes (ej. `AGROPECUARIA LA SEVILLANA SAS`, Factura `FE1P 64048`).
  - La fecha en el encabezado es la fecha de emisión del documento (`15/09/2026`), mientras que las líneas de producto corresponden a entregas físicas previas (ej. 80.00 Kg el 10/09 y 92.10 Kg el 03/09).
  - La materia prima viene rotulada con códigos y sufijos técnicos (ej. `3000220000030 DESPERDICIO DE POLLO***PRESKILO - KILO`).
- **Solución Implementada en `CONCILIADOR.html` (`v1.8.3 · PDF & Facturación`):**
  1. *Lector Nativo PDF.js:* Dropzone acepta archivos `.pdf` además de `.xlsx` y `.xls`, procesando tablas y texto vectorizado en cliente sin depender de servidores externos.
  2. *Extracción Automatizada de Metadatos:*
     - Emisor / Proveedor: `AGROPECUARIA LA SEVILLANA SAS` -> `Sevillana`.
     - Punto / Sucursal: `PALMIRA CAÑAVERAL` (asociado automáticamente a la sede de Palmira y conductor Ricardo Gil).
     - Factura: `FE1P 64048`.
     - Fecha de Emisión: `15/09/2026`.
     - Materia Prima: `DESPERDICIO` (homologado desde `DESPERDICIO DE POLLO***PRESKILO - KILO` con limpieza numérica de códigos).
  3. *Conciliación Forense por Línea de Factura:*
     - Los ítems de la factura electrónica se concilian de forma atómica en el período contra las recolecciones físicas en plataforma por peso y materia.
     - Ítem 1 (80.00 Kg, $9.600) ↔ Recolección del 10/09/2026 en Sevillana Palmira / Villagorgona (80 Kg).
     - Ítem 2 (92.10 Kg, $11.052) ↔ Recolección del 03/09/2026 en Ricardo Gil (92.1 Kg).
     - Resultado: **172.10 Kg (100% Conciliado Exacto, $20.652 COP, 0 Desviaciones, 0 Pendientes)**.

---

## 📦 3. Procedimientos de Respaldo y Despliegue

1. **Despliegue Web:** Cualquier cambio en `app.js`, `index.html`, `styles.css` o `sw.js` se sube con `git add .`, `git commit` y `git push origin main`. Vercel compila y publica en menos de 10 segundos.
2. **Despliegue Apps Script:** Si se modifica `Code.gs`, el usuario debe pegarlo en el editor de Google Sheets (*Extensiones > Apps Script*) e implementar una nueva versión del Webhook (*Implementar > Administrar implementaciones > Nueva versión*).
3. **Copias de Seguridad:** Mantener siempre actualizados los directorios `PROTEINAGRO_Backup_vX.X.X` y archivos comprimidos `.zip` con todos los activos del proyecto.

---

## 🤖 4. Directiva de Automatización Proactiva (Cierre Autónomo)

> **Regla de Oro:** El usuario **NUNCA debe tener que pedir** *"guarda, backup, memoria ya sabes qué hacer"*.

Al completar y verificar con éxito cualquier corrección, cambio de código o nueva funcionalidad, el agente **DEBE ejecutar automáticamente y en ese mismo turno** el protocolo integral:
1. **Actualización de Memoria:** Registrar los cambios técnicos en [`GEMINI.md`](./GEMINI.md) y [`PROYECTO.md`](./PROYECTO.md).
2. **Generación de Respaldos:** Crear la carpeta `PROTEINAGRO_Backup_vX.X.X` y el archivo comprimido `PROTEINAGRO_BACKUP_vX.X.X_...zip` en la raíz.
3. **Despliegue Inmediato:** Realizar `git add`, `git commit` descriptivo y `git push origin main` para publicación en Vercel.
4. **Entrega Final:** Presentar al usuario la solución ya probada junto con la confirmación de que todo quedó respaldado, versionado y desplegado.
