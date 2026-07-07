package api

import (
	"github.com/cloudflare/circl/sign/mldsa/mldsa65"
)

// verifyMLDSA65 reports whether signature is a valid ML-DSA-65 (FIPS 204)
// signature of message under pubKey, using an EMPTY context.
//
// This matches the browser side (app/web/src/utils/crypto.js dsaSign, which
// calls @noble/post-quantum ml_dsa65.sign with the default empty context). Both
// libraries apply the identical FIPS 204 domain separation (0x00 || len(ctx) ||
// ctx || msg), so signatures interoperate. Any malformed input returns false
// rather than panicking.
func verifyMLDSA65(pubKey, message, signature []byte) bool {
	if len(pubKey) != mldsa65.PublicKeySize || len(signature) != mldsa65.SignatureSize {
		return false
	}
	pk := new(mldsa65.PublicKey)
	if err := pk.UnmarshalBinary(pubKey); err != nil {
		return false
	}
	return mldsa65.Verify(pk, message, nil, signature)
}
