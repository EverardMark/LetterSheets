package crypto

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// ================================================================================
// KEYFILE FORMAT
// ================================================================================
// The keyfile is the user's COMPLETE identity. No server login needed.
// Contains:
//   - User identity (key_id, company_id)
//   - Signing keys (ML-DSA-87) for authentication
//   - KEX keys (X25519) for granting access to new users
//   - Company DEK for encrypting/decrypting data
//   - Blind index key for search
//
// Format (encrypted with password):
//   [magic: 5 bytes "LSKEY"]
//   [version: 2 bytes]
//   [salt: 32 bytes]
//   [encrypted_payload: variable]
// ================================================================================

const (
	KeyfileMagic   = "LSKEY"
	KeyfileVersion = uint16(1)
)

// Keyfile represents a user's complete identity and access credentials
type Keyfile struct {
	// Identity
	KeyID     string `json:"key_id"`     // Unique identifier for this key
	CompanyID string `json:"company_id"` // Company this key belongs to
	UserLabel string `json:"user_label"` // Human-readable label (e.g., "Alice's Laptop")
	Role      string `json:"role"`       // owner, admin, member, readonly

	// Signing keys (ML-DSA-87) - for authenticating requests
	SigningPrivateKey []byte `json:"signing_private_key"`
	SigningPublicKey  []byte `json:"signing_public_key"`

	// Key exchange keys (X25519) - for wrapping DEK for new users
	KEXPrivateKey [32]byte `json:"kex_private_key"`
	KEXPublicKey  [32]byte `json:"kex_public_key"`

	// Company Data Encryption Key - for encrypting/decrypting company data
	CompanyDEK []byte `json:"company_dek"`

	// Derived keys (computed from DEK)
	BlindIndexKey BlindIndexKey `json:"blind_index_key"`

	// Metadata
	IssuedAt  time.Time `json:"issued_at"`
	ExpiresAt time.Time `json:"expires_at,omitempty"` // Optional expiration
}

// KeyfileMetadata is unencrypted metadata visible without password
type KeyfileMetadata struct {
	KeyID     string `json:"key_id"`
	CompanyID string `json:"company_id"`
	UserLabel string `json:"user_label"`
	IssuedAt  string `json:"issued_at"`
}

// ================================================================================
// KEYFILE CREATION
// ================================================================================

// NewKeyfile creates a new keyfile with fresh keys
func NewKeyfile(companyID, userLabel, role string, companyDEK []byte) (*Keyfile, error) {
	// Generate key ID
	keyID, err := GenerateKeyID()
	if err != nil {
		return nil, fmt.Errorf("failed to generate key ID: %w", err)
	}

	// Generate signing key pair
	signingKP, err := GenerateSigningKeyPair()
	if err != nil {
		return nil, fmt.Errorf("failed to generate signing keys: %w", err)
	}

	// Generate KEX key pair
	kexKP, err := GenerateX25519KeyPair()
	if err != nil {
		return nil, fmt.Errorf("failed to generate KEX keys: %w", err)
	}

	// Derive blind index key from DEK
	blindKey := DeriveBlindIndexKey(companyDEK)

	return &Keyfile{
		KeyID:             keyID,
		CompanyID:         companyID,
		UserLabel:         userLabel,
		Role:              role,
		SigningPrivateKey: signingKP.PrivateKey,
		SigningPublicKey:  signingKP.PublicKey,
		KEXPrivateKey:     kexKP.PrivateKey,
		KEXPublicKey:      kexKP.PublicKey,
		CompanyDEK:        companyDEK,
		BlindIndexKey:     blindKey,
		IssuedAt:          time.Now().UTC(),
	}, nil
}

