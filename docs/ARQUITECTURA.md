# ⚡ Quiz_Rush — Arquitectura, estructura y diseño de pantallas

> Documento de la Fase 0. Define las decisiones técnicas antes de escribir código.
> Todo lo que aparece aquí se construirá por fases (ver sección 9).

---

## 1. Decisiones clave del stack

| Área | Elección | Por qué |
|---|---|---|
| Monorepo | **npm workspaces + Turborepo** (Prisma 7, TypeScript 6) | npm viene con Node (no requiere instalar pnpm); Turbo cachea builds y corre `dev` de todas las apps con un solo comando. |
| Frontend + API | **Next.js 16 (App Router) + TypeScript** | Route Handlers (`/api/*`) y Server Actions como API principal; ISR para la biblioteca pública. |
| Estilos / animación | **TailwindCSS 4 + Motion (Framer Motion)** | Tokens de diseño en CSS variables (modo claro/oscuro), animaciones declarativas. |
| Estado cliente | **Zustand** | Store del editor, store de partida y preferencias (sonido, reducir animaciones). |
| Tiempo real | **Servidor Socket.IO aparte (`apps/realtime`)** + `@socket.io/redis-adapter` | Escala separado del API; varias instancias comparten salas vía Redis. Se descarta Supabase Realtime porque necesitamos lógica de juego autoritativa en servidor. |
| Base de datos | **PostgreSQL 16 + Prisma** (+ PgBouncer) | Relacional, búsqueda full-text nativa, réplicas de lectura. |
| Autenticación | **Better Auth** con adaptador Prisma | Email + contraseña, enlace mágico, Google y **modo invitado nativo** (plugin `anonymous`: al registrarse conserva sus quizzes). Plugin `jwt` para que el servidor de sockets valide tokens sin consultar la BD. *Se eligió en lugar de Auth.js porque su v5 sigue en beta.* |
| Búsqueda | **PostgreSQL full-text** (`tsvector` + `unaccent` + GIN, `pg_trgm` para tolerancia a errores) | Sin infraestructura extra al inicio. Interfaz `SearchProvider` para cambiar a **Meilisearch** en la Fase 8 sin tocar la UI. |
| Caché / estado de partidas | **Redis 7** | Estado de partidas, rankings (Sorted Sets), caché, rate limiting, colas. |
| Colas | **BullMQ (`apps/worker`)** | IA, reportes, notificaciones, ligas, guardado en lote de respuestas. |
| Archivos | **Cloudinary** (prod) / disco local (dev sin claves) | Transformaciones automáticas a WebP/AVIF y CDN incluido. Interfaz `StorageProvider`. |
| IA | **API de Claude** (modelo configurable por variable de entorno) | Generación de quizzes, distractores, explicaciones y moderación. Si no hay clave, la función se desactiva con elegancia. |
| Sonido / efectos | Howler.js · canvas-confetti · Recharts | Según lo pedido. |
| Validación | **Zod** en `packages/shared` | Los mismos esquemas en frontend, API y sockets. |
| i18n | **next-intl** (es / en) | Diccionarios JSON; preparado para más idiomas. |
| PWA | Manifest + Service Worker (Serwist) + Web Push | Instalable, offline básico, notificaciones push. |
| Pruebas | **Vitest** (lógica) · **Playwright** (flujos e2e) · **k6** (carga) | |
| Observabilidad | **pino** (logs JSON) · **prom-client** (`/metrics`) · **Sentry** | |
| Despliegue | Web → **Vercel** · Realtime + Worker → **Railway/Render** (Docker) · Postgres/Redis gestionados | |

---

## 2. Diagrama de arquitectura

