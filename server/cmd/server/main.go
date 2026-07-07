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
		db,
		repository.NewRegistrationRepo(db),
		repository.NewCompanyRepo(db),
		repository.NewUserRepo(db),
		repository.NewAccessRepo(db),
		repository.NewSessionRepo(db),
		repository.NewChangeHistoryRepo(db),
		repository.NewBenefitRepo(db),
		repository.NewEmployeeRepo(db),
		repository.NewDepartmentRepo(db),
		repository.NewPositionRepo(db),
		repository.NewAttendanceRepo(db),
		repository.NewLeaveRepo(db),
		repository.NewPayrollRepo(db),
		repository.NewOnboardingRepo(db),
		repository.NewLoanRepo(db),
		repository.NewAccountingRepo(db),
		repository.NewAPRepo(db),
		repository.NewARRepo(db),
		repository.NewTaxRepo(db),
		repository.NewBankRepo(db),
		repository.NewReportsRepo(db),
		repository.NewTicketRepo(db),
		repository.NewWorkScheduleRepo(db),
		repository.NewComplianceRepo(db),
		repository.NewInventoryRepo(db),
		repository.NewFixedAssetsRepo(db),
		repository.NewSalesRepo(db),
		repository.NewProcurementRepo(db),
		repository.NewReturnsRepo(db),
		cfg,
	)

	http.HandleFunc("/api/execute", cors(handler.Execute, cfg.Server.AllowedOrigins))

	addr := cfg.Server.Addr()
	log.Printf("Endpoint: POST %s/api/execute?action=<action>", addr)

	if cfg.Server.TLSCertFile != "" && cfg.Server.TLSKeyFile != "" {
		log.Printf("Server starting with TLS on %s", addr)
		if err := http.ListenAndServeTLS(addr, cfg.Server.TLSCertFile, cfg.Server.TLSKeyFile, nil); err != nil {
			log.Fatal("Server failed: ", err)
		}
		return
	}

	log.Printf("WARNING: serving plaintext HTTP on %s (set tls_cert_file/tls_key_file, or terminate TLS at a reverse proxy)", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal("Server failed: ", err)
	}
}

// cors reflects an allowed Origin. With no allowlist configured it falls back to
// "*" for local development; production should set server.allowed_origins.
func cors(next http.HandlerFunc, allowedOrigins []string) http.HandlerFunc {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}
	allowAll := len(allowedOrigins) == 0

	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowAll {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin != "" && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}
