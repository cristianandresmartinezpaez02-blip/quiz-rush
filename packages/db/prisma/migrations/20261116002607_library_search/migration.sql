-- ═══════════════════════════════════════════════════════════════
--  Fase 2 · Biblioteca: búsqueda full-text, ranking y contadores
--  (idempotente: se puede reaplicar con seguridad)
-- ═══════════════════════════════════════════════════════════════

-- Extensiones (en local ya las crea infra/postgres/init.sql; aquí para producción)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() no es IMMUTABLE y no puede usarse en columnas generadas ni índices:
-- este envoltorio fija el diccionario y se declara inmutable (patrón recomendado).
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Vector de búsqueda de un quiz: título (peso A) > etiquetas (B) > descripción (C).
-- Configuración 'simple' (multilenguaje: sin stemming de un idioma concreto).
CREATE OR REPLACE FUNCTION quiz_search_vector(title text, tags text[], description text)
  RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$
    SELECT
      setweight(to_tsvector('simple'::regconfig, immutable_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('simple'::regconfig, immutable_unaccent(coalesce(array_to_string(tags, ' '), ''))), 'B') ||
      setweight(to_tsvector('simple'::regconfig, immutable_unaccent(coalesce(description, ''))), 'C')
  $$;

-- Ranking por calificación
DROP INDEX IF EXISTS "Quiz_status_ratingAvg_idx";
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "ratingScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Quiz_status_ratingScore_idx" ON "Quiz"("status", "ratingScore" DESC);

-- Respuestas a comentarios
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "replyCount" INTEGER NOT NULL DEFAULT 0;

-- Columna generada: PostgreSQL la recalcula sola en cada escritura del quiz
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (quiz_search_vector("title", "tags", "description")) STORED;

-- Índice GIN para búsquedas full-text (solo publicados: índice más pequeño)
CREATE INDEX IF NOT EXISTS "Quiz_searchVector_idx" ON "Quiz" USING GIN ("searchVector") WHERE "status" = 'PUBLISHED';

-- Índice de trigramas para tolerar errores de escritura ("sistma solr")
CREATE INDEX IF NOT EXISTS "Quiz_title_trgm_idx" ON "Quiz" USING GIN (immutable_unaccent(lower("title")) gin_trgm_ops) WHERE "status" = 'PUBLISHED';

-- Listado "nuevos" de la biblioteca
CREATE INDEX IF NOT EXISTS "Quiz_library_new_idx" ON "Quiz"("publishedAt" DESC, "id" DESC) WHERE "status" = 'PUBLISHED' AND "visibility" = 'PUBLIC' AND "deletedAt" IS NULL;
