// Fetches the brand faces from Fontshare (design-system.md §4, U8-4):
//
//   npm run fonts:fetch
//
// The ITF Free Font License (FFL v2.0, §02) forbids making the font files
// available through a repository or a publicly accessible server, and this
// repository is public. So the files are never committed: each developer and
// each build environment fetches its own official copy, which the licence
// requires of third parties anyway. They go, unmodified (no subsetting or
// conversion, FFL §02 and §05), into the git-ignored `public/fonts/` folder of
// each app, with the licence text next to them. Without them the fallback
// stacks in brand.css render. No dependencies: a minimal ZIP reader on zlib.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const SOURCE = "https://api.fontshare.com/v2/fonts/download/";

/** Official archives and the members used, by family (weights 700; 400, 500). */
export const FAMILIES = {
  panchang: {
    licence: "Panchang_Complete/License/FFL.txt",
    files: ["Panchang_Complete/Fonts/WEB/fonts/Panchang-Bold.woff2"],
  },
  switzer: {
    licence: "Switzer_Complete/License/FFL.txt",
    files: [
      "Switzer_Complete/Fonts/WEB/fonts/Switzer-Regular.woff2",
      "Switzer_Complete/Fonts/WEB/fonts/Switzer-Medium.woff2",
    ],
  },
};

export const APPS = ["admin", "storefront"];

/** Reads named members from a ZIP archive (stored or deflated entries). */
export function unzipMembers(zip, names) {
  const wanted = new Set(names);
  // End of central directory: signature 0x06054b50 within the last 64 KiB.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1)
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd === -1) throw new Error("not a ZIP archive");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let n = 0; n < count; n += 1) {
    if (zip.readUInt32LE(p) !== 0x02014b50)
      throw new Error("bad central directory");
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const extraLength = zip.readUInt16LE(p + 30);
    const commentLength = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;
    if (!wanted.has(name)) continue;
    if (zip.readUInt32LE(local) !== 0x04034b50)
      throw new Error("bad local header");
    const start =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const compressed = zip.subarray(start, start + size);
    if (method === 0) out.set(name, Buffer.from(compressed));
    else if (method === 8) out.set(name, inflateRawSync(compressed));
    else throw new Error(`${name}: unsupported compression ${method}`);
  }
  for (const name of wanted)
    if (!out.has(name)) throw new Error(`${name} is not in the archive`);
  return out;
}

export const isWoff2 = (data) =>
  data.length > 48 && data.toString("latin1", 0, 4) === "wOF2";

async function main(root) {
  for (const [family, { licence, files }] of Object.entries(FAMILIES)) {
    const response = await fetch(`${SOURCE}${family}`);
    if (!response.ok)
      throw new Error(`${family}: Fontshare answered ${response.status}`);
    const members = unzipMembers(Buffer.from(await response.arrayBuffer()), [
      licence,
      ...files,
    ]);
    for (const file of files)
      if (!isWoff2(members.get(file)))
        throw new Error(`${file} is not a WOFF2 file`);
    for (const app of APPS) {
      const dir = join(root, "apps", app, "public", "fonts");
      mkdirSync(dir, { recursive: true });
      for (const file of files)
        writeFileSync(join(dir, file.split("/").pop()), members.get(file));
      writeFileSync(join(dir, `${family}-FFL.txt`), members.get(licence));
    }
    console.log(`${family}: ${files.length} file(s) and the licence`);
  }
  console.log(
    `Fonts written to apps/{${APPS.join(",")}}/public/fonts (git-ignored).`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(fileURLToPath(new URL("..", import.meta.url))).catch((error) => {
    console.error(`fonts:fetch failed: ${error.message}`);
    process.exitCode = 1;
  });
}
