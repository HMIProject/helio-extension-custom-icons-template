import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveCompany, normalizeDomain, outputFileName, readCompanyConfig, writeCompanyConfig } from "./company.mjs";

describe("normalizeDomain", () => {
  it.each([
    ["hmi-project.com", "hmi-project.com"],
    ["  HMI-Project.COM  ", "hmi-project.com"],
    ["https://www.hmi-project.com/de/kontakt?x=1#top", "hmi-project.com"],
    ["hmi-project.com:8080", "hmi-project.com"],
    ["hmi-project.com.", "hmi-project.com"],
    ["mueller.co.uk", "mueller.co.uk"],
    ["müller.de", "xn--mller-kva.de"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each(["", "   ", "hmi-project", "HMI Project", "-bad.com", "bad-.com", "a..com", "192.168.0.1", "x_y.com", `${"a".repeat(64)}.com`])(
    "rejects %j",
    (input) => {
      expect(() => normalizeDomain(input)).toThrow();
    },
  );
});

describe("deriveCompany", () => {
  it("derives everything from the domain", () => {
    expect(deriveCompany({ companyDomain: "hmi-project.com" })).toEqual({
      companyDomain: "hmi-project.com",
      displayName: "",
      companyName: "hmi-project.com",
      companySlug: "hmi-project",
      namespace: "com.hmi-project.custom-icons",
    });
  });

  it("uses the display name only for what HELIO shows", () => {
    expect(deriveCompany({ companyDomain: "hmi-project.com", displayName: "  HMI Project " })).toMatchObject({
      displayName: "HMI Project",
      companyName: "HMI Project",
      companySlug: "hmi-project",
      namespace: "com.hmi-project.custom-icons",
    });
  });

  it("handles multi-part endings and internationalized domains", () => {
    expect(deriveCompany({ companyDomain: "mueller.co.uk" })).toMatchObject({
      companySlug: "mueller-co",
      namespace: "uk.co.mueller.custom-icons",
    });
    expect(deriveCompany({ companyDomain: "müller.de" })).toMatchObject({
      companyName: "müller.de",
      companySlug: "xn--mller-kva",
      namespace: "de.xn--mller-kva.custom-icons",
    });
  });

  it("rejects a display name that is too long", () => {
    expect(() => deriveCompany({ companyDomain: "a.com", displayName: "x".repeat(101) })).toThrow(/display name/);
  });

  it("builds the output file name", () => {
    expect(outputFileName("hmi-project", "1.2.3")).toBe("lib/helio-extension-icons-hmi-project-1.2.3.js");
  });
});

describe("company config file", () => {
  let dir;
  let file;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "helio-company-"));
    file = path.join(dir, "company.config.json");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes the normalized domain and drops settings of earlier versions", () => {
    fs.writeFileSync(file, JSON.stringify({ namespaceDomain: "com.old", companyName: "Old", extra: 1 }));
    writeCompanyConfig({ companyDomain: "https://www.New-Co.com/", displayName: "New Co" }, file);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ extra: 1, companyDomain: "new-co.com", displayName: "New Co" });
    expect(readCompanyConfig(file).namespace).toBe("com.new-co.custom-icons");
  });

  it("removes the display name when it is cleared", () => {
    writeCompanyConfig({ companyDomain: "a.com", displayName: "A" }, file);
    writeCompanyConfig({ companyDomain: "a.com", displayName: "" }, file);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ companyDomain: "a.com" });
  });

  it("does not write an invalid domain", () => {
    writeCompanyConfig({ companyDomain: "old.com" }, file);
    expect(() => writeCompanyConfig({ companyDomain: "no domain" }, file)).toThrow();
    expect(readCompanyConfig(file).companyDomain).toBe("old.com");
  });

  it("explains a missing, empty or old config", () => {
    expect(() => readCompanyConfig(file)).toThrow(/not found/);
    fs.writeFileSync(file, "{}");
    expect(() => readCompanyConfig(file)).toThrow(/companyDomain/);
    fs.writeFileSync(file, JSON.stringify({ companyName: "Old" }));
    expect(() => readCompanyConfig(file)).toThrow(/old "companyName" setting/);
  });
});
