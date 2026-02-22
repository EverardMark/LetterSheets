package api

import (
	"fmt"
	"net/http"
	"time"

	"lettersheets/internal/config"
	"lettersheets/internal/models"
	"lettersheets/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
)

type Handler struct {
	regRepo     *repository.RegistrationRepo
	companyRepo *repository.CompanyRepo
	userRepo    *repository.UserRepo
	accessRepo  *repository.AccessRepo
	sessionRepo *repository.SessionRepo
	historyRepo *repository.ChangeHistoryRepo
	cfg         *config.AppConfig
}

func NewHandler(
	regRepo *repository.RegistrationRepo,
	companyRepo *repository.CompanyRepo,
	userRepo *repository.UserRepo,
	accessRepo *repository.AccessRepo,
	sessionRepo *repository.SessionRepo,
	historyRepo *repository.ChangeHistoryRepo,
	cfg *config.AppConfig,
) *Handler {
	return &Handler{
		regRepo:     regRepo,
		companyRepo: companyRepo,
		userRepo:    userRepo,
		accessRepo:  accessRepo,
		sessionRepo: sessionRepo,
		historyRepo: historyRepo,
		cfg:         cfg,
	}
}

// POST /api/execute?action=xxx
func (h *Handler) Execute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	action := r.URL.Query().Get("action")
	if action == "" {
		Error(w, http.StatusBadRequest, "action parameter is required")
		return
	}

	switch action {

	// ==================== PUBLIC ====================

	case "register":
		h.register(w, r)

	case "login":
		h.login(w, r)

	case "select_company":
		h.selectCompany(w, r)

	case "health":
		JSON(w, http.StatusOK, map[string]string{"status": "ok"})

	// ==================== PROTECTED ====================

	case "logout":
		h.withAuth(w, r, h.logout)

	case "logout_all":
		h.withAuth(w, r, h.logoutAll)

	// Company
	case "get_company":
		h.withAuth(w, r, h.getCompany)

	case "update_company":
		h.withAuth(w, r, h.updateCompany)

	case "delete_company":
		h.withAuth(w, r, h.deleteCompany)

	// User
	case "get_user":
		h.withAuth(w, r, h.getUser)

	case "update_user":
		h.withAuth(w, r, h.updateUser)

	case "change_password":
		h.withAuth(w, r, h.changePassword)

	case "delete_user":
		h.withAuth(w, r, h.deleteUser)

	case "list_users":
		h.withAuth(w, r, h.listUsers)

	case "create_user":
		h.withAuth(w, r, h.createUser)

	// Access
	case "get_user_companies":
		h.withAuth(w, r, h.getUserCompanies)

	case "update_user_access":
		h.withAuth(w, r, h.updateUserAccess)

	case "revoke_user_access":
		h.withAuth(w, r, h.revokeUserAccess)

	// History
	case "get_history":
		h.withAuth(w, r, h.getHistory)

	case "reset_password":
		h.resetPassword(w, r)

	default:
		Error(w, http.StatusBadRequest, "unknown action: "+action)
	}
}

// ==================== AUTH HELPER ====================

type authedHandler func(w http.ResponseWriter, r *http.Request, session *models.UserSession)

func (h *Handler) withAuth(w http.ResponseWriter, r *http.Request, fn authedHandler) {
	token := r.Header.Get("Authorization")
	if token == "" {
		Error(w, http.StatusUnauthorized, "missing authorization header")
		return
	}

	// Support "Bearer <token>"
	if len(token) > 7 && token[:7] == "Bearer " {
		token = token[7:]
	}

	session, err := h.sessionRepo.Validate(r.Context(), token)
	if err != nil {
		Error(w, http.StatusInternalServerError, "session validation failed")
		return
	}
	if session == nil {
		Error(w, http.StatusUnauthorized, "invalid or expired session")
		return
	}

	fn(w, r, session)
}

func getMeta(r *http.Request, session *models.UserSession) *models.RequestMeta {
	return &models.RequestMeta{
		UserID:    session.UserID,
		SessionID: session.ID,
		CompanyID: session.CompanyID,
		IPAddress: r.RemoteAddr,
		UserAgent: r.UserAgent(),
	}
}

