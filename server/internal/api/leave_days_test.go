package api

import (
	"strings"
	"testing"
)

func TestResolveLeaveDays(t *testing.T) {
	cases := []struct {
		name       string
		start, end string
		days       float64
		want       float64
		wantErr    string
	}{
		{
			// The bug this was written for: the assistant proposes a leave, the
			// user edits the end date on the confirmation card, and nothing
			// recalculates days. Previously stored as 1.
			name: "derives from the range when days is absent",
			start: "2026-08-25", end: "2026-08-26", days: 0, want: 2,
		},
		{
			// The old code wrote 1 here — a week of leave deducting a single day.
			name: "a week derives as seven, not one",
			start: "2026-08-24", end: "2026-08-30", days: 0, want: 7,
		},
		{
			name: "a single day is one day, not zero",
			start: "2026-08-22", end: "2026-08-22", days: 0, want: 1,
		},
		{
			// Half-days are legitimate and the form allows them, so they must
			// survive untouched.
			name: "keeps a half day",
			start: "2026-08-22", end: "2026-08-22", days: 0.5, want: 0.5,
		},
		{
			name: "keeps a deliberate under-count within the range",
			start: "2026-08-24", end: "2026-08-28", days: 3, want: 3,
		},
		{
			name: "accepts days equal to the span",
			start: "2026-08-24", end: "2026-08-28", days: 5, want: 5,
		},
		{
			// Previously stored as given, over-deducting the balance.
			name: "rejects more days than the range holds",
			start: "2026-08-24", end: "2026-08-25", days: 5, wantErr: "more than",
		},
		{
			// The form floors at 0.5, so it currently stores a leave that ends
			// before it starts. That is not a leave.
			name: "rejects a range that ends before it starts",
			start: "2026-08-26", end: "2026-08-25", days: 0.5, wantErr: "before",
		},
		{
			// Unparseable dates keep the old behaviour rather than introducing a
			// second, stricter format check that could reject what the existing
			// form has always sent.
			name: "falls back when dates are unparseable",
			start: "not-a-date", end: "also-not", days: 0, want: 1,
		},
		{
			name: "keeps a supplied value when dates are unparseable",
			start: "", end: "", days: 3, want: 3,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := resolveLeaveDays(c.start, c.end, c.days)
			if c.wantErr != "" {
				if err == nil {
					t.Fatalf("expected an error containing %q, got days=%v", c.wantErr, got)
				}
				if !strings.Contains(err.Error(), c.wantErr) {
					t.Errorf("error = %v, want it to mention %q", err, c.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != c.want {
				t.Errorf("days = %v, want %v", got, c.want)
			}
		})
	}
}

// Parity with leave.jsx's daysBetween, which is the behaviour every existing
// row in the database was written with. A server-side rule that disagreed with
// the form would start rejecting or silently altering ordinary submissions.
func TestResolveLeaveDaysMatchesTheFormForNormalRanges(t *testing.T) {
	cases := []struct {
		start, end string
		want       float64
	}{
		{"2026-08-22", "2026-08-22", 1},
		{"2026-08-22", "2026-08-23", 2},
		{"2026-08-01", "2026-08-31", 31},
		// Spans a DST-less month boundary; the ERP is Philippines-based but the
		// arithmetic should not care either way.
		{"2026-02-27", "2026-03-02", 4},
	}
	for _, c := range cases {
		got, err := resolveLeaveDays(c.start, c.end, 0)
		if err != nil {
			t.Fatalf("%s..%s: %v", c.start, c.end, err)
		}
		if got != c.want {
			t.Errorf("%s..%s = %v, want %v", c.start, c.end, got, c.want)
		}
	}
}