```
                         ┌──────────────────── CDN (Vercel Edge / Cloudinary) ───────────────────┐
                         │  estáticos, imágenes WebP/AVIF, audio, páginas ISR de la biblioteca    │
                         └───────────────▲───────────────────────────────▲───────────────────────┘
                                         │                               │
  📱 Jugador / 🖥️ Anfitrión ──HTTPS──► ┌─┴──────────────────────┐       │
        (Next.js PWA)                  │  apps/web  (Next.js)   │ ×N réplicas sin estado
                                       │  UI + API + Auth.js    │
        ──── WebSocket (wss) ───┐      └──┬─────────┬────────┬──┘
                                │         │ escribe │ lee    │ encola
                                ▼         ▼         ▼        ▼
              ┌──────────────────────┐ ┌─────────┐ ┌──────────────┐  ┌──────────────────┐
              │ apps/realtime        │ │PgBouncer│ │ Réplica(s)   │  │ Redis             │
              │ Socket.IO ×N réplicas│ │    │    │ │ de lectura   │  │ • estado partidas │
              │ (balanceador sticky) │ │    ▼    │ │ (biblioteca, │  │ • adapter pub/sub │
              │ • valida JWT         │ │ Postgres│─┤  rankings)   │  │ • rankings ZSET   │
              │ • lógica de juego    │ │ primary │ └──────────────┘  │ • caché           │
              │ • reloj autoritativo │ └────▲────┘                   │ • rate limit      │
              └─────────┬────────────┘      │                        │ • colas BullMQ    │
                        │  pub/sub + estado │                        └───────▲───────────┘
                        └───────────────────┼────────────────────────────────┘
                                            │
                                 ┌──────────┴───────────┐        ┌────────────────────┐
                                 │ apps/worker (BullMQ) │──────► │ Claude API / Email │
                                 │ IA · reportes · push │        │ Web Push / Sentry  │
                                 │ ligas · lotes de     │        └────────────────────┘
                                 │ respuestas · ranking │
                                 └──────────────────────┘
```

### Flujo de una partida en vivo (resumen)
1. El anfitrión crea la partida → `POST /api/games` guarda `GameSession` en Postgres con una copia **congelada** del quiz publicado. Al conectarse el anfitrión, el servidor de tiempo real prepara el estado en Redis (`g:{id}:*`, idempotente) y reserva un PIN único de 6 dígitos con `SET NX` (`pin:{pin} → gameId`). *Así el formato del estado en Redis lo conoce un solo servicio.*
2. Jugadores entran por PIN/QR → socket `join` con token (cuenta o invitado). El servidor guarda `game:{id}:players` (hash) y devuelve un `reconnectToken`.
3. Al lanzar una pregunta, el servidor registra `startedAt` (reloj del servidor) y envía **solo** el contenido de la pregunta (nunca la respuesta correcta).
4. Cada respuesta se corrige en Node (`packages/shared/game/grading`) y se registra con un **script Lua atómico** en Redis: comprueba que la pregunta siga abierta y el plazo, evita la doble respuesta, actualiza racha, bono, puntaje (ZSET), distribución y respuesta más rápida.
5. Cada **500 ms** se emite al anfitrión el contador agregado de respuestas (no una emisión por respuesta).
6. Al cerrar la pregunta (cambio de fase atómico "compara y cambia"): se revela la respuesta, cada instancia entrega a **sus** jugadores conectados su resultado y posición, y las `PlayerAnswer` se guardan en lote en Postgres desde el tiempo real. *(Se valoró pasarlo a BullMQ en la Fase 8; la prueba con 2.000 jugadores mostró que no hace falta a esa escala: ver ESCALADO.md §7.)*
7. Si la instancia que "dirige" la partida cae, la propiedad `g:{id}:owner` (TTL de 5 s renovado cada 2 s) caduca y el barrendero de otra instancia retoma los temporizadores desde el estado en Redis (cubierto por `apps/realtime/test/failover.test.ts`).

---

## 3. Estructura de carpetas