// NewKeyfileForNewCompany creates a keyfile for a new company (generates new DEK)
func NewKeyfileForNewCompany(userLabel string) (*Keyfile, error) {
	// Generate company ID
	companyID, err := GenerateCompanyID()
	if err != nil {
		return nil, fmt.Errorf("failed to generate company ID: %w", err)
	}

	// Generate company DEK
	dek, err := GenerateDEK()
	if err != nil {
		return nil, fmt.Errorf("failed to generate DEK: %w", err)
	}

	return NewKeyfile(companyID, userLabel, "owner", dek)
}

// ================================================================================
// KEYFILE SERIALIZATION
// ================================================================================

// Serialize encrypts and serializes the keyfile with password
func (kf *Keyfile) Serialize(password string) ([]byte, error) {
	// Serialize to JSON
	payload, err := json.Marshal(kf)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal keyfile: %w", err)
	}

	// Generate salt
	salt, err := GenerateSalt()
	if err != nil {
		return nil, fmt.Errorf("failed to generate salt: %w", err)
	}

	// Derive key from password
	key := DeriveKeyFromPassword(password, salt)

	// Encrypt payload
	encrypted, err := EncryptAESGCM(key, payload)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt keyfile: %w", err)
	}

	// Build final format
	buf := new(bytes.Buffer)
	buf.WriteString(KeyfileMagic)
	binary.Write(buf, binary.BigEndian, KeyfileVersion)
	buf.Write(salt)
	buf.Write(encrypted)

	return buf.Bytes(), nil
}

// ParseKeyfile decrypts and parses a keyfile
func ParseKeyfile(data []byte, password string) (*Keyfile, error) {
	if len(data) < 5+2+32 {
		return nil, errors.New("keyfile too short")
	}

	// Check magic
	if string(data[:5]) != KeyfileMagic {
		return nil, errors.New("invalid keyfile format")
	}

	// Check version
	version := binary.BigEndian.Uint16(data[5:7])
	if version != KeyfileVersion {
		return nil, fmt.Errorf("unsupported keyfile version: %d", version)
	}

	// Extract salt and encrypted payload
	salt := data[7:39]
	encrypted := data[39:]

	// Derive key from password
	key := DeriveKeyFromPassword(password, salt)

	// Decrypt payload
	payload, err := DecryptAESGCM(key, encrypted)
	if err != nil {
		return nil, errors.New("invalid password or corrupted keyfile")
	}

	// Parse JSON
	var kf Keyfile
	if err := json.Unmarshal(payload, &kf); err != nil {
		return nil, fmt.Errorf("failed to parse keyfile: %w", err)
	}

	// Regenerate derived keys
	kf.BlindIndexKey = DeriveBlindIndexKey(kf.CompanyDEK)

	return &kf, nil
}

// ================================================================================
// DATA ENCRYPTION (using Company DEK)
// ================================================================================

// Encrypt encrypts data using the company DEK
func (kf *Keyfile) Encrypt(plaintext []byte) ([]byte, error) {
	return EncryptAESGCM(kf.CompanyDEK, plaintext)
}

// Decrypt decrypts data using the company DEK
func (kf *Keyfile) Decrypt(ciphertext []byte) ([]byte, error) {
	return DecryptAESGCM(kf.CompanyDEK, ciphertext)
}

// EncryptJSON encrypts a JSON-serializable object
func (kf *Keyfile) EncryptJSON(data interface{}) ([]byte, error) {
	plaintext, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	return kf.Encrypt(plaintext)
}

// DecryptJSON decrypts into a JSON object
func (kf *Keyfile) DecryptJSON(ciphertext []byte, target interface{}) error {
	plaintext, err := kf.Decrypt(ciphertext)
	if err != nil {
		return err
	}
	return json.Unmarshal(plaintext, target)
}

// ================================================================================
// REQUEST SIGNING (for authentication)
// ================================================================================

// SignedRequest is a request signed with the keyfile's signing key
type SignedRequest struct {
	Request   []byte `json:"request"`   // JSON-encoded request data
	Signature []byte `json:"signature"` // ML-DSA-87 signature
	KeyID     string `json:"key_id"`    // Which key signed this
}

