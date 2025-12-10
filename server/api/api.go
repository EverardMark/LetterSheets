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

	"server/db"
	"server/encryption"

	"github.com/golang-jwt/jwt/v5"
)

// ================================
// Core Structs
// ================================

type Api struct {
	config      map[string]interface{}
	jwtSecret   []byte
	rateLimiter *RateLimiter
	jobTracker  *JobTracker
	db          *db.MySQLDB
	encryption  *encryption.Server
}

type JobTracker struct {
	jobs map[string]string
	mu   sync.RWMutex
}

type Claims struct {
	UserID   string                 `json:"user_id"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
	jwt.RegisteredClaims
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
	written    bool
}

type RateLimiter struct {
	visitors map[string]*Visitor
	mu       sync.RWMutex
	rate     int
	window   time.Duration
}

type Visitor struct {
	count     int
	lastReset time.Time
}

// ================================
// Api Methods
// ================================

func NewApi(config map[string]interface{}) (*Api, error) {
	api := &Api{
		config:     config,
		jobTracker: NewJobTracker(),
	}

	jwtSecretKey, ok := config["jwt_secret"].(string)
	if !ok || jwtSecretKey == "" {
		jwtSecretKey = "your-secret-key-change-this-in-production-min-32-chars"
		log.Println("WARNING: Using default JWT secret")
	}
	api.jwtSecret = []byte(jwtSecretKey)
	api.rateLimiter = NewRateLimiter(60, time.Minute)

	if dbConfig, ok := config["database"].(map[string]interface{}); ok {
		database, err := db.NewMySQLDB(dbConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to database: %w", err)
		}
		api.db = database
		api.encryption = encryption.NewServer(database)
	}

	os.MkdirAll("./files", os.ModePerm)
	return api, nil
}

func (a *Api) Start() error {
	// JWT endpoints
	http.HandleFunc("/connect", a.middleware(a.connectHandler))
	http.HandleFunc("/validate-token", a.middleware(a.validateTokenHandler))

	// Encryption endpoints
	http.HandleFunc("/register", a.middleware(a.encryption.RegisterHandler))
	http.HandleFunc("/enable", a.middleware(a.encryption.EnableHandler))
	http.HandleFunc("/request", a.middleware(a.encryption.RequestHandler))
	http.HandleFunc("/recovery", a.middleware(a.encryption.RecoveryHandler))

	// Execute endpoint
	http.HandleFunc("/execute", a.middlewareWithJWT(func(w http.ResponseWriter, r *http.Request) {
		a.executeDataHandler(w, r, a.config)
	}))

	// Static files
	fs := http.FileServer(http.Dir("./files"))
	http.Handle("/media/", a.jwtMiddlewareHandler(http.StripPrefix("/media/", fs)))

	appPort, _ := a.config["port"].(string)
	if appPort == "" {
		appPort = "8001"
	}

	fmt.Printf("Server starting on port %s...\n", appPort)
	fmt.Println("Endpoints:")
	fmt.Println("  POST /register - Register new company")
	fmt.Println("  POST /enable   - Enable encryption for existing company")
	fmt.Println("  POST /request  - Signed requests")
	fmt.Println("  POST /recovery - Get recovery blob")
	log.Fatal(http.ListenAndServe(":"+appPort, nil))
	return nil
}

// ================================
// JWT Handlers
// ================================

func (a *Api) connectHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		a.sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	var req map[string]interface{}
	json.Unmarshal(bodyBytes, &req)

	userID, _ := req["user_id"].(string)
	if userID == "" {
		userID = fmt.Sprintf("user_%d", time.Now().UnixNano())
	}

	metadata, _ := req["metadata"].(map[string]interface{})
	expMin := 60
	if exp, ok := req["expiration_minutes"].(float64); ok && exp > 0 {
		expMin = int(exp)
	}

	token, err := a.generateJWTToken(userID, metadata, expMin)
	if err != nil {
		a.sendError(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	a.sendSuccess(w, "Token generated", map[string]interface{}{
		"token":   token,
		"user_id": userID,
	}, http.StatusOK)
}

func (a *Api) validateTokenHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		a.sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	var req map[string]interface{}
	json.Unmarshal(bodyBytes, &req)

	token, _ := req["token"].(string)
	claims, err := a.validateJWTToken(token)
	if err != nil {
		a.sendError(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	a.sendSuccess(w, "Valid", map[string]interface{}{"user_id": claims.UserID}, http.StatusOK)
}

func (a *Api) generateJWTToken(userID string, metadata map[string]interface{}, expMin int) (string, error) {
	claims := Claims{
		UserID:   userID,
		Metadata: metadata,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute * time.Duration(expMin))),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.jwtSecret)
}

func (a *Api) validateJWTToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
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

func (a *Api) extractAndValidateToken(r *http.Request) (*Claims, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return nil, fmt.Errorf("authorization required")
	}
	parts := strings.Split(auth, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return nil, fmt.Errorf("invalid authorization format")
	}
	return a.validateJWTToken(parts[1])
}

// ================================
// Middleware
// ================================

func (a *Api) middleware(handler http.HandlerFunc) http.HandlerFunc {
	return a.responseTimeMiddleware(a.rateLimitMiddleware(handler))
}

func (a *Api) middlewareWithJWT(handler http.HandlerFunc) http.HandlerFunc {
	return a.middleware(a.jwtMiddleware(handler))
}

func (a *Api) responseTimeMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &responseWriter{ResponseWriter: w, statusCode: 200}
		next.ServeHTTP(wrapped, r)
		log.Printf("[%s] %s - %d - %v", r.Method, r.URL.Path, wrapped.statusCode, time.Since(start))
	}
}

func (a *Api) rateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.rateLimiter.IsAllowed(getClientIP(r)) {
			a.sendError(w, "Rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next(w, r)
	}
}

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

func (rw *responseWriter) WriteHeader(code int) {
	if !rw.written {
		rw.statusCode = code
		rw.written = true
		rw.ResponseWriter.WriteHeader(code)
	}
}

// ================================
// Helpers
// ================================

func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*Visitor),
		rate:     rate,
		window:   window,
	}
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			rl.mu.Lock()
			now := time.Now()
			for ip, v := range rl.visitors {
				if now.Sub(v.lastReset) > rl.window*2 {
					delete(rl.visitors, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()
	return rl
}

func (rl *RateLimiter) IsAllowed(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	v, exists := rl.visitors[ip]
	if !exists {
		rl.visitors[ip] = &Visitor{count: 1, lastReset: now}
		return true
	}
	if now.Sub(v.lastReset) > rl.window {
		v.count = 1
		v.lastReset = now
		return true
	}
	if v.count >= rl.rate {
		return false
	}
	v.count++
	return true
}

func NewJobTracker() *JobTracker {
	return &JobTracker{jobs: make(map[string]string)}
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.Split(xff, ",")[0]
	}
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}