```
quiz_rush/
├── apps/
│   ├── web/                         # Next.js: UI, API, Auth, PWA
│   │   ├── app/
│   │   │   ├── [locale]/
│   │   │   │   ├── (marketing)/page.tsx          # Landing
│   │   │   │   ├── (auth)/login, registro
│   │   │   │   ├── biblioteca/                   # Biblioteca (ISR) + /[slug] detalle
│   │   │   │   ├── crear/[quizId]/               # Editor con autoguardado
│   │   │   │   ├── jugar/                        # Unirse con PIN, controlador del jugador
│   │   │   │   ├── host/[gameId]/                # Pantalla de anfitrión / proyector
│   │   │   │   ├── practica/, rush/, duelo/, reto-diario/, aventura/, repaso/
│   │   │   │   ├── perfil/[username]/, tienda/, logros/, ligas/
│   │   │   │   ├── clases/, reportes/, admin/
│   │   │   │   └── layout.tsx
│   │   │   ├── api/                              # Route Handlers REST
│   │   │   └── health/route.ts
│   │   ├── components/
│   │   │   ├── ui/                  # Botón, Card, Modal, Toast, etc.
│   │   │   ├── game/                # Countdown, AnswerGrid, Leaderboard, Podium…
│   │   │   ├── questions/           # Un componente por tipo de pregunta (jugar + editar)
│   │   │   ├── editor/              # Paneles, autoguardado, drag & drop
│   │   │   └── library/             # Tarjetas, carruseles, filtros
│   │   ├── stores/                  # Zustand
│   │   ├── lib/                     # auth, db, redis, cache, search, storage, ai, ratelimit
│   │   ├── messages/es.json, en.json
│   │   ├── public/ (icons, sounds, manifest)
│   │   └── Dockerfile
│   ├── realtime/                    # Servidor Socket.IO
│   │   ├── src/
│   │   │   ├── index.ts             # Arranque, /health, /metrics
│   │   │   ├── auth.ts              # Valida JWT de Auth.js
│   │   │   ├── game/                # engine.ts, timer.ts, modes/*, state.ts (Redis), lua/*
│   │   │   ├── handlers/            # host.ts, player.ts, reactions.ts
│   │   │   └── ratelimit.ts
│   │   ├── test/
│   │   └── Dockerfile
│   └── worker/                      # BullMQ
│       ├── src/jobs/                # ai-generate, persist-answers, reports, notifications, leagues
│       └── Dockerfile
├── packages/
│   ├── shared/                      # Código común (sin dependencias de Node/DOM)
│   │   ├── src/scoring/             # Cálculo de puntajes por tipo de pregunta (+ tests)
│   │   ├── src/questions/           # Definición y esquemas Zod de los 14 tipos
│   │   ├── src/socket-events.ts     # Contrato tipado cliente ↔ servidor
│   │   ├── src/schemas/             # Zod: quiz, usuario, comentarios…
│   │   ├── src/moderation/          # Filtro de palabras ofensivas (es/en)
│   │   ├── src/progression/         # XP, niveles, rangos, logros
│   │   └── src/text.ts              # Normalizar (mayúsculas, tildes) para respuestas escritas
│   ├── db/                          # Prisma
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/
│   │   ├── src/seed.ts              # 10 quizzes públicos variados + usuarios demo
│   │   └── src/index.ts             # Cliente singleton (primary + réplica)
│   └── config/                      # tsconfig base, ESLint, Prettier, Tailwind preset
├── load-tests/                      # k6: biblioteca-10k.js, partida-2000.js, INFORME.md
├── infra/                           # docker-compose extra, k8s/, grafana/
├── docs/                            # Este documento, ESCALADO.md
├── docker-compose.yml               # Postgres + PgBouncer + Redis + Mailpit (+ Meilisearch opcional)
├── turbo.json, package.json, tsconfig.base.json
├── .env.example, .gitignore, .prettierrc, eslint.config.mjs
└── README.md
```

---

## 4. Modelo de datos (entidades principales)

```
User 1─1 Profile 1─1 Avatar            User 1─n Quiz ─1─n QuizVersion (snapshot JSON)
Quiz 1─n Question 1─n Option           Question n─1 Media (imagen/audio/video)
Quiz.remixOfId → Quiz (crédito al original)
Quiz 1─n Rating / Comment (Comment.parentId → respuestas, CommentLike)
User n─n Quiz vía Favorite;  Collection 1─n CollectionItem
User n─n User vía Follow (seguir) y Friendship (amistad con estado)
GameSession (modo: GameMode enum, PIN, estado, ajustes) 1─n Team, 1─n Player 1─n PlayerAnswer
DailyChallenge (fecha única → quiz)   Mission / UserMission (progreso, periodo)
Achievement / UserAchievement         League / LeagueMembership (semana, división)
Season / SeasonReward                 ShopItem / Inventory (equipado sí/no) + Wallet (monedas)
Class / ClassMember / Assignment      Report (reportes de moderación)   Notification
ReviewItem (repaso inteligente: intervalo, facilidad, próxima fecha — algoritmo SM-2)
```

Índices previstos: `Quiz(status, publishedAt)`, `Quiz(category, language, difficulty)`, `Quiz(authorId)`, `Quiz(playCount)`, `Quiz(trendingScore)`, GIN sobre `Quiz.searchVector`, `Comment(quizId, createdAt)`, `Notification(userId, readAt)`, `PlayerAnswer(gameId, questionId)`. Todas las listas usan **paginación por cursor**.

