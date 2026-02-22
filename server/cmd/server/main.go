package main

import (
	"log"
	"net/http"

	"lettersheets/internal/api"
	"lettersheets/internal/config"
	"lettersheets/internal/database"
	"lettersheets/internal/repository"
)

func main() {
	// Read config once at startup
	cfg, err := config.Get()
	if err != nil {
		log.Fatal("Failed to load config: ", err)
	}

	db, err := database.NewConnection(cfg.Database.ToDBConfig())
	if err != nil {
		log.Fatal("Failed to connect to database: ", err)
	}
	defer db.Close()
	log.Println("Connected to database")

	handler := api.NewHandler(
		repository.NewRegistrationRepo(db),
		repository.NewCompanyRepo(db),
		repository.NewUserRepo(db),
		repository.NewAccessRepo(db),
		repository.NewSessionRepo(db),
		repository.NewChangeHistoryRepo(db),
		cfg,
	)

	http.HandleFunc("/api/execute", cors(handler.Execute))

	addr := cfg.Server.Addr()
	log.Printf("Server starting on %s", addr)
	log.Printf("Endpoint: POST %s/api/execute?action=<action>", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal("Server failed: ", err)
	}
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}
