package eval

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"lettersheets/internal/ai"
)

// TestConversations plays multi-turn conversations against a live model.
//
//	EVAL_URL=http://host:8000 EVAL_KEY=... EVAL_MODEL=qwen3-8b EVAL_FOLLOWUPS=0 \
//	  go test ./internal/ai/eval/ -run TestConversations -v
func TestConversations(t *testing.T) {
	base := os.Getenv("EVAL_URL")
	if base == "" {
		t.Skip("set EVAL_URL to run conversations against a live model")
	}
	model := os.Getenv("EVAL_MODEL")
	if model == "" {
		model = "qwen3-8b"
	}
	reg := ai.NewRegistry()
	engine := ai.NewEngine(
		ai.StaticRouter{P: ai.NewLocalProvider(base, model, os.Getenv("EVAL_KEY"), 180*time.Second)},
		reg, nil)
	handlers := os.Getenv("EVAL_FOLLOWUPS") != "0"
	engine.SetFollowUps(handlers)

	var out []string
	pass, total := 0, 0
	for _, c := range Conversations() {
		p, n, log := RunConversation(context.Background(), engine, &ConversationExecutor{}, c)
		pass, total = pass+p, total+n
		out = append(out, fmt.Sprintf("  %s  (%d/%d)", c.Name, p, n))
		out = append(out, log...)
	}
	header := fmt.Sprintf("\nMODEL %s   handlers=%v   PASS %d/%d\n", model, handlers, pass, total)
	t.Log(header + strings.Join(out, "\n"))

	if f, err := os.Create("/tmp/eval-conversations.txt"); err == nil {
		fmt.Fprint(f, header+strings.Join(out, "\n")+"\n")
		f.Close()
	}
}
