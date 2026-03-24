import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  runtimeTargets,
  sharedRuntimeDefaults
} from "../cloud/shared/runtimeConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const TARGET_ALIASES = Object.freeze({
  github: "github",
  "github-primary": "github",
  cloudrun: "cloudrunBackup1",
  "cloudrun-backup1": "cloudrunBackup1",
  oci: "ociBackup2",
  "oci-backup2": "ociBackup2"
});

function normalizeTargetName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolveTarget(targetName) {
  const alias = TARGET_ALIASES[normalizeTargetName(targetName)];
  if (!alias || !runtimeTargets[alias]) {
    throw new Error(
      `Unknown target '${targetName}'. Use one of: ${Object.keys(TARGET_ALIASES).join(", ")}`
    );
  }

  return alias;
}

function buildTargetEnv(targetName) {
  const target = resolveTarget(targetName);
  return {
    ...sharedRuntimeDefaults,
    ...runtimeTargets[target]
  };
}

function toEnvText(env) {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n")}\n`;
}

function toYamlText(env) {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}: ${JSON.stringify(String(value))}`)
    .join("\n")}\n`;
}

function getFormatFromPath(outputPath) {
  const lower = String(outputPath || "").trim().toLowerCase();
  if (
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".yaml.example") ||
    lower.endsWith(".yml.example")
  ) {
    return "yaml";
  }
  return "env";
}

async function writeTargetFile(targetName, outputPath) {
  const absolutePath = path.resolve(REPO_ROOT, outputPath);
  const env = buildTargetEnv(targetName);
  const format = getFormatFromPath(absolutePath);
  const payload = format === "yaml" ? toYamlText(env) : toEnvText(env);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, payload, "utf8");
  console.log(`Updated ${path.relative(REPO_ROOT, absolutePath)}`);
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/render-cloud-env.js github-env",
      "  node scripts/render-cloud-env.js write <target> <outputPath>",
      "  node scripts/render-cloud-env.js sync-examples"
    ].join("\n")
  );
}

async function main() {
  const command = String(process.argv[2] || "sync-examples").trim().toLowerCase();

  if (command === "github-env") {
    process.stdout.write(toEnvText(buildTargetEnv("github")));
    return;
  }

  if (command === "write") {
    const targetName = process.argv[3];
    const outputPath = process.argv[4];

    if (!targetName || !outputPath) {
      throw new Error("write requires <target> and <outputPath>");
    }

    await writeTargetFile(targetName, outputPath);
    return;
  }

  if (command === "sync-examples") {
    await writeTargetFile("cloudrun-backup1", "cloud/cloudrun/env.backup1.yaml.example");
    await writeTargetFile("oci-backup2", "cloud/oci/backup2.env.example");
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
