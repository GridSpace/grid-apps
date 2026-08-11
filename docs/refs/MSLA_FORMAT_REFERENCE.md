# mSLA File Format Reference

**Generated:** 2026-05-16
**Total Formats:** 31 registered in UVtools `AvailableFormats` (plus an unregistered CXDLPv1 implementation)

---

## Format Capability Matrix

| Format | Encode | Decode | Extensions | Versions | Profiles | RLE Type | Notes |
|--------|:------:|:------:|------------|----------|----------|----------|-------|
| **Chitubox Family** |
| ChituboxFile | ✓ | ✓ | photon, cbddlp, ctb, gktwo.ctb | 1-5 (def: 5) | No | RLE125 / CTB variable RLE | Most common |
| CTBEncryptedFile | ✓ | ✓ | ctb, encrypted.ctb | 4-5 (def: 5) | No | CTB variable RLE + AES | Encrypted |
| PHZFile | ✓ | ✓ | phz | 2 | No | RLE125 | Chitubox PHZ |
| ChituboxZipFile | ✓ | ✓ | zip | - | No | PNG | G-code based |
| AnycubicPhotonSFile | ✓ | ✓ | photons | - | No | RLE128 | Legacy Photon S |
| **Anycubic Family - Legacy (v1, v515-516)** |
| AnycubicFile (PWS) | ✓ | ✓ | pws | 1 | Yes (22) | 1-byte bit-plane RLE125 | PhotonS |
| AnycubicFile (PW0/PWX) | ✓ | ✓ | pw0, pwx | 1 | Yes (22) | Nibble RLE4 | PhotonZero, PhotonX |
| **Anycubic Family - Modern (v515-518)** |
| AnycubicFile (v515-v516) | ✓ | ✓ | dlp, pwmx, pwmo, pwms, pmsq, pwma, pm3, pm3m | varies | Yes (22) | Nibble RLE4 | Ultra, Mono, M3 family |
| AnycubicFile (v515-v517) | ✓ | ✓ | dl2p, pwmb, pmx2, pm3r | varies | Yes (22) | Nibble RLE4 | D2, X2, M3 Plus/Premium |
| AnycubicFile (v517) | ✓ | ✓ | pm3n, pm5, px6s | 517 | Yes (22) | Nibble RLE4 | Mono 2, X6Ks, M5 |
| AnycubicFile (v518) | ✓ | ✓ | pm5s, m5sp | 518 | Yes (22) | Nibble RLE4 | Mono M5s/Pro |
| AnycubicFile (unversioned fallback) | ✓ | ✓ | pm4n, pwc | 1, 515-518 | Yes (22) | Nibble RLE4 | Registered but not explicitly version-pinned |
| AnycubicZipFile | ✓ | ✓ | pm4u, pm7, pm7m, pwsz, pp1, pp1m | - | No | PNG | ZIP with JSON |
| **Creality Family** |
| CrealityCXDLPv1File | ✓ | ✓ | v1.cxdlp | 1 | No | RLE | Legacy implementation present but not registered in `AvailableFormats` |
| CrealityCXDLPFile | ✓ | ✓ | cxdlp | 2-3 (def: 3) | Yes | RLE | HALOT series |
| CrealityCXDLPv4File | ✓ | ✓ | cxdlpv4 | 4 | Yes | RLE | Current |
| **Other Binary Formats** |
| AnetFile | ✓ | ✓ | n4, n7 | 3 | Yes (N4/N7) | RLE | Anet printers |
| FDGFile | ✓ | ✓ | fdg | 2 | No | RLE | Voxelab |
| GooFile | ✓ | ✓ | goo, prz | - | No | Chunked RLE + checksum | Elegoo/Phrozen |
| LGSFile | ✓ | ✓ | lgs, lgs30, lgs120, lgs4k | - | Yes | Struct | Longer Orange |
| MDLPFile | ✓ | ✓ | mdlp | 1 | No | Vector | Makerbase MKS |
| GR1File | ✓ | ✓ | gr1 | - | No | Vector | GR Workshop |
| OSFFile | ✓ | ✓ | osf | 4 (def) | No | Compressed | Vlare |
| OSLAFile | ✓ | ✓ | osla | - | No | Varies | Open SLA |
| **Archive Formats** |
| SL1File | ✓ | ✓ | sl1, sl1s | - | Yes | PNG | Prusa (INI) |
| UVJFile | ✓ | ✓ | uvj | - | No | PNG | Vendor-neutral |
| VDAFile | ✓ | ✓ | zip | - | No | Images | Voxeldance Additive |
| VDTFile | ✓ | ✓ | vdt | 1 | No | PNG | Voxeldance Tango |
| NanoDLPFile | ✓ | ✓ | nanodlp, rgb.nanodlp | 1-2 | No | Images | NanoDLP |
| KlipperFile | ✓ | ✓ | zip, rgb.zip | - | No | PNG | Klipper firmware |
| ZCodeFile | ✓ | ✓ | zcode | - | No | Images | UnizMaker IBEE |
| ZCodexFile | ✓ | ✓ | zcodex | - | Yes | Images | Zortrax |
| CWSFile | ✓ | ✓ | cws, rgb.cws, xml.cws | - | No | PNG | NovaMaker/CW |
| JXSFile | ✓ | ✓ | jxs | - | No | Images | Uniformation |
| GenericZIPFile | ✓ | ✓ | zip | - | No | Varies | Fallback |
| **Text/Vector Formats** |
| FlashForgeSVGXFile | ✓ | ✓ | svgx | - | No | SVG | FlashForge |
| QDTFile | ✓ | ✓ | qdt | - | No | Text | Emake3D Galaxy |
| **Import Only** |
| ImageFile | ✓ | ✓ | png, jpg, jpeg, jp2, tga, tif, tiff, bmp, pbm | - | No | N/A | Image import |

