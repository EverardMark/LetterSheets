package crypto

import (
	"bytes"
	"encoding/hex"
	"strings"
	"testing"
)

// ================================================================================
// AES-GCM ENCRYPTION TESTS
// ================================================================================

func TestEncryptDecryptAESGCM(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}

	plaintext := []byte("Hello, World! This is a test message.")

	// Encrypt
	ciphertext, err := EncryptAESGCM(key, plaintext)
	if err != nil {
		t.Fatalf("EncryptAESGCM failed: %v", err)
	}

	// Ciphertext should be longer than plaintext (nonce + tag)
	if len(ciphertext) <= len(plaintext) {
		t.Error("Ciphertext should be longer than plaintext")
	}

	// Decrypt
	decrypted, err := DecryptAESGCM(key, ciphertext)
	if err != nil {
		t.Fatalf("DecryptAESGCM failed: %v", err)
	}

	// Should match original
	if !bytes.Equal(decrypted, plaintext) {
		t.Errorf("Decrypted text doesn't match: got %q, want %q", decrypted, plaintext)
	}
}

func TestEncryptAESGCM_InvalidKeySize(t *testing.T) {
	shortKey := make([]byte, 16) // Should be 32
	_, err := EncryptAESGCM(shortKey, []byte("test"))
	if err == nil {
		t.Error("Expected error for invalid key size")
	}
}

func TestDecryptAESGCM_InvalidKey(t *testing.T) {
	key1 := make([]byte, 32)
	key2 := make([]byte, 32)
	key2[0] = 1 // Different key

	ciphertext, _ := EncryptAESGCM(key1, []byte("secret"))

	_, err := DecryptAESGCM(key2, ciphertext)
	if err == nil {
		t.Error("Expected error when decrypting with wrong key")
	}
}

func TestDecryptAESGCM_TamperedCiphertext(t *testing.T) {
	key := make([]byte, 32)
	ciphertext, _ := EncryptAESGCM(key, []byte("secret"))

	// Tamper with ciphertext
	ciphertext[len(ciphertext)-1] ^= 0xFF

	_, err := DecryptAESGCM(key, ciphertext)
	if err == nil {
		t.Error("Expected error for tampered ciphertext")
	}
}

func TestDecryptAESGCM_TooShort(t *testing.T) {
	key := make([]byte, 32)
	_, err := DecryptAESGCM(key, []byte("short"))
	if err == nil {
		t.Error("Expected error for ciphertext too short")
	}
}

func TestEncryptAESGCM_DifferentCiphertextEachTime(t *testing.T) {
	key := make([]byte, 32)
	plaintext := []byte("same message")

	ct1, _ := EncryptAESGCM(key, plaintext)
	ct2, _ := EncryptAESGCM(key, plaintext)

	if bytes.Equal(ct1, ct2) {
		t.Error("Same plaintext should produce different ciphertext (random nonce)")
	}
}

// ================================================================================
// KEY DERIVATION TESTS
// ================================================================================

func TestDeriveKeyFromPassword(t *testing.T) {
	password := "MySecurePassword123!"
	salt := []byte("random_salt_value_32bytes_long!!")

	key := DeriveKeyFromPassword(password, salt)

	if len(key) != 32 {
		t.Errorf("Derived key should be 32 bytes, got %d", len(key))
	}

	// Same password + salt should produce same key
	key2 := DeriveKeyFromPassword(password, salt)
	if !bytes.Equal(key, key2) {
		t.Error("Same password and salt should produce same key")
	}

	// Different password should produce different key
	key3 := DeriveKeyFromPassword("DifferentPassword", salt)
	if bytes.Equal(key, key3) {
		t.Error("Different password should produce different key")
	}

	// Different salt should produce different key
	salt2 := []byte("different_salt_value_32bytes!!!")
	key4 := DeriveKeyFromPassword(password, salt2)
	if bytes.Equal(key, key4) {
		t.Error("Different salt should produce different key")
	}
}

func TestGenerateSalt(t *testing.T) {
	salt1, err := GenerateSalt()
	if err != nil {
		t.Fatalf("GenerateSalt failed: %v", err)
	}

	if len(salt1) != 32 {
		t.Errorf("Salt should be 32 bytes, got %d", len(salt1))
	}

	salt2, _ := GenerateSalt()
	if bytes.Equal(salt1, salt2) {
		t.Error("Salts should be random and different")
	}
}

