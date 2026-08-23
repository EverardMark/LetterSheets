package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"lettersheets/internal/database"
)

var path string = "config.json"

// SetPath sets the config file path
func SetPath(p string) {
	path = p
}

// Get loads configuration from config.json (if present) and then applies any
// LS_* environment-variable overrides. The file is OPTIONAL: in a container you
// can supply everything via the environment (e.g. from a secrets manager) and
// omit config.json entirely.
func Get() (*AppConfig, error) {
	var cfg AppConfig

	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, &cfg); err != nil {
			return nil, fmt.Errorf("failed to parse config file: %w", err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	applyEnvOverrides(&cfg)

	// Defaults
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8080
	}
	if cfg.Server.SessionHours == 0 {
		cfg.Server.SessionHours = 24
	}
	if cfg.Server.MaxLoginAttempts == 0 {
		cfg.Server.MaxLoginAttempts = 5
	}
	if cfg.Server.LockoutMinutes == 0 {
		cfg.Server.LockoutMinutes = 30
	}
	if cfg.AI.TimeoutSeconds == 0 {
		cfg.AI.TimeoutSeconds = 180
	}
	if cfg.SMTP.Port == 0 {
		cfg.SMTP.Port = 587
	}
	if cfg.SMTP.WorkerSeconds == 0 {
		cfg.SMTP.WorkerSeconds = 60
	}
	if cfg.SMTP.BatchSize == 0 {
		cfg.SMTP.BatchSize = 20
	}

	return &cfg, nil
}

// applyEnvOverrides lets any LS_* environment variable override the file value.
func applyEnvOverrides(cfg *AppConfig) {
	if v := os.Getenv("LS_SERVER_HOST"); v != "" {
		cfg.Server.Host = v
	}
	if v := os.Getenv("LS_AI_ENABLED"); v != "" {
		cfg.AI.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("LS_AI_BASE_URL"); v != "" {
		cfg.AI.BaseURL = v
	}
	if v := os.Getenv("LS_AI_BASE_MODEL"); v != "" {
		cfg.AI.BaseModel = v
	}
	if v := os.Getenv("LS_AI_API_KEY"); v != "" {
		cfg.AI.APIKey = v
	}
	if v := os.Getenv("LS_AI_VISION_MODEL"); v != "" {
		cfg.AI.VisionModel = v
	}
	if v := os.Getenv("LS_AI_THINKING"); v != "" {
		cfg.AI.Thinking = v == "true" || v == "1"
	}
	if n, ok := envInt("LS_AI_TIMEOUT_SECONDS"); ok {
		cfg.AI.TimeoutSeconds = n
	}
	if n, ok := envInt("LS_SERVER_PORT"); ok {
		cfg.Server.Port = n
	}
	if n, ok := envInt("LS_SESSION_HOURS"); ok {
		cfg.Server.SessionHours = n
	}
	if n, ok := envInt("LS_MAX_LOGIN_ATTEMPTS"); ok {
		cfg.Server.MaxLoginAttempts = n
	}
	if n, ok := envInt("LS_LOCKOUT_MINUTES"); ok {
		cfg.Server.LockoutMinutes = n
	}
	if v := os.Getenv("LS_ALLOWED_ORIGINS"); v != "" {
		parts := strings.Split(v, ",")
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		cfg.Server.AllowedOrigins = parts
	}
	if v := os.Getenv("LS_TLS_CERT_FILE"); v != "" {
		cfg.Server.TLSCertFile = v
	}
	if v := os.Getenv("LS_TLS_KEY_FILE"); v != "" {
		cfg.Server.TLSKeyFile = v
	}
	if n, ok := envInt("LS_TLS_PORT"); ok {
		cfg.Server.TLSPort = n
	}
	if v := os.Getenv("LS_TRUST_PROXY_HEADERS"); v != "" {
		cfg.Server.TrustProxyHeaders = v == "true" || v == "1"
	}

	if v := os.Getenv("LS_DB_HOST"); v != "" {
		cfg.Database.Host = v
	}
	if n, ok := envInt("LS_DB_PORT"); ok {
		cfg.Database.Port = n
	}
	if v := os.Getenv("LS_DB_USER"); v != "" {
		cfg.Database.User = v
	}
	if v := os.Getenv("LS_DB_PASSWORD"); v != "" {
		cfg.Database.Password = v
	}
	if v := os.Getenv("LS_DB_NAME"); v != "" {
		cfg.Database.DBName = v
	}
	if n, ok := envInt("LS_DB_MAX_OPEN"); ok {
		cfg.Database.MaxOpen = n
	}
	if n, ok := envInt("LS_DB_MAX_IDLE"); ok {
		cfg.Database.MaxIdle = n
	}
	if n, ok := envInt("LS_DB_MAX_LIFE_MINUTES"); ok {
		cfg.Database.MaxLifeMinutes = n
	}

	// SMTP. Credentials belong in the environment (a secrets manager) rather
	// than in a config file that tends to end up in a repo.
	if v := os.Getenv("LS_SMTP_ENABLED"); v != "" {
		cfg.SMTP.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("LS_SMTP_HOST"); v != "" {
		cfg.SMTP.Host = v
	}
	if n, ok := envInt("LS_SMTP_PORT"); ok {
		cfg.SMTP.Port = n
	}
	if v := os.Getenv("LS_SMTP_USERNAME"); v != "" {
		cfg.SMTP.Username = v
	}
	if v := os.Getenv("LS_SMTP_PASSWORD"); v != "" {
		cfg.SMTP.Password = v
	}
	if v := os.Getenv("LS_SMTP_FROM_EMAIL"); v != "" {
		cfg.SMTP.FromEmail = v
	}
	if v := os.Getenv("LS_SMTP_FROM_NAME"); v != "" {
		cfg.SMTP.FromName = v
	}
	if v := os.Getenv("LS_SMTP_IMPLICIT_TLS"); v != "" {
		cfg.SMTP.ImplicitTLS = v == "true" || v == "1"
	}
	if v := os.Getenv("LS_SMTP_SKIP_VERIFY"); v != "" {
		cfg.SMTP.SkipVerify = v == "true" || v == "1"
	}
	if n, ok := envInt("LS_SMTP_WORKER_SECONDS"); ok {
		cfg.SMTP.WorkerSeconds = n
	}
	if n, ok := envInt("LS_SMTP_BATCH_SIZE"); ok {
		cfg.SMTP.BatchSize = n
	}
}

func envInt(key string) (int, bool) {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n, true
		}
	}
	return 0, false
}

