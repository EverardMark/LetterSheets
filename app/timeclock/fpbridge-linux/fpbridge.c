/* ===========================================================================
 * fpbridge (Linux) — DigitalPersona U.are.U reader helper for the LetterSheets
 * Time Clock (Electron) app.
 *
 * This is the Linux counterpart of ../fpbridge-win/Program.cs. It exposes the
 * exact same WebSocket JSON protocol on ws://127.0.0.1:52100, so the Electron
 * renderer (../renderer/fpbridge.js) connects to it unchanged:
 *
 *   app  -> { cmd: "status" | "load" | "identify" | "enroll" | "cancel", ... }
 *   app <-  { type: "status" | "capture" | "enrollProgress" |
 *                    "enrollComplete" | "identify" | "error" | "canceled", ... }
 *
 * The reader is driven through DigitalPersona's cross-platform C SDK
 * (dpfpdd = device, dpfj = feature-extraction/match). Templates are ANSI-378
 * FMDs, carried to/from the app as base64 of the raw FMD bytes.
 *
 * Portability of the pieces:
 *   - The WebSocket server, SHA-1, base64 and JSON here are self-contained
 *     (libc + pthreads only) and are exercised by `fpbridge --selftest`.
 *   - Everything that touches the reader is isolated behind the hw_* functions
 *     at the bottom. Building with -DFPBRIDGE_NO_SDK stubs those out (reports
 *     "no reader", same as a dev box) so the transport can be compiled and
 *     tested without the SDK installed.
 *
 * >>> SDK ABI NOTE <<<  The dpfpdd/dpfj symbol and constant names below follow
 * the published U.are.U SDK C API, but exact spellings vary a little between
 * SDK releases. If the real build errors on a symbol, fix it in the CONFIG /
 * hw_* section — that is the only SDK-coupled code. See README.md.
 * ===========================================================================
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <ctype.h>
#include <errno.h>
#include <signal.h>
#include <unistd.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#ifndef FPBRIDGE_NO_SDK
#include "dpfpdd.h"
#include "dpfj.h"
#endif

/* Fallback so buffer sizing compiles even without the SDK header. If the SDK
 * defines DPFJ_MAX_FMD_SIZE, that (included above) wins over this. */
#ifndef DPFJ_MAX_FMD_SIZE
#define DPFJ_MAX_FMD_SIZE 4096
#endif

#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0   /* macOS dev build: rely on SIG_IGN of SIGPIPE below */
#endif

/* ------------------------------------------------------------------ config */
#define BIND_ADDR          "127.0.0.1"
#define BIND_PORT          52100
#define ENROLL_SCANS       4        /* finger presses per enrollment          */
#define CAPTURE_POLL_MS    3000     /* per capture attempt; bounds cancel lag  */
#define MAX_MESSAGE_BYTES  (16u * 1024u * 1024u)
#define IMAGE_BUF_BYTES    (512u * 1024u)  /* one captured fingerprint image   */

/* ====================================================================== */
/* Growable byte buffer                                                   */
/* ====================================================================== */
typedef struct { char *p; size_t len, cap; } buf_t;

static void buf_init(buf_t *b) { b->p = NULL; b->len = b->cap = 0; }
static void buf_free(buf_t *b) { free(b->p); buf_init(b); }

static int buf_reserve(buf_t *b, size_t extra) {
    if (b->len + extra + 1 <= b->cap) return 0;
    size_t ncap = b->cap ? b->cap * 2 : 256;
    while (ncap < b->len + extra + 1) ncap *= 2;
    char *np = (char *)realloc(b->p, ncap);
    if (!np) return -1;
    b->p = np; b->cap = ncap;
    return 0;
}
static int buf_add(buf_t *b, const void *data, size_t n) {
    if (buf_reserve(b, n)) return -1;
    memcpy(b->p + b->len, data, n);
    b->len += n; b->p[b->len] = '\0';
    return 0;
}
static int buf_puts(buf_t *b, const char *s) { return buf_add(b, s, strlen(s)); }
static int buf_putc(buf_t *b, char c) { return buf_add(b, &c, 1); }

