import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveCompany, outputFileName, readCompanyConfig, toSlug, writeCompanyConfig } from "./company.mjs";

describe("deriveCompany", () => {
  it.each([
    ["HMI Project", "hmi-project", "com.hmi-project.custom-icons"],
    ["Müller & Söhne GmbH", "muller-sohne-gmbh", "com.muller-sohne-gmbh.custom-icons"],
    ["  ACME  ", "acme", "com.acme.custom-icons"],
    ["3M", "3m", "com.3m.custom-icons"],
  ])("derives everything from %j", (name, slug, namespace) => {
    expect(deriveCompany(name)).toEqual({ companyName: name.trim(), companySlug: slug, namespace });
  });

  it.each(["", "   ", "&&&", "x".repeat(101)])("rejects %j", (name) => {
    expect(() => deriveCompany(name)).toThrow();
  });

  it("builds the output file name", () => {
    expect(outputFileName(toSlug("HMI Project"), "1.2.3")).toBe("lib/helio-extension-icons-hmi-project-1.2.3.js");
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

  it("writes only the company name and drops the legacy namespaceDomain", () => {
    fs.writeFileSync(file, JSON.stringify({ namespaceDomain: "com.old", companyName: "Old", extra: 1 }));
    writeCompanyConfig(" New Co ", file);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ extra: 1, companyName: "New Co" });
    expect(readCompanyConfig(file).namespace).toBe("com.new-co.custom-icons");
  });

  it("does not write an invalid name", () => {
    fs.writeFileSync(file, JSON.stringify({ companyName: "Old" }));
    expect(() => writeCompanyConfig("  ", file)).toThrow();
    expect(readCompanyConfig(file).companyName).toBe("Old");
  });

  it("explains a missing or empty config", () => {
    expect(() => readCompanyConfig(file)).toThrow(/not found/);
    fs.writeFileSync(file, "{}");
    expect(() => readCompanyConfig(file)).toThrow(/companyName/);
  });
});
