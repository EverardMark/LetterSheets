package api

import (
	"testing"

	"lettersheets/internal/models"
)

func roster() []models.Employee {
	return []models.Employee{
		{FirstName: "asd", MiddleName: "asd", LastName: "asd"},
		{FirstName: "Mark", MiddleName: "G", LastName: "Padama"},
		{FirstName: "Juan", LastName: "Dela Cruz"},
		{FirstName: "Andrew", LastName: "Sample"},
		{FirstName: "Mark", LastName: "Santos"},
	}
}

func TestMatchEmployeesByName(t *testing.T) {
	cases := []struct {
		query string
		want  []string
	}{
		{"asd asd", []string{"asd"}},
		{"mark padama", []string{"Mark"}},
		{"padama mark", []string{"Mark"}},     // order does not matter
		{"andres sample", []string{"Andrew"}}, // typo still reaches him
		{"juan dela cruz", []string{"Juan"}},
		{"dela", []string{"Juan"}},         // partial
		{"mark", []string{"Mark", "Mark"}}, // both Marks, nothing else
		{"nobody here", nil},
		{"", nil},
	}
	for _, c := range cases {
		got := MatchEmployeesByName(roster(), c.query)
		if len(got) != len(c.want) {
			t.Errorf("%q matched %d, want %d", c.query, len(got), len(c.want))
			continue
		}
		for i, e := range got {
			if e.FirstName != c.want[i] {
				t.Errorf("%q matched %q, want %q", c.query, e.FirstName, c.want[i])
			}
		}
	}
}

func TestSearchDoesNotMatchAcrossDifferentPeople(t *testing.T) {
	// "Mark Santos" must not be answered by "Mark Padama".
	got := MatchEmployeesByName(roster(), "mark santos")
	if len(got) != 1 || got[0].LastName != "Santos" {
		t.Errorf("got %d matches, want only Santos", len(got))
	}
}
