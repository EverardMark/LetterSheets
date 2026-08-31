package api

import (
	"encoding/base64"
	"net/http"

	"github.com/google/uuid"

	"lettersheets/internal/models"
)

// ==================== FACE TEMPLATES ====================
//
// Face-recognition enrollment for the time clock (app/faceclock).
//
// The server is deliberately a dumb store here. Embeddings arrive encrypted
// with the company key and are handed back the same way, so no endpoint below
// can match faces, and a database dump yields ciphertext rather than a roster
// of biometrics. Matching runs on the kiosk, which already holds the company
// key from device sign-in.

// maxEmbeddingEnc bounds the ciphertext a client may store. A 512-float32
// embedding encrypts to roughly 2.8KB of base64; 64KB leaves room for larger
// models while stopping the column being used as general-purpose storage.
const maxEmbeddingEnc = 64 * 1024

// getFaceTemplates returns the enrolled roster so a kiosk can sync and match
// locally. Read-only and scoped to the session's company.
func (h *Handler) getFaceTemplates(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	templates, err := h.faceRepo.GetByCompany(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get face templates: "+err.Error())
		return
	}
	if templates == nil {
		templates = []models.FaceTemplate{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{
		"face_templates": templates,
	})
}

// saveFaceTemplate enrolls or re-enrolls one employee.
func (h *Handler) saveFaceTemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		EmployeeID   string  `json:"employee_id"`
		EmbeddingEnc string  `json:"embedding_enc"`
		Model        string  `json:"model"`
		Dims         int     `json:"dims"`
		Quality      float64 `json:"quality"`
		Device       string  `json:"device"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.EmployeeID == "" || req.EmbeddingEnc == "" {
		Error(w, http.StatusBadRequest, "employee_id and embedding_enc are required")
		return
	}
	if len(req.EmbeddingEnc) > maxEmbeddingEnc {
		Error(w, http.StatusBadRequest, "embedding_enc is too large")
		return
	}

	// The server cannot read the embedding, but it can insist the field is
	// well-formed base64. Rejecting garbage here beats storing it and having
	// every kiosk fail to decrypt one row for the rest of the roster's life.
	if _, err := base64.StdEncoding.DecodeString(req.EmbeddingEnc); err != nil {
		Error(w, http.StatusBadRequest, "embedding_enc must be base64")
		return
	}

	// A template is only comparable against others from the same model, so an
	// unlabelled one is not storable: a kiosk could not tell whether matching
	// it is meaningful. Defaulting silently would invite exactly that.
	if req.Model == "" {
		Error(w, http.StatusBadRequest, "model is required")
		return
	}
	if req.Dims <= 0 {
		Error(w, http.StatusBadRequest, "dims must be positive")
		return
	}
	if req.Quality < 0 || req.Quality > 1 {
		Error(w, http.StatusBadRequest, "quality must be between 0 and 1")
		return
	}

	t := &models.FaceTemplate{
		ID:           uuid.New().String(),
		EmployeeID:   req.EmployeeID,
		EmbeddingEnc: req.EmbeddingEnc,
		Model:        req.Model,
		Dims:         req.Dims,
		Quality:      req.Quality,
		Device:       req.Device,
	}

	meta := getMeta(r, session)
	if err := h.faceRepo.Save(r.Context(), t, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to save face template: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, map[string]string{
		"id":      t.ID,
		"message": "face template saved",
	})
}

// deleteFaceTemplate unenrolls an employee, destroying the stored template.
func (h *Handler) deleteFaceTemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		EmployeeID string `json:"employee_id"`
	}
	if err := Decode(r, &req); err != nil || req.EmployeeID == "" {
		Error(w, http.StatusBadRequest, "employee_id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.faceRepo.Delete(r.Context(), req.EmployeeID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete face template: "+err.Error())
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "face template deleted"})
}
