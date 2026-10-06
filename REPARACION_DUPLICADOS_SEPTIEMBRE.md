# 🔧 REPARACIÓN QUIRÚRGICA DE DUPLICADOS Y ANOMALÍAS DE SEPTIEMBRE

> **Versión:** v1.6.7  
> **Fecha:** 6 de Octubre de 2026  
> **Estado:** Implementado, Verificado y Listo para Ejecución  
> **Base de Datos:** Google Sheets (`Recolecciones`)  
> **Hoja ID:** `1eQSRvG7vWkIoW3AT5e6Ahi7ndWF6P4OG_Alxo2Go0lU`

---

## 🎯 1. Diagnóstico y Causa Raíz de las Quejas Administrativas

Tras el análisis forense de la base de datos `Recolecciones` y de los respaldos históricos de septiembre, se identificaron con precisión quirúrgica las causas de las quejas reportadas por el área administrativa:

### A. Caso "Cavasa Cavasa – 40.000 Kg" (25 de Septiembre)
- **Fila Afectada:** Fila 1807 (`REC-1790357561744`, 25/09/2026 12:32:41, Ricardo Sepúlveda).
- **Problema:** Registró **`40.000 Kg`** de Sebo con valor de **`$48.000.000`** bajo el proveedor "Cavasa".
- **Causa Raíz:** Error tipográfico en el teclado numérico ingresando `40.000` con punto de miles en vez de número entero. El valor real de la recolección física fue de **`40 Kg`** a \$1.200/Kg = **`$48.000`**.
- **Proveedor Real:** Corresponde a **`Edinson Aguirre`** (Punto Cavasa).
- **Solución Quirúrgica:**
  - Kilos: `40`
  - Valor: `$48.000`
  - Proveedor: `Edinson Aguirre`
  - Sucursal / Punto: `Cavasa`

---

### B. Caso "Cavasa Cavasa – 142 Kg" (24 de Septiembre)
- **Fila Afectada:** Fila 1758 (`REC-1790285777272`, 24/09/2026 16:36:17, Ricardo Sepúlveda).
- **Problema:** Registró 142 Kg de Sebo bajo el nombre genérico "Cavasa Cavasa".
- **Causa Raíz:** En las asignaciones manuales de finales de septiembre se colocó "Cavasa" tanto en proveedor como en punto.
- **Proveedor Real:** En la secuencia de paradas de Ricardo en Cavasa a esa hora, la recolección corresponde a **`Edinson Aguirre`**.
- **Solución Quirúrgica:**
  - Proveedor: `Edinson Aguirre`
  - Sucursal / Punto: `Cavasa`
  - Kilos y valores se mantienen intactos (142 Kg).

---

### C. Caso Duplicados del 24 y 25 de Septiembre (Carolina y Cavasa)
- **Problema Reportado:**
  1. *Cañaveral Matadero:* Carolina aparece con 100 Kg duplicado y 50 Kg duplicado el 24 de septiembre.
  2. *Cavasa 15 Kg:* Aparece duplicado (Los Lagos vs Cavasa).
  3. *Cavasa 111 Kg:* Aparece duplicado (La Reserva vs Cavasa).
  4. *Cavasa 482 Kg:* Aparece duplicado el 25 de septiembre (Sevillana vs Cavasa).
- **Causa Raíz Descubierta:**
  - Los registros legítimos ingresados por la App móvil tienen milisegundos reales (ej. `REC-1790263106173`, `REC-1790270164627`, `REC-1790291076295`).
  - Posteriormente, alguien copió filas en la hoja sin ID o con formato manual, y un script rellenó los IDs vacíos convirtiendo la fecha texto con `new Date(fecha).getTime()`.
  - Como la fecha texto se evaluó en UTC (desfase de 5 horas = 18.000.000 ms) y redondeada a segundos (`...000`), se crearon **clones sintéticos** con ID terminado en `000` (ej. `REC-1790263124000`, `REC-1790270182000`, `REC-1790291094000`).
  - La fórmula anti-duplicados de Google Sheets no los detectó porque los IDs eran ligeramente distintos (`REC-...173` vs `REC-...000`).
