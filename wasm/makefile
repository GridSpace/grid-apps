kiri-sla.wasm: kiri-sla.c
	emcc kiri-sla.c -o kiri-sla.wasm -O3 -s ERROR_ON_UNDEFINED_SYMBOLS=0

clean: *.wasm
	rm *.wasm
