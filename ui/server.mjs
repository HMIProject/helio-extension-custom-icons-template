// Local web interface for managing icons, the company name and building the
// extension. Start with `npm run ui`. Binds to 127.0.0.1 only.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  configFile,
  deriveCompany,
  outputFileName,
  projectRoot,
  readPackageVersion,
  writeCompanyConfig,
} from "../scripts/company.mjs";
import {
  addIcon,
  deleteIcon,
  generateIconsFile,
  IconError,
  listIcons,
  MAX_SVG_BYTES,
  readIcon,
  renameIcon,
} from "../scripts/icons.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 5178;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const rollupBin = path.join(projectRoot, "node_modules", "rollup", "dist", "bin", "rollup");

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Helpers

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      // JSON escaping can roughly double the SVG size; allow some headroom.
      if (size > MAX_SVG_BYTES * 3) {
        reject(new HttpError(413, "Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new HttpError(400, "Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function readConfigFile() {
  return fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};
}

/** Company name plus all derived values; derived values are null while no valid name is set. */
function companyInfo() {
  const companyName = String(readConfigFile().companyName ?? "").trim();
  let derived = { companySlug: null, namespace: null };
  try {
    derived = deriveCompany(companyName);
  } catch {
    // No valid name yet; the UI asks the user to enter one.
  }
  return {
    companyName,
    companySlug: derived.companySlug,
    namespace: derived.namespace,
    version: readPackageVersion(),
    outputFile: derived.companySlug ? outputFileName(derived.companySlug) : null,
  };
}

// ---------------------------------------------------------------------------
// Build

let buildRunning = false;

function runRollup() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [rollupBin, "--config", "rollup.config.mjs"], {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    let log = "";
    child.stdout.on("data", (chunk) => (log += chunk));
    child.stderr.on("data", (chunk) => (log += chunk));
    child.on("error", (error) => resolve({ code: 1, log: log + error.message }));
    child.on("close", (code) => resolve({ code, log }));
  });
}

async function build() {
  if (buildRunning) throw new HttpError(409, "A build is already running.");
  if (!fs.existsSync(rollupBin)) {
    throw new HttpError(500, 'Rollup not found. Please run "npm install" first.');
  }
  buildRunning = true;
  const started = Date.now();
  try {
    const info = companyInfo();
    if (!info.companySlug) throw new HttpError(400, "Please set the company name first.");

    const count = generateIconsFile();
    const { code, log } = await runRollup();
    // Strip any remaining ANSI escape sequences.
    // eslint-disable-next-line no-control-regex
    const cleanLog = `Generated src/icons.tsx with ${count} icon(s).\n${log}`.replace(/\x1b\[[0-9;]*m/g, "");
    const ok = code === 0 && fs.existsSync(path.join(projectRoot, info.outputFile));
    return { ok, log: cleanLog.trim(), outputFile: ok ? info.outputFile : null, durationMs: Date.now() - started };
  } finally {
    buildRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Routing

async function handleApi(req, res, pathname) {
  const method = req.method;

  if (method !== "GET" && method !== "HEAD") {
    // Requiring JSON forces a CORS preflight for cross-origin requests,
    // which this server never answers, so other websites cannot write here.
    const type = req.headers["content-type"] ?? "";
    if (!type.startsWith("application/json")) {
      throw new HttpError(415, "Content-Type must be application/json.");
    }
  }

  if (pathname === "/api/company") {
    if (method === "GET") return send(res, 200, companyInfo());
    if (method === "PUT") {
      const body = await readJsonBody(req);
      try {
        writeCompanyConfig(body.companyName);
      } catch (error) {
        throw new HttpError(400, error.message);
      }
      return send(res, 200, companyInfo());
    }
  }

  // Derived values for a name without saving it, so the UI can show what a
  // change would do before the user confirms it.
  if (pathname === "/api/company/preview" && method === "POST") {
    const body = await readJsonBody(req);
    let derived;
    try {
      derived = deriveCompany(body.companyName);
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    return send(res, 200, { ...derived, outputFile: outputFileName(derived.companySlug) });
  }

  if (pathname === "/api/icons") {
    if (method === "GET") return send(res, 200, listIcons());
    if (method === "POST") {
      const body = await readJsonBody(req);
      const entry = addIcon(body.name, body.svg);
      return send(res, 201, entry);
    }
  }

  const iconMatch = pathname.match(/^\/api\/icons\/([^/]+)$/);
  if (iconMatch) {
    let fileName;
    try {
      fileName = decodeURIComponent(iconMatch[1]);
    } catch {
      throw new HttpError(400, "Invalid file name.");
    }
    if (method === "GET") return send(res, 200, readIcon(fileName), "image/svg+xml");
    if (method === "PATCH") {
      const body = await readJsonBody(req);
      return send(res, 200, renameIcon(fileName, body.name));
    }
    if (method === "DELETE") {
      deleteIcon(fileName);
      return send(res, 200, { deleted: fileName });
    }
  }

  if (pathname === "/api/build" && method === "POST") {
    const result = await build();
    return send(res, result.ok ? 200 : 500, result);
  }

  throw new HttpError(404, "Not found.");
}

function serveStatic(res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(publicDir, relative);
  if (!filePath.startsWith(publicDir + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
  const type = STATIC_TYPES[path.extname(filePath)] ?? "application/octet-stream";
  return send(res, 200, fs.readFileSync(filePath), type);
}

function isAllowedHost(hostHeader) {
  // Protects against DNS rebinding: only accept requests addressed to localhost.
  const host = String(hostHeader ?? "").replace(/:\d+$/, "");
  return host === "localhost" || host === "127.0.0.1";
}

const server = http.createServer(async (req, res) => {
  try {
    if (!isAllowedHost(req.headers.host)) throw new HttpError(403, "Forbidden host.");
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
    } else if (req.method === "GET") {
      serveStatic(res, pathname);
    } else {
      throw new HttpError(405, "Method not allowed.");
    }
  } catch (error) {
    const status = error instanceof HttpError || error instanceof IconError ? error.status : 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) send(res, status, { error: error.message });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Start with another port, e.g. PORT=5179 npm run ui`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`HELIO custom icons UI running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop.");
});
