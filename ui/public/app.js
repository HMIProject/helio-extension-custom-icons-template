const $ = (selector) => document.querySelector(selector);

const RENAME_WARNING =
  "HELIO references icons by their name. If this icon is already used in HELIO projects, " +
  "it will no longer be found there after renaming.";

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
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status ${kind}`.trim();
}

/** Replaces the children of `list` with one <li> per text. */
function fillList(list, texts) {
  const fragment = document.createDocumentFragment();
  for (const text of texts) {
    const li = document.createElement("li");
    li.textContent = text;
    fragment.append(li);
  }
  list.replaceChildren(fragment);
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Opens a <dialog method="dialog">; resolves to true if it was closed with the "confirm" button. */
function openDialog(dialog) {
  dialog.returnValue = "cancel";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
  });
}

// ---------------------------------------------------------------------------
// Company

/** Last saved state, used to detect namespace changes. */
let savedCompany = null;

function renderCompany(info) {
  savedCompany = info;
  $("#company-domain").value = info.companyDomain;
  $("#display-name").value = info.displayName;
  $("#display-name").placeholder = info.companyName ?? "";
  $("#preview-category").textContent = info.companyName ?? "–";
  $("#preview-namespace").textContent = info.namespace ?? "–";
  $("#preview-output").textContent = info.outputFile ?? "–";
  // E.g. an invalid domain or a config from an earlier version.
  if (info.problem) setStatus($("#company-status"), info.problem, "error");
}

async function loadCompany() {
  renderCompany(await api("GET", "/api/company"));
}

/** Shows the confirmation dialog; resolves to true if the user confirms. */
function confirmNamespaceChange(preview) {
  const dialog = $("#company-dialog");
  $("#dialog-old-name").textContent = savedCompany.companyDomain;
  $("#dialog-new-name").textContent = preview.companyDomain;
  $("#dialog-old-namespace").textContent = savedCompany.namespace;
  $("#dialog-new-namespace").textContent = preview.namespace;
  $("#dialog-new-output").textContent = preview.outputFile;
  return openDialog(dialog);
}

$("#company-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#company-status");
  const company = {
    companyDomain: $("#company-domain").value,
    displayName: $("#display-name").value,
  };
  try {
    const preview = await api("POST", "/api/company/preview", company);
    // Only warn when a valid namespace already exists and would change.
    if (savedCompany?.namespace && preview.namespace !== savedCompany.namespace) {
      if (!(await confirmNamespaceChange(preview))) {
        setStatus(status, "Not saved. The company domain was not changed.");
        return;
      }
    }
    renderCompany(await api("PUT", "/api/company", company));
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

/** Number of cards rendered at once; more are added with "Show more". */
const PAGE_SIZE = 240;
/** Upload batches stay below the server limits (MAX_UPLOAD in ui/server.mjs: 500 files, 32 MB). */
const BATCH_MAX_FILES = 400;
const BATCH_MAX_BYTES = 4 * 1024 * 1024;

/** fileName -> "new" | "updated" for the most recent upload or replace. */
let lastChanges = new Map();
let visibleCount = PAGE_SIZE;
let uploadRunning = false;

/**
 * Selected file names. Kept independent of the rendered cards, so "select all"
 * also covers icons behind "Show more" and the selection survives searching.
 */
const selection = new Set();
/** Icons matching the current search/filter, in display order. */
let currentMatches = [];
/** Index in currentMatches of the last clicked checkbox, for shift-click ranges. */
let lastSelectedIndex = null;

const grid = $("#icon-grid");

function baseName(fileName) {
  return fileName.replace(/\.svg$/i, "");
}

function iconUrl(icon) {
  // `version` changes with the file, so unchanged previews come from the browser cache.
  return `/api/icons/${encodeURIComponent(icon.fileName)}?v=${encodeURIComponent(icon.version)}`;
}

function filteredIcons() {
  const query = $("#icon-search").value.trim().toLowerCase();
  const filter = $("#icon-filter").value;
  return icons.filter((icon) => {
    if (filter === "changed" && !lastChanges.has(icon.fileName)) return false;
    if (filter === "fixed" && icon.usesCurrentColor) return false;
    return !query || icon.fileName.toLowerCase().includes(query) || icon.iconName.toLowerCase().includes(query);
  });
}

function createCard(icon) {
  const card = $("#icon-template").content.firstElementChild.cloneNode(true);
  card.dataset.file = icon.fileName;
  card.querySelector("img").src = iconUrl(icon);
  card.querySelector(".icon-name").value = baseName(icon.fileName);
  card.querySelector(".helio-name").textContent = `In HELIO: ${icon.iconName}`;
  card.querySelector(".fixed-badge").hidden = icon.usesCurrentColor;
  const checkbox = card.querySelector(".select-icon");
  checkbox.checked = selection.has(icon.fileName);
  checkbox.setAttribute("aria-label", `Select ${baseName(icon.fileName)}`);
  card.classList.toggle("selected", checkbox.checked);
  const change = lastChanges.get(icon.fileName);
  const changeBadge = card.querySelector(".change-badge");
  changeBadge.hidden = !change;
  if (change) {
    changeBadge.textContent = change;
    changeBadge.classList.add(change === "new" ? "badge-new" : "badge-updated");
  }
  return card;
}

/**
 * Renders the cards for the current search and filter. With `append`, only the
 * cards added by "Show more" are created; the existing ones stay as they are.
 */
function renderIcons({ append = false } = {}) {
  if (!append) {
    currentMatches = filteredIcons();
    // Indices shift with a new list, so a shift-click range would be wrong.
    lastSelectedIndex = null;
  }
  const matches = currentMatches;
  const from = append ? grid.children.length : 0;
  const fragment = document.createDocumentFragment();
  for (const icon of matches.slice(from, visibleCount)) fragment.append(createCard(icon));
  if (append) grid.append(fragment);
  else grid.replaceChildren(fragment);

  const shown = Math.min(visibleCount, matches.length);
  const filtered = matches.length !== icons.length;
  $("#icon-count").textContent = filtered ? `(${matches.length} of ${icons.length})` : `(${icons.length})`;
  $("#icons-empty").hidden = icons.length > 0;
  $("#icons-no-match").hidden = icons.length === 0 || matches.length > 0;
  $("#show-more-wrapper").hidden = shown >= matches.length;
  $("#show-more-info").textContent = `Showing ${shown} of ${matches.length}`;
  $("#show-more").textContent = `Show ${Math.min(PAGE_SIZE, matches.length - shown)} more`;
  $("#build-button").disabled = icons.length === 0;
  updateSelectionBar();
}

async function loadIcons() {
  icons = await api("GET", "/api/icons");
  // Forget changes and selections for icons that no longer exist.
  const existing = new Set(icons.map((icon) => icon.fileName));
  for (const fileName of lastChanges.keys()) if (!existing.has(fileName)) lastChanges.delete(fileName);
  for (const fileName of selection) if (!existing.has(fileName)) selection.delete(fileName);
  renderIcons();
}

// --- Selection --------------------------------------------------------------

function updateSelectionBar() {
  const selectedMatches = currentMatches.filter((icon) => selection.has(icon.fileName)).length;
  const hidden = selection.size - selectedMatches;
  const filtered = currentMatches.length !== icons.length;

  $("#selection-bar").hidden = icons.length === 0;
  const selectAll = $("#select-all");
  selectAll.disabled = currentMatches.length === 0;
  selectAll.checked = currentMatches.length > 0 && selectedMatches === currentMatches.length;
  selectAll.indeterminate = selectedMatches > 0 && selectedMatches < currentMatches.length;
  $("#select-all-label").textContent = filtered
    ? `Select all ${currentMatches.length} matching`
    : `Select all ${currentMatches.length}`;

  $("#selection-info").textContent = selection.size
    ? `${selection.size} selected${hidden ? ` (${hidden} not shown by the current search or filter)` : ""}`
    : "";
  $("#clear-selection").hidden = selection.size === 0;
  const deleteButton = $("#delete-selected");
  deleteButton.disabled = selection.size === 0;
  deleteButton.textContent = selection.size ? `Delete ${plural(selection.size, "icon")}` : "Delete selected";
}

/** Updates checkboxes of the rendered cards without rebuilding them. */
function syncCardSelection() {
  for (const card of grid.children) {
    const selected = selection.has(card.dataset.file);
    card.classList.toggle("selected", selected);
    card.querySelector(".select-icon").checked = selected;
  }
  updateSelectionBar();
}

function setSelected(fileNames, selected) {
  for (const fileName of fileNames) {
    if (selected) selection.add(fileName);
    else selection.delete(fileName);
  }
  syncCardSelection();
}

function clearSelection() {
  selection.clear();
  lastSelectedIndex = null;
  syncCardSelection();
}

$("#select-all").addEventListener("change", (event) => {
  setSelected(
    currentMatches.map((icon) => icon.fileName),
    event.target.checked,
  );
});
$("#clear-selection").addEventListener("click", clearSelection);
document.addEventListener("keydown", (event) => {
  const typing = event.target.closest?.("input:not([type=checkbox]), select, textarea");
  if (event.key === "Escape" && selection.size && !typing && !document.querySelector("dialog[open]")) clearSelection();
});

/** Asks for confirmation, then deletes the icons (used for one card and for the selection). */
async function deleteFiles(fileNames) {
  if (fileNames.length === 0) return;
  const sorted = [...fileNames].sort(naturalOrder.compare);
  const count = plural(sorted.length, "icon");
  $("#delete-dialog-title").textContent = sorted.length === 1 ? `Delete “${baseName(sorted[0])}”?` : `Delete ${count}?`;
  $("#delete-list-summary").textContent = `${count} will be deleted`;
  fillList($("#delete-list"), sorted.map(baseName));
  $("#delete-confirm").textContent = `Delete ${count}`;
  if (!(await openDialog($("#delete-dialog")))) return;

  const status = $("#icons-status");
  setStatus(status, `Deleting ${count} …`);
  try {
    const { results } = await api("POST", "/api/icons/delete", { files: sorted });
    const deleted = results.filter((result) => result.deleted);
    const failed = results.filter((result) => !result.deleted);
    // loadIcons drops deleted icons from the selection.
    await loadIcons();
    const errors = failed.map((result) => `${result.fileName}: ${result.error}`);
    setStatus(
      status,
      `Deleted ${plural(deleted.length, "icon")}.${errors.length ? ` Not deleted: ${errors.join(" · ")}` : ""}`,
      errors.length ? "error" : "success",
    );
  } catch (error) {
    setStatus(status, error.message, "error");
    await loadIcons().catch(() => {});
  }
}

$("#delete-selected").addEventListener("click", () => deleteFiles([...selection]));

function findIcon(fileName) {
  return icons.find((icon) => icon.fileName === fileName);
}

// Search and filter start again at the first page.
function showFirstPage() {
  visibleCount = PAGE_SIZE;
  renderIcons();
}
let searchTimer;
$("#icon-search").addEventListener("input", () => {
  // Rendering is cheap, but debounce typing anyway.
  clearTimeout(searchTimer);
  searchTimer = setTimeout(showFirstPage, 120);
});
$("#icon-filter").addEventListener("change", showFirstPage);
$("#show-more").addEventListener("click", () => {
  visibleCount += PAGE_SIZE;
  renderIcons({ append: true });
});

// --- Card actions (one set of listeners for all cards) ---------------------

async function renameFromInput(input) {
  const fileName = input.closest(".icon-card").dataset.file;
  const oldName = baseName(fileName);
  const newName = input.value.trim();
  if (!newName || newName === oldName) {
    input.value = oldName;
    return;
  }
  if (!confirm(`Rename “${oldName}” to “${newName}”?\n\n${RENAME_WARNING}`)) {
    input.value = oldName;
    return;
  }
  try {
    const entry = await api("PATCH", `/api/icons/${encodeURIComponent(fileName)}`, { name: newName });
    if (lastChanges.has(fileName)) {
      lastChanges.set(entry.fileName, lastChanges.get(fileName));
      lastChanges.delete(fileName);
    }
    setStatus($("#icons-status"), `Renamed to “${newName}”.`, "success");
    await loadIcons();
  } catch (error) {
    input.value = oldName;
    setStatus($("#icons-status"), error.message, "error");
  }
}

grid.addEventListener("submit", (event) => {
  event.preventDefault();
  event.target.querySelector(".icon-name")?.blur();
});
grid.addEventListener("focusout", (event) => {
  if (event.target.matches(".icon-name")) renameFromInput(event.target);
});
grid.addEventListener("keydown", (event) => {
  if (event.target.matches(".icon-name") && event.key === "Escape") {
    event.target.value = baseName(event.target.closest(".icon-card").dataset.file);
    event.target.blur();
  }
});

let replaceTarget = null;

grid.addEventListener("click", async (event) => {
  const card = event.target.closest(".icon-card");
  if (!card) return;
  const fileName = card.dataset.file;

  if (event.target.matches(".select-icon")) {
    // The browser already toggled the checkbox; its new state applies to the whole range.
    const index = currentMatches.findIndex((icon) => icon.fileName === fileName);
    const range =
      event.shiftKey && lastSelectedIndex !== null
        ? currentMatches.slice(Math.min(lastSelectedIndex, index), Math.max(lastSelectedIndex, index) + 1)
        : [currentMatches[index]];
    setSelected(
      range.map((icon) => icon.fileName),
      event.target.checked,
    );
    lastSelectedIndex = index;
    return;
  }

  if (event.target.closest(".replace")) {
    replaceTarget = fileName;
    $("#replace-input").click();
    return;
  }

  if (event.target.closest(".delete")) deleteFiles([fileName]);
});

$("#replace-input").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  const fileName = replaceTarget;
  replaceTarget = null;
  if (!file || !fileName || !findIcon(fileName)) return;
  const status = $("#icons-status");
  try {
    const result = await api("PUT", `/api/icons/${encodeURIComponent(fileName)}`, { svg: await file.text() });
    if (result.changed) lastChanges.set(fileName, "updated");
    await loadIcons();
    if (result.changed) {
      setStatus(status, `Replaced “${baseName(fileName)}” with ${file.name}.`, "success");
    } else {
      setStatus(status, `“${baseName(fileName)}” is unchanged: ${file.name} has the same content.`);
    }
  } catch (error) {
    setStatus(status, `${file.name}: ${error.message}`, "error");
  }
});

// --- Upload: collect files -> plan -> review -> apply ----------------------

function isSvgFile(file) {
  return /\.svg$/i.test(file.name) || file.type === "image/svg+xml";
}

/** Reads all files from a dropped folder (and its subfolders). */
async function filesFromEntry(entry) {
  if (entry.isFile) {
    return new Promise((resolve) => entry.file((file) => resolve([file]), () => resolve([])));
  }
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const entries = [];
  // readEntries returns results in chunks; call it until it returns nothing.
  for (;;) {
    const chunk = await new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (chunk.length === 0) break;
    entries.push(...chunk);
  }
  const nested = await Promise.all(entries.map(filesFromEntry));
  return nested.flat();
}

async function filesFromDrop(dataTransfer) {
  const entries = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);
  if (entries.length === 0) return [...dataTransfer.files];
  return (await Promise.all(entries.map(filesFromEntry))).flat();
}

/** Splits files into request-sized batches. */
function toBatches(files) {
  const batches = [];
  let current = [];
  let bytes = 0;
  for (const file of files) {
    const size = file.svg.length * 1.2;
    if (current.length && (current.length >= BATCH_MAX_FILES || bytes + size > BATCH_MAX_BYTES)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function postInBatches(url, files, onProgress) {
  const results = [];
  for (const batch of toBatches(files)) {
    const response = await api("POST", url, { files: batch });
    results.push(...response.results);
    onProgress?.(results.length, files.length);
  }
  return results;
}

function groupResults(results) {
  const groups = { add: [], replace: [], unchanged: [], error: [] };
  for (const result of results) groups[result.action].push(result);
  return groups;
}

/** Upload result types in display order, with their labels in the review dialog. */
const UPLOAD_ACTIONS = [
  { action: "replace", group: "Replace", chip: (count) => `${count} to replace` },
  { action: "add", group: "New", chip: (count) => `${count} new` },
  { action: "error", group: "Errors (skipped)", chip: (count) => plural(count, "error") },
  { action: "unchanged", group: "Unchanged (skipped)", chip: (count) => `${count} unchanged`, collapsed: true },
];

function describeResult(result) {
  if (result.action === "error") return `${result.source}: ${result.error}`;
  const target = baseName(result.fileName);
  // Show the mapping when the uploaded file name differs from the icon file.
  return result.source.toLowerCase() === result.fileName.toLowerCase() ? target : `${target}  ←  ${result.source}`;
}

/** Shows the review dialog; resolves to true if the user confirms. */
function reviewUpload(groups) {
  const dialog = $("#upload-dialog");
  const toSave = groups.add.length + groups.replace.length;

  $("#upload-summary").textContent =
    toSave > 0
      ? `${plural(toSave, "icon")} will be saved. Please check the changes:`
      : "Nothing to save. None of the files would change an icon.";

  const chips = document.createDocumentFragment();
  const sections = document.createDocumentFragment();
  for (const { action, group, chip, collapsed } of UPLOAD_ACTIONS) {
    const items = groups[action];
    if (items.length === 0) continue;

    const chipItem = document.createElement("li");
    chipItem.className = `chip chip-${action}`;
    chipItem.textContent = chip(items.length);
    chips.append(chipItem);

    const details = document.createElement("details");
    details.className = `list-group group-${action}`;
    details.open = !collapsed;
    const summary = document.createElement("summary");
    summary.textContent = `${group} (${items.length})`;
    const list = document.createElement("ul");
    const sorted = [...items].sort((a, b) => naturalOrder.compare(a.fileName ?? a.source, b.fileName ?? b.source));
    fillList(list, sorted.map(describeResult));
    details.append(summary, list);
    sections.append(details);
  }
  $("#upload-chips").replaceChildren(chips);
  $("#upload-groups").replaceChildren(sections);

  $("#upload-replace-note").hidden = groups.replace.length === 0;
  const confirmButton = $("#upload-confirm");
  confirmButton.hidden = toSave === 0;
  confirmButton.textContent = groups.replace.length
    ? `Save ${plural(toSave, "icon")} (${groups.replace.length} replaced)`
    : `Add ${plural(toSave, "icon")}`;
  dialog.querySelector('button[value="cancel"]').textContent = toSave === 0 ? "Close" : "Cancel";
  return openDialog(dialog);
}

function setUploadBusy(busy) {
  uploadRunning = busy;
  document.querySelectorAll(".upload-input").forEach((input) => (input.disabled = busy));
  document.querySelectorAll(".upload-button").forEach((label) => label.classList.toggle("disabled", busy));
  $("#drop-zone").classList.toggle("disabled", busy);
}

async function uploadFiles(fileList) {
  const status = $("#icons-status");
  if (uploadRunning) {
    setStatus(status, "An upload is already running.", "error");
    return;
  }
  const svgFiles = [...fileList].filter(isSvgFile);
  if (svgFiles.length === 0) {
    setStatus(status, "No SVG files found. Please choose .svg files or a folder that contains them.", "error");
    return;
  }

  setUploadBusy(true);
  try {
    setStatus(status, `Reading ${plural(svgFiles.length, "file")} …`);
    const files = await Promise.all(svgFiles.map(async (file) => ({ name: file.name, svg: await file.text() })));

    setStatus(status, `Checking ${plural(files.length, "file")} …`);
    const plan = await postInBatches("/api/icons/plan", files, (done, total) =>
      setStatus(status, `Checking ${done} of ${total} …`),
    );
    const groups = groupResults(plan);
    const toSave = groups.add.length + groups.replace.length;

    // Only new icons and no problems: nothing to review, just add them.
    const needsReview = groups.replace.length > 0 || groups.error.length > 0 || toSave === 0;
    // With nothing to save the dialog only offers "Close", so it never confirms.
    if (needsReview && !(await reviewUpload(groups))) {
      setStatus(status, toSave === 0 ? "Nothing changed." : "Upload cancelled. Nothing was changed.");
      return;
    }

    // Send only the files that change something.
    const changing = new Set([...groups.add, ...groups.replace].map((result) => result.source));
    const results = await postInBatches(
      "/api/icons/upload",
      files.filter((file) => changing.has(file.name)),
      (done, total) => setStatus(status, `Saving ${done} of ${total} …`),
    );
    const done = groupResults(results);

    lastChanges = new Map([
      ...done.add.map((result) => [result.fileName, "new"]),
      ...done.replace.map((result) => [result.fileName, "updated"]),
    ]);
    await loadIcons();

    const parts = [];
    if (done.add.length) parts.push(`${done.add.length} added`);
    if (done.replace.length) parts.push(`${done.replace.length} replaced`);
    if (groups.unchanged.length) parts.push(`${groups.unchanged.length} unchanged`);
    const failed = groups.error.length + done.error.length + done.unchanged.length;
    if (failed) parts.push(`${failed} skipped`);
    const errors = done.error.map(describeResult);
    setStatus(
      status,
      `${parts.join(", ")}.${errors.length ? ` ${errors.join(" · ")}` : ""}${
        lastChanges.size ? " Choose “Changed in last upload” to review them." : ""
      }`,
      errors.length ? "error" : "success",
    );
  } catch (error) {
    setStatus(status, error.message, "error");
    await loadIcons().catch(() => {});
  } finally {
    setUploadBusy(false);
  }
}

for (const id of ["#file-input", "#folder-input"]) {
  $(id).addEventListener("change", async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    await uploadFiles(files);
  });
}

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
dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  // Read the entries synchronously; dataTransfer is cleared after this handler.
  const pending = filesFromDrop(event.dataTransfer);
  uploadFiles(await pending);
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
