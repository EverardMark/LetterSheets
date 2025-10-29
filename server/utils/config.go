package utils

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"regexp"
	"strings"
)

// ConfigReader handles reading and parsing JavaScript config files
// All fields are private for better encapsulation
type ConfigReader struct {
	filePath string
	config   map[string]interface{}
}

// NewConfigReader creates a new ConfigReader instance
func NewConfigReader(filePath string) *ConfigReader {
	return &ConfigReader{
		filePath: filePath,
		config:   make(map[string]interface{}),
	}
}

// ReadConfig reads the config.js file and parses it into a map
func (cr *ConfigReader) ReadConfig() (map[string]interface{}, error) {
	// Read the file
	content, err := cr.readFile()
	if err != nil {
		return nil, err
	}

	// Convert JavaScript object notation to JSON
	jsonContent, err := cr.jsToJSON(content)
	if err != nil {
		return nil, fmt.Errorf("failed to convert JS to JSON: %v", err)
	}

	// Parse JSON into map
	err = cr.parseJSON(jsonContent)
	if err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %v", err)
	}

	return cr.config, nil
}

// readFile reads the content from the config file
func (cr *ConfigReader) readFile() (string, error) {
	content, err := ioutil.ReadFile(cr.filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read config file: %v", err)
	}
	return string(content), nil
}

// parseJSON parses JSON string into the config map
func (cr *ConfigReader) parseJSON(jsonContent string) error {
	var config map[string]interface{}
	err := json.Unmarshal([]byte(jsonContent), &config)
	if err != nil {
		return err
	}
	cr.config = config
	return nil
}

// jsToJSON converts simple JavaScript object notation to JSON
// This handles basic cases - for complex JS configs, consider using a JS engine
func (cr *ConfigReader) jsToJSON(jsContent string) (string, error) {
	// Remove comments
	jsContent = cr.removeComments(jsContent)

	// Remove module exports patterns
	jsContent = cr.removeExportPatterns(jsContent)

	// Remove trailing semicolons
	jsContent = cr.removeTrailingSemicolons(jsContent)

	// Replace single quotes with double quotes
	jsContent = cr.replaceSingleQuotes(jsContent)

	// Handle undefined values
	jsContent = cr.handleUndefined(jsContent)

	return jsContent, nil
}

// removeComments removes single line and multi-line comments
func (cr *ConfigReader) removeComments(content string) string {
	re := regexp.MustCompile(`//.*$|/\*[\s\S]*?\*/`)
	return re.ReplaceAllString(content, "")
}

// removeExportPatterns removes module.exports and export patterns
func (cr *ConfigReader) removeExportPatterns(content string) string {
	patterns := []string{
		`module\.exports\s*=\s*`,
		`export\s+default\s+`,
		`export\s*=\s*`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		content = re.ReplaceAllString(content, "")
	}

	return content
}

// removeTrailingSemicolons removes trailing semicolons
func (cr *ConfigReader) removeTrailingSemicolons(content string) string {
	return strings.TrimSuffix(strings.TrimSpace(content), ";")
}

// handleUndefined replaces undefined values with null
func (cr *ConfigReader) handleUndefined(content string) string {
	re := regexp.MustCompile(`:\s*undefined\s*([,}])`)
	return re.ReplaceAllString(content, `: null$1`)
}

// replaceSingleQuotes replaces single quotes with double quotes
// while avoiding quotes inside strings
func (cr *ConfigReader) replaceSingleQuotes(content string) string {
	var result strings.Builder
	inString := false
	var stringChar rune

	runes := []rune(content)
	for i, r := range runes {
		switch {
		case !inString && (r == '\'' || r == '"'):
			inString = true
			stringChar = r
			if r == '\'' {
				result.WriteRune('"')
			} else {
				result.WriteRune(r)
			}
		case inString && r == stringChar:
			// Check if it's escaped
			escaped := cr.isEscaped(runes, i)

			if !escaped {
				inString = false
				if stringChar == '\'' {
					result.WriteRune('"')
				} else {
					result.WriteRune(r)
				}
			} else {
				result.WriteRune(r)
			}
		default:
			result.WriteRune(r)
		}
	}

	return result.String()
}

// isEscaped checks if a character is escaped by counting preceding backslashes
func (cr *ConfigReader) isEscaped(runes []rune, index int) bool {
	backslashes := 0
	for j := index - 1; j >= 0 && runes[j] == '\\'; j-- {
		backslashes++
	}
	return backslashes%2 == 1
}
