# 10 · Docker & Docker Compose

Bab ini membahas cara aplikasi ini dibungkus menjadi image Docker, lalu dijalankan lewat Docker Compose. Database **tidak** ikut di Docker: aplikasi konek ke server Postgres yang sudah ada, dan migrasi dijalankan **manual** dari laptop.

| Istilah | Artinya |
| --- | --- |
| **Image** | "Cetakan" read-only: OS minimal + Node + kode + dependency. |
| **Container** | Image yang sedang berjalan. |
| **Layer** | Setiap instruksi `COPY`/`RUN` menambah satu lapisan. Ukuran image = jumlah semua layer. |
| **Multi-stage build** | Beberapa `FROM` dalam satu Dockerfile. Stage akhir hanya meng-copy hasil yang dibutuhkan dari stage lain, sehingga alat build tidak ikut ke image akhir. |

Alur lengkapnya:

```text
laptop:  npx prisma migrate deploy --config prisma7.config.ts   (memakai .env)
            │  setiap ada migration baru
            ▼
docker:  docker compose up -d --build   →  container api  →  Postgres (di luar Docker)
                                                (memakai .env + .env.docker)
```

---

## 1. Multi-stage build

**File:** [Dockerfile](../Dockerfile)

```text
base ─┬─ deps ─┬─ build ─────┐
      │        └─ prod-deps ─┤
      └──────────────────────┴─ runtime  (image api yang di-deploy)
```

| Stage | Isinya | Ikut ke image akhir? |
| --- | --- | --- |
| `deps` | `npm ci` (semua dependency, termasuk dev) | tidak |
| `build` | source + `prisma generate` + `nest build` → `dist/` | hanya `dist/` |
| `prod-deps` | `node_modules` tanpa devDependencies (dan tanpa Prisma CLI) | hanya `node_modules` |
| `runtime` | `node:24-alpine` + `node_modules` produksi + `dist/` | **ya** |

Poin penting:

- **Urutan `COPY` menentukan cache.** `deps` hanya meng-copy `package.json` dan `package-lock.json` sebelum `npm ci`. Selama dua file itu tidak berubah, layer `npm ci` diambil dari cache, walaupun source code berubah.
- **Hasil build ada di `dist/src/main.js`,** bukan `dist/main.js`. `PrismaService` meng-import `generated/prisma` yang berada di luar `src/`, jadi `tsc` memakai root project sebagai `rootDir`.
- **Client Prisma sudah ikut ter-compile ke `dist/`.** Generator `prisma-client` menulis client ke `generated/prisma`, lalu `nest build` meng-compile-nya. Saat runtime, aplikasi hanya butuh `@prisma/client` (bagian `runtime/`) dan `@prisma/adapter-pg`. **Prisma CLI tidak dibutuhkan.**
- **`prisma generate` tidak butuh database.** Perintah ini hanya membaca `schema.prisma`. `DATABASE_URL` bernilai `undefined` saat build, dan itu tidak masalah. Buktinya, `.env` dikecualikan dari build context tapi build tetap berhasil.
- **`runtime` berjalan sebagai user `node`,** bukan root. Folder `/app/logs` dibuat dan di-`chown` lebih dulu supaya winston bisa menulis file log.
- **[.dockerignore](../.dockerignore)** mencegah `node_modules`, `dist`, `.env`, `.git`, dan `logs` lokal ikut masuk ke build context.
- **Build once, run anywhere.** Image tidak berisi alamat database. Lokasi database baru diberikan saat container berjalan, lewat `DATABASE_URL`. Jadi satu image bisa diarahkan ke database mana pun tanpa di-build ulang.

---

## 2. Docker Compose

**File:** [docker-compose.yml](../docker-compose.yml)

Compose hanya berisi satu service, yaitu `api`:

```bash
npx prisma migrate deploy --config prisma7.config.ts   # 1. migrasi (setiap ada migration baru)
docker compose up -d --build                           # 2. jalankan api
```

### Kenapa migrasi manual

- Prisma CLI sudah ada di `node_modules` laptop, dan `.env` biasa (`localhost`) sudah bisa menjangkau database. Tidak perlu image tambahan.
- Image yang membawa Prisma CLI berukuran ±625 MB (lihat Jebakan). Image itu tidak perlu ada kalau migrasi dijalankan dari laptop.
- **Konsekuensinya, urutannya jadi tanggung jawabmu.** Kalau lupa menjalankan migrasi, `api` tetap start, lalu error saat query menyentuh tabel atau kolom yang belum ada.

Kalau nanti aplikasi di-deploy ke server yang hanya punya Docker (tanpa Node dan tanpa repo), pola yang umum adalah job migrasi terpisah (service `migrate` + `depends_on: service_completed_successfully`) atau langkah migrasi di pipeline CI/CD. Lihat latihan.