// ==================== REGISTER ====================

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.CompanyName == "" || req.Email == "" || req.Username == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "company_name, email, username, and password are required")
		return
	}
	if len(req.WrappedCompanyKey) == 0 || len(req.PublicKey) == 0 {
		Error(w, http.StatusBadRequest, "wrapped_company_key and public_key are required")
		return
	}

	existing, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to check existing user")
		return
	}
	if existing != nil {
		Error(w, http.StatusConflict, "email already registered")
		return
	}

	companyID := uuid.New().String()
	userID := uuid.New().String()
	accessID := uuid.New().String()
	salt := uuid.New().String()
	passwordHash := hashPassword(req.Password, salt)

	err = h.regRepo.Register(r.Context(), &repository.RegisterParams{
		CompanyID:       companyID,
		CompanyName:     req.CompanyName,
		CompanyIndustry: strPtr(req.CompanyIndustry),
		CompanyAddress:  strPtr(req.CompanyAddress),
		CompanyCity:     strPtr(req.CompanyCity),
		CompanyState:    strPtr(req.CompanyState),
		CompanyProvince: strPtr(req.CompanyProvince),
		KeyAlgorithm:    strPtr(req.KeyAlgorithm),

		UserID:       userID,
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: passwordHash,
		Salt:         salt,

		AccessID:          accessID,
		WrappedCompanyKey: req.WrappedCompanyKey,
		KeyWrapAlgorithm:  strPtr(req.KeyWrapAlgorithm),
		PublicKey:         req.PublicKey,

		IPAddress: r.RemoteAddr,
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		Error(w, http.StatusInternalServerError, "registration failed: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"company_id": companyID,
		"user_id":    userID,
		"access_id":  accessID,
		"salt":       salt,
	})
}

// ==================== LOGIN ====================

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "email and password are required")
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "login failed")
		return
	}
	if user == nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
		Error(w, http.StatusForbidden, "account is locked, try again later")
		return
	}

	if !user.IsActive {
		Error(w, http.StatusForbidden, "account is deactivated")
		return
	}

	if !verifyPassword(req.Password, user.Salt, user.PasswordHash) {
		_ = h.userRepo.LoginFailure(r.Context(), user.ID, h.cfg.Server.MaxLoginAttempts, h.cfg.Server.LockoutMinutes)
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	_ = h.userRepo.LoginSuccess(r.Context(), user.ID)

	companies, err := h.accessRepo.GetUserCompanies(r.Context(), user.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get companies")
		return
	}

	JSON(w, http.StatusOK, models.LoginResponse{
		User: &models.User{
			ID:          user.ID,
			Email:       user.Email,
			Username:    user.Username,
			IsActive:    user.IsActive,
			LastLoginAt: user.LastLoginAt,
			CreatedAt:   user.CreatedAt,
			UpdatedAt:   user.UpdatedAt,
		},
		Companies: companies,
	})
}

// ==================== SELECT COMPANY ====================

