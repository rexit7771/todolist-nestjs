# todolist-nestjs

A small todo-list REST API (plus a feedback module) that I built to learn [NestJS](https://nestjs.com). It covers the core building blocks: modules, dependency injection, controllers/services, DTO validation, guards, JWT authentication, and Prisma as the ORM.

> This is a learning project, not production-ready code.

## Tech stack

- **NestJS 11** (Express) + TypeScript
- **Prisma 7** + **SQLite** (via `better-sqlite3` driver adapter)
- **JWT** auth (`@nestjs/jwt`) with **bcrypt** password hashing
- **class-validator** for request validation
- **Jest** for testing, **Bruno** for API requests

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Create a `.env` file

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me"
JWT_EXPIRES_IN=3600   # in seconds
PORT=3001
```

### 3. Set up the database

The Prisma config file is named `prisma7.config.ts`, so pass it explicitly:

```bash
npx prisma generate --config prisma7.config.ts   # generate the Prisma client
npx prisma db push  --config prisma7.config.ts   # create/sync tables in dev.db
```

Run `prisma generate` again every time you change `prisma/schema.prisma`.

> **VS Code tip:** if ESLint shows `Unsafe call of a type that could not be resolved` on `this.prismaService.<model>` right after you add a model, the ESLint server is still using its old cached types. Run **ESLint: Restart ESLint Server** from the Command Palette.

### 4. Run the app

```bash
npm run start:dev    # watch mode
npm run start        # normal
npm run build && npm run start:prod
```

The API runs at `http://localhost:3001` (or whatever `PORT` you set; defaults to 3000).

## API

| Method | Endpoint | Auth | Body |
| --- | --- | --- | --- |
| POST | `/auth/register` | – | `{ "email": "a@b.com", "password": "secret1" }` |
| POST | `/auth/login` | – | `{ "email": "a@b.com", "password": "secret1" }` → returns JWT |
| GET | `/tasks` | Bearer | – |
| GET | `/tasks/:id` | Bearer | – |
| POST | `/tasks` | Bearer | `{ "title": "Belajar NestJS" }` |
| PATCH | `/tasks/:id` | Bearer | `{ "completed": true, "title": "Belanja" }` (both optional) |
| DELETE | `/tasks/:id` | Bearer | – |
| GET | `/feedback` | Bearer | – |
| GET | `/feedback/:id` | Bearer | – |
| POST | `/feedback` | Bearer | `{ "name": "Budi", "message": "Mantap", "rating": 5 }` |
| PUT | `/feedback/:id` | Bearer | `{ "name": "Budi", "message": "Mantap", "rating": 4 }` (all fields required) |
| DELETE | `/feedback/:id` | Bearer | – |

`rating` must be an integer from 1 to 5.

Protected routes need the header `Authorization: Bearer <token>` (use the token from `/auth/login`).

Example:

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"secret1"}'

curl http://localhost:3001/tasks -H "Authorization: Bearer <token>"
```

A ready-made [Bruno](https://www.usebruno.com/) collection is in [`api-docs/todolist-netsjs`](api-docs/todolist-netsjs).

## Project structure

```text
src/
├── main.ts                   # bootstrap + global ValidationPipe
├── app.module.ts             # root module
├── configs/prisma/           # PrismaModule & PrismaService
└── modules/
    ├── auth/                 # register, login, JwtAuthGuard
    │   ├── dto/
    │   └── guards/
    ├── tasks/                # task CRUD (protected)
    │   └── dto/
    └── feedback/             # feedback CRUD (protected)
        └── dto/
prisma/schema.prisma          # database models (User, Task, Feedback)
api-docs/                     # Bruno API collection
```

Each feature module follows a **Controller → Service → Repository** pattern:

- **Controller**: handles routes, params, and guards
- **Service**: business logic and errors
- **Repository**: database access via Prisma

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | Lint & auto-fix |
| `npm run format` | Format with Prettier |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:cov` | Test coverage |

## What I learned / topics covered

- [x] Modules, controllers, providers & dependency injection
- [x] DTOs + `ValidationPipe` (whitelist, custom error messages)
- [x] Built-in pipes (`ParseIntPipe`)
- [x] Prisma integration as an injectable service
- [x] Password hashing with bcrypt
- [x] JWT auth with a custom `CanActivate` guard
- [x] Async module config with `ConfigService`
- [x] Reusing a guard from another module (`AuthModule` exports → `FeedbackModule` imports)
- [x] Allow editing task titles
- [x] Unit testing a service with a mocked repository (`useValue` + `jest.fn()`)

## Next steps / TODO

- [ ] Link tasks to users (each user only sees their own tasks)
- [ ] Hide the password hash in the register response
- [ ] `@CurrentUser()` custom decorator
- [ ] Refactor update DTOs with `PartialType`
- [ ] Write unit tests for the remaining services and controllers (auth, feedback)
- [ ] Use Prisma migrations instead of `db push`
- [ ] Swagger / OpenAPI docs

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
