# Entrega del proyecto final: Quiz_Rush

Proyecto final del semillero: plataforma de quizzes en tiempo real.

## Documentos de la entrega

- Arquitectura y plan de fases: [docs/ARQUITECTURA.md](ARQUITECTURA.md)
- Escalado y costos: [docs/ESCALADO.md](ESCALADO.md)
- Pruebas de carga: [docs/carga/INFORME.md](carga/INFORME.md)

## Cómo correr las pruebas

```bash
npm install
npm run infra:up
npm test
```

`npm test` ejecuta las pruebas unitarias y de integración del servidor de tiempo real.
