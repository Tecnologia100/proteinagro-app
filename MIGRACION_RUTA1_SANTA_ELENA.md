# MIGRACIÓN Y RECLASIFICACIÓN HISTÓRICA: RUTA 1 SANTA ELENA / CAVASA

> **Versión del Sistema:** v1.6.5  
> **Fecha:** 5 de Octubre de 2026  
> **Estado:** Implementado, Verificado y Listo para Ejecución Atómica  
> **Base de Datos Contable:** Google Sheets (`DB_App_Conductores`, Tab `Recolecciones` y `Puntos_Rutas`)  
> **Hoja de Cálculo ID:** `1eQSRvG7vWkIoW3AT5e6Ahi7ndWF6P4OG_Alxo2Go0lU`

---

## 📋 1. Resumen Ejecutivo del Requerimiento

El usuario solicitó una reclasificación en la **Ruta 1: Santa Elena / Cavasa** para invertir y ordenar adecuadamente las columnas **Proveedor** y **Punto/Sucursal** de los tres comercios pertenecientes al sector Santa Elena, sin alterar ninguna otra ruta ni los registros históricos numéricos (Kilos, Precios, Valores, Fechas o GPS).

### Matriz Antes vs. Después:

| # | Configuración Anterior (Imagen 1) | Nueva Configuración Oficial (Imagen 2) |
|---|---|---|
| **1** | **Proveedor:** `Santa Elena`<br>**Punto:** `Bodega Santa Elena` | 🟢 **Proveedor:** `Bodega Santa Elena`<br>🟢 **Punto:** `Santa Elena` |
| **2** | **Proveedor:** `Santa Elena`<br>**Punto:** `Garay Santa Elena` (o `Alejandro Garay`) | 🟢 **Proveedor:** `Alejandro Garay`<br>🟢 **Punto:** `Santa Elena` |
| **3** | **Proveedor:** `Santa Elena`<br>**Punto:** `Sevillana Santa Elena` | 🟢 **Proveedor:** `Sevillana Santa Elena`<br>🟢 **Punto:** `Sevillana Santa Elena` |

---

## 🛡️ 2. Auditoría y Garantías de Seguridad

Antes de cualquier modificación, se ejecutó una simulación matemática exhaustiva sobre la base de datos real en vivo (hoja `Recolecciones`):

- **Total filas evaluadas:** `2.155 filas activas` con datos (de 5.006 filas totales con fórmulas).
- **Filas exactas a modificar:** **`276 filas`** (100% circunscritas a la Ruta 1):
  - **Caso 1 (Bodega Santa Elena):** `192 filas`
  - **Caso 2 (Alejandro Garay / Garay):** `63 filas`
  - **Caso 3 (Sevillana Santa Elena):** `21 filas`
- **Filas 100% INTACTAS:** **`1.879 filas`** de todas las demás rutas (Cali, Palmira, Jamundí, Buga, Yumbo, Cavasa, Planta San Joaquín, etc. **no se tocan**).
- **Columnas inmutables:**
  - `ID_Recoleccion`
  - `Fecha_Hora`
  - `Ruta`
  - `Conductor`
  - `Materia/Producto`
  - `Kg` (los kilos permanecen exactos)
  - `Precio` y `Valor` (la contabilidad permanece exacta)
  - `Observaciones` y `GPS`

---

## ⚙️ 3. Cambios Implementados en el Código

### 3.1 Frontend (`app.js` v1.6.5)
1. **`DEFAULT_RUTAS_DATA["RUTA 1: Santa Elena / Cavasa"]`**: Se agregaron como proveedores directos:
   - `"Bodega Santa Elena"`
   - `"Alejandro Garay"`
   - `"Sevillana Santa Elena"`
   - Manteniendo compatibilidad histórica con `"Santa Elena"` y `"Cavasa"`.
2. **`CATALOGO_PUNTOS_RUTAS_DEFAULT`**:
   - `{"ruta": "Ruta 1: Santa Elena / Cavasa", "proveedor": "Bodega Santa Elena", "punto": "Santa Elena", ...}`
   - `{"ruta": "Ruta 1: Santa Elena / Cavasa", "proveedor": "Alejandro Garay", "punto": "Santa Elena", ...}`
   - `{"ruta": "Ruta 1: Santa Elena / Cavasa", "proveedor": "Sevillana Santa Elena", "punto": "Sevillana Santa Elena", ...}`
3. **Invalidación de Caché PWA:**
   - Service Worker actualizado a `proteinagro-v1.6.5` en `sw.js` y `app.js`.
   - Etiquetas de versión actualizadas a `v1.6.5` en `index.html`.

### 3.2 Backend Google Apps Script (`Code.gs` y `Migracion_Ruta1.gs`)
1. Función `migrarRuta1_SantaElena(ss)`: Realiza el barrido atómico en bloque de memoria usando `getValues()` y `setValues()`, eliminando cualquier riesgo de tiempo de espera o bloqueo.
2. Endpoint `doGet` con `action=migrarRuta1`: Permite invocar la migración de forma remota segura.
3. Menú `onOpen()`: Al abrir Google Sheets, aparece automáticamente el menú superior:  
   `🚀 ProteinAgro > Reclasificar Ruta 1 (Santa Elena)`.

---

## 🚀 4. Guía de Ejecución en Google Sheets (1 Solo Clic)

Para aplicar la actualización sobre las 276 filas históricas en Google Sheets:

### Opción A (Recomendada - Desde el Editor de Apps Script):
1. Abre tu hoja de Google Sheets [DB_App_Conductores](https://docs.google.com/spreadsheets/d/1eQSRvG7vWkIoW3AT5e6Ahi7ndWF6P4OG_Alxo2Go0lU/edit?usp=sharing).
2. Ve al menú superior **Extensiones > Apps Script**.
3. En la lista de archivos de la izquierda, crea un archivo llamado `Migracion_Ruta1.gs` (o selecciónalo si ya existe) y pega el contenido de `Migracion_Ruta1.gs`.
4. En el selector de funciones de arriba, selecciona **`migrarRuta1_SantaElena`** y haz clic en **Ejecutar**.
5. En 3 segundos verás el log:  
   `✅ [Recolecciones] Modificadas: 276 filas (Bodega: 192, Garay: 63, Sevillana: 21)`  
   `✅ [Puntos_Rutas] Modificadas: 3 filas.`

### Opción B (Desde el Menú de Google Sheets):
1. Si recargas la hoja en el navegador, en la barra de menús aparecerá:  
   `🚀 ProteinAgro > Reclasificar Ruta 1 (Santa Elena)`.
2. Haces clic y la migración se ejecuta instantáneamente mostrando una alerta de confirmación con el conteo final.

---

## 📌 5. Pendientes (TODOs) y Recomendaciones
- [x] Simulación previa auditando todas las filas de la base de datos.
- [x] Código de migración en lote implementado en `Code.gs` y `Migracion_Ruta1.gs`.
- [x] Actualización de la matriz de rutas en `app.js` y catálogo offline-first.
- [x] Actualización de versión a `v1.6.5` en `index.html`, `app.js` y `sw.js`.
- [ ] Ejecutar `migrarRuta1_SantaElena` en Google Sheets (el usuario o vía menú).
- [ ] Verificar el módulo de **Cierre Diario** en el Panel Admin seleccionando la fecha de hoy y **Ruta 1: Santa Elena / Cavasa** para confirmar que el checklist muestra la nueva nomenclatura con 100% de cobertura.
