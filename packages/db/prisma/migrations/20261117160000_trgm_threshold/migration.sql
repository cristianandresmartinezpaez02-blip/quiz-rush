-- Umbral de parecido para la búsqueda tolerante a errores (operador <% de pg_trgm), fijado en
-- la base de datos: así la búsqueda ya no necesita abrir una transacción en cada consulta para
-- ajustarlo (con miles de búsquedas a la vez, esas transacciones agotaban las conexiones).
-- Se aplica a cada conexión nueva (también a las que abre PgBouncer / el pooler de Supabase).
-- En servicios gestionados (Supabase) el usuario no es dueño de la base de datos: entonces se
-- fija para el propio usuario, que es con el que se conecta la app.
DO $$
BEGIN
  BEGIN
    EXECUTE format('ALTER DATABASE %I SET pg_trgm.word_similarity_threshold = 0.45', current_database());
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE format('ALTER ROLE %I SET pg_trgm.word_similarity_threshold = 0.45', current_user);
  END;
END
$$;
