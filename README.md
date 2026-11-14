# CampusFix

## Base de datos — Semana 1

El modelo PostgreSQL, las relaciones, los comandos de instalación y la prueba
del esquema se documentan en [la guía de base de datos](apps/api/db/README.md).

Sistema Full-Stack para el reporte y seguimiento de incidencias en campus universitario.

## Arquitectura y Stack Tecnológico

- **Frontend:** Nuxt 4, Vue 3, TypeScript, Tailwind CSS y Pinia (despliegue en **Netlify**).
- **Backend:** Node.js, Express 5, API REST (despliegue en **Render** mediante Dockerfile).
- **Base de Datos:** PostgreSQL.
- **Entorno Local:** Docker y Docker Compose (`compose.yaml`).
- **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`).

## Estructura del Monorepo

```text
CampusFix/
├── apps/
│   ├── web/        # Frontend Nuxt 4
│   └── api/        # Backend Express 5
├── docker/         # Dockerfiles (ej. api.Dockerfile)
├── .github/        # Workflows de CI y plantillas de PR
├── compose.yaml    # Orquestación local (web, api, postgres)
├── netlify.toml    # Configuración de despliegue en Netlify
└── render.yaml     # Blueprint de despliegue en Render
```

## Flujo de Trabajo (Git & GitHub)

Está estrictamente prohibido hacer commits directos a `master` o `develop`.

1. Cambiarse a `develop` y actualizar: `git checkout develop && git pull origin develop`
2. Crear rama de feature: `git checkout -b feature/[nombre-de-la-tarea]`
3. Probar localmente con `docker compose up`
4. Subir rama y abrir un **Pull Request** hacia `develop`
5. Esperar revisión y aprobación del revisor asignado antes de hacer merge.
