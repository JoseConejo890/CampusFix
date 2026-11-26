# Actualización de incidencias

## Alcance

La API permite asignar técnicos, cambiar el estado de una incidencia y consultar
su historial. Se integra con el registro y listado existentes y utiliza las
tablas `users`, `incidents` e `incident_updates`.

El módulo comprueba permisos, valida los datos y guarda cada cambio junto con
su historial en una transacción. Su responsabilidad termina en la respuesta
HTTP; la interfaz de asignación y el inicio de sesión se integran por separado.

## Archivos

| Archivo | Cambio y motivo |
| --- | --- |
| `apps/api/src/incidentUpdatesValidation.js` | Valida el identificador, el estado, el responsable y el comentario; conserva los identificadores BIGINT como cadenas. |
| `apps/api/src/auth/resolveActorId.js` | Obtiene la identidad de un futuro middleware de sesión y ofrece un adaptador explícito de desarrollo para probar localmente. |
| `apps/api/src/errors.js` | Define `HttpError` para distinguir errores de negocio de fallos internos. |
| `apps/api/src/repositories/incidentUpdatesRepository.js` | Contiene las consultas PostgreSQL, permisos, transacciones, bloqueo de fila y lectura del historial. |
| `apps/api/src/routes/incidentUpdates.js` | Implementa `PATCH /:id` y `GET /:id/history`, valida las solicitudes y devuelve respuestas HTTP. |
| `apps/api/src/routes/incidents.js` | Monta las nuevas rutas dentro del router existente, después de GET y POST. |
| `apps/api/src/repositories/incidentsRepository.js` | Exporta la consulta `INCIDENT_SELECT` existente para reutilizar su formato de respuesta. |
| `apps/api/src/app.js` | Conecta los repositorios, permite inyectar identidad para las pruebas, habilita el encabezado local solo en desarrollo y responde 400 al JSON mal formado. |
| `apps/api/src/db.js` | Permite pasar un pool alternativo a `withTransaction`, conservando el pool normal por defecto. Esto facilita pruebas con datos aislados. |
| `compose.yaml` | Añade `DEV_AUTH_ENABLED`, apagado por defecto, y retira un comentario que describía la API como un placeholder. |
| `apps/api/test/incidentUpdates.integration.test.js` | Añade 10 pruebas con PostgreSQL real, incluida una que recorre HTTP y base de datos juntos. |
| `.github/workflows/api-updates.yml` | Prepara PostgreSQL 16 en GitHub Actions y ejecuta las pruebas de API e integración. |
| `README.md` | Añade un enlace a esta guía. |
| `docs/incident-updates.md` | Documenta el contrato, las decisiones, los ejemplos y las pruebas. |

No se requieren tablas nuevas, dependencias nuevas ni cambios a la migración de
la base de datos inicial. Se instalaron las dependencias existentes con `npm ci`; el archivo
de bloqueo se conserva.

## Flujo de una solicitud

```text
Cliente (frontend, PowerShell o Postman)
    │  PATCH /api/incidents/ID + JSON + identidad
    ▼
Express / app.js
    ▼
routes/incidents.js → routes/incidentUpdates.js
    │  Comprueba identidad, identificador y campos
    ▼
repositories/incidentUpdatesRepository.js
    │  Lee usuario y rol desde PostgreSQL
    │  Bloquea la incidencia y comprueba permisos
    │  Actualiza incidents e inserta incident_updates
    ▼
COMMIT → respuesta JSON
Error  → ROLLBACK → respuesta de error
```

El frontend muestra la información; la API decide si un cambio está permitido;
PostgreSQL guarda el resultado. Docker proporciona el entorno donde pueden
ejecutarse la API y PostgreSQL. El código de estas reglas está en Node.js, no en
Docker.

## Contrato de API

### PATCH `/api/incidents/:id`

Modifica únicamente los campos enviados. El cuerpo debe ser un objeto JSON con
al menos `status` o un responsable. No admite campos arbitrarios como `role`,
`reportedBy`, `changed_by`, títulos o prioridades.

| Campo | Tipo | Comportamiento |
| --- | --- | --- |
| `status` | Cadena | `open`, `in_progress`, `resolved` o `closed`. Si se omite, conserva el estado. |
| `assignedTo` | ID como cadena o entero seguro; también `null` | Un ID asigna o reasigna un técnico. `null` quita la asignación. Si se omite, conserva el responsable. |
| `assigned_to` | Igual que `assignedTo` | Alias compatible con los nombres de columnas. No se pueden enviar ambos alias juntos. |
| `comment` | Cadena opcional | Se recortan espacios exteriores. Debe tener entre 1 y 2000 caracteres. Se guarda con un cambio efectivo. |

Ejemplo de asignación y cambio de estado:

```json
{
  "assignedTo": "4",
  "status": "in_progress",
  "comment": "El técnico revisará el proyector."
}
```

Estructura de una respuesta 200 con valores de ejemplo:

```json
{
  "incident": {
    "id": "12",
    "title": "Proyector sin señal",
    "assigned_to": "4",
    "assigned_to_name": "Técnico de ejemplo",
    "status": "in_progress",
    "updated_at": "2026-11-20T22:00:00.000Z",
    "closed_at": null
  },
  "update": {
    "id": "25",
    "incident_id": "12",
    "changed_by": "7",
    "previous_status": "open",
    "new_status": "in_progress",
    "previous_assigned_to": null,
    "new_assigned_to": "4",
    "comment": "El técnico revisará el proyector.",
    "created_at": "2026-11-20T22:00:00.000Z"
  }
}
```

`incident` también incluye los demás campos de la consulta de incidencias,
como descripción, categoría, autor y fechas. Los IDs se devuelven como cadenas;
las fechas se serializan como fechas ISO en JSON. No se devuelven hashes de
contraseñas.

