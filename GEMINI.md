# MEMORIA DEL PROYECTO: PROTEINAGRO (SISTEMA MATRIZ)

> **Documento de Memoria y Reglas de Trabajo Permanente**  
> **Última Actualización:** Octubre 2026 (Versión 1.6.7)  
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
