# 04 · Pipes

**Pipe** adalah class yang menerima satu nilai argumen **sebelum** handler controller dijalankan, lalu melakukan salah satu atau kedua hal ini:

| Tugas | Contoh |
| --- | --- |
| **Transformasi** | mengubah `"42"` (string dari URL) menjadi `42` (number) |
| **Validasi** | menolak nilai yang tidak sesuai dengan melempar exception (biasanya 400) |

`ValidationPipe` dari [bab 03](03-dto-dan-validation-pipe.md) juga pipe. Bab ini fokus pada pipe yang bekerja pada **satu parameter**, terutama `ParseIntPipe`.

---

## 1. `ParseIntPipe`

**File:** [tasks.controller.ts](../src/modules/tasks/tasks.controller.ts), [feedback.controller.ts](../src/modules/feedback/feedback.controller.ts)

```ts
@Get(':id')
getById(@Param('id', ParseIntPipe) id: number) {
  return this.feedbackService.getById(id);
}
```

Semua nilai dari URL selalu berupa **string**. Tanpa pipe, `id` di sini akan bernilai `"5"`, walaupun tipenya ditulis `number`. TypeScript tidak melakukan konversi saat runtime, karena anotasi tipe hanya ada saat compile.

`ParseIntPipe` mengubah string menjadi integer, atau menolaknya:

| URL | Hasil |
| --- | --- |
| `/feedback/5` | `id = 5` |
| `/feedback/abc` | 400, *"Validation failed (numeric string is expected)"* |
| `/feedback/0` | `id = 0`, **lolos** |
| `/feedback/-3` | `id = -3`, **lolos** |

Dua baris terakhir menunjukkan bahwa `ParseIntPipe` hanya memastikan nilainya **integer**, bukan **ID yang masuk akal**. Karena itu `TasksController.findById` menambah pengecekan manual:

```ts
if (id <= 0) throw new BadRequestException('ID harus lebih dari 0');
```

### Perhatikan: class atau instance

```ts
@Param('id', ParseIntPipe)                                  // class: Nest yang membuat instance (lewat DI)
@Param('id', new ParseIntPipe({ errorHttpStatusCode: 422 })) // instance: kalau perlu opsi
```

---

## 2. Tempat memasang pipe

| Tingkat | Cara | Contoh di repo |
| --- | --- | --- |
| Satu parameter | `@Param('id', ParseIntPipe)` | semua route `:id` |
| Satu method/controller | `@UsePipes(...)` | – |
| Global | `app.useGlobalPipes(...)` | `ValidationPipe` di `main.ts` |

Pipe yang bisa dipakai langsung dari `@nestjs/common`: `ParseIntPipe`, `ParseFloatPipe`, `ParseBoolPipe`, `ParseArrayPipe`, `ParseUUIDPipe`, `ParseEnumPipe`, `DefaultValuePipe`, `ValidationPipe`, dan `ParseFilePipe`.

---

## 3. Membuat pipe sendiri

Pipe adalah class yang mengimplementasikan `PipeTransform`:

```ts
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException(`${metadata.data} harus bilangan bulat positif`);
    }
    return id;
  }
}
```

- `value` adalah nilai mentah argumen.
- `metadata` memberi informasi tambahan: `type` (`'param'`, `'body'`, `'query'`), `data` (nama parameter, misalnya `'id'`), dan `metatype` (tipe TypeScript-nya).
- Nilai yang di-`return` adalah nilai yang diterima handler.

Ini belum ada di repo. Membuatnya adalah latihan pertama di bawah.

---

## Jebakan yang saya temui

- **Anotasi tipe tidak mengubah nilai.** Menulis `@Param('id') id: number` tanpa pipe tetap menghasilkan string. Dulu `PATCH` dan `DELETE` di `TasksController` menulis `id: string` walaupun memakai `ParseIntPipe`. Sekarang sudah `number`, tetapi `update` masih menyisakan `Number(id)` yang tidak perlu.
- **Pengecekan tidak konsisten.** Hanya `GET /tasks/:id` yang menolak `id <= 0`. `PATCH`, `DELETE`, dan semua route feedback menerima `0` atau angka negatif, lalu baru gagal dengan 404 di service.
- **Bahasa pesan error.** Pesan bawaan `ParseIntPipe` berbahasa Inggris, sedangkan pesan dari `ValidationPipe` berbahasa Indonesia. Bisa diseragamkan dengan opsi `exceptionFactory` pada `ParseIntPipe`, atau dengan pipe sendiri.

---

## Latihan berikutnya

1. Buat `ParsePositiveIntPipe` di `src/common/pipes/`, pakai di semua route `:id` (tasks dan feedback), lalu hapus pengecekan `id <= 0` dari controller dan `Number(id)` dari `update`.
2. Tambahkan pagination ke `GET /tasks` dengan `@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number`. Perhatikan bahwa beberapa pipe dijalankan **berurutan** dari kiri ke kanan.
3. Tambahkan filter `GET /tasks?completed=true` dengan `ParseBoolPipe`, dan buat agar parameter itu opsional.
4. Coba `ParseIntPipe` dengan `exceptionFactory: () => new BadRequestException('ID harus berupa angka')`.

## Referensi

- [NestJS: Pipes](https://docs.nestjs.com/pipes)
