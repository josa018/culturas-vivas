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

## Sala Wixárika

El recorrido comienza en la sala wixárika. Incluye 17 fotografías en cinco
categorías: cultura (3), arte (2), vestimenta (3), alimentación (4) y vivienda (5).
Las imágenes están en `public/assets/wixarika/` y los textos en
`src/experience/wixarika.ts`. Se conservó la clasificación de los archivos recibidos;
no se atribuyen nombres de platillos, personas o edificios sin identificar.

- En el recorrido 3D/VR, cada categoría tiene controles Anterior/Siguiente.
- En 2D, los cuadros y sus botones responden al clic o toque en su posición;
  en VR se conserva el cursor de mirada. Los controles tienen un área ampliada.
- La sala tiene un entorno expositivo propio con cenefas del proyecto, rombos
  multicolor y piso/techo coordinados; es una interpretación gráfica contemporánea,
  no una reconstrucción de un templo o un espacio ceremonial.
- En modo 2D, «Explorar categorías · Wixárika» ofrece las fotos, un resumen y
  «Saber más» para consultar el resto sin saturar la pantalla.
- El selector superior permite visitar también las salas de demostración existentes.
- Las fotos se convirtieron a WebP, manteniendo su proporción y sin recortarlas.
  Para volver a importarlas: `node scripts/import-wixarika.mjs "ruta a la carpeta"`.
- Validación: `npm run build` y `npx vitest run`.
- En teléfonos, la barra superior se compacta y el panel de categorías permite
  desplazamiento interno, respeta las áreas seguras y funciona en ambas orientaciones.
  Para probar desde otro dispositivo en la misma red: `npm run dev -- --host 0.0.0.0`
  y abrir `http://IP-DE-LA-COMPUTADORA:5173`.

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
