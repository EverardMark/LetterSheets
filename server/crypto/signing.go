package crypto

import (
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"

	"github.com/cloudflare/circl/sign/mldsa/mldsa87"
)

// ================================================================================
// ML-DSA-87 POST-QUANTUM SIGNATURES
// ================================================================================

const (
	SigningPublicKeySize  = mldsa87.PublicKeySize  // 2592 bytes
	SigningPrivateKeySize = mldsa87.PrivateKeySize // 4896 bytes
	SignatureSize         = mldsa87.SignatureSize  // 4627 bytes
)

// SigningKeyPair holds ML-DSA-87 keys
type SigningKeyPair struct {
	PrivateKey []byte
	PublicKey  []byte
}

// GenerateSigningKeyPair generates a new ML-DSA-87 key pair
func GenerateSigningKeyPair() (*SigningKeyPair, error) {
	publicKey, privateKey, err := mldsa87.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("failed to generate ML-DSA-87 key pair: %w", err)
	}

	var pubBytes [SigningPublicKeySize]byte
	publicKey.Pack(&pubBytes)

	var privBytes [SigningPrivateKeySize]byte
	privateKey.Pack(&privBytes)

	return &SigningKeyPair{
		PrivateKey: privBytes[:],
		PublicKey:  pubBytes[:],
	}, nil
}

// Sign signs a message with the private key
func Sign(privateKey, message []byte) ([]byte, error) {
	if len(privateKey) != SigningPrivateKeySize {
		return nil, fmt.Errorf("invalid private key size: got %d, want %d", len(privateKey), SigningPrivateKeySize)
	}

	var privBytes [SigningPrivateKeySize]byte
	copy(privBytes[:], privateKey)

	sk := new(mldsa87.PrivateKey)
	sk.Unpack(&privBytes)

	signature := make([]byte, SignatureSize)
	mldsa87.SignTo(sk, message, nil, false, signature)

	return signature, nil
}

// Verify verifies a signature with the public key
func Verify(publicKey, message, signature []byte) (bool, error) {
	if len(publicKey) != SigningPublicKeySize {
		return false, fmt.Errorf("invalid public key size: got %d, want %d", len(publicKey), SigningPublicKeySize)
	}
	if len(signature) != SignatureSize {
		return false, errors.New("invalid signature size")
	}

	var pubBytes [SigningPublicKeySize]byte
	copy(pubBytes[:], publicKey)

	pk := new(mldsa87.PublicKey)
	pk.Unpack(&pubBytes)

	return mldsa87.Verify(pk, message, nil, signature), nil
}

// HashDocument creates a SHA-256 hash of document for signing
func HashDocument(document []byte) []byte {
	hash := sha256.Sum256(document)
	return hash[:]
}

// SignHash signs a pre-computed hash
func SignHash(privateKey, hash []byte) ([]byte, error) {
	return Sign(privateKey, hash)
}

// VerifyHash verifies a signature against a pre-computed hash
func VerifyHash(publicKey, hash, signature []byte) (bool, error) {
	return Verify(publicKey, hash, signature)
}