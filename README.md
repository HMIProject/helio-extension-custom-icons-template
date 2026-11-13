# Setup
1. Install dependencies with npm:
   ```bash
   npm install
   ```
2. Set your company name (only needed once):
   ```bash
   npm run setup
   ```
   This asks for the company name and stores it in `company.config.json`
   (you can also pass it directly: `npm run setup -- "My Company"`, or edit the file by hand).
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
- upload new SVG icons (file picker or drag & drop), rename and delete them,
- set the company name and namespace domain,
- build the extension. The result is written to the `lib` folder.

The interface only runs on your own computer (it listens on `127.0.0.1`) and works directly on the files in this repository:
icons are stored in `src/svg`, the company settings in `company.config.json`. Commit these changes like any other change.

Note: HELIO references icons by their name. Renaming or deleting an icon that is already used in a HELIO project breaks that reference.
