// Carga el .env de la raíz (DATABASE_URL) antes de las pruebas.
import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });
