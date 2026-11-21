# CLAUDE.md

A todo-list REST API built **to learn NestJS**. It's not production code. When you help here, explain the NestJS concepts involved (modules, DI, pipes, guards, decorators, DTOs) as well as making the change, and keep solutions idiomatic Nest instead of clever.

## Stack

- NestJS 11 (Express), TypeScript (`module: nodenext`, `strictNullChecks` on, `noImplicitAny` off)
- Prisma 7 with the new `prisma-client` generator and the **PostgreSQL driver adapter** (`@prisma/adapter-pg`). The project moved from SQLite in commit `da3c849`.
- Auth: `@nestjs/jwt` + `bcryptjs` (pure JS, so no native build). There's no Passport; a hand-written guard handles auth.
- Validation: `class-validator` / `class-transformer` through a global `ValidationPipe`. `@nestjs/mapped-types` (`PartialType`) for derived DTOs.
- Logging: `winston` + `winston-daily-rotate-file` through `nest-winston`, which replaces Nest's built-in logger app-wide
- Jest for unit tests, `supertest` for e2e tests
- Docker: a multi-stage [Dockerfile](Dockerfile) + [docker-compose.yml](docker-compose.yml), **for the `api` only**. The DB is external, and migrations are run manually from the host.
- API requests live in a **Bruno** collection in [api-docs/todolist-netsjs/](api-docs/todolist-netsjs/). The Postman CLI is also installed.

## Commands

```bash
npm run start:dev          # watch mode
npm run build              # nest build -> dist/
npm run lint               # eslint --fix
npm run format             # prettier
npm test                   # unit tests (src/**/*.spec.ts)
npm run test:e2e           # test/*.e2e-spec.ts

# Prisma: the config file has a non-default name, so pass it explicitly
npx prisma generate       --config prisma7.config.ts   # writes the client to ./generated/prisma (gitignored)
npx prisma migrate dev    --config prisma7.config.ts   # create + apply a migration after editing schema.prisma
npx prisma migrate deploy --config prisma7.config.ts   # apply existing migrations (run manually before `docker compose up`)
npx prisma studio         --config prisma7.config.ts

# Docker (reads ${...} from .env)
npx prisma migrate deploy --config prisma7.config.ts   # 1. migrate manually (host, .env)
docker compose up -d --build                           # 2. api only (.env + optional .env.docker)
```

**The build output is `dist/src/main.js`, not `dist/main.js`.** `PrismaService` imports from `generated/prisma`, which is outside `src/`, so `tsc` uses the project root as `rootDir`. `start:prod` therefore runs `node dist/src/main`. `prisma7.config.ts` is excluded in `tsconfig.build.json` because the CLI uses it only at dev time.

Run `prisma generate` after a fresh clone and after every edit to `schema.prisma`. Without it, `src/configs/prisma/prisma.service.ts` fails to compile.

Schema changes go through **migrations** in [prisma/migrations/](prisma/migrations/) (`migrate dev`), not `db push`.

**ESLint in the editor goes stale after `prisma generate`.** The VS Code ESLint server keeps its own cached TypeScript program for typed rules. After a new model is added, it can still report `@typescript-eslint/no-unsafe-call` / `no-unsafe-member-access` on `this.prismaService.<newModel>`, even though `tsc` and `npx eslint <file>` from the CLI are clean. The fix is **ESLint: Restart ESLint Server** (or Reload Window), not a code change. Check with the CLI before "fixing" these errors.

## Environment (`.env`, gitignored)

The variable names are listed in [env_template](env_template). Don't read `.env` itself; ask the user if a value matters.

| Var | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Prisma config + `PrismaService` adapter | a `postgresql://...` connection string. In compose, `.env.docker` can override it for the container |
| `DATABASE_HOST` / `DATABASE_PORT` / `DATABASE_USER` / `DATABASE_PASS` / `DATABASE_NAME` | nothing | in the template but not read by code or compose (leftovers) |
| `JWT_SECRET` | `AuthModule` (`getOrThrow`) | the app won't boot without it. Compose also refuses to start without it |
| `JWT_EXPIRES_IN` | `AuthModule` | wrapped in `Number(...)`, so give **seconds** (e.g. `3600`), not `"1h"` |
| `PORT` | `main.ts`, compose host port | defaults to 3000; the Bruno env expects **3001** |

