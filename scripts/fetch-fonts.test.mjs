// The font fetcher's ZIP reader and WOFF2 check, on archives built here.
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { FAMILIES, isWoff2, unzipMembers } from "./fetch-fonts.mjs";

/** A minimal ZIP: one local header and one central entry per file. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate } of entries) {
    const body = deflate ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const woff2 = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(60, 1)]);

describe("unzipMembers", () => {
  it("reads stored and deflated members by name, unchanged", () => {
    const archive = zip([
      { name: "a/License/FFL.txt", data: Buffer.from("licence text") },
      { name: "a/Font-Bold.woff2", data: woff2, deflate: true },
      { name: "a/unused.otf", data: Buffer.from("x") },
    ]);
    const out = unzipMembers(archive, [
      "a/License/FFL.txt",
      "a/Font-Bold.woff2",
    ]);
    expect(out.get("a/License/FFL.txt").toString()).toBe("licence text");
    expect(out.get("a/Font-Bold.woff2").equals(woff2)).toBe(true);
    expect(out.has("a/unused.otf")).toBe(false);
  });

  it("fails when a member is missing or the data is not a ZIP", () => {
    const archive = zip([{ name: "a.txt", data: Buffer.from("a") }]);
    expect(() => unzipMembers(archive, ["b.txt"])).toThrow(
      "b.txt is not in the archive",
    );
    expect(() =>
      unzipMembers(Buffer.from("not a zip at all, really"), []),
    ).toThrow("not a ZIP archive");
  });
});

describe("isWoff2", () => {
  it("accepts only the WOFF2 signature", () => {
    expect(isWoff2(woff2)).toBe(true);
    expect(
      isWoff2(Buffer.concat([Buffer.from("wOFF"), Buffer.alloc(60)])),
    ).toBe(false);
    expect(isWoff2(Buffer.from("<html>"))).toBe(false);
  });
});

describe("FAMILIES", () => {
  it("takes the design-system weights and each family's licence", () => {
    expect(
      Object.values(FAMILIES).flatMap((f) =>
        f.files.map((p) => p.split("/").pop()),
      ),
    ).toEqual([
      "Panchang-Bold.woff2",
      "Switzer-Regular.woff2",
      "Switzer-Medium.woff2",
    ]);
    for (const family of Object.values(FAMILIES))
      expect(family.licence).toMatch(/\/License\/FFL\.txt$/);
  });
});