// RequestData is the data included in every signed request
type RequestData struct {
	CompanyID string      `json:"company_id"`
	Action    string      `json:"action"`
	Timestamp int64       `json:"timestamp"` // Unix timestamp
	Nonce     string      `json:"nonce"`     // Prevent replay
	Payload   interface{} `json:"payload,omitempty"`
}

// SignRequest signs a request for server authentication
func (kf *Keyfile) SignRequest(action string, payload interface{}) (*SignedRequest, error) {
	nonce, err := GenerateNonce()
	if err != nil {
		return nil, err
	}

	reqData := RequestData{
		CompanyID: kf.CompanyID,
		Action:    action,
		Timestamp: time.Now().Unix(),
		Nonce:     nonce,
		Payload:   payload,
	}

	reqBytes, err := json.Marshal(reqData)
	if err != nil {
		return nil, err
	}

	signature, err := Sign(kf.SigningPrivateKey, reqBytes)
	if err != nil {
		return nil, err
	}

	return &SignedRequest{
		Request:   reqBytes,
		Signature: signature,
		KeyID:     kf.KeyID,
	}, nil
}

// ================================================================================
// ACCESS GRANTING (wrap DEK for new user)
// ================================================================================

// WrapDEKForUser wraps the company DEK for a new user's public key
func (kf *Keyfile) WrapDEKForUser(recipientKEXPublicKey [32]byte) ([]byte, error) {
	return WrapDEK(kf.CompanyDEK, recipientKEXPublicKey)
}

// UnwrapDEKFromGrant unwraps a DEK grant using this keyfile's KEX private key
func (kf *Keyfile) UnwrapDEKFromGrant(wrappedDEK []byte) ([]byte, error) {
	return UnwrapDEK(wrappedDEK, kf.KEXPrivateKey)
}

// ================================================================================
// BLIND INDEX (for searchable encryption)
// ================================================================================

// CreateBlindIndex creates a blind index for a search term
func (kf *Keyfile) CreateBlindIndex(value string) []byte {
	return kf.BlindIndexKey.CreateBlindIndex(value)
}

// ================================================================================
// DOCUMENT SIGNING
// ================================================================================

// SignDocument signs a document and returns the signature
func (kf *Keyfile) SignDocument(document []byte) ([]byte, error) {
	hash := HashDocument(document)
	return Sign(kf.SigningPrivateKey, hash)
}

// VerifyDocumentSignature verifies a document signature (can be done with any keyfile that has the signer's public key)
func VerifyDocumentSignature(signerPublicKey, document, signature []byte) (bool, error) {
	hash := HashDocument(document)
	return Verify(signerPublicKey, hash, signature)
}

// ================================================================================
// UTILITY METHODS
// ================================================================================

// GetPublicInfo returns the public information from this keyfile
func (kf *Keyfile) GetPublicInfo() map[string]interface{} {
	return map[string]interface{}{
		"key_id":             kf.KeyID,
		"company_id":         kf.CompanyID,
		"user_label":         kf.UserLabel,
		"role":               kf.Role,
		"signing_public_key": kf.SigningPublicKey,
		"kex_public_key":     kf.KEXPublicKey[:],
		"issued_at":          kf.IssuedAt,
	}
}

// CanGrantAccess returns true if this keyfile can grant access to new users
func (kf *Keyfile) CanGrantAccess() bool {
	return kf.Role == "owner" || kf.Role == "admin"
}

// IsExpired returns true if the keyfile has expired
func (kf *Keyfile) IsExpired() bool {
	if kf.ExpiresAt.IsZero() {
		return false
	}
	return time.Now().After(kf.ExpiresAt)
}

// SuggestedFilename returns a suggested filename for saving
func (kf *Keyfile) SuggestedFilename() string {
	return fmt.Sprintf("%s_%s.lskey", kf.UserLabel, kf.KeyID[:8])
}
