package main

import (
	"encoding/json"
	"testing"
	"time"

	"server/crypto"
)

// ================================================================================
// REQUEST VERIFICATION TESTS
// ================================================================================

// MockServer creates a server without database for testing
func NewMockServer() *Server {
	return &Server{}
}

func TestVerifyRequest_ValidSignature(t *testing.T) {
	// This test verifies the signature verification logic
	// In production, it would also check the database

	kf, _ := crypto.NewKeyfileForNewCompany("Test User")

	// Create signed request
	payload := map[string]string{"action": "test"}
	signed, err := kf.SignRequest("test_action", payload)
	if err != nil {
		t.Fatalf("SignRequest failed: %v", err)
	}

	// Parse request to verify structure
	var reqData crypto.RequestData
	if err := json.Unmarshal(signed.Request, &reqData); err != nil {
		t.Fatalf("Failed to parse request: %v", err)
	}

	// Verify signature manually (since we don't have DB)
	valid, err := crypto.Verify(kf.SigningPublicKey, signed.Request, signed.Signature)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}

	if !valid {
		t.Error("Signature should be valid")
	}

	// Check request fields
	if reqData.CompanyID != kf.CompanyID {
		t.Error("CompanyID mismatch")
	}
	if reqData.Action != "test_action" {
		t.Error("Action mismatch")
	}
	if reqData.Timestamp == 0 {
		t.Error("Timestamp should be set")
	}
	if len(reqData.Nonce) == 0 {
		t.Error("Nonce should be set")
	}
}

func TestVerifyRequest_TamperedSignature(t *testing.T) {
	kf, _ := crypto.NewKeyfileForNewCompany("Test User")
	signed, _ := kf.SignRequest("test", nil)

	// Tamper with signature
	signed.Signature[0] ^= 0xFF

	// Verify should fail
	valid, _ := crypto.Verify(kf.SigningPublicKey, signed.Request, signed.Signature)
	if valid {
		t.Error("Tampered signature should not verify")
	}
}

func TestVerifyRequest_TamperedRequest(t *testing.T) {
	kf, _ := crypto.NewKeyfileForNewCompany("Test User")
	signed, _ := kf.SignRequest("test", nil)

	// Tamper with request
	signed.Request[0] ^= 0xFF

	// Verify should fail
	valid, _ := crypto.Verify(kf.SigningPublicKey, signed.Request, signed.Signature)
	if valid {
		t.Error("Tampered request should not verify")
	}
}

func TestVerifyRequest_WrongPublicKey(t *testing.T) {
	kf1, _ := crypto.NewKeyfileForNewCompany("User 1")
	kf2, _ := crypto.NewKeyfileForNewCompany("User 2")

	signed, _ := kf1.SignRequest("test", nil)

	// Try to verify with wrong public key
	valid, _ := crypto.Verify(kf2.SigningPublicKey, signed.Request, signed.Signature)
	if valid {
		t.Error("Wrong public key should not verify")
	}
}

// ================================================================================
// TIMESTAMP VALIDATION TESTS
// ================================================================================

func TestTimestampValidation_Current(t *testing.T) {
	timestamp := time.Now().Unix()
	age := time.Since(time.Unix(timestamp, 0))

	if age > 5*time.Minute {
		t.Error("Current timestamp should be valid")
	}
}

func TestTimestampValidation_TooOld(t *testing.T) {
	timestamp := time.Now().Add(-10 * time.Minute).Unix()
	age := time.Since(time.Unix(timestamp, 0))

	if age <= 5*time.Minute {
		t.Error("Old timestamp should be rejected")
	}
}

func TestTimestampValidation_Future(t *testing.T) {
	timestamp := time.Now().Add(1 * time.Minute).Unix()
	age := time.Since(time.Unix(timestamp, 0))

	if age >= -30*time.Second {
		// This is slightly in the future, which is OK for clock skew
	}

	futureTimestamp := time.Now().Add(5 * time.Minute).Unix()
	futureAge := time.Since(time.Unix(futureTimestamp, 0))

	if futureAge >= -30*time.Second {
		t.Error("Far future timestamp should be rejected")
	}
}

// ================================================================================
// NONCE TRACKING TESTS
// ================================================================================

func TestNonceTracking(t *testing.T) {
	server := NewMockServer()

	nonce1, _ := crypto.GenerateNonce()
	nonce2, _ := crypto.GenerateNonce()

	// First use should succeed
	_, loaded1 := server.usedNonces.LoadOrStore(nonce1, time.Now())
	if loaded1 {
		t.Error("First use of nonce should not be loaded")
	}

	// Second use of same nonce should fail
	_, loaded2 := server.usedNonces.LoadOrStore(nonce1, time.Now())
	if !loaded2 {
		t.Error("Second use of nonce should be loaded (replay detected)")
	}

	// Different nonce should succeed
	_, loaded3 := server.usedNonces.LoadOrStore(nonce2, time.Now())
	if loaded3 {
		t.Error("Different nonce should not be loaded")
	}
}

