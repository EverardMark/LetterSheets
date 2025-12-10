package crypto

import (
	"bytes"
	"strings"
	"testing"
)

// ================================================================================
// RECOVERY REQUEST TESTS
// ================================================================================

func TestPrepareRecoveryRequest(t *testing.T) {
	companyID := "test_company_123"
	userLabel := "Bob's New Laptop"

	request, partial, err := PrepareRecoveryRequest(companyID, userLabel)
	if err != nil {
		t.Fatalf("PrepareRecoveryRequest failed: %v", err)
	}

	// Check request fields
	if request.CompanyID != companyID {
		t.Errorf("CompanyID: got %q, want %q", request.CompanyID, companyID)
	}
	if request.UserLabel != userLabel {
		t.Errorf("UserLabel: got %q, want %q", request.UserLabel, userLabel)
	}
	if len(request.NewKeyID) == 0 {
		t.Error("NewKeyID should be generated")
	}
	if len(request.NewSigningPublicKey) != SigningPublicKeySize {
		t.Errorf("NewSigningPublicKey size: got %d, want %d", len(request.NewSigningPublicKey), SigningPublicKeySize)
	}
	if len(request.NewKEXPublicKey) != 32 {
		t.Errorf("NewKEXPublicKey size: got %d, want %d", len(request.NewKEXPublicKey), 32)
	}
	if request.RequestedAt.IsZero() {
		t.Error("RequestedAt should be set")
	}

	// Check partial keyfile fields
	if partial.KeyID != request.NewKeyID {
		t.Error("Partial KeyID should match request")
	}
	if partial.CompanyID != companyID {
		t.Error("Partial CompanyID should match")
	}
	if partial.UserLabel != userLabel {
		t.Error("Partial UserLabel should match")
	}
	if len(partial.SigningPrivateKey) != SigningPrivateKeySize {
		t.Error("SigningPrivateKey should be set")
	}
	var zeroKey [32]byte
	if partial.KEXPrivateKey == zeroKey {
		t.Error("KEXPrivateKey should be set")
	}
}

func TestPrepareRecoveryRequest_MultipleUnique(t *testing.T) {
	var requests []*RecoveryRequest

	for i := 0; i < 5; i++ {
		req, _, _ := PrepareRecoveryRequest("company", "user")
		requests = append(requests, req)
	}

	// All key IDs should be unique
	keyIDs := make(map[string]bool)
	for _, req := range requests {
		if keyIDs[req.NewKeyID] {
			t.Error("Key IDs should be unique")
		}
		keyIDs[req.NewKeyID] = true
	}
}

// ================================================================================
// GRANT ACCESS TESTS
// ================================================================================

func TestGrantAccessToUser(t *testing.T) {
	// Admin creates company
	adminKf, _ := NewKeyfileForNewCompany("Admin")

	// User prepares recovery request
	request, _, err := PrepareRecoveryRequest(adminKf.CompanyID, "New User")
	if err != nil {
		t.Fatalf("PrepareRecoveryRequest failed: %v", err)
	}

	// Admin grants access
	grant, err := adminKf.GrantAccessToUser(request, "member")
	if err != nil {
		t.Fatalf("GrantAccessToUser failed: %v", err)
	}

	// Check grant fields
	if grant.KeyID != request.NewKeyID {
		t.Error("Grant KeyID should match request")
	}
	if grant.CompanyID != adminKf.CompanyID {
		t.Error("Grant CompanyID should match admin's company")
	}
	if len(grant.WrappedDEK) == 0 {
		t.Error("WrappedDEK should be set")
	}
	if grant.GrantedBy != adminKf.KeyID {
		t.Error("GrantedBy should be admin's KeyID")
	}
	if grant.Role != "member" {
		t.Errorf("Role: got %q, want %q", grant.Role, "member")
	}
	if grant.UserLabel != "New User" {
		t.Error("UserLabel should be preserved")
	}
	if grant.GrantedAt.IsZero() {
		t.Error("GrantedAt should be set")
	}
}

func TestGrantAccessToUser_NonAdmin(t *testing.T) {
	// Create non-admin keyfile
	dek, _ := GenerateDEK()
	memberKf, _ := NewKeyfile("company", "Member", "member", dek)

	request, _, _ := PrepareRecoveryRequest("company", "New User")

	// Member should not be able to grant access
	_, err := memberKf.GrantAccessToUser(request, "member")
	if err == nil {
		t.Error("Member should not be able to grant access")
	}
}

func TestGrantAccessToUser_ReadOnly(t *testing.T) {
	dek, _ := GenerateDEK()
	readonlyKf, _ := NewKeyfile("company", "ReadOnly", "readonly", dek)

	request, _, _ := PrepareRecoveryRequest("company", "New User")

	_, err := readonlyKf.GrantAccessToUser(request, "member")
	if err == nil {
		t.Error("ReadOnly should not be able to grant access")
	}
}

func TestGrantAccessToUser_WrongCompany(t *testing.T) {
	adminKf, _ := NewKeyfileForNewCompany("Admin")
	request, _, _ := PrepareRecoveryRequest("different_company", "New User")

	_, err := adminKf.GrantAccessToUser(request, "member")
	if err == nil {
		t.Error("Should not grant access to different company")
	}
}

func TestGrantAccessToUser_AdminCanGrant(t *testing.T) {
	// Create admin (not owner) keyfile
	dek, _ := GenerateDEK()
	adminKf, _ := NewKeyfile("company", "Admin", "admin", dek)

	request, _, _ := PrepareRecoveryRequest("company", "New User")

	grant, err := adminKf.GrantAccessToUser(request, "member")
	if err != nil {
		t.Fatalf("Admin should be able to grant access: %v", err)
	}

	if grant == nil {
		t.Error("Grant should not be nil")
	}
}

// ================================================================================
// COMPLETE WITH GRANT TESTS
// ================================================================================

func TestCompleteWithGrant(t *testing.T) {
	// Setup: Admin and new user
	adminKf, _ := NewKeyfileForNewCompany("Admin")
	request, partial, _ := PrepareRecoveryRequest(adminKf.CompanyID, "New User")
	grant, _ := adminKf.GrantAccessToUser(request, "member")

	// Complete keyfile
	completedKf, err := partial.CompleteWithGrant(grant)
	if err != nil {
		t.Fatalf("CompleteWithGrant failed: %v", err)
	}

	// Check completed keyfile
	if completedKf.KeyID != partial.KeyID {
		t.Error("KeyID should match partial")
	}
	if completedKf.CompanyID != partial.CompanyID {
		t.Error("CompanyID should match partial")
	}
	if completedKf.Role != "member" {
		t.Errorf("Role: got %q, want %q", completedKf.Role, "member")
	}

	// Check DEK was properly unwrapped
	if !bytes.Equal(completedKf.CompanyDEK, adminKf.CompanyDEK) {
		t.Error("CompanyDEK should match admin's DEK")
	}

	// Check blind index key derived
	expectedBlindKey := DeriveBlindIndexKey(adminKf.CompanyDEK)
	if !bytes.Equal(completedKf.BlindIndexKey, expectedBlindKey) {
		t.Error("BlindIndexKey should be derived from DEK")
	}
}

func TestCompleteWithGrant_InvalidGrant(t *testing.T) {
	_, partial, _ := PrepareRecoveryRequest("company", "User")

	// Create invalid grant (random bytes that won't unwrap correctly)
	invalidGrant := &RecoveryGrant{
		WrappedDEK: []byte("this is not a valid wrapped dek"),
	}

	_, err := partial.CompleteWithGrant(invalidGrant)
	if err == nil {
		t.Error("Should fail with invalid wrapped DEK")
	}
}

func TestCompleteWithGrant_WrongRecipient(t *testing.T) {
	// Admin grants to user A
	adminKf, _ := NewKeyfileForNewCompany("Admin")
	requestA, _, _ := PrepareRecoveryRequest(adminKf.CompanyID, "User A")
	grantA, _ := adminKf.GrantAccessToUser(requestA, "member")

	// User B tries to use the grant
	_, partialB, _ := PrepareRecoveryRequest(adminKf.CompanyID, "User B")

	// Should fail because wrapped DEK is for User A's public key
	_, err := partialB.CompleteWithGrant(grantA)
	if err == nil {
		t.Error("User B should not be able to use User A's grant")
	}
}

// ================================================================================
// FULL RECOVERY FLOW TESTS
// ================================================================================

func TestRecoveryFlow_Complete(t *testing.T) {
	// 1. Admin creates company
	adminKf, _ := NewKeyfileForNewCompany("Admin")

	// 2. Admin encrypts some data
	originalData := map[string]string{"secret": "value123"}
	encrypted, _ := adminKf.EncryptJSON(originalData)

	// 3. New user joins
	request, partial, _ := PrepareRecoveryRequest(adminKf.CompanyID, "New User")

	// 4. Admin grants access
	grant, _ := adminKf.GrantAccessToUser(request, "member")

	// 5. User completes keyfile
	userKf, _ := partial.CompleteWithGrant(grant)

	// 6. User can decrypt data
	var decrypted map[string]string
	err := userKf.DecryptJSON(encrypted, &decrypted)
	if err != nil {
		t.Fatalf("User couldn't decrypt: %v", err)
	}

	if decrypted["secret"] != "value123" {
		t.Error("Decrypted data doesn't match")
	}

	// 7. User can encrypt new data
	newData := map[string]string{"new": "data"}
	newEncrypted, _ := userKf.EncryptJSON(newData)

	// 8. Admin can decrypt user's data
	var adminDecrypted map[string]string
	err = adminKf.DecryptJSON(newEncrypted, &adminDecrypted)
	if err != nil {
		t.Fatalf("Admin couldn't decrypt user's data: %v", err)
	}

	if adminDecrypted["new"] != "data" {
		t.Error("Admin's decrypted data doesn't match")
	}
}

func TestRecoveryFlow_MultipleUsers(t *testing.T) {
	// Admin creates company
	adminKf, _ := NewKeyfileForNewCompany("Admin")

	// Add multiple users
	var users []*Keyfile
	for i := 0; i < 5; i++ {
		request, partial, _ := PrepareRecoveryRequest(adminKf.CompanyID, "User")
		grant, _ := adminKf.GrantAccessToUser(request, "member")
		userKf, _ := partial.CompleteWithGrant(grant)
		users = append(users, userKf)
	}

	// All users should have same DEK
	for i, user := range users {
		if !bytes.Equal(user.CompanyDEK, adminKf.CompanyDEK) {
			t.Errorf("User %d has different DEK", i)
		}
	}

	// Data encrypted by one user should be decryptable by all
	testData := []byte("shared secret")
	encrypted, _ := users[0].Encrypt(testData)

	for i, user := range users {
		decrypted, err := user.Decrypt(encrypted)
		if err != nil {
			t.Errorf("User %d couldn't decrypt: %v", i, err)
		}
		if !bytes.Equal(decrypted, testData) {
			t.Errorf("User %d decrypted wrong data", i)
		}
	}

	// Admin can also decrypt
	decrypted, _ := adminKf.Decrypt(encrypted)
	if !bytes.Equal(decrypted, testData) {
		t.Error("Admin decrypted wrong data")
	}
}

// ================================================================================
// PAPER RECOVERY TESTS
// ================================================================================

func TestGeneratePaperRecovery(t *testing.T) {
	companyID := "test_company"
	dek, _ := GenerateDEK()

	recovery, err := GeneratePaperRecovery(companyID, dek)
	if err != nil {
		t.Fatalf("GeneratePaperRecovery failed: %v", err)
	}

	// Check mnemonic
	words := strings.Split(recovery.Mnemonic, " ")
	if len(words) != 24 {
		t.Errorf("Mnemonic should have 24 words, got %d", len(words))
	}

	// Check recovery blob
	if len(recovery.RecoveryBlob) == 0 {
		t.Error("RecoveryBlob should not be empty")
	}

	// Check metadata
	if recovery.CompanyID != companyID {
		t.Errorf("CompanyID: got %q, want %q", recovery.CompanyID, companyID)
	}
	if recovery.CreatedAt.IsZero() {
		t.Error("CreatedAt should be set")
	}
}

func TestRecoverFromMnemonic(t *testing.T) {
	// Generate paper recovery
	dek, _ := GenerateDEK()
	recovery, _ := GeneratePaperRecovery("company", dek)

	// Recover
	recovered, err := RecoverFromMnemonic(recovery.Mnemonic, recovery.RecoveryBlob, "Recovered User")
	if err != nil {
		t.Fatalf("RecoverFromMnemonic failed: %v", err)
	}

	// Check DEK recovered correctly
	if !bytes.Equal(recovered.CompanyDEK, dek) {
		t.Error("Recovered DEK doesn't match original")
	}

	// Check role is owner
	if recovered.Role != "owner" {
		t.Errorf("Recovered role should be 'owner', got %q", recovered.Role)
	}

	// Check user label
	if recovered.UserLabel != "Recovered User" {
		t.Error("UserLabel mismatch")
	}
}

func TestRecoverFromMnemonicWithCompanyID(t *testing.T) {
	companyID := "known_company_id"
	dek, _ := GenerateDEK()
	recovery, _ := GeneratePaperRecovery(companyID, dek)

	recovered, err := RecoverFromMnemonicWithCompanyID(
		recovery.Mnemonic,
		recovery.RecoveryBlob,
		companyID,
		"CEO Recovery",
	)
	if err != nil {
		t.Fatalf("RecoverFromMnemonicWithCompanyID failed: %v", err)
	}

	// Check company ID preserved
	if recovered.CompanyID != companyID {
		t.Errorf("CompanyID: got %q, want %q", recovered.CompanyID, companyID)
	}

	// Check DEK
	if !bytes.Equal(recovered.CompanyDEK, dek) {
		t.Error("DEK mismatch")
	}
}

func TestRecoverFromMnemonic_WrongMnemonic(t *testing.T) {
	dek, _ := GenerateDEK()
	recovery, _ := GeneratePaperRecovery("company", dek)

	// Try with wrong mnemonic
	wrongMnemonic := "wrong words here that will not work for recovery purposes at all ever never"

	_, err := RecoverFromMnemonic(wrongMnemonic, recovery.RecoveryBlob, "User")
	if err == nil {
		t.Error("Should fail with wrong mnemonic")
	}
}

func TestRecoverFromMnemonic_CorruptedBlob(t *testing.T) {
	dek, _ := GenerateDEK()
	recovery, _ := GeneratePaperRecovery("company", dek)

	// Corrupt the blob
	recovery.RecoveryBlob[0] ^= 0xFF

	_, err := RecoverFromMnemonic(recovery.Mnemonic, recovery.RecoveryBlob, "User")
	if err == nil {
		t.Error("Should fail with corrupted blob")
	}
}

// ================================================================================
// DISASTER RECOVERY FLOW TESTS
// ================================================================================

