// Identificadores generados en el cliente (para que el autoguardado pueda hacer upsert).
// Usa crypto.randomUUID, disponible en navegadores modernos y en Node >= 19.
export function newId(): string {
  return crypto.randomUUID();
}
