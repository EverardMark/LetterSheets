package mailer

import (
	"bufio"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"math/big"
	"net"
	"strings"
	"sync"
	"testing"
	"time"
)

// These tests run a real SMTP conversation against an in-process server, so the
// dial / EHLO / STARTTLS / AUTH / MAIL / RCPT / DATA sequence and the exact bytes
// written on the wire are exercised — not mocked. Without them the mailer's only
// proof would be that it compiles, and a message this code sends is the sort of
// thing you cannot un-send once it is wrong.

// fakeSMTP is a minimal server that records one transaction.
type fakeSMTP struct {
	ln net.Listener

	tlsConfig   *tls.Config // non-nil ⇒ advertise + honour STARTTLS
	offerAuth   bool
	failAt      string // command prefix to reject with 550, e.g. "RCPT"
	implicitTLS bool

	mu       sync.Mutex
	from     string
	rcpts    []string
	data     string
	authLine string
	usedTLS  bool
	done     chan struct{}
}

func newFakeSMTP(t *testing.T, f *fakeSMTP) *fakeSMTP {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	f.ln = ln
	f.done = make(chan struct{})
	go f.serve(t)
	t.Cleanup(func() { ln.Close() })
	return f
}

func (f *fakeSMTP) addr() (host string, port int) {
	a := f.ln.Addr().(*net.TCPAddr)
	return "127.0.0.1", a.Port
}

func (f *fakeSMTP) serve(t *testing.T) {
	conn, err := f.ln.Accept()
	if err != nil {
		return
	}
	defer conn.Close()
	defer close(f.done)

	if f.implicitTLS {
		tc := tls.Server(conn, f.tlsConfig)
		if err := tc.Handshake(); err != nil {
			return
		}
		conn = tc
		f.mu.Lock()
		f.usedTLS = true
		f.mu.Unlock()
	}

	br := bufio.NewReader(conn)
	write := func(s string) { conn.Write([]byte(s + "\r\n")) }
	write("220 fake ESMTP ready")

	inData := false
	var body strings.Builder

	for {
		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		line, err := br.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")

		if inData {
			if line == "." {
				inData = false
				f.mu.Lock()
				f.data = body.String()
				f.mu.Unlock()
				write("250 queued")
				continue
			}
			body.WriteString(line + "\r\n")
			continue
		}

		up := strings.ToUpper(line)
		if f.failAt != "" && strings.HasPrefix(up, f.failAt) {
			write("550 rejected by policy")
			continue
		}

		switch {
		case strings.HasPrefix(up, "EHLO"), strings.HasPrefix(up, "HELO"):
			ext := []string{"250-fake greets you"}
			if f.tlsConfig != nil && !f.implicitTLS {
				ext = append(ext, "250-STARTTLS")
			}
			if f.offerAuth {
				ext = append(ext, "250-AUTH PLAIN")
			}
			ext = append(ext, "250 SIZE 35882577")
			write(strings.Join(ext, "\r\n"))

		case strings.HasPrefix(up, "STARTTLS"):
			write("220 go ahead")
			tc := tls.Server(conn, f.tlsConfig)
			if err := tc.Handshake(); err != nil {
				return
			}
			conn = tc
			br = bufio.NewReader(conn)
			write = func(s string) { conn.Write([]byte(s + "\r\n")) }
			f.mu.Lock()
			f.usedTLS = true
			f.mu.Unlock()

		case strings.HasPrefix(up, "AUTH PLAIN"):
			f.mu.Lock()
			f.authLine = strings.TrimSpace(line[len("AUTH PLAIN"):])
			f.mu.Unlock()
			write("235 accepted")

		case strings.HasPrefix(up, "MAIL FROM:"):
			f.mu.Lock()
			f.from = extractAddr(line)
			f.mu.Unlock()
			write("250 ok")

		case strings.HasPrefix(up, "RCPT TO:"):
			f.mu.Lock()
			f.rcpts = append(f.rcpts, extractAddr(line))
			f.mu.Unlock()
			write("250 ok")

		case strings.HasPrefix(up, "DATA"):
			inData = true
			write("354 send it")

		case strings.HasPrefix(up, "QUIT"):
			write("221 bye")
			return

		default:
			write("250 ok")
		}
	}
}

func extractAddr(line string) string {
	i, j := strings.Index(line, "<"), strings.Index(line, ">")
	if i >= 0 && j > i {
		return line[i+1 : j]
	}
	return strings.TrimSpace(line[strings.Index(line, ":")+1:])
}

// selfSignedTLS builds a throwaway certificate so STARTTLS can be exercised.
func selfSignedTLS(t *testing.T) *tls.Config {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	tmpl := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "127.0.0.1"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("cert: %v", err)
	}
	return &tls.Config{Certificates: []tls.Certificate{{
		Certificate: [][]byte{der},
		PrivateKey:  key,
	}}}
}