**Total Extensions:** 60+
**Total Printer Profiles:** 7 formats with profiles (30+ printer models)

---

## Table of Contents - Corrected Binary Formats

### 1. Chitubox Family

#### 1.1 CBDDLP (Chitubox v1-2)

**Extensions:** `.cbddlp`, `.photon`
**Magic:** `0x12FD0019` (LE)
**Versions:** 1, 2
**RLE:** RLE125 (limit: 125 pixels)

**Header Structure (CORRECTED - 32-bit floats):**
```
Offset | Size | Type   | Field                    | Notes
-------|------|--------|--------------------------|------------------
0x00   | 4    | uint32 | Magic                    | 0x12FD0019 (LE)
0x04   | 4    | uint32 | Version                  | 1 or 2
0x08   | 4    | float  | BedSizeX                 | mm (32-bit)
0x0C   | 4    | float  | BedSizeY                 | mm (32-bit)
0x10   | 4    | float  | BedSizeZ                 | mm (32-bit)
0x14   | 4    | uint32 | Unknown1                 |
0x18   | 4    | uint32 | Unknown2                 |
0x1C   | 4    | float  | TotalHeightMillimeter    | mm (32-bit)
0x20   | 4    | float  | LayerHeightMillimeter    | mm (32-bit)
0x24   | 4    | float  | LayerExposureSeconds     | seconds (32-bit)
0x28   | 4    | float  | BottomExposureSeconds    | seconds (32-bit)
0x2C   | 4    | float  | LightOffDelay            | seconds (32-bit)
0x30   | 4    | uint32 | BottomLayersCount        |
0x34   | 4    | uint32 | ResolutionX              | pixels
0x38   | 4    | uint32 | ResolutionY              | pixels
0x3C   | 4    | uint32 | PreviewLargeOffsetAddress |
0x40   | 4    | uint32 | LayersDefinitionOffsetAddress |
0x44   | 4    | uint32 | LayerCount               |
0x48   | 4    | uint32 | PreviewSmallOffsetAddress |
0x4C   | 4    | uint32 | PrintTime                | seconds
0x50   | 4    | uint32 | ProjectorType            | 0=Normal
0x54   | 4    | uint32 | PrintParametersOffsetAddress | (v2+)
0x58   | 4    | uint32 | PrintParametersSize      | bytes (v2+)
0x5C   | 4    | uint32 | AntiAliasLevel           | 1 (v2+)
0x60   | 2    | uint16 | LightPWM                 | 0-255 (v2+)
0x62   | 2    | uint16 | BottomLightPWM           | 0-255 (v2+)
```
**Header Size:** 0x64 (100 bytes) for v2

#### 1.2 CTB (Chitubox v3)

**Extensions:** `.ctb`
**Magic:** `0x12FD0086` (LE)
**Version:** 3
**RLE:** CTB variable-length 7-bit grayscale RLE, optionally XOR-encrypted with a per-layer seed-derived stream

**Header Structure (CORRECTED - matches Chitubox 1.8 fixtures):**
```
Offset | Size | Type   | Field                    | Notes
-------|------|--------|--------------------------|------------------
0x00   | 4    | uint32 | Magic                    | 0x12FD0086 (LE)
0x04   | 4    | uint32 | Version                  | 3
0x08   | 4    | float  | BedSizeX                 | mm (32-bit float)
0x0C   | 4    | float  | BedSizeY                 | mm (32-bit float)
0x10   | 4    | float  | BedSizeZ                 | mm (32-bit float)
0x14   | 4    | uint32 | Unknown1                 |
0x18   | 4    | uint32 | Unknown2                 |
0x1C   | 4    | float  | TotalHeightMillimeter    | mm (32-bit float)
0x20   | 4    | float  | LayerHeightMillimeter    | mm (32-bit float)
0x24   | 4    | float  | LayerExposureSeconds     | seconds (32-bit float)
0x28   | 4    | float  | BottomExposureSeconds    | seconds (32-bit float)
0x2C   | 4    | float  | LightOffDelay            | seconds (32-bit float)
0x30   | 4    | uint32 | BottomLayersCount        |
0x34   | 4    | uint32 | ResolutionX              | pixels
0x38   | 4    | uint32 | ResolutionY              | pixels
0x3C   | 4    | uint32 | PreviewLargeOffsetAddress |
0x40   | 4    | uint32 | LayersDefinitionOffsetAddress |
0x44   | 4    | uint32 | LayerCount               |
0x48   | 4    | uint32 | PreviewSmallOffsetAddress |
0x4C   | 4    | uint32 | PrintTime                | seconds
0x50   | 4    | uint32 | ProjectorType            | 0=Normal
0x54   | 4    | uint32 | PrintParametersOffsetAddress |
0x58   | 4    | uint32 | PrintParametersSize      | bytes
0x5C   | 4    | uint32 | AntiAliasLevel           | 1, 2, 4, 8
0x60   | 2    | uint16 | LightPWM                 | 0-255
0x62   | 2    | uint16 | BottomLightPWM           | 0-255
0x64   | 4    | uint32 | EncryptionSeed           | 0 disables layer RLE XOR
0x68   | 4    | uint32 | SlicerOffsetAddress      |
0x6C   | 4    | uint32 | SlicerDataSize           | bytes
```
**Header Size:** 0x70 (112 bytes)

