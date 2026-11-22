# Informe de pruebas de carga · Fase 8

Fecha: 17 de noviembre de 2026. Al repetir las pruebas, los generadores guardan los resultados en bruto en esta carpeta (`*.json`, no se suben al repositorio).

## Resumen

| Objetivo | Resultado |
|---|---|
| **2.000 jugadores en una sola partida en vivo** | ✅ 2.000/2.000 dentro, la pregunta llega a todos en ≤ 61 ms (p99 59 ms), confirmación de respuesta p95 16 ms, 0 desconexiones. Con 2 instancias del tiempo real: p95 6 ms. |
| **10.000 personas usando la Biblioteca a la vez** | ✅ Con 4 réplicas de la web: 1.815 peticiones/s, 0 % de errores, búsqueda p95 24 ms, páginas p95 15 ms. |
| Con 2 réplicas | ⚠️ Al límite en este portátil: pasó una vez (0,01 % de errores) y falló en otras tres ejecuciones (2-7 % de errores). |
| Con 1 réplica | ❌ Saturada: 570-1.160 peticiones/s según la ejecución, frente a las ~1.800 que piden 10.000 personas. |

## Entorno (importante para leer las cifras)

Todo corrió en **un solo portátil** (AMD Ryzen 7 7435HS, 8 núcleos / 16 hilos, 16 GB de RAM,
Windows 11): PostgreSQL 17 + PgBouncer y Redis 7 en Docker, la web compilada para producción
(`next start`), el servidor de tiempo real compilado (`node dist/index.js`) y los generadores de
carga, todos compitiendo por la misma CPU. En producción cada pieza tiene su máquina, así que
estas cifras son **conservadoras**.

Los usuarios simulados son **visitantes sin sesión** (el caso de la Biblioteca pública). Las
personas con sesión no usan la caché de páginas: con mucha proporción de ellas, cuenta con
~60-110 páginas/s por núcleo (ver «Capacidad por réplica»).

## 1. Partida en vivo con 2.000 jugadores

Herramienta: `node scripts/loadtest-game.mjs 2000 150 4`. Entran 150 jugadores por segundo (cada
uno con su propia IP simulada), se juegan 4 preguntas (opción múltiple, respuesta escrita y
verdadero/falso) y cada jugador responde entre 0,3 y 4 s después de verla.

| Métrica | 1 instancia | 2 instancias (jugadores repartidos) |
|---|---|---|
| Jugadores dentro | 2.000 / 2.000 (13,4 s) | 2.000 / 2.000 (13,3 s) |
| Unirse (p50 / p95 / p99) | 117 / 151 / 154 ms | 80 / 117 / 129 ms |
| Reparto de la pregunta: del primer al último cliente (p50 / p95 / máx.) | 28 / 53 / 61 ms | 20 / 39 / 44 ms |
| Confirmación de respuesta (p50 / p95 / p99) | 4 / 16 / 20 ms | 4 / 6 / 13 ms |
| Resultados personales entregados | 2.000 por pregunta | 2.000 por pregunta |
| Desconexiones | 0 | 0 |
| Memoria del servidor | 205 → 389 MB | 356 → 665 MB (las dos) |

Las respuestas `CLOSED` del JSON son de jugadores que respondieron después de que el anfitrión
cerrara la pregunta (la prueba la cierra cuando ha respondido el 97 %): es el comportamiento
correcto. Con dos instancias, la mitad de los jugadores estaban en una instancia distinta de la
del anfitrión y todo llegó igual: el reparto entre instancias por Redis funciona.

## 2. Biblioteca con 10.000 personas a la vez

Herramienta: `node loadtest/biblioteca-node.mjs 10000 90 120` (mismo escenario que
`loadtest/biblioteca.js` para k6). Cada persona simulada: 55 % búsquedas en el API (con texto,
filtros y errores de escritura; 30 % pasa a la página 2), 25 % abre la ficha de un quiz, 20 %
abre la portada de la Biblioteca; espera 3-8 s entre acciones. Subida de 90 s y meseta de 2 min.