Si el estado y el responsable enviados ya son los actuales, responde 200 con
`update: null`. No cambia `updated_at` ni genera una entrada duplicada. En ese
caso tampoco guarda el comentario. Agregar comentarios independientes queda
fuera de este endpoint; enviar solamente `comment` produce 400.

### GET `/api/incidents/:id/history`

Devuelve `{ "updates": [...] }`, ordenado por `created_at` e `id`. Incluye los
estados y responsables anterior/nuevo, el usuario del cambio y nombres útiles
para la interfaz: `changed_by_name`, `previous_assigned_to_name` y
`new_assigned_to_name`. Si la incidencia existe y no tiene historial, devuelve
un arreglo vacío. Si la incidencia no existe, devuelve 404.

### Códigos de respuesta

| Código | Significado |
| --- | --- |
| 200 | Actualización o consulta correcta; puede ser una actualización sin cambios efectivos. |
| 400 | ID fuera de rango, cuerpo inválido, estado inválido, técnico inexistente/no técnico, campos desconocidos o JSON mal formado. |
| 401 | Falta identidad válida o el usuario identificado no existe. |
| 403 | El usuario existe, pero no tiene permiso para ese cambio. |
| 404 | La incidencia no existe. |
| 409 | El cambio dejaría una incidencia cerrada sin responsable. |
| 500 | Fallo interno inesperado; no se exponen los detalles de PostgreSQL al cliente. |

## Permisos e identificación

Solo un administrador puede asignar responsables. El rol
se consulta en `users`: no se acepta un rol enviado en el cuerpo ni un autor de
historial proporcionado en JSON.

| Operación | Administrador | Técnico asignado | Otro técnico | Estudiante |
| --- | --- | --- | --- | --- |
| Asignar, reasignar o quitar responsable | Sí | No | No | No |
| Cambiar estado | Sí | Sí | No | No |
| Leer historial con usuario existente | Sí | Sí | Sí | Sí |

Permitir el cambio de estado solo al administrador o al técnico asignado es una
decisión de esta implementación para no dejar la actualización abierta a
cualquier usuario. No se imponen transiciones obligatorias entre los estados admitidos.

**La autenticación de sesiones está pendiente de integración.**
La función `resolveActorId` está preparada para leer `req.user.id` de un
middleware que verifique una sesión o token. Ese middleware no forma parte de
este módulo; el encabezado `Authorization` por sí solo todavía no se valida.

Para probar ahora, hay un adaptador local que lee `X-User-Id` únicamente cuando
se cumplen ambas condiciones:

```text
NODE_ENV=development
DEV_AUTH_ENABLED=true
```

El adaptador está apagado por defecto. Es una simulación de identidad: alguien
con acceso al entorno de desarrollo puede elegir el ID. No equivale a una
autenticación segura. En producción se ignora aunque `DEV_AUTH_ENABLED` esté
en `true`. Hasta integrar una sesión real que establezca `req.user.id`, los dos
endpoints nuevos responden 401 en producción. GET/POST existentes mantienen su
comportamiento anterior; este módulo no agrega autenticación global a esos
endpoints.

La vista de historial debe enviar la identidad definida por
el mecanismo de autenticación que se integre. Durante la demo local puede usar
`X-User-Id` con el adaptador habilitado. La respuesta de historial usa la clave
`updates`. La pantalla de asignación y el catálogo HTTP de técnicos se integran por separado.

## Implementación

### Validación e IDs

`parseId` admite enteros positivos seguros de JavaScript o cadenas numéricas
positivas, hasta `9223372036854775807`, máximo de BIGINT de PostgreSQL. Conserva
el valor como cadena para no redondear IDs grandes. `validateIncidentPatch`
distingue una propiedad ausente de una propiedad con `null`; esa diferencia es
necesaria para conservar o quitar una asignación.

### Rutas y repositorio

La ruta se encarga de HTTP: parámetros, JSON y códigos de respuesta. El
repositorio se encarga de SQL y permisos que requieren información real de la
base. Separarlos permite probar el contrato HTTP con un repositorio simulado y
las reglas de datos con PostgreSQL real.

### Transacción

`withTransaction` obtiene una conexión del pool y ejecuta `BEGIN`. Si la función
termina bien, ejecuta `COMMIT`. Si algo falla, ejecuta `ROLLBACK`. Al terminar,
libera la conexión en `finally`. Todas las consultas del cambio utilizan esa
misma conexión: actualizar la incidencia sin guardar su historial no puede
convertirse en un resultado confirmado.

### Cambios simultáneos

`SELECT ... FOR UPDATE` bloquea la fila de la incidencia mientras se calcula y
guarda el cambio. Otra solicitud sobre la misma incidencia espera. Al continuar,
lee los valores ya actualizados y registra el responsable y estado anteriores
correctos. Las lecturas de roles usan `FOR SHARE` para mantenerlos estables
durante la transacción.

### SQL parametrizado

Los datos del usuario se envían mediante `$1`, `$2`, etc. y un arreglo de valores.
No se concatenan dentro del SQL. El historial toma `changed_by` del contexto de
identidad validado y consultado en PostgreSQL, nunca del JSON enviado por el
cliente.

### Fechas y cierre

Cada cambio efectivo usa un solo instante de PostgreSQL para `updated_at`
y el historial. Al cerrar, usa ese mismo instante para `closed_at`.
Las reasignaciones conservan la fecha de cierre y al reabrir se limpia.

El endpoint rechaza cerrar sin responsable y quitar al responsable de una
incidencia que continúa cerrada. Se puede reabrir y quitar al responsable en la
misma solicitud. La migración 002 también comprueba en PostgreSQL que las
incidencias cerradas tengan responsable y que `closed_at` corresponda al estado.

## Ejecución y pruebas

### A. Iniciar con Docker Compose

Desde la raíz de CampusFix, en PowerShell, con Docker Desktop funcionando:

```powershell
$env:DEV_AUTH_ENABLED = 'true'
docker compose config -q
docker compose up -d --build --wait api
```

