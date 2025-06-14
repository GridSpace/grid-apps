#include <emscripten.h>
#include <string.h>

typedef unsigned char Uint8;
typedef unsigned short Uint16;
typedef unsigned int Uint32;

struct info {
    Uint16 width;  // image width
    Uint16 height; // image height
    Uint16 polys;  // total number of polygons to render
};

struct poly {
    Uint16 length; // offset to end of record in bytes
    Uint16 inners; // number of inner polygons
    Uint16 points; // number of points in polygon
    Uint16 minx;
    Uint16 maxx;
    Uint16 miny;
    Uint16 maxy;
};

struct point {
    float x;
    float y;
};

const Uint8 ph_size = sizeof(struct poly);
const Uint8 pt_size = sizeof(struct point);

extern void reportf(float a, float b);
extern void reporti(int a, int b);

Uint32 readoff; // read position offset

Uint8 check_cross(Uint32 x, Uint32 y, struct point *p1, struct point *p2) {
    return (
        ((p1->y >= y) != (p2->y >= y)) &&
        (x < (p2->x - p1->x) * (y - p1->y) / (p2->y - p1->y) + p1->x)
    ) ? 1 : 0;
}

Uint8 is_inside_poly(Uint32 x, Uint32 y, unsigned char *m, Uint32 o) {
    struct poly *poly = (struct poly *)(m + readoff);

    Uint32 nextpoly = readoff + poly->length;
    Uint8 side = 0; // 0=outside, 1=inside

    // skip post header
    readoff += ph_size;

    // save pointer to first point or last comparison
    struct point *pf = (struct point *)(m + readoff);
    struct point *p1 = pf;
    struct point *p2;

    // skip past first point
    readoff += pt_size;

    // read and check point pairs updating `side`
    for (Uint16 i=1; i<poly->points; i++) {
        p2 = (struct point *)(m + readoff);
        // increment read pointe
        readoff += pt_size;
        // check current/previous point crossing
        if (check_cross(x, y, p1, p2)) {
            side = 1 - side;
        }
        p1 = p2;
    }

    // check last/first point crossing
    if (check_cross(x, y, p1, pf)) {
        side = 1 - side;
    }

    return side;
}

void rasterize_poly(unsigned char *m, Uint32 o, Uint32 height) {
    struct poly *poly = (struct poly *)(m + readoff);

    Uint32 nextpoly = readoff + poly->length;

    // skip post header
    readoff += ph_size;

    // save pointer to first point or last comparison
    struct point *pf = (struct point *)(m + readoff);
    struct point *p1 = pf;
    struct point *p2;

    // skip past first point
    readoff += pt_size;

    // point data starts here
    Uint32 pstart = readoff;

    // scan bounding area of polygon
    for (Uint32 x=poly->minx; x<poly->maxx; x++) {
        for (Uint32 y=poly->miny; y<poly->maxy; y++) {

            Uint8 side = 0; // 0=outside, 1=inside

            // re-start at point data offset for each x,y
            readoff = pstart;
            p1 = pf;

            // read and check point pairs updating `side`
            for (Uint16 i=1; i<poly->points; i++) {
                p2 = (struct point *)(m + readoff);
                // increment read pointe
                readoff += pt_size;
                // check current/previous point crossing
                if (check_cross(x, y, p1, p2)) {
                    side = 1 - side;
                }
                p1 = p2;
            }

            // check last/first point crossing
            if (check_cross(x, y, p1, pf)) {
                side = 1 - side;
            }

            // check inner polygons only if inside the outer polygon
            if (side)
            for (Uint16 i=0; i<poly->inners; i++) {
                // if inside an inner, then actually outside poly and term
                if (is_inside_poly(x, y, m, o)) {
                    side = 0;
                    break;
                }
            }

            if (side) {
                Uint32 impos = y + (x * height);
                (m + o)[impos] = 255;
            }

        }
    }

    // update pointer to next polygon
    readoff = nextpoly;
}

/**
 * m = memory base pointer
 * i = input memory location (polygon records)
 * o = output memory location (for raster)
 * returns last read position in memory
 */
EMSCRIPTEN_KEEPALIVE
Uint32 render(unsigned char *m, Uint32 i, Uint32 o) {
    struct info *info = (struct info *)(m + i);
    Uint32 impos;
    Uint8 inside;
    Uint32 polypos = (sizeof (struct info)) + i;

    memset(m+o, 0, info->width * info->height);

    readoff = polypos;
    for (Uint32 p=0; p<info->polys; p++) {
        rasterize_poly(m, o, info->height);
    }

    return readoff;
}

Uint8 rle_byte(Uint8 color, Uint8 count, Uint8 type) {
    if (type == 0) {
        return (count & 0x7f) | ((color << 7) & 0x80);
    } else {
        Uint8 run = count - 1;
        return
            (run & 1  ? 128 : 0) |
            (run & 2  ?  64 : 0) |
            (run & 4  ?  32 : 0) |
            (run & 8  ?  16 : 0) |
            (run & 16 ?   8 : 0) |
            (run & 32 ?   4 : 0) |
            (run & 64 ?   2 : 0) | color;
    }
}

/**
 * mem  = memory base pointer
 * in   = input memory location (raster)
 * ilen = input raster length in bytes
 * out  = output memory location (for rle-encoded image)
 * type = 0=photon, 1=photons
 * returns length of rle-encoded image
 */
EMSCRIPTEN_KEEPALIVE
Uint32 rle_encode(unsigned char *mem, Uint32 in, Uint32 ilen, Uint8 mask, Uint32 out, Uint8 type) {
    Uint8 color = (mem[in++] & mask) ? 1 : 0; // current color
    Uint8 count = 1; // number of color matches
    Uint8 cmax = type == 0 ? 125 : 128; // count max
    Uint8 next; // next color
    Uint32 opos = out;
    while (--ilen > 0) {
        next = (mem[in++] & mask) ? 1 : 0;
        if (color != next || count == cmax) {
            mem[opos++] = rle_byte(color, count, type);
            count = 0;
        }
        count++;
        color = next;
    }

    if (count > 0) {
        mem[opos++] = rle_byte(color, count, type);
    }
    return opos - out;
}