**Publicación automática:** `Quiz.status` = `DRAFT | PUBLISHED | HIDDEN`.

- El **borrador** del editor vive en `Quiz.draft` (JSON): cada autoguardado es **una sola escritura** de una fila, con control de concurrencia optimista (`Quiz.revision`).
- Las tablas **`Question`/`Option` guardan la versión publicada** y solo se sincronizan cuando el borrador es válido (título + todas las preguntas válidas), tocando únicamente las preguntas que cambiaron.
- Si un quiz publicado se edita y queda incompleto, la Biblioteca sigue mostrando la última versión válida (`hasUnpublishedChanges = true`).
- `PlayerAnswer.questionId` no tiene clave foránea: las partidas usan un snapshot congelado del quiz, así editar o borrar preguntas no destruye resultados históricos.
- Versiones: snapshot automático como máximo cada 60 s, al publicar, manual y antes de restaurar.

---

### Búsqueda de la Biblioteca (implementada en la Fase 2)

- `Quiz.searchVector`: columna **generada** con `quiz_search_vector(title, tags, description)`, una función `IMMUTABLE` con pesos A/B/C, `unaccent` y configuración `simple` (multilenguaje). Tiene un índice GIN parcial (solo publicados).
- Índice de trigramas sobre `immutable_unaccent(lower(title))` para tolerar errores. El umbral de `word_similarity` (0,45) se fija con `set_config(..., true)`, **local a la transacción** y seguro con PgBouncer en modo transacción.
- Consulta en dos pasos: primero solo los ids ordenados (consulta ligera con cursor *keyset*) y después se hidratan las tarjetas.
- La puntuación de tendencia se recalcula como mucho cada 10 minutos en todo el clúster, con un candado `SET NX` en Redis. Desde la Fase 8 lo hace el worker (BullMQ) cada 10 minutos; el candado queda como respaldo si no hay worker.

### IA, importación y modo profe (implementados en la Fase 6)

- **IA** (`apps/web/lib/ai`): SDK oficial de Anthropic con salida estructurada validada por Zod (`packages/shared/src/ai/schemas.ts`). Cada respuesta se convierte al formato del editor y las preguntas inválidas se descartan. Se comprueban `refusal` y `max_tokens`. Cada llamada queda en `AiRequest` (tokens, duración, estado) para la cuota diaria y el control de costos. Tres modos: real (`ANTHROPIC_API_KEY`), simulado (`AI_MOCK=1`) y apagado.
- **Material de entrada**: el PDF y la foto se envían como bloques `document`/`image` en base64 (máx. 10 MB). Los enlaces se descargan en el servidor con protección SSRF (resolución DNS y comprobación de IP en cada redirección). El material va entre etiquetas `<material>` y el *prompt* de sistema indica tratarlo como datos.
- **Moderación**: barrido limitado (`runAtMostEvery`, 120 s, lotes de 5) disparado tras el autoguardado y las consultas a la Biblioteca. `block` oculta el quiz (`HIDDEN`, motivo `AI_MODERATION`) y avisa al autor; `review` lo marca `FLAGGED`.
- **Importar/exportar** (`packages/shared/src/io/table.ts`): una tabla común para CSV (RFC 4180, separador detectado, BOM) y Excel (`exceljs`, celdas como texto, nunca fórmulas). Los errores se dan por fila con un código traducible.
- **Clases y tareas**: `Assignment.settings` guarda la configuración **y una copia de las preguntas**. Cada intento es una `GameSession` individual con `mode = ASSIGNMENT` y `assignmentId`, así los informes reutilizan `PlayerAnswer` (agregados con `groupBy`). El certificado es la propia sesión aprobada; su código `QR-XXXX-XXX` se deriva del id.

### Social, push, PWA y administración (implementados en la Fase 7)

