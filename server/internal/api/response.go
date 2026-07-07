package api

import (
	"encoding/json"
	"log"
	"net/http"
)

// ServerError logs the underlying error server-side (with a context label) and
// returns a generic message to the client, so internal SQL / stored-procedure
// detail is never disclosed. Prefer this over Error(w, 500, err.Error()).
func ServerError(w http.ResponseWriter, context string, err error) {
	log.Printf("%s: %v", context, err)
	Error(w, http.StatusInternalServerError, "internal server error")
}

type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(Response{
		Success: status >= 200 && status < 300,
		Data:    data,
	})
}

func Error(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(Response{
		Success: false,
		Error:   msg,
	})
}

func Decode(r *http.Request, v interface{}) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}