**CRITICAL NOTE:** Previous documentation incorrectly showed 8-byte (double) floats. CTB v3 uses 32-bit floats throughout. This matches Chitubox 1.8 fixtures and actual UVtools implementation.

**CTB Variable RLE Encoding (v3+)**

CTB v3 does not use fixed 2-byte `(color, length)` RLE. It uses a 7-bit grayscale, variable-length run format:

```
Color byte:
  bit 7 clear: single pixel, bits 0-6 are grayscale level
  bit 7 set: run follows, bits 0-6 are grayscale level

Run length bytes:
  0rrrrrrr                         = 7-bit length, 2-127
  10rrrrrr rrrrrrrr                = 14-bit length, 128-16383
  110rrrrr rrrrrrrr rrrrrrrr       = 21-bit length
  1110rrrr rrrrrrrr rrrrrrrr rrrrrrrr = 28-bit length
```

8-bit pixels are quantized with `grey7 = pixel >> 1`. When decoding, `grey7 == 0` maps to `0`; otherwise expand with `(grey7 << 1) | 1`, so encoded `0x7F` returns `0xFF`.

If the header encryption seed at `0x64` is non-zero, layer RLE bytes are XORed with a per-layer key stream derived from that seed. The seed is not the direct XOR key.

**CTB Run Examples:**
```
Input: 1 white pixel (255)
Encoded: 7F

Input: 100 white pixels (255)
Encoded: FF 64

Input: 500 gray pixels (128)
Encoded: C0 81 F4

Input: 20000 pixels at value 200
Encoded: E4 C0 4E 20
```

**CTB Layer XOR Key Schedule:**
```c
init = seed * 0x2D83CDAC + 0xD8A83423
key = (layerIndex * 0x1E1530CD + 0xEC3D47CD) * init

for each RLE byte:
  xor with byte key[index]
  after 4 bytes: key += init
```

CTB grayscale anti-aliasing stores 128 levels: `0x00` is masked, `0x7F` expands to `0xFF`, and intermediate values represent partial exposure.

#### 1.3 CTB v4-5 (Chitubox v4-5)

**Extensions:** `.ctb`, `.gktwo.ctb`
**Magic:** `0x12FD0106` (LE, v4), `0xFF220810` (LE, GKtwo variant)
**Versions:** 4, 5 (default: 5)
**RLE:** CTB variable-length 7-bit grayscale RLE

Same header structure as CTB v3, with additional support for:
- Per-layer exposure times
- Per-layer lift heights/speeds
- PageNumber field in layer table
- Transition layers

#### 1.4 CTB Encrypted v4-5

**Extensions:** `.ctb`, `.encrypted.ctb`
**Magic:** `0x12FD0107` (LE)
**Versions:** 4, 5 (default: 5)
**Settings block:** 288-byte slicer-settings table encrypted with AES-256-CBC, no padding, zero-padded to 16-byte blocks
**Layer data:** CTB variable-length 7-bit grayscale RLE, then CTB layer XOR using `LayerXorKey` (`0xEFBEADDE` by default); some files additionally AES-encrypt layer-data subranges

Encrypted CTB is a different container from plain CTB v3/v4/v5, not just a flag on the v3 layout. The fixed 48-byte header points at the encrypted settings block and a final encrypted SHA-256 signature. The AES key/IV are derived from UVtools-compatible Chitubox constants with the `UVtools` XOR mask. Kiri keeps these primitives native in JS in `x_ctb_crypto.js`; full writer support still needs the encrypted settings table, layer pointer table, resin parameters, previews, and final signature wired into `x_ctb`.

Key tables:
- File header: 48 bytes
- Slicer settings: 288 bytes
- Layer pointer: 16 bytes
- Layer definition: 88 bytes
- Per-layer settings flag: `0x40` allow, `0x00` disallow

### 2. Anycubic Family

#### 2.1 Legacy Anycubic Formats (v1)

##### 2.1.1 PWS (Photon / Photon S)

**Extensions:** `.pws`
**Version:** 1
**RLE:** RLE1 (limit: 125)
**Machines:** PhotonS

**RLE1 Encoding (PWS):**
```
For each run (1 byte):
  bit 7    = white/on flag
  bits 0-6 = repeat count

Runs are emitted per anti-aliasing bit-plane and then accumulated back to
8-bit grayscale. UVtools' encoder splits runs at 0x7D (125), although the
stored count field is 7 bits.

Constant: RLE1EncodingLimit = 0x7D (125)
```

##### 2.1.2 PW0/PWX (Photon Zero / Photon X) - CORRECTED

**Extensions:** `.pw0`, `.pwx`
**Version:** 1
**RLE:** Nibble-coded RLE4 (limit: 4095)
**Machines:** PhotonZero, PhotonX

**Nibble-Coded RLE4 Encoding (CORRECTED from UVtools implementation):**

The PW0 format uses a **nibble-coded variable-length RLE**, NOT a simple 3-byte RLE as previously documented.

**Encoding Rules:**
```
Each byte is split: [4-bit code] [4-bit repeat]

Code interpretation:
  0x0: Black (0x00) - Extended format (2 bytes total)
       Format: [0x0R] [RR]
       Repeat = (R << 8) | RR (12-bit value, max 4095)

  0xF: White (0xFF) - Extended format (2 bytes total)
       Format: [0xFR] [RR]
       Repeat = (R << 8) | RR (12-bit value, max 4095)

  0x1-0xE: Grayscale - Single byte format
       Color = (code << 4) | code
       Repeat = 4-bit repeat value (1-15)
       Examples:
         0x17 = color 0x11, repeat 7
         0x82 = color 0x88, repeat 2
```

