# 🌿 Sistema Digital de Recolección Materia Prima - ProteinAgro
> **Documento Integral del Proyecto en Markdown**  
> **Versión Actual:** `v=1.6.4`  
> **Última Actualización:** Octubre 2026  
> **Despliegue de Producción:** [https://proteinagro-app.vercel.app](https://proteinagro-app.vercel.app)  
> **Repositorio GitHub:** [https://github.com/Tecnologia100/proteinagro-app](https://github.com/Tecnologia100/proteinagro-app)  

---

## 📋 1. Ficha Técnica y Resumen Ejecutivo

| Parámetro | Detalle |
|---|---|
| **Nombre del Proyecto** | Sistema Digital de Recolección de Materia Prima ProteinAgro |
| **Cliente / Operación** | ProteinAgro S.A.S. |
| **Tipo de Aplicación** | Web App Progresiva (PWA-ready), Serverless, Mobile-First |
| **Entorno Frontend** | HTML5 Semántico, CSS3 Vanilla Premium, JavaScript Moderno (ES6+) |
| **Alojamiento Web** | **Vercel** (Despliegue continuo CI/CD vinculado a rama `main`) |
| **Base de Datos Nube** | **Firebase Cloud Firestore** (Persistencia y sincronización offline habilitada) |
| **Almacenamiento de Archivos** | **Firebase Cloud Storage** (`firmas/REC-XXXXX.png` para firmas digitales) |
| **Backend & Hoja Contable** | **Google Apps Script** Webhook (`doGet` / `doPost`) sincronizado con Google Sheets |
| **Base de Datos Contable** | Google Sheets (`DB_App_Conductores.gsheet`) con cálculo automático de precios |

---

## 🎯 2. Objetivos y Necesidad del Negocio

1. **Eliminar las planillas físicas de papel:** Reemplazar el diligenciamiento manual con esfero y papel por parte de los conductores en sus rutas diarias de recolección.
2. **Erradicar la doble digitación:** Automatizar la entrada de datos hacia la hoja contable centralizada de Google Sheets sin requerir digitadores intermedios.
3. **Control estricto de puntos de recolección:** Garantizar que ningún conductor pueda registrar materias primas ni guardar recolecciones sin asociar el **Punto / Lugar de Recolección** específico.
4. **Cálculo seguro de liquidación:** Los conductores no visualizan precios ni dinero en campo; la liquidación monetaria (`Kilos * Precio histórico`) se calcula de forma segura y automatizada en el servidor/hoja contable.
5. **Comprobante inmediato al proveedor:** Emisión de un soporte o voucher digital en pantalla que puede compartirse directamente vía WhatsApp o imprimirse.
6. **Disponibilidad Offline:** Si el conductor entra a zonas sin señal o sótanos, la aplicación guarda las transacciones localmente y las sincroniza cuando se restablece la conexión.

---

## 🏗️ 3. Arquitectura del Sistema (Serverless Tri-Persistence)

El sistema opera con tres capas de persistencia redundante para garantizar cero pérdida de datos:

```
                      ┌──────────────────────────────────────┐
                      │      CONDUCTOR / ADMINISTRADOR       │
                      │  Navegador Móvil / PWA (Vercel)      │
                      └──────────────────┬───────────────────┘
                                         │
                 ┌───────────────────────┼────────────────────────┐
                 ▼                       ▼                        ▼
       ┌──────────────────┐    ┌──────────────────┐     ┌──────────────────┐
       │ Firebase Cloud   │    │ Google Sheets    │     │ LocalStorage     │
       │ Firestore &      │    │ Webhook (GAS)    │     │ Navegador        │
       │ Storage (Firmas) │    │ Hoja Contable    │     │ Respaldo Offline │
       └──────────────────┘    └──────────────────┘     └──────────────────┘
```

1. **Capa 1: Firebase Firestore & Storage (Nube de Alta Velocidad)**
   - Proyecto: `proteinagro-cd5fe` (Bucket: `proteinagro-cd5fe.firebasestorage.app`).
   - Persistencia offline activada (`db.enablePersistence()`).
   - Las firmas dibujadas por los proveedores en canvas se suben como imágenes PNG a la ruta `firmas/REC-XXXXX.png`.
   - Autenticación administrativa con Firebase Auth (`signInWithEmailAndPassword`) y fallback a PIN.

2. **Capa 2: Google Apps Script Webhook (Base Central Contable)**
   - Script publicado como Web App (`Code.gs`).
   - Soporte dual GET y POST para sortear restricciones de CORS y bloqueos de red corporativa.
   - Sistema de deduplicación automática para prevenir registros duplicados si hay reintentos simultáneos.
   - Búsqueda histórica reversa del precio por proveedor y producto para calcular el valor total.

3. **Capa 3: LocalStorage del Dispositivo (Respaldo en Memoria Local)**
   - Guarda inmediatamente el registro en el almacenamiento interno del navegador.
   - Retiene el nombre del conductor para agilizar recolecciones sucesivas sin necesidad de volver a seleccionarlo.

---

## 📱 4. Módulos de la Aplicación

### 4.1 Módulo del Conductor (`#driver-view`)

El flujo de trabajo del conductor está diseñado bajo el principio de **"Cero tipeo y máxima velocidad táctil"**:

1. **Login Sencillo:**
   - Selección de usuario o ingreso de PIN heredado (`1234` / `0000`).
2. **Itinerario Sugerido del Día:**
   - Banner inteligente que detecta automáticamente el día de la semana (Lunes a Sábado) y muestra las rutas programadas según el cronograma matriz.
3. **Selección de Conductor:**
   - Menú desplegable con los conductores activos obtenidos en vivo desde la pestaña `Conductores`.
4. **Selección de Ruta:**
   - Carga dinámica de rutas oficiales (`RUTA 1`, `RUTA 2`, `RUTA 3`, `RUTA 4`, `RUTA 5`, `PLANTA SAN JOAQUIN`, o `OTRA`).
5. **Horario y Cronograma de Paradas (6:00 AM - 3:30 PM):**
   - Si la ruta tiene paradas con horario programado, se despliega una línea de tiempo interactiva.
   - Al pulsar cualquier parada, el sistema **autocompleta automáticamente el Proveedor y el Punto de recolección**.
6. **Selección de Proveedor / Razón Social:**
   - Menú filtrado dinámicamente según la ruta seleccionada para evitar errores de digitación.
   - Opción para ingresar un nuevo proveedor (`OTRO`).
7. **Punto / Lugar de Recolección (Regla de Negocio Estricta v1.2.6):**
   - Menú filtrado con los puntos o sucursales del proveedor en esa ruta.
   - Opción `➕ Otro Punto / Sucursal...` con campo de texto libre.
   - **Bloqueo activo:** Si este campo no está seleccionado, la aplicación bloquea la selección de materias primas y kilos, hace scroll automático al campo y lo hace vibrar en color rojo.
8. **Catálogo Táctil de Materias Primas:**
   - 16 botones táctiles grandes con iconos descriptivos:
     - 🛢️ ACEITE
     - 🐮 CABEZAS
     - 🗑️ DESPERDICIO
     - 🐷 EMPELLA
     - 🥓 GORDANA
     - 🥩 HARINA CARNE
     - 🦴 H. VAPORIZADO (Harina de Hueso Vaporizada)
     - 🦴 HUESO BLANCO
     - 🦴 HUESO CALCINADO
     - 🐷 HUESO CERDO
     - 🦴 HUESO SECO
     - 🧈 MANTECA
     - 🧈 MARGARINA
     - 🐔 PIEL POLLO
     - 🧈 SEBO
     - 🧈 SEBO EN RAMA
9. **Registro de Kilos:**
   - Teclado numérico grande optimizado para pantalla táctil (`inputmode="decimal"`).
   - Botón `➕ Registrar producto`: Permite añadir múltiples materias primas dentro de la misma recolección.
10. **Observaciones / Novedades:**
    - Campo de texto opcional para incidentes en el punto (calidad del producto, demoras, etc.).
11. **Firma Digital del Proveedor:**
    - Canvas táctil interactivo con botón para borrar firma si se requiere corregir.
12. **Comprobante Digital (Voucher) & WhatsApp:**
    - Al guardar, se genera un recibo digital oficial (`REC-XXXXX`).
    - Botón para **Compartir por WhatsApp**: Genera un mensaje formateado con fecha, hora, conductor, ruta, proveedor, punto, detalle de kilos y confirmación de firma.
    - Botón para **Imprimir**: Formato optimizado para impresión térmica o PDF.

---

### 4.2 Módulo de Administración (`#admin-view`)

Panel de control para supervisión y auditoría en tiempo real:

1. **Métricas en Tiempo Real (Chart.js):**
   - Gráfico de barras: Total de Kilos recolectados agrupados por Proveedor.
   - Gráfico circular (Doughnut): Distribución de Kilos por Materia Prima.
2. **Tabla de Auditoría:**
   - ID de recolección, Fecha/Hora, Conductor, Ruta, Proveedor, Punto/Sucursal, Productos, Kilos totales, Observaciones y Estado de sincronización.
3. **Exportación de Datos:**
   - Descarga inmediata de reportes consolidados en formato **CSV** compatible con Microsoft Excel y Google Sheets.
4. **Filtros Avanzados:**
   - Filtrado por rango de fechas, conductor específico o proveedor.

---

## 📊 5. Estructura de Datos en Google Sheets (`DB_App_Conductores.gsheet`)

La hoja de cálculo central contiene 4 pestañas fundamentales:

### Pestaña 1: `Recolecciones` (12 Columnas en Orden Estricto)

| Col | Nombre de Columna | Tipo | Descripción |
|:---:|---|---|---|
| **A** | `ID_Recoleccion` | Texto | Código único transaccional (ej: `REC-1756891234567`) |
| **B** | `Fecha_Hora` | Texto | Fecha y hora formateada (`DD/MM/YYYY, HH:MM AM/PM`) |
| **C** | `Ruta` | Texto | Nombre de la ruta seleccionada |
| **D** | `Conductor` | Texto | Nombre del conductor que realizó la recolección |
| **E** | `Proveedor` | Texto | Nombre del proveedor o cliente |
| **F** | `Punto_Sucursal` | Texto | Sede, punto o municipio exacto de la recolección |
| **G** | `Materia_Producto` | Texto | Nombre de la materia prima (una fila por producto) |
| **H** | `Kg` | Número | Kilos netos recolectados |
| **I** | `Observaciones` | Texto | Novedades reportadas por el conductor |
| **J** | `Ubicacion_GPS_Real` | Texto | Coordenadas GPS del dispositivo (o `0`) |
| **K** | `Precio` | Moneda | **Precio unitario por kg**: Obtenido automáticamente por el script según el histórico del proveedor |
| **L** | `Valor` | Moneda | **Total Liquidación**: Calculado automáticamente (`Kg * Precio`) |

> 🔒 **Regla de Privacidad:** Las columnas **K** (`Precio`) y **L** (`Valor`) se calculan exclusivamente en Google Apps Script. El conductor jamás ve precios ni dinero en la interfaz móvil.

### Pestaña 2: `Productos`
- Columna A: `Nombre` (Nombre de la materia prima).
- Columna B: `Estado` (`Activo` o `Inactivo`).

### Pestaña 3: `Conductores`
- Columna A: `Nombre` (Nombre completo del conductor).
- Columna B: `Estado` (`Activo` o `Inactivo`).
- Columna C: `Contraseña` (PIN o clave individual de acceso a la app móvil).

### Pestaña 4: `Puntos_Rutas`
- Matriz completa de logística: Ruta, Proveedor, Punto/Sucursal, Dirección, Teléfono, Horario Programado, Frecuencia y Estado.

---

## 📁 6. Estructura de Archivos del Proyecto

```
PROTEINAGRO/
├── index.html                   # Interfaz principal (HTML5, PWA, Vistas Driver & Admin)
├── app.js                       # Lógica central del sistema, Firebase, validaciones y sincronización
├── styles.css                   # Diseño visual responsive móvil/desktop, animaciones de error y estilos
├── Code.gs                      # Código backend de Google Apps Script (Webhook doGet/doPost)
├── build_code_gs.py             # Script de apoyo para compilación/generación de Code.gs
├── README.md                    # Documentación rápida del repositorio
├── PROYECTO.md                  # Este documento integral del proyecto
├── .gitignore                   # Exclusiones de Git (node_modules, cachés, etc.)
├── .vercelignore                # Exclusiones de despliegue en Vercel
│
├── DB_App_Conductores.xlsx      # Copia local de respaldo de la base de datos de Google Sheets
├── CONSOLIDADO RUTAS.xlsx       # Matriz histórica de rutas y programación semanal
├── CUENTA 2026.xlsx             # Plantilla y consolidado contable anual
├── CUENTA PROVEEDORES HUESO...  # Archivo de tarifas y proveedores de hueso
├── Proteinagro_Digital_...pdf   # Presentación corporativa de la evolución digital
├── planilla.pdf                 # Formato físico antiguo (reemplazado por esta app)
└── app-recolecciones/           # Proyecto experimental React/Vite (en desuso, producción usa vanilla)
```

---

## 📜 7. Historial de Versiones y Changelog

### `v=1.5.6` (Octubre 2026) - Versión Actual
- **Resolución de Pérdida Silenciosa de Datos por `mode: no-cors`:**
  - Se eliminó el modo ciego `no-cors` de las peticiones `fetch` en `enviarAGoogleSheets` (`app.js`).
  - Ahora la PWA evalúa de forma estricta la respuesta real (`response.ok`). Si Google Sheets experimenta saturación o error 500, la app detecta el fallo, mantiene el registro como pendiente y permite que el motor de Auto-Sync en segundo plano (cada 5 minutos) lo reintente hasta lograr entrega garantizada.
- **Homologación Oficial Estricta de Rutas:**
  - Implementación de `homologarRuta(texto)` sincronizada tanto en el cliente (`app.js`) como en el servidor (`Code.gs`).
  - Fusión de 27 variantes dispares (por diferencias de mayúsculas, tildes o paradas añadidas) bajo el catálogo oficial de 9 rutas:
    - `RUTA 1: Santa Elena / Cavasa`
    - `RUTA 2: Cali (Norte / Sur / Oriente juanchito)`
    - `RUTA 2: Cali Sur / Oriente/ Juanchito)`
    - `RUTA 3: Puerto Tejada / Villarica / Jamundí / Pance`
    - `RUTA 4: Buga / Roldanillo / Zarzal / Tuluá`
    - `RUTA 5: Palmira / Villagorgona / Carmelo`
    - `RUTA 6: Oriente/Sur`
    - `RUTA 7: Yumbo/Belalcazar`
    - `PLANTA SAN JOAQUIN`
    - *(Especial: `Buenaventura`)*
  - Aplicación automática en formulario de recolección, módulo de novedades y edición administrativa.
- **Prevención de Salto Fantasma de Filas en Sheets (Fix de `appendRow` ciego):**
  - Corrección en `Code.gs`: se reemplazó `sheet.appendRow()` (que saltaba al final absoluto de la hoja al encontrar huecos o filas vacías como la fila 5142) por un escaneo dinámico de la columna B (`Fecha_Hora`).
  - Las nuevas recolecciones se insertan de forma contigua e ininterrumpida exactamente en la fila siguiente (`targetRow = lastRow + 1`).
- **Reparación de Kilos Anómalos y Base Consolidada:**
  - Detección y corrección de 16 registros corruptos con pesos en notación científica (> 50.000 kg o billones) de agosto y septiembre, restituyendo sus pesos reales a partir del desglose de productos.
  - Consolidación del archivo maestro `DB_App_Conductores_HOMOLOGADO_2134.xlsx` con exactamente 2.134 registros limpios, 12 columnas oficiales de Google Sheets, IDs estándar `REC-timestamp` y separación estricta de productos y kilos.

### `v=1.5.2` (Septiembre 2026)
- **Integración Oficial de Rutas 6 y 7:**
  - **`RUTA 6: Oriente/Sur`:** 9 paradas de recolección operativas (*Mercaunión, Cañaveral Ingenio, Cañaveral Limonar, Cañaveral Pasoancho, Sevillana Pasoancho, La Montaña Pasoancho, Orlando Martínez, Distribuidora Millán, La Esperanza*). Frecuencia: Miércoles y Sábados.
  - **`RUTA 7: Yumbo/Belalcazar`:** 8 sedes exclusivas de Belalcázar (*B1-Principal, B2-Galería, B3-Planta Belomo, B5-Guacanda, B6-Rozo, B8-Bolívar, B9-Uribe, B11-Guabinas*). Frecuencia: Jueves.
- **Sincronización en Vivo de Rutas vía Gviz CSV:**
  - Consulta directa de la pestaña `Rutas` en tiempo real con orden jerárquico estricto (Rutas 1 a 7 y Planta San Joaquín fija al final).
  - Consulta de `Puntos_Rutas` con parámetro `&headers=1` para impedir la absorción de los primeros registros de la Ruta 1.
- **Matriz Completa de 126 Puntos Offline-First:**
  - Actualización de `CATALOGO_PUNTOS_RUTAS_DEFAULT` en `app.js` con los 126 puntos oficiales del tarifario auditado 2026.
  - Actualización del itinerario semanal de recolección (`actualizarItinerarioDelDia()`) y modal de edición administrativa.

### `v=1.5.1` (Septiembre 2026)
- **Blindaje Total de Actualización Inmediata en Navegadores de PC:**
  - **Cabeceras Anti-Caché en Vercel (`vercel.json`):** Configuración explícita de `Cache-Control: no-cache, no-store, must-revalidate` para `/sw.js` e `index.html`. Evita que Chrome y Edge en Windows retengan el Service Worker viejo en la caché de disco HTTP.
  - **Recarga Anti-Caché en Service Worker:** En `controllerchange` y `message RELOAD_PAGE`, se reemplazó el reload convencional por recarga con bypass forzado de caché `?v=1.5.1&t=Date.now()`.
  - **Detección Automática de Actualización al Enfocar Pestaña:** Se agregó un listener a `visibilitychange` en `app.js` para que cada vez que el usuario vuelva a la pestaña de ProteinAgro en su PC, el navegador verifique en segundo plano si hay una nueva versión (`reg.update()`).
  - **Botones de Actualización Universal (Acceso en 1 Clic):**
    - En la **Pantalla de Login** (Conductor y Administrador): badge interactivo `🔄 v1.5.1` y enlace auxiliar *"¿En PC o celular y no ves cambios? Clic aquí"*.
    - En la **Cabecera del Panel Administrativo**: badge interactivo `🔄 v1.5.1`.
    - En el **Formulario de Conductor**: badge en cabecera y botón de pie de formulario.

### `v=1.5.0` (Septiembre 2026)
- **Transmisión Redundante Blindada POST + GET (`enviarAGoogleSheets`):**
  - Cambio a canal prioritario `POST` con cabecera `application/x-www-form-urlencoded` y cuerpo `payload=...` en `app.js`.
  - Inmune a interferencias de vistas HTML en `doGet` (como la colisión generada por `Conciliador_Admin.gs`).
  - Envío secundario redundante vía `GET` para garantizar entrega en proxies corporativos o entornos restrictivos.
- **Soporte Integral para Novedades (`saveNovedad`):**
  - Manejo explícito de la acción `saveNovedad` tanto en `doGet` como en `doPost` en `Code.gs`.
  - Inserción correcta de `Visita Fallida: Causal` con 0 Kg, geolocalización, observaciones y estado en la hoja `Recolecciones`.
- **Botón de Re-sincronización Masiva en Panel Administrador:**
  - Incorporación del botón `🔄 Re-sincronizar Sheets` (`resincronizarTodoAGoogleSheets()`) en el panel de administración de `index.html`. Permite reenviar con un clic todos los registros locales (`recolecciones_backup`) que se hayan acumulado sin riesgo de duplicidad gracias a la deduplicación nativa de `Code.gs`.
- **Deduplicación y Filtrado Antifantasmas en `Code.gs`:**
  - Prevención de filas fantasmas `[object Object]` mediante verificación segura del tipo de producto y omitiendo registros vacíos sin producto ni kilos a menos que sean novedades declaradas.
- **Acción de Eliminación por ID (`deleteRecoleccion`):**
  - Incorporación de `eliminarRecoleccionSheet()` en `Code.gs` para depurar o limpiar filas de prueba por su ID.

### `v=1.4.9` (Septiembre 2026)
- **Sincronización Directa de Catálogos Anti-Fallo (Google Sheets Gviz):**
  - Implementación de `sincronizarCatalogosDesdeGviz()` en `app.js`: consulta directa a Google Sheets vía CDN/Gviz CSV para cargar Productos y Puntos_Rutas con 0ms de latencia, asegurando que la App nunca se quede sin actualizar aunque el Webhook de Apps Script devuelva HTML o sufra bloqueos de despliegue.
  - Parseo seguro de respuestas HTTP protegiendo la lectura de JSON contra respuestas HTML imprevistas.
- **Catálogo Completo de 24 Productos:**
  - Inclusión de los 24 productos en `DEFAULT_PRODUCTOS` y en la grilla visual de `index.html` (incorporando `PIELES`, `HARINA CARNE`, `HARINA DE HUESO VAPORIZADA` y `SEBO`).
  - Mapeo de íconos en `PRODUCT_DISPLAY_MAP` para `PIELES` (📦).
- **Resolución de Colisión de `doGet` en Google Apps Script:**
  - Centralización del handler en `Code.gs` con soporte para `view=conciliador` (retornando la interfaz del Conciliador de forma integrada) y renombrado en `Conciliador_Admin.gs` para evitar colisiones que anulaban la API móvil de conductores.

### `v=1.4.8` (Septiembre 2026)
- **Desacople de Formato Tabla y Estandarización de Catálogos:**
  - **Resolución de incompatibilidad con Tablas nativas:** Retiro del formato tabla en `Productos` y `Puntos_Rutas`, evitando la absorción de la fila 1 y restaurando la cuadrícula de celdas estándar 100% compatible con Google Apps Script.
  - **Catálogo de Productos Ampliado:** Activación de 21 materias primas oficiales (*Mantequilla, Orejas de Cerdo, Pulmón de Cerdo, Calambombos, Tráqueas, Leña, Pieles, etc.*) con filtrado estricto de productos inactivos.
  - **Matriz de Puntos Completa (126 Puntos):** Restauración de los 11 puntos oficiales de la Ruta 1 (*Bodega Santa Elena, Garay, Cavasa, etc.*) y balanceo integral de 126 puntos distribuidos entre Ruta 1 a 7 y Planta San Joaquín.
- **Blindaje Inmutable de Tarifas y Precios Manuales:**
  - `inicializarPestanaTarifas()` lee previamente todas las tarifas existentes y las preserva al 100%, garantizando que ningún precio manual asignado por gerencia sea sobreescrito ni reseteado.
- **Liquidador Masivo de Recolecciones Pendientes:**
  - Creación de `liquidarRecoleccionesPendientes()` en `Code.gs`: escaneo y cálculo automático de `Precio` (cruce jerárquico con `Tarifas` y fallback histórico) y `Valor = Kg * Precio` para todas las filas vacías de `Recolecciones`, manteniendo intactos los registros ya costeados.

### `v=1.4.7` (Septiembre 2026)
- **Organización Jerárquica por Rutas y Planta San Joaquín al Final:**
  - **Orden Estricto de Rutas:** Se implementó `obtenerPesoRuta()` en `Code.gs` para estructurar tanto la pestaña `Puntos_Rutas` como `Tarifas` en orden numérico estricto: **Ruta 1**, **Ruta 2**, **Ruta 3**, **Ruta 4**, **Ruta 5**, **Ruta 6**, y dejando permanentemente a **PLANTA SAN JOAQUIN** en el bloque final de ambas tablas.
  - **Catálogo Oficial Unificado de 122 Puntos:** Reintegración total de los 22 puntos y proveedores de entrega directa en planta (*Heber Gamboa, Milson González, Graxpro, Carlos Caicedo, etc.*) junto a los 100 puntos de las rutas de recolección en campo, asegurando 122 paradas operativas consistentes entre la PWA móvil y Google Sheets.
  - **Protección y Restauración de Encabezados (9 Columnas):** Funciones `restaurarPlantaSanJoaquin()` y `restaurarEncabezadosPuntosRutas()` para blindar la fila 1 de `Puntos_Rutas` (`Ruta`, `Proveedor`, `Punto_Sucursal`, `Direccion`, `Telefono`, `Horario_Estimado`, `Frecuencia_Dias`, `Estado`, `Materias_Frecuentes`) con formato verde corporativo.
  - **Tarifario sin Registros Genéricos:** Limpieza de filas comodín innecesarias (`"General"`), limitando la hoja `Tarifas` exclusivamente a puntos reales de cada ruta con precios fijos y soporte para estado `Pendiente Precio`.

### `v=1.4.6` (Septiembre 2026)
- **Módulo Centralizado de Tarifas Vigentes (`Tarifas`):**
  - **Función de Auto-Poblado Dinámico (`inicializarPestanaTarifas`):** Recopila en vivo desde la hoja de cálculo todos los proveedores históricos y de catálogo, asignando su precio más reciente a los productos cotizados (`Activo`) y creando automáticamente todas las combinaciones restantes en blanco con estado `Pendiente Precio` para ser alimentadas por la administración.
  - **Motor Híbrido de Liquidación Inmutable (`obtenerPrecioTarifa`):**
    - Consulta primero la pestaña `Tarifas` por `Proveedor` + `Punto` específico o `Proveedor` + `Todas las Sucursales`.
    - Si la tarifa está definida, estampa el valor monetario como dato plano e inmutable (sin fórmulas `BUSCARV`), protegiendo el histórico contable ante futuras renegociaciones.
    - Si la tarifa aún está en blanco (`Pendiente Precio`), utiliza de forma transparente el buscador histórico de `Recolecciones` como respaldo de seguridad, garantizando cero interrupciones en la operación en campo.

### `v=1.4.5` (Septiembre 2026)
- **Blindaje y Restauración de Kilos en Google Sheets vs Soporte Oficial (Fix de Auto-Conversión a Fecha):**
  - **Diagnóstico y Corrección de Causa Raíz:** Se identificó y resolvió el fenómeno en Google Sheets / Excel con configuración regional de Colombia (`es_CO`), donde valores decimales de kilos con punto (ej. `28.2`, `24.9`, `23.5`, `3.4`) eran interpretados erróneamente por la hoja de cálculo como fechas (`28/02/2026`, `24/09/2026`), almacenándose como números de serie enteros (`46081`, `46289`) y mostrándose como `46.081,00`, corrompiendo la liquidación contable.
  - **Blindaje Numérico Estricto en `Code.gs` (`parseKilosNumero`):** Se implementó una función de coerción numérica obligatoria en el backend de Google Apps Script que garantiza que toda cantidad de kilos enviada desde la app sea convertida a un número primitivo flotante (`Number`) antes de ser insertada en la hoja con `appendRow`, impidiendo que Google Sheets auto-convierta el texto a fecha.
  - **Módulo de Reparación Masiva en `Code.gs` (`corregirKilosFechasSheet`):** Función de recuperación automatizada que examina toda la pestaña `Recolecciones`, detecta números de serie residuales de fechas en la columna `Kg` (rango 45000 a 48000), extrae matemáticamente los días y meses para restituir los kilos decimales originales exactos (`28.2`), y recalcula automáticamente la columna `Valor` (`kilos * precio`). Puede ejecutarse desde el editor de Google Apps Script o vía Webhook con `action=corregirKilosFechas`.
  - **Consistencia Total Firestore vs Sheets:** El soporte oficial (que lee directamente de Firestore) se mantiene como la fuente de verdad absoluta y ahora coincide de forma 100% idéntica con los registros de Google Sheets.

### `v=1.4.4` (Septiembre 2026)
- **Módulo de Edición y Corrección de Recolecciones para Administrador (`✏️ Editar`):**
  - **Edición en Línea de Recolecciones:** Incorporación del botón `✏️ Editar` en cada fila de la tabla del panel administrativo. Permite corregir errores cometidos por los conductores al ingresar productos, kilos, ruta, conductor, fecha, proveedor, punto o sucursal y observaciones.
  - **Gestión Dinámica de Productos:** Permite añadir nuevos productos (`➕ Agregar Producto`), modificar productos existentes con selector desplegable oficial, editar los pesos en kilos y eliminar ítems erróneos con cálculo automático en vivo del Total de Kilos.
  - **Sincronización Bidireccional Inmediata:** Al guardar los cambios, la corrección se actualiza de inmediato en **Firebase Firestore**, en la memoria local del navegador y se envía a **Google Sheets** vía Webhook (`action=updateRecoleccion`), eliminando automáticamente las filas desactualizadas en la hoja contable y re-insertando los datos corregidos con precios y valores recalculados.
  - **Actualización Inmediata de Soportes Oficiales:** Los comprobantes de soporte oficial (voucher digital e impresión/WhatsApp) se actualizan al instante sin discrepancias.
- **Normalización Estricta a Nombre Propio (Title Case) para Conductores:**
  - **Corrección de Conductores en Minúsculas:** Se corrigió el nombre de `Francisco Larrahondo` (anteriormente en minúsculas en fallbacks y cachés residuales) y `Luz Elena Lopez`, garantizando que siempre se presenten en Nombre Propio profesional en el login, cabeceras, formularios, tablas y vouchers.
  - **Sincronización Dinámica con Google Sheets Gviz:** `sincronizarCredencialesDesdeGviz()` ahora lee en vivo la pestaña `Conductores`, formatea automáticamente a Nombre Propio (`aNombrePropio()`), actualiza los selectores dinámicos y guarda las credenciales individuales de forma insensible a mayúsculas/minúsculas para evitar bloqueos de PIN.
  - **Saneamiento Automático de Caché:** Purga automática de cachés antiguas en navegadores para que los usuarios vean de inmediato los nombres corregidos.

### `v=1.4.3` (Septiembre 2026)
- **Formato Inteligente de Miles en Kilos (es-CO):**
  - **Formateo en Vivo en Campo de Kilos:** El campo `#kilos` se actualizó para formatear automáticamente con separador de punto de miles (ej. `150000` se muestra como `150.000` en tiempo real mientras el conductor digita), conservando la posición natural del cursor.
  - **Soporte de Decimales:** Permite ingresar decimales con coma `,` o punto `.` (ej. `150.000,5`), parseando limpiamente al valor numérico flotante.
  - **Formateo en Lista de Productos:** La lista de productos agregados por el conductor muestra la cantidad con separador de miles (ej. `150.000 kg`).
  - **Formateo en Comprobante Digital y WhatsApp:** El voucher en pantalla y el mensaje para compartir por WhatsApp reflejan las cantidades y el total general en formato de miles (ej. `150.000 KG`).
  - **Formateo en Panel Administrativo:** La tabla de recolecciones recientes y el buscador de soportes oficiales formatean los kilos totales e individuales con separador de miles.
  - **Integridad Numérica Total:** La base de datos (Firestore, Google Sheets y LocalStorage) almacena el valor numérico puro (`150000`), manteniendo 100% intactas las operaciones matemáticas, gráficos y fórmulas contables.

### `v=1.4.2` (Septiembre 2026)
- **Módulo Independiente de Reporte de Novedades y Visitas Fallidas (`⚠️ Registrar Novedad / Visita Fallida`):**
  - **Constancia Oficial con 0 Kg:** Permite al conductor registrar formalmente visitas donde no se pudo recolectar producto, guardando el registro con `totalKilos: 0` y estado `Visita Fallida`.
  - **10 Causales Estandarizadas:** Desplegable intuitivo con 10 opciones predeterminadas (*Establecimiento Cerrado, Sin Materia Prima Disponible (0 Kg), No Pueden Atender en el Momento, Sin Parqueo / Acceso Bloqueado, Encargado Ausente, Producto Aún en Proceso, No Cumple Calidad / Mal Estado, Entregado a Otro Recolector, Camión Lleno (Capacidad Máxima), Otra Novedad*).
  - **Evidencia Fotográfica Obligatoria desde Cámara Móvil:** Input nativo con `capture="environment"` para abrir la cámara trasera del dispositivo móvil directamente. Validación estricta que impide registrar la novedad sin foto de constancia.
  - **Compresión Nativa en Canvas:** Reducción automática de imágenes pesadas a máximo 960px y compresión JPEG calidad 0.72 (~80-120 KB), garantizando subida ultrarrápida incluso en redes 3G o zonas con baja cobertura.
  - **Almacenamiento en Firebase Storage & Tri-Persistencia:** Las fotos se almacenan en `novedades/NOV-XXXXX.jpg` en Cloud Storage, con respaldo de URL en Firestore, registro en LocalStorage (`recolecciones_backup`) y sincronización inmediata con la hoja contable de Google Sheets vía Webhook.
  - **Captura Automática de GPS:** Coordenadas de geolocalización en vivo (`latitud, longitud`) registradas para auditoría del punto visitado.
  - **Comprobante Digital y Soporte WhatsApp:** Generación inmediata del comprobante oficial de novedad en pantalla con opción de compartir por WhatsApp con operaciones y administración.
  - **Cero Regresiones:** El formulario y flujo principal de recolección normal de kilos no fue modificado y continúa funcionando al 100%.

### `v=1.4.1` (Septiembre 2026)
- **Motor Inteligente de Precios Históricos y Formato Nombre Propio (Title Case):**
  - Búsqueda automatizada en Google Apps Script (`Code.gs`) de precios históricos previos por proveedor, punto y producto con normalización de texto.
  - Cálculo automático de `Valor = Precio * Kg` en la hoja contable `Recolecciones`.
  - Conversión automática a formato Nombre Propio (`=NOMPROPIO`) para Conductor, Ruta, Proveedor, Punto y Materia Prima al guardar en Google Sheets.

### `v=1.3.8` (Septiembre 2026)
  - **Validación Estricta de Claves Asignadas:** Se corrigió la lógica en `handleConductorLogin` para que ningún conductor con contraseña configurada en Google Sheets pueda ingresar con el PIN dummy `1234`. La clave `1234` queda bloqueada y solo se acepta la contraseña real asignada a cada conductor (ej. Jairo Peña: `5301`).
  - **Sincronización Directa de Credenciales en Vivo (Google Sheets Gviz):** Se implementó `sincronizarCredencialesDesdeGviz()` como canal directo en tiempo real hacia la pestaña `Conductores`, leyendo la Columna C (`Contraseña`) con soporte CORS total. Esto garantiza que cualquier cambio de contraseña en Google Sheets se refleje de inmediato en la app sin depender del despliegue del Webhook de Apps Script.
  - **Eliminación de Caché Obsoleta de PINs:** Se añadió un saneador en el arranque de la app que purga cualquier valor residual `1234` guardado en el `localStorage` de navegadores móviles para conductores cuya clave real difiera de `1234`.
  - **Respaldo Oficial Offline `DEFAULT_CONDUCTORES_AUTH`:** Incorporación en el código base de las contraseñas oficiales asignadas a los 7 conductores activos (Ricardo: 1649, Hernando: 8063, Emer: 6860, Jairo: 5301, Carolina: 1306, Luz Elena: 6700, Francisco: 1234).

### `v=1.3.7` (Septiembre 2026)
- **Autenticación Individual por Conductor vía Google Sheets & Acceso Administrativo Discreto:**
  - **Claves Individuales desde Google Sheets:** La pestaña `Conductores` incorpora la Columna C (`Contraseña`). Cualquier PIN o clave asignada o modificada en Sheets se sincroniza en vivo con la app móvil.
  - **Fijación e Inmutabilidad de Conductor en Recolección:** Al autenticarse el conductor, su nombre queda fijado y bloqueado (`disabled`) en el formulario con insignia visual `🔒 Sesión Activa`. Se elimina el doble tipeo/selección y se garantiza 100% de trazabilidad (ningún conductor puede registrar por error a nombre de otro).
  - **Acceso Administrativo Discreto:** La pantalla de login presenta una experiencia 100% orientada al conductor con selector rápido y PIN, incorporando al pie un enlace discreto (`🔐 Acceso Administrativo`) que permite al administrador autenticarse y abrir el panel de control.
  - **Persistencia de Sesión y Resiliencia Offline:** La app guarda la sesión activa en `sessionStorage` para no pedir clave al recargar la página en ruta, y almacena en `localStorage` las credenciales para permitir ingreso y registro seguro incluso en zonas rurales sin cobertura celular.

### `v=1.3.6` (Septiembre 2026)
- **Corrección de Ordenamiento Cronológico y Visualización de Recolecciones del Día:**
  - **Diagnóstico y Corrección de Consulta Firestore:** Se identificó que la consulta anterior ordenaba por el campo de texto `fecha` de forma lexicográfica/alfabética descendente (`"9/9/2026"` > `"10/9/2026"`), lo cual provocaba que al superar los 100 registros en la base de datos, las recolecciones del día 10 de septiembre (`10/9/2026`) quedaran relegadas y excluidas del límite de la consulta.
  - **Incorporación de Campo `timestamp` y Migración Retroactiva:** Se incorporó el campo numérico `timestamp: Date.now()` en cada nuevo registro y se ejecutó un script de backfill que actualizó el 100% de los documentos históricos (157 registros) con su marca de tiempo exacta en milisegundos.
  - **Ordenamiento Multicriterio Cronológico Real:** La consulta administrativa en tiempo real ordena por `timestamp desc` e implementa en memoria la función `parseFechaRecoleccion()`, garantizando que todas las recolecciones del día actual se ubiquen de forma inmediata en las primeras posiciones de la tabla y del caché.
  - **Formateo de Fecha Confiable sin Inversión de Mes/Día:** Se eliminó la ambigüedad de `new Date(data.fecha)` que interpretaba fechas latinas `DD/MM/YYYY` como meses anglosajones (ej. 10 de septiembre como 9 de octubre), desplegando ahora en pantalla y en exportación CSV el formato legible exacto `DD/MM/YYYY HH:MM:SS`.

### `v=1.3.5` (Septiembre 2026)
- **Generador de Soporte Oficial de Recolección en Rol Administrador:**
  - Incorporación del botón `📄 Emitir Soporte Oficial` en la barra de acciones del Panel Administrativo (`#admin-support-modal`).
  - **Autollenado Inteligente por Filtros (Opción 1):** Al ingresar **Fecha** (calendario nativo), **Proveedor** y **Punto / Sucursal**, el sistema busca de forma automática en el historial existente y autocompleta todos los datos de la recolección: Conductor, Ruta, lista de productos recolectados con sus iconos oficiales, total de kilos y observaciones.
  - **Manejo de Múltiples Viajes:** Si un proveedor registra más de una recolección en la misma fecha y punto (ej. dos viajes de ruta en el mismo día), se presenta un selector de viajes (`Viaje #1`, `Viaje #2`) para elegir la recolección exacta a emitir.
  - **Acceso Rápido desde la Tabla de Recolecciones:** Cada fila de la tabla de recolecciones recientes del panel de administración incorpora un botón directo `📄 Soporte` para visualizar y emitir el comprobante oficial en 1 solo clic.
  - **Comprobante Digital Oficial con Fecha Histórica:** Al pulsar `📄 Abrir Soporte Oficial`, se despliega el voucher oficial con la fecha y hora histórica real de la recolección, firma digital capturada en campo, totales con redondeo exacto a 2 decimales, y funciones completas de impresión / PDF y compartir por WhatsApp.
  - **Integridad y Seguridad Contable:** La emisión de soportes desde el rol administrador es estrictamente de lectura y visualización (100% visual). No inserta nuevas filas en Google Sheets ni genera duplicados en Firebase Firestore.

### `v=1.3.4` (Septiembre 2026)
- **Iconografía Oficial en Productos Recolectados y Botones Táctiles:**
  - Implementación del mapa maestro de visualización `PRODUCT_DISPLAY_MAP` en JavaScript, vinculando de forma unívoca cada producto con su icono oficial exacto y etiqueta optimizada para móviles (ej. `🐷 HUESO CERDO`, `🫁 PULMON CERDO`, `🦴 CALAMBOMBO CERDO`, `🪵 LEÑA`).
  - Despliegue de los iconos oficiales en la lista en vivo de productos recolectados en pantalla (`#products-list`).
  - Inclusión de los iconos oficiales en la tabla del comprobante digital (voucher) y en el mensaje generado para compartir vía WhatsApp.
  - Sincronización idéntica entre renderizado estático HTML y dinámico JavaScript al actualizar catálogos.

### `v=1.3.3` (Septiembre 2026)
- **Ordenamiento Alfabético Estricto de Productos (A-Z):**
  - Se ordenaron alfabéticamente los 20 productos oficiales en la cuadrícula táctil de botones del conductor, permitiendo ubicar rápidamente cualquier materia prima desde la **A** (*ACEITE*) hasta la **T** (*TRAQUEAS*).
  - Incorporación de los nuevos productos de la hoja contable con sus emojis característicos: *Calambombo de Res*, *Calambombo de Cerdo*, *Pulmón de Cerdo*, *Orejas de Cerdo*, *Leña*, *Mantequilla*, *Hueso Promoción*, etc.
  - La lista de materias primas recolectadas (`collectedProducts`) se clasifica y muestra en tiempo real en orden alfabético cada vez que se agrega un producto.
  - El soporte digital (voucher en pantalla), el texto generado para compartir por WhatsApp y el registro en base de datos preservan la lista de materias primas recolectadas en estricto orden alfabético.

### `v=1.3.2` (Septiembre 2026)
- **Garantía Inmediata de Filtro en Cascada & Catálogo Embebido:**
  - Integración directa en el cliente del catálogo base oficial con los 122 puntos de recolección, las 6 rutas activas y los 8 conductores oficiales, eliminando esperas de latencia y garantizando operatividad instantánea al 100% incluso sin internet.
  - Priorización de coincidencia exacta por nombre de proveedor antes de coincidencias parciales, evitando que proveedores con nombres parecidos (ej. Supertienda Cañaveral y Frigorivalle) mezclen sus puntos.
  - Extracción limpia de proveedores por ruta directamente desde la matriz, eliminando apariciones erróneas de proveedores de otras rutas.
- **Solución Definitiva de Caché PWA & Auto-Recarga:**
  - Mecanismo de actualización forzada mediante escucha de `controllerchange` y mensajes `RELOAD_PAGE` desde el Service Worker para que los dispositivos móviles apliquen la nueva versión automáticamente.
  - Indicadores visuales claros de versión (`v1.3.2`) en el encabezado y tarjeta de acceso.
  - Botón de soporte rápido `🔄 ¿No ves los cambios? Toca aquí para actualizar` (`forzarActualizacionApp()`) para limpiar Service Workers, Caché Storage y LocalStorage con un solo toque.

### `v=1.3.1` (Septiembre 2026)
- **Filtro Estricto en Cascada (Ruta ➔ Proveedor ➔ Puntos del Proveedor):**
  - Al seleccionar una Ruta, se despliegan exclusivamente los proveedores asignados a esa ruta y el selector de Punto queda en espera (`disabled`) con la indicación *"Primero seleccione un proveedor"*, evitando la visualización desordenada de todos los puntos de la ruta.
  - Al seleccionar un Proveedor, el selector de **Punto / Lugar de Recolección** se activa de inmediato y despliega **únicamente las sedes o puntos que le pertenecen a ese proveedor específico**.
  - Si el proveedor cuenta con exactamente 1 solo punto registrado en esa ruta, el sistema lo preselecciona automáticamente para ahorrarle tiempo de digitación al conductor.
  - Integración armónica con la línea de tiempo del cronograma de paradas (autocompleta proveedor y punto específico).

### `v=1.3.0` (Septiembre 2026)
- **Corrección de Precisión Numérica:**
  - Redondeo estricto a 2 decimales en el pesaje de kilogramos para evitar desfases visuales de punto flotante.

### `v=1.2.9` (Septiembre 2026)
- **Gestor Visual de Instalación PWA:**
  - Se añadieron botones visibles de instalación (`#btn-pwa-install` en la tarjeta de login y `#btn-pwa-install-header` en la barra del conductor).
  - Captura del evento `beforeinstallprompt` para activar la instalación nativa con un solo clic en Android / Chrome / Edge.
  - Mensaje guiado con instrucciones paso a paso para dispositivos iOS (iPhone / Safari) al pulsar el botón de instalación.

### `v=1.2.8` (Septiembre 2026)
- **Seguridad Inmediata de Datos (Punto 1):**
  - Eliminación definitiva del botón `#btn-clear-all` ("🗑️ Borrar Pruebas") en producción y neutralización de su listener en `app.js`, erradicando el riesgo de borrado masivo accidental de la base de datos de Firestore.
- **Limpieza y Rendimiento (Punto 3):**
  - Optimización en la carga de scripts externos de Firebase y Chart.js mediante atributos `defer` y directivas `<link rel="preconnect">`, evitando bloqueos en el hilo principal y mejorando el *First Contentful Paint* (FCP).
  - Migración exhaustiva de estilos inline (`style="..."`) desde `index.html` hacia clases semánticas estructuradas en `styles.css` (panel administrativo, banner de programación, modal del voucher digital y botones).

### `v=1.2.7` (Septiembre 2026)
- **PWA Real Instalable (Punto 1):**
  - Implementación de `manifest.json` oficial con configuración standalone, orientación portrait, color temático `#10b981` y branding ProteinAgro.
  - Generación de paquete de íconos oficiales PWA (`icons/icon-192.png`, `icons/icon-512.png`, `icons/icon.svg`, `icons/favicon.png`).
  - Creación y registro de Service Worker (`sw.js`) con estrategia *Network-First con fallback a Cache* para App Shell offline (excluyendo llamadas en tiempo real de Firebase y Google Sheets).
  - Incorporación de meta tags PWA para iOS (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`).
- **Accesibilidad y Zoom Móvil WCAG (Punto 3):**
  - Eliminación de `user-scalable=no` y `maximum-scale=1.0` en el viewport para permitir zoom manual a conductores con dificultades visuales.
  - Incorporación de `touch-action: manipulation;` en CSS para controles táctiles, eliminando retardos de toque (300ms delay) y evitando saltos indeseados.

### `v=1.2.6` (Septiembre 2026)
- **Validación Estricta de Punto de Recolección:**
  - Se bloquea la selección de cualquier producto o ingreso de kilos si el conductor no ha seleccionado previamente el Punto / Lugar de recolección.
  - Alerta visual inmediata con borde rojo pulsante (`.input-error`) y scroll automático al campo faltante.
  - Bloqueo en `+ Registrar producto` y en `Guardar Recolección`.
  - Desactivación de validación nativa silenciosa mediante `novalidate` y control 100% por JavaScript para garantizar compatibilidad móvil (iOS Safari / Android Chrome).

### `v=1.2.5` (Septiembre 2026)
- Se añadió el atributo `required` y asterisco visual `*` al selector de Punto / Lugar de recolección en [index.html](file:///g:/Mi%20unidad/Antigravity/PROTEINAGRO/index.html).
- Ajuste de opciones por defecto para evitar guardados con valor `General`.

### `v=1.2.4` (Agosto 2026)
- **Reordenamiento visual en formulario:**
  1. `Proveedor / Razón Social` (Primer campo prioritario).
  2. `Punto / Lugar de Recolección` (Segundo campo condicionado).

### `v=1.2.3` (Agosto 2026)
- Filtrado dinámico bidireccional entre la Ruta seleccionada y los Proveedores asociados.

### `v=1.2.2` (Agosto 2026)
- Consolidación del canal de envío único en `app.js` y deduplicación por `ID_Recoleccion` en `Code.gs` para prevenir inserciones duplicadas de filas en Google Sheets.

### `v=1.2.1` & `v=1.2.0` (Julio - Agosto 2026)
- Despliegue de nuevo Webhook de Google Apps Script con canal de comunicación triple GET/POST.
- Corrección de variables de teléfono y dirección en el script.

### `v=1.0.0` - `v=1.1.0` (Inicios 2026)
- Lanzamiento inicial en Vercel.
- Migración de firmas en base64 a Firebase Storage.
- Integración de Chart.js y exportación CSV en dashboard administrativo.

---

## ⚙️ 8. Guía de Despliegue y Mantenimiento

### 8.1 Despliegue en Vercel
Cualquier cambio en la rama `main` en GitHub se compila y publica automáticamente en Vercel en menos de 30 segundos:
```bash
git add .
git commit -m "Descripción del cambio"
git push origin main
```
Para forzar la actualización de caché en navegadores de los conductores, incrementar el parámetro de versión en `index.html`:
```html
<script src="app.js?v=X.X.X" defer></script>
```

### 8.2 Despliegue en Google Apps Script
1. Abrir la hoja contable `DB_App_Conductores` en Google Sheets.
2. Ir a **Extensiones** > **Apps Script**.
3. Reemplazar el código con el contenido actualizado de `Code.gs`.
4. Hacer clic en **Implementar** > **Gestionar implementaciones** > **Editar** > **Nueva versión** > **Implementar**.
5. Si la URL cambia, actualizar la constante `GOOGLE_SHEETS_WEBHOOK_URL` en la línea 14 de `app.js`.

### 8.3 Ciclo de Actualizaciones en Dispositivos Móviles (PWA)
- **Actualizaciones de Catálogos (Conductores, Rutas, Puntos):** 100% inmediatas al consultar Google Sheets en vivo con parámetro anti-caché. No requieren compilación ni descarga.
- **Actualizaciones de Código (Lógica y Diseño):** Se gestionan mediante la estrategia **Network-First** del Service Worker (`sw.js`). Al detectar una nueva versión en Vercel, el teléfono descarga los archivos modificados en segundo plano y los reemplaza automáticamente sin requerir intervención manual del conductor ni aprobaciones de tiendas de aplicaciones.
- **Modo Offline:** Si el dispositivo se encuentra sin cobertura en el momento de una actualización, continúa operando normalmente con la versión en caché hasta recuperar señal de red.

---

## 📌 9. Stand-by / Roadmap Prioritario: Módulo de Tarifas Programadas y Re-liquidación Retroactiva
> **Documento de Especificación Completo:** Consulte [`TARIFAS_PROGRAMADAS_PLAN.md`](./TARIFAS_PROGRAMADAS_PLAN.md) para ver la arquitectura técnica detallada y el checklist de ejecución paso a paso.

- **Problema que resuelve:** Evita que cambios futuros de tarifas (ej. renegociación acordada con antelación) afecten las liquidaciones del mes en curso, y elimina el riesgo de que la administración olvide actualizar la tarifa el día exacto de entrada en vigencia.
- **Mecanismo:**
  1. Columna `Vigente_Desde` en la hoja `Tarifas`.
  2. Motor de búsqueda de precios en `Code.gs` que evalúa la fecha histórica del servicio contra la fecha de vigencia.
  3. Módulo de rescate para re-liquidar automáticamente periodos específicos si se olvidó programar la tarifa a tiempo.
- **Activación:** Este requerimiento se encuentra en pausa por decisión de gerencia. Para ponerlo en marcha en cualquier momento, basta con solicitar al asistente: *"Activar el plan de tarifas programadas"* o *"Hacer lo de las tarifas en stand-by"*.

---

## 🚦 10. Sistema de Protección Anti-Duplicados y Semáforo Visual (`Duplicados.gs`)
> **Fecha de Implementación:** 01 de Octubre de 2026  
> **Archivo Asociado:** [`Duplicados.gs`](./Duplicados.gs)  
> **Objetivo:** Prevenir que la digitación manual administrativa duplique recolecciones previamente enviadas por los conductores.

- **Criterio de Duplicidad:** Coincidencia simultánea de:
  1. `Fecha` (normalizada a nivel día calendario `YYYY-MM-DD`, descartando horas).
  2. `Proveedor` (Columna E).
  3. `Materia_Producto` (Columna G).
  4. `Kg` (Columna H, comparado numéricamente).
- **Mecanismo Dual de Protección:**
  1. **Fórmulas de Hoja y Formato Condicional (Semáforo Rojo):** Columnas M (`ID_Clave`) y N (`Alerta`) con `ARRAYFORMULA` que evalúan la unicidad y colorean de rojo pastel toda la fila duplicada.
  2. **Apps Script Reactivo (`Duplicados.gs`):** Activador `onEdit(e)` que vigila la digitación manual y operaciones de copiado/pegado de filas completas, alertando a la administrativa mediante un cuadro emergente modal con los datos del registro original.
- **Inmunidad de la App Móvil:** Las peticiones desde conductores vía Webhook (`appendRow`) no activan eventos de UI (`onEdit`), garantizando cero impacto en la operación de campo.

## 📊 11. Módulo de Cierre Diario y Auditoría de Cobertura de Rutas (`v1.6.0`)
> **Fecha de Implementación:** 01 de Octubre de 2026  
> **Ubicación:** Panel Administrativo (`index.html` y `app.js`)  
> **Objetivo:** Auditar al final de la jornada el cumplimiento físico de los conductores contra la matriz programada, verificando en tiempo real que los datos hayan aterrizado directamente en la base contable de Google Sheets.

- **Mecanismo de Auditoría Directa en Google Sheets (Gviz CSV):**
  - El botón **"Generar Cierre"** no depende de cachés ni de la memoria rápida de Firebase.
  - Realiza una consulta directa e instantánea a la pestaña `Recolecciones` de Google Sheets (`DB_App_Conductores.gsheet`) vía CDN Gviz (`tqx=out:csv`).
  - Extrae y normaliza las marcas de fecha de forma numérica estricta (`día/mes/año`), garantizando total compatibilidad frente a variaciones de formato con o sin ceros a la izquierda (ej: `1/10/2026` vs `01/10/2026`).
  - Aplica comparación de texto tolerante a tildes y diacríticos (ej: *Cañaveral*, *Martínez*, *Villagorgona*) para el cruce exacto entre `Proveedor` y `Punto_Sucursal`.

- **Lógica de Cobertura y Checklist Semafórico:**
  - **Puntos Asignados a la Ruta:** Filtra la matriz matriz de 126 puntos según la ruta seleccionada.
  - **🟢 Éxito (`Auditado en Base`):** Se confirma que el conductor realizó la visita y los kilos ya están registrados y liquidados en Google Sheets. Suma positivamente al avance.
  - **🟡 Novedad (`Visita Fallida`):** Se confirma que el conductor acudió al punto pero reportó una causa justificada (establecimiento cerrado, 0 kg, etc.). Cuenta positivamente como punto cubierto de la ruta.
  - **🔴 Pendiente (`No ha llegado a la Data`):** Alerta a gerencia de que no existe ningún registro el día de hoy en Google Sheets para ese punto (fuga de ruta o registro retenido offline).
  - **Barra de Progreso Dinámica:**
    - `Verde (100%)`: Cobertura perfecta de la ruta.
    - `Naranja (80% - 99%)`: Cobertura aceptable con paradas pendientes.
    - `Rojo (< 80%)`: Incumplimiento crítico de la ruta.
  - **Consolidado de Kilos:** Muestra en tiempo real la sumatoria de todos los kilogramos recolectados en esa ruta específica durante la jornada.

## 🛡️ 12. Sistema Inteligente de Re-sincronización y Blindaje Anti-Duplicados Integral (`v1.6.2`)
> **Fecha de Implementación:** 02 de Octubre de 2026  
> **Archivos Asociados:** [`app.js`](./app.js), [`Code.gs`](./Code.gs)  
> **Objetivo:** Erradicar la duplicación accidental de recolecciones y visitas fallidas en Google Sheets al usar el botón "🔄 Re-sincronizar Sheets", garantizando que únicamente viajen registros verdaderamente pendientes y que el servidor rechace cualquier duplicidad histórica.

- **Diagnóstico del Problema Previo:**
  1. **Envío Ciego en la App Móvil/Web:** El botón `resincronizarTodoAGoogleSheets()` tomaba todos los elementos alojados en `localStorage.recolecciones_backup` (por ejemplo, 6 registros) y los re-enviaba en bucle a Google Sheets, sin validar previamente si ya estaban marcados como `sync_sheets === true` o `Sincronizado`.
  2. **Ventana Ciega de Detección en Apps Script:** En `Code.gs`, la función `guardarRecoleccionSheet()` únicamente examinaba las últimas 200 filas (`lastRowData - 200`). Al tener la base contable más de 2.000 filas y fórmulas de matriz `ARRAYFORMULA`, los registros anteriores quedaban fuera del rango de comprobación y se insertaban nuevamente, activando el semáforo `🚨 DUPLICADO` en la hoja de cálculo.

- **Solución Dual Implementada:**
  1. **Filtro Inteligente de Pendientes en Cliente ([`app.js`](./app.js)):**
     - La función inspecciona `recolecciones_backup` y filtra estrictamente los registros con `!item.sync_sheets` o `estado === 'Offline'`.
     - **Si 0 registros están pendientes:** Informa inmediatamente con alerta preventiva: *"✅ Todos los registros respaldados localmente ya están sincronizados con Google Sheets. Para evitar generar filas duplicadas, no es necesario volver a enviarlos"*, cancelando el envío redundante.
     - **Si existen registros pendientes (ej. 1 de 6):** Notifica con precisión: *"Se detectaron 1 registro(s) pendiente(s) de sincronizar (de 6 en total)"* y transmite **exclusivamente** los registros pendientes.
     - Al confirmar el webhook, actualiza `sync_sheets = true`, `sync_sheets_at = Date.now()` y `estado = 'Sincronizado'`.
  2. **Blindaje de Escaneo Total en Servidor ([`Code.gs`](./Code.gs) v1.4.2):**
     - Se eliminó la ventana restrictiva de 200 filas. Ahora lee y mapea en memoria Columna A (`ID_Recoleccion`) y Columna G (`Materia_Producto`) desde la fila 2 hasta la última fila con datos de `Recolecciones`.
     - Valida `existingRecordsMap[id + '|' + producto]` para materias primas y `existingIdsMap[id]` para novedades (`NOV-`).
     - Si un registro ya existe en Google Sheets, el servidor lo omite en el acto (`Logger.log`), retornando confirmación exitosa sin agregar filas duplicadas a la contabilidad.

## 🚀 13. Arquitectura de Auditoría en 4 Capas Anti-Fallo y Blindaje Decimal (`v1.6.4`)
> **Fecha de Implementación:** 02 de Octubre de 2026  
> **Archivos Asociados:** [`app.js`](./app.js), [`sw.js`](./sw.js), [`index.html`](./index.html), [`Code.gs`](./Code.gs)  
> **Objetivo:** Garantizar 100% de disponibilidad en la auditoría del Cierre Diario ante cualquier eventualidad de red, bloqueador de anuncios (AdBlockers / Brave Shields) o caída de servicio, y blindar el formateo numérico de kilogramos contra errores de punto flotante en JavaScript.

- **Auditoría en Cascada Multi-Capa:**
  1. **Capa 1 (Google Sheets GViz En Vivo):** Conexión directa a la hoja contable. En `sw.js`, `docs.google.com` está explícitamente excluido del interceptor del Service Worker para evitar respuestas `503 Service Unavailable`.
  2. **Capa 2 (Webhook Google Apps Script Respaldo):** Endpoint `action=getRecolecciones&fecha=YYYY-MM-DD` en `Code.gs` que consulta la hoja y devuelve JSON nativo, eludiendo restricciones de CORS y bloqueadores de rastreo.
  3. **Capa 3 (Firebase Firestore en Tiempo Real):** Consulta a la colección `recolecciones` en la nube si Google Sheets no responde por problemas de infraestructura de Google.
  4. **Capa 4 (LocalStorage Offline):** Lee `recolecciones_backup` en el dispositivo para auditar rutas incluso sin conexión a internet.
- **Badge Semafórico de Fuente en la UI:** Etiqueta dinámica que indica al usuario de dónde provienen los datos (`Google Sheets (En Vivo)`, `Google Sheets (Webhook)`, `Firestore (Nube)`, `Memoria Local (Offline)`).
- **Corrección Numérica de Kilogramos (`RangeError: maximumFractionDigits`):**
  - Se corrigió la función `formatKilosDisplay()` que fallaba cuando un número tenía más de 2 decimales o residuos de cálculo flotante (`81.60000000000001`).
  - Ahora se redondea a 2 decimales (`Math.round(num * 100) / 100`) y se acota estrictamente: `minimumFractionDigits = Math.min(2, Math.max(1, decCount))`, garantizando que jamás exceda `maximumFractionDigits: 2`.
- **Actualización Global de Versión:**
  - Actualización sincronizada de `index.html` (Login, Header Admin, Header Conductor, Footer), `app.js` (registro de SW y recarga forzada) y `sw.js` a la versión oficial **`v1.6.4`**.

## 🚀 14. Reclasificación Histórica Ruta 1: Santa Elena / Cavasa y Matriz Dinámica (`v1.6.5`)
> **Fecha de Implementación:** 05 de Octubre de 2026  
> **Archivos Asociados:** [`app.js`](./app.js), [`sw.js`](./sw.js), [`index.html`](./index.html), [`Code.gs`](./Code.gs), [`Migracion_Ruta1.gs`](./Migracion_Ruta1.gs), [`MIGRACION_RUTA1_SANTA_ELENA.md`](./MIGRACION_RUTA1_SANTA_ELENA.md)  
> **Objetivo:** Invertir y estandarizar la clasificación Proveedor <-> Punto en la Ruta 1 (Santa Elena), reclasificando 276 registros históricos de Google Sheets sin alterar pesos, montos, fechas ni registros de otras rutas.

- **Reclasificación de los 3 Puntos Clave de Santa Elena:**
  1. *Bodega Santa Elena:* Proveedor pasa a ser `Bodega Santa Elena` y Punto/Sucursal pasa a ser `Santa Elena` (192 filas históricas).
  2. *Alejandro Garay:* Proveedor pasa a ser `Alejandro Garay` y Punto/Sucursal pasa a ser `Santa Elena` (63 filas históricas).
  3. *Sevillana Santa Elena:* Proveedor pasa a ser `Sevillana Santa Elena` y Punto/Sucursal pasa a ser `Sevillana Santa Elena` (21 filas históricas).
- **Garantía Histórica Cero-Impacto:**
  - Auditadas 2.155 filas reales en Google Sheets.
  - Modificadas exactamente 276 filas de la Ruta 1.
  - 1.879 filas pertenecientes a todas las demás rutas permanecen 100% intactas.
  - Todos los datos numéricos (`Kg`, `Precio`, `Valor`), IDs y fechas permanecen inmutables.
- **Sincronización de Catálogo Offline & Web:**
  - `DEFAULT_RUTAS_DATA` y `CATALOGO_PUNTOS_RUTAS_DEFAULT` actualizados en `app.js`.
  - Service Worker e interfaz actualizados a la versión oficial **`v1.6.5`**.
- **Herramientas de Ejecución en Apps Script:**
  - `migrarRuta1_SantaElena(ss)`: Barrido atómico en memoria por bloque `getValues()` / `setValues()`.
  - Menú superior automático en hoja de cálculo: `🚀 ProteinAgro > Reclasificar Ruta 1 (Santa Elena)`.

---

*Sistema desarrollado para ProteinAgro - Optimización Tecnológica y Trazabilidad en Campo.*



