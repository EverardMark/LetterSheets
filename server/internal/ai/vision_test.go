package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func jpeg(data string) Attachment {
	return Attachment{Filename: "receipt.jpg", MediaType: "image/jpeg", Data: []byte(data)}
}

// Vision models wrap JSON in prose and code fences far more often than text
// models, even when told not to. The object has to be located, not assumed.
func TestParseExtractionToleratesWrapping(t *testing.T) {
	cases := []string{
		`{"kind":"receipt","fields":{"amount":2340},"confidence":0.9}`,
		"```json\n{\"kind\":\"receipt\",\"fields\":{\"amount\":2340},\"confidence\":0.9}\n```",
		"Here is what I read:\n{\"kind\":\"receipt\",\"fields\":{\"amount\":2340},\"confidence\":0.9}\nHope that helps!",
	}

	for _, c := range cases {
		got, err := parseExtraction(c)
		if err != nil {
			t.Fatalf("input %q: %v", truncate(c, 40), err)
		}
		if got.Fields["amount"] != float64(2340) {
			t.Errorf("input %q: amount = %v", truncate(c, 40), got.Fields["amount"])
		}
	}
}

// A field the model could not read must disappear, not arrive as a null that
// downstream code mistakes for a real value.
func TestParseExtractionDropsNulls(t *testing.T) {
	got, err := parseExtraction(`{"kind":"receipt","fields":{"amount":2340,"tax_amount":null,"merchant":null}}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if _, present := got.Fields["tax_amount"]; present {
		t.Error("null tax_amount survived into the fields map")
	}
	if _, present := got.Fields["amount"]; !present {
		t.Error("real value was dropped")
	}
}

// An unreadable total must be stated, not omitted — the model has to know to
// ask rather than propose a claim with no amount.
func TestDescribeNamesUnreadableFields(t *testing.T) {
	ex := &Extraction{Kind: KindReceipt, Fields: map[string]any{"merchant": "Meralco"}}
	got := ex.Describe("bill.jpg")

	if !strings.Contains(got, "Meralco") {
		t.Errorf("read field missing: %s", got)
	}
	if !strings.Contains(got, "amount: could not be read") {
		t.Errorf("unreadable field not flagged: %s", got)
	}
}

func TestDescribeWarnsOnLowConfidence(t *testing.T) {
	ex := &Extraction{Kind: KindReceipt, Confidence: 0.3, Fields: map[string]any{"amount": 2340}}
	if !strings.Contains(ex.Describe("blurry.jpg"), "low quality") {
		t.Error("low-confidence scan was not flagged for confirmation")
	}
}

func TestExtractRejectsUnusableAttachments(t *testing.T) {
	v := NewVLMExtractor("http://vllm:8000", "qwen3-vl", "", nil)

	if _, err := v.Extract(context.Background(), jpeg(""), KindReceipt); err == nil {
		t.Error("empty attachment should error")
	}

	pdf := Attachment{Filename: "scan.pdf", MediaType: "application/pdf", Data: []byte("%PDF")}
	_, err := v.Extract(context.Background(), pdf, KindReceipt)
	if err == nil || !strings.Contains(err.Error(), "only images") {
		t.Errorf("PDF should be rejected with a clear reason, got: %v", err)
	}

	big := Attachment{Filename: "huge.jpg", MediaType: "image/jpeg", Data: make([]byte, maxImageBytes+1)}
	_, err = v.Extract(context.Background(), big, KindReceipt)
	if err == nil || !strings.Contains(err.Error(), "limit") {
		t.Errorf("oversized image should be rejected, got: %v", err)
	}
}

func TestExtractSendsImageAndParsesResult(t *testing.T) {
	var captured map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &captured)
		io.WriteString(w, `{"choices":[{"message":{"role":"assistant",
			"content":"{\"kind\":\"receipt\",\"fields\":{\"merchant\":\"Meralco\",\"amount\":12400},\"confidence\":0.94}"}}]}`)
	}))
	defer srv.Close()

	got, err := NewVLMExtractor(srv.URL, "qwen3-vl", "", nil).
		Extract(context.Background(), jpeg("fake-jpeg-bytes"), KindReceipt)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}

	if got.Fields["merchant"] != "Meralco" || got.Fields["amount"] != float64(12400) {
		t.Errorf("fields = %+v", got.Fields)
	}

	// Extraction must be deterministic for the same reason tool calls are.
	if captured["temperature"] != float64(0) {
		t.Errorf("temperature = %v, want 0", captured["temperature"])
	}

	msgs := captured["messages"].([]any)
	content := msgs[0].(map[string]any)["content"].([]any)
	if len(content) != 2 {
		t.Fatalf("want a text part and an image part, got %d", len(content))
	}
	img := content[1].(map[string]any)
	url := img["image_url"].(map[string]any)["url"].(string)
	if !strings.HasPrefix(url, "data:image/jpeg;base64,") {
		t.Errorf("image not sent as a base64 data URI: %s", truncate(url, 60))
	}
}

func TestNopExtractorSaysScanningIsOff(t *testing.T) {
	_, err := NopExtractor{}.Extract(context.Background(), jpeg("x"), KindReceipt)
	if err == nil || !strings.Contains(err.Error(), "not enabled") {
		t.Errorf("got: %v", err)
	}
}

// stubExtractor lets the engine's attachment path be driven without a model.
type stubExtractor struct {
	ex  *Extraction
	err error
}

func (s stubExtractor) Extract(context.Context, Attachment, Kind) (*Extraction, error) {
	return s.ex, s.err
}

// A scan must reach the model as text in the user turn — the tool-calling
// adapter never sees pixels.
func TestEngineFoldsScanIntoPrompt(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{{Text: "Filing that."}}}
	e := newTestEngine(prov, nil)
	e.SetExtractor(stubExtractor{ex: &Extraction{
		Kind:   KindReceipt,
		Fields: map[string]any{"merchant": "Meralco", "amount": 12400},
	}})

	turn := basicTurn("file this")
	turn.Attachments = []Attachment{jpeg("bytes")}

	if _, err := e.Run(context.Background(), &recordingExecutor{}, turn); err != nil {
		t.Fatalf("Run: %v", err)
	}

	sent := prov.seen[0].Messages[len(prov.seen[0].Messages)-1].Text
	if !strings.Contains(sent, "Meralco") || !strings.Contains(sent, "12400") {
		t.Errorf("extraction not folded into the prompt: %q", sent)
	}
	if !strings.Contains(sent, "file this") {
		t.Errorf("original prompt lost: %q", sent)
	}
}

// A blurry photo must not cost the user their whole request.
func TestEngineSurvivesFailedScan(t *testing.T) {
	// Two turns: "file this receipt" is a write request naming no record, so the
	// turn now reads the candidates once before settling on its answer.
	prov := &scriptedProvider{turns: []Completion{
		{Text: "What was the total?"},
		{Text: "What was the total?"},
	}}
	e := newTestEngine(prov, nil)
	e.SetExtractor(stubExtractor{err: io.ErrUnexpectedEOF})

	turn := basicTurn("file this receipt")
	turn.Attachments = []Attachment{jpeg("bytes")}

	res, err := e.Run(context.Background(), &recordingExecutor{}, turn)
	if err != nil {
		t.Fatalf("a failed scan should not fail the turn: %v", err)
	}
	sent := prov.seen[0].Messages[len(prov.seen[0].Messages)-1].Text
	if !strings.Contains(sent, "could not be read") {
		t.Errorf("model was not told the scan failed: %q", sent)
	}
	if res.Text == "" {
		t.Error("no answer produced")
	}
}
