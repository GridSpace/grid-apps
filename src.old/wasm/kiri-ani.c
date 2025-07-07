#include <emscripten.h>
#include <string.h>

typedef unsigned char Uint8;
typedef unsigned short Uint16;
typedef unsigned int Uint32;

extern void reportf(float a, float b);
extern void reporti(int a, int b);

/**
 * m = memory base pointer
 * im = input memory location (mesh)
 * it = input memory location (tool)
 * ol = output memory location (mesh-updates)
 * returns length of update at output memory location
 */
EMSCRIPTEN_KEEPALIVE
Uint32 updateMesh(unsigned char *m, Uint32 im, Uint32 it, Uint32 ol) {
    int rv = m[0] + m[100] + m[200];
    m[0] = 123;
    reporti(m[100],m[200]);
    return rv;
}
