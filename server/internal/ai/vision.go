package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Document understanding is kept separate from tool calling on purpose.
//
// It is tempting to give one model both jobs, but they pull apart:
//
//   - They need different bases. Reading a receipt needs a vision-language
//     model (Qwen3-VL and friends); choosing an ERP action does not. Training
//     one adapter for both means every tenant carries the cost of vision
//     weights whether or not they scan anything.
//   - Extraction is measurable in a way tool calling is not. "Did it read
//     ₱2,340 off this receipt" has a ground truth you can score against a
//     handful of scanned samples. That makes it independently improvable, and
//     independently replaceable — if a VLM underperforms, a dedicated OCR stack
//     drops in behind this same interface without touching the adapter.
//   - Failure modes differ. A misread total should surface as a low-confidence
//     field the user corrects, not as a tool call the model is confident about.
//
// So extraction runs BEFORE the model turn: the image becomes structured
// fields, those fields go into the prompt as context, and the tool-calling
// model does what it already does. It never sees pixels.
type Attachment struct {
	// Filename is used only in messages back to the user.
	Filename  string
	MediaType string
	Data      []byte
}

// Kind classifies what a scan is, so the extractor can ask for the right fields.
type Kind string

const (
	KindReceipt Kind = "receipt"
	KindInvoice Kind = "invoice"
	KindID      Kind = "id"
	KindUnknown Kind = "unknown"
)

// Extraction is the structured result of reading one document.
type Extraction struct {
	Kind   Kind           `json:"kind"`
	Fields map[string]any `json:"fields"`

	// Confidence is the extractor's own estimate, 0..1. It is advisory: a VLM's
	// self-reported confidence is not calibrated, and it is used to decide
	// whether to flag a field for review, never to decide whether to act.
	Confidence float64 `json:"confidence"`

	// Notes carries anything the extractor could not fit into Fields —
	// unreadable regions, ambiguity between two candidate totals.
	Notes string `json:"notes,omitempty"`
}

// Extractor reads a document image into fields.
type Extractor interface {
	Extract(ctx context.Context, att Attachment, kind Kind) (*Extraction, error)
}

// NopExtractor is used when no vision model is configured. It reports the
// absence plainly rather than returning empty fields, so the user is told
// scanning is off instead of watching it silently produce nothing.
type NopExtractor struct{}

func (NopExtractor) Extract(context.Context, Attachment, Kind) (*Extraction, error) {
	return nil, fmt.Errorf("document scanning is not enabled on this server")
}

// VLMExtractor reads documents with a vision-language model served over the
// same OpenAI-compatible endpoint as everything else — vLLM serving Qwen3-VL,
// or any server speaking that dialect with image support.
type VLMExtractor struct {
	baseURL string
	model   string
	apiKey  string
	client  *http.Client
}

func NewVLMExtractor(baseURL, model, apiKey string, client *http.Client) *VLMExtractor {
	if client == nil {
		client = http.DefaultClient
	}
	return &VLMExtractor{
		baseURL: strings.TrimRight(baseURL, "/"),
		model:   model,
		apiKey:  apiKey,
		client:  client,
	}
}

// maxImageBytes caps what is sent to the model. Phone cameras produce files far
// larger than a document model needs, and the cost is paid in both latency and
// context.
const maxImageBytes = 8 << 20

// extractionSchema is what the model is asked to fill.
//
// One schema covers both document types the ERP cares about, with `kind`
// saying which was seen. Field names match their destinations exactly — the
// expense fields mirror create_exp_claim's line schema, the identity fields
// mirror the employee record's field ids — so the downstream step is a rename
// rather than a translation. Every mapping hop is somewhere a value can be
// silently dropped or land in the wrong column.
const extractionSchema = `{
  "kind": "receipt|invoice|id|unknown",
  "fields": {
    "merchant": "receipts: who was paid",
    "expense_date": "receipts: YYYY-MM-DD",
    "receipt_no": "receipts: receipt or OR number",
    "amount": "receipts: number, gross total",
    "tax_amount": "receipts: number, VAT included in amount",
    "currency": "receipts: ISO code if printed",
    "description": "receipts: one line on what was bought",

    "first_name": "IDs: given name",
    "middle_name": "IDs: middle name",
    "last_name": "IDs: family name",
    "birthday": "IDs: date of birth, YYYY-MM-DD",
    "address": "IDs: full address as printed",
    "sss_no": "IDs: SSS number, if this is an SSS or UMID card",
    "philhealth_no": "IDs: PhilHealth number",
    "pagibig_no": "IDs: Pag-IBIG / HDMF number",
    "tin": "IDs: BIR TIN"
  },
  "confidence": "number 0..1",
  "notes": "string, anything unreadable or ambiguous"
}`