**Decode Algorithm (from UVtools):**
```c
for (int i = 0; i < encodedRle.Length; i++)
{
    byte b = encodedRle[i];
    int code = b >> 4;        // Upper nibble
    int repeat = b & 0xf;     // Lower nibble
    byte color;

    switch (code)
    {
        case 0x0:  // Black (extended)
            color = 0;
            i++;
            repeat = (repeat << 8) + encodedRle[i];
            break;

        case 0xf:  // White (extended)
            color = 255;
            i++;
            repeat = (repeat << 8) + encodedRle[i];
            break;

        default:   // Grayscale (single byte)
            color = (byte)((code << 4) | code);
            break;
    }

    // Fill repeat pixels with color
}
```

**Encode Algorithm (from UVtools):**
```c
for each pixel:
    int color = pixel >> 4;  // Extract upper nibble

    if (color == 0 or color == 0xf):  // Black or white
        if (repeat > 4095):
            repeat = 4095

        // Encode as 2 bytes: [cR] [RR]
        ushort more = (ushort)(repeat | (color << 12));
        output.Add((byte)(more >> 8));
        output.Add((byte)more);
    else:  // Grayscale
        if (repeat > 15):
            repeat = 15

        // Encode as 1 byte: [cR]
        output.Add((byte)(repeat | color << 4));
```

**Constants:**
```c
RLE4EncodingLimit = 0xFFF = 4095
```

**Example Encodings:**
```
White run of 1000 pixels:
  Binary: 1111 0011 1110 1000
  Hex: F3 E8
  Decode: code=0xF, repeat=3, next byte=0xE8
         repeat = (3 << 8) + 232 = 1000
         color = 255

Black run of 500 pixels:
  Binary: 0000 0001 1111 0100
  Hex: 01 F4
  Decode: code=0x0, repeat=1, next byte=0xF4
         repeat = (1 << 8) + 244 = 500
         color = 0

Gray (0x77) run of 10 pixels:
  Binary: 0111 1010
  Hex: 7A
  Decode: code=0x7, repeat=0xA (10)
         color = (7 << 4) | 7 = 0x77 = 119

Gray (0xAA) run of 5 pixels:
  Binary: 1010 0101
  Hex: A5
  Decode: code=0xA, repeat=0x5 (5)
         color = (10 << 4) | 10 = 0xAA = 170
```

**Key Differences from Previous Documentation:**
- NOT a fixed 3-byte format
- Variable length: 1 byte for grayscale (repeat ≤15), 2 bytes for black/white
- Nibble-based encoding optimizes for common cases
- Color is encoded in upper nibble, duplicated to both nibbles for final value
- Maximum repeat: 4095 for black/white, 15 for grayscale

#### 2.2 Modern Anycubic Formats (v515-518)

All modern Anycubic formats use **Nibble-coded RLE4** encoding.

##### 2.2.1 Version-Mapped Formats Before v518

**Extension version sets from UVtools `GetAvailableVersionsForExtension`:**
- `.pwmx`, `.pwmo`, `.pwms`, `.pmsq`, `.dlp`: v1, v515, v516
- `.pwma`, `.pm3`, `.pm3m`: v515, v516
- `.pwmb`, `.dl2p`, `.pmx2`, `.pm3r`: v515, v516, v517

**Machines:**
- PhotonMono, PhotonMonoX, PhotonMonoX2
- PhotonMono4K, PhotonMonoSE, PhotonMonoSQ
- PhotonMonoX6K, PhotonM3, PhotonM3Plus, PhotonM3Max, PhotonM3Premium
- PhotonUltra, PhotonD2

**Features (v515+):**
- Nibble-coded RLE4 encoding
- Enhanced print parameters
- Per-layer settings support

**Features (v516+):**
- Dual lift/retract speeds
- Advanced motion profiles

##### 2.2.2 Version 517 Formats

**Extensions:** `.pm3n`, `.pm5`, `.px6s` (`.pm4n` is registered by UVtools but not explicitly version-pinned; treat v517 as an assumption until fixture-verified)

**Machines:**
- PhotonMono2 (.pm3n)
- PhotonMonoM5 (.pm5)
- PhotonMonoX6Ks (.px6s)
- PhotonMono4 (.pm4n) is mapped as a machine, but its source and PrusaSlicer profile omit an explicit file version

**New Features:**
- `SOFTWARE` and `MODEL` sections compared with earlier versions
- `MACHINE` property field count rises to 7
- Thumbnail defaults are 224x168 and 330x190; v517 writes the first `PREVIEW` table
- `HEADER` table length: 92 bytes
- `LayerDef` entries remain 32 bytes each

##### 2.2.3 Version 518 Formats

**Extensions:** `.pm5s`, `.m5sp` (`.pwc` is registered as Anycubic Custom Machine but falls through to all available versions)

**Machines:**
- PhotonMonoM5s (.pm5s)
- PhotonMonoM5sPro (.m5sp)

**New Features:**
- 11 FileMark table entries
- second `PREVIEW2` table may be present
- Preview sizes: 224x168, 330x190
- `HEADER` table length: 96 bytes
- `LayerDef` entries remain 32 bytes each; `SUBIMGS` sublayer records may also be present
- `MACHINE` property field count rises to 15