### Ke mana `DATABASE_URL` menunjuk

| Lokasi database | Host di `DATABASE_URL` untuk container |
| --- | --- |
| Server lain (VPS, Neon, Supabase, RDS, …) | hostname/IP server itu. Database cloud biasanya butuh `?sslmode=require` |
| Postgres yang terpasang di laptop sendiri | `host.docker.internal` |

**`localhost` di dalam container berarti container itu sendiri,** bukan laptopmu. Inilah alasan `DATABASE_URL` yang jalan normal untuk `npm run start:dev` bisa gagal saat dijalankan lewat compose.

### `.env.docker`: URL khusus container

`api` membaca dua file env secara berurutan. Kalau ada variabel yang sama, **file yang terakhir menang**:

```yaml
env_file:
  - .env
  - path: .env.docker # menimpa DATABASE_URL khusus container
    required: false   # boleh tidak ada
```

Kapan `.env.docker` dibutuhkan? Saat Postgres terpasang **di laptop sendiri**. Contohnya ada di [env_docker_template](../env_docker_template).

| File | `DATABASE_URL` | Dipakai oleh |
| --- | --- | --- |
| `.env` | `...@localhost:5432/...` | `npm run start:dev` dan `npx prisma migrate deploy` (Windows) |
| `.env.docker` | `...@host.docker.internal:5432/...` | container `api` |

Kalau databasenya benar-benar di server lain, `.env.docker` tidak perlu dibuat, karena URL di `.env` sudah benar untuk laptop maupun container.

### Lainnya

- `environment` di compose **menang atas** `env_file`. `JWT_SECRET: ${JWT_SECRET:?...}` membuat compose menolak start kalau variabelnya kosong.
- Volume `app-logs` menyimpan file log. Volume ini tetap ada walaupun container dihapus, kecuali kalau dihapus dengan `docker compose down -v`.

---

## Jebakan yang saya temui

- **Image `runtime` sempat 796 MB.** Penyebabnya bukan base image, tapi layer `node_modules` yang berukuran 446 MB. Di dalamnya masih ada Prisma CLI (`prisma`), Prisma Studio (`@prisma/studio-core`, `react-dom`), PGlite (`@electric-sql`), `effect`, dan `typescript`. Padahal semuanya devDependencies atau turunannya.

  Penyebabnya terlihat dari `npm explain prisma`:

  ```text
  prisma@7.10.1
    dev prisma@"^7.10.1" from the root project
    peerOptional prisma@"*" from @prisma/client@7.10.1
  ```

  `@prisma/client` mendeklarasikan `prisma` dan `typescript` sebagai **optional peer dependency**. Kalau paket itu ada di lockfile, npm menganggapnya dibutuhkan oleh dependency produksi, sehingga **`npm prune --omit=dev` maupun `npm ci --omit=dev` tidak membuangnya**.

  Solusinya, di stage `prod-deps` keduanya di-uninstall secara eksplisit, lalu di-prune sekali lagi:

  ```dockerfile
  RUN npm prune --omit=dev \
    && npm uninstall prisma typescript --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm prune --omit=dev
  ```

  Hasilnya, layer `node_modules` turun dari 446 MB ke 181 MB, dan image dari **796 MB ke 466 MB**. `npm uninstall` hanya mengubah `package.json` di dalam stage itu. Stage `runtime` meng-copy `package.json` asli dari build context.

  Pelajarannya: **cek isi image, jangan hanya menebak.** Perintah yang berguna:

  ```bash
  docker history <image>                       # ukuran tiap layer
  docker run --rm --entrypoint sh <image> -c "du -sh /app/node_modules/* | sort -rh | head"
  docker run --rm --entrypoint sh <image> -c "cd /app && npm explain <paket>"
  ```

- **Dulu ada image `migrate`, dan ukurannya 1,41 GB.** Stage-nya ditulis `FROM build`, jadi mewarisi layer `npm ci` sebesar 886 MB (Jest, ESLint, Nest CLI, ts-node, dan lainnya) serta seluruh source code. Setelah diubah menjadi `FROM base` dan hanya memasang `prisma` + `dotenv`, ukurannya turun ke 625 MB. Lebih kecil dari itu tidak bisa, karena paket `prisma` sendiri membawa Studio, PGlite, dan `effect` sebagai dependency biasa (±256 MB). Akhirnya stage dan service `migrate` dihapus, dan migrasi dijalankan dari laptop. Pelajaran umumnya: **stage yang tidak butuh hasil build jangan diturunkan dari stage build.**

