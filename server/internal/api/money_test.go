package api

import "testing"

func TestPurRound2(t *testing.T) {
	cases := []struct {
		in, want float64
	}{
		{0, 0},
		{1000, 1000},
		{1.239, 1.24},
		{1.231, 1.23},
		{10.0 / 3.0, 3.33},
		{2.0 / 3.0, 0.67},
		{99.994, 99.99},
		{99.996, 100.0},
	}
	for _, c := range cases {
		if got := purRound2(c.in); got != c.want {
			t.Errorf("purRound2(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestPurNet(t *testing.T) {
	cases := []struct {
		price, disc, want float64
	}{
		{100, 0, 100},     // no discount
		{100, 100, 0},     // fully discounted -> zero-value line
		{100, 10, 90},     // 10% off
		{150, 0, 150},     // plain
		{100, 12.5, 87.5}, // fractional discount
		{99.99, 0, 99.99},
	}
	for _, c := range cases {
		if got := purNet(c.price, c.disc); got != c.want {
			t.Errorf("purNet(%v, %v) = %v, want %v", c.price, c.disc, got, c.want)
		}
	}
}

func TestGLBalanced(t *testing.T) {
	tests := []struct {
		name     string
		lines    []purLine
		wantOK   bool
		wantKept int
	}{
		{"balanced 2-line", []purLine{{"A", 10, 0}, {"B", 0, 10}}, true, 2},
		{"balanced multi-line", []purLine{{"A", 10, 0}, {"B", 2, 0}, {"C", 0, 12}}, true, 3},
		{"zero lines dropped", []purLine{{"A", 10, 0}, {"B", 0, 10}, {"C", 0, 0}}, true, 2},
		{"within cent tolerance", []purLine{{"A", 10.00, 0}, {"B", 0, 10.004}}, true, 2},
		{"unbalanced", []purLine{{"A", 10, 0}, {"B", 0, 9}}, false, 0},
		{"outside cent tolerance", []purLine{{"A", 10, 0}, {"B", 0, 10.006}}, false, 0},
		{"unmapped account", []purLine{{"", 10, 0}, {"B", 0, 10}}, false, 0},
		{"single line", []purLine{{"A", 10, 0}}, false, 0},
		{"all zero", []purLine{{"A", 0, 0}, {"B", 0, 0}}, false, 0},
		{"empty", nil, false, 0},
		{"negative-only total", []purLine{{"A", 0, 10}, {"B", 0, 0}}, false, 0}, // sumDr <= 0
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			kept, ok := glBalanced(tt.lines)
			if ok != tt.wantOK {
				t.Fatalf("glBalanced ok = %v, want %v", ok, tt.wantOK)
			}
			if ok && len(kept) != tt.wantKept {
				t.Errorf("glBalanced kept = %d lines, want %d", len(kept), tt.wantKept)
			}
			if !ok && kept != nil {
				t.Errorf("glBalanced rejected but returned %d kept lines, want nil", len(kept))
			}
		})
	}
}

// TestPurBillLineInvariant checks the core 3-way-match GL invariant: for a set of
// billable lines, the sum of per-line net amounts (Dr GR/IR) plus per-line tax
// (Dr Input Tax) equals the Cr Accounts Payable total — i.e. the vendor-bill
// journal always balances, the way doGeneratePurBill builds it.
func TestPurBillLineInvariant(t *testing.T) {
	type line struct{ qty, price, disc, tax float64 }
	lines := []line{
		{10, 100, 0, 0},   // plain
		{3, 250, 10, 12},  // discount + VAT
		{7, 33.33, 0, 12}, // fractional with tax
		{5, 100, 100, 12}, // fully discounted (net 0)
	}
	var grNet, totalTax float64
	for _, l := range lines {
		net := purNet(l.price, l.disc)
		amt := purRound2(l.qty * net)
		grNet += amt
		totalTax += purRound2(amt * l.tax / 100)
	}
	crAP := purRound2(grNet + totalTax)
	// The journal is Dr GR/IR (grNet) + Dr Input Tax (totalTax) / Cr AP (crAP).
	jl := []purLine{{"grir", purRound2(grNet), 0}, {"tax", purRound2(totalTax), 0}, {"ap", 0, crAP}}
	if _, ok := glBalanced(jl); !ok {
		t.Fatalf("vendor-bill journal does not balance: grNet=%.2f tax=%.2f AP=%.2f", grNet, totalTax, crAP)
	}
}
