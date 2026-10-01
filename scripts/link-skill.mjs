#!/usr/bin/env node
import { lstatSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node scripts/link-skill.mjs <skill-name> <skills-directory>";
const args = process.argv.slice(2);

if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  console.log(usage);
  process.exit(0);
}

function entryAt(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// Resolve existing parents before creating anything, including symlinked parents.
function canonicalPath(path) {
  if (entryAt(path)) return realpathSync(path);
  const parent = dirname(path);
  if (parent === path) throw new Error(`Cannot resolve directory: ${path}`);
  return join(canonicalPath(parent), basename(path));
}

try {
  if (args.length !== 2 || !args[1]) throw new Error(usage);
  const [name, requestedDirectory] = args;
  if (name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error("Use a skill name of up to 64 lowercase letters, digits and single hyphens.");
  }

  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  const skillsDirectory = realpathSync(join(repo, "skills"));
  const source = join(skillsDirectory, name);
  if (!entryAt(source)?.isDirectory() || !entryAt(join(source, "SKILL.md"))?.isFile()) {
    throw new Error(`Skill not found: skills/${name}/SKILL.md`);
  }

  const destination = canonicalPath(resolve(requestedDirectory));
  if (destination === skillsDirectory || destination.startsWith(skillsDirectory + sep)) {
    throw new Error("Choose an installation directory outside the repository's skills directory.");
  }

  const target = join(destination, name);
  const existing = entryAt(target);
  if (existing) {
    if (existing.isSymbolicLink()) {
      let linkedSource;
      try {
        linkedSource = realpathSync(target);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (linkedSource === source) {
        console.log(`Already linked: ${target}`);
        process.exit(0);
      }
    }
    throw new Error(`Destination already exists; left unchanged: ${target}`);
  }

  mkdirSync(destination, { recursive: true });
  symlinkSync(source, target, "dir");
  console.log(`Linked ${target} -> ${source}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
