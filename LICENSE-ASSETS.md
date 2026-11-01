# Ketentuan Aset & Publikasi Ulang

*(English summary at the bottom.)*

Lisensi MIT di file `LICENSE` **cuma berlaku buat kode**. Semua yang ada di bawah ini **gak termasuk** lisensi MIT.

## 1. Aset yang gak termasuk MIT

| Aset | Lokasi | Status |
|---|---|---|
| Rekaman suara teriak ("HIDUP EVALUASIII!") | `public/audio/teriak-hidup.m4a` | Suara asli pembuat. **Hak cipta dilindungi.** Gak boleh dipakai di luar repo ini atau dipublish ulang. |
| Efek suara "fahhh" | `public/audio/fahhh.m4a` | Efek suara pihak ketiga, **bukan milik pembuat** dan gak dilisensikan lewat repo ini. Ganti sebelum dipublish ulang. |
| Model 3D | `public/models/*.glb` | Dibuat pakai Meshy (AI), animasi dari Mixamo. Boleh dipakai **cuma buat ngejalanin game ini**. Gak boleh diekstrak, dijual, atau dipakai ulang sebagai aset terpisah. Animasi Mixamo tunduk ke ketentuan Adobe. |
| Cover & screenshot | `docs/` | Hak cipta dilindungi. |
| Nama "Hutan Terakhir", nama & akun pembuat (after9to5build) | semua tempat | Identitas pembuat. Gak boleh dipakai buat kesan versi resmi. |

## 2. Kalau mau modif atau publish ulang

Boleh, asal semua poin ini dipenuhi:

1. **Ganti suara.** Hapus `teriak-hidup.m4a` dan `fahhh.m4a`, ganti pakai rekaman atau efek suara milik lo sendiri (atau yang lisensinya jelas). Kalau file-nya gak ada, game otomatis pakai suara sintetis bawaan kode.
2. **Ganti identitas.** Ganti semua atribut pribadi pembuat (nama, akun, link itch.io, link media sosial, kredit "dibuat oleh") pakai identitas lo sendiri.
3. **Kasih tau itu versi modifikasi.** Tulis jelas di halaman publikasi bahwa itu versi modifikasi dari Hutan Terakhir dan **bukan versi resmi**. Pakai judul lain, atau tambahin keterangan "(versi modifikasi)".
4. **Tetap pertahankan aturan konten satir:**
   - Disclaimer "Karya fiksi & satire" tetap ada di menu dan layar akhir.
   - Fakta yang ditampilin wajib akurat dan ada sumbernya.
   - Jangan pakai wajah, nama, suara, atau rekaman tokoh asli (pejabat, selebriti, orang biasa).
   - Nama perusahaan dan lembaga tetap fiktif dan gak mirip yang asli.

## 3. Tanggung jawab

- Pembuat **cuma bertanggung jawab atas versi resmi**: repo ini dan halaman resmi di [after9to5build.itch.io/hutan-terakhir](https://after9to5build.itch.io/hutan-terakhir).
- Semua versi modifikasi, fork, atau publikasi ulang **sepenuhnya tanggung jawab orang yang memodif dan mempublishnya**, termasuk isi, aset, dan akibat hukumnya.
- Software ini dikasih **apa adanya**, tanpa jaminan apa pun (lihat `LICENSE`).

---

## English summary

- **Code** (`src/`, `index.html`, `tools/`, config files): MIT License.
- **Not covered by MIT:** the author's voice recording (`teriak-hidup.m4a`, all rights reserved), the third-party sound effect (`fahhh.m4a`, not licensed here), the 3D models (Meshy + Mixamo animations, for running this game only, no standalone reuse), cover and screenshots in `docs/`, the "Hutan Terakhir" name and the author's identity.
- **Republishing a modified version is allowed if you:** replace both audio files with your own, replace all of the author's personal attributes (name, accounts, links, credits) with your own, clearly label it as an unofficial modified version, and keep the fiction/satire disclaimer, sourced facts, and the no-real-people rule.
- **Liability:** the author is only responsible for the official version (this repo and the official itch.io page). Any modified or republished version is solely the responsibility of whoever modifies or publishes it.