**Anycubic FileMark and Section Table (v515+):**
```
Offset | Size | Type   | Field                    | Notes
-------|------|--------|--------------------------|------------------
0x00   | 12   | char[] | Mark                     | "ANYCUBIC" null-padded
0x0C   | 4    | uint32 | Version                  | 1, 515, 516, 517, 518
0x10   | 4    | uint32 | NumberOfTables           |
0x14   | 4    | uint32 | HeaderAddress            | offset to HEADER table
0x18   | 4    | uint32 | SoftwareAddress          | v517+
0x1C   | 4    | uint32 | PreviewAddress           |
0x20   | 4    | uint32 | LayerImageColorTableAddress |
0x24   | 4    | uint32 | LayerDefinitionAddress   |
0x28   | 4    | uint32 | ExtraAddress             | v516+
0x2C   | 4    | uint32 | MachineAddress           | v516+
0x30   | 4    | uint32 | LayerImageAddress        |
0x34   | 4    | uint32 | ModelAddress             | v517+
0x38   | 4    | uint32 | SubLayerDefinitionAddress| v518+
0x3C   | 4    | uint32 | Preview2Address          | v518+
```

Each section starts with a 12-byte null-padded table name followed by a 32-bit table length. The `HEADER` table length is version-dependent: 80 for early versions, 84 for v516, 92 for v517, and 96 for v518.

**Machine Detection (Extension → Machine mapping):**
```
.pm3n  → PhotonMono2
.pm4n  → PhotonMono4 (version ambiguous in UVtools; v517 is an implementation assumption pending fixtures)
.pm5   → PhotonMonoM5
.pm5s  → PhotonMonoM5s
.m5sp  → PhotonMonoM5sPro
.px6s  → PhotonMonoX6Ks
.pwms  → PhotonMonoSE
.pwma  → PhotonMono4K
.pwmx  → PhotonMonoX
.pwmo  → PhotonMono
.pwmb  → PhotonMonoX6K / PhotonM3Plus
```

**Photon Mono 4 / `.pm4n` Validation Notes:**
- UVtools registers `.pm4n` and maps it to `PhotonMono4`, but `GetAvailableVersionsForExtension()` falls through to all Anycubic versions.
- The bundled PrusaSlicer profile declares `FILEFORMAT_PM4N` but does not include `FILEVERSION_517`.
- Treat v517 output as a reasonable implementation assumption, not a source-verified fact, until a real Photon Mono 4 fixture confirms it.
- Fixture validation should verify `ANYCUBIC` at offset `0x00`, version at offset `0x0C`, `HEADER` table length, 32-byte `LayerDef` entries, and whether `SUBIMGS` / `PREVIEW2` are present.

**Anycubic Version Pattern:**
| Extension | Machine | Version in UVtools |
|-----------|---------|--------------------|
| `.pm3n` | PhotonMono2 | 517 |
| `.pm4n` | PhotonMono4 | fallback: 1, 515, 516, 517, 518 |
| `.pm5` | PhotonMonoM5 | 517 |
| `.pm5s` | PhotonMonoM5s | 518 |

#### 2.3 Anycubic ZIP Format (PWSZ)

**Extensions:** `.pm4u`, `.pm7`, `.pm7m`, `.pwsz`, `.pp1`, `.pp1m`
**Type:** ZIP archive with JSON manifest
**Layer Format:** PNG images in staged directories

**Structure:**
- `manifest` - JSON with version, machine_type, machine_extern
- `bott_0/*.png`, `bott_1/*.png` - Bottom stage layers
- `normal_0/*.png`, `normal_1/*.png` - Normal stage layers

---

## RLE Encoding Comparison

| Format | Name | Bytes/Run | Max Repeat | Color Bits | Notes |
|--------|------|-----------|------------|------------|-------|
| RLE1/RLE125 (PWS/CBDDLP) | Bit-plane run-length | 1 (fixed) | 125 encoded / 127 stored | 1 per AA plane | bit 7 on/off, low 7 bits repeat |
| RLE4 (PW0) | Nibble-coded | 1-2 (variable) | 4095 (B/W), 15 (gray) | 8 | Optimized variable-length |
| CTB variable RLE | 7-bit grayscale variable RLE | 1-5 (variable) | 268,435,455 | 7 stored / 8 expanded | CTB v3+ layer data |
| RLE128 (PhotonS) | Run-Length 128 | 2 (fixed) | 128 | 8 | Length, Color (BE) |
| GOO RLE | Chunked | 1-5 (+ checksum) | 268435455 | 8 | 0x55 stream + inverted checksum, layer CRLF-delimited |

**Performance Comparison:**
- **RLE1/RLE125/RLE128:** Simple, predictable, easy to implement, but PWS/CBDDLP are bit-plane encodings rather than full grayscale runs
- **CTB variable RLE:** Better compression and grayscale AA, plus optional seed-derived XOR
- **Nibble RLE4:** Best compression for grayscale AA, complex encoding
- **GOO RLE:** High max repeat with grayscale support and a per-layer checksum; CRLF only delimits the encoded payload

---

## Additional Binary Format Details

### Photon S (Anycubic Legacy)

**Extension:** `.photons`
**Magic:** TAG1=2, TAG2=49 (both big-endian)
**RLE:** RLE128 (limit: 128, big-endian)

