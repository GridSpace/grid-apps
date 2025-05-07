const os = require('os')
const fs = require('fs-extra')
const path = require('path')

async function main() {
  console.log('npm pre running')

  const links = fs
    .readFileSync('links.csv')
    .toString()
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.split(',').map((v) => v.trim()))

  if (os.platform() === 'win32')
    // convert links to the contents of the files/directories they reference
    for (let [link, target] of links) {
      const absoluteTarget = path.resolve(path.dirname(link), target)
      try {
        console.log({ win32_replace: link })
        await fs
          .remove(link)
          .catch((error) => console.log({ remove_error: error }))
        await fs
          .copy(absoluteTarget, link, { dereference: true })
          .catch((error) => console.log({ copy_error: error }))
      } catch (err) {
        console.error(
          `Error creating symlink: ${link} -> ${absoluteTarget}`,
          err
        )
      }
    }
}

main().catch((err) => console.error('Error', err))
