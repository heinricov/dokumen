# @workspace/db

Package untuk akses database PostgreSQL lewat [Prisma ORM](https://www.prisma.io/docs/getting-started). Semua package di dalam monorepo ini bisa memakai Prisma Client dari sini.

## Cara pakai

Import client dan tipe dari package ini:

```ts
import { prisma, PrismaClient } from "@workspace/db";

// contoh query
const users = await prisma.user.findMany();
```

Catatan: koneksi dibaca dari environment dengan urutan:

1. `DATABASE_URL`
2. `PRISMA_DATABASE_URL`
3. `POSTGRES_URL`

## Setup awal

1. Salin file `.env.example` menjadi `.env` dan isi nilai sesungguhnya:

```bash
cp .env.example .env
```

Isi ketiga variabel dengan URL PostgreSQL kamu, misalnya:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
```

2. Install dependency (sudah termasuk `@prisma/adapter-pg` dan `pg`).

3. Generate Prisma Client:

```bash
pnpm db:generate
```

## Daftar perintah (scripts)

Jalankan dari folder `packages/db`. Untuk menjalankan dari root repo, pakai `pnpm --filter @workspace/db <script>`.

| Perintah           | Fungsi                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate` | Membuat ulang / memperbarui Prisma Client di `generated/prisma` berdasarkan `prisma/schema.prisma`. Wajib dijalankan setiap schema diubah (sebenarnya otomatis oleh perintah migrate) |
| `pnpm db:migrate`  | Membuat migration dari perubahan schema lalu menerapkannya ke database (development). Pakai dengan `--name`, contoh di bawah                                                          |
| `pnpm db:push`     | Menerapkan perubahan schema langsung ke database **tanpa** migration (hanya untuk prototyping, hindari di production)                                                                 |
| `pnpm db:deploy`   | Menerapkan migration yang sudah dibuat ke database production (`prisma migrate deploy`)                                                                                               |
| `pnpm db:studio`   | Membuka Prisma Studio (GUI untuk melihat/mengedit data)                                                                                                                               |

Daftar command CLI Prisma yang bisa dipanggil langsung: `prisma generate`, `prisma migrate dev`, `prisma migrate deploy`, `prisma db push`, `prisma studio`, `prisma validate`.

## Alur kerja mengubah struktur database

Semua perubahan struktur dilakukan dengan **mengedit `prisma/schema.prisma`**, lalu membuat & menjalankan migration:

```bash
pnpm db:migrate --name <nama_perubahan>
```

Contoh:

```bash
pnpm db:migrate --name tambah_tabel_post
```

Prisma akan membandingkan schema dengan database, membuat SQL migration, menjalankannya, lalu otomatis men-generate ulang client. Perintah `migrate dev` ini hanya untuk pengembangan.

Tips:

- Untuk melihat SQL yang akan dijalankan tanpa langsung mengeksekusi, tambahkan flag `--create-only` lalu cek file migration-nya, kemudian jalankan `pnpm db:migrate` (tanpa `--name` lagi).
- Selalu periksa file migration di `prisma/migrations/` sebelum menerapkannya **walau otomatis**, karena ada operasi yang berisiko menghapus data (lihat tabel tip di bawah).

---

## Membuat table baru

Tambahkan `model` baru di `prisma/schema.prisma`:

```prisma
model Post {
  id        String   @id @default(uuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Jangan lupa tambahkan relasi balik di model `User`:

```prisma
model User {
  // ...kolom yang sudah ada
  posts Post[]
}
```

Lalu buat migration:

```bash
pnpm db:migrate --name buat_tabel_post
```

## Menghapus table

Hapus seluruh blok `model` tersebut dari `prisma/schema.prisma`, lalu hapus juga referensi relasinya (misal `posts Post[]` di model `User` jika ada).

```bash
pnpm db:migrate --name hapus_tabel_post
```

> ⚠️ Operasi ini menjatuhkan (DB `DROP TABLE`) table beserta seluruh datanya. Pastikan kamu yakin.

## Menambahkan kolom

Tambahkan field baru di dalam model:

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  phone     String?                        // <-- kolom baru (opsional)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

```bash
pnpm db:migrate --name tambah_kolom_phone
```

Tips:

- **Kolom wajib (wajib diisi)** perlu nilai default atau table sudah berisi data. Dua pilihan umum:
  - Beri `@default(...)` → misal `Integer @default(0)`
  - Buat kolom sebagai `?` (opsional/nullable) dulu, isi datanya, baru ubah jadi wajib di migration berikutnya.
- Gunakan `@default(uuid())`, `@default(now())`, `@default(0)`, `@default("")`, dsb. sesuai tipe datanya.

## Menghapus kolom

Hapus field tersebut dari model di `prisma/schema.prisma`:

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

```bash
pnpm db:migrate --name hapus_kolom_phone
```

> ⚠️ Semua data di kolom tersebut ikut terhapus.

## Mengganti nama table

Ubah nama model di `prisma/schema.prisma`. Prisma akan menebak bahwa ini adalah rename (berdasarkan `differ`), contoh:

```prisma
// model Post ...  →  model Article
model Article {
  id        String   @id @default(uuid())
  title     String
  // ...
}
```

```bash
pnpm db:migrate --name ganti_nama_tabel_post_ke_article
```

Jika Prisma tidak mendeteksi rename dan malah membuat "hapus table + buat table baru" (berisiko kehilangan data), periksa SQL hasil `--create-only`. Bila perlu, buat migration manual atau ubah file SQL-nya menjadi `ALTER TABLE ... RENAME TO ...` sebelum dijalankan.

## Mengganti nama kolom

Ubah nama field di model. Contoh `name` → `fullName`:

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  fullName  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

```bash
pnpm db:migrate --name ganti_nama_kolom_name
```

Periksa juga kode aplikasi yang memakai `prisma.user.findMany()` dsb. agar ikut diganti ke nama field yang baru (client akan ikut berubah otomatis setelah generate).

## Merubah tipe kolom

Ubah tipe data field-nya. Contoh `title` dari `String` menjadi `Text`:

```prisma
model Post {
  id        String   @id @default(uuid())
  title     Text
  content   String?
  // ...
}
```

```bash
pnpm db:migrate --name ubah_tipe_title
```

> ⚠️ Beberapa konversi tipe tidak bisa dilakukan PostgreSQL secara langsung (misal `String` → `Int`) dan hanya akan berhasil bila nilainya kosong / bisa di-cast. Prisma akan menampilkan error atau menghasilkan migration yang berisiko. Cek SQL-nya dengan `--create-only` sebelum menjalankan.

## Mengubah atribut kolom (default / wajib / unik / index)

Atribut yang bisa diubah langsung di field, contoh:

```prisma
model User {
  id       String  @id @default(uuid())
  email    String  @unique                        // tetap unik
  name     String  @default("")                   // dulu String? kini wajib + default
  phone    String? @unique                        // menambah unique constraint
  bio      String? @db.VarChar(200)               // kolom baru dengan type modifier PostgreSQL
  posts    Post[]
}

model Post {
  id        String   @id @default(uuid())
  title     String
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  @@index([authorId])                             // menambah index
  @@unique([title, authorId])                     // unique gabungan
}
```

Setiap perubahan di atas diikuti `pnpm db:migrate --name deskripsi_perubahan`.

## Menambah relasi antar tabel (foreign key)

Ada beberapa bentuk:

```prisma
// 1 → 1
model User {
  id      String   @id @default(uuid())
  profile Profile?
}
model Profile {
  id     String @id @default(uuid())
  user   User   @relation(fields: [userId], references: [id])
  userId String @unique
}

// 1 → banyak
// lihat contoh Post.author / authorId di bagian "Membuat table baru"

// banyak → banyak
model User {
  id    String @id @default(uuid())
  teams Team[]
}
model Team {
  id    String @id @default(uuid())
  users User[]
}
model TeamMembership {
  user   User   @relation(fields: [userId], references: [id])
  userId String
  team   Team   @relation(fields: [teamId], references: [id])
  teamId String
  role   String @default("member")
  @@id([userId, teamId])
}
```

## Migration untuk production

Setelah migration dibuat (dan di-**commit** ke git), terapkan di production:

```bash
pnpm db:deploy        # atau: pnpm exec prisma migrate deploy
```

Ini menjalankan migration yang belum diterapkan, tanpa membuat migration baru. Jangan pernah pakai `db:migrate`/`db:push` di production.

## Troubleshooting singkat

- **`Missing database connection string ...`** → pastikan `.env` sudah diisi dan variabel environment tersedia.
- **Tipe hasil `tsc` / editor tidak berubah setelah edit schema** → jalankan `pnpm db:generate`.
- **Perintah manggil `prisma`** → jalankan yang ada di package ini agar versi CLI (7.10.0) cocok dengan `@prisma/client`.

## Referensi

- Prisma getting started: https://www.prisma.io/docs/getting-started
- Prisma schema (model/field reference): https://www.prisma.io/docs/orm/reference/prisma-schema-reference
- Prisma migrations: https://www.prisma.io/docs/orm/prisma-migrate
