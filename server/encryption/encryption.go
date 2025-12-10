package encryption

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"server/crypto"
	"server/db"
)

// ================================================================================
// SERVER
// ================================================================================

type Server struct {
	db         *db.MySQLDB
	usedNonces sync.Map
}

func NewServer(database *db.MySQLDB) *Server {
	s := &Server{db: database}
	go s.nonceCleanupLoop()
	return s
}

func (s *Server) nonceCleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		cutoff := time.Now().Add(-10 * time.Minute).Unix()
		s.usedNonces.Range(func(key, value interface{}) bool {
			if ts, ok := value.(int64); ok && ts < cutoff {
				s.usedNonces.Delete(key)
			}
			return true
		})
	}
}

// ================================================================================
// REQUEST/RESPONSE TYPES
// ================================================================================

type RegisterRequest struct {
	CompanyCode           string `json:"company_code"`
	CompanyName           string `json:"company_name"`
	RecoveryBlob          []byte `json:"recovery_blob"`
	OwnerKeyID            string `json:"owner_key_id"`
	OwnerSigningPublicKey []byte `json:"owner_signing_public_key"`
	OwnerKEXPublicKey     []byte `json:"owner_kex_public_key"`
	OwnerLabel            string `json:"owner_label"`
}

type EnableRequest struct {
	CompanyCode           string `json:"company_code"`
	RecoveryBlob          []byte `json:"recovery_blob"`
	OwnerKeyID            string `json:"owner_key_id"`
	OwnerSigningPublicKey []byte `json:"owner_signing_public_key"`
	OwnerKEXPublicKey     []byte `json:"owner_kex_public_key"`
	OwnerLabel            string `json:"owner_label"`
}

type SignedRequest struct {
	Request   []byte `json:"request"`
	Signature []byte `json:"signature"`
	KeyID     string `json:"key_id"`
}

type RequestData struct {
	CompanyID uint64      `json:"company_id"`
	Action    string      `json:"action"`
	Timestamp int64       `json:"timestamp"`
	Nonce     string      `json:"nonce"`
	Payload   interface{} `json:"payload,omitempty"`
}

type VerifiedRequest struct {
	KeyID     string
	CompanyID uint64
	Action    string
	Payload   json.RawMessage
	Timestamp time.Time
}

type StoredPublicKey struct {
	KeyID            string     `json:"key_id"`
	CompanyID        uint64     `json:"company_id"`
	SigningPublicKey []byte     `json:"signing_public_key"`
	KEXPublicKey     []byte     `json:"kex_public_key"`
	UserLabel        string     `json:"user_label"`
	Role             string     `json:"role"`
	CreatedAt        time.Time  `json:"created_at"`
	RevokedAt        *time.Time `json:"revoked_at,omitempty"`
}

// ================================================================================
// RESPONSE HELPERS
// ================================================================================

type errorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Code    int    `json:"code"`
}

type successResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Status  int         `json:"status"`
}

func sendError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(errorResponse{
		Error:   http.StatusText(code),
		Message: message,
		Code:    code,
	})
}

func sendSuccess(w http.ResponseWriter, message string, data interface{}, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(successResponse{
		Message: message,
		Data:    data,
		Status:  code,
	})
}

// ================================================================================
// HTTP HANDLERS
// ================================================================================

func (s *Server) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	var req RegisterRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		sendError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.CompanyCode == "" {
		sendError(w, "company_code required", http.StatusBadRequest)
		return
	}
	if req.OwnerKeyID == "" || len(req.OwnerSigningPublicKey) == 0 {
		sendError(w, "Owner key information required", http.StatusBadRequest)
		return
	}

	companyID, err := s.RegisterNewCompany(&req)
	if err != nil {
		sendError(w, fmt.Sprintf("Registration failed: %v", err), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, "Company registered", map[string]interface{}{
		"company_id":   companyID,
		"company_code": req.CompanyCode,
		"key_id":       req.OwnerKeyID,
	}, http.StatusCreated)

	log.Printf("Encryption: Registered new company %d (%s)", companyID, req.CompanyCode)
}

func (s *Server) EnableHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	var req EnableRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		sendError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.CompanyCode == "" {
		sendError(w, "company_code required", http.StatusBadRequest)
		return
	}

	companyID, err := s.EnableForCompany(&req)
	if err != nil {
		sendError(w, fmt.Sprintf("Failed: %v", err), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, "Encryption enabled", map[string]interface{}{
		"company_id":   companyID,
		"company_code": req.CompanyCode,
		"key_id":       req.OwnerKeyID,
	}, http.StatusCreated)

	log.Printf("Encryption: Enabled for company %d (%s)", companyID, req.CompanyCode)
}

