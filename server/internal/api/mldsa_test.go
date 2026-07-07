package api

import (
	"crypto/rand"
	"testing"

	"github.com/cloudflare/circl/sign/mldsa/mldsa65"
)

// TestVerifyMLDSA65 exercises the server-side verifier the reset flow relies on:
// a valid signature over the challenge is accepted, and every tampering /
// wrong-key / malformed case is rejected (fails closed). The empty context here
// matches what the browser's @noble ml_dsa65.sign uses.
func TestVerifyMLDSA65(t *testing.T) {
	pub, priv, err := mldsa65.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	pubBytes, err := pub.MarshalBinary()
	if err != nil {
		t.Fatalf("marshal pub: %v", err)
	}

	challenge := make([]byte, 32)
	if _, err := rand.Read(challenge); err != nil {
		t.Fatalf("rand: %v", err)
	}

	sig := make([]byte, mldsa65.SignatureSize)
	if err := mldsa65.SignTo(priv, challenge, nil /*ctx*/, false, sig); err != nil {
		t.Fatalf("sign: %v", err)
	}

	if !verifyMLDSA65(pubBytes, challenge, sig) {
		t.Error("valid signature was rejected")
	}

	// Wrong message (a different challenge) must fail.
	other := make([]byte, 32)
	other[0] = challenge[0] ^ 0xff
	copy(other[1:], challenge[1:])
	if verifyMLDSA65(pubBytes, other, sig) {
		t.Error("signature verified against the wrong challenge")
	}

	// Tampered signature must fail.
	bad := make([]byte, len(sig))
	copy(bad, sig)
	bad[len(bad)/2] ^= 0x01
	if verifyMLDSA65(pubBytes, challenge, bad) {
		t.Error("tampered signature verified")
	}

	// Wrong public key must fail.
	pub2, _, _ := mldsa65.GenerateKey(rand.Reader)
	pub2Bytes, _ := pub2.MarshalBinary()
	if verifyMLDSA65(pub2Bytes, challenge, sig) {
		t.Error("signature verified under the wrong public key")
	}

	// Malformed inputs must fail closed, not panic.
	if verifyMLDSA65(nil, challenge, sig) {
		t.Error("nil public key accepted")
	}
	if verifyMLDSA65(pubBytes, challenge, sig[:10]) {
		t.Error("truncated signature accepted")
	}
	if verifyMLDSA65(pubBytes[:10], challenge, sig) {
		t.Error("truncated public key accepted")
	}
}