func (h *Handler) selectCompany(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID     string `json:"user_id"`
		CompanyID  string `json:"company_id"`
		DeviceInfo string `json:"device_info"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.UserID == "" || req.CompanyID == "" {
		Error(w, http.StatusBadRequest, "user_id and company_id are required")
		return
	}

	companies, err := h.accessRepo.GetUserCompanies(r.Context(), req.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to verify access")
		return
	}

	var access *models.UserCompanyAccess
	for _, c := range companies {
		if c.CompanyID == req.CompanyID {
			access = &c
			break
		}
	}

	if access == nil {
		Error(w, http.StatusForbidden, "no access to this company")
		return
	}

	sessionID := uuid.New().String()
	expiresAt := time.Now().Add(time.Duration(h.cfg.Server.SessionHours) * time.Hour)

	err = h.sessionRepo.Create(r.Context(), sessionID, req.UserID, req.CompanyID, req.DeviceInfo, r.RemoteAddr, expiresAt)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"session_id":          sessionID,
		"expires_at":          expiresAt,
		"wrapped_company_key": access.WrappedCompanyKey,
		"key_wrap_algorithm":  access.KeyWrapAlgorithm,
		"key_version":         access.KeyVersion,
		"role":                access.Role,
		"permissions":         access.Permissions,
	})
}

// ==================== LOGOUT ====================

func (h *Handler) logout(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if err := h.sessionRepo.Invalidate(r.Context(), session.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to logout")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

func (h *Handler) logoutAll(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if err := h.sessionRepo.InvalidateAll(r.Context(), session.UserID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to logout all sessions")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "all sessions invalidated"})
}

// ==================== COMPANY ====================

func (h *Handler) getCompany(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	company, err := h.companyRepo.GetByID(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get company")
		return
	}
	if company == nil {
		Error(w, http.StatusNotFound, "company not found")
		return
	}
	JSON(w, http.StatusOK, company)
}

func (h *Handler) updateCompany(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		Name         *string `json:"name"`
		Industry     *string `json:"industry"`
		Address      *string `json:"address"`
		City         *string `json:"city"`
		State        *string `json:"state"`
		Province     *string `json:"province"`
		MaxEmployees *int    `json:"max_employees"`
		Plan         *string `json:"plan"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	company := &models.Company{ID: session.CompanyID}
	if req.Name != nil {
		company.Name = *req.Name
	}
	if req.Industry != nil {
		company.Industry = req.Industry
	}
	if req.Address != nil {
		company.Address = req.Address
	}
	if req.City != nil {
		company.City = req.City
	}
	if req.State != nil {
		company.State = req.State
	}
	if req.Province != nil {
		company.Province = req.Province
	}
	if req.MaxEmployees != nil {
		company.MaxEmployees = *req.MaxEmployees
	}
	if req.Plan != nil {
		company.Plan = *req.Plan
	}

	meta := getMeta(r, session)
	if err := h.companyRepo.Update(r.Context(), company, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update company")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "company updated"})
}

func (h *Handler) deleteCompany(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin {
		Error(w, http.StatusForbidden, "only superadmin can delete company")
		return
	}

	meta := getMeta(r, session)
	if err := h.companyRepo.Delete(r.Context(), session.CompanyID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete company")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "company deactivated"})
}

// ==================== USER ====================

func (h *Handler) getUser(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	user, err := h.userRepo.GetByID(r.Context(), session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	if user == nil {
		Error(w, http.StatusNotFound, "user not found")
		return
	}
	JSON(w, http.StatusOK, user)
}

func (h *Handler) updateUser(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Email    *string `json:"email"`
		Username *string `json:"username"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user := &models.User{ID: session.UserID}
	if req.Email != nil {
		user.Email = *req.Email
	}
	if req.Username != nil {
		user.Username = *req.Username
	}

	meta := getMeta(r, session)
	if err := h.userRepo.Update(r.Context(), user, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update user")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "user updated"})
}

func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		Error(w, http.StatusBadRequest, "current_password and new_password are required")
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), session.Email)
	if err != nil || user == nil {
		Error(w, http.StatusInternalServerError, "failed to verify user")
		return
	}

	if !verifyPassword(req.CurrentPassword, user.Salt, user.PasswordHash) {
		Error(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	newSalt := uuid.New().String()
	newHash := hashPassword(req.NewPassword, newSalt)

	meta := getMeta(r, session)
	if err := h.userRepo.ChangePassword(r.Context(), session.UserID, newHash, newSalt, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to change password")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"message":  "password changed",
		"new_salt": newSalt,
	})
}

func (h *Handler) deleteUser(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		UserID string `json:"user_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.UserID == "" {
		Error(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if req.UserID == session.UserID {
		Error(w, http.StatusForbidden, "cannot delete yourself")
		return
	}

	meta := getMeta(r, session)
	if err := h.userRepo.Delete(r.Context(), req.UserID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to deactivate user")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "user deactivated"})
}

func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin && session.Role != models.RoleHR {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	users, err := h.accessRepo.GetCompanyUsers(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	JSON(w, http.StatusOK, users)
}

func (h *Handler) createUser(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		Email             string `json:"email"`
		Username          string `json:"username"`
		Password          string `json:"password"`
		Role              string `json:"role"`
		WrappedCompanyKey []byte `json:"wrapped_company_key"`
		KeyWrapAlgorithm  string `json:"key_wrap_algorithm"`
		PublicKey         []byte `json:"public_key"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Username == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "email, username, and password are required")
		return
	}
	if len(req.WrappedCompanyKey) == 0 || len(req.PublicKey) == 0 {
		Error(w, http.StatusBadRequest, "wrapped_company_key and public_key are required")
		return
	}

	existing, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to check existing user")
		return
	}
	if existing != nil {
		Error(w, http.StatusConflict, "email already registered")
		return
	}

	role := req.Role
	if role == "" {
		role = models.RoleEmployee
	}
	if role == models.RoleSuperAdmin {
		Error(w, http.StatusForbidden, "cannot create superadmin")
		return
	}

	userID := uuid.New().String()
	salt := uuid.New().String()
	passwordHash := hashPassword(req.Password, salt)

	meta := getMeta(r, session)
	err = h.userRepo.Create(r.Context(), &models.User{
		ID:           userID,
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: passwordHash,
		Salt:         salt,
	}, meta)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	accessID := uuid.New().String()
	algorithm := req.KeyWrapAlgorithm
	if algorithm == "" {
		algorithm = "AES-256-KW"
	}

	err = h.accessRepo.Create(r.Context(), &models.UserCompanyAccess{
		ID:                accessID,
		UserID:            userID,
		CompanyID:         session.CompanyID,
		WrappedCompanyKey: req.WrappedCompanyKey,
		KeyWrapAlgorithm:  algorithm,
		PublicKey:         req.PublicKey,
		Role:              role,
	}, meta)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to grant company access")
		return
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"user_id":   userID,
		"access_id": accessID,
		"salt":      salt,
	})
}

// ==================== ACCESS ====================

func (h *Handler) getUserCompanies(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	companies, err := h.accessRepo.GetUserCompanies(r.Context(), session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get companies")
		return
	}
	JSON(w, http.StatusOK, companies)
}

func (h *Handler) updateUserAccess(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		AccessID          string  `json:"access_id"`
		Role              *string `json:"role"`
		Permissions       *string `json:"permissions"`
		WrappedCompanyKey []byte  `json:"wrapped_company_key"`
		KeyWrapAlgorithm  *string `json:"key_wrap_algorithm"`
		KeyVersion        *int    `json:"key_version"`
		PublicKey         []byte  `json:"public_key"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.AccessID == "" {
		Error(w, http.StatusBadRequest, "access_id is required")
		return
	}

	access := &models.UserCompanyAccess{ID: req.AccessID}
	if req.Role != nil {
		access.Role = *req.Role
	}
	if req.Permissions != nil {
		access.Permissions = req.Permissions
	}
	if req.WrappedCompanyKey != nil {
		access.WrappedCompanyKey = req.WrappedCompanyKey
	}
	if req.KeyWrapAlgorithm != nil {
		access.KeyWrapAlgorithm = *req.KeyWrapAlgorithm
	}
	if req.KeyVersion != nil {
		access.KeyVersion = *req.KeyVersion
	}
	if req.PublicKey != nil {
		access.PublicKey = req.PublicKey
	}

	meta := getMeta(r, session)
	if err := h.accessRepo.Update(r.Context(), access, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update access")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "access updated"})
}

func (h *Handler) revokeUserAccess(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		AccessID string `json:"access_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.AccessID == "" {
		Error(w, http.StatusBadRequest, "access_id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.accessRepo.Delete(r.Context(), req.AccessID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to revoke access")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "access revoked"})
}

// ==================== HISTORY ====================

func (h *Handler) getHistory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin && session.Role != models.RoleHR {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		TableName *string `json:"table_name"`
		RecordID  *string `json:"record_id"`
		Limit     *int    `json:"limit"`
		Offset    *int    `json:"offset"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	limit := 50
	if req.Limit != nil && *req.Limit > 0 && *req.Limit <= 200 {
		limit = *req.Limit
	}

	offset := 0
	if req.Offset != nil && *req.Offset >= 0 {
		offset = *req.Offset
	}

	history, err := h.historyRepo.Get(r.Context(), session.CompanyID, req.TableName, req.RecordID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get change history")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"records": history,
		"limit":   limit,
		"offset":  offset,
	})
}

// ==================== HELPERS ====================

func hashPassword(password, salt string) string {
	hash := argon2.IDKey([]byte(password), []byte(salt), 1, 64*1024, 4, 32)
	return fmt.Sprintf("%x", hash)
}

func verifyPassword(password, salt, storedHash string) bool {
	return hashPassword(password, salt) == storedHash
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (h *Handler) resetPassword(w http.ResponseWriter, r *http.Request) {
	var req models.ResetPasswordRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" || req.Salt == "" {
		Error(w, http.StatusBadRequest, "email, password, and salt are required")
		return
	}
	if req.WrappedCompanyKey == "" || req.PublicKey == "" {
		Error(w, http.StatusBadRequest, "wrapped_company_key and public_key are required")
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil || user == nil {
		Error(w, http.StatusNotFound, "user not found")
		return
	}

	passwordHash := hashPassword(req.Password, req.Salt)

	err = h.userRepo.ResetPasswordWithKey(r.Context(), user.ID, passwordHash, req.Salt,
		req.WrappedCompanyKey, req.KeyWrapAlgorithm, req.PublicKey,
		r.RemoteAddr, r.UserAgent())
	if err != nil {
		Error(w, http.StatusInternalServerError, "password reset failed: "+err.Error())
		return
	}

	JSON(w, http.StatusOK, map[string]string{"status": "password reset successful"})
}