type AppConfig struct {
	Server   ServerConfig   `json:"server"`
	Database DatabaseConfig `json:"database"`
	SMTP     SMTPConfig     `json:"smtp"`
	AI       AIConfig       `json:"ai"`
}

// AIConfig drives the prompt layer.
//
// OFF UNTIL EXPLICITLY ENABLED, for the same reason SMTP is: a deployment that
// says nothing about AI gets none, and the ai_* actions report the assistant is
// switched off. Nothing else changes.
//
// The architecture is one fine-tuned adapter per company served from a shared
// base model, so BaseURL points at ONE inference server (vLLM with
// --enable-lora) and per-company adapter names come from the database. BaseModel
// serves companies that do not have an adapter yet — the normal state of every
// tenant on its first day.
type AIConfig struct {
	Enabled bool `json:"enabled"`

	// BaseURL is an OpenAI-compatible inference server: vLLM, Ollama,
	// llama.cpp's server, LM Studio. The dialect is what makes a self-hosted
	// fine-tune a config change rather than a code change.
	BaseURL string `json:"base_url"`

	// BaseModel is the shared base served to companies with no adapter.
	BaseModel string `json:"base_model"`

	// APIKey is optional — Ollama and llama.cpp ignore it, vLLM can require one.
	APIKey string `json:"api_key"`

	// VisionBaseURL is where the vision model is served, when it is a SEPARATE
	// process from the tool-calling one — which it is in practice: two vLLM
	// instances on one GPU, on different ports. Empty falls back to BaseURL for
	// the case where a single model serves both.
	VisionBaseURL string `json:"vision_base_url"`

	// VisionModel reads scanned receipts and invoices. Deliberately a separate
	// model from BaseModel: document understanding needs a vision-language base,
	// and folding it into the tool-calling adapter would make every tenant carry
	// vision weights whether or not they scan anything. Empty ⇒ scanning off.
	VisionModel string `json:"vision_model"`

	// Thinking turns on the base model's chain-of-thought.
	//
	// Off by default: measured on the deployment host, the same request takes
	// ~1.5s without it and ~15s with. It does buy accuracy the base model
	// otherwise lacks — notably multi-turn reference resolution, where an 8B
	// asked "which Ana?" and told "the one in Finance" will otherwise repeat
	// its question instead of acting. That gap is what a per-company adapter is
	// trained to close, so this is a stopgap for deployments running on the
	// shared base model.
	Thinking bool `json:"thinking"`

	// TimeoutSeconds bounds one model call. Self-hosted generation on modest
	// hardware is slow; 0 ⇒ 180.
	TimeoutSeconds int `json:"timeout_seconds"`
}