Esto levanta la API y su dependencia PostgreSQL. La API queda en
`http://localhost:4000`. La opción de desarrollo se activa explícitamente en
esta consola. La imagen de la API copia su código al construirla: después de
cambiar el backend hay que reconstruirla con `--build`.

Si la base ya tiene las tablas, no se vuelve a ejecutar la migración inicial.
No hace falta borrar el volumen ni modificar sus datos. La guía de
`apps/api/db/README.md` explica cómo aplicar la migración si la base aún no tiene
el esquema.

Para consultar IDs existentes, sin inventar usuarios o incidencias:

```powershell
docker compose exec -T db psql -U campusfix -d campusfix_dev -c "SELECT id, name, role FROM users ORDER BY id;"
docker compose exec -T db psql -U campusfix -d campusfix_dev -c "SELECT id, title, status, assigned_to FROM incidents ORDER BY id;"
```

Los ejemplos siguientes usan IDs ilustrativos: reemplazarlos con un
administrador, un técnico y una incidencia existentes. No se agregan
seeds permanentes de demostración.

```powershell
$adminId = '7'
$technicianId = '4'
$incidentId = '12'
$headers = @{ 'X-User-Id' = $adminId }
$body = @{
    assignedTo = $technicianId
    status = 'in_progress'
    comment = 'El tecnico revisara el proyector.'
} | ConvertTo-Json

Invoke-RestMethod -Method Patch `
    -Uri "http://localhost:4000/api/incidents/$incidentId" `
    -Headers $headers -ContentType 'application/json' -Body $body

Invoke-RestMethod -Method Get `
    -Uri "http://localhost:4000/api/incidents/$incidentId/history" `
    -Headers $headers
```

Para desactivar la identidad local en Compose:

```powershell
Remove-Item Env:DEV_AUTH_ENABLED -ErrorAction SilentlyContinue
docker compose up -d api
```

### B. Ejecutar la API directamente con Node.js

Con PostgreSQL iniciado, desde `apps/api`:

```powershell
npm ci
$env:DATABASE_URL = 'postgresql://campusfix:campusfix_dev@127.0.0.1:5432/campusfix_dev'
$env:NODE_ENV = 'development'
$env:DEV_AUTH_ENABLED = 'true'
$env:PORT = '4000'
npm start
```

Este modo ejecuta el mismo código sin reconstruir una imagen y evita necesitar
acceso de la terminal al motor de Docker, siempre que PostgreSQL esté accesible
en el puerto 5432.

### C. Pruebas automáticas

Desde `apps/api`, sin conexión de prueba configurada:

```powershell
npm test
```

Las pruebas de integración se omiten si no existe `TEST_DATABASE_URL`.