func TestGenerateRandomBytes(t *testing.T) {
	tests := []int{16, 32, 64, 128}

	for _, size := range tests {
		b, err := GenerateRandomBytes(size)
		if err != nil {
			t.Fatalf("GenerateRandomBytes(%d) failed: %v", size, err)
		}

		if len(b) != size {
			t.Errorf("Expected %d bytes, got %d", size, len(b))
		}
	}
}

func TestGenerateRandomHex(t *testing.T) {
	hexStr, err := GenerateRandomHex(16)
	if err != nil {
		t.Fatalf("GenerateRandomHex failed: %v", err)
	}

	if len(hexStr) != 32 { // 16 bytes = 32 hex chars
		t.Errorf("Expected 32 hex chars, got %d", len(hexStr))
	}

	// Verify it's valid hex
	_, err = hex.DecodeString(hexStr)
	if err != nil {
		t.Errorf("Invalid hex string: %v", err)
	}
}

// ================================================================================
// X25519 KEY EXCHANGE TESTS
// ================================================================================

func TestGenerateX25519KeyPair(t *testing.T) {
	kp, err := GenerateX25519KeyPair()
	if err != nil {
		t.Fatalf("GenerateX25519KeyPair failed: %v", err)
	}

	// Keys should not be all zeros
	var zeroKey [32]byte
	if kp.PrivateKey == zeroKey {
		t.Error("Private key should not be all zeros")
	}
	if kp.PublicKey == zeroKey {
		t.Error("Public key should not be all zeros")
	}

	// Keys should be different
	if kp.PrivateKey == kp.PublicKey {
		t.Error("Private and public keys should be different")
	}
}

func TestWrapUnwrapDEK(t *testing.T) {
	// Generate recipient key pair
	recipient, err := GenerateX25519KeyPair()
	if err != nil {
		t.Fatalf("GenerateX25519KeyPair failed: %v", err)
	}

	// Generate DEK
	dek, err := GenerateDEK()
	if err != nil {
		t.Fatalf("GenerateDEK failed: %v", err)
	}

	// Wrap DEK for recipient
	wrapped, err := WrapDEK(dek, recipient.PublicKey)
	if err != nil {
		t.Fatalf("WrapDEK failed: %v", err)
	}

	// Wrapped should be longer than DEK (ephemeral pubkey + encrypted DEK)
	if len(wrapped) <= len(dek) {
		t.Error("Wrapped DEK should be longer than original DEK")
	}

	// Unwrap DEK
	unwrapped, err := UnwrapDEK(wrapped, recipient.PrivateKey)
	if err != nil {
		t.Fatalf("UnwrapDEK failed: %v", err)
	}

	// Should match original
	if !bytes.Equal(unwrapped, dek) {
		t.Error("Unwrapped DEK doesn't match original")
	}
}

func TestUnwrapDEK_WrongKey(t *testing.T) {
	recipient1, _ := GenerateX25519KeyPair()
	recipient2, _ := GenerateX25519KeyPair()

	dek, _ := GenerateDEK()
	wrapped, _ := WrapDEK(dek, recipient1.PublicKey)

	// Try to unwrap with wrong private key
	_, err := UnwrapDEK(wrapped, recipient2.PrivateKey)
	if err == nil {
		t.Error("Expected error when unwrapping with wrong key")
	}
}

func TestUnwrapDEK_TooShort(t *testing.T) {
	recipient, _ := GenerateX25519KeyPair()
	_, err := UnwrapDEK([]byte("short"), recipient.PrivateKey)
	if err == nil {
		t.Error("Expected error for wrapped DEK too short")
	}
}

func TestWrapDEK_DifferentEachTime(t *testing.T) {
	recipient, _ := GenerateX25519KeyPair()
	dek, _ := GenerateDEK()

	wrapped1, _ := WrapDEK(dek, recipient.PublicKey)
	wrapped2, _ := WrapDEK(dek, recipient.PublicKey)

	if bytes.Equal(wrapped1, wrapped2) {
		t.Error("Same DEK should produce different wrapped output (ephemeral key)")
	}

	// But both should unwrap to same DEK
	unwrapped1, _ := UnwrapDEK(wrapped1, recipient.PrivateKey)
	unwrapped2, _ := UnwrapDEK(wrapped2, recipient.PrivateKey)

	if !bytes.Equal(unwrapped1, dek) || !bytes.Equal(unwrapped2, dek) {
		t.Error("Both wrapped DEKs should unwrap to original")
	}
}

