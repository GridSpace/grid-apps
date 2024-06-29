const os = require('os');
const fs = require('fs-extra');
const fetchr = import('node-fetch');
const path = require('path');

async function download(url, filePath) {
    const fetch = (await fetchr).default;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    fs.ensureDir(path.dirname(filePath));
    const fileStream = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('error', error => {
            console.log({ error });
        });
        fileStream.on('finish', () => {
            resolve();
        });
    });
}

async function main() {
    console.log('npm pre running');

    const links = fs.readFileSync("links.csv")
        .toString()
        .trim()
        .split('\n')
        .map(line => line.trim())
        .map(line => line.split(',').map(v => v.trim()));

    if (os.platform() === 'win32')
        // convert links to the contents of the files/directories they reference
        for (let [link, target] of links) {
            const absoluteTarget = path.resolve(path.dirname(link), target);
            try {
                console.log({ win32_replace: link });
                await fs.remove(link).catch(error => console.log({ remove_error: error }));
                await fs.copy(absoluteTarget, link, { dereference: true }).catch(error => console.log({ copy_error: error }));
            } catch (err) {
                console.error(`Error creating symlink: ${link} -> ${absoluteTarget}`, err);
            }
        }
}

main().catch(err => console.error('Error', err));