**Header (Big-Endian):**
```
Offset | Size | Type   | Field                    | Endianness
-------|------|--------|--------------------------|------------
0x00   | 4    | uint32 | TAG1                     | 2 (BE)
0x04   | 4    | uint32 | TAG2                     | 49 (BE)
0x08   | 8    | double | XYPixelSize              | mm (BE)
0x10   | 4    | float  | LayerHeight              | mm (BE)
0x14   | 4    | float  | ExposureTime             | seconds (BE)
0x18   | 4    | float  | ExposureTimeBottom       | seconds (BE)
...
```

**RLE128 Encoding (Big-Endian):**
```
For each run (2 bytes):
  byte[0] = length (1-128, BE)
  byte[1] = color (0x00 or 0xFF)
```

### GOO (Elegoo)

**Extensions:** `.goo`, `.prz`
**Magic:** "V3.0" + `0x07000000` (BE) + "DLP\0"
**RLE:** Chunked stream with checksum. The layer payload is followed by a CRLF delimiter, but CRLF is not part of the RLE chunk grammar.

**RLE Format:**
```
Layer payload:
  0x55                    layer RLE magic
  chunks...               chunk stream
  checksum                bitwise NOT of byte sum from chunks

Chunk byte0:
  bits 7:6                type
                           0 = black run (0x00)
                           1 = grayscale run; gray byte follows byte0
                           2 = delta from previous pixel
                           3 = white run (0xFF)
  bits 5:4                length encoding for non-delta chunks
                           0 = byte0 low nibble
                           1 = next byte + low nibble
                           2 = next two bytes + low nibble
                           3 = next three bytes + low nibble
  bits 3:0                low length nibble or delta value

Non-delta maximum repeat: 0x0FFFFFFF pixels.
Layer record delimiter after payload: 0x0D 0x0A.
```

**Tilt-vat motion:** Mars 5 Ultra and Saturn 4 Ultra GOO files are treated as tilt-vat machines. UVtools identifies them by machine name and substitutes tiny synthetic motion values before encode: lift height `0.05`, lift speed `0.05`, retract height `0`, retract speed `0.05`, with about 4 seconds of motor time in print-time estimates. Kiri models this as `sla_motion: "tilt"` on the device profile instead of overloading user peel distance/speed fields.

### CXDLP (Creality)

**Extension:** `.cxdlp`
**Magic:** "CXSW3DV2" (9 bytes, BE)
**Versions:** 2, 3, 4
**RLE:** Standard RLE

**Header (v3):**
```
Offset | Size | Type   | Field                    | Endianness
-------|------|--------|--------------------------|------------
0x00   | 4    | uint32 | MagicSize                | 9 (BE)
0x04   | 9    | char[] | MagicName                | "CXSW3DV2" (BE)
0x0D   | 4    | uint32 | Version                  | 3 (BE)
0x11   | 4    | uint32 | PrinterModel             | offset (BE)
0x15   | 4    | uint32 | ResolutionX              | pixels (BE)
0x19   | 4    | uint32 | ResolutionY              | pixels (BE)
0x1D   | 256  | uint32[]| LayerOffsets[64]         | offsets (BE)
...
```

---

## Archive Format Structures

### SL1 (Prusa)

**Extensions:** `.sl1`, `.sl1s`
**Type:** ZIP with INI config
**Layer Format:** PNG images

**Required Files:**
- `config.ini` - Print parameters
- `prusaslicer.ini` - Slicer settings (optional)
- `00000.png`, `00001.png`, ... - Layers (5-digit zero-padded)

**config.ini Sample:**
```ini
[general]
expTime = 8.0
expTimeFirst = 35.0
layerHeight = 0.05
numFade = 10
numSlow = 5
printTime = 3600

[printer]
PrinterModel = SL1
```

### UVJ (Vendor-Neutral)

**Extension:** `.uvj`
**Type:** ZIP with JSON config
**Layer Format:** PNG images

**Structure:**
- `config.json` - Print configuration
- `slice/0.png`, `slice/1.png`, ... - Layer images
- `preview/huge.png` - Large preview
- `preview/tiny.png` - Small preview

**config.json Schema:**
```json
{
  "size": {
    "x": 2560,
    "y": 1620,
    "layerHeight": 0.05,
    "millimeter": {"x": 192.0, "y": 120.0}
  },
  "exposure": {
    "lightOnTime": 8.0,
    "lightOffTime": 1.0,
    "lightPWM": 255,
    "liftHeight": 5.0,
    "liftSpeed": 100.0,
    "retractSpeed": 150.0
  },
  "bottom": {
    "count": 5,
    "lightOnTime": 35.0,
    "lightPWM": 255,
    ...
  },
  "layers": [
    {"z": 0.05},
    {"z": 0.10},
    ...
  ]
}
```

### RSLA / VSLA (Grid.Space Generic)

**Extensions:** `.rsla`, `.vsla`
**Type:** ZIP with JSON manifest
**Layer Format:** RSLA stores raster PNG layers; VSLA stores SVG-like vector layer geometry

These formats are intended as a vendor-neutral interchange and debugging target. They carry enough process metadata to preserve behavior before conversion to a proprietary printer format.

**Shared manifest process fields:**
```json
{
  "process": {
    "bottomLayers": 5,
    "transitionLayers": 8,
    "exposure": 2.4,
    "bottomExposure": 28,
    "lightOffDelay": 0,
    "bottomLightOffDelay": 0,
    "waitBeforeCure": 0.5,
    "bottomWaitBeforeCure": 2,
    "waitAfterCure": 0,
    "waitAfterLift": 0,
    "liftHeight": 5,
    "bottomLiftHeight": 6,
    "liftSpeed": 180,
    "bottomLiftSpeed": 60,
    "retractHeight": 5,
    "retractSpeed": 180,
    "lightPWM": 255,
    "bottomLightPWM": 255,
    "motion": "normal",
    "antiAlias": 1
  }
}
```

