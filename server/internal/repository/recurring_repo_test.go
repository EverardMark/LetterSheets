package repository

import (
	"testing"
	"time"
)

func pd(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

// TestNextOccurrence covers the schedule math that drives recurring generation:
// weekly stepping, monthly with day-of-month clamping (the 31st anchor), and
// quarterly/yearly. index 0 is always the start date itself.
func TestNextOccurrence(t *testing.T) {
	cases := []struct {
		name     string
		start    string
		freq     string
		interval int
		index    int
		want     string
	}{
		{"monthly index0 is start", "2026-01-15", "Monthly", 1, 0, "2026-01-15"},
		{"monthly next", "2026-01-15", "Monthly", 1, 1, "2026-02-15"},
		{"monthly clamps 31->Feb", "2026-01-31", "Monthly", 1, 1, "2026-02-28"},
		{"monthly 31 anchor restored in Mar", "2026-01-31", "Monthly", 1, 2, "2026-03-31"},
		{"monthly leap Feb", "2024-01-31", "Monthly", 1, 1, "2024-02-29"},
		{"every 2 months", "2026-01-10", "Monthly", 2, 3, "2026-07-10"},
		{"weekly", "2026-01-01", "Weekly", 1, 3, "2026-01-22"},
		{"every 2 weeks", "2026-01-01", "Weekly", 2, 2, "2026-01-29"},
		{"quarterly", "2026-01-31", "Quarterly", 1, 1, "2026-04-30"},
		{"yearly leap-day clamp", "2024-02-29", "Yearly", 1, 1, "2025-02-28"},
		{"yearly", "2026-03-15", "Yearly", 1, 2, "2028-03-15"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := NextOccurrence(pd(c.start), c.freq, c.interval, c.index).Format("2006-01-02")
			if got != c.want {
				t.Errorf("NextOccurrence(%s, %s, every %d, #%d) = %s, want %s",
					c.start, c.freq, c.interval, c.index, got, c.want)
			}
		})
	}
}
