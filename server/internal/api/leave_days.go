package api

import (
	"fmt"
	"math"
	"time"
)

// leaveDateLayout is the wire format for leave dates (YYYY-MM-DD).
const leaveDateLayout = "2006-01-02"

// resolveLeaveDays reconciles a leave's `days` with its date range.
//
// WHY THIS IS SERVER-SIDE. `days` drives leave-credit balances
// (LeaveCreditRepo sums it) and the over-approval warning in the UI, but until
// now it was only ever calculated in the browser — leave.jsx recomputes it from
// the dates on every change, and the handler simply trusted the result,
// defaulting to 1 when it was absent.
//
// That was safe while the HR form was the only client. It stopped being safe
// when the assistant became a second one: it proposes a leave from a sentence,
// a user edits the end date on the confirmation card, and nothing recalculates
// `days` — producing a two-day leave recorded as one, and an employee's balance
// under-deducted by a day. Any direct API caller had the same hole.
//
// A rule that lives in one client is a rule every other client gets wrong, so
// it moves here.
//
// Half-days are preserved deliberately. `days` is a float and the form lets it
// be overridden, so 0.5 within a single-day range is legitimate and must not be
// rounded away. What is rejected is only what is arithmetically impossible:
// more days than the range contains, or a range that ends before it starts.
func resolveLeaveDays(startDate, endDate string, days float64) (float64, error) {
	start, err1 := time.Parse(leaveDateLayout, startDate)
	end, err2 := time.Parse(leaveDateLayout, endDate)
	if err1 != nil || err2 != nil {
		// Not parseable here. Leave validation to the database rather than
		// inventing a second, stricter date format check that could start
		// rejecting inputs the existing form has always sent.
		if days <= 0 {
			return 1, nil
		}
		return days, nil
	}

	// Inclusive: a leave that starts and ends on the same day is one day.
	span := math.Round(end.Sub(start).Hours()/24) + 1

	if span <= 0 {
		return 0, fmt.Errorf("end_date %s is before start_date %s", endDate, startDate)
	}

	// Absent or nonsensical: derive it. This is the case the assistant hits,
	// and the case where the old code silently wrote 1 for a week of leave.
	if days <= 0 {
		return span, nil
	}

	// More leave than the range can hold. Previously stored as given, quietly
	// over-deducting the employee's balance.
	if days > span {
		return 0, fmt.Errorf("days (%g) is more than the %g day(s) between %s and %s",
			days, span, startDate, endDate)
	}

	return days, nil
}
