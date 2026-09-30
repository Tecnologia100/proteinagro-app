# 📌 ESPECIFICACIÓN TÉCNICA: MÓDULO DE TARIFAS PROGRAMADAS Y RE-LIQUIDACIÓN RETROACTIVA
> **Estado:** ⏸️ En Stand-by (Listo para ejecución bajo demanda)  
> **Fecha de Creación:** 30 de Septiembre de 2026  
> **Comando de Activación:** *"Activar el plan de tarifas programadas"* o *"Hacer lo de las tarifas en stand-by"*  
> **Proyecto:** Sistema Digital de Recolección de Materia Prima - ProteinAgro  

---

## 🎯 1. Problema de Negocio que Resuelve
En la operación comercial de ProteinAgro, los precios de compra de materias primas a los proveedores se renegocian con frecuencia (por ejemplo: *"a partir del 12 de octubre el Hueso Blanco sube de $1.200 a $1.400"*).
Actualmente:
1. Si el cambio se hace hoy, se alteran o distorsionan las liquidaciones del mes que está cerrando.
2. Si se espera al día acordado (12 de octubre), el factor humano hace que gerencia o administración lo olviden por la carga de trabajo diaria, registrándose recolecciones con el precio desactualizado.
3. Si intentan corregir días después sobreescribiendo la tarifa en la hoja principal, un liquidador masivo podría alterar erróneamente recolecciones de fechas anteriores (ej. del 1 al 11 de octubre).

---

## 🏗️ 2. Arquitectura de la Solución

### A. Capa de Datos en Google Sheets (Pestaña `Tarifas`)
Se incorporan 2 columnas oficiales a la hoja `Tarifas`:
1. **`Vigente_Desde`** (Fecha en formato `DD/MM/YYYY`): Define desde qué fecha exacta aplica esa tarifa.
   - Para las tarifas históricas actuales: se establece `01/01/2026` por defecto.
   - Para tarifas futuras: se coloca la fecha pactada (ej. `12/10/2026`).
2. **`Estado_Tarifa`**: `Vigente`, `Programada` o `Histórica`.

#### Estructura de Columnas Resultante:
| Columna | Nombre | Descripción |
|---|---|---|
| A | `Ruta` | Nombre oficial de la ruta |
| B | `Proveedor` | Razón social del proveedor |
| C | `Punto_Sucursal` | Sede específica o en blanco para general |
| D | `Materia_Producto` | Nombre de la materia prima |
| E | `Precio_Vigente` | Valor monetario pactado ($) |
| F | **`Vigente_Desde`** | **Fecha a partir de la cual entra en vigor** |
| G | **`Estado_Tarifa`** | `Vigente` / `Programada` / `Inactiva` |
| H | `Ultima_Actualizacion`| Timestamp de modificación |

---

### B. Motor Inteligente de Precios por Fecha en `Code.gs`
Modificación de la función `buscarPrecioTarifasSheet`:
```javascript
// Algoritmo de selección:
// 1. Filtrar tarifas por Proveedor + Punto + Producto.
// 2. Filtrar únicamente aquellas donde Fecha_Recoleccion >= Vigente_Desde.
// 3. Ordenar por Vigente_Desde descendente (la más reciente que no supere la fecha del servicio).
// 4. Retornar ese Precio_Vigente.
```
* **Resultado:** Si la recolección fue el **10 de octubre**, toma la de **$1.200**. Si la recolección fue el **13 de octubre**, toma automáticamente la de **$1.400**. Cero intervención manual.

---

### C. Módulo de Rescate: Re-liquidador Retroactivo por Rango de Fechas
Función en `Code.gs` invocable desde el Panel de Administración o vía Webhook:
`reliquidarPorRangoFechas(proveedor, producto, fechaInicio, fechaFin, nuevoPrecio)`
* **Comportamiento:**
  1. Abre la hoja `Recolecciones`.
  2. Identifica filas donde `Proveedor == proveedor`, `Materia == producto`, y `fechaInicio <= Fecha <= fechaFin`.
  3. Actualiza el campo `Precio` con `nuevoPrecio`.
  4. Recalcula el campo `Valor = Kg * nuevoPrecio`.
  5. Respeta al 100% todos los registros anteriores a `fechaInicio` y posteriores a `fechaFin`.
  6. Devuelve un resumen: `"Se re-liquidaron con éxito X recolecciones entre el DD/MM y DD/MM"`.

---

### D. Interfaz Visual en el Panel Administrativo (`index.html` + `app.js`)
1. **Sección "Tarifas Programadas":**
   - Selector: Proveedor ➔ Producto ➔ Nuevo Precio ➔ Fecha de inicio de vigencia (Calendario nativo).
   - Botón: `💾 Programar Tarifa Futura`.
2. **Botón de Emergencia "Re-liquidar Periodo":**
   - Modal con advertencia de seguridad para aplicar retroactivos cuando olvidaron cargar la tarifa a tiempo.

---

## 📋 3. Checklist de Implementación (Cuando se active)
- [ ] **Paso 1:** Añadir columna `Vigente_Desde` a la hoja `Tarifas` en `Code.gs` (`inicializarPestanaTarifas`).
- [ ] **Paso 2:** Actualizar `buscarPrecioTarifasSheet` en `Code.gs` para aceptar el parámetro `fechaRecoleccion`.
- [ ] **Paso 3:** Implementar `reliquidarPorRangoFechasSheet` en `Code.gs` con handler en `doGet` / `doPost`.
- [ ] **Paso 4:** Añadir formulario visual en el panel administrativo de `index.html` (`#admin-tarifas-programadas`).
- [ ] **Paso 5:** Realizar prueba controlada en vivo con 1 proveedor y verificar que los precios pasados se mantengan intactos.
- [ ] **Paso 6:** Bump de versión y despliegue a producción.

---

## 🚀 Cómo Reactivar este Trabajo
Cuando el usuario indique:
> *"Quiero activar lo de las tarifas que dejamos en stand-by"* o *"Vamos a hacer el plan de tarifas programadas"*,
el agente debe consultar este archivo (`TARIFAS_PROGRAMADAS_PLAN.md`) y proceder directamente a ejecutar los pasos del Checklist sin necesidad de repreguntar los requerimientos.
