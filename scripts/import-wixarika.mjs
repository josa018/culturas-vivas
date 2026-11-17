import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";

const source = process.argv[2];
if (!source) throw new Error("Uso: node scripts/import-wixarika.mjs <carpeta de imágenes>");
const categories = { arte: "arte", comida: "comida", cultura: "cultura", vestuario: "vestimenta", vivienda: "vivienda" };
for (const file of await readdir(source)) {
  const match = file.match(/^([a-z]+)(\d+)\.jpeg$/i);
  if (!match || !categories[match[1].toLowerCase()]) continue;
  const destination = path.join("public/assets/wixarika", categories[match[1].toLowerCase()]);
  await mkdir(destination, { recursive: true });
  // A common canvas keeps the VR frames consistent without cropping or stretching.
  await sharp(path.join(source, file)).rotate()
    .resize(1600, 1000, { fit: "contain", background: "#111318" })
    .webp({ quality: 85 })
    .toFile(path.join(destination, `${match[2]}.webp`));
  console.log(`Importada: ${file}`);
}
