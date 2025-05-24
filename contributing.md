
# Contributing

This is a community driven project, and we welcome any contributions you'd like to make. You can connect with us on [discord](https://discord.gg/suyCCgr).


## Running Locally

- Ensure you have [node](https://nodejs.org/en/download/), or an equivalent installed
- Clone the [repository](https://github.com/GridSpace/grid-apps)
- Run `npm run setup`
- Run `npm run dev`

## Running Docs Locally

- Ensure you have [node](https://nodejs.org/en/download/), or an equivalent installed
- Clone the [repository](https://github.com/GridSpace/grid-apps)
- Run `npm run setup`
- Run `npm run docs-dev`


## How to add a new machine

- Make sure you have your tested machine selected
- Open the developer console
- Run the following code: `kiri.api.conf.get().device`
- Right click on the object and select `Copy object`
- Make a new file in the `src/kiri-dev/<mode>` directory, with the name of your machine, no spaces or special characters, and a `.json` extension.
- Paste the copied object into the new file, and save it.
- Publish your changes to a git repo
- Submit a [pull request](https://github.com/GridSpace/grid-apps/compare)