- **Amistad**: una fila `Friendship` por pareja (`PENDING`, `ACCEPTED` o `BLOCKED`, donde `requester` es quien bloquea). Un bloqueo en cualquier sentido hace que la otra persona "no exista" (404 al pedir amistad y fuera de la búsqueda).
- **Presencia**: latido del navegador cada 45 s → `presence:<userId>` en Redis con caducidad de 100 s (un `MGET` para toda la lista de amigos). `Profile.lastSeenAt` se escribe como mucho cada 5 min. Respeta `Profile.showOnline`.
- **Notificaciones push**: las notificaciones se siguen creando como filas `Notification` (web, motor de progreso o servidor de tiempo real). Un repartidor (`lib/push.ts`) las reclama con `UPDATE … FOR UPDATE SKIP LOCKED` (nunca dos envíos con varias réplicas), corre como mucho cada 10 s tras cualquier petición al API (`after`) y envía con Web Push/VAPID en el idioma de cada persona. Las suscripciones caducadas (404/410) se borran. Desde la Fase 8 lo ejecuta el worker cada 10 s; sin worker, se mantiene el disparo tras las peticiones.
- **Clubes**: `ClubMember.points` suma el XP que gana cada miembro (lo hace `recordPlay` en la misma transacción que ligas y temporada). Los privados tienen `inviteCode` y son 404 para quien no es miembro.
- **Compartir**: `/resultado/<playerId>` (página pública sin indexar) y `/resultado/<playerId>/imagen` (PNG 1200×630 con `next/og`, sin recursos externos, en caché 1 día).
- **PWA**: `app/manifest.ts` + `public/sw.js` (red primero en la navegación con `/sin-conexion` como respaldo; caché primero para `/_next/static` en producción).
- **Administración**: `user.role === 'admin'` (plugin admin de Better Auth), comprobado contra la base de datos en cada petición. Bloquear una cuenta borra sus sesiones y la apunta en Redis (`banned:<id>`) para cortar el acceso al instante aunque la sesión siga en la caché de la cookie.
- **Accesibilidad**: tamaño de texto (`html.text-scale-115/130`, toda la interfaz está en `rem`), tiempo extra también en los modos individuales y contraste AA en los textos sobre color (`--accent-ink`, `--danger-ink`). Auditoría automática con axe en `e2e/screenshots-phase7.mjs`.

## 5. Lógica de puntaje (servidor, compartida en `packages/shared`)

- **Clásico:** `puntos = round(base × (1 − (t / T) / 2))` → entre 50 % y 100 % de la base según velocidad. Base 1000 (normal), 2000 (doble), 0 (sin puntos).
- **Modo sin velocidad (profesores):** acierto = base completa.
- **Racha:** +100 por cada acierto seguido a partir del 2.º (tope +500). El escudo evita perderla.
- **Deslizador:** puntaje proporcional a la cercanía dentro del margen configurado.
- **Ordenar / emparejar / completar espacios:** crédito parcial por elemento correcto.
- **Pin en imagen:** 100 % en la mitad interior del círculo, decreciente hasta el borde.
- **Imagen revelada:** puntaje por velocidad normal; como las piezas se destapan con el tiempo, adivinar antes (con menos imagen) da más puntos.
- **Dibujo rápido:** quien adivina, puntaje por velocidad; quien dibuja, 100 por acierto (máx. 1.000).
- **Encuesta / nube / abierta:** sin puntos.
- **Power-ups:** doble ×2 sobre la base; +10 s amplía el plazo solo de ese jugador; segunda oportunidad anula un fallo; el escudo conserva la racha.
- **Modos:** Equipos y Conquista usan la media de los miembros; Jefe: daño = 60 % de los puntos de los aciertos, curación = 120 por fallo (nunca por encima de la vida máxima).

---

## 6. Escalabilidad (implementada y medida en la Fase 8; detalle en [ESCALADO.md](ESCALADO.md))

- `web`, `realtime` y `worker` sin estado en memoria → réplicas horizontales.
- Salas de 2.000 jugadores: mensajes compactos (claves cortas), contador agregado cada 500 ms, top 10 al anfitrión + posición individual a cada jugador, reacciones limitadas (1 cada 2 s por jugador, agregadas por lote).
- Reconexión con backoff exponencial + jitter (1 s → 30 s) para evitar avalanchas.
- Rate limiting por usuario/IP en API y sockets (token bucket en Redis). Cloudflare Turnstile (CAPTCHA invisible) en registro y al unirse.
- Degradación elegante: IA, búsqueda avanzada y notificaciones detrás de "circuit breakers"; si fallan, la plataforma sigue.

### Implementado en la Fase 8

