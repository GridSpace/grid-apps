all: kiri-sla.wasm kiri-geo.wasm

kiri-sla.wasm: kiri-sla.c
	emcc -o kiri-sla.wasm kiri-sla.c -O3 -s ERROR_ON_UNDEFINED_SYMBOLS=0

kiri-geo.wasm: kiri-geo.cpp
	emcc -o kiri-geo.wasm clipper.cpp kiri-geo.cpp -Oz -s ERROR_ON_UNDEFINED_SYMBOLS=0

clean: *.wasm
	rm *.wasm