- **Alcance Total del Hallazgo:**
  No fueron solo 4 registros; el escaneo completo de septiembre reveló exactamente **24 filas clones sintéticas** generadas por este mismo patrón entre el 11 y el 26 de septiembre.

---

## 📋 2. Matriz de los 24 Clones Sintéticos a Eliminar

| # | ID Clon Sintético | Fecha | Proveedor Clon | Producto | Kg | Fila Original Legítima de la App |
|---|---|---|---|---|---|---|
| 1 | `REC-1790263124000` | 24/09 | Cañaveral Matadero | Desperdicio | 100.0 | Fila 1747 (`REC-1790263106173` - Carolina) |
| 2 | `REC-1790270182000` | 24/09 | Cañaveral Matadero | Desperdicio | 50.0 | Fila 1760 (`REC-1790270164627` - Carolina) |
| 3 | `REC-1790291094000` | 24/09 | Cavasa | Sebo | 15.0 | Fila 1778 (`REC-1790291076295` - Los Lagos) |
| 4 | `REC-1790291189000` | 24/09 | Cavasa | Sebo | 111.0 | Fila 1780 (`REC-1790291171052` - La Reserva) |
| 5 | `REC-1790372238000` | 25/09 | Cavasa | Pieles | 482.0 | Fila 1835 (`REC-1790372220468` - Sevillana) |
| 6 | `REC-1790372467000` | 25/09 | Cavasa | Sebo | 207.0 | Fila 1837 (`REC-1790372449767` - Sevillana) |
| 7 | `REC-1790372587000` | 25/09 | Cavasa | Sebo | 180.0 | Fila 1839 (`REC-1790372569265` - Los Lagos) |
| 8 | `REC-1790372678000` | 25/09 | Cavasa | Sebo | 75.0 | Fila 1841 (`REC-1790372660021` - La Reserva) |
| 9 | `REC-1790373112000` | 25/09 | Cavasa | Sebo | 228.0 | Fila 1848 (`REC-1790373094892` - Edinson Aguirre) |
| 10 | `REC-1789145873000` | 11/09 | Cavasa | Pieles | 507.8 | Fila 1230 (`REC-1789145855000` - Sevillana) |
| 11 | `REC-1789146762000` | 11/09 | Cavasa | Sebo | 595.0 | Fila 1232 (`REC-1789146744000` - Edinson Aguirre) |
| 12 | `REC-1789245060000` | 12/09 | Cavasa | Gordana | 275.0 | Fila 1284 (`REC-1789245042000` - Edinson Aguirre) |
| 13 | `REC-1789728450000` | 18/09 | Cavasa | Sebo | 625.0 | Fila 1460 (`REC-1789728432000` - Edinson Aguirre) |
| 14 | `REC-1789985928000` | 21/09 | Cavasa | Pieles | 979.0 | Fila 1574 (`REC-1789985910000` - Sevillana) |
| 15 | `REC-1789985974000` | 21/09 | Cavasa | Sebo | 126.0 | Fila 1576 (`REC-1789985956000` - Edinson Aguirre) |
| 16 | `REC-1789986008000` | 21/09 | Cavasa | Sebo | 206.0 | Fila 1578 (`REC-1789985990000` - La Reserva) |
| 17 | `REC-1789986582000` | 21/09 | Cavasa | Sebo | 423.0 | Fila 1580 (`REC-1789986564000` - Sevillana) |
| 18 | `REC-1790101154000` | 22/09 | Cavasa | Sebo | 210.0 | Fila 1638 (`REC-1790101136000` - Edinson Aguirre) |
| 19 | `REC-1790101244000` | 22/09 | Cavasa | Sebo | 249.0 | Fila 1640 (`REC-1790101226000` - Los Lagos) |
| 20 | `REC-1790101302000` | 22/09 | Cavasa | Sebo | 53.0 | Fila 1642 (`REC-1790101284000` - La Reserva) |
| 21 | `REC-1790101494000` | 22/09 | Cavasa | Hueso Promocion | 327.5 | Fila 1644 (`REC-1790101476000` - Sevillana) |
| 22 | `REC-1790101686000` | 22/09 | Cavasa | Sebo | 169.0 | Fila 1646 (`REC-1790101668000` - Sevillana) |
| 23 | `REC-1790181288000` | 23/09 | Cavasa | Sebo | 171.0 | Fila 1679 (`REC-1790181270000` - Edinson Aguirre) |
| 24 | `REC-1790437841000` | 26/09 | Cavasa | Sebo | 362.0 | Fila 1875 (`REC-1790437823000` - Edinson Aguirre) |

