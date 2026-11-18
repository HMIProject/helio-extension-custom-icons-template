// Local web interface for managing icons, the company domain and building the
// extension. Start with `npm run ui`. Binds to 127.0.0.1 only.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import {
  describeCompany,
  outputFileName,
  projectRoot,
  readCompanyConfig,
  readSavedCompany,
  writeCompanyConfig,
} from "../scripts/company.mjs";
import { UserError } from "../scripts/errors.mjs";
import {
  applyUpload,
  deleteIcons,
  generateIconsFile,
  listIcons,
  MAX_SVG_BYTES,
  planUpload,
  readIcon,
  renameIcon,
  replaceIcon,
} from "../scripts/icons.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 5178;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const rollupBin = path.join(projectRoot, "node_modules", "rollup", "dist", "bin", "rollup");

// Single requests carry one SVG; batch uploads carry many. JSON escaping can
// roughly double the SVG size, so allow some headroom. The UI splits large
// uploads into batches below these limits (see BATCH_MAX_* in ui/public/app.js).
const MAX_SINGLE_BYTES = MAX_SVG_BYTES * 3;
const MAX_UPLOAD = { maxBytes: 32 * 1024 * 1024, maxFiles: 500 };
// Deleting only sends file names, so all icons fit into one request.
const MAX_DELETE = { maxBytes: MAX_SINGLE_BYTES, maxFiles: 20000 };

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

// ---------------------------------------------------------------------------
// Helpers

function send(res, status, body, type = "application/json; charset=utf-8", cacheControl = "no-store") {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

function readJsonBody(req, maxBytes = MAX_SINGLE_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new UserError("Request is too large.", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new UserError("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

/** Reads `{ files: [...] }` and checks the list and its length. */
async function readFileList(req, { maxBytes, maxFiles }) {
  const { files } = await readJsonBody(req, maxBytes);
  if (!Array.isArray(files)) throw new UserError('"files" must be a list.');
  if (files.length > maxFiles) throw new UserError(`Please send at most ${maxFiles} files per request.`, 413);
  return files;
}

/**
 * Keeps src/icons.tsx in sync with src/svg, so it never imports files that no
 * longer exist. Runs after every request that may change icons and at startup.
 * It only writes when the content changes. The build regenerates it as well.
 */
function syncIconsFile() {
  try {
    generateIconsFile({ allowEmpty: true });
  } catch (error) {
    // Only happens with two files that result in the same icon name; the build reports it as well.
    console.error(`Could not update src/icons.tsx: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Build

let buildRunning = false;

/** Runs rollup (which also regenerates src/icons.tsx) and returns its exit code and output. */
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
  if (buildRunning) throw new UserError("A build is already running.", 409);
  if (!fs.existsSync(rollupBin)) {
    throw new UserError('Rollup not found. Please run "npm install" first.', 500);
  }
  const outputFile = outputFileName(readCompanyConfig().companySlug);
  buildRunning = true;
  try {
    const { code, log } = await runRollup();
    const ok = code === 0 && fs.existsSync(path.join(projectRoot, outputFile));
    return { ok, log: stripVTControlCharacters(log).trim(), outputFile: ok ? outputFile : null };
  } finally {
    buildRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Routing

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (method !== "GET" && method !== "HEAD") {
    // Requiring JSON forces a CORS preflight for cross-origin requests,
    // which this server never answers, so other websites cannot write here.
    const type = req.headers["content-type"] ?? "";
    if (!type.startsWith("application/json")) {
      throw new UserError("Content-Type must be application/json.", 415);
    }
  }

  if (pathname === "/api/company") {
    if (method === "GET") return send(res, 200, readSavedCompany());
    if (method === "PUT") {
      writeCompanyConfig(await readJsonBody(req));
      return send(res, 200, readSavedCompany());
    }
  }

  // Derived values without saving them, so the UI can show what a change
  // would do before the user confirms it.
  if (pathname === "/api/company/preview" && method === "POST") {
    return send(res, 200, describeCompany(await readJsonBody(req)));
  }

  if (pathname === "/api/icons" && method === "GET") return send(res, 200, listIcons());

  // Batch upload in two steps: "plan" shows what would happen (new, replace,
  // unchanged, error) without writing; "upload" applies it.
  if (pathname === "/api/icons/plan" && method === "POST") {
    const results = planUpload(await readFileList(req, MAX_UPLOAD)).map(({ content: _content, ...result }) => result);
    return send(res, 200, { results });
  }
  if (pathname === "/api/icons/upload" && method === "POST") {
    return send(res, 200, { results: applyUpload(await readFileList(req, MAX_UPLOAD)) });
  }
  if (pathname === "/api/icons/delete" && method === "POST") {
    return send(res, 200, { results: deleteIcons(await readFileList(req, MAX_DELETE)) });
  }

  const iconMatch = pathname.match(/^\/api\/icons\/([^/]+)$/);
  if (iconMatch) {
    let fileName;
    try {
      fileName = decodeURIComponent(iconMatch[1]);
    } catch {
      throw new UserError("Invalid file name.");
    }
    if (method === "GET") {
      // The UI adds ?v=<version>, which changes whenever the file changes, so
      // the browser can keep previews cached and only reloads replaced icons.
      const cache = url.searchParams.has("v") ? "private, max-age=31536000, immutable" : "no-store";
      return send(res, 200, readIcon(fileName), "image/svg+xml", cache);
    }
    if (method === "PUT") return send(res, 200, replaceIcon(fileName, (await readJsonBody(req)).svg));
    if (method === "PATCH") return send(res, 200, renameIcon(fileName, (await readJsonBody(req)).name));
  }

  if (pathname === "/api/build" && method === "POST") {
    // Always 200: a failed build is a normal result; `ok` and `log` describe it.
    return send(res, 200, await build());
  }

  throw new UserError("Not found.", 404);
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
  let changesIcons = false;
  try {
    if (!isAllowedHost(req.headers.host)) throw new UserError("Forbidden host.", 403);
    const url = new URL(req.url, `http://${req.headers.host}`);
    changesIcons = req.method !== "GET" && url.pathname.startsWith("/api/icons");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else if (req.method === "GET") {
      serveStatic(res, url.pathname);
    } else {
      throw new UserError("Method not allowed.", 405);
    }
  } catch (error) {
    const status = error instanceof UserError ? error.status : 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) send(res, status, { error: error.message });
  } finally {
    if (changesIcons) syncIconsFile();
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

// Files may have been added or removed by hand while the server was stopped.
syncIconsFile();

server.listen(PORT, HOST, () => {
  console.log(`HELIO custom icons UI running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop.");
});