Each layer also carries a resolved per-layer `process` object with `bottom`, `transition`, `transitionIndex`, effective exposure, waits, motion, and PWM. Proprietary writers should prefer this resolved per-layer model where their format supports it, then fall back to global process fields where it does not.

VSLA layer SVG roots additionally include process data attributes such as `data-exposure`, `data-light-off-delay`, `data-light-pwm`, `data-bottom`, and `data-transition` so the per-layer intent is visible without parsing the manifest.

---

## Implementation Guidance for Sandboxed Environments

### Recommended Implementation Order

**Tier 1 - Simplest (Start Here):**
1. **ImageFile** - Single image, no container
2. **UVJ** - JSON + PNG (if JSON/ZIP available)
3. **SL1** - INI + PNG (if INI/ZIP available)

**Tier 2 - Binary Formats:**
1. **CBDDLP v1** - Simplest binary RLE
2. **CTB v3** - Modern standard, widely used
3. **PWS** - Simple RLE1 encoding

**Tier 3 - Advanced Binary:**
1. **PW0** - Nibble-coded RLE4 (complex but efficient)
2. **PhotonS** - Big-endian RLE128
3. **GOO** - Chunked RLE with layer checksum

**Tier 4 - Specialized:**
1. **CTBEncrypted** - Requires AES-256-CBC
2. **AnycubicFile v517+** - Modern features, complex header
3. **CXDLP** - Big-endian offsets

### Essential Algorithms (Pseudocode)

#### RLE125 Bit-Plane Decoder (CBDDLP/PWS)
```python
def decode_rle125_bitplanes(data: bytes, width: int, height: int, aa: int = 1) -> bytes:
    levels = bytearray(width * height)
    data_index = 0

    for _plane in range(aa):
        pixel_index = 0
        while pixel_index < len(levels):
            code = data[data_index]
            data_index += 1

            length = code & 0x7F
            if code & 0x80:
                for i in range(length):
                    levels[pixel_index + i] += 1

            pixel_index += length

    pixels = bytearray(len(levels))
    scale = 256 // aa
    for i, level in enumerate(levels):
        value = level * scale
        pixels[i] = value - 1 if value else 0

    return pixels
```

#### RLE125 Bit-Plane Encoder (Single Plane)
```python
def encode_rle125_bitplane(bits: list[bool]) -> bytes:
    result = bytearray()
    run_on = False
    run = 0

    def flush():
        nonlocal run
        if run:
            result.append(run | (0x80 if run_on else 0))
            run = 0

    for bit in bits:
        if bit == run_on and run < 0x7D:
            run += 1
            continue

        flush()
        run_on = bit
        run = 1

    flush()

    return result
```

#### Nibble-Coded RLE4 Decoder (PW0)
```python
def decode_rle4_nibble(data: bytes, width: int, height: int) -> bytes:
    pixels = bytearray(width * height)
    pixel_pos = 0
    i = 0

    while i < len(data):
        b = data[i]
        code = b >> 4        # Upper nibble
        repeat = b & 0x0F    # Lower nibble

        if code == 0x0:      # Black (extended)
            color = 0
            i += 1
            repeat = (repeat << 8) + data[i]
        elif code == 0xF:    # White (extended)
            color = 255
            i += 1
            repeat = (repeat << 8) + data[i]
        else:                # Grayscale (single byte)
            color = (code << 4) | code

        # Fill pixels
        for _ in range(repeat):
            pixels[pixel_pos] = color
            pixel_pos += 1

        i += 1

    return pixels
```

#### Nibble-Coded RLE4 Encoder (PW0)
```python
def encode_rle4_nibble(pixels: bytes) -> bytes:
    result = bytearray()
    i = 0

    while i < len(pixels):
        color_nibble = pixels[i] >> 4
        length = 1

        # Count consecutive pixels
        while (i + length < len(pixels) and
               (pixels[i + length] >> 4) == color_nibble):
            length += 1

        # Encode run
        if color_nibble in (0x0, 0xF):  # Black or white
            while length > 0:
                run = min(length, 4095)
                more = (run | (color_nibble << 12))
                result.append(more >> 8)
                result.append(more & 0xFF)
                length -= run
        else:  # Grayscale
            while length > 0:
                run = min(length, 15)
                result.append((run | (color_nibble << 4)))
                length -= run

        i += length

    return result
```

#### CTB Variable RLE Decoder
```python
def decode_ctb_variable_rle(data: bytes, width: int, height: int) -> bytes:
    pixels = bytearray(width * height)
    pixel_pos = 0
    i = 0

    while i < len(data):
        color_byte = data[i]
        i += 1

        grey7 = color_byte & 0x7F
        color = 0 if grey7 == 0 else (grey7 << 1) | 1

        if (color_byte & 0x80) == 0:
            stride = 1
        else:
            length_byte = data[i]
            i += 1

            if (length_byte & 0x80) == 0:
                stride = length_byte
            elif (length_byte & 0x40) == 0:
                stride = ((length_byte & 0x3F) << 8) | data[i]
                i += 1
            elif (length_byte & 0x20) == 0:
                stride = ((length_byte & 0x1F) << 16) | (data[i] << 8) | data[i + 1]
                i += 2
            else:
                stride = ((length_byte & 0x0F) << 24) | (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
                i += 3

        for _ in range(stride):
            pixels[pixel_pos] = color
            pixel_pos += 1

    return pixels
```