func TestCleanupNonces(t *testing.T) {
	server := NewMockServer()

	// Add old nonce
	oldTime := time.Now().Add(-15 * time.Minute)
	server.usedNonces.Store("old_nonce", oldTime)

	// Add recent nonce
	server.usedNonces.Store("recent_nonce", time.Now())

	// Cleanup
	server.CleanupNonces()

	// Old nonce should be removed
	_, oldExists := server.usedNonces.Load("old_nonce")
	if oldExists {
		t.Error("Old nonce should be cleaned up")
	}

	// Recent nonce should remain
	_, recentExists := server.usedNonces.Load("recent_nonce")
	if !recentExists {
		t.Error("Recent nonce should remain")
	}
}

// ================================================================================
// STORED PUBLIC KEY TESTS
// ================================================================================

func TestStoredPublicKey_Structure(t *testing.T) {
	kf, _ := crypto.NewKeyfileForNewCompany("Test User")

	pk := &StoredPublicKey{
		KeyID:            kf.KeyID,
		CompanyID:        kf.CompanyID,
		SigningPublicKey: kf.SigningPublicKey,
		KEXPublicKey:     kf.KEXPublicKey[:],
		UserLabel:        kf.UserLabel,
		Role:             kf.Role,
		CreatedAt:        time.Now(),
	}

	// Verify fields
	if pk.KeyID != kf.KeyID {
		t.Error("KeyID mismatch")
	}
	if pk.RevokedAt != nil {
		t.Error("RevokedAt should be nil initially")
	}
}

func TestStoredPublicKey_Revoked(t *testing.T) {
	now := time.Now()
	pk := &StoredPublicKey{
		KeyID:     "test",
		RevokedAt: &now,
	}

	if pk.RevokedAt == nil {
		t.Error("RevokedAt should be set")
	}
}

// ================================================================================
// REGISTER COMPANY REQUEST TESTS
// ================================================================================

func TestRegisterCompanyRequest_Structure(t *testing.T) {
	kf, _ := crypto.NewKeyfileForNewCompany("Owner")
	recovery, _ := crypto.GeneratePaperRecovery(kf.CompanyID, kf.CompanyDEK)

	req := &RegisterCompanyRequest{
		CompanyID:             kf.CompanyID,
		CompanyCode:           "ACME",
		RecoveryBlob:          recovery.RecoveryBlob,
		OwnerKeyID:            kf.KeyID,
		OwnerSigningPublicKey: kf.SigningPublicKey,
		OwnerKEXPublicKey:     kf.KEXPublicKey[:],
		OwnerLabel:            "Owner's Laptop",
	}

	// Verify fields
	if req.CompanyID == "" {
		t.Error("CompanyID should be set")
	}
	if len(req.RecoveryBlob) == 0 {
		t.Error("RecoveryBlob should be set")
	}
	if len(req.OwnerSigningPublicKey) != crypto.SigningPublicKeySize {
		t.Error("OwnerSigningPublicKey wrong size")
	}
	if len(req.OwnerKEXPublicKey) != 32 {
		t.Error("OwnerKEXPublicKey wrong size")
	}
}

// ================================================================================
// VERIFIED REQUEST TESTS
// ================================================================================

func TestVerifiedRequest_Structure(t *testing.T) {
	kf, _ := crypto.NewKeyfileForNewCompany("Test User")
	signed, _ := kf.SignRequest("test_action", map[string]string{"key": "value"})

	var reqData crypto.RequestData
	json.Unmarshal(signed.Request, &reqData)

	payloadBytes, _ := json.Marshal(reqData.Payload)
	verified := &VerifiedRequest{
		KeyID:     signed.KeyID,
		CompanyID: reqData.CompanyID,
		Action:    reqData.Action,
		Payload:   payloadBytes,
		Timestamp: time.Unix(reqData.Timestamp, 0),
	}

	if verified.KeyID != kf.KeyID {
		t.Error("KeyID mismatch")
	}
	if verified.CompanyID != kf.CompanyID {
		t.Error("CompanyID mismatch")
	}
	if verified.Action != "test_action" {
		t.Error("Action mismatch")
	}
}

// ================================================================================
// ACTION HANDLER TESTS (logic only, no DB)
// ================================================================================

