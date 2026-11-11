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
