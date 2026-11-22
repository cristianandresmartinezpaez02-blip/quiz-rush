# Guía de escalado y costos

Cómo desplegar Quiz_Rush, cuántas réplicas hacen falta según el tráfico y cuánto cuesta. Las
capacidades salen de las pruebas de carga medidas (ver [carga/INFORME.md](carga/INFORME.md)).

## 1. Piezas y cómo escala cada una

| Pieza | Qué hace | ¿Cómo escala? | Imagen |
|---|---|---|---|
| **web** (Next.js) | Páginas, API, autenticación, caché de páginas | Horizontal, sin estado: N réplicas detrás de un balanceador | `apps/web/Dockerfile` |
| **realtime** (Socket.IO) | Partidas en vivo y duelos | Horizontal: las partidas viven en Redis; cualquier instancia retoma los temporizadores si otra cae | `apps/realtime/Dockerfile` |
| **worker** (BullMQ) | Push, moderación con IA, tendencia, ligas, limpieza, avisos a seguidores, índice de búsqueda | Horizontal: BullMQ reparte los trabajos sin repetirlos. Opcional: sin él, la web hace esas tareas tras responder | `apps/worker/Dockerfile` |
| **PostgreSQL** + PgBouncer | Fuente de verdad | Vertical + réplica de lectura (`DATABASE_READ_URL`) para la Biblioteca y los rankings | gestionado |
| **Redis** | Estado de partidas, cachés, rankings, límites, colas, presencia | Vertical; separar en dos instancias (caché/colas y partidas) al crecer mucho | gestionado |
| **Meilisearch** (opcional) | Búsqueda con tolerancia a errores | Vertical. Sin él la búsqueda va en PostgreSQL | `getmeili/meilisearch` |

## 2. Capacidad medida por pieza

| Pieza | Capacidad de 1 réplica (≈1 vCPU) | Nota |
|---|---|---|
| web, visitantes sin sesión | ~800-900 peticiones/s de la mezcla «Biblioteca» (búsquedas + páginas en caché) | Página en caché: 850-1.200/s. Búsqueda en caché: ~850/s |
| web, personas con sesión | ~60-110 páginas renderizadas/s + ~1.500 búsquedas/s | Las páginas personales no se cachean |
| realtime | ≥ 2.000 jugadores en una sala con p95 < 20 ms; ~200 MB de RAM extra | La memoria, no la CPU, es el límite práctico: ~90 KB por jugador conectado |
| worker | Muy holgado: los trabajos son ligeros salvo la moderación con IA (espera a la API) | `WORKER_CONCURRENCY` (4 por defecto) |

Regla práctica para **visitantes sin sesión**: cada persona activa genera ~0,18 peticiones/s
(una acción cada 3-8 s). Por tanto **1 réplica de la web ≈ 4.500 personas navegando** al límite;
se recomienda trabajar al 50 % para absorber picos: **1 réplica cada ~2.500 personas a la vez**
(medido: 10.000 personas necesitaron 4 réplicas; con 2 iba al límite).
Para partidas en vivo: **1 instancia del tiempo real cada ~5.000 jugadores conectados** (estimación:
se midió hasta 2.000 en una sala, con mucho margen), con un
mínimo de 2 para tolerar la caída de una.

## 3. Configuraciones recomendadas

| Escenario | Personas a la vez | web | realtime | worker | PostgreSQL | Redis |
|---|---|---|---|---|---|---|
| **Piloto** (un colegio) | hasta ~500 | 1 × (0,5 vCPU, 1 GB) | 1 × (0,5 vCPU, 512 MB) | 1 × (0,25 vCPU, 256 MB) | 1 vCPU / 2 GB, 10 GB | 256 MB |
| **Objetivo de la Fase 8** | 10.000 en la Biblioteca + 2.000 en partidas | 4 × (1 vCPU, 1 GB) | 2 × (1 vCPU, 1 GB) | 1 × (0,5 vCPU, 512 MB) | 2 vCPU / 4-8 GB + réplica de lectura | 1-2 GB |
| **Grande** | 100.000 | 20-40 × (1 vCPU, 1 GB) con autoescalado | 6-10 × (1 vCPU, 2 GB) | 2 × (1 vCPU, 1 GB) | 8 vCPU / 32 GB + 2 réplicas | 2 instancias (caché/colas y partidas) |

Con más de ~20 réplicas de la web conviene poner una CDN delante para los archivos estáticos
(`/_next/static`, `/icons`, `/sounds`; ya llevan caché larga) y vigilar las conexiones a
PostgreSQL: `DATABASE_POOL_MAX` (10 por réplica por defecto) × réplicas debe caber en el
`MAX_CLIENT_CONN` de PgBouncer (2.000 en el `docker-compose.yml`).

## 4. Costos aproximados (mensuales, en USD)

Precios de referencia consultados en noviembre de 2026 en fuentes públicas (no oficiales):
compruébalos en la web de cada proveedor antes de presupuestar.

- **Railway** (contenedores): ~$20 por vCPU/mes y ~$10 por GB de RAM/mes, cobrado por segundo
  de uso real; plan Pro $20/mes con $20 de uso incluido. Una réplica de 1 vCPU y 1 GB al 100 %
  todo el mes ≈ $30.
- **Neon** (PostgreSQL): plan Launch ~$0,106 por CU-hora y ~$0,35 por GB-mes; plan Scale
  ~$0,222 por CU-hora (1 CU ≈ 1 vCPU y 4 GB).
- **Upstash** (Redis): planes fijos de $10 (250 MB), $20 (1 GB) y $100 (5 GB) al mes, con un
  máximo de ~10.000 comandos por segundo.
