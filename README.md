# Culturas Vivas

WebApp inmersiva (A-Frame + Vite + TypeScript) para explorar la exposición
cultural de la Biblioteca Pública de la Alameda con visor mecánico o en modo 2D.

## Requisitos
- Node 18 o superior
- Git

## Instalación
```bash
git clone https://github.com/josa018/culturas-vivas.git
cd culturas-vivas
npm install
```

## Desarrollo
```bash
npm run dev
```

## Build
```bash
npm run build
```

## Estructura
- `src/`: código de la aplicación (componentes y escenas)
- `public/assets/`: texturas 360°, íconos y audio
- `public/data/`: contrato JSON de la encuesta y ejemplos
- `api/`: endpoints (pendiente)
- `docs/`: documentos del proyecto (D1 a D4)

## Flujo de trabajo con ramas
- `main`: versión estable, solo recibe cambios desde `dev`.
- `dev`: integración del equipo.
- Cada tarea tiene su rama: `feature/<sprint>-<tarea>-<nombre>`.
- Todo cambio entra por Pull Request con la revisión de otro integrante
  antes de fusionarse, sin conflictos.

## Encuesta
Las respuestas siguen `public/data/encuesta.schema.json`.
No se recogen nombre, correo ni ubicación. Para validar los ejemplos:
`npm run validar:encuesta`

## Base de datos (Turso / SQLite)

El esquema vive en `db/migrations/` como archivos SQL numerados.
`npm run db:migrate` aplica solo los que faltan y los registra en la tabla
`_migrations`, así que se puede correr varias veces sin duplicar nada.

### Requisitos
Archivo `.env.local` en la raíz (no se sube a GitHub) con `TURSO_DATABASE_URL`
y `TURSO_AUTH_TOKEN`.

### Comandos
```bash
npm run db:migrate                # aplica las migraciones pendientes
npm run db:migrate -- --dry-run   # solo muestra tablas y pendientes, sin cambiar nada
```

### Tablas
| Tabla | Para qué sirve | Campos principales |
|---|---|---|
| `sessions` | Sesiones anónimas de visitantes | `id`, `uuid` (único), `created_at`, `last_ping`, `active` (0 o 1) |
| `users_admin` | Usuarios del dashboard `/admin` | `id`, `username` (único), `password_hash`, `role` (`admin` o `librarian`), `created_at` |
| `surveys` | Encuestas anónimas | `id`, `session_uuid`, `q1_rating`, `q2_ease`, `q3_recommend` (1 a 5), `created_at` |
| `access_logs` | Bitácora de accesos | `id`, `session_uuid`, `device_type`, `mode` (`vr` o `2d`), `created_at` |

`sessions`, `surveys` y `access_logs` tienen índices por `uuid` o `session_uuid`.
Las fechas usan `DATETIME DEFAULT CURRENT_TIMESTAMP` (UTC).

### Agregar una migración nueva
1. Crea el siguiente archivo numerado, por ejemplo `db/migrations/004_algo.sql`.
2. Usa `CREATE TABLE IF NOT EXISTS` y `CREATE INDEX IF NOT EXISTS` cuando se pueda.
3. Corre `npm run db:migrate -- --dry-run` y luego `npm run db:migrate`.

Nunca edites una migración que ya se aplicó: crea una nueva.

### Notas
- La tabla `sesiones` es una versión vieja del Sprint 2 y ya no se usa.
- No se guarda nombre, correo ni ubicación de los visitantes. Las contraseñas
  de `users_admin` se guardan solo como hash.