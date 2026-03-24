async function getFs() {
  return import("node:fs/promises");
}

export async function readJsonFile(fileUrl) {
  const fs = await getFs();
  const raw = await fs.readFile(fileUrl, "utf8");
  return JSON.parse(raw);
}

export async function writeJsonFile(fileUrl, payload) {
  const fs = await getFs();
  await fs.mkdir(new URL(".", fileUrl), { recursive: true });
  await fs.writeFile(fileUrl, JSON.stringify(payload, null, 2), "utf8");
}