func (v *VLMExtractor) Extract(ctx context.Context, att Attachment, kind Kind) (*Extraction, error) {
	if len(att.Data) == 0 {
		return nil, fmt.Errorf("attachment %q is empty", att.Filename)
	}
	if len(att.Data) > maxImageBytes {
		return nil, fmt.Errorf("attachment %q is %dMB; the limit is %dMB — rescan at a lower resolution",
			att.Filename, len(att.Data)>>20, maxImageBytes>>20)
	}
	if !strings.HasPrefix(att.MediaType, "image/") {
		// PDFs need rasterising first. Saying so is more useful than sending
		// bytes the model will silently fail to read.
		return nil, fmt.Errorf("%q is %s; only images can be scanned directly", att.Filename, att.MediaType)
	}

	var prompt strings.Builder
	prompt.WriteString("Read this document and return ONLY a JSON object of this shape:\n")
	prompt.WriteString(extractionSchema)
	prompt.WriteString("\n\nRules:\n")
	// The instruction that matters most. A model that guesses a total produces
	// a confident, plausible, wrong expense claim — which is worse than one
	// that leaves the field out and makes the user type it.
	prompt.WriteString("- Use null for anything you cannot read. Never guess a number.\n")
	// Identity documents are the case where a confident misread does the most
	// damage: a wrong digit in a TIN or SSS number is filed against a real
	// person and is not obviously wrong to whoever approves it.
	prompt.WriteString("- On an ID card, transcribe numbers EXACTLY as printed, digit by digit, keeping any dashes. If any digit is unclear, set the whole field to null rather than guessing it.\n")
	prompt.WriteString("- Only fill fields that belong to the document type in front of you. Leave the rest null.\n")
	prompt.WriteString("- amount is the gross total actually paid, not a subtotal.\n")
	prompt.WriteString("- Dates must be YYYY-MM-DD. If the year is not printed, use null.\n")
	if kind != "" && kind != KindUnknown {
		fmt.Fprintf(&prompt, "- This is expected to be a %s.\n", kind)
	}

	dataURI := "data:" + att.MediaType + ";base64," + base64.StdEncoding.EncodeToString(att.Data)

	body := map[string]any{
		"model":       v.model,
		"temperature": 0,
		"max_tokens":  1024,
		"messages": []map[string]any{{
			"role": "user",
			"content": []map[string]any{
				{"type": "text", "text": prompt.String()},
				{"type": "image_url", "image_url": map[string]any{"url": dataURI}},
			},
		}},
	}

	raw, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.baseURL+"/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if v.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+v.apiKey)
	}

	resp, err := v.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call vision model: %w", err)
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("vision model returned %d: %s", resp.StatusCode, truncate(string(payload), 300))
	}

	var out oaiResponse
	if err := json.Unmarshal(payload, &out); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if len(out.Choices) == 0 {
		return nil, fmt.Errorf("vision model returned no choices")
	}

	return parseExtraction(out.Choices[0].Message.Content)
}

// parseExtraction pulls the JSON object out of the model's reply.
//
// Vision models wrap JSON in prose and fenced code blocks far more often than
// text models do, even when told not to, so the object is located rather than
// assumed to be the whole response.
func parseExtraction(content string) (*Extraction, error) {
	s := strings.TrimSpace(content)
	if s == "" {
		return nil, fmt.Errorf("vision model returned an empty response")
	}

	if i := strings.Index(s, "{"); i >= 0 {
		if j := strings.LastIndex(s, "}"); j > i {
			s = s[i : j+1]
		}
	}

	var ex Extraction
	if err := json.Unmarshal([]byte(s), &ex); err != nil {
		return nil, fmt.Errorf("vision model did not return usable JSON: %v", err)
	}
	if ex.Fields == nil {
		ex.Fields = map[string]any{}
	}
	if ex.Kind == "" {
		ex.Kind = KindUnknown
	}

	// Drop nulls so downstream code can treat presence as meaning "read
	// successfully". A null total left in the map would otherwise reach the
	// confirmation card as a real, empty-looking value.
	for k, val := range ex.Fields {
		if val == nil {
			delete(ex.Fields, k)
		}
	}
	return &ex, nil
}

// Describe renders an extraction as prompt context for the tool-calling model.
//
// Unreadable fields are named as missing rather than omitted silently: the
// model needs to know a total was not readable so it can ask, instead of
// proposing a claim with no amount and leaving the user to notice.
func (e *Extraction) Describe(filename string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "The user attached %q, read as a %s:\n", filename, e.Kind)

	// Only report the fields relevant to what was actually seen — listing
	// "merchant: could not be read" under an ID card is noise that makes the
	// real gaps harder to spot.
	keys := []string{"merchant", "expense_date", "amount", "tax_amount", "currency", "receipt_no", "description"}
	if e.Kind == KindID {
		keys = []string{"first_name", "middle_name", "last_name", "birthday", "address",
			"sss_no", "philhealth_no", "pagibig_no", "tin"}
	}
	for _, k := range keys {
		if v, ok := e.Fields[k]; ok {
			fmt.Fprintf(&b, "- %s: %v\n", k, v)
		} else {
			fmt.Fprintf(&b, "- %s: could not be read\n", k)
		}
	}
	if e.Notes != "" {
		fmt.Fprintf(&b, "Scan notes: %s\n", e.Notes)
	}
	if e.Confidence > 0 && e.Confidence < 0.6 {
		b.WriteString("This scan was low quality — ask the user to confirm the figures rather than assuming them.\n")
	}
	return b.String()
}