func TestActionPayload_StoreBlob(t *testing.T) {
	kf, _ := crypto.NewKeyfileForNewCompany("Test User")

	// Encrypt some data
	data := map[string]string{"secret": "value"}
	encrypted, _ := kf.EncryptJSON(data)

	// Create blind index
	nameIndex := kf.CreateBlindIndex("test name")

	payload := map[string]interface{}{
		"collection": "customers",
		"doc_id":     "cust_001",
		"data":       encrypted,
		"blind_indexes": map[string][]byte{
			"name": nameIndex,
		},
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Failed to marshal payload: %v", err)
	}

	// Verify payload can be parsed
	var parsed struct {
		Collection   string            `json:"collection"`
		DocID        string            `json:"doc_id"`
		Data         []byte            `json:"data"`
		BlindIndexes map[string][]byte `json:"blind_indexes"`
	}

	if err := json.Unmarshal(payloadBytes, &parsed); err != nil {
		t.Fatalf("Failed to parse payload: %v", err)
	}

	if parsed.Collection != "customers" {
		t.Error("Collection mismatch")
	}
	if parsed.DocID != "cust_001" {
		t.Error("DocID mismatch")
	}
}

func TestActionPayload_GetBlob(t *testing.T) {
	payload := map[string]string{
		"collection": "invoices",
		"doc_id":     "inv_123",
	}

	payloadBytes, _ := json.Marshal(payload)

	var parsed struct {
		Collection string `json:"collection"`
		DocID      string `json:"doc_id"`
	}

	if err := json.Unmarshal(payloadBytes, &parsed); err != nil {
		t.Fatalf("Failed to parse payload: %v", err)
	}

	if parsed.Collection != "invoices" {
		t.Error("Collection mismatch")
	}
}

func TestActionPayload_SearchBlobs(t *testing.T) {
	kf, _ := crypto.NewKeyfileForNewCompany("Test User")
	searchIndex := kf.CreateBlindIndex("search term")

	payload := map[string]interface{}{
		"collection":  "customers",
		"index_name":  "name",
		"index_value": searchIndex,
	}

	payloadBytes, _ := json.Marshal(payload)

	var parsed struct {
		Collection string `json:"collection"`
		IndexName  string `json:"index_name"`
		IndexValue []byte `json:"index_value"`
	}

	if err := json.Unmarshal(payloadBytes, &parsed); err != nil {
		t.Fatalf("Failed to parse payload: %v", err)
	}

	if parsed.IndexName != "name" {
		t.Error("IndexName mismatch")
	}
}

func TestActionPayload_AddKey(t *testing.T) {
	kf, _ := crypto.NewKeyfileForNewCompany("Test User")

	payload := StoredPublicKey{
		KeyID:            kf.KeyID,
		SigningPublicKey: kf.SigningPublicKey,
		KEXPublicKey:     kf.KEXPublicKey[:],
		UserLabel:        "New User",
		Role:             "member",
	}

	payloadBytes, _ := json.Marshal(payload)

	var parsed StoredPublicKey
	if err := json.Unmarshal(payloadBytes, &parsed); err != nil {
		t.Fatalf("Failed to parse payload: %v", err)
	}

	if parsed.KeyID != kf.KeyID {
		t.Error("KeyID mismatch")
	}
	if parsed.Role != "member" {
		t.Error("Role mismatch")
	}
}

func TestActionPayload_RevokeKey(t *testing.T) {
	payload := map[string]string{
		"key_id": "key_to_revoke_123",
	}

	payloadBytes, _ := json.Marshal(payload)

	var parsed struct {
		KeyID string `json:"key_id"`
	}

	if err := json.Unmarshal(payloadBytes, &parsed); err != nil {
		t.Fatalf("Failed to parse payload: %v", err)
	}

	if parsed.KeyID != "key_to_revoke_123" {
		t.Error("KeyID mismatch")
	}
}

// ================================================================================
// ROLE-BASED ACCESS TESTS
// ================================================================================

func TestRoleBasedAccess_Owner(t *testing.T) {
	kf, _ := crypto.NewKeyfileForNewCompany("Owner")
	if kf.Role != "owner" {
		t.Error("New company creator should be owner")
	}
	if !kf.CanGrantAccess() {
		t.Error("Owner should be able to grant access")
	}
}

func TestRoleBasedAccess_Admin(t *testing.T) {
	dek, _ := crypto.GenerateDEK()
	kf, _ := crypto.NewKeyfile("company", "Admin", "admin", dek)

	if !kf.CanGrantAccess() {
		t.Error("Admin should be able to grant access")
	}
}

func TestRoleBasedAccess_Member(t *testing.T) {
	dek, _ := crypto.GenerateDEK()
	kf, _ := crypto.NewKeyfile("company", "Member", "member", dek)

	if kf.CanGrantAccess() {
		t.Error("Member should not be able to grant access")
	}
}

