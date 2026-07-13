package repository

import (
	"testing"
	"time"
)

func d(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestFirstOfNextMonth(t *testing.T) {
	cases := map[string]string{
		"2026-01-15": "2026-02-01",
		"2026-01-01": "2026-02-01",
		"2026-12-15": "2027-01-01", // year rollover
		"2026-02-28": "2026-03-01",
	}
	for in, want := range cases {
		if got := firstOfNextMonth(d(in)); !got.Equal(d(want)) {
			t.Errorf("firstOfNextMonth(%s) = %s, want %s", in, got.Format("2006-01-02"), want)
		}
	}
}

func TestAccrualDates(t *testing.T) {
	ptr := func(s string) *time.Time { x := d(s); return &x }

	tests := []struct {
		name        string
		start       string
		today       string
		accrualType string
		last        *time.Time
		want        []string
	}{
		{
			name: "monthly first run (Juan joined Jan 1, today Jul 13)",
			start: "2026-01-01", today: "2026-07-13", accrualType: "monthly", last: nil,
			want: []string{"2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"},
		},
		{
			name: "monthly idempotent — already posted through Jul 1",
			start: "2026-01-01", today: "2026-07-13", accrualType: "monthly", last: ptr("2026-07-01"),
			want: nil,
		},
		{
			name: "monthly catch-up from May",
			start: "2026-01-01", today: "2026-07-13", accrualType: "monthly", last: ptr("2026-05-01"),
			want: []string{"2026-06-01", "2026-07-01"},
		},
		{
			name: "monthly mid-month join accrues from next month",
			start: "2026-01-20", today: "2026-03-05", accrualType: "monthly", last: nil,
			want: []string{"2026-02-01", "2026-03-01"},
		},
		{
			name: "yearly grants at start + each anniversary",
			start: "2024-03-01", today: "2026-07-13", accrualType: "yearly", last: nil,
			want: []string{"2024-03-01", "2025-03-01", "2026-03-01"},
		},
		{
			name: "yearly idempotent — already posted this year",
			start: "2024-03-01", today: "2026-07-13", accrualType: "yearly", last: ptr("2026-03-01"),
			want: nil,
		},
		{
			name: "brand-new monthly account, no full month yet",
			start: "2026-07-05", today: "2026-07-13", accrualType: "monthly", last: nil,
			want: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := accrualDates(d(tc.start), d(tc.today), tc.accrualType, tc.last)
			if len(got) != len(tc.want) {
				t.Fatalf("got %d dates %v, want %d %v", len(got), fmtDates(got), len(tc.want), tc.want)
			}
			for i := range got {
				if got[i].Format("2006-01-02") != tc.want[i] {
					t.Errorf("date[%d] = %s, want %s", i, got[i].Format("2006-01-02"), tc.want[i])
				}
			}
		})
	}
}

// Sanity on the resulting accrued days for the headline case: 6 monthly accruals
// of 15/12 = 1.25 each = 7.5 days by Jul 13 for someone who joined Jan 1.
func TestMonthlyAccruedTotal(t *testing.T) {
	dates := accrualDates(d("2026-01-01"), d("2026-07-13"), "monthly", nil)
	rate := 15.0 / 12
	total := round2(float64(len(dates)) * round2(rate))
	if total != 7.5 {
		t.Errorf("accrued total = %v, want 7.5 (got %d accrual dates)", total, len(dates))
	}
}

func fmtDates(ts []time.Time) []string {
	out := make([]string, len(ts))
	for i, t := range ts {
		out[i] = t.Format("2006-01-02")
	}
	return out
}
