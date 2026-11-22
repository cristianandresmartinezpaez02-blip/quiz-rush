// Serialización JSON estable (claves ordenadas) para comparar documentos.
// Necesaria porque PostgreSQL (jsonb) reordena las claves de los objetos.

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      // Igual que JSON: las claves con undefined desaparecen
      if (v !== undefined) out[key] = sortValue(v);
    }
    return out;
  }
  return value;
}
