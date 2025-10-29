package db

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

// MySQLDB handles MySQL database connections and operations
type MySQLDB struct {
	DB     *sql.DB
	Config DatabaseConfig
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	Host     string
	Username string
	Password string
	Database string
	Port     string
}

// NewMySQLDB creates a new MySQL database connection from a config map
func NewMySQLDB(configMap map[string]interface{}) (*MySQLDB, error) {
	dbConfig := DatabaseConfig{}

	// Extract database configuration
	if host, ok := configMap["host"].(string); ok {
		dbConfig.Host = host
	}
	if username, ok := configMap["username"].(string); ok {
		dbConfig.Username = username
	}
	if password, ok := configMap["password"].(string); ok {
		dbConfig.Password = password
	}
	if dbName, ok := configMap["database"].(string); ok {
		dbConfig.Database = dbName
	}
	if port, ok := configMap["port"].(string); ok {
		dbConfig.Port = port
	}

	// Validate required fields
	if dbConfig.Host == "" || dbConfig.Username == "" || dbConfig.Database == "" {
		return nil, fmt.Errorf("missing required database configuration (host, username, database)")
	}

	// Set default port if not provided
	if dbConfig.Port == "" {
		dbConfig.Port = "3306"
	}

	// Create DSN (Data Source Name)
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		dbConfig.Username,
		dbConfig.Password,
		dbConfig.Host,
		dbConfig.Port,
		dbConfig.Database,
	)

	// Open database connection
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %v", err)
	}

	// Test the connection
	err = db.Ping()
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %v", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	return &MySQLDB{
		DB:     db,
		Config: dbConfig,
	}, nil
}

// NewMySQLDBFromStruct creates a new MySQL database connection from a DatabaseConfig struct
func NewMySQLDBFromStruct(config DatabaseConfig) (*MySQLDB, error) {
	configMap := map[string]interface{}{
		"host":     config.Host,
		"username": config.Username,
		"password": config.Password,
		"database": config.Database,
		"port":     config.Port,
	}
	return NewMySQLDB(configMap)
}

// ExecuteStoredProcedure executes a stored procedure with parameters
// procedureName: name of the stored procedure
// params: slice of parameters to pass to the procedure
// Returns: rows result and error
func (m *MySQLDB) ExecuteStoredProcedure(procedureName string, params ...interface{}) (*sql.Rows, error) {
	// Build the CALL statement with placeholders
	placeholders := make([]string, len(params))
	for i := range params {
		placeholders[i] = "?"
	}

	query := fmt.Sprintf("CALL %s(%s)", procedureName, strings.Join(placeholders, ", "))

	// Execute the stored procedure
	rows, err := m.DB.Query(query, params...)
	if err != nil {
		return nil, fmt.Errorf("failed to execute stored procedure '%s': %v", procedureName, err)
	}

	return rows, nil
}

// ExecuteStoredProcedureWithoutResult executes a stored procedure that doesn't return a result set
func (m *MySQLDB) ExecuteStoredProcedureWithoutResult(procedureName string, params ...interface{}) error {
	placeholders := make([]string, len(params))
	for i := range params {
		placeholders[i] = "?"
	}

	query := fmt.Sprintf("CALL %s(%s)", procedureName, strings.Join(placeholders, ", "))

	_, err := m.DB.Exec(query, params...)
	if err != nil {
		return fmt.Errorf("failed to execute stored procedure '%s': %v", procedureName, err)
	}

	return nil
}

// ExecuteStoredProcedureWithOutParams executes a stored procedure with OUT parameters
// This returns the last insert ID and rows affected, which can be used for some OUT parameter scenarios
func (m *MySQLDB) ExecuteStoredProcedureWithOutParams(procedureName string, params ...interface{}) (sql.Result, error) {
	placeholders := make([]string, len(params))
	for i := range params {
		placeholders[i] = "?"
	}

	query := fmt.Sprintf("CALL %s(%s)", procedureName, strings.Join(placeholders, ", "))

	result, err := m.DB.Exec(query, params...)
	if err != nil {
		return nil, fmt.Errorf("failed to execute stored procedure '%s': %v", procedureName, err)
	}

	return result, nil
}

// Close closes the database connection
func (m *MySQLDB) Close() error {
	if m.DB != nil {
		return m.DB.Close()
	}
	return nil
}

// Ping checks if the database connection is still alive
func (m *MySQLDB) Ping() error {
	return m.DB.Ping()
}

// GetDB returns the underlying *sql.DB for custom operations
func (m *MySQLDB) GetDB() *sql.DB {
	return m.DB
}