Para ejecutar la suite completa con PostgreSQL local iniciado:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://campusfix:campusfix_dev@127.0.0.1:5432/campusfix_dev'
npm test
```

Las pruebas de integración crean un esquema temporal con nombre aleatorio,
aplican allí las migraciones y generan sus propios usuarios e incidencias.
Al terminar eliminan solo ese esquema temporal. No truncan ni actualizan las
tablas de la aplicación. El usuario de pruebas necesita permiso para crear
esquemas. Si el proceso se interrumpe de forma forzada, puede quedar un esquema
temporal `campusfix_test_...`; no se debe confundir con los datos de la aplicación.

### D. Comprobación en GitHub Actions

El workflow nuevo utiliza Node.js 22 y un servicio PostgreSQL 16 aislado. Instala
las dependencias existentes con `npm ci` y ejecuta `npm test` con la conexión de
pruebas configurada. Se activa en los PR hacia `develop` con cambios en
`apps/api/**` o el workflow, y en los pushes equivalentes a `feature/api-updates`.
No depende de los datos ni de Docker Desktop de un integrante del equipo.

## Verificación

Verificación local del 20 de noviembre de 2026:

- `develop` estaba actualizado con `origin/develop` antes de crear la rama.
- `npm ci` instaló las dependencias de la API sin agregar dependencias al proyecto.
- `docker compose config -q`: configuración válida.
- Pruebas locales: Node.js `v24.20.0`, PostgreSQL 16 del contenedor local.
- `npm test` con `TEST_DATABASE_URL`: **18 pruebas, 18 aprobadas, 0 fallos, 0 omitidas**.
- Se eliminaron las pruebas HTTP simuladas duplicadas. Las validaciones críticas
  se conservan en la prueba HTTP con PostgreSQL real, junto con la comprobación
  de que la identidad de desarrollo está desactivada en producción.
- Se verificó la actualización y el historial a través de HTTP con PostgreSQL real.
- Se verificó que un error real al insertar historial revierte la incidencia.
- Se verificó que dos cambios simultáneos mantienen una cadena de historial coherente.
- `git diff --check`: sin errores de espacios.

Docker CLI desde la terminal de esta sesión devolvió un error de acceso al motor
de Windows. Se inició únicamente el contenedor `db` existente desde Docker
Desktop y las pruebas se conectaron por TCP al puerto 5432. El build y arranque
completo de la API en Docker no se ejecutaron desde esta sesión. El workflow
nuevo aún debe ejecutarse en GitHub al subir la rama; los resultados locales no
equivalen a afirmar que ese workflow ya pasó en GitHub. El frontend no fue
modificado ni se probó una pantalla nueva de asignaciones.

## Código de referencia

Los anexos contienen los archivos de backend afectados, las pruebas y el
workflow. Los archivos fuente son la versión ejecutable; al modificarlos,
actualizar también los ejemplos correspondientes.

En Compose el cambio funcional añadido es:

```yaml
DEV_AUTH_ENABLED: ${DEV_AUTH_ENABLED:-false}
```

En `README.md` se añadió el enlace a esta guía. A continuación se incluyen los
archivos de producción completos afectados, las pruebas nuevas y el workflow.

<!-- GENERATED SOURCE APPENDIX -->

### Anexo 1. Validación de los datos nuevos

Archivo: `apps/api/src/incidentUpdatesValidation.js`.

```javascript
const MAX_ID = 9223372036854775807n;
const STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const FIELDS = new Set(['status', 'assignedTo', 'assigned_to', 'comment']);

// PostgreSQL BIGINT ids remain strings: converting them to Number can lose precision.
export function parseId(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return String(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[1-9]\d{0,18}$/.test(trimmed) || BigInt(trimmed) > MAX_ID) return null;
  return trimmed;
}

export function validateIncidentPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }
  const errors = [];
  const changes = {};
  for (const key of Object.keys(body)) {
    if (!FIELDS.has(key)) errors.push(`Unknown field: ${key}`);
  }
  if (Object.hasOwn(body, 'assignedTo') && Object.hasOwn(body, 'assigned_to')) {
    errors.push('Use either assignedTo or assigned_to, not both');
  }
  if (Object.hasOwn(body, 'status')) {
    if (!STATUSES.has(body.status)) {
      errors.push('status must be one of: open, in_progress, resolved, closed');
    } else changes.status = body.status;
  }
  if (Object.hasOwn(body, 'assignedTo') || Object.hasOwn(body, 'assigned_to')) {
    const value = Object.hasOwn(body, 'assignedTo') ? body.assignedTo : body.assigned_to;
    const id = value === null ? null : parseId(value);
    if (value !== null && id === null) {
      errors.push('assignedTo must be a positive BIGINT id or null');
    } else changes.assignedTo = id;
  }
  if (Object.hasOwn(body, 'comment')) {
    if (typeof body.comment !== 'string' || !body.comment.trim() || body.comment.trim().length > 2000) {
      errors.push('comment must be a non-empty string of at most 2000 characters');
    } else changes.comment = body.comment.trim();
  }
  if (!Object.hasOwn(body, 'status') && !Object.hasOwn(body, 'assignedTo') && !Object.hasOwn(body, 'assigned_to')) {
    errors.push('Provide status or assignedTo');
  }
  return errors.length ? { errors } : { data: changes };
}
```

### Anexo 2. Resolución de identidad

Archivo: `apps/api/src/auth/resolveActorId.js`.

```javascript
import { parseId } from '../incidentUpdatesValidation.js';

// X-User-Id is available only in development with explicit opt-in.
export function resolveActorId(req) {
  if (req.user) return parseId(req.user.id);
  if (process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_ENABLED === 'true') {
    return parseId(req.get('X-User-Id'));
  }
  return null;
}
```

### Anexo 3. Errores con código HTTP

Archivo: `apps/api/src/errors.js`.

```javascript
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
```

### Anexo 4. Reglas, transacción e historial

Archivo: `apps/api/src/repositories/incidentUpdatesRepository.js`.

```javascript
import { withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { INCIDENT_SELECT } from './incidentsRepository.js';

async function requireActor(client, actorId) {
  const { rows } = await client.query('SELECT id, role FROM users WHERE id = $1 FOR SHARE', [actorId]);
  if (!rows[0]) throw new HttpError(401, 'Unknown authenticated user');
  return rows[0];
}

export function createIncidentUpdatesRepository({ transaction = withTransaction } = {}) {
  return {
    async updateIncident({ incidentId, actorId, changes }) {
      return transaction(async (client) => {
        const actor = await requireActor(client, actorId);
        if (!['admin', 'technician'].includes(actor.role)) {
          throw new HttpError(403, 'Only administrators or assigned technicians can update incidents');
        }

        // Serialize concurrent changes so each history entry has the real previous values.
        const { rows: lockedRows } = await client.query(
          'SELECT id, status, assigned_to FROM incidents WHERE id = $1 FOR UPDATE', [incidentId],
        );
        const previous = lockedRows[0];
        if (!previous) throw new HttpError(404, 'Incident not found');

        const hasAssignment = Object.hasOwn(changes, 'assignedTo');
        if (hasAssignment && actor.role !== 'admin') {
          throw new HttpError(403, 'Only administrators can assign or unassign technicians');
        }
        if (actor.role === 'technician' && previous.assigned_to !== actor.id) {
          throw new HttpError(403, 'Technicians can only update their assigned incidents');
        }

        const nextAssignee = hasAssignment ? changes.assignedTo : previous.assigned_to;
        if (hasAssignment && nextAssignee !== null) {
          const { rows } = await client.query(
            'SELECT id, role FROM users WHERE id = $1 FOR SHARE', [nextAssignee],
          );
          if (!rows[0] || rows[0].role !== 'technician') {
            throw new HttpError(400, 'Assignee must be an existing technician');
          }
        }
        const nextStatus = changes.status ?? previous.status;
        if (nextStatus === 'closed' && nextAssignee === null) {
          throw new HttpError(409, 'Cannot close an incident without an assigned technician');
        }

        if (nextStatus === previous.status && nextAssignee === previous.assigned_to) {
          const { rows } = await client.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [incidentId]);
          return { incident: rows[0], update: null };
        }

        const { rows: [saved] } = await client.query(`
          WITH change_time AS (SELECT clock_timestamp() AS value)
          UPDATE incidents
          SET status = $2, assigned_to = $3, updated_at = change_time.value,
              closed_at = CASE WHEN $2 = 'closed'
                THEN COALESCE(closed_at, change_time.value) ELSE NULL END
          FROM change_time
          WHERE id = $1
          RETURNING updated_at::text AS changed_at
        `, [incidentId, nextStatus, nextAssignee]);

        const { rows: updates } = await client.query(`
          INSERT INTO incident_updates
            (incident_id, changed_by, previous_status, new_status,
             previous_assigned_to, new_assigned_to, comment, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [incidentId, actor.id, previous.status, nextStatus,
          previous.assigned_to, nextAssignee, changes.comment ?? null, saved.changed_at]);

        const { rows } = await client.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [incidentId]);
        return { incident: rows[0], update: updates[0] };
      });
    },

    async listIncidentHistory({ incidentId, actorId }) {
      return transaction(async (client) => {
        await requireActor(client, actorId);
        const { rows: incidents } = await client.query('SELECT id FROM incidents WHERE id = $1', [incidentId]);
        if (!incidents[0]) throw new HttpError(404, 'Incident not found');
        const { rows } = await client.query(`
          SELECT u.id, u.incident_id, u.changed_by, actor.name AS changed_by_name,
                 u.previous_status, u.new_status,
                 u.previous_assigned_to, previous_user.name AS previous_assigned_to_name,
                 u.new_assigned_to, next_user.name AS new_assigned_to_name,
                 u.comment, u.created_at
          FROM incident_updates u
          JOIN users actor ON actor.id = u.changed_by
          LEFT JOIN users previous_user ON previous_user.id = u.previous_assigned_to
          LEFT JOIN users next_user ON next_user.id = u.new_assigned_to
          WHERE u.incident_id = $1
          ORDER BY u.created_at, u.id
        `, [incidentId]);
        return rows;
      });
    },
  };
}

export const defaultIncidentUpdatesRepository = createIncidentUpdatesRepository();
```

### Anexo 5. Rutas HTTP nuevas

Archivo: `apps/api/src/routes/incidentUpdates.js`.

```javascript
import { Router } from 'express';
import { resolveActorId as defaultResolveActorId } from '../auth/resolveActorId.js';
import { HttpError } from '../errors.js';
import { parseId, validateIncidentPatch } from '../incidentUpdatesValidation.js';

export function createIncidentUpdatesRouter(repository, { resolveActorId = defaultResolveActorId } = {}) {
  const router = Router();

  router.use((req, res, next) => {
    const actorId = resolveActorId(req);
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });
    res.locals.actorId = actorId;
    return next();
  });

  function sendError(error, res, next) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }

  router.patch('/:id', async (req, res, next) => {
    const incidentId = parseId(req.params.id);
    if (!incidentId) return res.status(400).json({ error: 'Invalid incident id' });
    const validation = validateIncidentPatch(req.body);
    if (validation.errors) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }
    try {
      const result = await repository.updateIncident({
        incidentId, actorId: res.locals.actorId, changes: validation.data,
      });
      return res.json(result);
    } catch (error) {
      return sendError(error, res, next);
    }
  });

  router.get('/:id/history', async (req, res, next) => {
    const incidentId = parseId(req.params.id);
    if (!incidentId) return res.status(400).json({ error: 'Invalid incident id' });
    try {
      const updates = await repository.listIncidentHistory({ incidentId, actorId: res.locals.actorId });
      return res.json({ updates });
    } catch (error) {
      return sendError(error, res, next);
    }
  });

  return router;
}
```

### Anexo 6. Aplicación Express e integración de rutas

Archivo: `apps/api/src/app.js`.

```javascript
import express from 'express';
import { defaultIncidentsRepository } from './repositories/incidentsRepository.js';
import { createIncidentsRouter } from './routes/incidents.js';
import { defaultIncidentUpdatesRepository } from './repositories/incidentUpdatesRepository.js';

/**
 * Creates the Express application with configurable repositories for testing.
 */
