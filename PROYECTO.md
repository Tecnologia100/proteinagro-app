# 🌿 Sistema Digital de Recolección Materia Prima - ProteinAgro
> **Documento Integral del Proyecto en Markdown**  
> **Versión Actual:** `v=1.2.9`  
> **Última Actualización:** Septiembre 2026  
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

### `v=1.2.9` (Septiembre 2026) - Versión Actual
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

*Sistema desarrollado para ProteinAgro - Optimización Tecnológica y Trazabilidad en Campo.*
