# fpbridge (Linux) — DigitalPersona U.are.U reader helper
#
#   make            build ./fpbridge against the U.are.U SDK
#   make selftest   build a reader-less test binary and run the transport tests
#   make clean
#
# Point SDK at your U.are.U SDK install (headers in $(SDK)/Include, libs in
# $(SDK)/lib). Override on the command line if it lives elsewhere:
#   make SDK=/opt/DigitalPersona/UareUSDK

CC   ?= cc
SDK  ?= /opt/DigitalPersona/UareUSDK

CFLAGS  ?= -O2 -Wall -Wextra -std=c11 -I$(SDK)/Include
LDFLAGS ?= -L$(SDK)/lib -Wl,-rpath,$(SDK)/lib
LDLIBS  ?= -ldpfpdd -ldpfj -lpthread

fpbridge: fpbridge.c
	$(CC) $(CFLAGS) -o $@ fpbridge.c $(LDFLAGS) $(LDLIBS)

# Reader-less build: no SDK required. Compiles the transport layer only and
# runs the built-in self-test (SHA-1 / base64 / WebSocket accept / JSON).
selftest: fpbridge.c
	$(CC) -O2 -Wall -Wextra -std=c11 -DFPBRIDGE_NO_SDK -o fpbridge-selftest fpbridge.c -lpthread
	./fpbridge-selftest --selftest

clean:
	rm -f fpbridge fpbridge-selftest

.PHONY: selftest clean