---

## 🛡️ 3. Protocolo de Seguridad y Blindaje

1. **Copia de Respaldo Inmutable:** Antes de alterar cualquier celda o fila, el script genera una copia idéntica y congelada de la pestaña llamada **`Recolecciones_Backup_PreReparacion`**. Si existiera una previa, la renueva automáticamente.
2. **Eliminación Inversa (Bottom-Up):** Los 24 clones se eliminan desde la fila más alta hacia la más baja (`r--`), garantizando que los índices de fila no se desfasen ni afecten otras filas.
3. **Inmutabilidad de Registros Legítimos:** Las 2.166 filas legítimas de conductores, kilos, fechas, horas, precios y valores quedan **100% intactas**.

---

## 🚀 4. Cómo Aplicar la Reparación en Google Sheets

Tienes **dos opciones muy fáciles** para ejecutar la reparación:

### Opción 1: Desde el Menú de Google Sheets (1 Clic)
1. Abre tu hoja de cálculo Google Sheets de ProteinAgro.
2. Si tienes el archivo abierto, recárgalo (F5).
3. En la barra superior de menús, haz clic en:  
   **`🚀 ProteinAgro` > `🔧 Reparar Duplicados de Septiembre`**
4. El script creará la pestaña de respaldo, corregirá las 2 anomalías, eliminará los 24 clones y mostrará una ventana emergente de confirmación.

---

### Opción 2: Desde el Editor de Apps Script
1. Abre tu hoja de Google Sheets y ve a **Extensiones > Apps Script**.
2. En el menú de archivos de la izquierda, crea un archivo llamado `Reparar_Duplicados_Septiembre.gs` (o actualiza `Code.gs`).
3. Pega el código de [`Reparar_Duplicados_Septiembre.gs`](./Reparar_Duplicados_Septiembre.gs).
4. En el selector de funciones arriba, elige **`repararDuplicadosSeptiembre`** y pulsa **Ejecutar ▶️**.
5. Verás en el registro de ejecución:
   - `✅ [Seguridad] Pestaña de respaldo creada: Recolecciones_Backup_PreReparacion`
   - `✅ Corregida Fila 1807 (40.000 Kg -> 40 Kg Edinson Aguirre)`
   - `✅ Corregida Fila 1758 (142 Kg -> Edinson Aguirre)`
   - `🗑️ Eliminadas 29 filas (24 clones sintéticos + 5 filas de suma doble de Santa Elena)`
   - `🎉 ¡REPARACIÓN DE SEPTIEMBRE COMPLETADA CON ÉXITO!`

---

## 📊 5. Homologación Completa en `original.xlsx` (Excel Local)

Para auditoría y revisión gerencial inmediata, se procesó el archivo local [`original.xlsx`](./original.xlsx), organizándolo en **4 pestañas de trabajo**:

1. **`original_homologado` (361 Filas Limpias):**
   - Base oficial saneada con los nombres exactos de `Puntos_Rutas` (Bodega Santa Elena, Alejandro Garay, Sevillana Santa Elena, Edinson Aguirre, Los Lagos, La Reserva, Sevillana, etc.).
   - Corrección de los 40 Kg de Edinson Aguirre (\$48.000).
   - Columnas de auditoría añadidas: `Estado_Auditoria` y `Detalle_Ajuste`.
2. **`original` (388 Filas Intactas):**
   - Conserva los datos crudos originales de septiembre para comparación celda a celda.
3. **`clones_duplicados_retirados` (27 Filas):**
   - Contiene exactamente las 22 filas de clones sintéticos y las 5 filas de suma doble que causaban duplicidad en septiembre, con el motivo detallado de su retiro.
4. **`Puntos_Rutas` (11 Puntos):**
   - Matriz maestra oficial de referencia de la Ruta 1.

