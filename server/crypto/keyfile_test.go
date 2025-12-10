package crypto

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"
)

// ================================================================================
// KEYFILE CREATION TESTS
// ================================================================================

func TestNewKeyfile(t *testing.T) {
	dek, _ := GenerateDEK()
	kf, err := NewKeyfile("company123", "Alice's Laptop", "admin", dek)
	if err != nil {
		t.Fatalf("NewKeyfile failed: %v", err)
	}

	// Check fields
	if kf.CompanyID != "company123" {
		t.Errorf("CompanyID: got %q, want %q", kf.CompanyID, "company123")
	}
	if kf.UserLabel != "Alice's Laptop" {
		t.Errorf("UserLabel: got %q, want %q", kf.UserLabel, "Alice's Laptop")
	}
	if kf.Role != "admin" {
		t.Errorf("Role: got %q, want %q", kf.Role, "admin")
	}

	// Check key ID generated
	if len(kf.KeyID) == 0 {
		t.Error("KeyID should be generated")
	}

	// Check signing keys
	if len(kf.SigningPrivateKey) != SigningPrivateKeySize {
		t.Errorf("SigningPrivateKey size: got %d, want %d", len(kf.SigningPrivateKey), SigningPrivateKeySize)
	}
	if len(kf.SigningPublicKey) != SigningPublicKeySize {
		t.Errorf("SigningPublicKey size: got %d, want %d", len(kf.SigningPublicKey), SigningPublicKeySize)
	}

	// Check KEX keys
	var zeroKey [32]byte
	if kf.KEXPrivateKey == zeroKey {
		t.Error("KEXPrivateKey should not be zero")
	}
	if kf.KEXPublicKey == zeroKey {
		t.Error("KEXPublicKey should not be zero")
	}

	// Check DEK stored
	if !bytes.Equal(kf.CompanyDEK, dek) {
		t.Error("CompanyDEK should match provided DEK")
	}

	// Check blind index key derived
	if len(kf.BlindIndexKey) != 32 {
		t.Errorf("BlindIndexKey should be 32 bytes, got %d", len(kf.BlindIndexKey))
	}

	// Check issued at set
	if kf.IssuedAt.IsZero() {
		t.Error("IssuedAt should be set")
	}
}

func TestNewKeyfileForNewCompany(t *testing.T) {
	kf, err := NewKeyfileForNewCompany("Test User")
	if err != nil {
		t.Fatalf("NewKeyfileForNewCompany failed: %v", err)
	}

	// Should be owner role
	if kf.Role != "owner" {
		t.Errorf("Role should be 'owner', got %q", kf.Role)
	}

	// Should have generated company ID
	if len(kf.CompanyID) == 0 {
		t.Error("CompanyID should be generated")
	}

	// Should have generated DEK
	if len(kf.CompanyDEK) != 32 {
		t.Errorf("CompanyDEK should be 32 bytes, got %d", len(kf.CompanyDEK))
	}
}

// ================================================================================
// KEYFILE SERIALIZATION TESTS
// ================================================================================

