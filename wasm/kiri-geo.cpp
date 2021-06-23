//#define use_int32

#include <emscripten.h>
#include "clipper.hpp"

typedef unsigned char Uint8;
typedef unsigned short Uint16;
typedef unsigned int Uint32;
typedef int int32;

using namespace ClipperLib;

Uint8 *mem = 0;
Uint8 debug = 0;

extern "C" {
    extern void polygon(Uint32 points, Uint32 inners);
    extern void point(Uint32 x, Uint32 y);
    extern void abc(Uint32 a, Uint32 b, Uint32 c);
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

Uint32 readPoly(Path &path, Uint32 pos) {
    struct length16 *ls = (struct length16 *)(mem + pos);
    Uint16 points = ls->length;
    // if (debug) polygon(points, 0);
    pos += 2;
    while (points-- > 0) {
        struct point32 *ip = (struct point32 *)(mem + pos);
        pos += 8;
        path << IntPoint(ip->x, ip->y);
        // if (debug) point(ip->x, ip->y);
    }
    return pos;
}

Uint32 readPolys(Paths &paths, Uint32 pos, Uint32 count) {
    Uint32 poly = 0;
    // if (debug) abc(poly, count, pos);
    while (count-- > 0) {
        pos = readPoly(paths[poly++], pos);
    }
    // if (debug) abc(poly, count, pos);
    return pos;
}

Uint32 writePolys(Paths &outs, Uint32 pos) {
    for (Path po : outs) {
        // if (debug) polygon(po.size(), 1);
        struct length16 *ls = (struct length16 *)(mem + pos);
        ls->length = po.size();
        pos += 2;
        for (IntPoint pt : po) {
            // if (debug) point(pt.X, pt.Y);
            struct point32 *ip = (struct point32 *)(mem + pos);
            ip->x = (int)pt.X;
            ip->y = (int)pt.Y;
            pos += 8;
        }
    }
    // null terminate
    struct length16 *ls = (struct length16 *)(mem + pos);
    ls->length = 0;
    return pos + 2;
}

__attribute__ ((export_name("poly_offset")))
Uint32 poly_offset(Uint32 memat, Uint32 polys, float offset) {

    Paths ins(polys);
    Paths outs;
    Uint32 pos = memat;
    Uint16 poly = 0;

    pos = readPolys(ins, pos, polys);

    // clean and simplify polygons
    // Paths cleans, simples;
    // CleanPolygons(ins, cleans, 250);
    // SimplifyPolygons(cleans, simples, pftNonZero);
    // ins = simples;

    ClipperOffset co;
    co.AddPaths(ins, jtMiter, etClosedPolygon);
    co.Execute(outs, offset);

    Uint32 resat = pos;

    pos = writePolys(outs, pos);

    co.Clear();

    return resat;
}

__attribute__ ((export_name("poly_union")))
Uint32 poly_union(Uint32 memat, Uint32 polys, float offset) {

    Paths ins(polys);
    Paths outs;
    Uint32 pos = memat;
    Uint16 poly = 0;

    pos = readPolys(ins, pos, polys);

    Clipper clip;
    clip.AddPaths(ins, ptSubject, true);
    clip.Execute(ctUnion, outs);

    Uint32 resat = pos;

    pos = writePolys(outs, pos);

    clip.Clear();

    return resat;
}

__attribute__ ((export_name("poly_diff")))
Uint32 poly_diff(Uint32 memat, Uint32 polysA, Uint32 polysB, Uint8 AB, Uint8 BA, Uint32 clean) {

    Paths inA(polysA);
    Paths inB(polysB);
    Uint32 pos = memat;

    pos = readPolys(inA, pos, polysA);
    pos = readPolys(inB, pos, polysB);

    Uint32 resat = pos;

    if (AB) {
        Paths outs;
        Clipper clip;
        clip.AddPaths(inA, ptSubject, true);
        clip.AddPaths(inB, ptClip, true);
        clip.Execute(ctDifference, outs, pftEvenOdd, pftEvenOdd);
        if (clean > 0) {
            CleanPolygons(outs, (double)clean);
        }
        pos = writePolys(outs, pos);
        clip.Clear();
    }

    if (BA) {
        Paths outs;
        Clipper clip;
        clip.AddPaths(inB, ptSubject, true);
        clip.AddPaths(inA, ptClip, true);
        clip.Execute(ctDifference, outs, pftEvenOdd, pftEvenOdd);
        if (clean > 0) {
            CleanPolygons(outs, (double)clean);
        }
        pos = writePolys(outs, pos);
        clip.Clear();
    }

    return resat;
}

__attribute__ ((export_name("set_debug")))
void set_debug(Uint8 value) {
    debug = value;
}