func (f *fakeSMTP) snapshot() (from string, rcpts []string, data, auth string, usedTLS bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.from, append([]string(nil), f.rcpts...), f.data, f.authLine, f.usedTLS
}

// ---------------------------------------------------------------------------

func TestSendPlainTextMessage(t *testing.T) {
	srv := newFakeSMTP(t, &fakeSMTP{})
	host, port := srv.addr()

	m := New(Config{Host: host, Port: port, FromEmail: "erp@example.com", FromName: "LetterSheets ERP"})
	err := m.Send(Message{
		To: "maria@example.com", ToName: "Maria Santos",
		Subject: "Expense claim awaiting approval",
		Text:    "Line one.\nLine two.",
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	<-srv.done

	from, rcpts, data, _, _ := srv.snapshot()
	if from != "erp@example.com" {
		t.Errorf("MAIL FROM = %q, want erp@example.com", from)
	}
	if len(rcpts) != 1 || rcpts[0] != "maria@example.com" {
		t.Errorf("RCPT TO = %v, want [maria@example.com]", rcpts)
	}
	// Pure-ASCII display names are passed through verbatim: RFC 2047 encoding is
	// only for headers that actually need it, and encoding everything would make
	// ordinary messages unreadable in a raw mailbox.
	for _, want := range []string{
		"From: LetterSheets ERP <erp@example.com>",
		"To: Maria Santos <maria@example.com>",
		`Content-Type: text/plain; charset="utf-8"`,
		"Line one.\r\nLine two.",
	} {
		if !strings.Contains(data, want) {
			t.Errorf("message body missing %q\n--- got ---\n%s", want, data)
		}
	}
	// A bare LF anywhere in the payload would be a protocol violation.
	if strings.Contains(strings.ReplaceAll(data, "\r\n", ""), "\n") {
		t.Error("message contains a bare LF; every newline must be CRLF")
	}
}

func TestSendMultipartWhenHTMLPresent(t *testing.T) {
	srv := newFakeSMTP(t, &fakeSMTP{})
	host, port := srv.addr()

	m := New(Config{Host: host, Port: port, FromEmail: "erp@example.com"})
	if err := m.Send(Message{
		To: "a@example.com", Subject: "Hi", Text: "plain part", HTML: "<b>rich part</b>",
	}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	<-srv.done

	_, _, data, _, _ := srv.snapshot()
	for _, want := range []string{
		"Content-Type: multipart/alternative; boundary=",
		`Content-Type: text/plain; charset="utf-8"`,
		`Content-Type: text/html; charset="utf-8"`,
		"plain part", "<b>rich part</b>",
	} {
		if !strings.Contains(data, want) {
			t.Errorf("multipart message missing %q\n--- got ---\n%s", want, data)
		}
	}
	// The closing boundary must be present or clients truncate the message.
	if !strings.Contains(data, "----=_LetterSheets_Part_Boundary--") {
		t.Errorf("missing closing MIME boundary\n--- got ---\n%s", data)
	}
}

func TestSendAuthenticates(t *testing.T) {
	srv := newFakeSMTP(t, &fakeSMTP{offerAuth: true, tlsConfig: selfSignedTLS(t)})
	host, port := srv.addr()

	m := New(Config{
		Host: host, Port: port, FromEmail: "erp@example.com",
		Username: "smtpuser", Password: "s3cret", SkipVerify: true,
	})
	if err := m.Send(Message{To: "a@example.com", Subject: "s", Text: "t"}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	<-srv.done

	_, _, _, auth, usedTLS := srv.snapshot()
	if !usedTLS {
		t.Error("STARTTLS was advertised but the client did not upgrade")
	}
	raw, err := base64.StdEncoding.DecodeString(auth)
	if err != nil {
		t.Fatalf("AUTH PLAIN payload not base64: %q", auth)
	}
	// RFC 4616: \0username\0password
	if got, want := string(raw), "\x00smtpuser\x00s3cret"; got != want {
		t.Errorf("AUTH PLAIN payload = %q, want %q", got, want)
	}
}

func TestSendUpgradesToSTARTTLS(t *testing.T) {
	srv := newFakeSMTP(t, &fakeSMTP{tlsConfig: selfSignedTLS(t)})
	host, port := srv.addr()

	m := New(Config{Host: host, Port: port, FromEmail: "erp@example.com", SkipVerify: true})
	if err := m.Send(Message{To: "a@example.com", Subject: "s", Text: "t"}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	<-srv.done

	if _, _, _, _, usedTLS := srv.snapshot(); !usedTLS {
		t.Error("client did not upgrade to TLS despite STARTTLS being offered")
	}
}

func TestSendImplicitTLS(t *testing.T) {
	srv := newFakeSMTP(t, &fakeSMTP{tlsConfig: selfSignedTLS(t), implicitTLS: true})
	host, port := srv.addr()

	m := New(Config{Host: host, Port: port, FromEmail: "erp@example.com", ImplicitTLS: true, SkipVerify: true})
	if err := m.Send(Message{To: "a@example.com", Subject: "s", Text: "t"}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	<-srv.done

	if _, _, _, _, usedTLS := srv.snapshot(); !usedTLS {
		t.Error("implicit-TLS dial did not negotiate TLS")
	}
}

func TestSendCarbonCopies(t *testing.T) {
	srv := newFakeSMTP(t, &fakeSMTP{})
	host, port := srv.addr()

	m := New(Config{Host: host, Port: port, FromEmail: "erp@example.com"})
	if err := m.Send(Message{
		To: "a@example.com", CC: "b@example.com, c@example.com",
		Subject: "s", Text: "t",
	}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	<-srv.done

	_, rcpts, data, _, _ := srv.snapshot()
	if len(rcpts) != 3 {
		t.Errorf("RCPT TO issued %d times (%v), want 3 — cc recipients must be in the envelope", len(rcpts), rcpts)
	}
	if !strings.Contains(data, "Cc: b@example.com, c@example.com") {
		t.Errorf("Cc header missing\n--- got ---\n%s", data)
	}
}

func TestSendSurfacesServerRejection(t *testing.T) {
	srv := newFakeSMTP(t, &fakeSMTP{failAt: "RCPT"})
	host, port := srv.addr()

	m := New(Config{Host: host, Port: port, FromEmail: "erp@example.com"})
	err := m.Send(Message{To: "nope@example.com", Subject: "s", Text: "t"})
	if err == nil {
		t.Fatal("expected an error when the server rejects RCPT TO")
	}
	// The outbox stores this string for a human to read, so it has to say which
	// step failed and which address was refused.
	if !strings.Contains(err.Error(), "RCPT TO") || !strings.Contains(err.Error(), "nope@example.com") {
		t.Errorf("error %q should name the failing step and address", err)
	}
}

func TestSendRefusesWhenNotConfigured(t *testing.T) {
	if err := (&Mailer{}).Send(Message{To: "a@example.com"}); err == nil {
		t.Error("a zero-value Mailer must refuse to send")
	}
	m := New(Config{Host: "smtp.example.com", FromEmail: "erp@example.com"})
	if err := m.Send(Message{To: "   "}); err == nil {
		t.Error("a blank recipient must be refused before dialling")
	}
}

func TestEnabledRequiresHostAndFrom(t *testing.T) {
	cases := []struct {
		name string
		cfg  Config
		want bool
	}{
		{"empty", Config{}, false},
		{"host only", Config{Host: "smtp.example.com"}, false},
		{"from only", Config{FromEmail: "erp@example.com"}, false},
		{"both", Config{Host: "smtp.example.com", FromEmail: "erp@example.com"}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := New(c.cfg).Enabled(); got != c.want {
				t.Errorf("Enabled() = %v, want %v", got, c.want)
			}
		})
	}
	if (*Mailer)(nil).Enabled() {
		t.Error("a nil *Mailer must report disabled rather than panic")
	}
}

// TestSendEncodesNonASCIIHeaders is the other half of the rule above: a name or
// subject carrying non-ASCII MUST be RFC 2047 encoded, or the header is invalid
// and clients render mojibake.
func TestSendEncodesNonASCIIHeaders(t *testing.T) {
	srv := newFakeSMTP(t, &fakeSMTP{})
	host, port := srv.addr()

	m := New(Config{Host: host, Port: port, FromEmail: "erp@example.com", FromName: "LetterSheets ERP"})
	if err := m.Send(Message{
		To: "jose@example.com", ToName: "José Ramírez",
		Subject: "Reimbursement ₱3,080.00 approved",
		Text:    "ok",
	}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	<-srv.done

	_, _, data, _, _ := srv.snapshot()
	for _, frag := range []string{"=?utf-8?q?", "Jos", "Ram"} {
		if !strings.Contains(data, frag) {
			t.Errorf("expected an encoded-word header containing %q\n--- got ---\n%s", frag, data)
		}
	}
	// The raw multi-byte characters must not appear unencoded in the headers.
	head := data
	if i := strings.Index(data, "\r\n\r\n"); i > 0 {
		head = data[:i]
	}
	for _, raw := range []string{"José", "₱"} {
		if strings.Contains(head, raw) {
			t.Errorf("raw non-ASCII %q leaked into headers unencoded\n--- headers ---\n%s", raw, head)
		}
	}
}