func (s *Server) RequestHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	var signedReq SignedRequest
	if err := json.Unmarshal(bodyBytes, &signedReq); err != nil {
		sendError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	verified, err := s.VerifyRequest(&signedReq)
	if err != nil {
		sendError(w, fmt.Sprintf("Auth failed: %v", err), http.StatusUnauthorized)
		return
	}

	result, err := s.HandleAction(verified)
	if err != nil {
		sendError(w, fmt.Sprintf("Action failed: %v", err), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, "OK", result, http.StatusOK)
}

func (s *Server) RecoveryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	var req struct {
		CompanyCode string `json:"company_code"`
	}
	json.Unmarshal(bodyBytes, &req)

	companyID, blob, err := s.GetRecoveryBlobByCode(req.CompanyCode)
	if err != nil {
		sendError(w, "Recovery blob not found", http.StatusNotFound)
		return
	}

	sendSuccess(w, "OK", map[string]interface{}{
		"recovery_blob": blob,
		"company_id":    companyID,
	}, http.StatusOK)
}

// ================================================================================
// CORE LOGIC (using stored procedures)
// ================================================================================

func (s *Server) RegisterNewCompany(req *RegisterRequest) (uint64, error) {
	// Check if company exists
	var exists int
	_, err := s.db.DB.Exec(`CALL sp_encryption_company_exists(?, @exists)`, req.CompanyCode)
	if err != nil {
		return 0, fmt.Errorf("database error: %w", err)
	}
	s.db.DB.QueryRow(`SELECT @exists`).Scan(&exists)
	if exists > 0 {
		return 0, fmt.Errorf("company code already exists")
	}

	// Get company status
	var statusID int64
	s.db.DB.Exec(`CALL sp_encryption_get_company_status(@sid)`)
	s.db.DB.QueryRow(`SELECT @sid`).Scan(&statusID)
	if statusID == 0 {
		return 0, fmt.Errorf("no valid status found")
	}

	tx, err := s.db.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	companyName := req.CompanyName
	if companyName == "" {
		companyName = req.CompanyCode
	}

	// Register company
	var companyID int64
	_, err = tx.Exec(`CALL sp_encryption_register_company(?, ?, ?, ?, @cid)`,
		req.CompanyCode, []byte(companyName), req.RecoveryBlob, statusID)
	if err != nil {
		return 0, fmt.Errorf("failed to create company: %w", err)
	}
	tx.QueryRow(`SELECT @cid`).Scan(&companyID)

	// Get user status
	var userStatusID int64
	tx.Exec(`CALL sp_encryption_get_user_status(@usid)`)
	tx.QueryRow(`SELECT @usid`).Scan(&userStatusID)
	if userStatusID == 0 {
		userStatusID = statusID
	}

	// Create owner
	_, err = tx.Exec(`CALL sp_encryption_create_owner(?, ?, ?, ?, ?, ?)`,
		req.OwnerKeyID, companyID, []byte(req.OwnerLabel),
		req.OwnerSigningPublicKey, req.OwnerKEXPublicKey, userStatusID)
	if err != nil {
		return 0, fmt.Errorf("failed to create owner: %w", err)
	}

	return uint64(companyID), tx.Commit()
}

func (s *Server) EnableForCompany(req *EnableRequest) (uint64, error) {
	var companyID int64
	var alreadyEnabled int
	_, err := s.db.DB.Exec(`CALL sp_encryption_enable_company(?, ?, @cid, @enabled)`,
		req.CompanyCode, req.RecoveryBlob)
	if err != nil {
		return 0, fmt.Errorf("database error: %w", err)
	}
	s.db.DB.QueryRow(`SELECT @cid, @enabled`).Scan(&companyID, &alreadyEnabled)
	if companyID == 0 {
		return 0, fmt.Errorf("company not found")
	}
	if alreadyEnabled == 1 {
		return 0, fmt.Errorf("encryption already enabled")
	}

	// Get user status
	var userStatusID int64
	s.db.DB.Exec(`CALL sp_encryption_get_user_status(@usid)`)
	s.db.DB.QueryRow(`SELECT @usid`).Scan(&userStatusID)

	// Create owner
	_, err = s.db.DB.Exec(`CALL sp_encryption_create_owner(?, ?, ?, ?, ?, ?)`,
		req.OwnerKeyID, companyID, []byte(req.OwnerLabel),
		req.OwnerSigningPublicKey, req.OwnerKEXPublicKey, userStatusID)
	if err != nil {
		return 0, err
	}

	return uint64(companyID), nil
}

