package crypto

import (
	"bytes"
	"testing"
)

// ================================================================================
// ML-DSA-87 SIGNING TESTS
// ================================================================================

func TestGenerateSigningKeyPair(t *testing.T) {
	kp, err := GenerateSigningKeyPair()
	if err != nil {
		t.Fatalf("GenerateSigningKeyPair failed: %v", err)
	}

	// Check key sizes
	if len(kp.PublicKey) != SigningPublicKeySize {
		t.Errorf("Public key size: got %d, want %d", len(kp.PublicKey), SigningPublicKeySize)
	}

	if len(kp.PrivateKey) != SigningPrivateKeySize {
		t.Errorf("Private key size: got %d, want %d", len(kp.PrivateKey), SigningPrivateKeySize)
	}

	// Keys should not be all zeros
	allZeroPub := make([]byte, SigningPublicKeySize)
	allZeroPriv := make([]byte, SigningPrivateKeySize)

	if bytes.Equal(kp.PublicKey, allZeroPub) {
		t.Error("Public key should not be all zeros")
	}
	if bytes.Equal(kp.PrivateKey, allZeroPriv) {
		t.Error("Private key should not be all zeros")
	}
}

func TestSignVerify(t *testing.T) {
	kp, err := GenerateSigningKeyPair()
	if err != nil {
		t.Fatalf("GenerateSigningKeyPair failed: %v", err)
	}

	message := []byte("This is a test message to sign.")

	// Sign
	signature, err := Sign(kp.PrivateKey, message)
	if err != nil {
		t.Fatalf("Sign failed: %v", err)
	}

	// Check signature size
	if len(signature) != SignatureSize {
		t.Errorf("Signature size: got %d, want %d", len(signature), SignatureSize)
	}

	// Verify
	valid, err := Verify(kp.PublicKey, message, signature)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}

	if !valid {
		t.Error("Signature should be valid")
	}
}

func TestVerify_TamperedMessage(t *testing.T) {
	kp, _ := GenerateSigningKeyPair()
	message := []byte("Original message")

	signature, _ := Sign(kp.PrivateKey, message)

	// Tamper with message
	tamperedMessage := []byte("Tampered message")
	valid, err := Verify(kp.PublicKey, tamperedMessage, signature)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}

	if valid {
		t.Error("Signature should be invalid for tampered message")
	}
}

func TestVerify_TamperedSignature(t *testing.T) {
	kp, _ := GenerateSigningKeyPair()
	message := []byte("Test message")

	signature, _ := Sign(kp.PrivateKey, message)

	// Tamper with signature
	signature[0] ^= 0xFF

	valid, err := Verify(kp.PublicKey, message, signature)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}

	if valid {
		t.Error("Signature should be invalid when tampered")
	}
}

func TestVerify_WrongPublicKey(t *testing.T) {
	kp1, _ := GenerateSigningKeyPair()
	kp2, _ := GenerateSigningKeyPair()

	message := []byte("Test message")
	signature, _ := Sign(kp1.PrivateKey, message)

	// Verify with wrong public key
	valid, err := Verify(kp2.PublicKey, message, signature)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}

	if valid {
		t.Error("Signature should be invalid with wrong public key")
	}
}

func TestSign_InvalidPrivateKeySize(t *testing.T) {
	_, err := Sign([]byte("short key"), []byte("message"))
	if err == nil {
		t.Error("Expected error for invalid private key size")
	}
}

func TestVerify_InvalidPublicKeySize(t *testing.T) {
	signature := make([]byte, SignatureSize)
	_, err := Verify([]byte("short key"), []byte("message"), signature)
	if err == nil {
		t.Error("Expected error for invalid public key size")
	}
}

func TestVerify_InvalidSignatureSize(t *testing.T) {
	kp, _ := GenerateSigningKeyPair()
	_, err := Verify(kp.PublicKey, []byte("message"), []byte("short sig"))
	if err == nil {
		t.Error("Expected error for invalid signature size")
	}
}

func TestSign_EmptyMessage(t *testing.T) {
	kp, _ := GenerateSigningKeyPair()

	signature, err := Sign(kp.PrivateKey, []byte{})
	if err != nil {
		t.Fatalf("Sign empty message failed: %v", err)
	}

	valid, _ := Verify(kp.PublicKey, []byte{}, signature)
	if !valid {
		t.Error("Signature of empty message should be valid")
	}
}

func TestSign_LargeMessage(t *testing.T) {
	kp, _ := GenerateSigningKeyPair()

	// 1MB message
	message := make([]byte, 1024*1024)
	for i := range message {
		message[i] = byte(i % 256)
	}

	signature, err := Sign(kp.PrivateKey, message)
	if err != nil {
		t.Fatalf("Sign large message failed: %v", err)
	}

	valid, _ := Verify(kp.PublicKey, message, signature)
	if !valid {
		t.Error("Signature of large message should be valid")
	}
}