- **Worker BullMQ** (`apps/worker`): programa los periódicos con `upsertJobScheduler` (un turno por intervalo aunque haya varias réplicas) y ejecuta cada trabajo llamando a `POST /api/internal/jobs/<nombre>` de la web (`Bearer JOBS_SECRET`, comparación en tiempo constante; sin secreto la ruta es 404). La lógica vive una sola vez, en la web. El worker deja un latido en Redis (`worker:heartbeat`, 30 s); mientras exista, la web no ejecuta esas tareas en línea, y si desaparece las retoma (`after()` + candado `SET NX`).
- **Caché de página completa** (`apps/web/proxy.ts`, Node): solo GET de `/`, `/biblioteca` y `/quiz/:id`, solo sin más cookies que la de idioma, solo navegaciones de documento (`Accept: text/html` y `Sec-Fetch-Dest: document`: Next quita las cabeceras RSC antes del proxy, así se excluyen las peticiones internas de React), solo 200 sin `Set-Cookie`. Redis 30 s + memoria 3 s + single-flight por instancia. Se invalida en `publicQuizChanged()`. El service worker usa *navigation preload* para que sus navegaciones lleguen como tales.
- **Cachés**: `cached()` con single-flight; grupo `library` versionado (`cache:ver:library`) que suben `publicQuizChanged()` y el recálculo de tendencia. Las búsquedas se guardan 60 s por consulta.
- **Rankings** de los modos individuales en Sorted Sets (`lb:<soloKey>`, `ZADD GT`), reconstruidos desde PostgreSQL con candado si faltan; sin Redis, se leen de PostgreSQL.
- **Búsqueda**: `lib/search.ts` con Meilisearch opcional (solo búsquedas con texto ordenadas por relevancia), sincronizado por trabajos `search-index` y con cortocircuito de 30 s. El umbral de `pg_trgm.word_similarity_threshold` (0,45) está fijado en la base de datos (migración `trgm_threshold`) para no abrir una transacción por búsqueda.
- **Textos por sección**: `ScopedMessages` envía al navegador solo los espacios de next-intl de cada sección; el grupo `(public)` usa la lista que calcula `scripts/i18n-namespaces.mjs` (una prueba comprueba que está al día).
- **Observabilidad**: prom-client en las tres apps (peticiones y duración por ruta normalizada, eventos de socket y su latencia, conexiones, partidas en curso, trabajos y cola); Sentry opcional con `dataCollection` mínimo (sin cookies, cabeceras, cuerpos ni datos de usuario).
- **IP de confianza** `CLIENT_IP_HEADER` (por defecto `x-real-ip`) en el API, Better Auth y el tiempo real.
- **Pruebas de carga**: `scripts/loadtest-game.mjs` (partida en vivo) y `loadtest/` (Biblioteca, k6 y Node). Resultados en [carga/INFORME.md](carga/INFORME.md).

---

## 7. Identidad visual

**Concepto:** "energía eléctrica arcade". Nada de morado Kahoot ni de sus 4 colores rojo/azul/amarillo/verde.

| Token | Oscuro (por defecto) | Claro |
|---|---|---|
| Fondo | `#0E0B26` tinta nocturna | `#FFF8EC` crema |
| Superficie | `#1A1640` | `#FFFFFF` |
| Primario (rayo) | `#FFE14D` amarillo eléctrico | `#F5B800` |
| Acento | `#FF3D9A` magenta | `#E01F7E` |
| Texto | `#F5F3FF` | `#1A1640` |

**Colores de respuesta** (siempre con forma + icono, no solo color, por accesibilidad):
⚡ Cian `#22D3EE` · ★ Lima `#A3E635` · ● Naranja `#FB923C` · ◆ Rosa `#F472B6` · ▲ Violeta claro `#A78BFA` · ■ Turquesa `#2DD4BF`

**Tipografías:** *Bricolage Grotesque* (títulos, peso 800, con personalidad) + *Nunito Sans* (texto, muy legible en celular).
**Logo:** rayo ⚡ inclinado dentro de una "R" + `Quiz_Rush` con el guion bajo animado como una chispa.
**Botones:** esquinas redondeadas 16–20 px, sombra inferior sólida (efecto "tecla arcade" que se hunde al presionar).

---

## 8. Diseño de las pantallas principales (wireframes)

