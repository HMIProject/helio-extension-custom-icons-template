import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addIcon,
  applyUpload,
  deleteIcon,
  deleteIcons,
  ensureSvgNamespace,
  generateIconsFile,
  listIcons,
  nameFromFileName,
  planUpload,
  readIcon,
  renameIcon,
  replaceIcon,
  toPascalCase,
} from "./icons.mjs";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="currentColor"/></svg>';
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
      { fileName: "arrow-left.svg", exportName: "iconArrowLeft", iconName: "ArrowLeft", usesCurrentColor: true, version: expect.any(String) },
      { fileName: "Fixed.svg", exportName: "iconFixed", iconName: "Fixed", usesCurrentColor: false, version: expect.any(String) },
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

describe("ensureSvgNamespace", () => {
  const NS = 'xmlns="http://www.w3.org/2000/svg"';

  it("adds a missing xmlns to the root element", () => {
    expect(ensureSvgNamespace('<svg viewBox="0 0 24 24"><path/></svg>')).toBe(
      `<svg ${NS} viewBox="0 0 24 24"><path/></svg>`,
    );
    expect(ensureSvgNamespace("<svg><path/></svg>")).toBe(`<svg ${NS}><path/></svg>`);
  });

  it("keeps the prolog and only touches the root element", () => {
    const input = '<?xml version="1.0"?>\n<!-- <svg> in a comment -->\n<svg\n  width="1em"><g><svg x="1"/></g></svg>';
    expect(ensureSvgNamespace(input)).toBe(
      `<?xml version="1.0"?>\n<!-- <svg> in a comment -->\n<svg ${NS}\n  width="1em"><g><svg x="1"/></g></svg>`,
    );
  });

  it("handles '>' inside attribute values", () => {
    expect(ensureSvgNamespace('<svg data-x="a>b"><path/></svg>')).toBe(`<svg ${NS} data-x="a>b"><path/></svg>`);
  });

  it.each([
    `<svg ${NS}><path/></svg>`,
    "<svg xmlns='http://www.w3.org/2000/svg'><path/></svg>",
    '<svg width="1" xmlns = "http://www.w3.org/2000/svg"><path/></svg>',
  ])("leaves %j unchanged", (input) => {
    expect(ensureSvgNamespace(input)).toBe(input);
  });

  it("does not treat a prefixed namespace as the default namespace", () => {
    expect(ensureSvgNamespace('<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use/></svg>')).toBe(
      `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><use/></svg>`,
    );
  });

  it("is applied when uploading", () => {
    addIcon("NoNs", '<svg viewBox="0 0 24 24"><path fill="currentColor"/></svg>', svgDir);
    expect(readIcon("NoNs.svg", svgDir)).toBe(`<svg ${NS} viewBox="0 0 24 24"><path fill="currentColor"/></svg>`);
  });
});

describe("nameFromFileName", () => {
  it.each([
    ["Lock.svg", "Lock"],
    ["my icon (1).svg", "my icon -1"],
    ["folder/sub/arrow.SVG", "arrow"],
    ["äöü.svg", "icon"],
  ])("%j -> %j", (input, expected) => {
    expect(nameFromFileName(input)).toBe(expected);
  });
});

