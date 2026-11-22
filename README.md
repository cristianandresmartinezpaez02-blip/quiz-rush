# ⚡ Quiz_Rush

Plataforma de quizzes en tiempo real con alma de videojuego: crea quizzes con un editor visual que se guarda solo, publícalos automáticamente en una biblioteca pública y juega en vivo con PIN o QR.

> **Estado:** Fases 1 a 8 completadas (autenticación, editor con autoguardado, Biblioteca General con comunidad, partidas en vivo con PIN/QR, 14 tipos de pregunta, 7 modos en vivo con power-ups, progreso del jugador —XP, niveles, logros, misiones, ligas, temporada, tienda y avatar— modos individuales con duelo 1 contra 1, y creación con IA, importar/exportar, plantillas, modo profe con clases, tareas, informes y certificados, y la parte social: amigos con presencia en línea, clubes, notificaciones push, app instalable, accesibilidad y panel de administración; y escalabilidad probada: 10.000 personas en la Biblioteca y 2.000 jugadores en una partida).
> Arquitectura completa y plan de fases en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) · escalado y costos en [docs/ESCALADO.md](docs/ESCALADO.md) · pruebas de carga en [docs/carga/INFORME.md](docs/carga/INFORME.md).

---

## 🚀 Puesta en marcha (local)

### Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| [Node.js](https://nodejs.org) | 22 o superior | Apps y scripts |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | reciente | PostgreSQL, PgBouncer, Redis y Mailpit |

### Instalación paso a paso

```bash
# 1. Instalar dependencias (también genera el cliente de Prisma)
npm install

# 2. Crear el archivo .env con un secreto aleatorio
npm run setup

# 3. Arrancar TODO con un solo comando:
#    Docker (Postgres + PgBouncer + Redis + Mailpit) → migraciones → web + tiempo real
npm run dev

# 4. (Opcional) Cargar datos de prueba
npm run db:seed
```

Abre **http://localhost:3000**.

| Servicio | URL |
|---|---|
| App web | http://localhost:3000 |
| Salud de la web | http://localhost:3000/health |
| Servidor de tiempo real | http://localhost:4000/health |
| Correos de desarrollo (Mailpit) | http://localhost:8025 |
| Explorador de la base de datos | `npm run db:studio` |

**Datos de prueba** (tras `npm run db:seed`): 10 quizzes públicos variados (español e inglés, 10 categorías), 5 creadores y 6 jugadores con calificaciones, favoritos, comentarios y seguidores.

| Cuenta | Rol |
|---|---|
| `demo@quizrush.dev` | Creador (cuenta demo) |
| `luna@quizrush.dev`, `cine@quizrush.dev`, `queen@quizrush.dev`, `explora@quizrush.dev` | Creadores |
| `sofi@quizrush.dev`, `leogamer@quizrush.dev`, `maxpower@quizrush.dev`… | Jugadores |
| `admin@quizrush.dev` | Administración (panel **/admin**) |

Todas usan la contraseña `QuizRush123!`.

### Inicio de sesión con Google (opcional)