// ================================================================================
// DEK GENERATION TESTS
// ================================================================================

func TestGenerateDEK(t *testing.T) {
	dek, err := GenerateDEK()
	if err != nil {
		t.Fatalf("GenerateDEK failed: %v", err)
	}

	if len(dek) != 32 {
		t.Errorf("DEK should be 32 bytes, got %d", len(dek))
	}

	// Should be random
	dek2, _ := GenerateDEK()
	if bytes.Equal(dek, dek2) {
		t.Error("DEKs should be random and different")
	}
}

// ================================================================================
// BLIND INDEX TESTS
// ================================================================================

func TestDeriveBlindIndexKey(t *testing.T) {
	dek := make([]byte, 32)
	for i := range dek {
		dek[i] = byte(i)
	}

	key := DeriveBlindIndexKey(dek)

	if len(key) != 32 {
		t.Errorf("Blind index key should be 32 bytes, got %d", len(key))
	}

	// Same DEK should produce same blind index key
	key2 := DeriveBlindIndexKey(dek)
	if !bytes.Equal(key, key2) {
		t.Error("Same DEK should produce same blind index key")
	}

	// Different DEK should produce different blind index key
	dek2 := make([]byte, 32)
	dek2[0] = 1
	key3 := DeriveBlindIndexKey(dek2)
	if bytes.Equal(key, key3) {
		t.Error("Different DEK should produce different blind index key")
	}
}

func TestCreateBlindIndex(t *testing.T) {
	dek := make([]byte, 32)
	blindKey := DeriveBlindIndexKey(dek)

	// Same value should produce same index
	idx1 := blindKey.CreateBlindIndex("John Smith")
	idx2 := blindKey.CreateBlindIndex("John Smith")
	if !bytes.Equal(idx1, idx2) {
		t.Error("Same value should produce same blind index")
	}

	// Different value should produce different index
	idx3 := blindKey.CreateBlindIndex("Jane Doe")
	if bytes.Equal(idx1, idx3) {
		t.Error("Different value should produce different blind index")
	}

	// Case insensitive
	idx4 := blindKey.CreateBlindIndex("JOHN SMITH")
	if !bytes.Equal(idx1, idx4) {
		t.Error("Blind index should be case insensitive")
	}

	// Whitespace trimmed
	idx5 := blindKey.CreateBlindIndex("  John Smith  ")
	if !bytes.Equal(idx1, idx5) {
		t.Error("Blind index should trim whitespace")
	}
}

func TestBlindIndex_DifferentKeys(t *testing.T) {
	dek1 := make([]byte, 32)
	dek2 := make([]byte, 32)
	dek2[0] = 1

	key1 := DeriveBlindIndexKey(dek1)
	key2 := DeriveBlindIndexKey(dek2)

	idx1 := key1.CreateBlindIndex("test")
	idx2 := key2.CreateBlindIndex("test")

	if bytes.Equal(idx1, idx2) {
		t.Error("Same value with different keys should produce different indexes")
	}
}

// ================================================================================
// MNEMONIC TESTS
// ================================================================================

func TestGenerateMnemonic(t *testing.T) {
	mnemonic, entropy, err := GenerateMnemonic()
	if err != nil {
		t.Fatalf("GenerateMnemonic failed: %v", err)
	}

	// Should have 24 words
	words := strings.Split(mnemonic, " ")
	if len(words) != 24 {
		t.Errorf("Mnemonic should have 24 words, got %d", len(words))
	}

	// Entropy should be 32 bytes
	if len(entropy) != 32 {
		t.Errorf("Entropy should be 32 bytes, got %d", len(entropy))
	}

	// Each word should be in the word list
	wordSet := make(map[string]bool)
	for _, w := range wordList {
		wordSet[w] = true
	}

	for i, word := range words {
		if !wordSet[word] {
			t.Errorf("Word %d '%s' not in word list", i, word)
		}
	}
}

func TestMnemonicToKey(t *testing.T) {
	mnemonic := "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual"

	key := MnemonicToKey(mnemonic)

	if len(key) != 32 {
		t.Errorf("Key should be 32 bytes, got %d", len(key))
	}

	// Same mnemonic should produce same key
	key2 := MnemonicToKey(mnemonic)
	if !bytes.Equal(key, key2) {
		t.Error("Same mnemonic should produce same key")
	}

	// Different mnemonic should produce different key
	key3 := MnemonicToKey("different mnemonic words here")
	if bytes.Equal(key, key3) {
		t.Error("Different mnemonic should produce different key")
	}
}