func TestKeyfileSerializeAndParse(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")
	password := "MySecurePassword123!"

	// Serialize
	data, err := kf.Serialize(password)
	if err != nil {
		t.Fatalf("Serialize failed: %v", err)
	}

	// Check magic header
	if string(data[:5]) != KeyfileMagic {
		t.Errorf("Magic header: got %q, want %q", string(data[:5]), KeyfileMagic)
	}

	// Parse
	parsed, err := ParseKeyfile(data, password)
	if err != nil {
		t.Fatalf("ParseKeyfile failed: %v", err)
	}

	// Compare fields
	if parsed.KeyID != kf.KeyID {
		t.Errorf("KeyID mismatch: got %q, want %q", parsed.KeyID, kf.KeyID)
	}
	if parsed.CompanyID != kf.CompanyID {
		t.Errorf("CompanyID mismatch: got %q, want %q", parsed.CompanyID, kf.CompanyID)
	}
	if parsed.UserLabel != kf.UserLabel {
		t.Errorf("UserLabel mismatch")
	}
	if parsed.Role != kf.Role {
		t.Errorf("Role mismatch")
	}

	// Compare keys
	if !bytes.Equal(parsed.SigningPrivateKey, kf.SigningPrivateKey) {
		t.Error("SigningPrivateKey mismatch")
	}
	if !bytes.Equal(parsed.SigningPublicKey, kf.SigningPublicKey) {
		t.Error("SigningPublicKey mismatch")
	}
	if parsed.KEXPrivateKey != kf.KEXPrivateKey {
		t.Error("KEXPrivateKey mismatch")
	}
	if parsed.KEXPublicKey != kf.KEXPublicKey {
		t.Error("KEXPublicKey mismatch")
	}
	if !bytes.Equal(parsed.CompanyDEK, kf.CompanyDEK) {
		t.Error("CompanyDEK mismatch")
	}
}

func TestParseKeyfile_WrongPassword(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")
	data, _ := kf.Serialize("correct_password")

	_, err := ParseKeyfile(data, "wrong_password")
	if err == nil {
		t.Error("Expected error for wrong password")
	}
}

func TestParseKeyfile_InvalidMagic(t *testing.T) {
	data := []byte("WRONG_MAGIC_HEADER_AND_MORE_DATA")
	_, err := ParseKeyfile(data, "password")
	if err == nil {
		t.Error("Expected error for invalid magic header")
	}
}

func TestParseKeyfile_TooShort(t *testing.T) {
	_, err := ParseKeyfile([]byte("short"), "password")
	if err == nil {
		t.Error("Expected error for data too short")
	}
}

func TestParseKeyfile_CorruptedData(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")
	data, _ := kf.Serialize("password")

	// Corrupt the encrypted payload
	data[len(data)-10] ^= 0xFF

	_, err := ParseKeyfile(data, "password")
	if err == nil {
		t.Error("Expected error for corrupted data")
	}
}

func TestKeyfile_DifferentPasswordsDifferentOutput(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")

	data1, _ := kf.Serialize("password1")
	data2, _ := kf.Serialize("password2")

	if bytes.Equal(data1, data2) {
		t.Error("Different passwords should produce different encrypted output")
	}
}

// ================================================================================
// DATA ENCRYPTION TESTS
// ================================================================================

func TestKeyfile_EncryptDecrypt(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")
	plaintext := []byte("Sensitive data to encrypt")

	// Encrypt
	ciphertext, err := kf.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	// Decrypt
	decrypted, err := kf.Decrypt(ciphertext)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if !bytes.Equal(decrypted, plaintext) {
		t.Error("Decrypted data doesn't match original")
	}
}

func TestKeyfile_EncryptDecryptJSON(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")

	type Customer struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		SSN   string `json:"ssn"`
	}

	original := Customer{
		Name:  "John Smith",
		Email: "john@example.com",
		SSN:   "123-45-6789",
	}

	// Encrypt
	ciphertext, err := kf.EncryptJSON(original)
	if err != nil {
		t.Fatalf("EncryptJSON failed: %v", err)
	}

	// Decrypt
	var decrypted Customer
	err = kf.DecryptJSON(ciphertext, &decrypted)
	if err != nil {
		t.Fatalf("DecryptJSON failed: %v", err)
	}

	if decrypted.Name != original.Name || decrypted.Email != original.Email || decrypted.SSN != original.SSN {
		t.Error("Decrypted JSON doesn't match original")
	}
}

func TestKeyfile_DifferentKeyfilesCantDecrypt(t *testing.T) {
	kf1, _ := NewKeyfileForNewCompany("User 1")
	kf2, _ := NewKeyfileForNewCompany("User 2")

	plaintext := []byte("Secret data")
	ciphertext, _ := kf1.Encrypt(plaintext)

	// kf2 should not be able to decrypt
	_, err := kf2.Decrypt(ciphertext)
	if err == nil {
		t.Error("Different keyfile should not be able to decrypt")
	}
}

