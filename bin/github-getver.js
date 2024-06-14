// create version for release for github build workflow

const fs = require('fs');
const type = process.argv[2];

if (type && process.env.GITHUB_ENV) {
    const pkgVer = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
    const rando = ((Math.random() * 0xfff) & 0xfff).toString().padStart(4,0);
    const releaseTag =
        type === 'workflow_dispatch' ? `${pkgVer}.${rando}` :
        type === 'push' ? pkgVer :
        (`rogue-` + ( (Math.random() * 0xfffff) & 0xfffff ))

    console.log({ type, version: pkgVer, releaseTag });

    // write version to GITHUB_ENV file
    fs.appendFileSync(process.env.GITHUB_ENV, `TAG_NAME=${releaseTag}\n`);
}
