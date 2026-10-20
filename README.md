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