// ================================================================================
// HASH UTILITY TESTS
// ================================================================================

func TestSHA256Hash(t *testing.T) {
	data := []byte("test data")
	hash := SHA256Hash(data)

	if len(hash) != 32 {
		t.Errorf("SHA256 hash should be 32 bytes, got %d", len(hash))
	}

	// Same data should produce same hash
	hash2 := SHA256Hash(data)
	if !bytes.Equal(hash, hash2) {
		t.Error("Same data should produce same hash")
	}

	// Different data should produce different hash
	hash3 := SHA256Hash([]byte("different data"))
	if bytes.Equal(hash, hash3) {
		t.Error("Different data should produce different hash")
	}
}

func TestGenerateKeyID(t *testing.T) {
	id1, err := GenerateKeyID()
	if err != nil {
		t.Fatalf("GenerateKeyID failed: %v", err)
	}

	if len(id1) != 32 { // 16 bytes = 32 hex chars
		t.Errorf("Key ID should be 32 chars, got %d", len(id1))
	}

	id2, _ := GenerateKeyID()
	if id1 == id2 {
		t.Error("Key IDs should be unique")
	}
}

func TestGenerateCompanyID(t *testing.T) {
	id1, err := GenerateCompanyID()
	if err != nil {
		t.Fatalf("GenerateCompanyID failed: %v", err)
	}

	if len(id1) != 32 {
		t.Errorf("Company ID should be 32 chars, got %d", len(id1))
	}

	id2, _ := GenerateCompanyID()
	if id1 == id2 {
		t.Error("Company IDs should be unique")
	}
}

func TestGenerateNonce(t *testing.T) {
	nonce1, err := GenerateNonce()
	if err != nil {
		t.Fatalf("GenerateNonce failed: %v", err)
	}

	if len(nonce1) != 32 {
		t.Errorf("Nonce should be 32 chars, got %d", len(nonce1))
	}

	nonce2, _ := GenerateNonce()
	if nonce1 == nonce2 {
		t.Error("Nonces should be unique")
	}
}

func TestConstantTimeCompare(t *testing.T) {
	a := []byte("test value")
	b := []byte("test value")
	c := []byte("different")

	if !ConstantTimeCompare(a, b) {
		t.Error("Equal values should return true")
	}

	if ConstantTimeCompare(a, c) {
		t.Error("Different values should return false")
	}
}

func TestFormatKeyID(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"abcdefghijklmnopqrstuvwxyz123456", "abcdefgh...3456"},
		{"short", "short"},
		{"1234567890123456", "1234567890123456"},
		{"12345678901234567", "12345678...4567"},
	}

	for _, tt := range tests {
		result := FormatKeyID(tt.input)
		if result != tt.expected {
			t.Errorf("FormatKeyID(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

// ================================================================================
// BENCHMARKS
// ================================================================================

func BenchmarkEncryptAESGCM(b *testing.B) {
	key := make([]byte, 32)
	plaintext := make([]byte, 1024)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		EncryptAESGCM(key, plaintext)
	}
}

func BenchmarkDecryptAESGCM(b *testing.B) {
	key := make([]byte, 32)
	plaintext := make([]byte, 1024)
	ciphertext, _ := EncryptAESGCM(key, plaintext)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		DecryptAESGCM(key, ciphertext)
	}
}

func BenchmarkDeriveKeyFromPassword(b *testing.B) {
	password := "MySecurePassword123!"
	salt := make([]byte, 32)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		DeriveKeyFromPassword(password, salt)
	}
}

func BenchmarkWrapDEK(b *testing.B) {
	recipient, _ := GenerateX25519KeyPair()
	dek, _ := GenerateDEK()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		WrapDEK(dek, recipient.PublicKey)
	}
}

func BenchmarkUnwrapDEK(b *testing.B) {
	recipient, _ := GenerateX25519KeyPair()
	dek, _ := GenerateDEK()
	wrapped, _ := WrapDEK(dek, recipient.PublicKey)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		UnwrapDEK(wrapped, recipient.PrivateKey)
	}
}

func BenchmarkCreateBlindIndex(b *testing.B) {
	dek := make([]byte, 32)
	key := DeriveBlindIndexKey(dek)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		key.CreateBlindIndex("John Smith")
	}
}