export function createApp({
  incidentsRepository = { ...defaultIncidentsRepository, ...defaultIncidentUpdatesRepository },
  resolveActorId,
} = {}) {
  const app = express();

  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    const devAuth = process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_ENABLED === 'true';
    res.setHeader('Access-Control-Allow-Headers', `Content-Type,Authorization${devAuth ? ',X-User-Id' : ''}`);
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/incidents', createIncidentsRouter(incidentsRepository, { resolveActorId }));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

const app = createApp();

export default app;
```

### Anexo 7. Conexión y transacciones

Archivo: `apps/api/src/db.js`.

```javascript
import pg from 'pg';

const { Pool } = pg;

let pool;

/**
 * Returns the shared PostgreSQL connection pool, initializing it on first use.
 */
export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    const useSsl = process.env.DATABASE_SSL === 'true';
    pool = new Pool({
      connectionString,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }

  return pool;
}

/**
 * Executes a callback inside a PostgreSQL transaction, committing on success
 * and rolling back on any thrown error.
 */
export async function withTransaction(callback, databasePool = getPool()) {
  const client = await databasePool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### Anexo 8. Router existente con las rutas nuevas

Archivo: `apps/api/src/routes/incidents.js`.

```javascript
import { Router } from 'express';
import { createIncidentUpdatesRouter } from './incidentUpdates.js';

const VALID_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);
const POSITIVE_INT_REGEX = /^[1-9]\d*$/;

function parseNonEmptyString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (POSITIVE_INT_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Validates and normalizes the request body for POST /api/incidents.
 */
function validateCreateIncidentBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }

  const errors = [];
  const title = parseNonEmptyString(body.title);
  const description = parseNonEmptyString(body.description);
  const location = parseNonEmptyString(body.location);
  const categoryId = parsePositiveId(body.categoryId ?? body.category_id);
  const reportedBy = parsePositiveId(body.reportedBy ?? body.reported_by);
  const priority = body.priority === undefined ? 'medium' : body.priority;

  if (!title) {
    errors.push('title is required and must be a non-empty string');
  }
  if (!description) {
    errors.push('description is required and must be a non-empty string');
  }
  if (!location) {
    errors.push('location is required and must be a non-empty string');
  }
  if (!categoryId) {
    errors.push('categoryId is required and must be a positive integer');
  }
  if (!reportedBy) {
    errors.push('reportedBy is required and must be a positive integer');
  }
  if (typeof priority !== 'string' || !VALID_PRIORITIES.has(priority)) {
    errors.push('priority must be one of: low, medium, high');
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    data: {
      title,
      description,
      location,
      categoryId,
      reportedBy,
      priority,
    },
  };
}

/**
 * Builds the Express router for /api/incidents endpoints.
 */
export function createIncidentsRouter(repository, options = {}) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { status, priority, categoryId } = req.query;

      if (status !== undefined && (typeof status !== 'string' || !VALID_STATUSES.has(status))) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }

      if (priority !== undefined && (typeof priority !== 'string' || !VALID_PRIORITIES.has(priority))) {
        return res.status(400).json({ error: 'Invalid priority filter' });
      }

      let parsedCategoryId;
      if (categoryId !== undefined) {
        parsedCategoryId = parsePositiveId(categoryId);
        if (!parsedCategoryId) {
          return res.status(400).json({ error: 'Invalid categoryId filter' });
        }
      }

      const incidents = await repository.listIncidents({
        status,
        priority,
        categoryId: parsedCategoryId,
      });

      return res.json({ incidents });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const validation = validateCreateIncidentBody(req.body);
    if (validation.errors) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    try {
      const incident = await repository.createIncident(validation.data);
      return res.status(201).json({ incident });
    } catch (error) {
      if (error?.code === '23503') {
        return res.status(400).json({
          error: 'Referenced category or user does not exist',
        });
      }
      if (error?.code === '23514') {
        return res.status(400).json({
          error: 'Invalid incident data',
        });
      }
      return next(error);
    }
  });

  router.use(createIncidentUpdatesRouter(repository, options));
  return router;
}
```

### Anexo 9. Repositorio existente y consulta reutilizada

Archivo: `apps/api/src/repositories/incidentsRepository.js`.

```javascript
import { getPool, withTransaction } from '../db.js';

export const INCIDENT_SELECT = `
  SELECT
    i.id,
    i.title,
    i.description,
    i.location,
    i.category_id,
    c.name AS category_name,
    i.reported_by,
    reporter.name AS reported_by_name,
    i.assigned_to,
    assignee.name AS assigned_to_name,
    i.status,
    i.priority,
    i.created_at,
    i.updated_at,
    i.closed_at
  FROM incidents i
  INNER JOIN categories c ON c.id = i.category_id
  INNER JOIN users reporter ON reporter.id = i.reported_by
  LEFT JOIN users assignee ON assignee.id = i.assigned_to
`;

/**
 * Lists incidents ordered from newest to oldest with optional filters.
 */
export async function listIncidents({ status, priority, categoryId } = {}) {
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`i.status = $${values.length}`);
  }

  if (priority) {
    values.push(priority);
    conditions.push(`i.priority = $${values.length}`);
  }

  if (categoryId) {
    values.push(categoryId);
    conditions.push(`i.category_id = $${values.length}`);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const sql = `
    ${INCIDENT_SELECT}
    ${whereClause}
    ORDER BY i.created_at DESC, i.id DESC
  `;

  const { rows } = await getPool().query(sql, values);
  return rows;
}

/**
 * Creates a new incident and records its initial open status in incident_updates
 * within the same database transaction.
 */
export async function createIncident({
  title,
  description,
  location,
  categoryId,
  reportedBy,
  priority = 'medium',
}) {
  return withTransaction(async (client) => {
    const insertIncidentSql = `
      INSERT INTO incidents (
        title,
        description,
        location,
        category_id,
        reported_by,
        priority
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const { rows: insertedRows } = await client.query(insertIncidentSql, [
      title,
      description,
      location,
      categoryId,
      reportedBy,
      priority,
    ]);

    const incidentId = insertedRows[0].id;

    await client.query(
      `
        INSERT INTO incident_updates (
          incident_id,
          changed_by,
          previous_status,
          new_status,
          comment
        )
        VALUES ($1, $2, NULL, 'open', 'Incidencia reportada')
      `,
      [incidentId, reportedBy],
    );

    const { rows } = await client.query(
      `${INCIDENT_SELECT} WHERE i.id = $1`,
      [incidentId],
    );

    return rows[0];
  });
}