// Ready reports whether the prompt layer has enough to serve a request.
func (a *AIConfig) Ready() bool {
	return a.Enabled && a.BaseURL != "" && a.BaseModel != ""
}

// SMTPConfig drives outbound email (migration 021's outbox worker).
//
// OFF UNTIL EXPLICITLY ENABLED: Enabled defaults to false, so a deployment that
// says nothing about SMTP sends nothing. Queued messages simply accumulate as
// Pending and are visible in the app. Turning on mail that reaches customers
// should be a deliberate act by an operator, not a side effect of an upgrade.
type SMTPConfig struct {
	Enabled   bool   `json:"enabled"`
	Host      string `json:"host"`
	Port      int    `json:"port"` // 587 STARTTLS (default), 465 implicit TLS, 25 plain
	Username  string `json:"username"`
	Password  string `json:"password"`
	FromEmail string `json:"from_email"`
	FromName  string `json:"from_name"`
	// ImplicitTLS dials TLS directly (SMTPS) instead of upgrading via STARTTLS.
	ImplicitTLS bool `json:"implicit_tls"`
	// SkipVerify disables certificate verification — self-hosted relays with a
	// self-signed certificate only. It removes the guarantee that you are
	// talking to the server you think you are.
	SkipVerify bool `json:"skip_verify"`
	// WorkerSeconds is how often the outbox is drained. 0 ⇒ 60.
	WorkerSeconds int `json:"worker_seconds"`
	// BatchSize caps messages sent per pass. 0 ⇒ 20.
	BatchSize int `json:"batch_size"`
}

// Ready reports whether the worker has enough to attempt delivery.
func (s *SMTPConfig) Ready() bool {
	return s.Enabled && s.Host != "" && s.FromEmail != ""
}

type ServerConfig struct {
	Host             string `json:"host"`
	Port             int    `json:"port"`
	SessionHours     int    `json:"session_hours"`
	MaxLoginAttempts int    `json:"max_login_attempts"`
	LockoutMinutes   int    `json:"lockout_minutes"`

	// AllowedOrigins is the CORS allowlist. Empty ⇒ reflect "*" (dev only).
	AllowedOrigins []string `json:"allowed_origins"`
	// TLSCertFile/TLSKeyFile enable HTTPS when both are set.
	TLSCertFile string `json:"tls_cert_file"`
	TLSKeyFile  string `json:"tls_key_file"`
	// TLSPort, when set (and different from Port), serves HTTPS on this port
	// while plain HTTP stays on Port — the client-migration window. Once all
	// clients use HTTPS, set Port to this value and clear TLSPort.
	TLSPort int `json:"tls_port"`
	// TrustProxyHeaders makes the server derive the client IP from
	// X-Forwarded-For / X-Real-IP. Enable ONLY behind a trusted proxy.
	TrustProxyHeaders bool `json:"trust_proxy_headers"`
	// DisableRecurringScheduler turns off the background job that auto-generates
	// due recurring journal entries. Default false ⇒ the scheduler runs.
	DisableRecurringScheduler bool `json:"disable_recurring_scheduler"`
}

func (s *ServerConfig) Addr() string {
	return fmt.Sprintf("%s:%d", s.Host, s.Port)
}

type DatabaseConfig struct {
	Host           string `json:"host"`
	Port           int    `json:"port"`
	User           string `json:"user"`
	Password       string `json:"password"`
	DBName         string `json:"db_name"`
	MaxOpen        int    `json:"max_open"`
	MaxIdle        int    `json:"max_idle"`
	MaxLifeMinutes int    `json:"max_life_minutes"`
}

func (c *DatabaseConfig) ToDBConfig() database.Config {
	return database.Config{
		Host:     c.Host,
		Port:     c.Port,
		User:     c.User,
		Password: c.Password,
		DBName:   c.DBName,
		MaxOpen:  c.MaxOpen,
		MaxIdle:  c.MaxIdle,
		MaxLife:  time.Duration(c.MaxLifeMinutes) * time.Minute,
	}
}