### Docker notes

- **Docker is for the `api` only.** There's no DB container and no migrate job/stage; this was a deliberate user decision. Migrations are **always manual** from the host: `npx prisma migrate deploy --config prisma7.config.ts` (using `.env`) before `docker compose up`. Don't re-add a `migrate` stage/service or a `db` service unless asked. A Prisma CLI image is ~625 MB at best.
- Stages: `deps` → `build` (runs `prisma generate` + `nest build`), `deps` → `prod-deps` → `runtime` (`node dist/src/main` as user `node`).
- `prod-deps` explicitly runs `npm uninstall prisma typescript` after `npm prune --omit=dev`. `@prisma/client` lists both as optional peers, so `--omit=dev` keeps them (~250 MB of CLI/Studio/PGlite). Don't remove that step; the runtime only needs `@prisma/client` + `@prisma/adapter-pg`.
- The DB is external (currently a Postgres running natively on the user's Windows machine). Its location is a runtime concern (`DATABASE_URL`), never baked into the image. `api` uses `env_file: [.env, {path: .env.docker, required: false}]`, and the later file wins. `.env.docker` (gitignored, example in [env_docker_template](env_docker_template)) holds only a container-side `DATABASE_URL`. It's needed because the user's Postgres runs natively on Windows. `localhost` inside a container is the container itself. `host.docker.internal` works from containers (it arrives as `192.168.65.x`), but from Windows it resolves to the LAN IP (`10.0.0.39`), which `pg_hba.conf` rejects. So `.env` keeps `localhost` for `start:dev`.
- Logs live in the `app-logs` volume.
- `api` maps `${PORT:-3001}:3000`, but `env_file: .env` also passes `PORT` into the container, which overrides the image's `PORT=3000`. If `.env` sets `PORT=3001`, the app listens on 3001 inside the container and the mapping to 3000 misses it.

## Architecture

```text
src/
  main.ts                 bootstrap, winston logger, global ValidationPipe
  app.module.ts           ConfigModule (global), TasksModule, AuthModule, FeedbackModule; applies HttpLoggerMiddleware to all routes
  common/                 httpLogger.middleware.ts (logs every request)
  configs/prisma/         PrismaModule / PrismaService (extends PrismaClient with the PrismaPg adapter, connects on init, disconnects on destroy)
  configs/logger/         winston.config.ts (winston LoggerOptions, not a Nest module)
  modules/
    auth/                 register/login, JwtAuthGuard (exported for other modules)
      decorators/         @CurrentUser() param decorator + JwtUser type
      guards/             JwtAuthGuard
    tasks/                CRUD scoped to the logged-in user, protected by JwtAuthGuard
    feedback/             CRUD, protected by JwtAuthGuard (imports AuthModule to get the guard's JwtService)
prisma/
  schema.prisma
  migrations/             setup + task_created_by
docs/                     learning notes per NestJS concept, in Indonesian (index: docs/README.md)
```

**Learning notes in `docs/`:** one file per concept (`NN-topic.md`), each with the same four sections: the concept, where it lives in this repo, gotchas met, next exercises. Link to files and class/method names, not line numbers. When a change touches a documented concept, update that chapter too and mark finished chapters in the index table.

Each feature module uses a **Controller → Service → Repo** layering:

- **Controller**: routing, param parsing (`ParseIntPipe`), guards, `@CurrentUser()`. No business logic.
- **Service**: business rules, ownership checks and HTTP exceptions (`NotFoundException`, `ForbiddenException`, `ConflictException`, …).
- **Repo** (`*.repo.ts`, an `@Injectable` class): the only layer that touches `PrismaService`.

Keep new features in this shape: `src/modules/<name>/` holding `<name>.module.ts`, `.controller.ts`, `.service.ts`, `.repo.ts`, and `dto/`. Import `PrismaModule` into the feature module. It isn't global.

### Auth and the current user

- `JwtAuthGuard` reads `Authorization: Bearer <token>`, verifies it, and attaches the payload `{ id, email }` to `request.user`.
- [`@CurrentUser()`](src/modules/auth/decorators/currentUser.decorator.ts) is a `createParamDecorator` that reads `request.user`. `@CurrentUser()` returns the whole `JwtUser`, `@CurrentUser('id')` returns one field. It only works on routes behind `JwtAuthGuard`, because the guard is what sets `request.user`.
- `TasksController` passes `userId` from `@CurrentUser('id')` into every service call.

### Tasks ownership

- `GET /tasks` returns only the user's tasks (`where: { createdBy }`). It omits `createdBy` and includes `creator: { id, email }`.
- `POST /tasks` sets `createdBy` from the logged-in user.
- `TasksService.findById(id, userId)` throws `NotFoundException('Task Not Found')` if the task doesn't exist, and `ForbiddenException` if it belongs to someone else. `update` and `delete` call `findById` first, so they inherit both checks.

### Logging

- `main.ts` passes `WinstonModule.createLogger(winstonConfig)` to `NestFactory.create`. This swaps Nest's logger **before** modules are built, so startup logs (`InstanceLoader`, `RouterExplorer`) and the 500 errors from `ExceptionsHandler` also go through winston. There's no `WinstonModule.forRoot()` and no `WINSTON_MODULE_PROVIDER` injection.
- **In app code, use Nest's `Logger`, not winston directly:** `private readonly logger = new Logger(MyService.name)`. The class name becomes the `context` that appears in the log line. Unit tests don't need to mock it.
- Transports in [src/configs/logger/winston.config.ts](src/configs/logger/winston.config.ts):
  - Console: level `debug`, colorized
  - Daily rotate file: level `info`, at `logs/<Month>/DD-MM-YYYY.log` (e.g. `logs/November/17-11-2026.log`), kept 60 days. `logs/` is gitignored.
  - Both use `handleExceptions` / `handleRejections`.
- Nest's startup logs (`NestFactory`, `InstanceLoader`, `RoutesResolver`, `RouterExplorer`, `NestApplication`) are demoted from `info` to `debug` by the logger-level `demoteNestInternals` format. They show on the console but stay out of the log file. They're emitted on **every** boot (`start`, `start:dev`, `start:prod`), so otherwise watch mode floods the file. The format has to set **both** `info.level` (what's displayed) and `info[Symbol.for('level')]` (what transports filter on). It also has to run at the **logger** level, because logger-level formats run before transport level filtering. To demote another context, add it to `NEST_INTERNAL_CONTEXTS`.
- Line format: `[DD-MM-YYYY, HH.mm.ss] level [Context]: message`, followed by the stack trace on the next line when there is one.
- In the `printf` callback, every field except `level` is typed `unknown`. Narrow each one with `typeof` or `String()`. Don't cast with `as`. Otherwise the type-aware ESLint rules (`restrict-template-expressions`, `no-base-to-string`) fail.
- nest-winston passes `stack` as an **array** (`[trace]`), while winston's `format.errors` passes it as a string. `normalizeStack()` handles both, but it keeps only string entries. So call `logger.error(msg, err.stack)`, not `logger.error(msg, err)`, or the trace is dropped.
- `HttpLoggerMiddleware` (`Logger('HTTP')`) logs `METHOD url status - Nms` on `res.on('finish')`. It uses `error` for 5xx, `warn` for 4xx, and `log` for everything else. It's registered through `AppModule.configure()` (`NestModule`), not `app.use()`.

### Endpoints

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| POST | `/auth/register` | – | `{ email, password }` (min 6). Returns the created user without `password` (Prisma `omit` in `AuthRepo.create`) |
| POST | `/auth/login` | – | `{ email, password }`. Returns the raw JWT string |
| GET | `/tasks` | Bearer | – (only the caller's tasks) |
| GET | `/tasks/:id` | Bearer | – (404 if missing, 403 if not the owner) |
| POST | `/tasks` | Bearer | `{ title }` |
| PATCH | `/tasks/:id` | Bearer | `{ completed?, title? }` (both optional; owner only) |
| DELETE | `/tasks/:id` | Bearer | – (owner only) |
| GET | `/feedback` | Bearer | – |
| GET | `/feedback/:id` | Bearer | – |
| POST | `/feedback` | Bearer | `{ name, message, rating }` (rating is an integer from 1 to 5) |
| PUT | `/feedback/:id` | Bearer | `{ name, message, rating }`. Full replace, so every field is required |
| DELETE | `/feedback/:id` | Bearer | – |

Feedback service methods call `getById` first, which throws `NotFoundException('Feedback tidak ditemukan')`, before they update or delete.

### Validation and errors

The global `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted`, so any unknown body field gets a 400. A custom `exceptionFactory` returns **only the first constraint message** as a plain `BadRequestException`.

`UpdateTaskDto` extends `PartialType(CreateTaskDto)`, which copies `title` with its validators and makes it optional, then adds `completed`.

### Data model (`prisma/schema.prisma`)

- `User { id, email @unique, password, createdAt, updatedAt, tasks Task[] }`
- `Task { id, title, completed, createdAt, updatedAt, createdBy, creator User }`. `createdBy` is the FK to `User.id`, with `onDelete: Cascade` and `@@index([createdBy])`.
- `Feedback { id, name, message, rating }` (no timestamps, not linked to a user)

## Conventions

- User-facing validation and error messages are mostly in **Indonesian**, e.g. `'Email sudah terdaftar'`. Match that language in new messages. A few auth and task messages are in English (`'Task Not Found'`, `"You're unauthorized to ..."`).
- Prettier: single quotes, trailing commas.
- Commit messages are lowercase with a prefix, e.g. `patch: ...`, and work happens on the `development` branch (main is `main`).
- `generated/`, `.env`, `dist/` and `.claude` are gitignored.

## Known gaps and learning opportunities

These are useful next exercises. Don't treat them as surprises:

- **Jest can't load `@nestjs/mapped-types` v12 or `@nestjs/jwt` v12.** Both are ESM-only, and Jest runs the specs as CommonJS, so specs that import `UpdateTaskDto` (`tasks.controller.spec.ts`) or anything touching `JwtService`/`JwtAuthGuard` (`auth.controller`, `auth.service`, `feedback.controller` specs) fail with "Must use import to load ES Module". The app itself runs, because Node 22+/24 can `require()` ESM. Fixes to explore: `jest.mock()` the package in the spec, let `ts-jest` transform it (`transformIgnorePatterns`), pin older CJS versions, or run Jest in ESM mode. As of 2026-11-21, `npx jest` shows 5 of 8 suites failing.
- **`tasks.service.spec.ts` passes by accident.** It still calls `service.update(1, dto)` without `userId`, and the mocked task has no `createdBy`. Both are `undefined`, so the ownership check passes. It should pass a `userId`, give the mock a `createdBy`, and add a 403 test.
- **Other unit tests are scaffolds.** The remaining specs, including feedback's and auth's, are untouched Nest CLI scaffolds with no mocks for `FeedbackRepo`, `AuthRepo`, `JwtService`, or `PrismaService`, so they fail on DI resolution. `test/app.e2e-spec.ts` expects `GET /` → "Hello World!".
- **Redundant ownership checks in `TasksService`.** `update` and `delete` re-check `task.createdBy !== userId` after `findById` already threw `ForbiddenException`, so those branches can never run.
- **403 vs 404 for someone else's task.** Returning 403 tells the caller that the ID exists. A common alternative is to query with `where: { id, createdBy }` and return 404 either way. Worth discussing as a design choice.
- **`dev.db` is still tracked in git** even though the app now uses PostgreSQL. It's a leftover from the SQLite era.
- `UpdateFeedback` (not named `UpdateFeedbackDto` like the other DTOs) reuses the message `'name wajib dikirim'` on the `message` field. `FeedbackDto` is unused now that the repo uses Prisma.
- **`app.controller.ts` and `app.service.ts` are leftover scaffold.** `AppModule` doesn't register them.
- `AppModule` imports a bare `JwtModule` that does nothing, because `AuthModule` already configures and exports it.
- In `TasksController`, only `GET :id` checks `id > 0`, and `PATCH` still wraps an already-numeric `id` in `Number(id)`. A custom pipe (or `ParseIntPipe` + `@Min(1)`-style validation) would make this consistent.
- **Logging nits:** the bootstrap `.catch` in `main.ts` passes `err` instead of `err.stack`, so the startup stack trace is dropped (see Logging above). `FeedbackService` logs "not found" at `error` level. A 404 is an expected client error, so `warn` fits better, and the HTTP middleware already logs it as `warn` anyway.