/* ====================================================================== */
/* base64 (encode + decode). Self-contained; no external crypto lib.      */
/* ====================================================================== */
static const char B64E[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static char *b64_encode(const uint8_t *in, size_t n) {
    size_t olen = 4 * ((n + 2) / 3);
    char *out = (char *)malloc(olen + 1);
    if (!out) return NULL;
    size_t i, o = 0;
    for (i = 0; i + 2 < n; i += 3) {
        uint32_t v = (in[i] << 16) | (in[i + 1] << 8) | in[i + 2];
        out[o++] = B64E[(v >> 18) & 63];
        out[o++] = B64E[(v >> 12) & 63];
        out[o++] = B64E[(v >> 6) & 63];
        out[o++] = B64E[v & 63];
    }
    if (i < n) {
        uint32_t v = in[i] << 16;
        int rem = (int)(n - i);           /* 1 or 2 */
        if (rem == 2) v |= in[i + 1] << 8;
        out[o++] = B64E[(v >> 18) & 63];
        out[o++] = B64E[(v >> 12) & 63];
        out[o++] = (rem == 2) ? B64E[(v >> 6) & 63] : '=';
        out[o++] = '=';
    }
    out[o] = '\0';
    return out;
}

static int b64_val(int c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;                            /* skip anything else (ws, newlines) */
}

/* Returns malloc'd bytes (*outlen set), or NULL on hard failure. */
static uint8_t *b64_decode(const char *in, size_t inlen, size_t *outlen) {
    uint8_t *out = (uint8_t *)malloc(inlen / 4 * 3 + 4);
    if (!out) return NULL;
    int quad[4], qn = 0;
    size_t o = 0;
    for (size_t i = 0; i < inlen; i++) {
        char c = in[i];
        if (c == '=') break;
        int v = b64_val((unsigned char)c);
        if (v < 0) continue;
        quad[qn++] = v;
        if (qn == 4) {
            out[o++] = (uint8_t)((quad[0] << 2) | (quad[1] >> 4));
            out[o++] = (uint8_t)((quad[1] << 4) | (quad[2] >> 2));
            out[o++] = (uint8_t)((quad[2] << 6) | quad[3]);
            qn = 0;
        }
    }
    if (qn == 2) {
        out[o++] = (uint8_t)((quad[0] << 2) | (quad[1] >> 4));
    } else if (qn == 3) {
        out[o++] = (uint8_t)((quad[0] << 2) | (quad[1] >> 4));
        out[o++] = (uint8_t)((quad[1] << 4) | (quad[2] >> 2));
    }
    *outlen = o;
    return out;
}

/* ====================================================================== */
/* SHA-1 (RFC 3174) — needed for the WebSocket handshake accept.          */
/* ====================================================================== */
static uint32_t rol32(uint32_t v, int s) { return (v << s) | (v >> (32 - s)); }

static void sha1(const uint8_t *msg, size_t len, uint8_t out[20]) {
    uint32_t h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE,
             h3 = 0x10325476, h4 = 0xC3D2E1F0;

    uint64_t ml = (uint64_t)len * 8;
    size_t total = len + 1;
    while (total % 64 != 56) total++;
    total += 8;

    uint8_t *m = (uint8_t *)calloc(1, total);
    memcpy(m, msg, len);
    m[len] = 0x80;
    for (int i = 0; i < 8; i++)
        m[total - 1 - i] = (uint8_t)(ml >> (8 * i));

    for (size_t off = 0; off < total; off += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; i++) {
            const uint8_t *p = m + off + i * 4;
            w[i] = (p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3];
        }
        for (int i = 16; i < 80; i++)
            w[i] = rol32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

        uint32_t a = h0, b = h1, c = h2, d = h3, e = h4;
        for (int i = 0; i < 80; i++) {
            uint32_t f, k;
            if (i < 20)      { f = (b & c) | ((~b) & d);      k = 0x5A827999; }
            else if (i < 40) { f = b ^ c ^ d;                 k = 0x6ED9EBA1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
            else             { f = b ^ c ^ d;                 k = 0xCA62C1D6; }
            uint32_t t = rol32(a, 5) + f + e + k + w[i];
            e = d; d = c; c = rol32(b, 30); b = a; a = t;
        }
        h0 += a; h1 += b; h2 += c; h3 += d; h4 += e;
    }
    free(m);

    uint32_t h[5] = { h0, h1, h2, h3, h4 };
    for (int i = 0; i < 5; i++) {
        out[i * 4 + 0] = (uint8_t)(h[i] >> 24);
        out[i * 4 + 1] = (uint8_t)(h[i] >> 16);
        out[i * 4 + 2] = (uint8_t)(h[i] >> 8);
        out[i * 4 + 3] = (uint8_t)(h[i]);
    }
}

/* Sec-WebSocket-Accept = base64(sha1(key + magic-GUID)). */
static char *ws_accept_key(const char *client_key) {
    static const char GUID[] = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    char cat[256];
    snprintf(cat, sizeof cat, "%s%s", client_key, GUID);
    uint8_t digest[20];
    sha1((const uint8_t *)cat, strlen(cat), digest);
    return b64_encode(digest, 20);
}

/* ====================================================================== */
/* Minimal JSON parser (objects, arrays, strings, numbers, bool, null).   */
/* ====================================================================== */
typedef enum { JV_NULL, JV_BOOL, JV_NUM, JV_STR, JV_ARR, JV_OBJ } jtype;
typedef struct jval {
    jtype type;
    int b;
    double num;
    char *str;               /* JV_STR value */
    struct jval **items;     /* JV_ARR / JV_OBJ values */
    char **keys;             /* JV_OBJ keys, parallel to items */
    size_t n;
} jval;

typedef struct { const char *s; size_t i, len; } jparser;

static jval *jparse_value(jparser *p);

static void jskip_ws(jparser *p) {
    while (p->i < p->len) {
        char c = p->s[p->i];
        if (c == ' ' || c == '\t' || c == '\n' || c == '\r') p->i++;
        else break;
    }
}

static jval *jnew(jtype t) {
    jval *v = (jval *)calloc(1, sizeof(jval));
    v->type = t;
    return v;
}

void jfree(jval *v) {
    if (!v) return;
    if (v->type == JV_STR) free(v->str);
    if (v->type == JV_ARR || v->type == JV_OBJ) {
        for (size_t i = 0; i < v->n; i++) {
            jfree(v->items[i]);
            if (v->keys) free(v->keys[i]);
        }
        free(v->items);
        free(v->keys);
    }
    free(v);
}

/* Parse a JSON string (p->i points at the opening quote). Returns malloc'd. */
static char *jparse_string_raw(jparser *p) {
    if (p->i >= p->len || p->s[p->i] != '"') return NULL;
    p->i++;
    buf_t out; buf_init(&out);
    while (p->i < p->len) {
        char c = p->s[p->i++];
        if (c == '"') return out.p ? out.p : strdup("");
        if (c == '\\' && p->i < p->len) {
            char e = p->s[p->i++];
            switch (e) {
                case '"': buf_putc(&out, '"'); break;
                case '\\': buf_putc(&out, '\\'); break;
                case '/': buf_putc(&out, '/'); break;
                case 'b': buf_putc(&out, '\b'); break;
                case 'f': buf_putc(&out, '\f'); break;
                case 'n': buf_putc(&out, '\n'); break;
                case 'r': buf_putc(&out, '\r'); break;
                case 't': buf_putc(&out, '\t'); break;
                case 'u': {
                    if (p->i + 4 > p->len) { buf_free(&out); return NULL; }
                    int cp = 0;
                    for (int k = 0; k < 4; k++) {
                        char h = p->s[p->i++];
                        cp <<= 4;
                        if (h >= '0' && h <= '9') cp |= h - '0';
                        else if (h >= 'a' && h <= 'f') cp |= h - 'a' + 10;
                        else if (h >= 'A' && h <= 'F') cp |= h - 'A' + 10;
                        else { buf_free(&out); return NULL; }
                    }
                    /* BMP -> UTF-8 (surrogate pairs left as-is; ids/base64 are ASCII) */
                    if (cp < 0x80) buf_putc(&out, (char)cp);
                    else if (cp < 0x800) {
                        buf_putc(&out, (char)(0xC0 | (cp >> 6)));
                        buf_putc(&out, (char)(0x80 | (cp & 0x3F)));
                    } else {
                        buf_putc(&out, (char)(0xE0 | (cp >> 12)));
                        buf_putc(&out, (char)(0x80 | ((cp >> 6) & 0x3F)));
                        buf_putc(&out, (char)(0x80 | (cp & 0x3F)));
                    }
                    break;
                }
                default: buf_free(&out); return NULL;
            }
        } else {
            buf_putc(&out, c);
        }
    }
    buf_free(&out);
    return NULL; /* unterminated */
}

static jval *jparse_string(jparser *p) {
    char *s = jparse_string_raw(p);
    if (!s) return NULL;
    jval *v = jnew(JV_STR);
    v->str = s;
    return v;
}

static jval *jparse_number(jparser *p) {
    size_t start = p->i;
    while (p->i < p->len) {
        char c = p->s[p->i];
        if ((c >= '0' && c <= '9') || c == '-' || c == '+' ||
            c == '.' || c == 'e' || c == 'E') p->i++;
        else break;
    }
    if (p->i == start) return NULL;
    char tmp[64];
    size_t n = p->i - start;
    if (n >= sizeof tmp) n = sizeof tmp - 1;
    memcpy(tmp, p->s + start, n); tmp[n] = '\0';
    jval *v = jnew(JV_NUM);
    v->num = strtod(tmp, NULL);
    return v;
}

static jval *jparse_array(jparser *p) {
    p->i++; /* [ */
    jval *v = jnew(JV_ARR);
    jskip_ws(p);
    if (p->i < p->len && p->s[p->i] == ']') { p->i++; return v; }
    for (;;) {
        jval *item = jparse_value(p);
        if (!item) { jfree(v); return NULL; }
        v->items = (jval **)realloc(v->items, (v->n + 1) * sizeof(jval *));
        v->items[v->n++] = item;
        jskip_ws(p);
        if (p->i < p->len && p->s[p->i] == ',') { p->i++; continue; }
        if (p->i < p->len && p->s[p->i] == ']') { p->i++; break; }
        jfree(v); return NULL;
    }
    return v;
}

static jval *jparse_object(jparser *p) {
    p->i++; /* { */
    jval *v = jnew(JV_OBJ);
    jskip_ws(p);
    if (p->i < p->len && p->s[p->i] == '}') { p->i++; return v; }
    for (;;) {
        jskip_ws(p);
        char *key = jparse_string_raw(p);
        if (!key) { jfree(v); return NULL; }
        jskip_ws(p);
        if (p->i >= p->len || p->s[p->i] != ':') { free(key); jfree(v); return NULL; }
        p->i++;
        jval *val = jparse_value(p);
        if (!val) { free(key); jfree(v); return NULL; }
        v->items = (jval **)realloc(v->items, (v->n + 1) * sizeof(jval *));
        v->keys  = (char **)realloc(v->keys,  (v->n + 1) * sizeof(char *));
        v->keys[v->n] = key;
        v->items[v->n] = val;
        v->n++;
        jskip_ws(p);
        if (p->i < p->len && p->s[p->i] == ',') { p->i++; continue; }
        if (p->i < p->len && p->s[p->i] == '}') { p->i++; break; }
        jfree(v); return NULL;
    }
    return v;
}

static jval *jparse_value(jparser *p) {
    jskip_ws(p);
    if (p->i >= p->len) return NULL;
    char c = p->s[p->i];
    switch (c) {
        case '{': return jparse_object(p);
        case '[': return jparse_array(p);
        case '"': return jparse_string(p);
        case 't':
            if (p->i + 4 <= p->len && !memcmp(p->s + p->i, "true", 4)) {
                p->i += 4; jval *v = jnew(JV_BOOL); v->b = 1; return v;
            }
            return NULL;
        case 'f':
            if (p->i + 5 <= p->len && !memcmp(p->s + p->i, "false", 5)) {
                p->i += 5; jval *v = jnew(JV_BOOL); v->b = 0; return v;
            }
            return NULL;
        case 'n':
            if (p->i + 4 <= p->len && !memcmp(p->s + p->i, "null", 4)) {
                p->i += 4; return jnew(JV_NULL);
            }
            return NULL;
        default: return jparse_number(p);
    }
}

static jval *json_parse(const char *s, size_t len) {
    jparser p = { s, 0, len };
    jval *v = jparse_value(&p);
    return v;
}

static jval *jobj_get(const jval *o, const char *key) {
    if (!o || o->type != JV_OBJ) return NULL;
    for (size_t i = 0; i < o->n; i++)
        if (strcmp(o->keys[i], key) == 0) return o->items[i];
    return NULL;
}

/* Coerce a value to a newly-allocated string (numbers -> integer text). */
static char *jval_dup_str(const jval *v) {
    if (!v) return NULL;
    if (v->type == JV_STR) return strdup(v->str);
    if (v->type == JV_NUM) {
        char tmp[64];
        if (v->num == (double)(long long)v->num)
            snprintf(tmp, sizeof tmp, "%lld", (long long)v->num);
        else
            snprintf(tmp, sizeof tmp, "%g", v->num);
        return strdup(tmp);
    }
    return NULL;
}

static int jval_int(const jval *v, int dflt) {
    if (!v) return dflt;
    if (v->type == JV_NUM) return (int)v->num;
    if (v->type == JV_STR) return atoi(v->str);
    return dflt;
}

/* ====================================================================== */
/* JSON output helpers                                                    */
/* ====================================================================== */
static void json_escape(buf_t *b, const char *s) {
    buf_putc(b, '"');
    for (; s && *s; s++) {
        unsigned char c = (unsigned char)*s;
        switch (c) {
            case '"':  buf_puts(b, "\\\""); break;
            case '\\': buf_puts(b, "\\\\"); break;
            case '\b': buf_puts(b, "\\b");  break;
            case '\f': buf_puts(b, "\\f");  break;
            case '\n': buf_puts(b, "\\n");  break;
            case '\r': buf_puts(b, "\\r");  break;
            case '\t': buf_puts(b, "\\t");  break;
            default:
                if (c < 0x20) {
                    char u[8]; snprintf(u, sizeof u, "\\u%04x", c); buf_puts(b, u);
                } else {
                    buf_putc(b, (char)c);
                }
        }
    }
    buf_putc(b, '"');
}

/* ====================================================================== */
/* WebSocket transport (RFC 6455, server side, single client)             */
/* ====================================================================== */
static int read_n(int fd, void *buf, size_t n) {
    size_t got = 0;
    while (got < n) {
        ssize_t r = recv(fd, (char *)buf + got, n - got, 0);
        if (r == 0) return 0;                 /* peer closed */
        if (r < 0) { if (errno == EINTR) continue; return -1; }
        got += (size_t)r;
    }
    return 1;
}

static int write_n(int fd, const void *buf, size_t n) {
    size_t sent = 0;
    while (sent < n) {
        ssize_t r = send(fd, (const char *)buf + sent, n - sent, MSG_NOSIGNAL);
        if (r < 0) { if (errno == EINTR) continue; return -1; }
        sent += (size_t)r;
    }
    return 1;
}

/* Read the HTTP upgrade request, reply with 101. Returns 0 on success. */
static int ws_handshake(int fd) {
    buf_t req; buf_init(&req);
    char c;
    for (;;) {
        int r = read_n(fd, &c, 1);
        if (r <= 0) { buf_free(&req); return -1; }
        buf_putc(&req, c);
        if (req.len >= 4 && memcmp(req.p + req.len - 4, "\r\n\r\n", 4) == 0) break;
        if (req.len > 16384) { buf_free(&req); return -1; }
    }

    /* Find Sec-WebSocket-Key (header name is case-insensitive). */
    char key[256] = {0};
    const char *needle = "sec-websocket-key:";
    char *low = (char *)malloc(req.len + 1);
    for (size_t i = 0; i < req.len; i++) low[i] = (char)tolower((unsigned char)req.p[i]);
    low[req.len] = '\0';
    char *h = strstr(low, needle);
    int ok = 0;
    if (h) {
        size_t off = (size_t)(h - low) + strlen(needle);
        while (off < req.len && (req.p[off] == ' ' || req.p[off] == '\t')) off++;
        size_t k = 0;
        while (off < req.len && req.p[off] != '\r' && req.p[off] != '\n' &&
               k < sizeof(key) - 1)
            key[k++] = req.p[off++];
        key[k] = '\0';
        ok = k > 0;
    }
    free(low);
    buf_free(&req);
    if (!ok) return -1;

    char *accept = ws_accept_key(key);
    if (!accept) return -1;
    char resp[512];
    int n = snprintf(resp, sizeof resp,
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: %s\r\n\r\n", accept);
    free(accept);
    return write_n(fd, resp, (size_t)n) == 1 ? 0 : -1;
}

/* Send one text frame (server->client frames are never masked). */
static int ws_send_frame(int fd, uint8_t opcode, const void *payload, size_t len) {
    uint8_t hdr[10];
    size_t hn = 0;
    hdr[hn++] = (uint8_t)(0x80 | opcode);   /* FIN + opcode */
    if (len < 126) {
        hdr[hn++] = (uint8_t)len;
    } else if (len <= 0xFFFF) {
        hdr[hn++] = 126;
        hdr[hn++] = (uint8_t)(len >> 8);
        hdr[hn++] = (uint8_t)(len);
    } else {
        hdr[hn++] = 127;
        for (int i = 7; i >= 0; i--) hdr[hn++] = (uint8_t)((uint64_t)len >> (8 * i));
    }
    if (write_n(fd, hdr, hn) != 1) return -1;
    if (len && write_n(fd, payload, len) != 1) return -1;
    return 0;
}

/* Read a full (possibly fragmented) text message into *out.
 * Returns: 1 text message, 0 connection closed, -1 error. Handles ping/close. */
static int ws_read_message(int fd, buf_t *out) {
    out->len = 0;
    for (;;) {
        uint8_t h[2];
        int r = read_n(fd, h, 2);
        if (r <= 0) return r == 0 ? 0 : -1;

        int fin = h[0] & 0x80;
        int opcode = h[0] & 0x0F;
        int masked = h[1] & 0x80;
        uint64_t len = h[1] & 0x7F;

        if (len == 126) {
            uint8_t e[2];
            if (read_n(fd, e, 2) <= 0) return -1;
            len = ((uint64_t)e[0] << 8) | e[1];
        } else if (len == 127) {
            uint8_t e[8];
            if (read_n(fd, e, 8) <= 0) return -1;
            len = 0;
            for (int i = 0; i < 8; i++) len = (len << 8) | e[i];
        }
        if (len > MAX_MESSAGE_BYTES) return -1;

        uint8_t mask[4] = {0};
        if (masked && read_n(fd, mask, 4) <= 0) return -1;

        uint8_t *payload = NULL;
        if (len) {
            payload = (uint8_t *)malloc(len);
            if (!payload) return -1;
            if (read_n(fd, payload, len) <= 0) { free(payload); return -1; }
            if (masked)
                for (uint64_t i = 0; i < len; i++) payload[i] ^= mask[i & 3];
        }

        if (opcode == 0x8) {                       /* close */
            ws_send_frame(fd, 0x8, payload, len);
            free(payload);
            return 0;
        } else if (opcode == 0x9) {                /* ping -> pong */
            ws_send_frame(fd, 0xA, payload, len);
            free(payload);
            continue;
        } else if (opcode == 0xA) {                /* pong */
            free(payload);
            continue;
        } else if (opcode == 0x1 || opcode == 0x0) { /* text / continuation */
            if (payload) { buf_add(out, payload, len); free(payload); }
            if (fin) return 1;
            continue;
        } else {                                   /* unexpected opcode */
            free(payload);
            continue;
        }
    }
}

/* ====================================================================== */
/* Shared state + event senders                                           */
/* ====================================================================== */
static int             g_fd = -1;          /* current client socket */
static pthread_mutex_t g_send_lock = PTHREAD_MUTEX_INITIALIZER;

static volatile sig_atomic_t g_cancel = 0; /* asks the running op to stop */
static pthread_t g_worker;
static int       g_worker_active = 0;

/* Loaded enrollment templates (raw ANSI-378 FMD bytes + owner id). */
typedef struct { char *emp; uint8_t *fmd; unsigned int size; } enrolled_t;
static enrolled_t *g_enr = NULL;
static size_t      g_enr_n = 0;

static void ws_send(const char *json, size_t len) {
    pthread_mutex_lock(&g_send_lock);
    if (g_fd >= 0) ws_send_frame(g_fd, 0x1, json, len);
    pthread_mutex_unlock(&g_send_lock);
}
static void ws_send_str(const char *json) { ws_send(json, strlen(json)); }

/* -- hw_* forward decls (implemented in the SDK section at the bottom) -- */
static int          hw_present(void);
static const char  *hw_reader_id(void);
static int          hw_match_threshold(void);

typedef enum { HW_OK = 0, HW_MORE, HW_TIMEOUT, HW_LOWQ, HW_ERR } hw_rc;
static hw_rc hw_capture_once(uint8_t *fmd, unsigned int *fmd_size);
static const char *hw_last_error(void);
static hw_rc hw_enroll_start(void);
static hw_rc hw_enroll_add(const uint8_t *fmd, unsigned int size);
static hw_rc hw_enroll_finish(uint8_t *out, unsigned int *out_size);
static void  hw_enroll_abort(void);
static hw_rc hw_compare(const uint8_t *a, unsigned int an,
                        const uint8_t *b, unsigned int bn, unsigned int *score);

static void send_status(void) {
    buf_t b; buf_init(&b);
    buf_puts(&b, "{\"type\":\"status\",\"ready\":");
    buf_puts(&b, hw_present() ? "true" : "false");
    buf_puts(&b, ",\"reader\":");
    if (hw_present()) json_escape(&b, hw_reader_id());
    else buf_puts(&b, "null");
    char tail[32];
    snprintf(tail, sizeof tail, ",\"loaded\":%zu}", g_enr_n);
    buf_puts(&b, tail);
    ws_send(b.p, b.len);
    buf_free(&b);
}

static void send_error(const char *msg) {
    buf_t b; buf_init(&b);
    buf_puts(&b, "{\"type\":\"error\",\"message\":");
    json_escape(&b, msg);
    buf_putc(&b, '}');
    ws_send(b.p, b.len);
    buf_free(&b);
}

static void send_capture(const char *quality) {
    buf_t b; buf_init(&b);
    buf_puts(&b, "{\"type\":\"capture\",\"quality\":");
    json_escape(&b, quality);
    buf_putc(&b, '}');
    ws_send(b.p, b.len);
    buf_free(&b);
}

static void send_enroll_progress(int captured, int needed) {
    char tmp[96];
    snprintf(tmp, sizeof tmp,
        "{\"type\":\"enrollProgress\",\"captured\":%d,\"needed\":%d}",
        captured, needed);
    ws_send_str(tmp);
}

static void send_enroll_complete(const char *emp, int finger, const char *b64fmd) {
    buf_t b; buf_init(&b);
    buf_puts(&b, "{\"type\":\"enrollComplete\",\"employeeId\":");
    json_escape(&b, emp ? emp : "");
    char mid[48];
    snprintf(mid, sizeof mid, ",\"fingerIndex\":%d,\"fmd\":", finger);
    buf_puts(&b, mid);
    json_escape(&b, b64fmd);
    buf_puts(&b, ",\"quality\":100}");
    ws_send(b.p, b.len);
    buf_free(&b);
}

static void send_identify(int matched, const char *emp, unsigned int score) {
    buf_t b; buf_init(&b);
    buf_puts(&b, "{\"type\":\"identify\",\"matched\":");
    buf_puts(&b, matched ? "true" : "false");
    buf_puts(&b, ",\"employeeId\":");
    if (matched && emp) json_escape(&b, emp);
    else buf_puts(&b, "null");
    char tail[48];
    snprintf(tail, sizeof tail, ",\"score\":%u}", score);
    buf_puts(&b, tail);
    ws_send(b.p, b.len);
    buf_free(&b);
}

/* ====================================================================== */
/* Capture / identify / enroll (protocol-level, SDK-agnostic)             */
/* ====================================================================== */
/* Wait for one good fingerprint. Emits "capture" events. Returns HW_OK
 * (fmd filled), HW_TIMEOUT (canceled), or HW_ERR (already reported). */
static hw_rc capture_fmd(uint8_t *fmd, unsigned int *fmd_size) {
    while (!g_cancel) {
        unsigned int cap = DPFJ_MAX_FMD_SIZE;
        hw_rc r = hw_capture_once(fmd, &cap);
        if (g_cancel) return HW_TIMEOUT;
        switch (r) {
            case HW_OK:      *fmd_size = cap; send_capture("good"); return HW_OK;
            case HW_TIMEOUT: continue;                    /* no finger yet */
            case HW_LOWQ:    send_capture("low"); continue;
            case HW_ERR:     send_error(hw_last_error()); return HW_ERR;
            default:         continue;
        }
    }
    return HW_TIMEOUT;
}

static void *identify_worker(void *arg) {
    (void)arg;
    uint8_t probe[DPFJ_MAX_FMD_SIZE];
    unsigned int psz = 0;
    if (capture_fmd(probe, &psz) != HW_OK) return NULL;   /* canceled/errored */

    if (g_enr_n == 0) { send_identify(0, NULL, 0); return NULL; }

    unsigned int best = 0xFFFFFFFFu;
    long best_idx = -1;
    for (size_t i = 0; i < g_enr_n; i++) {
        unsigned int score = 0xFFFFFFFFu;
        if (hw_compare(probe, psz, g_enr[i].fmd, g_enr[i].size, &score) != HW_OK)
            continue;
        if (score < best) { best = score; best_idx = (long)i; }
    }
    if (g_cancel) return NULL;

    int matched = best_idx >= 0 && (int)best < hw_match_threshold();
    send_identify(matched,
                  matched ? g_enr[best_idx].emp : NULL,
                  best_idx >= 0 ? best : 0);
    return NULL;
}

typedef struct { char *emp; int finger; } enroll_arg;

static void *enroll_worker(void *argp) {
    enroll_arg *a = (enroll_arg *)argp;

    hw_enroll_abort();                 /* reset any half-finished enrollment */
    if (hw_enroll_start() != HW_OK) {
        send_error("Enrollment failed — please try again.");
        goto done;
    }

    int enough = 0;
    for (int i = 0; i < ENROLL_SCANS; i++) {
        uint8_t fmd[DPFJ_MAX_FMD_SIZE];
        unsigned int sz = 0;
        if (capture_fmd(fmd, &sz) != HW_OK) { hw_enroll_abort(); goto done; }
        if (!enough) {
            hw_rc r = hw_enroll_add(fmd, sz);
            if (r == HW_ERR) {
                send_error("Enrollment failed — please try again.");
                hw_enroll_abort(); goto done;
            }
            if (r == HW_OK) enough = 1;      /* SDK has enough samples */
        }
        send_enroll_progress(i + 1, ENROLL_SCANS);
    }

    uint8_t out[DPFJ_MAX_FMD_SIZE];
    unsigned int outsz = sizeof out;
    if (hw_enroll_finish(out, &outsz) != HW_OK) {
        send_error("Enrollment failed — please try again.");
        hw_enroll_abort(); goto done;
    }
    if (g_cancel) goto done;

    char *b64 = b64_encode(out, outsz);
    if (b64) { send_enroll_complete(a->emp, a->finger, b64); free(b64); }

done:
    free(a->emp);
    free(a);
    return NULL;
}

/* ====================================================================== */
/* Op lifecycle                                                           */
/* ====================================================================== */
static void stop_op(void) {
    if (g_worker_active) {
        g_cancel = 1;
        pthread_join(g_worker, NULL);
        g_worker_active = 0;
    }
    g_cancel = 0;
}

static void start_identify(void) {
    stop_op();
    if (pthread_create(&g_worker, NULL, identify_worker, NULL) == 0)
        g_worker_active = 1;
}

static void start_enroll(char *emp, int finger) {
    stop_op();
    enroll_arg *a = (enroll_arg *)malloc(sizeof *a);
    a->emp = emp;             /* takes ownership */
    a->finger = finger;
    if (pthread_create(&g_worker, NULL, enroll_worker, a) == 0) {
        g_worker_active = 1;
    } else {
        free(a->emp); free(a);
    }
}

/* ====================================================================== */
/* load: rebuild the in-memory FMD list from base64 templates             */
/* ====================================================================== */
static void free_templates(void) {
    for (size_t i = 0; i < g_enr_n; i++) { free(g_enr[i].emp); free(g_enr[i].fmd); }
    free(g_enr);
    g_enr = NULL; g_enr_n = 0;
}

static void load_templates(const jval *msg) {
    free_templates();
    const jval *arr = jobj_get(msg, "templates");
    if (!arr || arr->type != JV_ARR) return;

    g_enr = (enrolled_t *)calloc(arr->n, sizeof(enrolled_t));
    for (size_t i = 0; i < arr->n; i++) {
        const jval *t = arr->items[i];
        if (t->type != JV_OBJ) continue;
        const jval *jemp = jobj_get(t, "employeeId");
        const jval *jfmd = jobj_get(t, "fmd");
        if (!jemp || !jfmd || jfmd->type != JV_STR) continue;

        size_t raw_len = 0;
        uint8_t *raw = b64_decode(jfmd->str, strlen(jfmd->str), &raw_len);
        if (!raw || raw_len == 0) { free(raw); continue; }

        g_enr[g_enr_n].emp  = jval_dup_str(jemp);
        g_enr[g_enr_n].fmd  = raw;
        g_enr[g_enr_n].size = (unsigned int)raw_len;
        g_enr_n++;
    }
}

/* ====================================================================== */
/* Dispatch                                                               */
/* ====================================================================== */
static void handle_message(const char *text, size_t len) {
    jval *msg = json_parse(text, len);
    if (!msg || msg->type != JV_OBJ) { jfree(msg); return; }

    const jval *cmd = jobj_get(msg, "cmd");
    if (!cmd || cmd->type != JV_STR) { jfree(msg); return; }
    const char *c = cmd->str;

    if (strcmp(c, "status") == 0) {
        send_status();
    } else if (strcmp(c, "load") == 0) {
        stop_op();
        load_templates(msg);
        send_status();
    } else if (strcmp(c, "cancel") == 0) {
        stop_op();
        ws_send_str("{\"type\":\"canceled\"}");
    } else if (strcmp(c, "identify") == 0) {
        if (!hw_present()) send_error("No reader connected.");
        else start_identify();
    } else if (strcmp(c, "enroll") == 0) {
        if (!hw_present()) { send_error("No reader connected."); }
        else {
            char *emp = jval_dup_str(jobj_get(msg, "employeeId"));
            int finger = jval_int(jobj_get(msg, "fingerIndex"), 0);
            if (!emp) emp = strdup("");
            start_enroll(emp, finger);
        }
    }
    jfree(msg);
}

/* ====================================================================== */
/* Server                                                                 */
/* ====================================================================== */
static int serve(void) {
    int srv = socket(AF_INET, SOCK_STREAM, 0);
    if (srv < 0) { perror("socket"); return 1; }
    int yes = 1;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof addr);
    addr.sin_family = AF_INET;
    addr.sin_port = htons(BIND_PORT);
    addr.sin_addr.s_addr = inet_addr(BIND_ADDR);
    if (bind(srv, (struct sockaddr *)&addr, sizeof addr) < 0) {
        perror("bind"); close(srv); return 1;
    }
    if (listen(srv, 4) < 0) { perror("listen"); close(srv); return 1; }

    printf("fpbridge listening on ws://%s:%d/ (reader: %s)\n",
           BIND_ADDR, BIND_PORT, hw_present() ? hw_reader_id() : "none");
    fflush(stdout);

    for (;;) {
        int fd = accept(srv, NULL, NULL);
        if (fd < 0) { if (errno == EINTR) continue; break; }

        if (ws_handshake(fd) != 0) { close(fd); continue; }

        pthread_mutex_lock(&g_send_lock);
        g_fd = fd;
        pthread_mutex_unlock(&g_send_lock);

        buf_t msg; buf_init(&msg);
        for (;;) {
            int r = ws_read_message(fd, &msg);
            if (r <= 0) break;
            handle_message(msg.p ? msg.p : "", msg.len);
        }
        buf_free(&msg);

        stop_op();
        pthread_mutex_lock(&g_send_lock);
        g_fd = -1;
        pthread_mutex_unlock(&g_send_lock);
        close(fd);
    }
    close(srv);
    return 0;
}

/* ====================================================================== */
/* Self-test (no reader, no SDK required): transport correctness          */
/* ====================================================================== */
static int hexeq(const uint8_t *d, const char *hex) {
    char got[64] = {0};
    for (int i = 0; i < 20; i++) sprintf(got + i * 2, "%02x", d[i]);
    return strcmp(got, hex) == 0;
}

static int selftest(void) {
    int fails = 0;
    #define CHECK(cond, name) do { \
        if (cond) printf("  ok   %s\n", name); \
        else { printf("  FAIL %s\n", name); fails++; } \
    } while (0)

    printf("fpbridge self-test\n");

    /* SHA-1 known-answer */
    uint8_t d[20];
    sha1((const uint8_t *)"abc", 3, d);
    CHECK(hexeq(d, "a9993e364706816aba3e25717850c26c9cd0d89d"), "sha1(\"abc\")");
    sha1((const uint8_t *)"", 0, d);
    CHECK(hexeq(d, "da39a3ee5e6b4b0d3255bfef95601890afd80709"), "sha1(\"\")");

    /* base64 encode + decode round-trip */
    char *e = b64_encode((const uint8_t *)"Man", 3);
    CHECK(e && strcmp(e, "TWFu") == 0, "b64_encode(\"Man\")");
    free(e);
    e = b64_encode((const uint8_t *)"M", 1);
    CHECK(e && strcmp(e, "TQ==") == 0, "b64_encode(\"M\")");
    free(e);
    {
        const char *src = "hello, fingerprint\x01\x02\xff";
        char *enc = b64_encode((const uint8_t *)src, strlen(src));
        size_t dl = 0;
        uint8_t *dec = b64_decode(enc, strlen(enc), &dl);
        CHECK(dec && dl == strlen(src) && memcmp(dec, src, dl) == 0, "b64 round-trip");
        free(enc); free(dec);
    }

    /* WebSocket accept — the canonical RFC 6455 example */
    {
        char *acc = ws_accept_key("dGhlIHNhbXBsZSBub25jZQ==");
        CHECK(acc && strcmp(acc, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=") == 0,
              "ws accept (RFC 6455 example)");
        free(acc);
    }

    /* JSON parse of a realistic load message */
    {
        const char *j =
          "{\"cmd\":\"load\",\"templates\":["
          "{\"employeeId\":\"E1\",\"fingerIndex\":0,\"fmd\":\"QUJD\"},"
          "{\"employeeId\":42,\"fingerIndex\":1,\"fmd\":\"REVG\"}]}";
        jval *v = json_parse(j, strlen(j));
        const jval *cmd = jobj_get(v, "cmd");
        const jval *arr = jobj_get(v, "templates");
        CHECK(cmd && cmd->type == JV_STR && strcmp(cmd->str, "load") == 0, "json cmd");
        CHECK(arr && arr->type == JV_ARR && arr->n == 2, "json templates[2]");
        char *e0 = jval_dup_str(jobj_get(arr->items[0], "employeeId"));
        char *e1 = jval_dup_str(jobj_get(arr->items[1], "employeeId"));
        CHECK(e0 && strcmp(e0, "E1") == 0, "json string id");
        CHECK(e1 && strcmp(e1, "42") == 0, "json numeric id -> string");
        CHECK(jval_int(jobj_get(arr->items[1], "fingerIndex"), -1) == 1, "json fingerIndex");
        const jval *f = jobj_get(arr->items[0], "fmd");
        size_t dl = 0; uint8_t *raw = b64_decode(f->str, strlen(f->str), &dl);
        CHECK(raw && dl == 3 && memcmp(raw, "ABC", 3) == 0, "json fmd base64 decode");
        free(e0); free(e1); free(raw); jfree(v);
    }

    /* JSON with escapes must not crash and must round-trip the value */
    {
        const char *j = "{\"cmd\":\"enroll\",\"employeeId\":\"a\\\"b\\n\"}";
        jval *v = json_parse(j, strlen(j));
        char *emp = jval_dup_str(jobj_get(v, "employeeId"));
        CHECK(emp && strcmp(emp, "a\"b\n") == 0, "json string escapes");
        free(emp); jfree(v);
    }

    printf("%s (%d failure%s)\n", fails ? "SELF-TEST FAILED" : "SELF-TEST PASSED",
           fails, fails == 1 ? "" : "s");
    #undef CHECK
    return fails ? 1 : 0;
}

/* ====================================================================== */
/* main                                                                   */
/* ====================================================================== */
static void hw_init(void);
static void hw_shutdown(void);

int main(int argc, char **argv) {
    signal(SIGPIPE, SIG_IGN);

    if (argc > 1 && strcmp(argv[1], "--selftest") == 0)
        return selftest();

    hw_init();
    int rc = serve();
    hw_shutdown();
    return rc;
}

/* ====================================================================== */
/* ====================================================================== */
/*  SDK-COUPLED SECTION — the only code that touches the reader.          */
/*  Compiled out by -DFPBRIDGE_NO_SDK (dev/test builds report no reader). */
/* ====================================================================== */
/* ====================================================================== */

#ifdef FPBRIDGE_NO_SDK

/* -- Stubs: behave like a box with no reader attached. ----------------- */
static int         hw_present(void)          { return 0; }
static const char *hw_reader_id(void)        { return "none"; }
static int         hw_match_threshold(void)  { return 0; }
static const char *hw_last_error(void)       { return "no SDK in this build"; }
static void        hw_init(void)             {}
static void        hw_shutdown(void)         {}
static hw_rc hw_capture_once(uint8_t *f, unsigned int *n) { (void)f; (void)n; return HW_ERR; }
static hw_rc hw_enroll_start(void)                        { return HW_ERR; }
static hw_rc hw_enroll_add(const uint8_t *f, unsigned int n) { (void)f; (void)n; return HW_ERR; }
static hw_rc hw_enroll_finish(uint8_t *o, unsigned int *n)   { (void)o; (void)n; return HW_ERR; }
static void  hw_enroll_abort(void)                       {}
static hw_rc hw_compare(const uint8_t *a, unsigned int an,
                        const uint8_t *b, unsigned int bn, unsigned int *s) {
    (void)a; (void)an; (void)b; (void)bn; (void)s; return HW_ERR;
}

#else  /* ---- real DigitalPersona U.are.U SDK (dpfpdd + dpfj) ---------- */

/* ---- CONFIG: formats + symbol names. Adjust here if the installed SDK
 *      headers spell these differently (see README "SDK differences"). --- */
#define IMG_FMT   DPFPDD_IMG_FMT_ANSI381        /* captured image / FID form */
#define FID_FMT   DPFJ_FID_ANSI_381_2004
#define FMD_FMT   DPFJ_FMD_ANSI_378_2004
#define IMG_PROC  DPFPDD_IMG_PROC_DEFAULT
#define CAPTURE_RES 500                          /* dpi */

static DPFPDD_DEV g_dev = NULL;
static int   g_present = 0;
static char  g_reader_id[128] = "none";
static char  g_err[256] = "";
static uint8_t *g_img = NULL;                    /* reusable capture buffer */

static const char *hw_last_error(void) { return g_err[0] ? g_err : "reader error"; }
static int         hw_present(void)    { return g_present; }
static const char *hw_reader_id(void)  { return g_reader_id; }

/* Score is dissimilarity; FAR = score / PROBABILITY_ONE. Match at FAR 1e-5,
 * exactly as the Windows helper's Constants.PROBABILITY_ONE / 100000. */
static int hw_match_threshold(void) { return (int)(DPFJ_PROBABILITY_ONE / 100000); }

static void hw_init(void) {
    g_img = (uint8_t *)malloc(IMAGE_BUF_BYTES);

    if (dpfpdd_init() != DPFPDD_SUCCESS) {
        snprintf(g_err, sizeof g_err, "dpfpdd_init failed");
        return;
    }

    /* Two-call device query: first for the count, then to fill. */
    unsigned int cnt = 0;
    dpfpdd_query_devices(&cnt, NULL);            /* returns count via cnt */
    if (cnt == 0) return;

    DPFPDD_DEV_INFO *infos = (DPFPDD_DEV_INFO *)calloc(cnt, sizeof(DPFPDD_DEV_INFO));
    for (unsigned int i = 0; i < cnt; i++) infos[i].size = sizeof(DPFPDD_DEV_INFO);
    if (dpfpdd_query_devices(&cnt, infos) != DPFPDD_SUCCESS || cnt == 0) {
        free(infos); return;
    }

    /* Open the first reader. Cooperative priority lets other apps share it. */
    int rc = dpfpdd_open_ext(infos[0].name, DPFPDD_PRIORITY_COOPERATIVE, &g_dev);
    if (rc != DPFPDD_SUCCESS) rc = dpfpdd_open(infos[0].name, &g_dev);
    if (rc == DPFPDD_SUCCESS) {
        g_present = 1;
        snprintf(g_reader_id, sizeof g_reader_id, "%s", infos[0].name);
    } else {
        snprintf(g_err, sizeof g_err, "dpfpdd_open failed (rc=%d)", rc);
    }
    free(infos);
}

static void hw_shutdown(void) {
    if (g_dev) { dpfpdd_close(g_dev); g_dev = NULL; }
    dpfpdd_exit();
    free(g_img); g_img = NULL;
}

/* One capture attempt (bounded by CAPTURE_POLL_MS). On a good scan, extract
 * and return the ANSI-378 FMD. */
static hw_rc hw_capture_once(uint8_t *fmd, unsigned int *fmd_size) {
    if (!g_dev) { snprintf(g_err, sizeof g_err, "no reader"); return HW_ERR; }

    DPFPDD_CAPTURE_PARAM cp;
    memset(&cp, 0, sizeof cp);
    cp.size = sizeof cp;
    cp.image_fmt = IMG_FMT;
    cp.image_proc = IMG_PROC;
    cp.image_res = CAPTURE_RES;

    DPFPDD_CAPTURE_RESULT cr;
    memset(&cr, 0, sizeof cr);
    cr.size = sizeof cr;
    cr.info.size = sizeof cr.info;

    unsigned int img_size = IMAGE_BUF_BYTES;
    int rc = dpfpdd_capture(g_dev, &cp, CAPTURE_POLL_MS, &cr, &img_size, g_img);
    if (rc != DPFPDD_SUCCESS) {
        /* Some SDK builds surface "no finger before timeout" as a return code
         * rather than via quality; treat the timeout code as a plain wait. */
#ifdef DPFPDD_E_TIMEDOUT
        if (rc == DPFPDD_E_TIMEDOUT) return HW_TIMEOUT;
#endif
        snprintf(g_err, sizeof g_err, "capture failed (rc=%d)", rc);
        return HW_ERR;
    }

    switch (cr.quality) {
        case DPFPDD_QUALITY_GOOD: break;
        case DPFPDD_QUALITY_TIMED_OUT: return HW_TIMEOUT;
        case DPFPDD_QUALITY_CANCELED:  return HW_TIMEOUT;
        default: return HW_LOWQ;                 /* ask for a cleaner scan */
    }

    unsigned int fsz = *fmd_size;                /* capacity in, length out */
    rc = dpfj_create_fmd_from_fid(FID_FMT, g_img, img_size, FMD_FMT, fmd, &fsz);
    if (rc != DPFJ_SUCCESS) return HW_LOWQ;      /* couldn't read it; retry */
    *fmd_size = fsz;
    return HW_OK;
}

/* -- Enrollment: start -> add N -> create -> finish. ------------------- */
static hw_rc hw_enroll_start(void) {
    return dpfj_start_enrollment(FMD_FMT) == DPFJ_SUCCESS ? HW_OK : HW_ERR;
}

static hw_rc hw_enroll_add(const uint8_t *fmd, unsigned int size) {
    int rc = dpfj_add_to_enrollment(FMD_FMT, (unsigned char *)fmd, size, 0);
    if (rc == DPFJ_SUCCESS) return HW_OK;        /* enough samples collected */
#ifdef DPFJ_E_MORE_DATA
    if (rc == DPFJ_E_MORE_DATA) return HW_MORE;  /* needs more presses */
#endif
    return HW_MORE;                              /* be lenient; keep capturing */
}

static hw_rc hw_enroll_finish(uint8_t *out, unsigned int *out_size) {
    int rc = dpfj_create_enrollment_fmd(out, out_size);
    dpfj_finish_enrollment();                    /* always reset state */
    return rc == DPFJ_SUCCESS ? HW_OK : HW_ERR;
}

static void hw_enroll_abort(void) { dpfj_finish_enrollment(); }

/* -- 1:1 compare (identify loops this over the loaded templates). ------ */
static hw_rc hw_compare(const uint8_t *a, unsigned int an,
                        const uint8_t *b, unsigned int bn, unsigned int *score) {
    int rc = dpfj_compare(FMD_FMT, (unsigned char *)a, an, 0,
                          FMD_FMT, (unsigned char *)b, bn, 0, score);
    return rc == DPFJ_SUCCESS ? HW_OK : HW_ERR;
}

#endif /* FPBRIDGE_NO_SDK */
