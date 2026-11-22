// APIs globales disponibles tanto en navegadores modernos como en Node >= 19.
// El paquete compartido no incluye los tipos del DOM ni de Node, así que se declaran aquí.
declare function structuredClone<T>(value: T): T;
declare const crypto: { randomUUID(): string };
