// Rebuilds original/frontend/build/ with the upstream toolchain (browserify, babelify es2015,
// browserify-ngannotate, angular templatecache), minus gulp 3, which crashes on Node 12 and later.
// It mirrors the upstream `html`, `views` and `browserify` gulp tasks. Needs `npm install` in
// original/frontend first; start.mjs never runs this, it serves the committed build/. The vendored
// CSS and fonts live only in build/vendor and are left untouched.
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "..", "original", "frontend");
const src = join(frontend, "src");
const out = join(frontend, "build");
const require = createRequire(join(frontend, "package.json"));
const browserify = require("browserify");
const babelify = require("babelify");
const ngAnnotate = require("browserify-ngannotate");
const jsStringEscape = require("js-string-escape");

async function listHtml(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return listHtml(path);
      return entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

async function writeTemplates() {
  const jsDir = join(src, "js");
  const files = await listHtml(jsDir);
  const puts = await Promise.all(
    files.map(async (file) => {
      const url = relative(jsDir, file).split(sep).join("/");
      const contents = jsStringEscape(await readFile(file, "utf8"));
      return `$templateCache.put("${url}","${contents}");`;
    }),
  );
  const module = `angular.module("templates", []).run(["$templateCache", function($templateCache) {${puts.join("\n")}}]);`;
  await writeFile(join(jsDir, "config", "app.templates.js"), module);
}

function bundle() {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(join(out, "main.js"));
    output.on("finish", resolve);
    output.on("error", reject);
    browserify(join(src, "js", "app.js"))
      .transform(babelify, { presets: [require.resolve("babel-preset-es2015")] })
      .transform(ngAnnotate)
      .bundle()
      .on("error", reject)
      .pipe(output);
  });
}

await mkdir(out, { recursive: true });
await writeTemplates();
await bundle();
await cp(join(src, "index.html"), join(out, "index.html"));
console.log(`built ${relative(process.cwd(), out)}`);