1. Crea credenciales OAuth en [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. URI de redirección autorizada: `http://localhost:3000/api/auth/callback/google`.
3. Rellena `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`. Sin ellas, el botón de Google se oculta.

---

## 🧰 Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Infraestructura + migraciones + todas las apps en modo desarrollo |
| `npm run dev:apps` | Solo las apps (si Docker ya está arriba) |
| `npm run build` | Build de producción de todas las apps |
| `npm test` | Pruebas unitarias + integración del servidor de tiempo real (requiere `npm run infra:up`) |
| `npm run typecheck` | Verificación de tipos en todo el monorepo |
| `npm run lint` | ESLint en todo el monorepo |
| `npm run format` | Prettier |
| `npm run db:migrate` | Crear una nueva migración (desarrollo) |
| `npm run db:deploy` | Aplicar migraciones pendientes |
| `npm run db:seed` | Datos de prueba (idempotente) |
| `npm run infra:down` | Detener los contenedores |
| `node scripts/smoke-phase1.mjs` | Prueba de humo: autenticación, editor y autoguardado (34 comprobaciones) |
| `node scripts/smoke-phase2.mjs` | Prueba de humo: biblioteca, búsqueda y comunidad (47 comprobaciones) |
| `node e2e/screenshots.mjs` | Flujo real del editor en navegador (Playwright) + capturas |
| `node e2e/screenshots-phase2.mjs` | Flujo real de biblioteca y comunidad en navegador + capturas |
| `node scripts/smoke-phase3.mjs` | Prueba de humo: partida en vivo con autenticación JWT real (17 comprobaciones) |
| `node e2e/screenshots-phase3.mjs` | Partida completa en navegadores reales: anfitrión, 2 jugadores y proyector |
| `node scripts/smoke-phase4.mjs` | Prueba de humo: los 14 tipos en modo Jefe final, power-ups, votación y dibujo (≈35 comprobaciones) |
| `node e2e/screenshots-phase4.mjs` | Editor de los tipos nuevos + partida completa de los 14 tipos en navegadores reales |
| `node scripts/generate-sounds.mjs` | Regenera los efectos y la música del juego (síntesis, audio original) |
| `node scripts/generate-demo-assets.mjs` | Regenera el audio del quiz de demostración (`public/demo/pitidos.wav`) |
| `node scripts/smoke-phase5.mjs` | Prueba de humo: progreso, modos individuales, desafíos, tienda, avatar, misiones y temporada (≈45 comprobaciones) |
| `node scripts/smoke-phase8.mjs` | Prueba de humo: worker y trabajos internos, métricas, caché con versión, rankings en Redis, límites por IP y buscador externo |
| `node scripts/loadtest-game.mjs 2000` | Carga de una partida en vivo (2.000 jugadores; `RT_URLS=` para varias instancias) |
| `node loadtest/biblioteca-node.mjs 10000` | Carga de la Biblioteca (10.000 personas; `BASES=` para varias réplicas). Con k6: `loadtest/biblioteca.js` |
| `npm run search:up` / `npm run search:reindex` | Arranca Meilisearch (opcional) y lo llena con los quizzes publicados |
| `node scripts/smoke-phase7.mjs` | Prueba de humo: amigos, bloqueos, presencia, invitaciones, clubes, push, compartir, PWA, accesibilidad y administración (≈70 comprobaciones) |
| `node e2e/screenshots-phase7.mjs` | Amigos, clubes, notificaciones, ajustes, compartir, sin conexión y administración en el navegador + **auditoría de accesibilidad (axe)** |
| `npm run admin:grant -- correo` | Da el rol de administración a una cuenta (`--quitar` para retirarlo) |
| `node scripts/generate-pwa-icons.mjs` | Regenera los iconos de la app instalable desde `public/icon.svg` |
| `node scripts/smoke-phase6.mjs` | Prueba de humo (con `AI_MOCK=1`): IA, ayudas, plantillas, importar/exportar, clases, tareas, informes y certificados (≈46 comprobaciones) |
| `node e2e/screenshots-phase6.mjs` | Crear con IA, importar, clase de profe y estudiante, tarea, informe y certificado en el navegador |
| `node e2e/screenshots-phase5.mjs` | Progreso, tienda, Rush, práctica, aventura, reto diario, desafío y un duelo real entre dos jugadores en el navegador |

> Las pruebas de humo limpian lo que crean. Better Auth limita a 5 registros por minuto e IP: espera 1 minuto entre ejecuciones de `smoke-phase1`.

---

## 🗂️ Estructura del monorepo

```
apps/
  web/        Next.js 16 (App Router): interfaz, API REST, autenticación
  realtime/   Servidor Socket.IO con adaptador de Redis (partidas en vivo, Fase 3)
  worker/     Trabajos en segundo plano con BullMQ (push, moderación, tendencia, ligas… Fase 8)
packages/
  shared/     Código común: esquemas Zod, 14 tipos de pregunta, puntajes, moderación
  db/         Prisma 7: esquema (todo el modelo de datos), migraciones y seed
docs/         Arquitectura y decisiones
scripts/      Utilidades (setup, pruebas de humo, prueba de carga de partidas)
loadtest/     Pruebas de carga de la Biblioteca (k6 y generador en Node)
e2e/          Pruebas en navegador con Playwright
```

## 🏗️ Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Motion (Framer Motion) · Zustand + Immer · dnd-kit · next-intl (es/en) · Better Auth (email, enlace mágico, Google, invitado) · Prisma 7 + PostgreSQL 17 · PgBouncer · Redis 7 · Socket.IO · Vitest · Playwright.

---

## 📚 Biblioteca General

- **Búsqueda instantánea** con la búsqueda full-text de PostgreSQL: columna `tsvector` generada (título > etiquetas > descripción), índice GIN, insensible a tildes (`unaccent`) y con prefijos ("capi" → *Capitales*).
- **Tolerancia a errores de escritura** con trigramas (`pg_trgm`, `word_similarity`): "sistma solr" encuentra *Sistema Solar*.
- **Filtros** por categoría, idioma, dificultad, duración y tipo de pregunta; **orden** por tendencia, más jugados, mejor calificados (media bayesiana) o nuevos.
- **Paginación por cursor** (keyset) en todas las listas: cada página cuesta lo mismo, sin `OFFSET`.
- **Secciones tipo Netflix:** reto del día, en tendencia, para ti (según tus favoritos, notas y partidas), nuevos esta semana, mejor calificados, más jugados y creadores destacados. Las secciones se cachean en Redis.
- **Comunidad:** calificar, comentar (con respuestas y "me gusta"), favoritos, colecciones públicas o privadas, remix con crédito al autor, compartir (enlace, QR, redes y menú nativo del móvil), reportar (un contenido con 5 reportes se oculta solo hasta que lo revise un admin) y seguir creadores.
- Al publicar, los seguidores reciben una **notificación**. El envío se hace en lotes de 1.000 después de responder, con `after()` de Next.

## 🎮 Partidas en vivo

1. En la página de un quiz (o en *Mis quizzes*) pulsa **Organizar partida**: se abre la pantalla del anfitrión con el **PIN** y un **código QR**.
2. Los jugadores entran desde el celular en **/jugar** (o escaneando el QR), eligen apodo y personaje. No necesitan cuenta; si la tienen, la partida suma a sus estadísticas.
3. Proyecta la pantalla del anfitrión (o abre la **pantalla de proyector** en otra ventana y controla desde el portátil). Atajos: `Espacio` / `Enter` / `→` para avanzar.

**Cómo funciona por dentro** (`apps/realtime`):

- **El servidor es la única autoridad:** mide el tiempo desde que abre cada pregunta y calcula los puntos; el cliente nunca envía su puntaje y la respuesta correcta nunca sale del servidor antes de revelarla.
- **Estado en Redis**, no en memoria. Cada respuesta se registra con un **script Lua atómico**: sin dobles respuestas, racha y puntaje consistentes aunque respondan 2.000 jugadores a la vez.
- **Varias instancias:** el adaptador de Redis de Socket.IO comparte salas. La instancia "dueña" lleva los temporizadores con una propiedad que caduca; si se cae, otra **retoma la partida** (probado en `apps/realtime/test/failover.test.ts`).
- **Mensajes compactos:** el contador de respuestas se envía agrupado cada 500 ms; las reacciones, cada 300 ms y con un máximo de 1 cada 1,5 s por jugador. Cada instancia entrega los resultados personales a **sus** jugadores conectados (no 2.000 mensajes por Redis).
- **Reconexión:** el celular guarda un token; si recarga o pierde la conexión vuelve con sus puntos. Los reintentos usan espera progresiva con *jitter* (1 s → 10 s).
- **Guardado en lote:** las respuestas de cada pregunta se insertan juntas al cerrarla; los resultados finales, con un único `UPDATE … FROM unnest()`.
- **Autenticación:** la web emite un JWT de 15 minutos (`/api/auth/token`); el servidor de tiempo real lo verifica con las claves públicas (JWKS), sin consultar la base de datos.
- **Límites de frecuencia:** 10 eventos/s por socket (ráfaga de 20; el dibujo tiene su propia cubeta). Si se supera, el evento recibe `RATE_LIMITED` en su confirmación. Entradas por IP: `JOIN_RATE_PER_MIN` (120 por defecto, pensado para colegios que salen por una sola IP).

### Tipos de pregunta (14)

Opción múltiple, verdadero/falso, respuesta escrita, **ordenar**, **emparejar**, **deslizador**, **pin en imagen**, **completar espacios**, **audio**, **imagen revelada**, encuesta, **nube de palabras**, **pregunta abierta con votación** y **dibujo rápido**. Todos se configuran en el editor sobre la vista previa. El seed incluye el quiz *«Tour de Quiz_Rush: los 14 tipos de pregunta»* con recursos originales en `apps/web/public/demo/`.

- El servidor nunca envía la respuesta: en *ordenar* los elementos llegan desordenados y en *emparejar* los de la derecha llevan un **token aleatorio por partida**.
- *Deslizador* y *pin* dan crédito parcial por cercanía; *ordenar*, *emparejar* y *completar* por elemento correcto.
- *Nube* y *abierta* filtran palabras ofensivas; la abierta pasa a una **votación anónima** (no se puede votar la propia).
- *Dibujo*: un jugador al azar ve la palabra secreta y dibuja; los trazos (coordenadas 0–1000) llegan en vivo a la pantalla y a los demás, que pueden adivinar varias veces. Quien dibuja gana 100 puntos por acierto (máx. 1.000).

### Modos de juego

| Modo | Cómo funciona |
|---|---|
| ⚡ Clásico | Todos contra todos |
| 🤝 Equipos | 2–4 equipos de colores con mascota; tiempo para hablar antes de cada pregunta; el puntaje del equipo es la **media** de sus miembros (justo con equipos desiguales) |
| ❤️ Supervivencia | 1–5 vidas; cada fallo resta una; termina cuando queda un superviviente |
| 🏎️ Carrera | Cada acierto avanza el vehículo hacia la meta |
| 🐉 Jefe final | Toda la clase contra un dragón: los aciertos le quitan vida y los fallos lo curan |
| ⚔️ Torneo | Duelos 1 contra 1 por rondas (con *byes*) hasta el campeón |
| 🗺️ Conquista | Los equipos pintan un mapa de 12×7 casillas según su puntaje |

**Power-ups** (3 al azar por jugador, un uso cada uno, antes de responder): 50/50, puntos dobles, +10 s, escudo (no pierdes la racha), segunda oportunidad y pista. El servidor valida y aplica todos los efectos.

## 🏆 Progreso del jugador

- **XP y niveles** (curva suave: subir del nivel *L* al siguiente cuesta 100 + 25·(*L*−1) XP) y **rangos** por nivel: Bronce, Plata (10), Oro (20), Diamante (35) y Leyenda (50).
- **Monedas** que solo se ganan jugando (no hay dinero real). Cada cambio de saldo queda en un libro contable (`CoinTransaction`).
- **Racha diaria**: la primera partida de cada día suma un día y da un bono creciente (hasta 7 días). La zona horaria se configura con `PROGRESS_TIMEZONE` (por defecto `America/Bogota`).
- **37 logros** (algunos secretos) y **misiones**: 3 diarias y 3 semanales por jugador, elegidas de forma determinista. Se cobran desde **/progreso**.
- **Liga semanal**: grupos de hasta 30 jugadores por división; los 5 primeros suben y los 5 últimos bajan. La semana anterior se cierra sola (como mucho una vez cada 10 minutos) con premios en monedas.
- **Pase de temporada** gratuito de 30 niveles, con monedas y artículos exclusivos.
- **Tienda y avatar** (**/tienda**): personaje original por capas (cuerpo, ojos, boca, sombrero, ropa y marco) y celebraciones al ganar. El servidor solo deja usar piezas gratuitas o compradas.

**Garantías del motor** (`packages/db/src/progress`): cada recompensa se paga una sola vez (tabla `RewardLog` con clave única), el perfil se bloquea durante la transacción (dos partidas que terminan a la vez no se pisan) y los catálogos (logros, misiones, tienda, temporada) se sincronizan solos desde `packages/shared`. Las partidas en vivo dan XP a quienes juegan con cuenta al terminar.

## 🎯 Modos individuales (**/solo**)

| Modo | Cómo funciona |
|---|---|
| 🎯 Práctica | Cualquier quiz, sin presión de tiempo y con la solución y la explicación tras cada pregunta |
| ⚡ Rush | 60 segundos; 1 punto por acierto y cada fallo resta 3 s. Ranking del día y récord personal |
| ☀️ Reto diario | El mismo quiz para todos hoy, un intento, ranking del día |
| 🔗 Desafío por enlace | Desde la página de un quiz: el quiz queda congelado y cada amigo tiene un intento (1–7 días) |
| 🗺️ Aventura | 4 mundos × 6 niveles de 5 preguntas; 1–3 estrellas desbloquean el siguiente |
| 🔁 Repaso inteligente | Las preguntas falladas vuelven con repetición espaciada (SM-2) |
| ⚔️ Duelo 1 vs 1 | En tiempo real: rival al azar, amigo con código de 4 cifras o RushBot si nadie aparece en 12 s. Un ❄️ congela al rival 3 s |

Igual que en vivo, **el servidor corrige y mide el tiempo**: el navegador nunca recibe la respuesta antes de contestar. Las partidas individuales viven en Redis mientras se juegan y se guardan en PostgreSQL al terminar.

## ✨ Crear con IA, importar y plantillas

| Cómo | Dónde | Notas |
|---|---|---|
| 🤖 **Generador con IA** | **/crear/ia** | A partir de un tema, un texto (≥ 200 caracteres), un PDF, un enlace o una foto. Eliges número de preguntas (3–20), dificultad, tipos e idioma. El resultado se abre en el editor como borrador para revisarlo |
| 💡 **Ayudas en el editor** | Editor | «Sugerir opciones incorrectas» (opción múltiple) y «Escribir explicación con IA» |
| 🧩 **Plantillas** | Mis quizzes → *Desde plantilla* | Repaso, rompehielos, encuesta, examen, cumpleaños y feedback |
| 📥 **Importar** | Mis quizzes → *Importar* | Excel (.xlsx) o CSV, una pregunta por fila. Descarga la plantilla para ver las columnas. Las filas con errores se informan y se saltan |
| 📤 **Exportar** | Menú ⋮ de cada quiz | Excel o CSV con el mismo formato (ida y vuelta sin pérdidas) |

**Configurar la IA** (Claude, de Anthropic) en `.env`:

| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Clave del API. **Sin ella la IA queda desactivada** y la interfaz lo explica |
| `AI_MODEL` | Modelo (por defecto `claude-opus-5-5`) |
| `AI_MOCK=1` | Modo simulado: respuestas de ejemplo sin llamar al API (pruebas y demos) |
| `AI_DAILY_GENERATIONS` / `AI_DAILY_ASSISTS` | Límite diario por usuario (20 generaciones / 100 ayudas) |

**Seguridad:** a la IA solo se envía el contenido del quiz o del material, nunca el nombre ni el correo. El texto del material se trata como datos (no puede dar órdenes a la IA). Los enlaces se descargan con protección SSRF (sin IP privadas ni locales, máximo 3 redirecciones, 10 s y 2 MB). Al exportar a CSV/Excel se neutralizan las fórmulas (`=`, `+`, `@`…) para que no se ejecuten al abrir el archivo.

**Moderación automática:** los quizzes publicados pasan por una revisión con IA (en lotes de 5, como mucho cada 2 minutos y solo cuando llevan 2 minutos sin editarse, para no gastar en cada autoguardado). Si se bloquea, el quiz se oculta de la Biblioteca y su autor recibe un aviso; los dudosos quedan marcados para revisión humana.

## 🏫 Modo profe: clases, tareas, informes y certificados

1. **Clase** (**/clases**): el profe crea una clase y comparte el código de 6 caracteres o el enlace `/clases/unirse?code=…`. Puede generar un código nuevo y quitar estudiantes.
2. **Tarea**: un quiz (propio o de la Biblioteca) con fecha límite, intentos (1–5), nota mínima, certificado opcional y si cuenta la velocidad. Las preguntas se **congelan al crear la tarea**, así los resultados son comparables aunque el quiz cambie. Los estudiantes reciben una notificación.
3. **Jugar**: el estudiante la juega como partida individual (el servidor corrige). Si cierra la pestaña, retoma el mismo intento.
4. **Informe** (solo el profe): entregas, media, aprobados, mejor intento por estudiante y aciertos por pregunta (las difíciles en rojo). Se descarga en Excel o CSV.
5. **Certificado**: si aprueba, el estudiante obtiene un certificado imprimible en `/certificado/<id>` con un código de verificación `QR-XXXX-XXX`.

Las partidas en vivo que diriges tienen también su informe en **/informes** (clasificación y aciertos por pregunta, descargable).

---

## 🫂 Amigos, clubes y notificaciones

- **Amigos** (**/amigos**): solicitudes (aceptar, rechazar, cancelar), quitar y **bloquear** (quien bloquea deja de existir para la otra persona: ni solicitudes ni búsqueda). Cada perfil tiene su botón «Añadir amigo».
- **Presencia en línea**: el navegador envía un latido cada 45 s y se guarda en Redis con caducidad (sin escribir en PostgreSQL en cada latido). Los amigos ven el punto verde y qué haces (jugando en vivo, dirigiendo, jugando solo, creando). Se puede ocultar en Ajustes → Privacidad.
- **Invitar a una partida**: en la sala de espera, «Invitar amigos» manda un aviso (y un push) con el PIN.
- **Clubes** (**/clubes**): públicos o privados (con código de invitación). Cada partida que juegan sus miembros suma su XP al ranking del club. Roles fundador, admin y miembro; los quizzes favoritos del club.
- **Notificaciones** (**/notificaciones**): todas las notificaciones y el interruptor de **push** de cada dispositivo. Sin `VAPID_*` en `.env` el push no aparece (`npm run setup` genera las claves).
- **Compartir resultados**: al terminar una partida, «Compartir resultado» abre el menú del móvil con una imagen generada en el servidor (o copia el enlace `/resultado/<id>`, que muestra la misma tarjeta en las redes).

## 📲 App instalable (PWA)

Manifiesto con iconos (también «maskable» para Android) y accesos directos, y un *service worker* (`public/sw.js`) que:
- muestra **/sin-conexion** cuando no hay red (la página y sus estilos se guardan al instalar),
- guarda en caché los archivos estáticos con hash en producción (en desarrollo no, para no romper la recarga en caliente),
- recibe las notificaciones push y abre el enlace al tocarlas.

Los iconos se regeneran con `node scripts/generate-pwa-icons.mjs`.

## ♿ Accesibilidad

- **Ajustes → Accesibilidad**: reducir animaciones, alto contraste, **tamaño del texto** (normal, grande, muy grande), **tiempo extra** (también en los modos individuales, salvo el Rush) y sonido.
- **Teclado**: las teclas 1-6 eligen la respuesta y Enter envía una selección múltiple; foco siempre visible; enlace «Saltar al contenido».
- **Colores**: todos los textos sobre rosa o rojo cumplen el contraste WCAG AA (en oscuro, texto en tinta oscura). Las respuestas siempre llevan forma e icono, no solo color.
- **Auditoría automática**: `node e2e/screenshots-phase7.mjs` pasa **axe** (WCAG 2.1 A/AA) por las páginas principales y falla si hay problemas graves.

## 🛠️ Administración (**/admin**)

Solo para cuentas con rol `admin` (para el resto la página no existe). Resumen de métricas, **reportes** agrupados por contenido (ocultar, restaurar, bloquear al autor o descartar), **cola de moderación** (lo que marcó la IA o los reportes), **personas** (bloquear al instante y cambiar rol) y **uso de la IA** (llamadas y tokens por día).

- Cuenta de desarrollo: `admin@quizrush.dev` (tras `npm run db:seed`).
- En producción: `npm run admin:grant -- persona@correo.com` (o `--quitar`).
- El rol y el bloqueo se comprueban en cada petición: la sesión en caché (cookie de 5 min) no da acceso a quien se bloqueó.

---

## 📈 Escalabilidad (Fase 8)

- **Worker** (`apps/worker`, BullMQ): ejecuta los trabajos de fondo aunque nadie use la web —push cada 10 s, moderación con IA cada 2 min, tendencia cada 10 min, cierre de ligas cada hora, limpieza diaria— y los puntuales (avisos a seguidores por lotes de 1.000, índice de búsqueda), con reintentos. Llama a rutas internas de la web protegidas con `JOBS_SECRET`. **Es opcional**: si no está en marcha, la web hace esas tareas tras responder.
- **Caché de páginas para visitantes sin sesión** (`apps/web/proxy.ts`): la portada, la Biblioteca y las fichas de quiz se guardan 30 s en Redis (y 3 s en memoria). Una réplica pasa de ~40 a ~760 páginas de Biblioteca por segundo. Con sesión nunca se usa.
- **Cachés con versión y sin estampidas**: las búsquedas de la Biblioteca se guardan 60 s; publicar, ocultar o borrar un quiz (y recalcular la tendencia) sube la versión y todo se renueva a la vez. Si muchas peticiones piden lo mismo, solo una consulta la base de datos.
- **Rankings en Redis** (Sorted Sets) para el Rush, el reto diario y los desafíos; se reconstruyen solos desde PostgreSQL si Redis los pierde.
- **Meilisearch opcional** (`MEILI_URL`): búsquedas con texto más tolerantes y rápidas. Si cae, la búsqueda vuelve sola a PostgreSQL durante 30 s.
- **Métricas Prometheus** (`/metrics` del tiempo real y del worker; `/api/metrics` de la web con `METRICS_TOKEN`) y **Sentry** opcional (`SENTRY_DSN`), sin datos personales.
- **IP de confianza** (`CLIENT_IP_HEADER`): los límites de peticiones solo usan la cabecera que pone el balanceador; cambiar `X-Forwarded-For` ya no permite saltárselos.
- Resultados medidos y cuántas réplicas hacen falta: [docs/carga/INFORME.md](docs/carga/INFORME.md) y [docs/ESCALADO.md](docs/ESCALADO.md).

## 💾 Cómo funciona el autoguardado

El editor garantiza que **nunca se pierde nada**:

1. **Cada 2 segundos**, si hay cambios, se envían al servidor (`PUT /api/quizzes/:id`).
2. **Cada cambio se copia al instante en el navegador** (localStorage). Si se va la conexión o se cierra la pestaña, al volver se recupera.
3. **Al cambiar de pestaña** se guarda en el momento; **al cerrarla** se hace un último envío con `keepalive`.
4. **Control de concurrencia:** si el quiz se editó en otra pestaña o dispositivo, el servidor responde `409` y el editor pregunta qué versión conservar.

**Publicación automática:** cuando el borrador es válido (título + todas las preguntas completas), el quiz pasa solo a la Biblioteca General. Si después se edita y queda incompleto, la versión publicada **no se rompe**: el borrador se guarda aparte (`Quiz.draft`) y la biblioteca sigue mostrando la última versión válida hasta que se corrija.

**Versiones:** se crea una instantánea automática como máximo cada minuto, al publicar y antes de restaurar. Se pueden guardar versiones manuales y restaurar cualquiera.

---

## 🩺 Problemas frecuentes en desarrollo

- **Bucle de recargas en desarrollo** (la página se recarga sin parar o faltan textos recién añadidos): la caché de desarrollo quedó desfasada, normalmente tras cerrar el servidor de golpe o tras cambios grandes. Detén `npm run dev`, borra `apps/web/.next-dev` y vuelve a arrancar.
- **Docker no responde** (`failed to connect to the docker API`): abre Docker Desktop y espera a que termine de arrancar.

## 🐳 Despliegue

| Pieza | Dónde | Cómo |
|---|---|---|
| Web (Next.js) | **Vercel** (recomendado) o contenedor | En Vercel: *Root Directory* `apps/web`. En contenedor: `docker build -f apps/web/Dockerfile .` |
| Tiempo real | **Railway / Render / Fly.io** | `docker build -f apps/realtime/Dockerfile .` — varias réplicas detrás de un balanceador con *sticky sessions* (necesarias para el transporte de *polling*). Variables: `REDIS_URL`, `DATABASE_URL`, `BETTER_AUTH_URL` (URL pública de la web) y, si la web es accesible por red interna, `REALTIME_JWKS_URL` |
| PostgreSQL | Neon, Supabase, RDS… | Usa la URL del *pooler* en `DATABASE_URL` y la directa en `DIRECT_DATABASE_URL` |
| Worker | Railway / Render / Fly.io (opcional) | `docker build -f apps/worker/Dockerfile .` — Variables: `REDIS_URL`, `JOBS_SECRET` (el mismo que la web) y `WEB_INTERNAL_URL` |
| Redis | Upstash, Railway, ElastiCache… | `REDIS_URL` |
| Archivos | Cloudinary | `CLOUDINARY_*` (CDN y WebP/AVIF automáticos) |

Antes de cada despliegue: `npm run db:deploy` con `DIRECT_DATABASE_URL` apuntando a producción (tras la migración `trgm_threshold`, reinicia PgBouncer). Réplicas necesarias, costos y métricas a vigilar: [docs/ESCALADO.md](docs/ESCALADO.md).

Variables de entorno: ver [.env.example](.env.example) (todas comentadas).