export const defaultIncidentsRepository = {
  listIncidents,
  createIncident,
};
```

### Anexo 10. Pruebas nuevas con PostgreSQL real

Archivo: `apps/api/test/incidentUpdates.integration.test.js`.

```javascript
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { withTransaction } from '../src/db.js';
import { createIncidentUpdatesRepository } from '../src/repositories/incidentUpdatesRepository.js';
import { createApp } from '../src/app.js';

const connectionString = process.env.TEST_DATABASE_URL;
const integration = (name, fn) => test(name, { skip: !connectionString }, fn);
// Every run owns a separate schema; application data is never truncated or modified.
const schema = `campusfix_test_${randomUUID().replaceAll('-', '')}`;
let adminPool;
let pool;
let repository;

before(async () => {
  if (!connectionString) return;
  adminPool = new pg.Pool({ connectionString });
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}` });
  for (const file of ['001_schema.sql', '002_closure.sql']) {
    await pool.query(await readFile(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8'));
  }
  repository = createIncidentUpdatesRepository({ transaction: (callback) => withTransaction(callback, pool) });
});

after(async () => {
  await pool?.end();
  if (adminPool) {
    try { await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await adminPool.end(); }
  }
});

async function fixture() {
  const ids = {};
  for (const [name, role] of [['admin', 'admin'], ['student', 'student'], ['tech', 'technician'], ['otherTech', 'technician']]) {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, `${randomUUID()}@example.invalid`, 'test-only', role],
    );
    ids[name] = rows[0].id;
  }
  const { rows: categories } = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [randomUUID()]);
  const { rows: incidents } = await pool.query(`
    INSERT INTO incidents (title, description, location, category_id, reported_by)
    VALUES ('Lamp', 'No light', 'Library', $1, $2) RETURNING id
  `, [categories[0].id, ids.student]);
  ids.incident = incidents[0].id;
  return ids;
}

function update(f, changes, actorId = f.admin) {
  return repository.updateIncident({ incidentId: f.incident, actorId, changes });
}

async function state(incidentId) {
  const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1', [incidentId]);
  const { rows: history } = await pool.query('SELECT * FROM incident_updates WHERE incident_id = $1 ORDER BY created_at, id', [incidentId]);
  return { incident: rows[0], history };
}

integration('admin assignment and status change persist together with complete history', async () => {
  const f = await fixture();
  const result = await update(f, { assignedTo: f.tech, status: 'in_progress', comment: 'Revisar lámpara' });
  assert.equal(result.incident.assigned_to, f.tech);
  assert.equal(result.incident.assigned_to_name, 'tech');
  assert.equal(result.incident.status, 'in_progress');
  assert.equal(result.update.changed_by, f.admin);
  assert.equal(result.update.previous_status, 'open');
  assert.equal(result.update.previous_assigned_to, null);
  assert.equal(result.update.new_assigned_to, f.tech);
  assert.equal(result.update.comment, 'Revisar lámpara');
  assert.ok(result.update.created_at instanceof Date);
  assert.equal((await state(f.incident)).history.length, 1);
});

integration('student cannot assign or change status; unassigned technician cannot update', async () => {
  const f = await fixture();
  await assert.rejects(update(f, { assignedTo: f.tech }, f.student), { status: 403 });
  await assert.rejects(update(f, { status: 'resolved' }, f.student), { status: 403 });
  await assert.rejects(update(f, { status: 'resolved' }, f.tech), { status: 403 });
  const current = await state(f.incident);
  assert.equal(current.incident.status, 'open');
  assert.equal(current.history.length, 0);
});

integration('only assigned technician can change status and cannot assign even themselves', async () => {
  const f = await fixture();
  await update(f, { assignedTo: f.tech });
  await assert.rejects(update(f, { status: 'resolved' }, f.otherTech), { status: 403 });
  await assert.rejects(update(f, { assignedTo: f.tech }, f.tech), { status: 403 });
  const result = await update(f, { status: 'resolved' }, f.tech);
  assert.equal(result.update.changed_by, f.tech);
  assert.equal(result.update.new_assigned_to, f.tech);
});

integration('unknown actor, incident, missing assignee and non-technician are rejected without partial writes', async () => {
  const f = await fixture();
  await assert.rejects(update(f, { status: 'resolved' }, '9223372036854775807'), { status: 401 });
  await assert.rejects(repository.updateIncident({ incidentId: '9223372036854775807', actorId: f.admin, changes: { status: 'resolved' } }), { status: 404 });
  for (const assignedTo of [f.student, f.admin, '9223372036854775807']) {
    await assert.rejects(update(f, { assignedTo, status: 'in_progress' }), { status: 400 });
  }
  assert.equal((await state(f.incident)).history.length, 0);
  assert.equal((await state(f.incident)).incident.status, 'open');
});

integration('reassignment, unassignment and no-op retain the correct history', async () => {
  const f = await fixture();
  await update(f, { assignedTo: f.tech });
  const reassigned = await update(f, { assignedTo: f.otherTech });
  assert.equal(reassigned.update.previous_assigned_to, f.tech);
  assert.equal(reassigned.update.new_assigned_to, f.otherTech);
  assert.equal(reassigned.update.previous_status, 'open');
  assert.equal(reassigned.update.new_status, 'open');
  const noOp = await update(f, { assignedTo: f.otherTech, status: 'open' });
  assert.equal(noOp.update, null);
  assert.equal(noOp.incident.updated_at.getTime(), reassigned.incident.updated_at.getTime());
  const unassigned = await update(f, { assignedTo: null });
  assert.equal(unassigned.update.previous_assigned_to, f.otherTech);
  assert.equal(unassigned.incident.assigned_to, null);
  assert.equal((await state(f.incident)).history.length, 3);
});

integration('closing requires an assignee and closing/reopening maintains dates', async () => {
  const f = await fixture();
  await assert.rejects(update(f, { status: 'closed' }), { status: 409 });
  const closed = await update(f, { assignedTo: f.tech, status: 'closed' });
  assert.ok(closed.incident.closed_at instanceof Date);
  assert.ok(closed.incident.updated_at >= closed.incident.created_at);
  const { rows: [timestamps] } = await pool.query(`
    SELECT i.closed_at = i.updated_at AND i.updated_at = u.created_at AS match
    FROM incidents i JOIN incident_updates u ON u.incident_id = i.id
    WHERE u.id = $1
  `, [closed.update.id]);
  assert.equal(timestamps.match, true);
  await assert.rejects(update(f, { assignedTo: null }), { status: 409 });
  const reassigned = await update(f, { assignedTo: f.otherTech });
  assert.deepEqual(reassigned.incident.closed_at, closed.incident.closed_at);
  const reopened = await update(f, { status: 'open' });
  assert.equal(reopened.incident.closed_at, null);
  assert.equal(reopened.update.previous_status, 'closed');
});

integration('PostgreSQL rejects inconsistent closures even outside the API', async () => {
  const f = await fixture();
  await assert.rejects(pool.query(
    "UPDATE incidents SET status = 'closed', closed_at = now() WHERE id = $1", [f.incident],
  ), { code: '23514', constraint: 'incidents_closed_requires_assignee' });
  await assert.rejects(pool.query(
    "UPDATE incidents SET status = 'closed', assigned_to = $2 WHERE id = $1", [f.incident, f.tech],
  ), { code: '23514', constraint: 'incidents_closed_at_matches_status' });
  await assert.rejects(pool.query(
    'UPDATE incidents SET closed_at = now() WHERE id = $1', [f.incident],
  ), { code: '23514', constraint: 'incidents_closed_at_matches_status' });
});

integration('history exposes author and assignee names in chronological order without password hashes', async () => {
  const f = await fixture();
  assert.deepEqual(await repository.listIncidentHistory({ incidentId: f.incident, actorId: f.student }), []);
  await update(f, { assignedTo: f.tech });
  await update(f, { status: 'resolved' }, f.tech);
  const history = await repository.listIncidentHistory({ incidentId: f.incident, actorId: f.student });
  assert.equal(history.length, 2);
  assert.equal(history[0].changed_by_name, 'admin');
  assert.equal(history[0].new_assigned_to_name, 'tech');
  assert.equal(history[1].changed_by_name, 'tech');
  assert.ok(history[0].created_at <= history[1].created_at);
  assert.ok(history.every((entry) => !Object.hasOwn(entry, 'password_hash')));
  await assert.rejects(repository.listIncidentHistory({ incidentId: '9223372036854775807', actorId: f.admin }), { status: 404 });
});

integration('failure while inserting history rolls back the incident and releases the connection', async () => {
  const f = await fixture();
  const original = await state(f.incident);
  // Inject an actual PostgreSQL error after UPDATE and before history is inserted.
  const failingRepository = createIncidentUpdatesRepository({
    transaction: (callback) => withTransaction((client) => callback({
      query: (sql, values) => sql.includes('INSERT INTO incident_updates')
        ? client.query('SELECT 1 / 0') : client.query(sql, values),
    }), pool),
  });
  await assert.rejects(failingRepository.updateIncident({
    incidentId: f.incident, actorId: f.admin, changes: { assignedTo: f.tech, status: 'in_progress' },
  }), { code: '22012' });
  assert.deepEqual(await state(f.incident), original);
  assert.equal((await update(f, { assignedTo: f.tech })).incident.assigned_to, f.tech);
});

integration('concurrent updates record a continuous chain of previous and new values', async () => {
  const f = await fixture();
  await Promise.all([
    update(f, { assignedTo: f.tech, status: 'in_progress' }),
    update(f, { assignedTo: f.otherTech, status: 'resolved' }),
  ]);
  const { incident, history } = await state(f.incident);
  assert.equal(history.length, 2);
  assert.equal(history[0].previous_status, 'open');
  assert.equal(history[0].previous_assigned_to, null);
  assert.equal(history[1].previous_status, history[0].new_status);
  assert.equal(history[1].previous_assigned_to, history[0].new_assigned_to);
  assert.equal(incident.status, history[1].new_status);
  assert.equal(incident.assigned_to, history[1].new_assigned_to);
});

integration('HTTP PATCH and GET history work end to end with PostgreSQL and development identity', async (t) => {
  const f = await fixture();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevAuth = process.env.DEV_AUTH_ENABLED;
  process.env.NODE_ENV = 'development';
  process.env.DEV_AUTH_ENABLED = 'true';
  t.after(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    if (originalDevAuth === undefined) delete process.env.DEV_AUTH_ENABLED; else process.env.DEV_AUTH_ENABLED = originalDevAuth;
  });
  const server = createApp({ incidentsRepository: repository }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const url = `http://127.0.0.1:${server.address().port}/api/incidents/${f.incident}`;
  const body = JSON.stringify({ assignedTo: f.tech, status: 'in_progress' });
  const anonymous = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(anonymous.status, 401);
  const response = await fetch(url, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-User-Id': f.admin }, body,
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.incident.assigned_to, f.tech);
  assert.equal(data.update.changed_by, f.admin);
  assert.ok(data.update.created_at.endsWith('Z'));
  const history = await fetch(`${url}/history`, { headers: { 'X-User-Id': f.student } });
  assert.equal(history.status, 200);
  assert.equal((await history.json()).updates[0].changed_by_name, 'admin');
  const forbidden = await fetch(url, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-User-Id': f.student },
    body: JSON.stringify({ status: 'resolved' }),
  });
  assert.equal(forbidden.status, 403);

  const headers = { 'Content-Type': 'application/json', 'X-User-Id': f.admin };
  for (const invalidBody of [null, [], {}, { status: 'invalid' },
    { assignedTo: '0' }, { assignedTo: '9223372036854775808' },
    { assignedTo: 9007199254740992 }, { assignedTo: f.tech, assigned_to: f.otherTech },
    { status: 'resolved', changed_by: f.student }, { status: 'open', comment: ' ' },
    { status: 'open', comment: 'x'.repeat(2001) }]) {
    const invalid = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(invalidBody) });
    assert.equal(invalid.status, 400);
  }
  const malformed = await fetch(url, { method: 'PATCH', headers, body: '{' });
  assert.equal(malformed.status, 400);
  for (const id of ['0', 'abc', '9223372036854775808']) {
    const invalidId = await fetch(`${url.replace(/\d+$/, id)}`, { method: 'PATCH', headers, body });
    assert.equal(invalidId.status, 400);
  }
  const missing = await fetch(url.replace(/\d+$/, '9223372036854775807'), {
    method: 'PATCH', headers, body,
  });
  assert.equal(missing.status, 404);

  process.env.NODE_ENV = 'production';
  const production = await fetch(url, { method: 'PATCH', headers, body });
  assert.equal(production.status, 401);
  process.env.NODE_ENV = 'development';
  process.env.DEV_AUTH_ENABLED = 'false';
  const disabled = await fetch(url, { method: 'PATCH', headers, body });
  assert.equal(disabled.status, 401);
  assert.equal((await state(f.incident)).history.length, 1);
});
```

### Anexo 11. Workflow nuevo de integración

Archivo: `.github/workflows/api-updates.yml`.

```yaml
name: Incident updates integration

on:
  pull_request:
    branches: [develop]
    paths:
      - apps/api/**
      - .github/workflows/api-updates.yml
  push:
    branches: [feature/api-updates]
    paths:
      - apps/api/**
      - .github/workflows/api-updates.yml
  workflow_dispatch:

permissions:
  contents: read

jobs:
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: campusfix_test
          POSTGRES_USER: campusfix
          POSTGRES_PASSWORD: campusfix_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U campusfix -d campusfix_test"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: apps/api/package-lock.json
      - name: Install API dependencies
        working-directory: apps/api
        run: npm ci
      - name: Run HTTP and PostgreSQL integration tests
        working-directory: apps/api
        env:
          TEST_DATABASE_URL: postgresql://campusfix:campusfix_test@localhost:5432/campusfix_test
        run: npm test
```
