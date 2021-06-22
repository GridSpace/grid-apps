//#define use_int32

#include <emscripten.h>
#include "clipper.hpp"

typedef unsigned char Uint8;
typedef unsigned short Uint16;
typedef unsigned int Uint32;
typedef int int32;

Uint8 *mem = 0;

extern "C" {
    extern void polygon(Uint32 points, Uint32 inners);
    extern void point(Uint32 x, Uint32 y);
}

struct length16 {
    Uint16 length;
};

struct point32 {
    int32 x;
    int32 y;
};

__attribute__ ((export_name("mem_get")))
Uint32 mem_get(Uint32 size) {
    return (Uint32)malloc(size);
}

__attribute__ ((export_name("mem_clr")))
void mem_clr(Uint32 loc) {
    free((void *)loc);
}

__attribute__ ((export_name("poly_offset")))
Uint32 poly_offset(Uint32 memat, Uint32 polys, float offset) {

    using namespace ClipperLib;

    Paths ins(polys);
    Paths outs;
    Uint32 pos = memat;
    Uint16 poly = 0;

    while (poly < polys) {
        struct length16 *ls = (struct length16 *)(mem + pos);
        Uint16 points = ls->length;
        // polygon(points, 0);
        pos += 2;
        while (points-- > 0) {
            struct point32 *ip = (struct point32 *)(mem + pos);
            pos += 8;
            ins[poly] << IntPoint(ip->x, ip->y);
            // point(ip->x, ip->y);
        }
        poly++;
    }

    // clean and simplify polygons
    // Paths cleans, simples;
    // CleanPolygons(ins, cleans, 250);
    // SimplifyPolygons(cleans, simples, pftNonZero);
    // ins = simples;

    ClipperOffset co;
    co.AddPaths(ins, jtMiter, etClosedPolygon);
    co.Execute(outs, offset);

    Uint32 resat = pos;

    for (Path po : outs) {
        // polygon(po.size(), 1);
        struct length16 *ls = (struct length16 *)(mem + pos);
        ls->length = po.size();
        pos += 2;
        for (IntPoint pt : po) {
            // point(pt.X, pt.Y);
            struct point32 *ip = (struct point32 *)(mem + pos);
            ip->x = (int)pt.X;
            ip->y = (int)pt.Y;
            pos += 8;
        }
    }

    // null terminate
    struct length16 *ls = (struct length16 *)(mem + pos);
    ls->length = 0;

    co.Clear();

    return resat;
}

__attribute__ ((export_name("poly_union")))
Uint32 poly_union(Uint32 memat, Uint32 polys) {

    using namespace ClipperLib;

    Paths ins(polys);
    Paths outs;
    Uint32 pos = memat;
    Uint16 poly = 0;

    while (poly < polys) {
        struct length16 *ls = (struct length16 *)(mem + pos);
        Uint16 points = ls->length;
        pos += 2;
        while (points-- > 0) {
            struct point32 *ip = (struct point32 *)(mem + pos);
            pos += 8;
            ins[poly] << IntPoint(ip->x, ip->y);
        }
        poly++;
    }

    Clipper clip;
    clip.AddPath(ins[0], ptSubject, true);
    clip.AddPath(ins[1], ptClip, true);
    clip.Execute(ctUnion, outs, pftEvenOdd, pftEvenOdd);

    Uint32 resat = pos;

    for (Path po : outs) {
        struct length16 *ls = (struct length16 *)(mem + pos);
        ls->length = po.size();
        pos += 2;
        for (IntPoint pt : po) {
            struct point32 *ip = (struct point32 *)(mem + pos);
            ip->x = (int)pt.X;
            ip->y = (int)pt.Y;
            pos += 8;
        }
    }

    // null terminate
    struct length16 *ls = (struct length16 *)(mem + pos);
    ls->length = 0;

    clip.Clear();

    return resat;
}
