import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

/**
 * Read access to a sealed evidence pack. Kane seals packs as `.evidence` zips, but an unsealed
 * (killed) run or an extracted copy is a plain directory, so both shapes sit behind one interface.
 */
export interface PackReader {
  readonly path: string;
  /** Every file in the pack, as forward-slash paths relative to the pack root. */
  readonly entries: readonly string[];
  read(entry: string): Promise<Uint8Array | undefined>;
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) await walk(root, full, out);
    else if (dirent.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
  }
}

async function openDirectoryPack(packPath: string): Promise<PackReader> {
  const entries: string[] = [];
  await walk(packPath, packPath, entries);
  const known = new Set(entries);
  return {
    path: packPath,
    entries,
    read: async (entry) => (known.has(entry) ? new Uint8Array(await readFile(path.join(packPath, entry))) : undefined),
  };
}

async function openZipPack(packPath: string): Promise<PackReader> {
  const archive = new Uint8Array(await readFile(packPath));
  const entries: string[] = [];
  // The filter sees every entry before inflation; returning false lists names without decompressing screenshots.
  unzipSync(archive, {
    filter: (file) => {
      if (!file.name.endsWith("/")) entries.push(file.name);
      return false;
    },
  });
  const known = new Set(entries);
  return {
    path: packPath,
    entries,
    read: async (entry) => {
      if (!known.has(entry)) return undefined;
      return unzipSync(archive, { filter: (file) => file.name === entry })[entry];
    },
  };
}

export async function openPack(packPath: string): Promise<PackReader> {
  const info = await stat(packPath);
  return info.isDirectory() ? openDirectoryPack(packPath) : openZipPack(packPath);
}
