import fs from "fs";
import fsExtra from "fs/promises";
import archiver from "archiver";

import path from "path";

export async function createZipArchive(outputPath, filePaths) {
  const dir = path.dirname(outputPath);
  await fsExtra.mkdir(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(outputPath));
    output.on("error", err => reject(err));

    archive.on("error", err => reject(err));
    archive.on("warning", err => {
      if (err.code === "ENOENT") {
        console.warn("zip warning", err);
      } else {
        reject(err);
      }
    });

    archive.pipe(output);

    for (const filePath of filePaths) {
      const name = filePath.split(/[\\/]/).pop();
      archive.file(filePath, { name });
    }

    archive.finalize();
  });
}
