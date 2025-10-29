package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ================================
// Core Structs
// ================================

// Api encapsulates all API configuration and dependencies
type Api struct {
	config      map[string]interface{}
	jwtSecret   []byte
	rateLimiter *RateLimiter
	jobTracker  *JobTracker
	logDB       interface{} // Replace with actual DB type
}

// JobTracker manages job statuses
type JobTracker struct {
	jobs map[string]string
	mu   sync.RWMutex
}

// Claims represents JWT token claims
type Claims struct {
	UserID   string                 `json:"user_id"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
	jwt.RegisteredClaims
}

// ResponseWriter wrapper to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	written    bool
}

// RateLimiter manages request rate limiting per IP
type RateLimiter struct {
	visitors map[string]*Visitor
	mu       sync.RWMutex
	rate     int           // requests per window
	window   time.Duration // time window
}

// Visitor tracks request count and last reset time
type Visitor struct {
	count     int
	lastReset time.Time
}

// ================================
// Api Methods
// ================================

// NewApi creates a new API instance with configuration
func NewApi(config map[string]interface{}) (*Api, error) {
	api := &Api{
		config:     config,
		jobTracker: NewJobTracker(),
	}

	// Initialize JWT secret
	jwtSecretKey, ok := config["jwt_secret"].(string)
	if !ok || jwtSecretKey == "" {
		jwtSecretKey = "your-secret-key-change-this-in-production-min-32-chars"
		log.Println("WARNING: Using default JWT secret. Set 'jwt_secret' in config for production!")
	}
	api.jwtSecret = []byte(jwtSecretKey)

	// Initialize rate limiter (60 requests per minute per IP)
	api.rateLimiter = NewRateLimiter(60, time.Minute)

	// Initialize directories
	if err := api.initializeDirectories(); err != nil {
		return nil, err
	}

	return api, nil
}

// Start begins the HTTP server with all configured routes and middleware
func (a *Api) Start() error {
	// Connection endpoint (no JWT required) - to get a token
	http.HandleFunc("/connect",
		a.responseTimeMiddleware(
			a.rateLimitMiddleware(
				a.requestSizeLimitMiddleware(1<<20)(
					a.timeoutMiddleware(10*time.Second)(a.connectHandler),
				),
			),
		),
	)

	// Validate token endpoint (no JWT required)
	http.HandleFunc("/validate-token",
		a.responseTimeMiddleware(
			a.rateLimitMiddleware(
				a.requestSizeLimitMiddleware(1<<20)(
					a.timeoutMiddleware(10*time.Second)(a.validateTokenHandler),
				),
			),
		),
	)

	// Execute endpoint (JWT required)
	http.HandleFunc("/execute",
		a.responseTimeMiddleware(
			a.rateLimitMiddleware(
				a.jwtMiddleware(
					a.requestSizeLimitMiddleware(10<<20)(
						a.timeoutMiddleware(30*time.Second)(
							func(w http.ResponseWriter, r *http.Request) {
								a.executeDataHandler(w, r, a.config)
							},
						),
					),
				),
			),
		),
	)

	// Media endpoint (JWT required)
	fs := http.FileServer(http.Dir("./files"))
	http.Handle("/media/",
		a.responseTimeMiddlewareHandler(
			a.rateLimitMiddlewareHandler(
				a.jwtMiddlewareHandler(
					http.StripPrefix("/media/", fs),
				),
			),
		),
	)

	appPort, ok := a.config["port"].(string)
	if !ok {
		return fmt.Errorf("port not found in config")
	}

	finalAppPort := ":" + appPort

	// Print server information
	a.printServerInfo(appPort)

	// Start server
	log.Fatal(http.ListenAndServe(finalAppPort, nil))
	return nil
}

// initializeDirectories creates necessary directories
func (a *Api) initializeDirectories() error {
	dirs := []string{"./files"}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, os.ModePerm); err != nil {
			return fmt.Errorf("error creating directory %s: %v", dir, err)
		}
	}
	return nil
}

// printServerInfo displays server configuration
func (a *Api) printServerInfo(port string) {
	fmt.Printf("Server starting on port %s...\n", port)
	fmt.Println("Security features enabled:")
	fmt.Println("  - JWT Authentication")
	fmt.Println("  - Rate limit: 60 requests/minute per IP")
	fmt.Println("  - Max request size: 10MB")
	fmt.Println("  - Request timeout: 30s")
	fmt.Println("  - Response time tracking: Enabled")
	fmt.Println("  - Database logging: Enabled (MySQL)")
	fmt.Println("\nEndpoints:")
	fmt.Println("  - POST /connect - Generate JWT token (public, no auth required)")
	fmt.Println("  - POST /validate-token - Validate JWT token (public)")
	fmt.Println("  - POST /execute - Execute functions (requires JWT)")
	fmt.Println("  - GET  /media/* - Serve media files (requires JWT)")
}

// ================================
// Middleware Methods
// ================================

// responseTimeMiddleware tracks response time for each request
func (a *Api) responseTimeMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := &responseWriter{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
			written:        false,
		}

		next.ServeHTTP(wrapped, r)

		elapsed := time.Since(start)
		responseTimeMs := float64(elapsed.Milliseconds())

		ip := getClientIP(r)
		userID := r.Header.Get("X-User-ID")
		userAgent := r.UserAgent()

		if a.logDB != nil {
			a.insertRequestLog(start, r.Method, r.URL.Path, wrapped.statusCode, responseTimeMs, ip, userID, userAgent)
		}
	}
}

// responseTimeMiddlewareHandler tracks response time for http.Handler
func (a *Api) responseTimeMiddlewareHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := &responseWriter{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
			written:        false,
		}

		next.ServeHTTP(wrapped, r)

		elapsed := time.Since(start)
		responseTimeMs := float64(elapsed.Milliseconds())

		ip := getClientIP(r)
		userID := r.Header.Get("X-User-ID")
		userAgent := r.UserAgent()

		log.Printf("[%s] %s - Status: %d - Response Time: %v - IP: %s - User: %s",
			r.Method, r.URL.Path, wrapped.statusCode, elapsed, ip, userID)

		if a.logDB != nil {
			a.insertRequestLog(start, r.Method, r.URL.Path, wrapped.statusCode, responseTimeMs, ip, userID, userAgent)
		}
	})
}

// rateLimitMiddleware applies rate limiting
func (a *Api) rateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)

		if !a.rateLimiter.IsAllowed(ip) {
			a.sendError(w, "Rate limit exceeded. Please try again later.", http.StatusTooManyRequests)
			return
		}

		next(w, r)
	}
}

// rateLimitMiddlewareHandler applies rate limiting to http.Handler
func (a *Api) rateLimitMiddlewareHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)

		if !a.rateLimiter.IsAllowed(ip) {
			a.sendError(w, "Rate limit exceeded. Please try again later.", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// jwtMiddleware validates JWT tokens
func (a *Api) jwtMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, err := a.extractAndValidateToken(r)
		if err != nil {
			a.sendError(w, err.Error(), http.StatusUnauthorized)
			return
		}

		r.Header.Set("X-User-ID", claims.UserID)
		next(w, r)
	}
}

// jwtMiddlewareHandler validates JWT tokens for http.Handler
func (a *Api) jwtMiddlewareHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, err := a.extractAndValidateToken(r)
		if err != nil {
			a.sendError(w, err.Error(), http.StatusUnauthorized)
			return
		}

		r.Header.Set("X-User-ID", claims.UserID)
		next.ServeHTTP(w, r)
	})
}

// requestSizeLimitMiddleware limits request body size
func (a *Api) requestSizeLimitMiddleware(maxBytes int64) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next(w, r)
		}
	}
}

// timeoutMiddleware adds request timeout
func (a *Api) timeoutMiddleware(timeout time.Duration) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			done := make(chan bool)
			go func() {
				next(w, r)
				done <- true
			}()

			select {
			case <-done:
				return
			case <-time.After(timeout):
				a.sendError(w, "Request timeout", http.StatusRequestTimeout)
				return
			}
		}
	}
}

// ================================
// JWT Methods
// ================================

// extractAndValidateToken extracts and validates JWT from request
func (a *Api) extractAndValidateToken(r *http.Request) (*Claims, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return nil, fmt.Errorf("missing authorization header")
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return nil, fmt.Errorf("invalid authorization header format. Use: Bearer <token>")
	}

	return a.validateJWTToken(parts[1])
}

// generateJWTToken creates a new JWT token
func (a *Api) generateJWTToken(userID string, metadata map[string]interface{}, expirationMinutes int) (string, error) {
	claims := Claims{
		UserID:   userID,
		Metadata: metadata,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute * time.Duration(expirationMinutes))),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "storer-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.jwtSecret)
}

// validateJWTToken validates a JWT token string
func (a *Api) validateJWTToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return a.jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// ================================
// Handler Methods
// ================================

// connectHandler generates and returns a JWT token
func (a *Api) connectHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		a.sendError(w, "Method not allowed. Use POST method", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		a.sendError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var requestBody map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &requestBody); err != nil {
		a.sendError(w, "Invalid JSON format", http.StatusBadRequest)
		return
	}

	userID, ok := requestBody["user_id"].(string)
	if !ok || userID == "" {
		userID = fmt.Sprintf("user_%d", time.Now().UnixNano())
	}

	metadata := make(map[string]interface{})
	if meta, ok := requestBody["metadata"].(map[string]interface{}); ok {
		metadata = meta
	}

	expirationMinutes := 60
	if exp, ok := requestBody["expiration_minutes"].(float64); ok {
		expirationMinutes = int(exp)
	}

	// Validate expiration range (1 min to 24 hours)
	if expirationMinutes < 1 {
		expirationMinutes = 1
	}
	if expirationMinutes > 1440 {
		expirationMinutes = 1440
	}

	token, err := a.generateJWTToken(userID, metadata, expirationMinutes)
	if err != nil {
		a.sendError(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	issuedAt := time.Now()
	expiresAt := issuedAt.Add(time.Minute * time.Duration(expirationMinutes))

	a.sendSuccess(w, "Connection token generated successfully", map[string]interface{}{
		"token":      token,
		"user_id":    userID,
		"metadata":   metadata,
		"issued_at":  issuedAt,
		"expires_at": expiresAt,
	}, http.StatusOK)

	log.Printf("Generated JWT token for user: %s, IP: %s", userID, getClientIP(r))
}

// validateTokenHandler checks if a JWT token is valid
func (a *Api) validateTokenHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		a.sendError(w, "Method not allowed. Use POST method", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		a.sendError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var requestBody map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &requestBody); err != nil {
		a.sendError(w, "Invalid JSON format", http.StatusBadRequest)
		return
	}

	token, ok := requestBody["token"].(string)
	if !ok || token == "" {
		a.sendError(w, "Token is required", http.StatusBadRequest)
		return
	}

	claims, err := a.validateJWTToken(token)
	if err != nil {
		a.sendError(w, fmt.Sprintf("Invalid token: %v", err), http.StatusUnauthorized)
		return
	}

	a.sendSuccess(w, "Token is valid", map[string]interface{}{
		"user_id":    claims.UserID,
		"metadata":   claims.Metadata,
		"issued_at":  claims.IssuedAt.Time,
		"expires_at": claims.ExpiresAt.Time,
		"issuer":     claims.Issuer,
	}, http.StatusOK)
}

// insertRequestLog logs request to database
func (a *Api) insertRequestLog(timestamp time.Time, method, path string, statusCode int, responseTimeMs float64, ipAddress, userID, userAgent string) {
	go func() {
		insertSQL := `
		INSERT INTO http_response_rate (timestamp, method, path, status_code, response_time_ms, ip_address, user_id, user_agent)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`

		// Assuming logDB has an Exec method
		if db, ok := a.logDB.(interface {
			Exec(query string, args ...interface{}) (interface{}, error)
		}); ok {
			_, err := db.Exec(insertSQL, timestamp, method, path, statusCode, responseTimeMs, ipAddress, userID, userAgent)
			if err != nil {
				log.Printf("Failed to insert request log: %v", err)
			}
		}
	}()
}

// ================================
// ResponseWriter Methods
// ================================

func (rw *responseWriter) WriteHeader(code int) {
	if !rw.written {
		rw.statusCode = code
		rw.written = true
		rw.ResponseWriter.WriteHeader(code)
	}
}

// ================================
// RateLimiter Methods
// ================================

// NewRateLimiter creates a new rate limiter instance
func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*Visitor),
		rate:     rate,
		window:   window,
	}

	// Cleanup old visitors periodically
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			rl.cleanup()
		}
	}()

	return rl
}

// IsAllowed checks if a request from the given IP is allowed
func (rl *RateLimiter) IsAllowed(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	visitor, exists := rl.visitors[ip]

	if !exists {
		rl.visitors[ip] = &Visitor{
			count:     1,
			lastReset: now,
		}
		return true
	}

	// Reset counter if window has passed
	if now.Sub(visitor.lastReset) > rl.window {
		visitor.count = 1
		visitor.lastReset = now
		return true
	}

	// Check if limit exceeded
	if visitor.count >= rl.rate {
		return false
	}

	visitor.count++
	return true
}

// cleanup removes old visitors
func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for ip, visitor := range rl.visitors {
		if now.Sub(visitor.lastReset) > rl.window*2 {
			delete(rl.visitors, ip)
		}
	}
}

// ================================
// JobTracker Methods
// ================================

// NewJobTracker creates a new job tracker instance
func NewJobTracker() *JobTracker {
	return &JobTracker{
		jobs: make(map[string]string),
	}
}

// SetJobStatus sets the status of a job
func (jt *JobTracker) SetJobStatus(jobID, status string) {
	jt.mu.Lock()
	defer jt.mu.Unlock()
	jt.jobs[jobID] = status
}

// GetJobStatus retrieves the status of a job
func (jt *JobTracker) GetJobStatus(jobID string) (string, bool) {
	jt.mu.RLock()
	defer jt.mu.RUnlock()
	status, exists := jt.jobs[jobID]
	return status, exists
}

// DeleteJob removes a job from tracking
func (jt *JobTracker) DeleteJob(jobID string) {
	jt.mu.Lock()
	defer jt.mu.Unlock()
	delete(jt.jobs, jobID)
}

// ================================
// Utility Functions
// ================================

// getClientIP extracts the client IP address from the request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	// Check X-Real-IP header
	xri := r.Header.Get("X-Real-IP")
	if xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}
