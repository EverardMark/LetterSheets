package api

import (
	"net/http"
	"strings"

	"lettersheets/internal/ai"
	"lettersheets/internal/models"
)

// findEmployees resolves a NAME to employee records.
//
// Without this the only routes into an employee are get_employees, which takes
// no arguments and returns the whole company, and get_employee, which needs a
// UUID nobody types. A model asked for "asd asd details" therefore had to pull
// the entire roster and pick a row out of it by eye — and an 8B model judging
// whether "asd asd" is a person's name gets that wrong constantly, leaving the
// user told to "clarify" a name they spelled correctly.
//
// Searching server-side removes the judgement call: the name goes in, the
// matching records come back.
func (h *Handler) findEmployees(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Name string `json:"name"`
	}
	if err := Decode(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}

	all, err := h.employeeRepo.GetByCompany(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to search employees: "+err.Error())
		return
	}

	matches := MatchEmployeesByName(all, req.Name)
	if matches == nil {
		matches = []models.Employee{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"employees": matches})
}

// MatchEmployeesByName keeps employees whose name accounts for EVERY term of
// the query.
//
// Requiring all terms is what stops "Mark Padama" answering a search for "Mark
// Santos". Terms are matched against the name parts individually rather than
// the joined string so word order does not matter — "padama mark" finds the
// same person as "mark padama" — and each term tolerates a typo, so "andres"
// still reaches Andrew.
func MatchEmployeesByName(all []models.Employee, query string) []models.Employee {
	terms := strings.Fields(strings.ToLower(strings.TrimSpace(query)))
	if len(terms) == 0 {
		return nil
	}

	var out []models.Employee
	for _, e := range all {
		parts := strings.ToLower(strings.Join(
			strings.Fields(e.FirstName+" "+e.MiddleName+" "+e.LastName), " "))
		if parts == "" {
			continue
		}
		all := true
		for _, term := range terms {
			if !ai.MatchesName(parts, term) {
				all = false
				break
			}
		}
		if all {
			out = append(out, e)
		}
	}
	return out
}