describe("upload with replace", () => {
  const V1 = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1"/></svg>';
  const V2 = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M2"/></svg>';

  it("classifies files as add, replace, unchanged and error without writing", () => {
    addIcon("Lock", V1, svgDir);
    addIcon("Key", V1, svgDir);
    const plan = planUpload(
      [
        { name: "lock.svg", svg: V2 },
        { name: "Key.svg", svg: V1 },
        { name: "New One.svg", svg: V1 },
        { name: "broken.svg", svg: "<html/>" },
      ],
      svgDir,
    );
    expect(plan.map(({ action, fileName }) => [action, fileName])).toEqual([
      ["replace", "Lock.svg"],
      ["unchanged", "Key.svg"],
      ["add", "New One.svg"],
      ["error", undefined],
    ]);
    expect(plan[3].error).toMatch(/not a valid SVG/);
    expect(readIcon("Lock.svg", svgDir)).toBe(V1);
    expect(fs.readdirSync(svgDir).sort()).toEqual(["Key.svg", "Lock.svg"]);
  });

  it("treats missing xmlns as the same content", () => {
    addIcon("Lock", '<svg><path d="M1"/></svg>', svgDir);
    expect(planUpload([{ name: "Lock.svg", svg: '<svg><path d="M1"/></svg>' }], svgDir)[0].action).toBe("unchanged");
  });

  it("reports two files with the same icon name in one upload", () => {
    const plan = planUpload(
      [
        { name: "my-icon.svg", svg: V1 },
        { name: "my_icon.svg", svg: V2 },
      ],
      svgDir,
    );
    expect(plan.map((result) => result.action)).toEqual(["add", "error"]);
    expect(plan[1].error).toMatch(/my-icon\.svg/);
  });

  it("applies the upload and keeps the existing file name when replacing", () => {
    addIcon("Lock", V1, svgDir);
    const results = applyUpload(
      [
        { name: "lock.svg", svg: V2 },
        { name: "Key.svg", svg: V1 },
      ],
      svgDir,
    );
    expect(results).toEqual([
      { source: "lock.svg", action: "replace", fileName: "Lock.svg", iconName: "Lock" },
      { source: "Key.svg", action: "add", fileName: "Key.svg", iconName: "Key" },
    ]);
    expect(readIcon("Lock.svg", svgDir)).toBe(V2);
    expect(readIcon("Key.svg", svgDir)).toBe(V1);
    // No temporary files are left behind.
    expect(fs.readdirSync(svgDir).sort()).toEqual(["Key.svg", "Lock.svg"]);
  });

  it("changes the version of a replaced icon only", () => {
    addIcon("Lock", V1, svgDir);
    addIcon("Key", V1, svgDir);
    const before = Object.fromEntries(listIcons(svgDir).map((icon) => [icon.fileName, icon.version]));
    applyUpload([{ name: "Lock.svg", svg: `${V2}  ` }], svgDir);
    const after = Object.fromEntries(listIcons(svgDir).map((icon) => [icon.fileName, icon.version]));
    expect(after["Lock.svg"]).not.toBe(before["Lock.svg"]);
    expect(after["Key.svg"]).toBe(before["Key.svg"]);
  });

  it("replaces a single icon by file name", () => {
    addIcon("Lock", V1, svgDir);
    expect(replaceIcon("Lock.svg", V2, svgDir)).toMatchObject({ fileName: "Lock.svg", changed: true });
    expect(replaceIcon("Lock.svg", V2, svgDir)).toMatchObject({ changed: false });
    expect(readIcon("Lock.svg", svgDir)).toBe(V2);
    expect(() => replaceIcon("Lock.svg", "<html/>", svgDir)).toThrow(/not a valid SVG/);
    expect(() => replaceIcon("Missing.svg", V2, svgDir)).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => replaceIcon("../Lock.svg", V2, svgDir)).toThrow();
  });
});

describe("deleteIcons", () => {
  it("deletes several icons and reports the ones that could not be deleted", () => {
    addIcon("Lock", SVG, svgDir);
    addIcon("Key", SVG, svgDir);
    addIcon("Keep", SVG, svgDir);
    fs.writeFileSync(path.join(dir, "outside.svg"), SVG);
    expect(deleteIcons(["Lock.svg", "Key.svg", "Missing.svg", "../outside.svg"], svgDir)).toEqual([
      { fileName: "Lock.svg", deleted: true },
      { fileName: "Key.svg", deleted: true },
      { fileName: "Missing.svg", deleted: false, error: 'Icon "Missing.svg" not found.' },
      { fileName: "../outside.svg", deleted: false, error: "Invalid file name." },
    ]);
    expect(fs.readdirSync(svgDir)).toEqual(["Keep.svg"]);
    expect(fs.existsSync(path.join(dir, "outside.svg"))).toBe(true);
  });

  it("accepts an empty or invalid list", () => {
    expect(deleteIcons([], svgDir)).toEqual([]);
    expect(deleteIcons(undefined, svgDir)).toEqual([]);
  });
});

describe("generateIconsFile with allowEmpty", () => {
  it("writes an empty icon list instead of failing", () => {
    const iconsFile = path.join(dir, "icons.tsx");
    expect(generateIconsFile({ svgDir, iconsFile, allowEmpty: true })).toBe(0);
    const content = fs.readFileSync(iconsFile, "utf8");
    expect(content).toContain("export const icons: CreateIconResult[] = [];");
    expect(content).not.toContain("./svg/");
  });

  it("removes deleted icons from the file", () => {
    const iconsFile = path.join(dir, "icons.tsx");
    addIcon("Lock", SVG, svgDir);
    addIcon("Key", SVG, svgDir);
    generateIconsFile({ svgDir, iconsFile, allowEmpty: true });
    deleteIcons(["Lock.svg"], svgDir);
    generateIconsFile({ svgDir, iconsFile, allowEmpty: true });
    const content = fs.readFileSync(iconsFile, "utf8");
    expect(content).toContain('import Key from "./svg/Key.svg";');
    expect(content).not.toContain("Lock");
  });

  it("does not rewrite the file when nothing changed", () => {
    const iconsFile = path.join(dir, "icons.tsx");
    addIcon("Lock", SVG, svgDir);
    generateIconsFile({ svgDir, iconsFile });
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(iconsFile, past, past);
    generateIconsFile({ svgDir, iconsFile });
    expect(fs.statSync(iconsFile).mtimeMs).toBe(past.getTime());
  });
});
