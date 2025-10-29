package main

import (
	"log"
	"server/api"
	"server/db"
	"server/utils"
)

func main() {

	configReader := utils.NewConfigReader("config.json")

	// Read the configuration
	jsonConfig, err := configReader.ReadConfig()
	if err != nil {
		log.Fatalf("Error reading config: %v\n", err)
	}

	// Extract database configuration from the nested structure
	dbConfig, ok := jsonConfig["database"].(map[string]interface{})
	if !ok {
		log.Fatal("Failed to extract database configuration from config file")
	}

	// Create MySQL connection with the database config
	mysqlDB, err := db.NewMySQLDB(dbConfig)
	if err != nil {
		log.Fatal("Failed to connect:", err)
	}
	defer mysqlDB.Close()

	apiInstance, err := api.NewApi(jsonConfig)
	if err != nil {
		log.Fatalf("Failed to create API: %v", err)
	}

	if err := apiInstance.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}

}
