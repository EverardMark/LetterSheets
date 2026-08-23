package ai

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// ValidateArgs checks a model's tool arguments against the tool's schema and
// returns a message written to be fed back to the model.
//
// This is not defensive coding against a broken client — it is the expected
// path. Open-weight models at the sizes worth self-hosting reliably produce
// arguments that are almost right: a missing required field, a display name
// where a UUID belongs, an invented enum value, a number sent as a string. The
// handlers already reject those, but a handler's error is written for a person
// ("employee_id is required"), and returning it verbatim tends to make a small
// model retry the identical call. The errors below name the field, say what was
// wrong, and — for enums — list what was allowed, which is what actually gets a
// retry to converge.
//
// Validation is deliberately shallow: presence, JSON type, and enum membership.
// Anything deeper (does this UUID exist, is this date in an open period) is the
// handler's job and stays there — duplicating it here would mean two places to
// keep in step.
func ValidateArgs(t Tool, args json.RawMessage) error {
	var got map[string]any
	if len(args) == 0 {
		got = map[string]any{}
	} else if err := json.Unmarshal(args, &got); err != nil {
		return fmt.Errorf("arguments for %s were not a JSON object: %v", t.Action, err)
	}

	props, _ := t.Schema["properties"].(map[string]any)
	required, _ := t.Schema["required"].([]string)

	var problems []string

	for _, r := range required {
		v, present := got[r]
		if !present || v == nil || v == "" {
			problems = append(problems, fmt.Sprintf("%q is required but was %s", r, describeMissing(present, v)))
		}
	}

	// Unknown fields are reported rather than ignored. A model inventing
	// company_id or employee_name is telling you the tool description is
	// ambiguous, and silently dropping it hides that.
	if props != nil {
		var unknown []string
		for k := range got {
			if _, ok := props[k]; !ok {
				unknown = append(unknown, k)
			}
		}
		if len(unknown) > 0 {
			sort.Strings(unknown)
			known := make([]string, 0, len(props))
			for k := range props {
				known = append(known, k)
			}
			sort.Strings(known)
			problems = append(problems, fmt.Sprintf("unknown field(s) %s; %s accepts only: %s",
				quoteList(unknown), t.Action, strings.Join(known, ", ")))
		}

		for name, raw := range got {
			spec, ok := props[name].(map[string]any)
			if !ok || raw == nil {
				continue
			}
			if err := checkValue(name, raw, spec); err != nil {
				problems = append(problems, err.Error())
			}
		}
	}

	if len(problems) == 0 {
		return nil
	}
	sort.Strings(problems)
	return fmt.Errorf("%s", strings.Join(problems, "; "))
}

func describeMissing(present bool, v any) string {
	if !present {
		return "not provided"
	}
	if v == nil {
		return "null"
	}
	return "empty"
}

// checkValue verifies one field's JSON type and enum membership.
func checkValue(name string, raw any, spec map[string]any) error {
	wantType, _ := spec["type"].(string)

	switch wantType {
	case "string":
		s, ok := raw.(string)
		if !ok {
			return fmt.Errorf("%q must be a string, got %s", name, jsonKind(raw))
		}
		if enum, ok := spec["enum"].([]string); ok && len(enum) > 0 {
			for _, e := range enum {
				if s == e {
					return nil
				}
			}
			return fmt.Errorf("%q was %q, which is not allowed; use one of: %s", name, s, strings.Join(enum, ", "))
		}
	case "number", "integer":
		// encoding/json decodes every JSON number into float64, so the check is
		// on the decoded kind, not on Go's numeric types.
		if _, ok := raw.(float64); !ok {
			return fmt.Errorf("%q must be a number, got %s — send 1200.50, not \"1200.50\"", name, jsonKind(raw))
		}
	case "boolean":
		if _, ok := raw.(bool); !ok {
			return fmt.Errorf("%q must be true or false, got %s", name, jsonKind(raw))
		}
	case "array":
		items, ok := raw.([]any)
		if !ok {
			return fmt.Errorf("%q must be an array, got %s", name, jsonKind(raw))
		}
		itemSpec, hasItems := spec["items"].(map[string]any)
		if !hasItems {
			return nil
		}
		itemProps, _ := itemSpec["properties"].(map[string]any)
		itemReq, _ := itemSpec["required"].([]string)
		for i, it := range items {
			m, ok := it.(map[string]any)
			if !ok {
				return fmt.Errorf("%q must be an object, got %s", fmt.Sprintf("%s[%d]", name, i), jsonKind(it))
			}
			for _, r := range itemReq {
				if v, present := m[r]; !present || v == nil || v == "" {
					return fmt.Errorf("%q is required but was %s", fmt.Sprintf("%s[%d].%s", name, i, r), describeMissing(present, v))
				}
			}
			for k, v := range m {
				if sub, ok := itemProps[k].(map[string]any); ok && v != nil {
					if err := checkValue(fmt.Sprintf("%s[%d].%s", name, i, k), v, sub); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

func jsonKind(v any) string {
	switch t := v.(type) {
	case string:
		return fmt.Sprintf("the string %q", t)
	case float64:
		return "a number"
	case bool:
		return "a boolean"
	case []any:
		return "an array"
	case map[string]any:
		return "an object"
	case nil:
		return "null"
	}
	return "an unexpected value"
}

func quoteList(xs []string) string {
	out := make([]string, len(xs))
	for i, x := range xs {
		out[i] = fmt.Sprintf("%q", x)
	}
	return strings.Join(out, ", ")
}
