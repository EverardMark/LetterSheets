package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// ErrorResponse struct for error messages
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Code    int    `json:"code"`
}

// SuccessResponse struct for successful responses
type SuccessResponse struct {
	Message      string      `json:"message"`
	Data         interface{} `json:"data,omitempty"`
	Status       int         `json:"status"`
	ResponseTime string      `json:"response_time,omitempty"` // Added response time
}

// Helper function to send error response
func (a *Api) sendError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)

	errResp := ErrorResponse{
		Error:   http.StatusText(code),
		Message: message,
		Code:    code,
	}

	json.NewEncoder(w).Encode(errResp)
}

// Helper function to send success response
func (a *Api) sendSuccess(w http.ResponseWriter, message string, data interface{}, code int) {
	a.sendSuccessWithTime(w, message, data, code, "")
}

// Helper function to send success response with response time
func (a *Api) sendSuccessWithTime(w http.ResponseWriter, message string, data interface{}, code int, responseTime string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)

	successResp := SuccessResponse{
		Message:      message,
		Data:         data,
		Status:       code,
		ResponseTime: responseTime,
	}

	json.NewEncoder(w).Encode(successResp)
}

// Execute handler - now secured with JWT
func (a *Api) executeDataHandler(w http.ResponseWriter, r *http.Request, jsonConfig map[string]interface{}) {
	// Read the request body
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		a.sendError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Parse JSON body into a struct or map
	var requestBody map[string]interface{}
	err = json.Unmarshal(bodyBytes, &requestBody)
	if err != nil {
		a.sendError(w, "Invalid JSON format", http.StatusBadRequest)
		return
	}

	// Get the function name
	f, ok := requestBody["func"].(string)
	if !ok || f == "" {
		a.sendError(w, "Missing or invalid 'function' parameter", http.StatusBadRequest)
		return
	}

	// Extract the nested body object
	data, ok := requestBody["data"].(map[string]interface{})
	if !ok {
		data = make(map[string]interface{}) // Empty body if not provided
	}

	// Call Select and get the result
	result := a.Select(f, data)

	// Check if there was an error
	if result.Error != nil {
		a.sendError(w, fmt.Sprintf("%v", result.Error), http.StatusInternalServerError)
		return
	}

	// Send success response with the result data
	a.sendSuccess(w, "Request successful", result.Result, http.StatusOK)
}
