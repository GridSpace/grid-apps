/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Global language/translation system.
 * Stores language maps and tracks the current language selection.
 */
const LANG = self.lang = { current: {} };

/** Default language code */
const KDFL = 'en-us';

/** Currently selected language code from browser */
let lset = navigator.language.toLocaleLowerCase();

/**
 * Map language codes to supported language identifiers.
 * Normalizes short codes (en, fr, de) to full language codes (en-us, fr-fr, de-de).
 * @param {string} key - Language code (e.g., 'en', 'fr', 'de-de')
 * @returns {string} Normalized language code or default 'en-us'
 */
LANG.map = function(key) {
    if (!key) {
        return KDFL;
    }
    let tok = key.split('-');
    switch (tok[0]) {
        case 'da': return 'da-dk';
        case 'de': return 'de-de';
        case 'en': return 'en-us';
        case 'es': return 'es-es';
        case 'fr': return 'fr-fr';
        case 'pl': return 'pl-pl';
        case 'pt': return 'pt-pt';
        case 'zh': return 'zh';
    }
    return KDFL;
};

/**
 * Get current browser language setting.
 * @returns {string} Browser language code
 */
LANG.get = function() {
    return lset;
};

/**
 * Set language by trying a list of language codes in order.
 * Falls back to browser language, then English if no arguments provided.
 * Populates LANG.current with translations, filling missing keys from English.
 * @param {...string} keys - Language codes to try in order
 * @returns {string|undefined} Selected language code or undefined if none found
 */
LANG.set = function() {
    let map, key, keys = [...arguments];
    // provide default if none given
    if (keys.length === 0) {
        keys = [lset, lset.split('-')[0], 'en'];
    }
    for (let i=0; i<keys.length; i++)
    {
        key = keys[i]
        if (!(map = LANG[key])) {
            continue;
        }
        lset = key;
        let missing = [];
        let invalid = [];
        // default to EN values when missing
        Object.keys(LANG.en).forEach(key => {
            if (!map[key]) {
                map[key] = LANG.en[key];
                missing.push(key);
            }
        });
        // update current map from chosen map
        Object.keys(map).forEach(key => {
            if (LANG.en[key]) {
                let val = map[key];
                // turn arrays into newline separated strings
                if (Array.isArray(val)) {
                    val = val.join('\n');
                }
                LANG.current[key] = val;
            } else {
                invalid.push(key);
            }
        });
        if (missing.length) {
            console.log(`language map "${key}" missing keys [${missing.length}]: ${missing.join(', ')}`);
        }
        if (invalid.length) {
            console.log(`language map "${key}" invalid keys [${invalid.length}]: ${invalid.join(', ')}`);
        }
        return key;
    }
    return undefined;
}

export default { LANG };

export { LANG };
