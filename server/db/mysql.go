package db

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

type MySQLDB struct {
	DB *sql.DB
}

func NewMySQLDB(config map[string]interface{}) (*MySQLDB, error) {
	host := getConfigString(config, "host", "localhost")
	port := getConfigString(config, "port", "3306")
	username := getConfigString(config, "username", "root")
	password := getConfigString(config, "password", "")
	database := getConfigString(config, "database", "ls")

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		username, password, host, port, database)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	return &MySQLDB{DB: db}, nil
}

func (m *MySQLDB) Close() error {
	return m.DB.Close()
}

func getConfigString(config map[string]interface{}, key, defaultVal string) string {
	if val, ok := config[key].(string); ok {
		return val
	}
	return defaultVal
}
