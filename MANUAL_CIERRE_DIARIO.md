# 📘 Manual de Usuario: Módulo de Cierre Diario y Auditoría de Rutas
**ProteinAgro S.A.S. — Versión del Sistema:** `v1.6.0`  
**Destinatarios:** Administración, Coordinación Logística y Gerencia de Operaciones

---

## 🎯 1. ¿Qué es este Módulo y para qué sirve?
El **Módulo de Cierre Diario** es una herramienta de auditoría en tiempo real diseñada para responder tres preguntas críticas al final de cada jornada:

1. ¿El conductor visitó todos los puntos que tenía programados en su ruta?
2. ¿Los kilos que recogió el conductor **ya llegaron y están guardados en el Excel de Google Sheets**?
3. Si un punto no se recolectó, ¿existe una constancia justificada de por qué no se hizo?

> 🔒 **Garantía de Verdad:** Este módulo no lee estimaciones ni memorias temporales. Se conecta directamente con la hoja contable oficial (`DB_App_Conductores.gsheet`) para auditar la información real.

---

## 🧭 2. Paso a Paso: Cómo Generar el Cierre Diario

### Paso 1: Ingresar al Panel Administrativo
1. Abre la aplicación en tu computador o celular: [https://proteinagro-app.vercel.app](https://proteinagro-app.vercel.app).
2. En la pantalla inicial, haz clic en el enlace discreto que dice **`🔐 Acceso Administrativo`** (en la parte inferior).
3. Ingresa la clave de administrador.

### Paso 2: Ubicar el Módulo
1. En el panel, baja la pantalla pasando las gráficas estadísticas.
2. Encontrarás la tarjeta destacada con el título:  
   **📊 Cierre Diario y Cobertura de Rutas**.

### Paso 3: Configurar los Filtros
1. **Fecha a auditar:** Por defecto vendrá seleccionada la fecha de hoy. Si deseas auditar un día anterior, haz clic en el calendario y elígelo.
2. **Ruta:** En el menú desplegable, selecciona la ruta que deseas auditar (por ejemplo: *`Ruta 5: Palmira / Villagorgona / Carmelo`* o *`Ruta 4: Buga / Zarzal / Tuluá`*).
3. Haz clic en el botón morado **`Generar Cierre`**.

---

## 🚦 3. Cómo Interpretar los Resultados

Una vez presiones el botón, el sistema te mostrará tres secciones de resultados:

### A. Barra de Progreso y Porcentaje de Cobertura
* **🟢 Verde (100%):** Cumplimiento perfecto. Todos los puntos programados fueron atendidos (ya sea con recolección de kilos o con novedad justificada).
* **🟡 Naranja (80% a 99%):** Cobertura aceptable, pero faltaron algunas paradas por visitar o reportar.
* **🔴 Rojo (Menos del 80%):** Alerta de incumplimiento. Faltaron muchas paradas de la ruta programada.

### B. Resumen de Cifras
* **Kilos Totales de la Ruta:** Muestra la suma matemática exacta de todos los kilogramos recolectados en esa ruta durante el día (ej: *4.917,4 kg*).
* **Puntos Asignados:** Muestra la proporción de cumplimiento (ej: *11 / 16* significa que de 16 paradas obligatorias, 11 ya están cubiertas).

### C. Checklist de Visitas (Fila por Fila)
El checklist enumera cada uno de los proveedores que le correspondían a esa ruta:

| Estado | Color | Significado | ¿Qué hacer? |
|---|---|---|---|
| **`✅ ÉXITO`** | 🟢 Verde pastel | **Visita exitosa.** Se recogió producto y los kilos ya están registrados y seguros en Google Sheets. | Ninguna acción requerida. Todo en orden. |
| **`⚠️ NOVEDAD`** | 🟡 Amarillo pastel | **Visita fallida justificada.** El conductor fue pero reportó una causal (Establecimiento cerrado, sin materia prima, etc.). Cuenta como punto cubierto. | Revisar la causal indicada en la columna de la derecha. |
| **`❌ PENDIENTE`** | 🔴 Rojo pastel | **Sin registro en Google Sheets.** El conductor no pasó por el punto o su celular no tenía internet para transmitir el dato. | **Requiere atención (Ver sección 4).** |

---

## 🛠️ 4. ¿Qué hacer si un proveedor sale en `❌ PENDIENTE`?

Si un proveedor aparece en rojo con el texto *`No ha llegado a la Data`*, sigue este protocolo:

1. **Pregunta al Conductor:**
   * Llama o escribe al conductor asignado: *"¿Pasaste por [Nombre del Proveedor] hoy?"*.
2. **Caso 1: El conductor responde que NO pasó:**
   * Queda en evidencia la omisión de ruta para la gestión operativa y logística correspondiente.
3. **Caso 2: El conductor responde *"Sí pasé y lo registré en mi celular"**:**
   * Significa que el conductor estaba en una zona sin cobertura celular o en un sótano y el teléfono aún no lo ha transmitido.
   * **Solución Inmediata desde el Panel Admin:**
     1. Baja un poco en la misma pantalla hasta la sección **`Recolecciones en Vivo`**.
     2. Haz clic en el botón verde claro: **`🔄 Re-sincronizar Sheets`**.
     3. Espera 3 segundos a que aparezca la confirmación.
     4. Vuelve a subir y haz clic en **`Generar Cierre`**.
     5. El registro pasará automáticamente de Rojo a Verde (**`✅ ÉXITO`**) con sus kilos auditados.

---

## 💡 5. Buenas Prácticas para el Cierre de Fin de Día
* **Hora sugerida:** Realizar la auditoría entre las **4:30 PM y 6:00 PM**, cuando los camiones ya van retornando a la planta San Joaquín.
* **Cruce con Báscula:** Compara el valor de **"Kilos Totales de la Ruta"** que arroja la app contra el tiquete de pesaje de la báscula de la planta para detectar posibles mermas o diferencias antes de autorizar la salida del vehículo.
