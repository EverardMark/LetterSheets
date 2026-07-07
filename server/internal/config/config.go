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

	return &cfg, nil
}

// applyEnvOverrides lets any LS_* environment variable override the file value.
func applyEnvOverrides(cfg *AppConfig) {
	if v := os.Getenv("LS_SERVER_HOST"); v != "" {
		cfg.Server.Host = v
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
	// TrustProxyHeaders makes the server derive the client IP from
	// X-Forwarded-For / X-Real-IP. Enable ONLY behind a trusted proxy.
	TrustProxyHeaders bool `json:"trust_proxy_headers"`
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