// ================================================================================
// REQUEST SIGNING TESTS
// ================================================================================

func TestKeyfile_SignRequest(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")

	payload := map[string]string{
		"action": "get_customers",
		"filter": "active",
	}

	signed, err := kf.SignRequest("test_action", payload)
	if err != nil {
		t.Fatalf("SignRequest failed: %v", err)
	}

	// Check fields
	if signed.KeyID != kf.KeyID {
		t.Errorf("KeyID mismatch: got %q, want %q", signed.KeyID, kf.KeyID)
	}
	if len(signed.Request) == 0 {
		t.Error("Request should not be empty")
	}
	if len(signed.Signature) != SignatureSize {
		t.Errorf("Signature size: got %d, want %d", len(signed.Signature), SignatureSize)
	}

	// Parse request data
	var reqData RequestData
	if err := json.Unmarshal(signed.Request, &reqData); err != nil {
		t.Fatalf("Failed to parse request data: %v", err)
	}

	if reqData.CompanyID != kf.CompanyID {
		t.Error("CompanyID mismatch in request")
	}
	if reqData.Action != "test_action" {
		t.Error("Action mismatch in request")
	}
	if len(reqData.Nonce) == 0 {
		t.Error("Nonce should be set")
	}
	if reqData.Timestamp == 0 {
		t.Error("Timestamp should be set")
	}

	// Verify signature
	valid, err := Verify(kf.SigningPublicKey, signed.Request, signed.Signature)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}
	if !valid {
		t.Error("Signature should be valid")
	}
}

func TestKeyfile_SignRequest_UniqueNonces(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")

	nonces := make(map[string]bool)
	for i := 0; i < 100; i++ {
		signed, _ := kf.SignRequest("test", nil)

		var reqData RequestData
		json.Unmarshal(signed.Request, &reqData)

		if nonces[reqData.Nonce] {
			t.Errorf("Duplicate nonce found: %s", reqData.Nonce)
		}
		nonces[reqData.Nonce] = true
	}
}

// ================================================================================
// ACCESS GRANTING TESTS
// ================================================================================

func TestKeyfile_WrapDEKForUser(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Admin")

	// Generate new user's keys
	newUserKEX, _ := GenerateX25519KeyPair()

	// Wrap DEK for new user
	wrapped, err := kf.WrapDEKForUser(newUserKEX.PublicKey)
	if err != nil {
		t.Fatalf("WrapDEKForUser failed: %v", err)
	}

	// New user should be able to unwrap
	unwrapped, err := UnwrapDEK(wrapped, newUserKEX.PrivateKey)
	if err != nil {
		t.Fatalf("UnwrapDEK failed: %v", err)
	}

	if !bytes.Equal(unwrapped, kf.CompanyDEK) {
		t.Error("Unwrapped DEK doesn't match original")
	}
}

func TestKeyfile_UnwrapDEKFromGrant(t *testing.T) {
	adminKf, _ := NewKeyfileForNewCompany("Admin")

	// Create new keyfile (without DEK yet)
	newKf, _ := NewKeyfile("", "New User", "member", nil)

	// Admin wraps DEK for new user
	wrapped, _ := adminKf.WrapDEKForUser(newKf.KEXPublicKey)

	// New user unwraps
	dek, err := newKf.UnwrapDEKFromGrant(wrapped)
	if err != nil {
		t.Fatalf("UnwrapDEKFromGrant failed: %v", err)
	}

	if !bytes.Equal(dek, adminKf.CompanyDEK) {
		t.Error("Unwrapped DEK doesn't match admin's DEK")
	}
}

// ================================================================================
// BLIND INDEX TESTS
// ================================================================================

func TestKeyfile_CreateBlindIndex(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")

	idx1 := kf.CreateBlindIndex("John Smith")
	idx2 := kf.CreateBlindIndex("John Smith")
	idx3 := kf.CreateBlindIndex("Jane Doe")

	// Same value should produce same index
	if !bytes.Equal(idx1, idx2) {
		t.Error("Same value should produce same blind index")
	}

	// Different value should produce different index
	if bytes.Equal(idx1, idx3) {
		t.Error("Different value should produce different blind index")
	}
}

func TestKeyfile_BlindIndexesDifferentPerCompany(t *testing.T) {
	kf1, _ := NewKeyfileForNewCompany("User 1")
	kf2, _ := NewKeyfileForNewCompany("User 2")

	idx1 := kf1.CreateBlindIndex("test value")
	idx2 := kf2.CreateBlindIndex("test value")

	// Different companies should produce different blind indexes
	// (because they have different DEKs)
	if bytes.Equal(idx1, idx2) {
		t.Error("Different companies should produce different blind indexes")
	}
}

// ================================================================================
// DOCUMENT SIGNING TESTS
// ================================================================================

func TestKeyfile_SignDocument(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")
	document := []byte("Invoice #12345\nAmount: $1000.00")

	signature, err := kf.SignDocument(document)
	if err != nil {
		t.Fatalf("SignDocument failed: %v", err)
	}

	if len(signature) != SignatureSize {
		t.Errorf("Signature size: got %d, want %d", len(signature), SignatureSize)
	}

	// Verify
	valid, err := VerifyDocumentSignature(kf.SigningPublicKey, document, signature)
	if err != nil {
		t.Fatalf("VerifyDocumentSignature failed: %v", err)
	}

	if !valid {
		t.Error("Document signature should be valid")
	}
}

func TestVerifyDocumentSignature_TamperedDocument(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")
	document := []byte("Original document")

	signature, _ := kf.SignDocument(document)

	// Tamper
	tampered := []byte("Tampered document")
	valid, _ := VerifyDocumentSignature(kf.SigningPublicKey, tampered, signature)

	if valid {
		t.Error("Signature should be invalid for tampered document")
	}
}

// ================================================================================
// UTILITY METHOD TESTS
// ================================================================================

func TestKeyfile_GetPublicInfo(t *testing.T) {
	kf, _ := NewKeyfileForNewCompany("Test User")

	info := kf.GetPublicInfo()

	if info["key_id"] != kf.KeyID {
		t.Error("key_id mismatch")
	}
	if info["company_id"] != kf.CompanyID {
		t.Error("company_id mismatch")
	}
	if info["user_label"] != kf.UserLabel {
		t.Error("user_label mismatch")
	}
	if info["role"] != kf.Role {
		t.Error("role mismatch")
	}

	// Should have public keys
	if _, ok := info["signing_public_key"]; !ok {
		t.Error("should include signing_public_key")
	}
	if _, ok := info["kex_public_key"]; !ok {
		t.Error("should include kex_public_key")
	}
}

func TestKeyfile_CanGrantAccess(t *testing.T) {
	tests := []struct {
		role     string
		expected bool
	}{
		{"owner", true},
		{"admin", true},
		{"member", false},
		{"readonly", false},
	}

	for _, tt := range tests {
		dek, _ := GenerateDEK()
		kf, _ := NewKeyfile("company", "user", tt.role, dek)

		if kf.CanGrantAccess() != tt.expected {
			t.Errorf("Role %q: CanGrantAccess() = %v, want %v", tt.role, kf.CanGrantAccess(), tt.expected)
		}
	}
}

func TestKeyfile_IsExpired(t *testing.T) {
	dek, _ := GenerateDEK()
	kf, _ := NewKeyfile("company", "user", "member", dek)

	// No expiration set
	if kf.IsExpired() {
		t.Error("Keyfile without expiration should not be expired")
	}

	// Set expiration in past
	kf.ExpiresAt = time.Now().Add(-1 * time.Hour)
	if !kf.IsExpired() {
		t.Error("Keyfile with past expiration should be expired")
	}

	// Set expiration in future
	kf.ExpiresAt = time.Now().Add(1 * time.Hour)
	if kf.IsExpired() {
		t.Error("Keyfile with future expiration should not be expired")
	}
}

