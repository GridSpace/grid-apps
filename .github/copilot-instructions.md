# Grid.Space Applications

Grid.Space Applications is a comprehensive web-based 3D manufacturing toolchain including Kiri:Moto (3D printer/CNC/laser slicer), Mesh:Tool (mesh editing), and Meta (metadata tools). The applications are built with JavaScript, HTML5, and can be packaged as Electron desktop applications.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

Bootstrap, build, and test the repository:
- `npm run setup` -- installs all dependencies. Takes 2 minutes. NEVER CANCEL. Set timeout to 180+ seconds.
- `npm run dev` -- starts development server at http://localhost:8080. Takes 3 seconds.
- `npm run prebuild` -- prepares Electron build assets. Takes 11 seconds.
- `npm run build-nopublish` -- full Electron build. Takes 19 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
- `npm run docs-dev` -- starts documentation server at http://localhost:3000. Takes 13 seconds.

Run the web applications:
- ALWAYS run `npm run setup` first after fresh clone.
- Development server: `npm run dev` 
- Access Kiri:Moto at: http://localhost:8080/kiri/
- Access Mesh:Tool at: http://localhost:8080/mesh/
- Access Meta tools at: http://localhost:8080/meta/

Run the Electron desktop applications:
- `npm run start` -- builds and launches Electron app (Kiri:Moto desktop)
- `npm run start-dev` -- Electron with developer tools enabled
- Build platform-specific: `npm run build-linux`, `npm run build-win`, `npm run build-mac`

## Validation

ALWAYS manually validate any new code by running through complete end-to-end scenarios after making changes:
- Test Kiri:Moto: Load a 3D model file (STL/OBJ), configure printer settings, slice the model, and export G-code
- Test Mesh:Tool: Load a mesh file, perform basic editing operations (select, move, repair), and export the result
- ALWAYS check that both applications load without JavaScript errors in the browser console
- You can build and run the Electron version of the applications locally
- ALWAYS run `npm run docs-check` (prettier formatting) before finishing or the CI (.github/workflows/prettier-check.yml) will fail

## Validation Scenarios

After making code changes, test these critical user workflows:
1. **Kiri:Moto Basic Workflow**: Navigate to http://localhost:8080/kiri/, click the files menu, attempt to load a sample file, verify the 3D viewport displays the model
2. **Mesh:Tool Basic Workflow**: Navigate to http://localhost:8080/mesh/, verify the application loads with the toolbar and 3D viewport visible
3. **Documentation**: Run `npm run docs-dev` and verify http://localhost:3000/ loads the documentation homepage

## Build Timing and Critical Warnings

**NEVER CANCEL ANY BUILD COMMAND**. All timing is based on actual measurements:
- `npm run setup`: 2 minutes typical, up to 5 minutes on slow connections. Set timeout to 300+ seconds.
- `npm run build-nopublish`: 19 seconds typical, up to 2 minutes on slower systems. Set timeout to 180+ seconds.
- `npm run prebuild`: 11 seconds typical. Set timeout to 60+ seconds.
- CI builds in .github/workflows/ can take 5-15 minutes per platform. NEVER CANCEL CI builds.

## Dependencies and Environment

Node.js Requirements:
- Requires Node.js 18+ (specified in package.json engines)
- Run `npm run setup` to install all dependencies including mods/ subdirectory
- The project uses symbolic links (see links.csv) - Windows users need special handling via bin/install-pre.js

Key Dependencies:
- @gridspace/app-server: Main development server
- electron: Desktop application framework  
- three.js: 3D rendering and geometry
- manifold-3d: 3D geometry processing
- docusaurus: Documentation system

## Project Structure

Key directories and their purposes:
- `/src/` - Main source code for all applications
  - `/src/kiri/` - Kiri:Moto slicer application core
  - `/src/mesh/` - Mesh:Tool editing application
  - `/src/main/` - Application entry points and initialization
  - `/src/kiri-mode/` - Mode-specific code (FDM, SLA, CNC, laser, etc.)
  - `/src/kiri-dev/` - Device definitions (printers, machines)
  - `/src/cli/` - Command-line interface tools
- `/web/` - Static web assets (HTML, CSS, fonts, assets)
- `/docs/` - Documentation source (Docusaurus)
- `/bin/` - Build scripts and utilities
- `/mods/` and `/mod/` - Modular extensions and plugins
- `/.github/workflows/` - CI/CD pipeline definitions

## Common Development Tasks

Code formatting and validation:
- `npm run docs-check` - Check documentation formatting (prettier)
- Review .github/workflows/prettier-check.yml for formatting requirements
- The project uses prettier with custom config in prettier.config.js

Building for distribution:
- `npm run build-linux` - Linux AppImage
- `npm run build-win` - Windows executable and installer  
- `npm run build-mac` - macOS DMG and app bundle
- Build artifacts are created in `dist/` directory
- See bin/build-upload and bin/build-upload-all for release automation

Module and dependency management:
- The project uses a custom module system (see src/main/gapp.js)
- Symbolic links defined in links.csv connect external dependencies
- Run `npm run mklinks` to regenerate symbolic link definitions
- Modules in mods/ directory are automatically loaded at startup

## Troubleshooting

Common issues and solutions:
- **Build fails on Windows**: The project uses symbolic links. Run `npm run setup` which handles Windows compatibility via bin/install-pre.js
- **Applications don't load**: Check browser console for JavaScript errors. Ensure `npm run setup` completed successfully.
- **Development server fails to start**: Port 8080 may be in use. Check for existing processes or change port in configuration.
- **Electron build fails**: Ensure all dependencies are installed. Try `npm run clear-cache` to clear build caches.
- **Documentation build fails**: Check prettier formatting with `npm run docs-check` and fix any formatting issues.

## Application-Specific Notes

**Kiri:Moto (3D Slicer)**:
- Supports FDM, SLA, CNC, laser cutting, and wire EDM modes
- Device definitions in src/kiri-dev/ organized by manufacturing mode
- Slicing engines in src/kiri-mode/ directories
- Access via http://localhost:8080/kiri/ in development

**Mesh:Tool (3D Editing)**:
- Browser-based mesh repair and editing
- Supports STL, OBJ, and other common mesh formats  
- Access via http://localhost:8080/mesh/ in development

**Documentation**:
- Built with Docusaurus, served from docs/ directory
- Available at http://localhost:3000/ when running `npm run docs-dev`
- Formatting enforced by prettier (run `npm run docs-check`)

## API and Integration

The applications provide JavaScript APIs for integration:
- Kiri:Moto slicing API: http://localhost:8080/kiri/engine.html
- Frame messaging API: http://localhost:8080/kiri/frame.html
- See readme.md "Javascript Slicing APIs" section for details

Always verify API functionality when making changes to core slicing or rendering code.