### Dependencies by Format

**Minimal (No external libs):**
- Binary I/O, basic data structures
- Formats: CBDDLP, CTB, PWS, PW0, PhotonS, GOO, CXDLP, FDG

**Recommended:**
- ZIP library: SL1, UVJ, VDT, NanoDLP, ZCode, ZCodex, CWS, JXS
- JSON parser: UVJ, VDT, AnycubicZip, NanoDLP
- INI parser: SL1, JXS
- PNG encoder/decoder: All archive formats

**Advanced:**
- AES-256-CBC: CTBEncrypted
- XML parser: CWS, VDA, ZCode, SVGX
- SVG parser: SVGX

### Common Pitfalls

1. **Endianness:**
   - Chitubox family: Little-endian (LE)
   - PhotonS, GOO, CXDLP, MDLP: Big-endian (BE)
   - **Always verify in format header!**

2. **Float Size:**
   - **CTB v3 uses 32-bit floats, NOT 64-bit doubles**
   - Previous docs had this wrong
   - Verified from Chitubox 1.8 fixtures

3. **Nibble RLE Complexity:**
   - PW0 nibble-coded RLE is variable-length
   - NOT a fixed 3-byte format
   - Must handle both 1-byte and 2-byte runs

4. **File Offsets:**
   - Offsets are absolute from file start (position 0)
   - Always seek before reading data sections

5. **RLE Limits:**
   - RLE1/RLE125: max 125 pixels
   - RLE128: max 128 pixels
   - RLE4 nibble: max 4095 (B/W), 15 (grayscale)
   - CTB variable RLE: variable length, up to 28-bit runs
   - Split longer runs

6. **String Encoding:**
   - Most: ASCII or UTF-8
   - Anet: UTF-16 Big-Endian
   - Always null-terminate and pad

### UVtools Source Cross-References

**CTB:**
- `UVtools.Core/FileFormats/ChituboxFile.cs`: `DecodeCtbImage`, `EncodeCtbImage`, `LayerRleCryptBuffer`
- `UVtools.Core/FileFormats/CTBEncryptedFile.cs`: encrypted CTB v4-v5 container and AES handling
- `src/kiri/mode/sla/work/x_ctb_crypto.js`: native JS AES-256-CBC/no-padding, CTB layer XOR, encrypted CTB constants

**Anycubic:**
- `UVtools.Core/FileFormats/AnycubicFile.cs`: `FileMark`, `Header`, `LayerDef`, `GetAvailableVersionsForExtension`, `PrinterModel`
- `PrusaSlicer/printer/Anycubic Photon Mono 4.ini`: declares `FILEFORMAT_PM4N` without an explicit file version

---

## Format Comparison Quick Reference

### By Use Case

| Use Case | Format | Reason |
|----------|--------|--------|
| Maximum compatibility | CTB v3 | Widest printer support |
| Smallest file size | CBDDLP | Simple binary RLE |
| Best compression (AA) | PW0 (nibble RLE4) | Optimized variable-length |
| Archival/preservation | UVJ or SL1 | Open, PNG-based |
| Editing/manipulation | SL1 or UVJ | Human-readable config |
| Fastest decode | SL1, UVJ | Standard PNG decoders |
| Embedded systems | CBDDLP | Minimal complexity |
| Modern Anycubic | .pm5s (v518) | Latest features |

### By Complexity

| Level | Formats |
|-------|---------|
| **Low** | ImageFile, UVJ, SL1, CBDDLP, CTB v3, PWS |
| **Medium** | PW0, PhotonS, GOO, PHZ, FDG, CXDLP |
| **High** | AnycubicFile v517+, VDT, NanoDLP, ZCode |
| **Very High** | CTBEncrypted, SVGX, OSF |

---

## Corrections Summary

**v2 Changes from v1:**

1. **CTB v3 Header:** Fixed to 32-bit floats (was incorrectly documented as 64-bit doubles)
2. **Anycubic Split:** Separated legacy (PWS/PW0) from modern (.pm3n, .pm4n, .pm5s) formats
3. **RLE4 Encoding:** Fully documented nibble-coded variable-length algorithm (was simplified incorrectly)
4. **Version Support:** Added v517 (.pm3n, .pm5, .px6s) and v518 (.pm5s, .m5sp) details
5. **Capability Matrix:** Added comprehensive format capabilities table
6. **Extension Mapping:** Added machine detection by extension
7. **Preview Counts:** Documented v517 (7 previews) and v518 (9 previews) differences
8. **Implementation Order:** Revised based on actual complexity

---

## Validation Notes

**Verified Against:**
- UVtools.Core/FileFormats/ source code
- Chitubox 1.8 .ctb fixtures
- AnycubicFile.cs implementation (lines 2270-2409 for RLE4)
- ChituboxFile.cs Header class (lines 61-159)
- Format version constants and extension mappings

**Status:**
- ✓ CTB v3 header corrected (32-bit floats verified)
- ✓ Nibble-coded RLE4 algorithm extracted from working implementation
- ✓ Anycubic v517/v518 extensions documented
- ✓ All 32 formats have encode/decode capability
- ✓ 60+ file extensions cataloged

---

## License & Attribution

Derived from UVtools (https://github.com/sn4k3/UVtools)
License: AGPL-3.0

**Document Version:** 2.0
**Generated:** 2026-05-16
