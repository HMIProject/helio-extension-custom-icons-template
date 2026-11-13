import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addIcon,
  deleteIcon,
  generateIconsFile,
  listIcons,
  readIcon,
  renameIcon,
  toPascalCase,
} from "./icons.mjs";

const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="currentColor"/></svg>';
const FIXED_COLOR_SVG = '<?xml version="1.0"?>\n<svg viewBox="0 0 24 24"><path fill="#000"/></svg>';

let dir;
let svgDir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "helio-icons-"));
  svgDir = path.join(dir, "svg");
  fs.mkdirSync(svgDir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("toPascalCase", () => {
  it("builds valid component names", () => {
    expect(toPascalCase("arrow-left")).toBe("ArrowLeft");
    expect(toPascalCase("my icon_2")).toBe("MyIcon2");
    expect(toPascalCase("3d")).toBe("Icon3d");
    expect(toPascalCase("---")).toBe("Icon");
  });
});

describe("addIcon", () => {
  it("stores the SVG and lists it", () => {
    addIcon("arrow-left", SVG, svgDir);
    addIcon("Fixed", FIXED_COLOR_SVG, svgDir);
    expect(readIcon("arrow-left.svg", svgDir)).toBe(SVG);
    expect(listIcons(svgDir)).toEqual([
      { fileName: "arrow-left.svg", exportName: "iconArrowLeft", iconName: "ArrowLeft", usesCurrentColor: true },
      { fileName: "Fixed.svg", exportName: "iconFixed", iconName: "Fixed", usesCurrentColor: false },
    ]);
  });

  it("strips a .svg extension from the name", () => {
    expect(addIcon("Lock.svg", SVG, svgDir).fileName).toBe("Lock.svg");
  });

  it.each(["", "   ", "../evil", "a/b", "a\\b", "näme", "x".repeat(101)])("rejects the name %j", (name) => {
    expect(() => addIcon(name, SVG, svgDir)).toThrow();
    expect(fs.readdirSync(svgDir)).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual(["svg"]);
  });

  it("rejects content that is not an SVG", () => {
    expect(() => addIcon("x", "<html></html>", svgDir)).toThrow(/not a valid SVG/);
    expect(() => addIcon("x", "hello", svgDir)).toThrow(/not a valid SVG/);
  });

  it("rejects files larger than 1 MB", () => {
    const big = `<svg>${" ".repeat(1024 * 1024)}</svg>`;
    expect(() => addIcon("big", big, svgDir)).toThrow(/1 MB/);
  });

  it("rejects names that result in the same icon name", () => {
    addIcon("Lock", SVG, svgDir);
    expect(() => addIcon("lock", SVG, svgDir)).toThrow(/already exists/);
    expect(() => addIcon("Lock", SVG, svgDir)).toThrow(/already exists/);
  });
});

describe("renameIcon", () => {
  it("renames the file", () => {
    addIcon("Lock", SVG, svgDir);
    expect(renameIcon("Lock.svg", "Padlock", svgDir).iconName).toBe("Padlock");
    expect(fs.readdirSync(svgDir)).toEqual(["Padlock.svg"]);
  });

  it("refuses to overwrite another icon", () => {
    addIcon("Lock", SVG, svgDir);
    addIcon("Key", SVG, svgDir);
    expect(() => renameIcon("Key.svg", "lock", svgDir)).toThrow(/already exists/);
    expect(fs.readdirSync(svgDir).sort()).toEqual(["Key.svg", "Lock.svg"]);
  });

  it("allows changing only the spelling of the same icon", () => {
    addIcon("lock", SVG, svgDir);
    expect(renameIcon("lock.svg", "Lock", svgDir).fileName).toBe("Lock.svg");
  });
});

describe("file access", () => {
  it.each(["../secret.svg", "..", "sub/x.svg", "x.txt"])("rejects %j", (fileName) => {
    fs.writeFileSync(path.join(dir, "secret.svg"), SVG);
    expect(() => readIcon(fileName, svgDir)).toThrow();
    expect(() => deleteIcon(fileName, svgDir)).toThrow();
    expect(() => renameIcon(fileName, "new", svgDir)).toThrow();
    expect(fs.existsSync(path.join(dir, "secret.svg"))).toBe(true);
  });

  it("reports missing icons with status 404", () => {
    expect(() => deleteIcon("missing.svg", svgDir)).toThrow(expect.objectContaining({ status: 404 }));
  });

  it("deletes an icon", () => {
    addIcon("Lock", SVG, svgDir);
    deleteIcon("Lock.svg", svgDir);
    expect(listIcons(svgDir)).toEqual([]);
  });
});

describe("generateIconsFile", () => {
  it("writes the icons module", () => {
    addIcon("Lock", SVG, svgDir);
    addIcon("arrow-left", SVG, svgDir);
    const iconsFile = path.join(dir, "icons.tsx");
    expect(generateIconsFile({ svgDir, iconsFile })).toBe(2);
    expect(fs.readFileSync(iconsFile, "utf8")).toBe(`import { createIcon } from "@hmiproject/helio-sdk";
import { companyName } from "./company";
import { namespace } from "./namespace";
import ArrowLeft from "./svg/arrow-left.svg";
import Lock from "./svg/Lock.svg";

export const iconArrowLeft = createIcon(namespace, {
  name: "ArrowLeft",
  category: companyName,
  Icon: ArrowLeft,
});

export const iconLock = createIcon(namespace, {
  name: "Lock",
  category: companyName,
  Icon: Lock,
});

export const icons = [
  iconArrowLeft,
  iconLock
];
`);
  });

  it("fails without icons", () => {
    expect(() => generateIconsFile({ svgDir, iconsFile: path.join(dir, "icons.tsx") })).toThrow(/No SVG files/);
  });

  it("fails if two files result in the same icon name", () => {
    fs.writeFileSync(path.join(svgDir, "my-icon.svg"), SVG);
    fs.writeFileSync(path.join(svgDir, "my_icon.svg"), SVG);
    expect(() => generateIconsFile({ svgDir, iconsFile: path.join(dir, "icons.tsx") })).toThrow(/both result/);
  });
});
