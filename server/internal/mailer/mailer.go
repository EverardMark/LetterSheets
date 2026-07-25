// Package mailer is the SMTP leg of the notification system: a thin, dependency-
// free sender that the outbox worker calls once per queued message.
//
// It deliberately knows nothing about the queue, retries or business events —
// those live in the repository and handler layers. This package's only job is to
// turn (recipient, subject, body) into a delivered message or a useful error.
//
// SILENT BY DEFAULT: a zero Config reports Enabled() == false and Send() refuses
// rather than dialling anything. Outbound mail only starts flowing once an
// operator fills in the smtp block in config.json (or the LS_SMTP_* env vars).
package mailer

import (
	"crypto/tls"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

type Config struct {
	Host      string
	Port      int
	Username  string
	Password  string
	FromEmail string
	FromName  string
	// ImplicitTLS dials straight into TLS (SMTPS, conventionally port 465)
	// instead of connecting in the clear and upgrading with STARTTLS.
	ImplicitTLS bool
	// SkipVerify disables certificate verification. For a self-hosted relay with
	// a self-signed cert only — it removes the guarantee that you are talking to
	// the server you think you are.
	SkipVerify bool
	Timeout    time.Duration
}

type Mailer struct {
	cfg Config
}

func New(cfg Config) *Mailer {
	if cfg.Timeout == 0 {
		cfg.Timeout = 20 * time.Second
	}
	if cfg.Port == 0 {
		cfg.Port = 587
	}
	return &Mailer{cfg: cfg}
}

// Enabled reports whether enough is configured to attempt a send. The outbox
// worker checks this before starting; when false, queued mail simply waits.
func (m *Mailer) Enabled() bool {
	return m != nil && m.cfg.Host != "" && m.cfg.FromEmail != ""
}

// From returns the configured envelope sender, for display in settings.
func (m *Mailer) From() string {
	if m == nil {
		return ""
	}
	return m.cfg.FromEmail
}

// Message is one outbound email. HTML is optional; Text is not, because a
// text/plain part is what makes the message readable in clients (and to spam
// filters) that will not render HTML.
type Message struct {
	To      string
	ToName  string
	CC      string
	Subject string
	Text    string
	HTML    string
}

// Send delivers one message synchronously. Callers are expected to be the outbox
// worker — never a request handler, so that a slow or dead SMTP host cannot
// stall a user's approve/submit click.
func (m *Mailer) Send(msg Message) error {
	if !m.Enabled() {
		return fmt.Errorf("smtp is not configured")
	}
	if strings.TrimSpace(msg.To) == "" {
		return fmt.Errorf("no recipient")
	}

	addr := net.JoinHostPort(m.cfg.Host, fmt.Sprint(m.cfg.Port))
	tlsCfg := &tls.Config{ServerName: m.cfg.Host, InsecureSkipVerify: m.cfg.SkipVerify}

	var conn net.Conn
	var err error
	dialer := &net.Dialer{Timeout: m.cfg.Timeout}
	if m.cfg.ImplicitTLS {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, tlsCfg)
	} else {
		conn, err = dialer.Dial("tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("connect %s: %w", addr, err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(m.cfg.Timeout))

	c, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp handshake: %w", err)
	}
	defer c.Close()

	if !m.cfg.ImplicitTLS {
		// Upgrade when the server advertises it. A relay that offers no STARTTLS
		// is used in the clear rather than failing the send — that is the
		// operator's choice to make in their own network, and refusing would
		// silently strand mail on internal relays.
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(tlsCfg); err != nil {
				return fmt.Errorf("starttls: %w", err)
			}
		}
	}

	if m.cfg.Username != "" {
		auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err := c.Mail(m.cfg.FromEmail); err != nil {
		return fmt.Errorf("MAIL FROM: %w", err)
	}
	recipients := []string{msg.To}
	if cc := strings.TrimSpace(msg.CC); cc != "" {
		recipients = append(recipients, strings.Split(cc, ",")...)
	}
	for _, rcpt := range recipients {
		rcpt = strings.TrimSpace(rcpt)
		if rcpt == "" {
			continue
		}
		if err := c.Rcpt(rcpt); err != nil {
			return fmt.Errorf("RCPT TO %s: %w", rcpt, err)
		}
	}

	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("DATA: %w", err)
	}
	if _, err := w.Write([]byte(m.build(msg))); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close body: %w", err)
	}
	return c.Quit()
}

// build renders RFC 5322 headers plus the body. With HTML present the message is
// multipart/alternative so clients pick the part they can render; otherwise it is
// a plain text/plain message.
func (m *Mailer) build(msg Message) string {
	var b strings.Builder
	b.WriteString("From: " + formatAddress(m.cfg.FromName, m.cfg.FromEmail) + "\r\n")
	b.WriteString("To: " + formatAddress(msg.ToName, msg.To) + "\r\n")
	if cc := strings.TrimSpace(msg.CC); cc != "" {
		b.WriteString("Cc: " + cc + "\r\n")
	}
	b.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", msg.Subject) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")

	if strings.TrimSpace(msg.HTML) == "" {
		b.WriteString("Content-Type: text/plain; charset=\"utf-8\"\r\n\r\n")
		b.WriteString(normalizeNewlines(msg.Text))
		return b.String()
	}

	// A fixed boundary is fine: it is scoped to this one message, and the parts
	// are generated text that cannot contain it.
	const boundary = "----=_LetterSheets_Part_Boundary"
	b.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n\r\n")
	b.WriteString("--" + boundary + "\r\n")
	b.WriteString("Content-Type: text/plain; charset=\"utf-8\"\r\n\r\n")
	b.WriteString(normalizeNewlines(msg.Text) + "\r\n")
	b.WriteString("--" + boundary + "\r\n")
	b.WriteString("Content-Type: text/html; charset=\"utf-8\"\r\n\r\n")
	b.WriteString(normalizeNewlines(msg.HTML) + "\r\n")
	b.WriteString("--" + boundary + "--\r\n")
	return b.String()
}

func formatAddress(name, email string) string {
	if strings.TrimSpace(name) == "" {
		return email
	}
	return mime.QEncoding.Encode("utf-8", name) + " <" + email + ">"
}

// normalizeNewlines converts bare LF to CRLF as SMTP requires, without doubling
// the CR of any line that already ends correctly.
func normalizeNewlines(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	return strings.ReplaceAll(s, "\n", "\r\n")
}
