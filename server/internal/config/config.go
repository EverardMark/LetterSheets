package config

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"lettersheets/internal/database"
)

var path string = "config.json"

// SetPath sets the config file path
func SetPath(p string) {
	path = p
}

// Get reads config.json from disk every time it's called
// Changes to config.json take effect immediately without restart
func Get() (*AppConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

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
