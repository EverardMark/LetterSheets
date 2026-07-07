package api

import (
	"encoding/json"

	"lettersheets/internal/models"
)

// Permissions mirrors the client-side permission model in
// app/web/src/utils/permissions.js so authorization is enforced on the SERVER,
// not merely hidden in the UI.
//
// Model: everyone is an employee. "superadmin" and "admin" bypass all module
// checks. Every other user carries a JSON permissions blob (from
// user_company_access.permissions, surfaced on the session) of the shape:
//
//	{"leave": ["view","approve"], "accounting": ["view","create"], ...}
type Permissions struct {
	role  string
	perms map[string][]string
}

// NewPermissions builds a Permissions from a session's permissions JSON and role.
// A nil/empty/invalid blob yields a self-service-only user (no module rights).
func NewPermissions(permsJSON *string, role string) Permissions {
	p := Permissions{role: role, perms: map[string][]string{}}
	if permsJSON != nil && *permsJSON != "" {
		var m map[string][]string
		if err := json.Unmarshal([]byte(*permsJSON), &m); err == nil && m != nil {
			p.perms = m
		}
	}
	return p
}

// IsSuperAdmin reports whether the role bypasses module permission checks.
// Matches permissions.js isSuperAdmin(): both "superadmin" and "admin".
func (p Permissions) IsSuperAdmin() bool {
	return p.role == models.RoleSuperAdmin || p.role == models.RoleAdmin
}

// Can reports whether the user may perform fn on module.
func (p Permissions) Can(module, fn string) bool {
	if p.IsSuperAdmin() {
		return true
	}
	for _, f := range p.perms[module] {
		if f == fn {
			return true
		}
	}
	return false
}