| Réplicas de la web | Peticiones/s en la meseta | Errores | API p50 / p95 / p99 | Páginas p50 / p95 / p99 |
|---|---|---|---|---|
| 4 | 1.815 | 0 % | 7 / 24 / 53 ms | 4 / 15 / 45 ms |
| 2 | 1.220 (saturada) | 7,1 % | 771 / 2.984 / 7.094 ms | 653 / 7.709 / 30.001 ms |
| 1 | 569 (saturada) | 39,7 % | 203 / 8.003 / 17.378 ms | 486 / 25.002 / 30.007 ms |

Son las ejecuciones con el código final. **Con 2 réplicas el
resultado varía mucho entre ejecuciones**: una anterior, con el mismo escenario, dio 1.798
peticiones/s y 0,01 % de errores; otras tres dieron entre 2 y 7 % de errores. Para descartar que
fuera culpa de un cambio de código se hizo una prueba A/B (misma carga con la versión anterior de
la caché de búsquedas): también falló (4,8 %). Conclusión: cada réplica rinde ~800-900
peticiones/s de esta mezcla en este portátil, así que 2 réplicas (≈1.800/s de capacidad para
≈1.800/s de demanda) no tienen margen. Hacen falta **4** (o servidores más potentes).

Objetivos (los mismos umbrales del script de k6): API p95 < 500 ms, páginas p95 < 1.500 ms y
errores < 1 %. Se cumplen con 4 réplicas.

### Por qué k6 no se usó para medir aquí

El script `loadtest/biblioteca.js` está listo para k6, pero dentro de Docker Desktop en Windows
el puente de red hacia el anfitrión no pasa de ~100 peticiones/s (errores `dial: i/o timeout` y
`connection reset`), mientras la web atendía más de 1.000/s medida desde el propio equipo. Para
no medir el puente de Docker se usó un generador en Node con el mismo escenario. En un entorno
real, lo correcto es lanzar k6 desde **otra máquina** (o k6 Cloud) contra el despliegue.

## 3. Lo que cambió gracias a las pruebas

Las pruebas encontraron cuellos de botella reales, que ya están corregidos:

1. **Cada visita a la Biblioteca se renderizaba desde cero** (~21 ms de CPU y 228 KB): un
   proceso solo daba ~40-60 páginas/s. Ahora `apps/web/proxy.ts` guarda la versión para
   visitantes **sin sesión** 30 s en Redis (y 3 s en memoria): **758 páginas/s** de Biblioteca,
   1.048 de fichas y 1.236 de portada por proceso (×19). Con sesión nunca se usa la caché.
2. **El service worker anulaba esa caché** para quien ya había visitado la web (sus peticiones
   llegaban como `fetch`, no como navegación). Ahora usa *navigation preload*: más rápido y la
   caché funciona para todos.
3. **Contadores atrasados en las búsquedas**: la caché guardaba las tarjetas completas 60 s, así
   que un favorito recién marcado no se veía y un quiz recién borrado seguía saliendo. Ahora se
   guarda aparte qué quizzes salen (60 s) y cada tarjeta (30 s en Redis, 5 s en memoria); los
   cambios de un quiz borran su tarjeta al momento.
4. **Estampida de la caché**: al caducar una búsqueda, cientos de peticiones la recalculaban a la
   vez. `cached()` ahora hace *single-flight*: una sola consulta por clave e instancia.
5. **Cada búsqueda con texto abría una transacción** solo para fijar el umbral de parecido; con
   carga, esas transacciones agotaban las conexiones (errores 500 «Unable to start a
   transaction»). El umbral está ahora fijado en la base de datos (migración
   `trgm_threshold`): 0 errores 500.
6. **Los textos de toda la app viajaban en cada página** (76 KB por duplicado). La portada, la
   Biblioteca y las fichas reciben ahora solo los suyos (la Biblioteca bajó de 267 KB a 228 KB;
   el resto del peso son sus 39 tarjetas).

## Cómo repetir las pruebas

```bash
# Requisitos: npm run infra:up, npm run db:seed y la web/tiempo real en marcha
node scripts/loadtest-game.mjs 2000 150 4                       # partida (RT_URLS=… para varias instancias)
BASES=http://localhost:3000 node loadtest/biblioteca-node.mjs 10000 90 120
# Desde otra máquina, con k6:
k6 run -e BASE=https://tu-dominio -e VUS=10000 loadtest/biblioteca.js
```

Para medir la web de forma realista hay que usar la versión de producción (`npm run build` y
`next start`): en desarrollo no hay caché de páginas y el renderizado es mucho más lento.