- **Vercel** (si se prefiere para la web): Pro ~$20 por miembro del equipo al mes más el uso
  (funciones, ancho de banda).

| Escenario | web | realtime | worker | PostgreSQL | Redis | Total aprox. |
|---|---|---|---|---|---|---|
| Piloto | ~$15 | ~$10 | ~$5 | Neon Launch ~$15-30 | Upstash $10 | **~$60-90** (+ $20 del plan Pro de Railway, que se descuenta del uso) |
| Fase 8 (10k + 2k) | 4 × $30 = $120 | 2 × $30 = $60 | ~$15 | Neon Launch, ~2 CU fijos ≈ $155 + réplica ≈ $80 | Redis propio en Railway (1 vCPU, 2 GB) ≈ $40 | **~$400-480** |
| Grande (100k) | ~$900-1.200 (autoescalado: la media es menor que el pico) | ~$300 | ~$60 | Neon Scale o PostgreSQL gestionado dedicado: ~$700-1.200 | 2 × ~$100-200 | **~$2.500-3.500** |

Notas:

- Los totales suponen el pico **todo el mes**. Con autoescalado (o apagando réplicas fuera del
  horario escolar) el gasto real suele ser bastante menor: Railway cobra por segundo de uso.
- **Redis con mucho tráfico**: el plan fijo de Upstash tiene un tope de ~10.000 comandos/s.
  Cada búsqueda usa 3-4 comandos (límite de peticiones y caché) y cada respuesta en una partida
  2-3, así que en el escenario de la Fase 8 se está cerca del tope: un Redis propio (contenedor
  con 1-2 GB, `appendonly yes`) sale más barato y sin límite de comandos.
- **IA**: el gasto depende del uso y del modelo configurado. El panel **/admin → IA** muestra
  las llamadas y los tokens por día: multiplícalos por la tarifa vigente del modelo. Las cuotas
  por persona (Fase 6) acotan el máximo.
- **Errores (Sentry)**: el plan gratuito basta para el piloto; en producción, el plan de equipo.
  Sin `SENTRY_DSN` no se envía nada.
- **Cloudinary** (imágenes): el plan gratuito cubre el piloto; después crece con el
  almacenamiento y las transformaciones.

## 5. Despliegue paso a paso (contenedores)

1. **Base de datos y Redis** gestionados. PostgreSQL con PgBouncer en modo `transaction`.
2. Variables de entorno (ver `.env.example`): `DATABASE_URL` (por PgBouncer),
   `DIRECT_DATABASE_URL` (migraciones), `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_REALTIME_URL`, `JOBS_SECRET` (el mismo en web y worker),
   `WEB_INTERNAL_URL` (URL interna de la web para el worker), claves VAPID y, opcionales,
   `SENTRY_DSN`, `METRICS_TOKEN`, `MEILI_URL`.
3. **`CLIENT_IP_HEADER`**: la cabecera con la IP real que pone el balanceador y que el cliente
   no puede falsificar (`x-real-ip` en Railway/nginx/Vercel, `cf-connecting-ip` detrás de
   Cloudflare). De ella dependen todos los límites de peticiones.
4. Migraciones: `npm run db:deploy`. **Después, reinicia PgBouncer** (o espera a que renueve
   sus conexiones): la migración `trgm_threshold` cambia un ajuste de la base de datos que solo
   ven las conexiones nuevas.
5. Construir y desplegar las tres imágenes (`docker build -f apps/<app>/Dockerfile .` desde la
   raíz). Comprobaciones de salud: web `/health`, realtime `/health`, worker `/health`.
6. El tiempo real necesita **WebSockets** en el balanceador y conexiones largas (≥ 2 min sin
   datos). Con varias instancias, activa la **afinidad de sesión** (*sticky sessions*): las
   redes que bloquean WebSocket caen al transporte de *polling* de Socket.IO, que exige llegar
   siempre a la misma instancia. Las partidas en sí están en Redis.
7. Opcional: Meilisearch y `npm run search:reindex` una vez.

## 6. Qué vigilar (métricas)

Prometheus puede leer `/metrics` del tiempo real (`:4000`) y del worker (`:4100`), y
`/api/metrics` de cada réplica de la web con `Authorization: Bearer <METRICS_TOKEN>`.

| Métrica | Alerta sugerida | Qué hacer |
|---|---|---|
| `quizrush_http_request_seconds` p95 por ruta | > 500 ms durante 5 min | Añadir réplicas de la web |
| `quizrush_http_requests_total{status=~"5.."}` | > 1 % del total | Revisar Sentry / registros |
| `quizrush_socket_ack_seconds` p95 | > 100 ms | Añadir instancias del tiempo real |
| `quizrush_socket_connections` por instancia | > 5.000 | Añadir instancias del tiempo real |
| `quizrush_queue_jobs{state="waiting"}` | > 100 durante 5 min | Más concurrencia o réplicas del worker |
| `quizrush_jobs_total{status="error"}` | crece sin parar | Revisar el trabajo en Sentry |
| `process_resident_memory_bytes` | > 80 % del límite | Más memoria o más réplicas |

Además: conexiones de PostgreSQL (PgBouncer `SHOW POOLS`), memoria y comandos/s de Redis.

## 7. Siguientes pasos cuando haga falta

- **Muchas personas con sesión**: las páginas personales no se cachean. Si el tráfico con
  sesión domina, convertir la cabecera en un componente de cliente y cachear también esas
  páginas (la parte personal se pide aparte).
- **Más de ~50.000 partidas/día**: mover el guardado de respuestas de las partidas en vivo a un
  trabajo de BullMQ por lotes (hoy se guardan al cerrar cada pregunta, desde el tiempo real).
- **Búsqueda**: con más de ~200.000 quizzes, activar Meilisearch.