### 8.1 Inicio / Landing
```
┌──────────────────────────────────────────────────────────────────────┐
│ ⚡Quiz_Rush   Biblioteca  Crear  Clases        🌙  ES▾  [Entrar]      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│     ¡Aprende a la velocidad del rayo!          ┌──────────────────┐  │
│     Crea, juega y compite en vivo.             │  PIN de juego    │  │
│                                                │  [ _ _ _ _ _ _ ] │  │
│     [ ⚡ Crear quiz ]  [ 🎮 Explorar ]          │  [   ¡ENTRAR!   ] │  │
│                                                └──────────────────┘  │
│   ── Retos del día ──────────────────────────────────────────────    │
│   [🔥 Reto diario: Capitales · racha 4]  [⏱ Rush 60 s]  [⚔ Duelo]   │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.2 Biblioteca (estilo Netflix)
```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔍 [ Buscar quizzes, temas, creadores…            ]  Orden: Tendencia▾│
│ [Categoría▾] [Idioma▾] [Dificultad▾] [Duración▾] [Tipo de pregunta▾]  │
├──────────────────────────────────────────────────────────────────────┤
│ 🔥 En tendencia                                              ‹  ›    │
│ ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐                   │
│ │portada ││portada ││portada ││        ││        │  ← hover: se       │
│ │Sistema ││Mundial ││Anime   ││  ...   ││  ...   │    agranda y       │
│ │Solar   ││2026    ││90s     ││        ││        │    muestra 1ª      │
│ │@ana ★4.8│▶ 12k  ││        ││        ││        │    pregunta        │
│ └────────┘└────────┘└────────┘└────────┘└────────┘                   │
│ ✨ Nuevos esta semana  ·  🎯 Para ti  ·  🏆 Creadores destacados       │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.3 Editor (3 paneles, autoguardado)
```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Mi quiz: "Sistema Solar"     ✓ Guardado   🕘 Versiones  [▶ Probar]  │
├────────────┬───────────────────────────────────────┬─────────────────┤
│ PREGUNTAS  │        VISTA PREVIA (jugador)         │ AJUSTES          │
│ ┌────────┐ │  ┌─────────────────────────────────┐  │ Tipo: Opción ▾   │
│ │1 ¿Plan…│◄┼─ │  ¿Cuál es el planeta más grande?│  │ Tiempo: [20 s]   │
│ └────────┘ │  │        [ imagen / video ]       │  │ Puntos: Normal ▾ │
│ ┌────────┐ │  │ ┌──────────┐ ┌──────────┐       │  │ Pista: [____]    │
│ │2 Orden…│ │  │ │⚡ Júpiter│ │★ Saturno │       │  │ Explicación:     │
│ └────────┘ │  │ └──────────┘ └──────────┘       │  │ [____________]   │
│  ⋮ arrastra│  │ ┌──────────┐ ┌──────────┐       │  │ ── Quiz ──       │
│ [+ Nueva]  │  │ │● Tierra  │ │◆ Marte   │       │  │ Tema: 🚀Espacio▾ │
│ [✨ IA]    │  │ └──────────┘ └──────────┘       │  │ Música: ▾        │
│ [⬆ CSV]    │  └─────────────────────────────────┘  │ Portada: [🖼]     │
└────────────┴───────────────────────────────────────┴─────────────────┘
```

### 8.4 Anfitrión — sala de espera (proyector)
```
┌──────────────────────────────────────────────────────────────────────┐
│   Entra en quizrush.app/jugar        PIN:  4 8 2 · 9 1 7      [QR]    │
├──────────────────────────────────────────────────────────────────────┤
│   👥 37 jugadores                     Modo: Clásico ▾  🔒 Bloquear     │
│   (avatares entrando con animación de rebote)                        │
│   🦊 Sofi   🐼 Leo   🚀 MaxPower   🐙 Juli   🦖 Toño   …   (✕ expulsar)│
│                          💖 😂 🔥  ← reacciones flotando               │
│                                              [   ⚡ EMPEZAR   ]        │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.5 Anfitrión — pregunta en curso
```
┌──────────────────────────────────────────────────────────────────────┐
│  3/15            ¿Cuál es el planeta más grande?          ⏱ ◔ 14     │
│                       [ imagen grande ]                 Respuestas 28 │
│  ┌───────────────────────────┐ ┌───────────────────────────┐          │
│  │ ⚡ Júpiter                 │ │ ★ Saturno                 │          │
│  ├───────────────────────────┤ ├───────────────────────────┤          │
│  │ ● Tierra                  │ │ ◆ Marte                   │          │
│  └───────────────────────────┘ └───────────────────────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.6 Jugador (celular) — responder / resultado
```
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│ 3/15   ⏱14  🔥x3  │   │                   │   │   ¡Imparable! 🔥   │
│ ┌───────┐┌───────┐│   │   ⚡ Respuesta     │   │   ✓ +912 pts      │
│ │       ││       ││   │      enviada…     │   │   Racha x4        │
│ │   ⚡  ││   ★   ││   │   (animación de   │   │   Vas 2.º  ▲3     │
│ │       ││       ││   │    espera)        │   │ (vibración +      │
│ ├───────┤├───────┤│   │                   │   │  confeti)         │
│ │   ●   ││   ◆   ││   │                   │   │                   │
│ └───────┘└───────┘│   │                   │   │                   │
│ [50/50][x2][+10s] │   │  😂 💖 🔥 👏 😮   │   │                   │
└───────────────────┘   └───────────────────┘   └───────────────────┘
```

