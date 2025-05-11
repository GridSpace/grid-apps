const fs = require('fs-extra');

async function removeDirectory(dirPath) {
  try {
    await fs.remove(dirPath);
    console.log('Directory removed successfully!');
  } catch (err) {
    console.error('Error removing directory:', err);
  }
}

async function main() {
  console.log('npm post running');
  await removeDirectory('tmp');
}

main().catch((err) => console.error('Error', err));
