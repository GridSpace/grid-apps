# Mesh:Tool Development Server

This is the development server setup for Mesh:Tool, a browser-based 3D mesh editor.

## Running the Development Server

1. Make sure you have Node.js installed
2. Install serve globally (optional):
   ```bash
   npm install -g serve
   ```
3. Run the development server:
   ```bash
   npx serve -l 5432
   ```
4. Open your browser to http://localhost:5432/mesh

## Development Notes

- The server is configured to handle symlinks and path mappings through `serve.json`
- CORS headers are set to allow WebAssembly modules to load properly
- Static assets are served from the `lib` directory
- Source code is served from the `src2` directory
- Fonts are served from `/font` and `/fon2` directories

## Troubleshooting

If you encounter CORS or WebAssembly loading issues:
1. Make sure you're using a modern browser that supports SharedArrayBuffer
2. Check that the CORS headers are being applied correctly
3. Verify that all paths in index.html are correct for your setup 