func (s *Server) GetPublicKey(keyID string) (*StoredPublicKey, error) {
	row := s.db.DB.QueryRow(`CALL sp_encryption_get_public_key(?)`, keyID)

	var pk StoredPublicKey
	var revokedAt *time.Time
	var userLabel []byte
	err := row.Scan(&pk.KeyID, &pk.CompanyID, &pk.SigningPublicKey, &pk.KEXPublicKey,
		&userLabel, &pk.Role, &pk.CreatedAt, &revokedAt)
	if err != nil {
		return nil, err
	}
	pk.UserLabel = string(userLabel)
	pk.RevokedAt = revokedAt
	return &pk, nil
}

func (s *Server) GetRecoveryBlobByCode(companyCode string) (uint64, []byte, error) {
	var companyID uint64
	var blob []byte
	_, err := s.db.DB.Exec(`CALL sp_encryption_get_recovery_blob(?, @cid, @blob)`, companyCode)
	if err != nil {
		return 0, nil, err
	}
	err = s.db.DB.QueryRow(`SELECT @cid, @blob`).Scan(&companyID, &blob)
	return companyID, blob, err
}

func (s *Server) VerifyRequest(req *SignedRequest) (*VerifiedRequest, error) {
	pk, err := s.GetPublicKey(req.KeyID)
	if err != nil {
		return nil, fmt.Errorf("key not found: %w", err)
	}

	if pk.RevokedAt != nil {
		return nil, fmt.Errorf("key has been revoked")
	}

	valid, err := crypto.Verify(pk.SigningPublicKey, req.Request, req.Signature)
	if err != nil || !valid {
		return nil, fmt.Errorf("invalid signature")
	}

	var data RequestData
	if err := json.Unmarshal(req.Request, &data); err != nil {
		return nil, fmt.Errorf("invalid request format")
	}

	if data.CompanyID != pk.CompanyID {
		return nil, fmt.Errorf("company_id mismatch")
	}

	now := time.Now().Unix()
	if data.Timestamp < now-300 || data.Timestamp > now+60 {
		return nil, fmt.Errorf("request expired")
	}

	nonceKey := fmt.Sprintf("%s:%s", req.KeyID, data.Nonce)
	if _, loaded := s.usedNonces.LoadOrStore(nonceKey, data.Timestamp); loaded {
		return nil, fmt.Errorf("nonce already used")
	}

	payloadBytes, _ := json.Marshal(data.Payload)
	return &VerifiedRequest{
		KeyID:     req.KeyID,
		CompanyID: pk.CompanyID,
		Action:    data.Action,
		Payload:   payloadBytes,
		Timestamp: time.Unix(data.Timestamp, 0),
	}, nil
}

func (s *Server) HandleAction(v *VerifiedRequest) (interface{}, error) {
	switch v.Action {
	case "store_blob":
		return s.handleStoreBlob(v)
	case "get_blob":
		return s.handleGetBlob(v)
	case "list_blobs":
		return s.handleListBlobs(v)
	case "search_blobs":
		return s.handleSearchBlobs(v)
	case "delete_blob":
		return s.handleDeleteBlob(v)
	case "add_key":
		return s.handleAddKey(v)
	case "revoke_key":
		return s.handleRevokeKey(v)
	case "list_keys":
		return s.handleListKeys(v)
	case "get_public_key":
		return s.handleGetPublicKey(v)
	default:
		return nil, fmt.Errorf("unknown action: %s", v.Action)
	}
}

// ================================================================================
// ACTION HANDLERS (using stored procedures)
// ================================================================================

func (s *Server) handleStoreBlob(v *VerifiedRequest) (interface{}, error) {
	var p struct {
		Collection   string            `json:"collection"`
		DocID        string            `json:"doc_id"`
		Data         []byte            `json:"data"`
		BlindIndexes map[string][]byte `json:"blind_indexes"`
	}
	if err := json.Unmarshal(v.Payload, &p); err != nil {
		return nil, err
	}

	hexIndexes := make(map[string]string)
	for k, v := range p.BlindIndexes {
		hexIndexes[k] = fmt.Sprintf("%x", v)
	}
	indexJSON, _ := json.Marshal(hexIndexes)

	_, err := s.db.DB.Exec(`CALL sp_encryption_store_blob(?, ?, ?, ?, ?)`,
		v.CompanyID, p.Collection, p.DocID, p.Data, indexJSON)
	return map[string]bool{"success": err == nil}, err
}

func (s *Server) handleGetBlob(v *VerifiedRequest) (interface{}, error) {
	var p struct {
		Collection string `json:"collection"`
		DocID      string `json:"doc_id"`
	}
	json.Unmarshal(v.Payload, &p)

	var data []byte
	err := s.db.DB.QueryRow(`CALL sp_encryption_get_blob(?, ?, ?)`,
		v.CompanyID, p.Collection, p.DocID).Scan(&data)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"data": data}, nil
}

