package api

import (
	"testing"

	"lettersheets/internal/models"
)

func sess(role, perms string) *models.UserSession {
	var p *string
	if perms != "" {
		p = &perms
	}
	return &models.UserSession{Role: role, Permissions: p}
}

func TestAuthorize(t *testing.T) {
	cases := []struct {
		name   string
		action string
		sess   *models.UserSession
		want   bool
	}{
		// superadmin / admin bypass every module check
		{"superadmin posts journal", "post_journal_entry", sess(models.RoleSuperAdmin, ""), true},
		{"admin runs payroll", "create_payroll_run", sess(models.RoleAdmin, ""), true},
		{"superadmin deletes employee", "delete_employee", sess(models.RoleSuperAdmin, ""), true},

		// self-service-only employee (no perms) is blocked from privileged actions
		{"employee cannot post journal", "post_journal_entry", sess(models.RoleEmployee, ""), false},
		{"employee cannot run payroll", "create_payroll_run", sess(models.RoleEmployee, ""), false},
		{"employee cannot approve own leave", "approve_leave", sess(models.RoleEmployee, ""), false},
		{"employee cannot approve own loan", "approve_loan", sess(models.RoleEmployee, ""), false},
		{"employee cannot delete company account", "delete_account", sess(models.RoleEmployee, ""), false},

		// permission held -> allowed; adjacent function -> denied
		{"accounting create allows create_journal", "create_journal_entry", sess(models.RoleEmployee, `{"accounting":["view","create"]}`), true},
		{"accounting create does NOT allow post (edit)", "post_journal_entry", sess(models.RoleEmployee, `{"accounting":["view","create"]}`), false},
		{"accounting edit allows post", "post_journal_entry", sess(models.RoleEmployee, `{"accounting":["edit"]}`), true},
		{"leave approve permission allows approve_leave", "approve_leave", sess(models.RoleEmployee, `{"leave":["view","approve"]}`), true},
		{"loans payments allows record_loan_payment", "record_loan_payment", sess(models.RoleEmployee, `{"loans":["payments"]}`), true},

		// unmapped actions (reads / self-service) require only a valid session
		{"any user may read employees", "get_employees", sess(models.RoleEmployee, ""), true},
		{"any user may submit own leave", "create_leave", sess(models.RoleEmployee, ""), true},
		{"any user may submit own loan", "create_loan", sess(models.RoleEmployee, ""), true},
		{"any user may clock in", "clock_in", sess(models.RoleEmployee, ""), true},
		{"any user may create ticket", "create_ticket", sess(models.RoleEmployee, ""), true},

		// malformed permissions blob degrades to self-service-only (deny privileged)
		{"garbage perms denies privileged", "delete_employee", sess(models.RoleEmployee, "not-json"), false},
	}

	for _, c := range cases {
		if got := authorize(c.action, c.sess); got != c.want {
			t.Errorf("%s: authorize(%q) = %v, want %v", c.name, c.action, got, c.want)
		}
	}
}
