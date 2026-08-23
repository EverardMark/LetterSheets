// Package eval runs the assistant against a broad corpus of prompts and scores
// what comes back.
//
// It exists because the alternative was the user finding failures one screenshot
// at a time. A registry of 438 tools cannot be checked by hand, and every fix so
// far was prompted by a specific prompt going wrong — which says nothing about
// the four hundred that were never tried. The corpus is generated FROM the
// registry, so it grows automatically as tools are added, and every run reports
// a pass rate and the failures by class rather than by instance.
package eval

import (
	"fmt"
	"strings"

	"lettersheets/internal/ai"
)

// Case is one prompt and what a correct answer looks like.
type Case struct {
	Prompt string
	// Want is the action the prompt was generated from. A different action can
	// still be correct — several tools legitimately answer "receive goods" —
	// so scoring treats a same-family action as a pass and reports it.
	Want   string
	Module string
	Write  bool
}

// Build turns the registry into prompts.
//
// One prompt per tool, phrased the way its own keywords say a user would phrase
// it. This is deliberately not clever: the point is breadth and the ability to
// regenerate, not naturalness. Where a tool's keywords are poor the prompt is
// poor too — which is itself worth knowing, because that is exactly the tool a
// user will fail to reach.
func Build(reg *ai.Registry, limitPerModule int) []Case {
	byModule := map[string]int{}
	var out []Case

	for _, tool := range reg.All() {
		module := tool.Module
		if module == "" {
			module = moduleOf(tool.Action)
		}
		if limitPerModule > 0 && byModule[module] >= limitPerModule {
			continue
		}
		prompt := phrase(tool)
		if prompt == "" {
			continue
		}
		byModule[module]++
		out = append(out, Case{Prompt: prompt, Want: tool.Action, Module: module, Write: tool.Write})
	}
	return out
}

// phrase writes the prompt a user would type to reach this tool.
func phrase(tool ai.Tool) string {
	verb, subject := split(tool.Action)
	subject = strings.ReplaceAll(subject, "_", " ")
	for short, long := range abbrev {
		subject = strings.ReplaceAll(subject, short, long)
	}
	if subject == "" {
		return ""
	}
	switch verb {
	case "get":
		if strings.HasSuffix(subject, "s") {
			return "show me the " + subject
		}
		return "show me the " + subject
	case "create", "add":
		return "add a new " + strings.TrimSuffix(subject, "s")
	case "update":
		return "update the " + strings.TrimSuffix(subject, "s")
	case "delete":
		return "delete the " + strings.TrimSuffix(subject, "s")
	case "approve":
		return "approve the " + strings.TrimSuffix(subject, "s")
	case "post":
		return "post the " + strings.TrimSuffix(subject, "s")
	case "void":
		return "void the " + strings.TrimSuffix(subject, "s")
	case "send":
		return "send the " + strings.TrimSuffix(subject, "s")
	case "cancel":
		return "cancel the " + strings.TrimSuffix(subject, "s")
	case "toggle":
		return "turn off the " + strings.TrimSuffix(subject, "s")
	case "assign":
		return "assign the " + strings.TrimSuffix(subject, "s")
	}
	return fmt.Sprintf("%s the %s", verb, strings.TrimSuffix(subject, "s"))
}

func split(action string) (string, string) {
	if i := strings.IndexByte(action, '_'); i >= 0 {
		return action[:i], action[i+1:]
	}
	return action, ""
}

var abbrev = map[string]string{
	"so ": "sales order ", "po ": "purchase order ", "pur ": "purchase ",
	"crm ": "", "exp ": "expense ", "fa ": "fixed asset ", "inv ": "inventory ",
	"coa ": "chart of accounts ", "ap ": "payables ", "ar ": "receivables ",
}

// moduleOf groups tools with no permission entry by their subject prefix, so a
// report still says where a failure lives.
func moduleOf(action string) string {
	_, subject := split(action)
	if i := strings.IndexByte(subject, '_'); i >= 0 {
		return subject[:i]
	}
	if subject == "" {
		return "other"
	}
	return subject
}
