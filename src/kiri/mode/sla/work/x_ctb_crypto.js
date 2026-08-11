/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

const UVTOOLS_KEY = "UVtools";
const SECRET_KEY = "hQ36XB6yTk+zO02ysyiowt8yC1buK+nbLWyfY40EXoU=";
const SECRET_IV = "Wld+ampndVJecmVjYH5cWQ==";
const BLOCK_SIZE = 16;
const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
const RCON = new Uint8Array(15);

initTables();

export const CTB_ENCRYPTED_MAGIC = 0x12fd0107;
export const CTB_ENCRYPTED_VERSION = 5;
export const CTB_LAYER_XOR_KEY = 0xefbeadde;
export const CTB_ENCRYPTED_HEADER_SIZE = 48;
export const CTB_ENCRYPTED_SETTINGS_SIZE = 288;
export const CTB_ENCRYPTED_LAYER_POINTER_SIZE = 16;
export const CTB_ENCRYPTED_LAYER_DEF_SIZE = 88;
export const CTB_ENCRYPTED_MIN_RLE_AES_LENGTH = 512;
export const CTB_PER_LAYER_SETTINGS_ALLOW = 0x40;
export const CTB_PER_LAYER_SETTINGS_DISALLOW = 0x00;

export const CTB_ENCRYPTED_KEY = xorCipher(base64Bytes(SECRET_KEY), UVTOOLS_KEY);
export const CTB_ENCRYPTED_IV = xorCipher(base64Bytes(SECRET_IV), UVTOOLS_KEY);

export function ctbLayerCrypt(seed, layerIndex, input) {
    let output = new Uint8Array(input);
    ctbLayerCryptInPlace(seed, layerIndex, output);
    return output;
}

export function ctbLayerCryptInPlace(seed, layerIndex, input) {
    if (!seed) return input;

    let init = (Math.imul(seed >>> 0, 0x2d83cdac) + 0xd8a83423) >>> 0;
    let keySeed = (Math.imul(layerIndex >>> 0, 0x1e1530cd) + 0xec3d47cd) >>> 0;
    let key = Math.imul(keySeed, init) >>> 0;
    let index = 0;

    for (let i=0; i<input.length; i++) {
        input[i] ^= (key >>> (8 * index)) & 0xff;
        index++;
        if ((index & 3) === 0) {
            key = (key + init) >>> 0;
            index = 0;
        }
    }

    return input;
}

export function ctbEncrypt(data) {
    return aesCbcCrypt(data, true, CTB_ENCRYPTED_KEY, CTB_ENCRYPTED_IV);
}

export function ctbDecrypt(data) {
    return aesCbcCrypt(data, false, CTB_ENCRYPTED_KEY, CTB_ENCRYPTED_IV);
}

export async function ctbSignature(checksumValue = 0xcafebabe) {
    let bytes = new Uint8Array(8);
    let view = new DataView(bytes.buffer);
    view.setUint32(0, checksumValue >>> 0, true);
    view.setUint32(4, Math.floor(checksumValue / 0x100000000), true);
    return ctbEncrypt(await sha256(bytes));
}

function aesCbcCrypt(data, encrypt, key, iv) {
    if (key.length !== 32) {
        throw new Error(`CTB AES key must be 32 bytes (${key.length})`);
    }
    if (iv.length !== BLOCK_SIZE) {
        throw new Error(`CTB AES IV must be 16 bytes (${iv.length})`);
    }

    let keys = expandKey(key);
    let input = encrypt ? zeroPad(data) : toBytes(data);
    if (input.length % BLOCK_SIZE !== 0) {
        throw new Error(`CTB AES input must align to 16 bytes (${input.length})`);
    }

    let output = new Uint8Array(input.length);
    let previous = new Uint8Array(iv);

    for (let offset=0; offset<input.length; offset += BLOCK_SIZE) {
        let block = input.slice(offset, offset + BLOCK_SIZE);

        if (encrypt) {
            xorBlock(block, previous);
            block = encryptBlock(block, keys);
            previous = block;
            output.set(block, offset);
            continue;
        }

        let current = block;
        block = decryptBlock(block, keys);
        xorBlock(block, previous);
        previous = current;
        output.set(block, offset);
    }

    return output;
}

function encryptBlock(block, keys) {
    let state = new Uint8Array(block);
    let rounds = keys.rounds;

    addRoundKey(state, keys.bytes, 0);
    for (let round=1; round<rounds; round++) {
        subBytes(state);
        shiftRows(state);
        mixColumns(state);
        addRoundKey(state, keys.bytes, round);
    }
    subBytes(state);
    shiftRows(state);
    addRoundKey(state, keys.bytes, rounds);

    return state;
}

function decryptBlock(block, keys) {
    let state = new Uint8Array(block);
    let rounds = keys.rounds;

    addRoundKey(state, keys.bytes, rounds);
    for (let round=rounds - 1; round>0; round--) {
        invShiftRows(state);
        invSubBytes(state);
        addRoundKey(state, keys.bytes, round);
        invMixColumns(state);
    }
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, keys.bytes, 0);

    return state;
}

