package main

import (
	"encoding/json"
	"log"
	"os"

	"server/api"
)

func main() {
	configFile := "config.json"
	if len(os.Args) > 1 {
		configFile = os.Args[1]
	}

	config, err := loadConfig(configFile)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	server, err := api.NewApi(config)
	if err != nil {
		log.Fatalf("Failed to create API: %v", err)
	}

	if err := server.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func loadConfig(path string) (map[string]interface{}, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		// Return default config if file doesn't exist
		return map[string]interface{}{
			"port":       "8001",
			"jwt_secret": "default-secret-key-change-in-production-32-chars",
			"database": map[string]interface{}{
				"host":     "localhost",
				"port":     "3306",
				"username": "root",
				"password": "",
				"database": "ls",
			},
		}, nil
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	return config, nil
}
