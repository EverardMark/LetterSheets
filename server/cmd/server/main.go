package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

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
		repository.NewLeaveCreditRepo(db),
		repository.NewRecurringRepo(db),
		repository.NewCRMRepo(db),
		repository.NewPeriodRepo(db),
		repository.NewNotificationRepo(db),
		repository.NewExpenseRepo(db),
		cfg,
	)

	// Background scheduler: auto-generate due recurring journal entries so they
	// post/draft on schedule without anyone opening the Journal. Idempotent and
	// interval-based; can be turned off via server.disable_recurring_scheduler.
	if !cfg.Server.DisableRecurringScheduler {
		go handler.StartRecurringScheduler()
		log.Println("Recurring scheduler: enabled")
	}

	// Background worker: drain the email outbox. Started only when SMTP is
	// configured AND explicitly enabled — with mail off, queued messages simply
	// stay Pending and visible in the app, and nothing leaves the building.
	if cfg.SMTP.Ready() {
		go handler.StartEmailWorker()
		log.Printf("Email worker: enabled (relay %s:%d, from %s)", cfg.SMTP.Host, cfg.SMTP.Port, cfg.SMTP.FromEmail)
	} else {
		log.Println("Email worker: disabled (set smtp.enabled + smtp.host + smtp.from_email to turn on outbound mail)")
	}

	http.HandleFunc("/api/execute", cors(handler.Execute, cfg.Server.AllowedOrigins))

	// Static host for the Electron auto-updater feed. electron-updater fetches
	// latest*.yml + the installer artifacts from here. Files live in the dir named
	// by LS_UPDATES_DIR (default "updates", relative to the server's working dir).
	// Directory listing is disabled so the folder's contents aren't browsable.
	updatesDir := os.Getenv("LS_UPDATES_DIR")
	if updatesDir == "" {
		updatesDir = "updates"
	}
	http.Handle("/updates/", noDirList(http.StripPrefix("/updates/", http.FileServer(http.Dir(updatesDir)))))

	addr := cfg.Server.Addr()
	log.Printf("Endpoint: POST %s/api/execute?action=<action>", addr)
	log.Printf("Update feed: GET %s/updates/ (dir: %q)", addr, updatesDir)

	tlsEnabled := cfg.Server.TLSCertFile != "" && cfg.Server.TLSKeyFile != ""

	// Migration mode: tls_port serves HTTPS while plain HTTP stays on port for
	// clients built before the HTTPS cutover. Once all clients target HTTPS,
	// set port to the TLS port and clear tls_port to drop the plaintext listener.
	if tlsEnabled && cfg.Server.TLSPort != 0 && cfg.Server.TLSPort != cfg.Server.Port {
		tlsAddr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.TLSPort)
		go func() {
			log.Printf("Server starting with TLS on %s", tlsAddr)
			if err := http.ListenAndServeTLS(tlsAddr, cfg.Server.TLSCertFile, cfg.Server.TLSKeyFile, nil); err != nil {
				log.Fatal("TLS server failed: ", err)
			}
		}()
		log.Printf("WARNING: legacy plaintext HTTP still on %s for pre-HTTPS clients", addr)
		if err := http.ListenAndServe(addr, nil); err != nil {
			log.Fatal("Server failed: ", err)
		}
		return
	}

	if tlsEnabled {
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

// noDirList wraps a file handler so requests for a directory (path ending in
// "/") return 404 instead of an auto-generated listing of the folder.
func noDirList(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
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
