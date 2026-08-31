package ai

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// Every action the server dispatches must be reachable as a tool. Without this
// the assistant tells the user "I cannot do that" about things the ERP does,
// and nobody finds out until they ask.
func TestEveryDispatchedActionIsReachable(t *testing.T) {
	src, err := os.ReadFile("../api/handler.go")
	if err != nil {
		t.Skip("handler not readable")
	}
	all := string(src)
	for _, extra := range []string{"handler_expenses.go", "handler_periods.go", "handler_notifications.go", "employee_search.go"} {
		if b, err := os.ReadFile("../api/" + extra); err == nil {
			all += string(b)
		}
	}

	// Only cases that actually dispatch a handler. A bare `case "in":` inside a
	// switch on an inventory movement type is not an action, and neither is the
	// liveness probe.
	dispatched := map[string]bool{}
	re := regexp.MustCompile(`case "([a-z0-9_]+)":\s*\n\s*h\.(?:withAuth\(w, r, h\.)?\w+`)
	for _, m := range re.FindAllStringSubmatch(all, -1) {
		dispatched[m[1]] = true
	}

	// Deliberately unreachable. Credential operations are done by a person in
	// the account screen: a confirmation card reading "reset the password for
	// accounting@acme.ph" is a phishing primitive wearing the product's own
	// chrome, and the human approving it cannot tell a real request from one
	// the model was talked into. The session and the assistant's own endpoints
	// are excluded for more prosaic reasons — calling ai_prompt is a loop, and
	// logging out mid-turn removes the session the turn is running on.
	withheld := map[string]bool{
		"admin_reset_password": true, "change_password": true,
		"request_password_reset": true, "reset_password": true,
		"login": true, "logout": true, "logout_all": true,
		"register": true, "select_company": true,
		"ai_prompt": true, "ai_confirm": true, "ai_training_status": true,
		"health": true,

		// Account creation, withheld for the same reason as password resets:
		// these take a password and the company's wrapped encryption key. The
		// model would have to invent the password to fill the confirmation card
		// in, and the key material is generated in the browser and cannot be
		// produced server-side — so a proposal would be unsafe AND broken.
		"create_employee_account": true, "create_user": true, "update_user_access": true,

		// Face-recognition templates. The embeddings are company-key ciphertext
		// the server cannot read, so the model has nothing it could usefully
		// say about one, and it could not produce a valid template to enroll
		// even if asked. More to the point, enrolling or deleting biometrics is
		// a deliberate act a person performs at the kiosk with the subject
		// present and consenting — not something to reach through a chat turn.
		"get_face_templates": true, "save_face_template": true, "delete_face_template": true,
	}

	reg := NewRegistry()
	var missing, leaked []string
	for action := range dispatched {
		_, reachable := reg.Lookup(action)
		switch {
		case withheld[action] && reachable:
			leaked = append(leaked, action)
		case !withheld[action] && !reachable:
			missing = append(missing, action)
		}
	}
	if len(missing) > 0 {
		t.Errorf("%d dispatched actions have no tool: %v", len(missing), missing)
	}
	if len(leaked) > 0 {
		t.Errorf("actions that must not be model-callable are exposed: %v", leaked)
	}
	t.Logf("%d dispatched actions, %d tools, %d withheld", len(dispatched), len(reg.all), len(withheld))
}

// An action is a READ only if its verb says so; everything else must be marked
// Write and go through a confirmation card.
//
// This replaces a test that listed the write verbs — the same list the
// generator used, so the two shared a blind spot and agreed with each other
// while twenty-five mutating actions sat marked as reads: every save_*
// (savePurSettings calls UpsertSettings), confirm_so_order, revoke_*, pay_*,
// unpay_*, unapprove_*, refund_*, auto_map_payroll_accounts. Each would have
// executed straight from a model turn with nobody asked.
//
// Stated the other way round, a verb nobody anticipated now defaults to
// requiring confirmation, which costs a click. The previous default spent data.
func TestOnlyReadVerbsAreUnconfirmed(t *testing.T) {
	readVerbs := map[string]bool{
		"get": true, "list": true, "search": true, "find": true,
		"preview": true, "export": true, "download": true, "check": true,
	}
	for _, tool := range NewRegistry().All() {
		verb := tool.Action
		if i := strings.IndexByte(tool.Action, '_'); i >= 0 {
			verb = tool.Action[:i]
		}
		if !tool.Write && !readVerbs[verb] {
			t.Errorf("%s executes without confirmation but does not look like a read", tool.Action)
		}
		if tool.Write && strings.HasPrefix(tool.Action, "get_") {
			t.Errorf("%s is a read marked as a write", tool.Action)
		}
	}
}

// Spot-check the ones that were actually wrong, by name, so a future
// regeneration cannot quietly reintroduce them.
func TestKnownMutatorsRequireConfirmation(t *testing.T) {
	reg := NewRegistry()
	for _, action := range []string{
		"save_pur_settings", "save_so_settings", "save_leave_plan",
		"confirm_so_order", "auto_map_payroll_accounts",
	} {
		tool, ok := reg.Lookup(action)
		if !ok {
			continue
		}
		if !tool.Write {
			t.Errorf("%s mutates but would execute unconfirmed", action)
		}
	}
}

// No tool may accept a password, a salt, or the company's wrapped encryption
// key. The first two are credentials; the third is generated in the browser and
// never exists server-side, so a model proposing one is proposing nonsense.
func TestNoToolAcceptsCredentialMaterial(t *testing.T) {
	banned := []string{"password", "salt", "secret", "token", "api_key", "private_key",
		"signing_public_key", "wrapped_company_key"}
	for _, tool := range NewRegistry().All() {
		props, ok := tool.Schema["properties"].(map[string]any)
		if !ok {
			continue
		}
		for name := range props {
			lower := strings.ToLower(name)
			for _, bad := range banned {
				if strings.Contains(lower, bad) {
					t.Errorf("%s accepts %q", tool.Action, name)
				}
			}
		}
	}
}
