---
description: Kiri:Moto supports localization through a single easy-to-extend dictionary
---

# Localization

If you are interested in adding a new language to Kiri:Moto's interface, follow the directions on this page to setup a local dev environment:

[https://github.com/GridSpace/grid-apps](https://github.com/GridSpace/grid-apps)

Then create a copy of the [`web/kiri/lang/en.js`](https://github.com/GridSpace/grid-apps/blob/master/web/kiri/lang/en.js) file with the new file using either a two-letter or compound language-country code (like `en-us.js`) and put it in the same `lang` directory.

Replace all values with correct localized values and submit a [pull request](https://github.com/GridSpace/grid-apps/pulls) to have it included in the official Kiri:Moto code-base.

If you have the time, please consider also localizing `web/kiri/lang/en-help.html`

Test your language by appending `?ln:XX` to your local URL where `XX` is the name of your language file _without_ the `.js` extension.