function expandKey(key) {
    let nk = 8;
    let nb = 4;
    let rounds = 14;
    let bytes = new Uint8Array(nb * (rounds + 1) * 4);
    bytes.set(key);

    let temp = new Uint8Array(4);
    let words = nb * (rounds + 1);
    for (let word=nk; word<words; word++) {
        let prev = (word - 1) * 4;
        temp[0] = bytes[prev];
        temp[1] = bytes[prev + 1];
        temp[2] = bytes[prev + 2];
        temp[3] = bytes[prev + 3];

        if (word % nk === 0) {
            let first = temp[0];
            temp[0] = SBOX[temp[1]] ^ RCON[word / nk];
            temp[1] = SBOX[temp[2]];
            temp[2] = SBOX[temp[3]];
            temp[3] = SBOX[first];
        } else if (word % nk === 4) {
            temp[0] = SBOX[temp[0]];
            temp[1] = SBOX[temp[1]];
            temp[2] = SBOX[temp[2]];
            temp[3] = SBOX[temp[3]];
        }

        let prior = (word - nk) * 4;
        let out = word * 4;
        bytes[out] = bytes[prior] ^ temp[0];
        bytes[out + 1] = bytes[prior + 1] ^ temp[1];
        bytes[out + 2] = bytes[prior + 2] ^ temp[2];
        bytes[out + 3] = bytes[prior + 3] ^ temp[3];
    }

    return { bytes, rounds };
}

function addRoundKey(state, keys, round) {
    let offset = round * BLOCK_SIZE;
    for (let i=0; i<BLOCK_SIZE; i++) {
        state[i] ^= keys[offset + i];
    }
}

function subBytes(state) {
    for (let i=0; i<BLOCK_SIZE; i++) state[i] = SBOX[state[i]];
}

function invSubBytes(state) {
    for (let i=0; i<BLOCK_SIZE; i++) state[i] = INV_SBOX[state[i]];
}

function shiftRows(state) {
    let t = state.slice();
    state[1] = t[5]; state[5] = t[9]; state[9] = t[13]; state[13] = t[1];
    state[2] = t[10]; state[6] = t[14]; state[10] = t[2]; state[14] = t[6];
    state[3] = t[15]; state[7] = t[3]; state[11] = t[7]; state[15] = t[11];
}

function invShiftRows(state) {
    let t = state.slice();
    state[1] = t[13]; state[5] = t[1]; state[9] = t[5]; state[13] = t[9];
    state[2] = t[10]; state[6] = t[14]; state[10] = t[2]; state[14] = t[6];
    state[3] = t[7]; state[7] = t[11]; state[11] = t[15]; state[15] = t[3];
}

function mixColumns(state) {
    for (let c=0; c<BLOCK_SIZE; c += 4) {
        let a0 = state[c];
        let a1 = state[c + 1];
        let a2 = state[c + 2];
        let a3 = state[c + 3];
        let t = a0 ^ a1 ^ a2 ^ a3;
        let u = a0;
        state[c] ^= t ^ xtime(a0 ^ a1);
        state[c + 1] ^= t ^ xtime(a1 ^ a2);
        state[c + 2] ^= t ^ xtime(a2 ^ a3);
        state[c + 3] ^= t ^ xtime(a3 ^ u);
    }
}

function invMixColumns(state) {
    for (let c=0; c<BLOCK_SIZE; c += 4) {
        let a0 = state[c];
        let a1 = state[c + 1];
        let a2 = state[c + 2];
        let a3 = state[c + 3];
        state[c] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
        state[c + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
        state[c + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
        state[c + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
    }
}

function initTables() {
    RCON[1] = 1;
    for (let i=2; i<RCON.length; i++) RCON[i] = xtime(RCON[i - 1]);

    for (let i=0; i<256; i++) {
        let inv = i ? gfPow(i, 254) : 0;
        let s = inv ^ rot(inv, 1) ^ rot(inv, 2) ^ rot(inv, 3) ^ rot(inv, 4) ^ 0x63;
        SBOX[i] = s & 0xff;
        INV_SBOX[SBOX[i]] = i;
    }
}

function xtime(value) {
    return ((value << 1) ^ ((value & 0x80) ? 0x1b : 0)) & 0xff;
}

function mul(a, b) {
    let out = 0;
    while (b) {
        if (b & 1) out ^= a;
        a = xtime(a);
        b >>= 1;
    }
    return out;
}

function gfPow(value, power) {
    let out = 1;
    while (power) {
        if (power & 1) out = mul(out, value);
        value = mul(value, value);
        power >>= 1;
    }
    return out;
}

function rot(value, shift) {
    return ((value << shift) | (value >> (8 - shift))) & 0xff;
}

function zeroPad(data) {
    data = toBytes(data);
    let length = Math.ceil(data.length / BLOCK_SIZE) * BLOCK_SIZE;
    if (length === data.length) return data;

    let output = new Uint8Array(length);
    output.set(data);
    return output;
}

function xorBlock(block, key) {
    for (let i=0; i<BLOCK_SIZE; i++) block[i] ^= key[i];
}

function xorCipher(bytes, key) {
    let output = new Uint8Array(bytes.length);
    for (let i=0; i<bytes.length; i++) {
        output[i] = bytes[i] ^ key.charCodeAt(i % key.length);
    }
    return output;
}

function base64Bytes(text) {
    let binary = atob(text);
    let bytes = new Uint8Array(binary.length);
    for (let i=0; i<binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function toBytes(data) {
    return data instanceof Uint8Array ? data : new Uint8Array(data);
}

async function sha256(bytes) {
    let subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) {
        throw new Error("CTB encrypted signature requires crypto.subtle SHA-256");
    }
    return new Uint8Array(await subtle.digest("SHA-256", bytes));
}