### 8.7 Ranking y podio
```
┌──────────────────────────────────────────────────────────────────────┐
│ RANKING                              │            🏆 PODIO           │
│ 1 🚀 MaxPower    5 820  ▲2           │              🦊               │
│ 2 🦊 Sofi        5 610  ▼1           │      🐼     ┌───┐     🐙      │
│ 3 🐼 Leo         5 300  ▲4           │    ┌───┐    │ 1 │    ┌───┐    │
│ 4 🐙 Juli        4 990  ▼1           │    │ 2 │    │   │    │ 3 │    │
│ (filas que se reordenan animadas)    │  (fuegos artificiales, temblor)│
└──────────────────────────────────────────────────────────────────────┘
```

### 8.8 Perfil, tienda y profesor
```
PERFIL: avatar animado · nivel 23 · rango 🥇 Oro · racha 🔥12 · seguidores
        gráfica radar de precisión por categoría · tiempo promedio · logros
TIENDA: monedas 🪙 1 250 · pestañas Avatares / Accesorios / Marcos / Efectos / Temas
        vista previa en vivo del avatar al pasar sobre cada artículo
CLASES: código de clase · tareas con fecha límite · tabla estudiantes × preguntas
        (mapa de calor de aciertos) · exportar CSV / PDF · certificados
```

---

## 9. Plan de fases

| Fase | Contenido |
|---|---|
| **1** ✅ | Monorepo, Docker (Postgres, PgBouncer, Redis, Mailpit), Prisma con **todo** el modelo de datos, Auth (email, Google, invitado), perfiles, editor de 3 paneles con autoguardado cada 2 s, versiones, temas, drag & drop, tipos base (opción múltiple, V/F, respuesta escrita). |
| **2** ✅ | Publicación automática, biblioteca con búsqueda full-text, filtros, orden, secciones, tarjetas animadas, página del quiz, calificar, comentar, favoritos, colecciones, remix, compartir/QR, reportar, seguir creadores, seed con 10 quizzes. |
| **3** ✅ | Servidor Socket.IO + Redis, partida clásica con PIN/QR, sala de espera, reloj autoritativo, reacciones, ranking animado, podio, sonidos, confeti, reconexión, expulsar/bloquear, modo espectador, tests de puntaje y flujo. |
| **4** ✅ | Los 11 tipos de pregunta restantes y modos Equipos, Supervivencia, Carrera, Jefe, **Torneo** y **Conquista de territorio**. Power-ups en partida. |
| **5** ✅ | XP, niveles, rangos, 30+ logros, misiones, ligas, temporadas, monedas, tienda, avatares. Modos individuales: práctica, rush, duelo, desafío por enlace, reto diario, aventura, repaso inteligente. |
| **6** ✅ | Generador con IA (tema, texto, PDF, enlace, foto), distractores y explicaciones, importar/exportar CSV/Excel, plantillas, clases, tareas, reportes, certificados, moderación por IA. |
| **7** ✅ | Amigos, presencia en línea, clubes, notificaciones (app + push), PWA, imagen de resultados para redes, accesibilidad completa, multilenguaje, panel de administrador, pulido. |
| **8** ✅ | Caché Redis con invalidación, rankings ZSET, BullMQ completo, CDN/imágenes, ISR, réplicas, Meilisearch opcional, métricas, Sentry, k6 (10k biblioteca / 2.000 en partida) con informe, guía de escalado y costos. |
