import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..', '..');
export const casesRoot = resolve(repoRoot, 'cases');
export const apiBase = (process.env.SUPPLYGUARD_API_BASE || 'http://127.0.0.1:8000').replace(/\/+$/, '');
export function apiUrl(path) {
    return `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
}