func TestDisasterRecoveryFlow(t *testing.T) {
	// 1. Company created with paper backup
	adminKf, _ := NewKeyfileForNewCompany("Admin")
	paperRecovery, _ := GeneratePaperRecovery(adminKf.CompanyID, adminKf.CompanyDEK)

	// 2. Admin encrypts critical data
	criticalData := map[string]string{
		"secret":   "company_secret_123",
		"bankinfo": "account:12345",
	}
	encrypted, _ := adminKf.EncryptJSON(criticalData)

	// 3. DISASTER: All keyfiles lost
	adminKf = nil // Simulating loss

	// 4. CEO retrieves mnemonic from safe
	mnemonic := paperRecovery.Mnemonic
	recoveryBlob := paperRecovery.RecoveryBlob

	// 5. CEO recovers access
	ceoKf, err := RecoverFromMnemonicWithCompanyID(
		mnemonic,
		recoveryBlob,
		paperRecovery.CompanyID,
		"CEO Emergency Recovery",
	)
	if err != nil {
		t.Fatalf("CEO recovery failed: %v", err)
	}

	// 6. CEO can decrypt critical data
	var recovered map[string]string
	err = ceoKf.DecryptJSON(encrypted, &recovered)
	if err != nil {
		t.Fatalf("CEO couldn't decrypt critical data: %v", err)
	}

	if recovered["secret"] != criticalData["secret"] {
		t.Error("Recovered data doesn't match")
	}

	// 7. CEO can re-grant access to employees
	empRequest, empPartial, _ := PrepareRecoveryRequest(ceoKf.CompanyID, "Employee")
	empGrant, _ := ceoKf.GrantAccessToUser(empRequest, "admin")
	empKf, _ := empPartial.CompleteWithGrant(empGrant)

	// 8. Employee can also decrypt
	var empDecrypted map[string]string
	err = empKf.DecryptJSON(encrypted, &empDecrypted)
	if err != nil {
		t.Fatalf("Employee couldn't decrypt: %v", err)
	}

	if empDecrypted["bankinfo"] != criticalData["bankinfo"] {
		t.Error("Employee decrypted wrong data")
	}
}

// ================================================================================
// EDGE CASES
// ================================================================================

func TestRecovery_EmptyUserLabel(t *testing.T) {
	request, partial, err := PrepareRecoveryRequest("company", "")
	if err != nil {
		t.Fatalf("Should allow empty user label: %v", err)
	}

	if partial.UserLabel != "" {
		t.Error("UserLabel should be empty")
	}
	if request.UserLabel != "" {
		t.Error("Request UserLabel should be empty")
	}
}

func TestRecovery_GrantDifferentRoles(t *testing.T) {
	adminKf, _ := NewKeyfileForNewCompany("Admin")

	roles := []string{"owner", "admin", "member", "readonly"}

	for _, role := range roles {
		request, partial, _ := PrepareRecoveryRequest(adminKf.CompanyID, "User")
		grant, _ := adminKf.GrantAccessToUser(request, role)
		userKf, _ := partial.CompleteWithGrant(grant)

		if userKf.Role != role {
			t.Errorf("Expected role %q, got %q", role, userKf.Role)
		}
	}
}

// ================================================================================
// BENCHMARKS
// ================================================================================

func BenchmarkPrepareRecoveryRequest(b *testing.B) {
	for i := 0; i < b.N; i++ {
		PrepareRecoveryRequest("company", "user")
	}
}

func BenchmarkGrantAccessToUser(b *testing.B) {
	adminKf, _ := NewKeyfileForNewCompany("Admin")
	request, _, _ := PrepareRecoveryRequest(adminKf.CompanyID, "User")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		adminKf.GrantAccessToUser(request, "member")
	}
}

func BenchmarkCompleteWithGrant(b *testing.B) {
	adminKf, _ := NewKeyfileForNewCompany("Admin")
	request, partial, _ := PrepareRecoveryRequest(adminKf.CompanyID, "User")
	grant, _ := adminKf.GrantAccessToUser(request, "member")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		partial.CompleteWithGrant(grant)
	}
}

func BenchmarkGeneratePaperRecovery(b *testing.B) {
	dek, _ := GenerateDEK()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		GeneratePaperRecovery("company", dek)
	}
}

func BenchmarkRecoverFromMnemonic(b *testing.B) {
	dek, _ := GenerateDEK()
	recovery, _ := GeneratePaperRecovery("company", dek)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		RecoverFromMnemonic(recovery.Mnemonic, recovery.RecoveryBlob, "User")
	}
}