func TestKeyfile_SuggestedFilename(t *testing.T) {
	dek, _ := GenerateDEK()
	kf, _ := NewKeyfile("company", "Alice", "member", dek)

	filename := kf.SuggestedFilename()

	if len(filename) == 0 {
		t.Error("Filename should not be empty")
	}

	// Should end with .lskey
	if filename[len(filename)-6:] != ".lskey" {
		t.Errorf("Filename should end with .lskey: %s", filename)
	}

	// Should contain user label
	if !bytes.Contains([]byte(filename), []byte("Alice")) {
		t.Errorf("Filename should contain user label: %s", filename)
	}
}

// ================================================================================
// INTEGRATION TEST
// ================================================================================

func TestKeyfile_CompleteWorkflow(t *testing.T) {
	// 1. Create company
	adminKf, _ := NewKeyfileForNewCompany("Admin")

	// 2. Save and reload keyfile
	data, _ := adminKf.Serialize("admin_password")
	reloadedAdmin, _ := ParseKeyfile(data, "admin_password")

	// 3. Create some data
	customer := map[string]string{
		"name":  "John Smith",
		"email": "john@example.com",
	}
	encrypted, _ := reloadedAdmin.EncryptJSON(customer)

	// 4. Add new user
	newUserKf, _ := NewKeyfile(reloadedAdmin.CompanyID, "New User", "member", nil)
	wrappedDEK, _ := reloadedAdmin.WrapDEKForUser(newUserKf.KEXPublicKey)
	newUserDEK, _ := newUserKf.UnwrapDEKFromGrant(wrappedDEK)

	// Update new user's keyfile with DEK
	newUserKf.CompanyDEK = newUserDEK
	newUserKf.BlindIndexKey = DeriveBlindIndexKey(newUserDEK)

	// 5. New user can decrypt data
	var decrypted map[string]string
	err := newUserKf.DecryptJSON(encrypted, &decrypted)
	if err != nil {
		t.Fatalf("New user couldn't decrypt: %v", err)
	}

	if decrypted["name"] != customer["name"] {
		t.Error("Decrypted data doesn't match")
	}

	// 6. Both users create same blind index
	adminIdx := reloadedAdmin.CreateBlindIndex("John Smith")
	newUserIdx := newUserKf.CreateBlindIndex("John Smith")

	if !bytes.Equal(adminIdx, newUserIdx) {
		t.Error("Same company users should create same blind indexes")
	}

	// 7. Sign document
	doc := []byte("Purchase Order #123")
	sig, _ := newUserKf.SignDocument(doc)
	valid, _ := VerifyDocumentSignature(newUserKf.SigningPublicKey, doc, sig)

	if !valid {
		t.Error("Document signature should be valid")
	}
}

// ================================================================================
// BENCHMARKS
// ================================================================================

func BenchmarkNewKeyfile(b *testing.B) {
	dek, _ := GenerateDEK()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		NewKeyfile("company", "user", "member", dek)
	}
}

func BenchmarkKeyfileSerialize(b *testing.B) {
	kf, _ := NewKeyfileForNewCompany("Test")
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		kf.Serialize("password")
	}
}

func BenchmarkKeyfileParse(b *testing.B) {
	kf, _ := NewKeyfileForNewCompany("Test")
	data, _ := kf.Serialize("password")
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ParseKeyfile(data, "password")
	}
}

func BenchmarkKeyfileEncryptJSON(b *testing.B) {
	kf, _ := NewKeyfileForNewCompany("Test")
	data := map[string]string{
		"name":  "John Smith",
		"email": "john@example.com",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		kf.EncryptJSON(data)
	}
}

func BenchmarkKeyfileSignRequest(b *testing.B) {
	kf, _ := NewKeyfileForNewCompany("Test")
	payload := map[string]string{"action": "test"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		kf.SignRequest("action", payload)
	}
}
