# MEMORIA DEL PROYECTO: PROTEINAGRO (SISTEMA MATRIZ)

> **Documento de Memoria y Reglas de Trabajo Permanente**  
> **Última Actualización:** Octubre 2026 (Versión 1.6.4)  
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

### 2. Módulo de Cierre Diario y Cobertura de Rutas (`v1.6.3`)
- **Arquitectura de Auditoría en 4 Capas Anti-Fallo:**
  1. *Capa 1 (Google Sheets GViz CSV):* Consulta directa en vivo. En `sw.js`, `docs.google.com` está explícitamente excluido del interceptor para evitar errores 503 o bloqueos de caché.
  2. *Capa 2 (Webhook Google Apps Script):* Acción `action=getRecolecciones&fecha=...` en `Code.gs` para eludir 100% ad-blockers, extensiones de privacidad o bloqueos CORS de Google Visualization.
  3. *Capa 3 (Firebase Firestore):* Consulta directa a la colección `recolecciones` en la nube si Google Sheets no responde.
  4. *Capa 4 (LocalStorage Offline):* Consulta a `recolecciones_backup` en memoria del dispositivo si no hay red disponible.
- **Badge Semafórico de Fuente:** La interfaz muestra en tiempo real la procedencia de los datos auditados (`Google Sheets (En Vivo)`, `Google Sheets (Webhook)`, `Firestore (Nube)`, `Memoria Local (Offline)`).
- **Normalización de Fechas:** Estricta sin ceros a la izquierda (ej. `1/10/2026` vs `01/10/2026`), convirtiendo siempre a `D/M/YYYY` numérico.
- **Tolerancia a Diacríticos:** Comparación de nombres de proveedores y sucursales insensible a tildes (ej. *Cañaveral*, *Martínez*, *Villagorgona*) para evitar discrepancias con la hoja `Puntos_Rutas`.
- **Estados Semafóricos del Checklist:**
  - 🟢 `Auditado en Base`: Recolección con Kilos confirmada en Google Sheets.
  - 🟡 `Visita Fallida`: Novedad o punto con 0 Kg justificado.
  - 🔴 `No ha llegado a la Data`: Punto sin registrar en la base de datos hoy.

### 3. Matriz de Rutas y Homologación
- Rutas soportadas: **Ruta 1 a Ruta 7** y **Planta San Joaquín**.
- Todos los nombres de rutas deben pasar por la función `homologarRuta(texto)` antes de ser persistidos o comparados.

### 4. Tarifario Cruzado Dinámico
- Los precios se obtienen automáticamente en `Code.gs` desde la pestaña `Tarifas`.
- Fallback al histórico de `Recolecciones` en caso de no existir tarifa específica.

---

## 📦 3. Procedimientos de Respaldo y Despliegue

1. **Despliegue Web:** Cualquier cambio en `app.js`, `index.html`, `styles.css` o `sw.js` se sube con `git add .`, `git commit` y `git push origin main`. Vercel compila y publica en menos de 10 segundos.
2. **Despliegue Apps Script:** Si se modifica `Code.gs`, el usuario debe pegarlo en el editor de Google Sheets (*Extensiones > Apps Script*) e implementar una nueva versión del Webhook (*Implementar > Administrar implementaciones > Nueva versión*).
3. **Copias de Seguridad:** Mantener siempre actualizados los directorios `PROTEINAGRO_Backup_vX.X.X` y archivos comprimidos `.zip` con todos los activos del proyecto.
