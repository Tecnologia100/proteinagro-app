# 📊 ACTUALIZACIÓN DE TARIFAS RUTA 1: SANTA ELENA / CAVASA (OPCIÓN 1)

> **Versión:** v1.6.6  
> **Fecha:** 6 de Octubre de 2026  
> **Estado:** Implementado, Verificado y Listo para Aplicación  
> **Base de Datos:** Google Sheets (`DB_App_Conductores`, Tab `Tarifas` y `Puntos_Rutas`)  
> **Hoja ID:** `1eQSRvG7vWkIoW3AT5e6Ahi7ndWF6P4OG_Alxo2Go0lU`

---

## 🎯 1. Resumen Ejecutivo (Opción 1)

Tras la reclasificación estructural de la **Ruta 1 (Santa Elena / Cavasa)** en `Puntos_Rutas`, se implementó la **Opción 1: Tarifación Individual por Proveedor**.

### ¿Qué soluciona esta implementación?
Anteriormente, las tarifas de la Ruta 1 estaban agrupadas bajo los nombres genéricos de zona:
- Proveedor **`Santa Elena`** (10 materias primas)
- Proveedor **`Cavasa`** (6 materias primas)

Al individualizar los comercios en `Puntos_Rutas`, los conductores registran recolecciones a nombre de comercios específicos (ej. *Bodega Santa Elena*, *Alejandro Garay*, *Barbara Gomez*, etc.). La Opción 1 replica formalmente las tarifas base a cada uno de estos 11 comercios, garantizando que:
1. Cada proveedor cuente con sus propias filas oficiales en la pestaña `Tarifas`.
2. La liquidación contable sea transparente y visible en Google Sheets.
3. Si en el futuro un cliente renegocia su tarifa (ej. *Alejandro Garay* negocia hueso a \$320 mientras *Bodega Santa Elena* sigue a \$300), se pueda ajustar individualmente sin afectar al resto.

---

## 📋 2. Matriz Detallada de Proveedores y Tarifas Heredadas

### A. Sector Santa Elena (3 Proveedores Oficiales)
Heredan las **10 tarifas históricas** de Santa Elena:

| # | Proveedor Oficial | Punto / Sucursal | Materias Primas Asignadas | Tarifas Base ($/Kg) |
|---|---|---|---|---|
| **1** | **Bodega Santa Elena** | Santa Elena | 10 productos | ACEITE: \$3.600<br>CALAMBOMBO DE CERDO: *Pendiente*<br>DESPERDICIO: \$150<br>EMPELLA: \$2.000<br>GORDANA: *Pendiente*<br>HUESO BLANCO: \$300<br>HUESO DE CERDO: \$150<br>HUESO SECO: \$700<br>MANTECA: \$3.500<br>SEBO EN RAMA: \$1.300 |
| **2** | **Alejandro Garay** | Santa Elena | 10 productos | *(Mismas tarifas base de Santa Elena)* |
| **3** | **Sevillana Santa Elena** | Sevillana Santa Elena | 10 productos | *(Mismas tarifas base de Santa Elena)* |

*Subtotal:* **30 filas de tarifas**.

---

### B. Sector Cavasa (8 Proveedores Oficiales)
Heredan las **6 tarifas históricas** de Cavasa:

| # | Proveedor Oficial | Punto / Sucursal | Materias Primas Asignadas | Tarifas Base ($/Kg) |
|---|---|---|---|---|
| **4** | **Barbara Gomez** | Cavasa | 6 productos | GORDANA: \$2.000<br>HUESO BLANCO: \$350<br>HUESO DE CERDO: \$250<br>HUESO PROMOCION: \$1.200<br>PIELES: \$100<br>SEBO EN RAMA: \$1.200 |
| **5** | **Los Lagos** | Cavasa | 6 productos | *(Mismas tarifas base de Cavasa)* |
| **6** | **Caribe** | Cavasa | 6 productos | *(Mismas tarifas base de Cavasa)* |
| **7** | **Sevillana** | Cavasa | 6 productos | *(Mismas tarifas base de Cavasa)* |
| **8** | **Migan Capital** | Cavasa | 6 productos | *(Mismas tarifas base de Cavasa)* |
| **9** | **Freddy Hernandez** | Cavasa | 6 productos | *(Mismas tarifas base de Cavasa)* |
| **10** | **Edinson Aguirre** | Cavasa | 6 productos | *(Mismas tarifas base de Cavasa)* |
| **11** | **La Reserva** | Cavasa | 6 productos | *(Mismas tarifas base de Cavasa)* |

*Subtotal:* **48 filas de tarifas**.

---

### C. Respaldo Histórico y Demás Rutas (100% Intactas)
- **16 filas de respaldo:** Se conservan las tarifas de `Santa Elena` (10 filas) y `Cavasa` (6 filas) como salvaguarda histórica ante consultas retroactivas.
- **278 filas de demás rutas:** Cali, Palmira, Jamundí, Buga, Tuluá, Yumbo y Planta San Joaquín **permanecen 100% intactas e inmutables**.
- **Total general resultante en pestaña `Tarifas`:** **`372 filas de datos`** (+ 1 fila de encabezado = 373 filas).

---

## 🛠️ 3. Métodos para Aplicar en Google Sheets

Tienes **dos métodos súper sencillos** para aplicar esta actualización a la pestaña `Tarifas` de Google Sheets:

### Método A: Ejecución en 1 Clic desde Apps Script (Recomendado)
1. Abre tu hoja de cálculo Google Sheets de ProteinAgro.
2. Ve a **Extensiones > Apps Script**.
3. En el menú lateral izquierdo, haz clic en **+ > Secuencia de comandos**, crea un archivo llamado `Migrar_Tarifas_Ruta1.gs`.
4. Pega el código del archivo local [`Migrar_Tarifas_Ruta1.gs`](./Migrar_Tarifas_Ruta1.gs).
5. En la barra superior, selecciona la función **`migrarTarifasRuta1`** y haz clic en **Ejecutar ▶️**.
6. En 2 segundos verás la notificación de confirmación con las 372 filas actualizadas.

*(Nota: Al recargar tu hoja de Google Sheets, también verás el nuevo botón en el menú: **🚀 ProteinAgro > Actualizar Tarifario Ruta 1 (Opción 1)**).*

---

### Método B: Carga Directa desde Archivo Excel / CSV
Si prefieres revisar los datos en Excel antes de aplicarlos:
1. Abre el archivo generado [`Tarifas_GoogleSheets_Actualizado.xlsx`](./Tarifas_GoogleSheets_Actualizado.xlsx) (o el CSV [`Tarifas_GoogleSheets_Actualizado.csv`](./Tarifas_GoogleSheets_Actualizado.csv)).
2. Copia todas las filas de la tabla (desde la fila 2 hasta la 373).
3. Ve a la pestaña **`Tarifas`** en Google Sheets y pégalas a partir de la celda `A2`.

---

## 📂 4. Archivos Locales Actualizados

1. **`Tarifario_Completo_Reparado_2026_Actualizado.xlsx`**: Matriz sede por sede (2.772 filas = 126 puntos $\times$ 22 materias).
2. **`Tarifario_Por_Proveedor_2026_Actualizado.xlsx`**: Matriz empresa por empresa (65 proveedores $\times$ 22 materias).
3. **`tarifario.xlsx`**: Master base del proyecto actualizado con la nueva estructura.
4. **`Tarifas_GoogleSheets_Actualizado.xlsx` / `.csv`**: Formato directo para la base contable.
5. **`Migrar_Tarifas_Ruta1.gs`**: Script de migración atómica en Google Apps Script.
6. **`Code.gs`**: Backend actualizado con fallback de seguridad e integración de endpoint.
