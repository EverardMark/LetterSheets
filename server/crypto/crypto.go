package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"

	"io"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/curve25519"
)

// ================================================================================
// AES-256-GCM ENCRYPTION
// ================================================================================

// EncryptAESGCM encrypts data using AES-256-GCM
func EncryptAESGCM(key, plaintext []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, errors.New("key must be 32 bytes")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// DecryptAESGCM decrypts data using AES-256-GCM
func DecryptAESGCM(key, ciphertext []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, errors.New("key must be 32 bytes")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	if len(ciphertext) < gcm.NonceSize() {
		return nil, errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:gcm.NonceSize()], ciphertext[gcm.NonceSize():]
	return gcm.Open(nil, nonce, ciphertext, nil)
}

// ================================================================================
// KEY DERIVATION
// ================================================================================

// DeriveKeyFromPassword derives a 32-byte key from password using Argon2id
func DeriveKeyFromPassword(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, 3, 64*1024, 4, 32)
}

// GenerateSalt generates a random 32-byte salt
func GenerateSalt() ([]byte, error) {
	salt := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, err
	}
	return salt, nil
}

// GenerateRandomBytes generates n random bytes
func GenerateRandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return nil, err
	}
	return b, nil
}

// GenerateRandomHex generates a random hex string of n bytes
func GenerateRandomHex(n int) (string, error) {
	b, err := GenerateRandomBytes(n)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ================================================================================
// X25519 KEY EXCHANGE
// ================================================================================

// X25519KeyPair holds a key exchange key pair
type X25519KeyPair struct {
	PrivateKey [32]byte
	PublicKey  [32]byte
}

// GenerateX25519KeyPair generates a new X25519 key pair
func GenerateX25519KeyPair() (*X25519KeyPair, error) {
	var privateKey [32]byte
	if _, err := io.ReadFull(rand.Reader, privateKey[:]); err != nil {
		return nil, err
	}

	var publicKey [32]byte
	curve25519.ScalarBaseMult(&publicKey, &privateKey)

	return &X25519KeyPair{
		PrivateKey: privateKey,
		PublicKey:  publicKey,
	}, nil
}

// WrapDEK encrypts a DEK for a specific recipient's public key
// Returns: [ephemeral_public_key (32 bytes)][encrypted_dek]
func WrapDEK(dek []byte, recipientPublicKey [32]byte) ([]byte, error) {
	// Generate ephemeral key pair
	ephemeral, err := GenerateX25519KeyPair()
	if err != nil {
		return nil, err
	}

	// Compute shared secret
	var shared [32]byte
	curve25519.ScalarMult(&shared, &ephemeral.PrivateKey, &recipientPublicKey)

	// Derive encryption key from shared secret
	encKey := sha256.Sum256(shared[:])

	// Encrypt DEK
	encrypted, err := EncryptAESGCM(encKey[:], dek)
	if err != nil {
		return nil, err
	}

	// Prepend ephemeral public key
	result := make([]byte, 32+len(encrypted))
	copy(result[:32], ephemeral.PublicKey[:])
	copy(result[32:], encrypted)

	return result, nil
}

// UnwrapDEK decrypts a wrapped DEK using the recipient's private key
func UnwrapDEK(wrappedDEK []byte, privateKey [32]byte) ([]byte, error) {
	if len(wrappedDEK) < 32 {
		return nil, errors.New("wrapped DEK too short")
	}

	// Extract ephemeral public key
	var ephemeralPub [32]byte
	copy(ephemeralPub[:], wrappedDEK[:32])

	// Compute shared secret
	var shared [32]byte
	curve25519.ScalarMult(&shared, &privateKey, &ephemeralPub)

	// Derive encryption key
	encKey := sha256.Sum256(shared[:])

	// Decrypt DEK
	return DecryptAESGCM(encKey[:], wrappedDEK[32:])
}

// ================================================================================
// DEK GENERATION
// ================================================================================

// GenerateDEK generates a new 256-bit Data Encryption Key
func GenerateDEK() ([]byte, error) {
	return GenerateRandomBytes(32)
}

// ================================================================================
// BLIND INDEXES (for searchable encryption)
// ================================================================================

// BlindIndexKey is used to create searchable blind indexes
type BlindIndexKey []byte

// DeriveBlindIndexKey derives a blind index key from DEK
func DeriveBlindIndexKey(dek []byte) BlindIndexKey {
	h := hmac.New(sha256.New, dek)
	h.Write([]byte("blind-index-key-v1"))
	return h.Sum(nil)
}

// CreateBlindIndex creates a blind index for a value
func (k BlindIndexKey) CreateBlindIndex(value string) []byte {
	h := hmac.New(sha256.New, k)
	h.Write([]byte(strings.ToLower(strings.TrimSpace(value))))
	return h.Sum(nil)
}

// ================================================================================
// MNEMONIC (24-word recovery key)
// ================================================================================

// BIP39-like word list (simplified - use proper BIP39 in production)
var wordList = []string{
	"abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
	"absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
	"acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual",
	"adapt", "add", "addict", "address", "adjust", "admit", "adult", "advance",
	"advice", "aerobic", "affair", "afford", "afraid", "again", "age", "agent",
	"agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album",
	"alcohol", "alert", "alien", "all", "alley", "allow", "almost", "alone",
	"alpha", "already", "also", "alter", "always", "amateur", "amazing", "among",
	"amount", "amused", "analyst", "anchor", "ancient", "anger", "angle", "angry",
	"animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique",
	"anxiety", "any", "apart", "apology", "appear", "apple", "approve", "april",
	"arch", "arctic", "area", "arena", "argue", "arm", "armed", "armor",
	"army", "around", "arrange", "arrest", "arrive", "arrow", "art", "artefact",
	"artist", "artwork", "ask", "aspect", "assault", "asset", "assist", "assume",
	"asthma", "athlete", "atom", "attack", "attend", "attitude", "attract", "auction",
	"audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado",
	"avoid", "awake", "aware", "away", "awesome", "awful", "awkward", "axis",
	"baby", "bachelor", "bacon", "badge", "bag", "balance", "balcony", "ball",
	"bamboo", "banana", "banner", "bar", "barely", "bargain", "barrel", "base",
	"basic", "basket", "battle", "beach", "bean", "beauty", "because", "become",
	"beef", "before", "begin", "behave", "behind", "believe", "below", "belt",
	"bench", "benefit", "best", "betray", "better", "between", "beyond", "bicycle",
	"bid", "bike", "bind", "biology", "bird", "birth", "bitter", "black",
	"blade", "blame", "blanket", "blast", "bleak", "bless", "blind", "blood",
	"blossom", "blouse", "blue", "blur", "blush", "board", "boat", "body",
	"boil", "bomb", "bone", "bonus", "book", "boost", "border", "boring",
	"borrow", "boss", "bottom", "bounce", "box", "boy", "bracket", "brain",
	"brand", "brass", "brave", "bread", "breeze", "brick", "bridge", "brief",
	"bright", "bring", "brisk", "broccoli", "broken", "bronze", "broom", "brother",
	"brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb",
	"bulk", "bullet", "bundle", "bunker", "burden", "burger", "burst", "bus",
	"business", "busy", "butter", "buyer", "buzz", "cabbage", "cabin", "cable",
}

// GenerateMnemonic generates a 24-word mnemonic from 32 bytes of entropy
func GenerateMnemonic() (string, []byte, error) {
	entropy, err := GenerateRandomBytes(32)
	if err != nil {
		return "", nil, err
	}

	words := make([]string, 24)
	for i := 0; i < 24; i++ {
		// Use 11 bits per word (simplified - proper BIP39 uses checksum)
		idx := int(entropy[i]) % len(wordList)
		words[i] = wordList[idx]
	}

	return strings.Join(words, " "), entropy, nil
}

// MnemonicToKey derives a 32-byte key from mnemonic
func MnemonicToKey(mnemonic string) []byte {
	// In production, use proper BIP39 derivation
	h := sha256.Sum256([]byte(mnemonic))
	return h[:]
}

// ================================================================================
// HASH UTILITIES
// ================================================================================

// SHA256Hash returns SHA-256 hash of data
func SHA256Hash(data []byte) []byte {
	h := sha256.Sum256(data)
	return h[:]
}

// GenerateKeyID generates a unique key ID
func GenerateKeyID() (string, error) {
	return GenerateRandomHex(16)
}

// GenerateCompanyID generates a unique company ID
func GenerateCompanyID() (string, error) {
	return GenerateRandomHex(16)
}

// GenerateNonce generates a unique nonce for request signing
func GenerateNonce() (string, error) {
	return GenerateRandomHex(16)
}

// ConstantTimeCompare compares two byte slices in constant time
func ConstantTimeCompare(a, b []byte) bool {
	return hmac.Equal(a, b)
}

// FormatKeyID formats a key ID for display
func FormatKeyID(keyID string) string {
	if len(keyID) > 16 {
		return keyID[:8] + "..." + keyID[len(keyID)-4:]
	}
	return keyID
}
