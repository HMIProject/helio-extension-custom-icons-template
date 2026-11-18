# Setup
1. Install dependencies with npm:
   ```bash
   npm install
   ```
2. Set your company domain (only needed once):
   ```bash
   npm run setup
   ```
   This asks for your company's domain, e.g. `hmi-project.com`, and optionally a display name, and stores both in `company.config.json`.
   You can also pass them directly (`npm run setup -- hmi-project.com "HMI Project"`) or edit the file by hand.
   Everything else is derived from the domain:

   | | Example for `hmi-project.com` |
   |---|---|
   | Namespace | `com.hmi-project.custom-icons` |
   | Output file | `lib/helio-extension-icons-hmi-project-<version>.js` |
   | Icon category and extension name in HELIO | the display name, or `hmi-project.com` if none is set |

   The release workflow also reads `company.config.json`, so commit this file.
3. Build the extension:
   ```bash
   npm run build
   ```

## How to generate icons
All you have to do is to add your svg files to the `src/svg` folder and run the command:
```bash
npm run build:icons
```
The command will automatically generate an icon that HELIO can use in its Icon Library. The file name of the svg file will be used as the name of the icon.
(Currently only one size-variant of the icon is used. To generate different icon sizes see the [helio-sdk documentation](https://sdk.v1.docs.helio-hmi.com/functions/createIcon.html))

## Web interface
Instead of using the command line you can manage everything in the browser:
```bash
npm run ui
```
Then open http://localhost:5178 (use `PORT=5179 npm run ui` for a different port). The interface lets you
- upload SVG icons (files, a whole folder, or drag & drop), rename and delete them,
- update icons by simply uploading the changed SVGs again: files with the name of an existing icon replace it
  (matched by icon name, so `lock.svg` replaces `Lock.svg`). Before anything is saved you get an overview of
  which icons are new, replaced, unchanged or invalid. A single icon can also be replaced with “Replace…” on its card,
- search and filter the list, e.g. to review only the icons changed by the last upload,
- select several icons (checkboxes, Shift-click for a range, or “Select all” for everything that matches the
  current search and filter) and delete them in one go,
- set the company domain and display name,
- build the extension. The result is written to the `lib` folder.

The interface only runs on your own computer (it listens on `127.0.0.1`) and works directly on the files in this repository:
icons are stored in `src/svg`, the company settings in `company.config.json`. Commit these changes like any other change.

Note: HELIO references icons by their name. Replacing an icon keeps its name, so HELIO projects that use it show the new version after the next build. Renaming or deleting an icon that is already used in a HELIO project breaks that reference.
