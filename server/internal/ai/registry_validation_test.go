package ai

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"testing"
)

// Every tool must name a real action, and its Module/Fn must match the server's
// permission table — a mismatch means the pre-filter hides a tool the user
// could actually run, or offers one they cannot.
func TestToolsMatchTheBackend(t *testing.T) {
	src, err := os.ReadFile("../api/handler.go")
	if err != nil {
		t.Skip("handler not readable")
	}
	text := string(src)

	perms := map[string][2]string{}
	re := regexp.MustCompile(`"([a-z0-9_]+)":\s*\{"([a-z_]+)",\s*"([a-z_]+)"\}`)
	for _, m := range re.FindAllStringSubmatch(text, -1) {
		perms[m[1]] = [2]string{m[2], m[3]}
	}

	var missing, mismatched, badSchema []string
	for _, tool := range NewRegistry().all {
		if !strings.Contains(text, `case "`+tool.Action+`":`) {
			missing = append(missing, tool.Action)
		}
		want, declared := perms[tool.Action]
		got := [2]string{tool.Module, tool.Fn}
		if declared && got != want {
			mismatched = append(mismatched, tool.Action+" tool="+got[0]+":"+got[1]+" server="+want[0]+":"+want[1])
		}
		if !declared && tool.Module != "" {
			mismatched = append(mismatched, tool.Action+" tool declares "+tool.Module+":"+tool.Fn+" but server requires none")
		}
		if _, err := json.Marshal(tool.Schema); err != nil {
			badSchema = append(badSchema, tool.Action)
		}
	}
	if len(missing) > 0 {
		t.Errorf("tools naming actions the server does not dispatch (%d): %v", len(missing), missing)
	}
	if len(mismatched) > 0 {
		t.Errorf("permission mismatches (%d):\n  %s", len(mismatched), strings.Join(mismatched, "\n  "))
	}
	if len(badSchema) > 0 {
		t.Errorf("unserialisable schemas: %v", badSchema)
	}
	t.Logf("%d tools validated", len(NewRegistry().all))
}