- **npm cache ikut masuk ke layer.** Saat mengecilkan image `migrate`, percobaan pertama masih 1,05 GB karena `npm install` meninggalkan cache 311 MB di `/root/.npm`. Docker menyimpan *semua* isi filesystem di akhir sebuah `RUN` sebagai layer. Karena itu, file sementara harus dihapus **di `RUN` yang sama**:

  ```dockerfile
  RUN npm install ... ; \
    npm cache clean --force      # ✅ cache tidak pernah masuk ke layer

  RUN npm install ...
  RUN npm cache clean --force    # ❌ layer sebelumnya tetap berisi cache 311 MB
  ```

  Image `runtime` tidak terkena masalah ini karena hanya meng-`COPY --from` folder `node_modules`, bukan seluruh layer stage sebelumnya. Itulah keuntungan utama multi-stage build.

- **`P1001: Can't reach database server at localhost:5432`.** Error ini muncul saat compose dijalankan dengan `.env` yang dipakai untuk `start:dev`. Di dalam container, `localhost` berarti container itu sendiri. Waktu itu yang gagal duluan adalah service `migrate`, sehingga `migrate` kelihatan seperti biang masalah. Padahal `api` akan gagal dengan error yang sama, karena memakai URL yang sama.

  Mengganti `.env` ke `host.docker.internal` juga tidak cukup. Nama itu di-resolve **berbeda** tergantung dari mana koneksinya berasal:

  | Dari | `host.docker.internal` → | Hasil |
  | --- | --- | --- |
  | container | `192.168.65.254` (gateway Docker Desktop) | diterima Postgres |
  | Windows | `10.0.0.39` (IP LAN, ditulis Docker Desktop ke file `hosts`) | `no pg_hba.conf entry for host "10.0.0.39"` |

  Postgres memeriksa **alamat asal** koneksi di `pg_hba.conf`, jadi satu URL tidak bisa dipakai di kedua tempat. Solusinya `.env.docker` (lihat di atas).

  Cara mendiagnosis tanpa kredensial: konek dengan user palsu. Pesan `password authentication failed` berarti jaringan dan `pg_hba` sudah oke. Pesan `no pg_hba.conf entry` berarti alamat asalnya ditolak.

  ```bash
  docker run --rm -e PGPASSWORD=x postgres:17-alpine \
    psql -h host.docker.internal -U probe -d postgres -c "select 1"
  ```

- **`PORT` di `.env` menimpa `PORT=3000` milik image.** `env_file: .env` ikut mengirim `PORT` ke container. Kalau `.env` berisi `PORT=3001`, aplikasi listen di 3001 di dalam container, sehingga mapping `${PORT:-3001}:3000` tidak mengenainya.
- **Angka `docker images` di Docker Desktop bisa membingungkan.** Dengan containerd image store, angkanya bisa berbeda dari jumlah ukuran layer. Untuk membandingkan sebelum dan sesudah, pakai `docker history`.
- **Ukuran beberapa image tidak dijumlahkan begitu saja.** Image yang memakai base yang sama (misalnya `node:24-alpine`) berbagi layer itu di disk, dan layer itu hanya disimpan sekali.

---

## Latihan berikutnya

1. **Perbaiki jebakan `PORT`.** Buat container selalu listen di 3000 (misalnya `environment: PORT: 3000` di compose), lalu ubah mapping port host-nya saja.
2. **Tambahkan `healthcheck` untuk `api`,** misalnya endpoint `GET /health` dengan `@nestjs/terminus`, lalu pakai di Compose.
3. **Bandingkan dengan `node:24-slim` atau image distroless.** Catat ukuran dan apa saja yang hilang, misalnya shell untuk debugging.
4. **Graceful shutdown.** Panggil `app.enableShutdownHooks()` di `main.ts`, lalu jalankan `docker stop` dan amati apakah `PrismaService.onModuleDestroy` terpanggil.
5. **Migrasi untuk server tanpa Node.** Kalau nanti deploy ke server yang hanya punya Docker, rancang ulang job migrasi: stage `FROM base` dengan `prisma` + `dotenv`, cache npm dibersihkan di `RUN` yang sama, lalu service `migrate` dengan `depends_on: service_completed_successfully`. Bandingkan dengan menjalankan migrasi di pipeline CI/CD.
6. **Cache mount.** Coba `RUN --mount=type=cache,target=/root/.npm npm ci` di stage `deps`. Bandingkan waktu build ulang setelah `package.json` berubah.

## Referensi

- [Docker: Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker Compose: `env_file`](https://docs.docker.com/reference/compose-file/services/#env_file)
- [npm: peerDependenciesMeta](https://docs.npmjs.com/cli/configuring-npm/package-json#peerdependenciesmeta)
- [Prisma: Deploying to Docker](https://www.prisma.io/docs/guides/docker)
- [Prisma: `migrate deploy`](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-deploy)
