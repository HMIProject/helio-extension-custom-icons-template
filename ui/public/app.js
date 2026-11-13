const $ = (selector) => document.querySelector(selector);

const RENAME_WARNING =
  "HELIO references icons by their name. If this icon is already used in HELIO projects, " +
  "it will no longer be found there after renaming.";
const DELETE_WARNING =
  "If this icon is already used in HELIO projects, it will be missing there the next time the extension is loaded.";

let icons = [];

// ---------------------------------------------------------------------------
// API

async function api(method, url, body) {
  const options = { method, headers: {} };
  if (method !== "GET") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body ?? {});
  }
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !("ok" in data)) {
    throw new Error(data.error || `Error ${response.status}`);
  }
  return data;
}

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status ${kind}`.trim();
}

// ---------------------------------------------------------------------------
// Company

function renderCompany(info) {
  $("#company-name").value = info.companyName;
  $("#namespace-domain").value = info.namespaceDomain;
  $("#preview-category").textContent = info.companyName || "–";
  $("#preview-namespace").textContent = info.namespace;
  $("#preview-output").textContent = info.outputFile ?? "–";
}

async function loadCompany() {
  renderCompany(await api("GET", "/api/company"));
}

$("#company-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#company-status");
  try {
    const info = await api("PUT", "/api/company", {
      companyName: $("#company-name").value,
      namespaceDomain: $("#namespace-domain").value,
    });
    renderCompany(info);
    setStatus(status, "Saved.", "success");
  } catch (error) {
    setStatus(status, error.message, "error");
  }
});

$("#company-form").addEventListener("input", () => {
  setStatus($("#company-status"), "Not saved yet.");
});

// ---------------------------------------------------------------------------
// Icons

function baseName(fileName) {
  return fileName.replace(/\.svg$/i, "");
}

function renderIcons() {
  const grid = $("#icon-grid");
  const template = $("#icon-template");
  grid.replaceChildren();

  for (const icon of icons) {
    const card = template.content.firstElementChild.cloneNode(true);
    const img = card.querySelector("img");
    img.src = `/api/icons/${encodeURIComponent(icon.fileName)}?v=${Date.now()}`;

    const input = card.querySelector(".icon-name");
    input.value = baseName(icon.fileName);
    card.querySelector(".helio-name").textContent = `In HELIO: ${icon.iconName}`;
    card.querySelector(".badge").hidden = icon.usesCurrentColor;

    const rename = async () => {
      const newName = input.value.trim();
      if (!newName || newName === baseName(icon.fileName)) {
        input.value = baseName(icon.fileName);
        return;
      }
      if (!confirm(`Rename “${baseName(icon.fileName)}” to “${newName}”?\n\n${RENAME_WARNING}`)) {
        input.value = baseName(icon.fileName);
        return;
      }
      try {
        await api("PATCH", `/api/icons/${encodeURIComponent(icon.fileName)}`, { name: newName });
        setStatus($("#icons-status"), `Renamed to “${newName}”.`, "success");
        await loadIcons();
      } catch (error) {
        input.value = baseName(icon.fileName);
        setStatus($("#icons-status"), error.message, "error");
      }
    };

    card.querySelector(".rename-form").addEventListener("submit", (event) => {
      event.preventDefault();
      input.blur();
    });
    input.addEventListener("blur", rename);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        input.value = baseName(icon.fileName);
        input.blur();
      }
    });

    card.querySelector(".delete").addEventListener("click", async () => {
      if (!confirm(`Delete icon “${baseName(icon.fileName)}”?\n\n${DELETE_WARNING}`)) return;
      try {
        await api("DELETE", `/api/icons/${encodeURIComponent(icon.fileName)}`);
        setStatus($("#icons-status"), `Deleted “${baseName(icon.fileName)}”.`, "success");
        await loadIcons();
      } catch (error) {
        setStatus($("#icons-status"), error.message, "error");
      }
    });

    grid.append(card);
  }

  $("#icon-count").textContent = `(${icons.length})`;
  $("#icons-empty").hidden = icons.length > 0;
  $("#build-button").disabled = icons.length === 0;
}

async function loadIcons() {
  icons = await api("GET", "/api/icons");
  renderIcons();
}

/** "my icon (1).svg" -> "my icon -1-" : only characters the server accepts. */
function nameFromFile(file) {
  return baseName(file.name).replace(/[^A-Za-z0-9 _-]+/g, "-").replace(/^-+|-+$/g, "") || "icon";
}

async function uploadFiles(fileList) {
  const files = [...fileList].filter((file) => /\.svg$/i.test(file.name) || file.type === "image/svg+xml");
  const status = $("#icons-status");
  if (files.length === 0) {
    setStatus(status, "Please choose SVG files only.", "error");
    return;
  }

  const errors = [];
  let added = 0;
  for (const file of files) {
    try {
      await api("POST", "/api/icons", { name: nameFromFile(file), svg: await file.text() });
      added++;
    } catch (error) {
      errors.push(`${file.name}: ${error.message}`);
    }
  }

  await loadIcons();
  if (errors.length) {
    setStatus(status, `Uploaded ${added} of ${files.length}. ${errors.join(" · ")}`, "error");
  } else {
    setStatus(status, `Uploaded ${added} icon${added === 1 ? "" : "s"}.`, "success");
  }
}

$("#file-input").addEventListener("change", async (event) => {
  await uploadFiles(event.target.files);
  event.target.value = "";
});

const dropZone = $("#drop-zone");
for (const type of ["dragenter", "dragover"]) {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("active");
  });
}
for (const type of ["dragleave", "drop"]) {
  dropZone.addEventListener(type, () => dropZone.classList.remove("active"));
}
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadFiles(event.dataTransfer.files);
});
// Keep files dropped outside the zone from opening in the browser.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

// ---------------------------------------------------------------------------
// Build

$("#build-button").addEventListener("click", async () => {
  const button = $("#build-button");
  const status = $("#build-status");
  const logWrapper = $("#build-log-wrapper");
  button.disabled = true;
  setStatus(status, "Building …");
  try {
    const result = await api("POST", "/api/build");
    $("#build-log").textContent = result.log ?? "";
    logWrapper.hidden = !result.log;
    if (result.ok) {
      setStatus(status, `Done: ${result.outputFile}`, "success");
      logWrapper.open = false;
    } else {
      setStatus(status, "Build failed. See the build log for details.", "error");
      logWrapper.open = true;
    }
  } catch (error) {
    setStatus(status, error.message, "error");
  } finally {
    button.disabled = icons.length === 0;
  }
});

// ---------------------------------------------------------------------------

Promise.all([loadCompany(), loadIcons()]).catch((error) => {
  setStatus($("#icons-status"), `Cannot reach the server: ${error.message}`, "error");
});