func TestSign_DeterministicOrNot(t *testing.T) {
	kp, _ := GenerateSigningKeyPair()
	message := []byte("Test message")

	sig1, _ := Sign(kp.PrivateKey, message)
	sig2, _ := Sign(kp.PrivateKey, message)

	// ML-DSA can be either deterministic or randomized
	// Both signatures should verify
	valid1, _ := Verify(kp.PublicKey, message, sig1)
	valid2, _ := Verify(kp.PublicKey, message, sig2)

	if !valid1 || !valid2 {
		t.Error("Both signatures should verify")
	}
}

// ================================================================================
// HASH DOCUMENT TESTS
// ================================================================================

func TestHashDocument(t *testing.T) {
	doc := []byte("Invoice #12345\nAmount: $1,000.00\nDate: 2024-01-15")

	hash := HashDocument(doc)

	if len(hash) != 32 {
		t.Errorf("Document hash should be 32 bytes, got %d", len(hash))
	}

	// Same document should produce same hash
	hash2 := HashDocument(doc)
	if !bytes.Equal(hash, hash2) {
		t.Error("Same document should produce same hash")
	}

	// Different document should produce different hash
	hash3 := HashDocument([]byte("Different document"))
	if bytes.Equal(hash, hash3) {
		t.Error("Different document should produce different hash")
	}
}

func TestSignHashVerifyHash(t *testing.T) {
	kp, _ := GenerateSigningKeyPair()
	document := []byte("Important document content")

	// Hash the document
	hash := HashDocument(document)

	// Sign the hash
	signature, err := SignHash(kp.PrivateKey, hash)
	if err != nil {
		t.Fatalf("SignHash failed: %v", err)
	}

	// Verify the hash
	valid, err := VerifyHash(kp.PublicKey, hash, signature)
	if err != nil {
		t.Fatalf("VerifyHash failed: %v", err)
	}

	if !valid {
		t.Error("Hash signature should be valid")
	}
}

func TestVerifyHash_TamperedDocument(t *testing.T) {
	kp, _ := GenerateSigningKeyPair()
	document := []byte("Original document")
	tamperedDocument := []byte("Tampered document")

	hash := HashDocument(document)
	signature, _ := SignHash(kp.PrivateKey, hash)

	// Verify with tampered document's hash
	tamperedHash := HashDocument(tamperedDocument)
	valid, _ := VerifyHash(kp.PublicKey, tamperedHash, signature)

	if valid {
		t.Error("Signature should be invalid for tampered document")
	}
}

// ================================================================================
// MULTIPLE KEY PAIRS TEST
// ================================================================================

func TestMultipleKeyPairs(t *testing.T) {
	// Generate multiple key pairs
	kps := make([]*SigningKeyPair, 5)
	for i := range kps {
		var err error
		kps[i], err = GenerateSigningKeyPair()
		if err != nil {
			t.Fatalf("Failed to generate key pair %d: %v", i, err)
		}
	}

	// All key pairs should be unique
	for i := 0; i < len(kps); i++ {
		for j := i + 1; j < len(kps); j++ {
			if bytes.Equal(kps[i].PublicKey, kps[j].PublicKey) {
				t.Errorf("Key pairs %d and %d have same public key", i, j)
			}
			if bytes.Equal(kps[i].PrivateKey, kps[j].PrivateKey) {
				t.Errorf("Key pairs %d and %d have same private key", i, j)
			}
		}
	}

	// Each key pair should work independently
	message := []byte("Test message")
	for i, kp := range kps {
		sig, err := Sign(kp.PrivateKey, message)
		if err != nil {
			t.Fatalf("Key pair %d sign failed: %v", i, err)
		}

		valid, err := Verify(kp.PublicKey, message, sig)
		if err != nil {
			t.Fatalf("Key pair %d verify failed: %v", i, err)
		}

		if !valid {
			t.Errorf("Key pair %d signature should be valid", i)
		}

		// Should not verify with other key pairs
		for j, otherKp := range kps {
			if i == j {
				continue
			}
			valid, _ := Verify(otherKp.PublicKey, message, sig)
			if valid {
				t.Errorf("Key pair %d signature should not verify with key pair %d", i, j)
			}
		}
	}
}

// ================================================================================
// BENCHMARKS
// ================================================================================

func BenchmarkGenerateSigningKeyPair(b *testing.B) {
	for i := 0; i < b.N; i++ {
		GenerateSigningKeyPair()
	}
}

func BenchmarkSign(b *testing.B) {
	kp, _ := GenerateSigningKeyPair()
	message := []byte("Benchmark message for signing")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Sign(kp.PrivateKey, message)
	}
}

func BenchmarkVerify(b *testing.B) {
	kp, _ := GenerateSigningKeyPair()
	message := []byte("Benchmark message for verification")
	signature, _ := Sign(kp.PrivateKey, message)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Verify(kp.PublicKey, message, signature)
	}
}

func BenchmarkHashDocument(b *testing.B) {
	document := make([]byte, 10*1024) // 10KB document

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		HashDocument(document)
	}
}
