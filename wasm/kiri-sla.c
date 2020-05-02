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
};

struct point {
    float x;
    float y;
};

extern void last(float a, float b);
extern void report(int a, int b);

Uint32 readoff; // read position offset

Uint8 check_cross(Uint32 x, Uint32 y, struct point *p1, struct point *p2) {
    return (
        ((p1->y >= y) != (p2->y >= y)) &&
        (x < (p2->x - p1->x) * (y - p1->y) / (p2->y - p1->y) + p1->x)
    ) ? 1 : 0;
}

Uint8 check_inside(Uint32 x, Uint32 y, unsigned char *p) {
    struct poly *poly = (struct poly *)(p + readoff);

    Uint32 nextpoly = readoff + poly->length;
    Uint8 side = 0; // 0=outside, 1=inside
    Uint8 psize = sizeof(struct point);

    // skip post header
    readoff += sizeof(struct poly);

    // save pointer to first point or last comparison
    struct point *pf = (struct point *)(p + readoff);
    struct point *p1 = pf;
    struct point *p2;

    // skip past first point
    readoff += psize;

    // read and check point pairs updating `side`
    for (Uint16 i=1; i<poly->points; i++) {
        p2 = (struct point *)(p + readoff);
        // increment read pointe
        readoff += psize;
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
        if (check_inside(x, y, p + readoff)) {
            side = 0;
            break;
        }
    }

    // update pointer to next polygon
    readoff = nextpoly;

    return side;
}

EMSCRIPTEN_KEEPALIVE
Uint32 render(unsigned char *m, Uint32 i, Uint32 o) {
    struct info *info = (struct info *)(m + i);
    Uint32 impos;
    Uint8 inside;
    Uint32 maxpos = 0;
    Uint32 polypos = (sizeof (struct info)) + i;

    memset(m+o, 0, info->width * info->height);

    for (Uint32 x=0; x<info->width; x++) {
        for (Uint32 y=0; y<info->height; y++) {
            inside = 0;
            impos = y + (x * info->height);
            readoff = polypos;
            for (Uint32 p=0; p<info->polys; p++) {
                inside = inside | check_inside(x, y, m);
            }
            if (inside) (m + o)[impos] = 255;
            if (impos > maxpos) maxpos = impos;
        }
    }

    return maxpos;
}