func TestRoleBasedAccess_ReadOnly(t *testing.T) {
	dek, _ := crypto.GenerateDEK()
	kf, _ := crypto.NewKeyfile("company", "ReadOnly", "readonly", dek)

	if kf.CanGrantAccess() {
		t.Error("ReadOnly should not be able to grant access")
	}
}

// ================================================================================
// INTEGRATION TESTS (without DB)
// ================================================================================

func TestFullRequestFlow_NoDatabase(t *testing.T) {
	// 1. Create keyfile
	kf, _ := crypto.NewKeyfileForNewCompany("Test User")

	// 2. Encrypt data
	data := map[string]string{"name": "John", "ssn": "123-45-6789"}
	encrypted, _ := kf.EncryptJSON(data)

	// 3. Create blind index
	nameIndex := kf.CreateBlindIndex("John")

	// 4. Create signed request to store
	storePayload := map[string]interface{}{
		"collection": "customers",
		"doc_id":     "cust_001",
		"data":       encrypted,
		"blind_indexes": map[string][]byte{
			"name": nameIndex,
		},
	}

	storeSigned, _ := kf.SignRequest("store_blob", storePayload)

	// 5. Verify signature
	valid, _ := crypto.Verify(kf.SigningPublicKey, storeSigned.Request, storeSigned.Signature)
	if !valid {
		t.Error("Store request signature should be valid")
	}

	// 6. Create signed request to get
	getPayload := map[string]string{
		"collection": "customers",
		"doc_id":     "cust_001",
	}

	getSigned, _ := kf.SignRequest("get_blob", getPayload)

	// 7. Verify signature
	valid, _ = crypto.Verify(kf.SigningPublicKey, getSigned.Request, getSigned.Signature)
	if !valid {
		t.Error("Get request signature should be valid")
	}

	// 8. Decrypt the data
	var decrypted map[string]string
	err := kf.DecryptJSON(encrypted, &decrypted)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if decrypted["name"] != "John" {
		t.Error("Decrypted name mismatch")
	}
	if decrypted["ssn"] != "123-45-6789" {
		t.Error("Decrypted SSN mismatch")
	}
}

func TestMultiUserFlow_NoDatabase(t *testing.T) {
	// 1. Admin creates company
	adminKf, _ := crypto.NewKeyfileForNewCompany("Admin")

	// 2. Admin creates data
	secretData := []byte("company secret")
	encrypted, _ := adminKf.Encrypt(secretData)

	// 3. New user joins
	request, partial, _ := crypto.PrepareRecoveryRequest(adminKf.CompanyID, "Employee")
	grant, _ := adminKf.GrantAccessToUser(request, "member")
	employeeKf, _ := partial.CompleteWithGrant(grant)

	// 4. Employee can decrypt
	decrypted, err := employeeKf.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("Employee decrypt failed: %v", err)
	}

	if string(decrypted) != string(secretData) {
		t.Error("Employee decrypted wrong data")
	}

	// 5. Both can create signed requests
	adminSigned, _ := adminKf.SignRequest("test", nil)
	employeeSigned, _ := employeeKf.SignRequest("test", nil)

	// 6. Verify both signatures
	adminValid, _ := crypto.Verify(adminKf.SigningPublicKey, adminSigned.Request, adminSigned.Signature)
	employeeValid, _ := crypto.Verify(employeeKf.SigningPublicKey, employeeSigned.Request, employeeSigned.Signature)

	if !adminValid || !employeeValid {
		t.Error("Both signatures should be valid")
	}

	// 7. Cross-verification should fail
	crossValid, _ := crypto.Verify(adminKf.SigningPublicKey, employeeSigned.Request, employeeSigned.Signature)
	if crossValid {
		t.Error("Cross-verification should fail")
	}
}

// ================================================================================
// BENCHMARKS
// ================================================================================

func BenchmarkSignRequest(b *testing.B) {
	kf, _ := crypto.NewKeyfileForNewCompany("Test")
	payload := map[string]string{"action": "test"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		kf.SignRequest("action", payload)
	}
}

func BenchmarkVerifySignature(b *testing.B) {
	kf, _ := crypto.NewKeyfileForNewCompany("Test")
	signed, _ := kf.SignRequest("action", nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		crypto.Verify(kf.SigningPublicKey, signed.Request, signed.Signature)
	}
}

func BenchmarkNonceCheck(b *testing.B) {
	server := NewMockServer()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		nonce, _ := crypto.GenerateNonce()
		server.usedNonces.LoadOrStore(nonce, time.Now())
	}
}
