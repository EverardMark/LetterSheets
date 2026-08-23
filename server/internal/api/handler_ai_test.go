package api

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

// The browser's FileReader produces a full data URI; asking the client to strip
// it is a step that gets forgotten, so both forms are accepted.
func TestDecodeAttachmentsAcceptsDataURIAndRawBase64(t *testing.T) {
	raw := base64.StdEncoding.EncodeToString([]byte("jpeg-bytes"))

	got, err := decodeAttachments([]aiAttachment{
		{Filename: "a.jpg", MediaType: "image/jpeg", Data: raw},
		{Filename: "b.png", Data: "data:image/png;base64," + raw},
	})
	if err != nil {
		t.Fatalf("decodeAttachments: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 attachments, got %d", len(got))
	}
	for i, a := range got {
		if string(a.Data) != "jpeg-bytes" {
			t.Errorf("attachment %d data = %q", i, a.Data)
		}
	}
	// The media type must be recovered from the URI when not sent separately,
	// or the extractor rejects it as a non-image.
	if got[1].MediaType != "image/png" {
		t.Errorf("media type from data URI = %q, want image/png", got[1].MediaType)
	}
}

func TestDecodeAttachmentsRejectsGarbage(t *testing.T) {
	_, err := decodeAttachments([]aiAttachment{{Filename: "bad.jpg", Data: "!!!not base64!!!"}})
	if err == nil || !strings.Contains(err.Error(), "bad.jpg") {
		t.Errorf("error should name the offending file, got: %v", err)
	}
}

// Each attachment is a separate vision-model call on the request path, so the
// count is bounded rather than trusted.
func TestDecodeAttachmentsIsBounded(t *testing.T) {
	many := make([]aiAttachment, 9)
	for i := range many {
		many[i] = aiAttachment{Filename: "x.jpg", Data: base64.StdEncoding.EncodeToString([]byte("x"))}
	}
	if _, err := decodeAttachments(many); err == nil {
		t.Error("expected a limit on attachment count")
	}
}

func TestDecodeAttachmentsHandlesNone(t *testing.T) {
	got, err := decodeAttachments(nil)
	if err != nil || got != nil {
		t.Errorf("got %v, %v", got, err)
	}
}

// captureWriter stands in for an http.ResponseWriter when the executor
// re-enters the dispatch path. Its default status must be a success, or every
// tool call would read as failed.
func TestCaptureWriterDefaults(t *testing.T) {
	c := &captureWriter{status: 200}
	c.Header().Set("Content-Type", "application/json")
	if _, err := c.Write([]byte(`{"ok":true}`)); err != nil {
		t.Fatalf("write: %v", err)
	}
	if c.body.String() != `{"ok":true}` {
		t.Errorf("body = %q", c.body.String())
	}
	c.WriteHeader(403)
	if c.status != 403 {
		t.Errorf("status = %d", c.status)
	}
	if c.Header().Get("Content-Type") != "application/json" {
		t.Error("header not retained")
	}
}

// Encrypted PII is unreadable to the model and expensive to send. On a 10-person
// roster it was most of a 7KB payload, and base64 is costly per character.
func TestStripForModelRemovesCiphertextAndNoise(t *testing.T) {
	in := map[string]any{
		"employees": []any{
			map[string]any{
				"id": "e-1", "first_name": "Ana", "last_name": "Cruz",
				"department": "Finance", "status": "Active",
				"email_enc": "gAAAAAB...", "basic_salary_enc": "gAAAAAB...",
				"bank_account_enc": "gAAAAAB...", "tin_enc": "gAAAAAB...",
				"company_id": "c-1", "created_at": "2026-01-01", "is_deleted": false,
			},
		},
	}

	out := stripForModel(in)
	blob, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(blob)

	for _, gone := range []string{"_enc", "gAAAAAB", "company_id", "created_at", "is_deleted"} {
		if strings.Contains(got, gone) {
			t.Errorf("%q survived the strip: %s", gone, got)
		}
	}
	// Everything the model actually reasons about must remain.
	for _, kept := range []string{"e-1", "Ana", "Cruz", "Finance", "Active"} {
		if !strings.Contains(got, kept) {
			t.Errorf("%q was stripped but is needed: %s", kept, got)
		}
	}
}

func TestStripForModelLeavesScalarsAlone(t *testing.T) {
	if got := stripForModel("plain"); got != "plain" {
		t.Errorf("got %v", got)
	}
	if got := stripForModel(float64(3)); got != float64(3) {
		t.Errorf("got %v", got)
	}
}
