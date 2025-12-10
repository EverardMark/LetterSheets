package api

import (
	"fmt"
)

// FunctionResponse is the standard response for function calls
type FunctionResponse struct {
	Error  interface{} `json:"error"`
	Result interface{} `json:"result"`
}

// Select routes function calls to their handlers
func (a *Api) Select(f string, params map[string]interface{}) FunctionResponse {
	switch f {

	// Add your custom functions here
	// Example:
	// case "get_user":
	//     return a.getUserHandler(params)

	default:
		return FunctionResponse{
			Error:  fmt.Sprintf("unknown function: %s", f),
			Result: nil,
		}
	}
}
