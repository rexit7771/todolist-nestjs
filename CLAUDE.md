# CLAUDE.md

A todo-list REST API built **to learn NestJS**. It's not production code. When you help here, explain the NestJS concepts involved (modules, DI, pipes, guards, DTOs) as well as making the change, and keep solutions idiomatic Nest instead of clever.

## Stack

- NestJS 11 (Express), TypeScript (`module: nodenext`, `strictNullChecks` on, `noImplicitAny` off)
- Prisma 7 with the new `prisma-client` generator and the SQLite **driver adapter** (`@prisma/adapter-better-sqlite3`)
- Auth: `@nestjs/jwt` + `bcrypt`. There's no Passport; a hand-written guard handles auth.
- Validation: `class-validator` / `class-transformer` through a global `ValidationPipe`
- Jest for unit tests, `supertest` for e2e tests
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
npx prisma generate --config prisma7.config.ts   # writes the client to ./generated/prisma (gitignored)
npx prisma db push  --config prisma7.config.ts   # sync the schema to dev.db (there's no migrations folder yet)
npx prisma studio   --config prisma7.config.ts
```

Run `prisma generate` after a fresh clone and after every edit to `schema.prisma`. Without it, `src/configs/prisma/prisma.service.ts` fails to compile.

**ESLint in the editor goes stale after `prisma generate`.** The VS Code ESLint server keeps its own cached TypeScript program for typed rules. After a new model is added, it can still report `@typescript-eslint/no-unsafe-call` / `no-unsafe-member-access` on `this.prismaService.<newModel>`, even though `tsc` and `npx eslint <file>` from the CLI are clean. The fix is **ESLint: Restart ESLint Server** (or Reload Window), not a code change. Check with the CLI before "fixing" these errors.

## Environment (`.env`, gitignored)

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | Prisma config + `PrismaService` adapter | e.g. `file:./dev.db` |
| `JWT_SECRET` | `AuthModule` (`getOrThrow`) | the app won't boot without it |
| `JWT_EXPIRES_IN` | `AuthModule` | wrapped in `Number(...)`, so give **seconds** (e.g. `3600`), not `"1h"` |
| `PORT` | `main.ts` | defaults to 3000; the Bruno env expects **3001** |

## Architecture

```
src/
  main.ts                 bootstrap + global ValidationPipe
  app.module.ts           ConfigModule (global), TasksModule, AuthModule, FeedbackModule
  configs/prisma/         PrismaModule / PrismaService (extends PrismaClient, connects on init)
  modules/
    auth/                 register/login, JwtAuthGuard (exported for other modules)
    tasks/                CRUD, protected by JwtAuthGuard
    feedback/             CRUD, protected by JwtAuthGuard (imports AuthModule to get the guard's JwtService)
```

Each feature module uses a **Controller → Service → Repo** layering:
- **Controller**: routing, param parsing (`ParseIntPipe`), guards. No business logic.
- **Service**: business rules and HTTP exceptions (`NotFoundException`, `ConflictException`, …).
- **Repo** (`*.repo.ts`, an `@Injectable` class): the only layer that touches `PrismaService`.

Keep new features in this shape: `src/modules/<name>/` holding `<name>.module.ts`, `.controller.ts`, `.service.ts`, `.repo.ts`, and `dto/`. Import `PrismaModule` into the feature module. It isn't global.

### Endpoints

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/auth/register` | – | `{ email, password }` (min 6). Returns the created user, **including the hashed password** |
| POST | `/auth/login` | – | `{ email, password }`. Returns the raw JWT string |
| GET | `/tasks` | Bearer | – |
| GET | `/tasks/:id` | Bearer | – |
| POST | `/tasks` | Bearer | `{ title }` |
| PATCH | `/tasks/:id` | Bearer | `{ completed?, title? }` (both optional) |
| DELETE | `/tasks/:id` | Bearer | – |
| GET | `/feedback` | Bearer | – |
| GET | `/feedback/:id` | Bearer | – |
| POST | `/feedback` | Bearer | `{ name, message, rating }` (rating is an integer from 1 to 5) |
| PUT | `/feedback/:id` | Bearer | `{ name, message, rating }`. Full replace, so every field is required |
| DELETE | `/feedback/:id` | Bearer | – |

Feedback service methods call `getById` first, which throws `NotFoundException('Feedback tidak ditemukan')`, before they update or delete.

`JwtAuthGuard` reads `Authorization: Bearer <token>`, verifies it, and attaches `{ id, email }` to `request.user`.

### Validation and errors

The global `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted`, so any unknown body field gets a 400. A custom `exceptionFactory` returns **only the first constraint message** as a plain `BadRequestException`.

### Data model (`prisma/schema.prisma`)

- `User { id, email @unique, password, createdAt, updatedAt }`
- `Task { id, title, completed, createdAt, updatedAt }`
- `Feedback { id, name, message, rating }` (no timestamps, not linked to a user)

## Conventions

- User-facing validation and error messages are mostly in **Indonesian**, e.g. `'Email sudah terdaftar'`. Match that language in new messages. A few auth messages are in English.
- Prettier: single quotes, trailing commas.
- Commit messages are lowercase with a prefix, e.g. `patch: ...`, and work happens on the `development` branch (main is `main`).
- `dev.db` is committed to the repo. `generated/`, `.env`, `dist/` and `.claude` are gitignored.

## Known gaps and learning opportunities

These are useful next exercises. Don't treat them as surprises:

- **Tasks aren't linked to users.** `Task` has no `userId`, so every authenticated user sees every task. `request.user` is set but never read. A natural next step is a `@CurrentUser()` param decorator plus a `User`→`Task` relation.
- **Register leaks the password hash.** The response should omit it with a Prisma `select`/`omit`, a response DTO, or `ClassSerializerInterceptor`.
- **Unit tests are mostly scaffolds.** Only `tasks.service.spec.ts` is real. It mocks `TaskRepo` with `{ provide: TaskRepo, useValue: … }` and is the pattern to copy. The other specs, including feedback's, are untouched Nest CLI scaffolds with no mocks for `FeedbackRepo`, `AuthRepo`, `JwtService`, or `PrismaService`, so they fail on DI resolution. `test/app.e2e-spec.ts` expects `GET /` → "Hello World!".
- **`FeedbackModule` lists `PrismaModule` in `providers`.** A module belongs only in `imports`, where it already is. Remove it from `providers`.
- `UpdateFeedback` (not named `UpdateFeedbackDto` like the other DTOs) reuses the message `'name wajib dikirim'` on the `message` field. `FeedbackDto` is unused now that the repo uses Prisma.
- **`app.controller.ts` and `app.service.ts` are leftover scaffold.** `AppModule` doesn't register them.
- `AppModule` imports a bare `JwtModule` that does nothing, because `AuthModule` already configures and exports it.
- In `TasksController`, `PATCH`/`DELETE` declare `id: string` even though `ParseIntPipe` returns a number, and only `GET :id` checks `id > 0`.
- `UpdateTaskDto` hand-writes optional fields. `PartialType(CreateTaskDto)` from `@nestjs/mapped-types` is the idiomatic way to do this.
- There's no migrations history. Start using `prisma migrate dev` once the schema changes matter.
