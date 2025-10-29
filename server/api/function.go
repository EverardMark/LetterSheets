package api

import (
	"fmt"
)

type FunctionResponse struct {
	Error  interface{} `json:"error"`
	Result interface{} `json:"result"`
}

func (a *Api) Select(f string, params map[string]interface{}) FunctionResponse {

	switch f {

	case "register":

		return FunctionResponse{
			Error:  fmt.Sprintf("unknown function: %s", f),
			Result: nil,
		}

	default:
		return FunctionResponse{
			Error:  fmt.Sprintf("unknown function: %s", f),
			Result: nil,
		}

	}

}
