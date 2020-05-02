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

extern void last(float a, float b);
extern void report(int a, int b);

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

    return 1;
}