func (s *Server) handleListBlobs(v *VerifiedRequest) (interface{}, error) {
	var p struct {
		Collection string `json:"collection"`
	}
	json.Unmarshal(v.Payload, &p)

	rows, err := s.db.DB.Query(`CALL sp_encryption_list_blobs(?, ?)`,
		v.CompanyID, p.Collection)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	return map[string]interface{}{"doc_ids": ids}, nil
}

func (s *Server) handleSearchBlobs(v *VerifiedRequest) (interface{}, error) {
	var p struct {
		Collection string `json:"collection"`
		IndexName  string `json:"index_name"`
		IndexValue []byte `json:"index_value"`
	}
	json.Unmarshal(v.Payload, &p)

	hexValue := fmt.Sprintf("%x", p.IndexValue)
	rows, err := s.db.DB.Query(`CALL sp_encryption_search_blobs(?, ?, ?, ?)`,
		v.CompanyID, p.Collection, p.IndexName, hexValue)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	return map[string]interface{}{"doc_ids": ids}, nil
}

func (s *Server) handleDeleteBlob(v *VerifiedRequest) (interface{}, error) {
	var p struct {
		Collection string `json:"collection"`
		DocID      string `json:"doc_id"`
	}
	json.Unmarshal(v.Payload, &p)

	_, err := s.db.DB.Exec(`CALL sp_encryption_delete_blob(?, ?, ?)`,
		v.CompanyID, p.Collection, p.DocID)
	return map[string]bool{"success": err == nil}, err
}

func (s *Server) handleAddKey(v *VerifiedRequest) (interface{}, error) {
	requester, _ := s.GetPublicKey(v.KeyID)
	if requester.Role != "owner" && requester.Role != "admin" {
		return nil, fmt.Errorf("permission denied")
	}

	var p struct {
		KeyID            string `json:"key_id"`
		SigningPublicKey []byte `json:"signing_public_key"`
		KEXPublicKey     []byte `json:"kex_public_key"`
		UserLabel        string `json:"user_label"`
		Role             string `json:"role"`
	}
	json.Unmarshal(v.Payload, &p)

	var userStatusID int64
	s.db.DB.Exec(`CALL sp_encryption_get_user_status(@usid)`)
	s.db.DB.QueryRow(`SELECT @usid`).Scan(&userStatusID)

	_, err := s.db.DB.Exec(`CALL sp_encryption_add_key(?, ?, ?, ?, ?, ?, ?)`,
		p.KeyID, v.CompanyID, []byte(p.UserLabel),
		p.SigningPublicKey, p.KEXPublicKey, p.Role, userStatusID)
	return map[string]bool{"success": err == nil}, err
}

func (s *Server) handleRevokeKey(v *VerifiedRequest) (interface{}, error) {
	requester, _ := s.GetPublicKey(v.KeyID)
	if requester.Role != "owner" && requester.Role != "admin" {
		return nil, fmt.Errorf("permission denied")
	}

	var p struct {
		KeyID string `json:"key_id"`
	}
	json.Unmarshal(v.Payload, &p)

	target, err := s.GetPublicKey(p.KeyID)
	if err != nil {
		return nil, fmt.Errorf("key not found")
	}

	// Admin can only revoke member, not other admins or owner
	if requester.Role == "admin" {
		if target.Role == "owner" || target.Role == "admin" {
			return nil, fmt.Errorf("admin cannot revoke owner or other admins")
		}
	}

	_, err = s.db.DB.Exec(`CALL sp_encryption_revoke_key(?, ?)`, p.KeyID, v.CompanyID)
	return map[string]bool{"success": err == nil}, err
}

func (s *Server) handleListKeys(v *VerifiedRequest) (interface{}, error) {
	rows, err := s.db.DB.Query(`CALL sp_encryption_list_keys(?)`, v.CompanyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []StoredPublicKey
	for rows.Next() {
		var pk StoredPublicKey
		var revokedAt *time.Time
		var userLabel []byte
		rows.Scan(&pk.KeyID, &pk.CompanyID, &pk.SigningPublicKey, &pk.KEXPublicKey,
			&userLabel, &pk.Role, &pk.CreatedAt, &revokedAt)
		pk.UserLabel = string(userLabel)
		pk.RevokedAt = revokedAt
		keys = append(keys, pk)
	}
	return map[string]interface{}{"keys": keys}, nil
}

func (s *Server) handleGetPublicKey(v *VerifiedRequest) (interface{}, error) {
	var p struct {
		KeyID string `json:"key_id"`
	}
	json.Unmarshal(v.Payload, &p)

	pk, err := s.GetPublicKey(p.KeyID)
	if err != nil || pk.CompanyID != v.CompanyID {
		return nil, fmt.Errorf("key not found")
	}
	return pk, nil
}
