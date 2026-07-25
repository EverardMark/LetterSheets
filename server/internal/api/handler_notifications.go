package api

import (
	"context"
	"html"
	"log"
	"net/http"
	"strings"
	"time"

	"lettersheets/internal/mailer"
	"lettersheets/internal/models"
)

// In-app notifications and the email outbox (migration 021).
//
// Two rules shape everything here:
//
//  1. Notifying must never break the thing that triggered it. Every helper below
//     swallows its errors into a log line — an approval does not roll back
//     because the inbox insert failed.
//  2. Nothing sends on the request path. Senders queue; the worker delivers.

// ==================== IN-APP INBOX ====================

func (h *Handler) getNotifications(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		UnreadOnly bool `json:"unread_only"`
		Limit      int  `json:"limit"`
	}
	_ = Decode(r, &req)
	items, err := h.notifRepo.List(r.Context(), session.CompanyID, session.UserID, req.UnreadOnly, req.Limit)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []models.Notification{}
	}
	unread, _ := h.notifRepo.UnreadCount(r.Context(), session.CompanyID, session.UserID)
	JSON(w, http.StatusOK, map[string]interface{}{"notifications": items, "unread": unread})
}

// getNotificationCount is what the bell polls; kept as its own action so the
// common case is one integer rather than a page of rows.
func (h *Handler) getNotificationCount(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	n, err := h.notifRepo.UnreadCount(r.Context(), session.CompanyID, session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]int{"unread": n})
}

func (h *Handler) markNotificationRead(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID   string `json:"id"`
		Read *bool  `json:"read"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	read := true
	if req.Read != nil {
		read = *req.Read
	}
	if err := h.notifRepo.MarkRead(r.Context(), session.CompanyID, session.UserID, req.ID, read); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"read": read})
}

func (h *Handler) markAllNotificationsRead(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	n, err := h.notifRepo.MarkAllRead(r.Context(), session.CompanyID, session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]int64{"marked": n})
}

func (h *Handler) deleteNotification(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.notifRepo.Delete(r.Context(), session.CompanyID, session.UserID, req.ID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// ==================== EMAIL OUTBOX ====================

func (h *Handler) getEmailOutbox(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status string `json:"status"`
		Limit  int    `json:"limit"`
	}
	_ = Decode(r, &req)
	items, err := h.notifRepo.ListOutbox(r.Context(), session.CompanyID, req.Status, req.Limit)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []models.OutboxEmail{}
	}
	counts, _ := h.notifRepo.OutboxCounts(r.Context(), session.CompanyID)
	JSON(w, http.StatusOK, map[string]interface{}{"emails": items, "counts": counts})
}

// getEmailStatus tells the UI whether outbound mail is actually switched on, so
// it can say "queued, but sending is disabled" instead of implying delivery.
func (h *Handler) getEmailStatus(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	counts, _ := h.notifRepo.OutboxCounts(r.Context(), session.CompanyID)
	JSON(w, http.StatusOK, map[string]interface{}{
		"enabled": h.cfg.SMTP.Ready(),
		"host":    h.cfg.SMTP.Host,
		"from":    h.cfg.SMTP.FromEmail,
		"counts":  counts,
	})
}

func (h *Handler) retryEmail(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.notifRepo.Requeue(r.Context(), session.CompanyID, req.ID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"requeued": true})
}

func (h *Handler) cancelEmail(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.notifRepo.Cancel(r.Context(), session.CompanyID, req.ID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"cancelled": true})
}

// sendTestEmail queues a message to the caller's own address so an operator can
// verify SMTP settings. It deliberately cannot target an arbitrary recipient —
// a "send a test to anyone" endpoint is a spam relay with extra steps.
func (h *Handler) sendTestEmail(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Email == "" {
		Error(w, http.StatusBadRequest, "your account has no email address")
		return
	}
	if !h.cfg.SMTP.Ready() {
		Error(w, http.StatusBadRequest, "outbound email is disabled — set smtp.enabled, smtp.host and smtp.from_email in the server config")
		return
	}
	id, err := h.notifRepo.Queue(r.Context(), &models.OutboxEmail{
		CompanyID: session.CompanyID,
		ToEmail:   session.Email,
		ToName:    session.Username,
		Subject:   "LetterSheets test email",
		BodyText: "This is a test message from your LetterSheets ERP server.\n\n" +
			"If you are reading it, outbound email is configured correctly.\n\n" +
			"Sent at " + time.Now().Format("2 Jan 2006 15:04:05 MST"),
		EntityType: "test",
		CreatedBy:  session.UserID,
	})
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"queued": id, "to": session.Email})
}

// ==================== SENDING HELPERS (used by other modules) ====================

// notifyUser raises one in-app notification, logging rather than failing.
func (h *Handler) notifyUser(ctx context.Context, companyID, userID string, n models.Notification) {
	if userID == "" {
		return
	}
	n.CompanyID, n.UserID = companyID, userID
	if _, err := h.notifRepo.Notify(ctx, &n); err != nil {
		log.Printf("notify %s: %v", userID, err)
	}
}

// notifyPermissionHolders raises a notification for everyone in the company who
// holds (module, fn) — the answer to "tell whoever can act on this", without any
// module needing to know who those people are.
func (h *Handler) notifyPermissionHolders(ctx context.Context, companyID, module, fn string, n models.Notification) []string {
	ids, err := h.notifRepo.UsersWithPermission(ctx, companyID, module, fn)
	if err != nil {
		log.Printf("notify %s/%s: %v", module, fn, err)
		return nil
	}
	n.CompanyID = companyID
	h.notifRepo.NotifyMany(ctx, ids, n)
	return ids
}

// queueEmail puts one message in the outbox. A blank address is not an error —
// most employees have no login account and so no server-readable address (their
// employees.email_enc is end-to-end encrypted), and the in-app notification is
// the real channel for them.
func (h *Handler) queueEmail(ctx context.Context, companyID, to, toName, subject, body string, entityType, entityID, createdBy string) {
	if strings.TrimSpace(to) == "" {
		return
	}
	if _, err := h.notifRepo.Queue(ctx, &models.OutboxEmail{
		CompanyID: companyID, ToEmail: to, ToName: toName, Subject: subject,
		BodyText: body, BodyHTML: simpleHTMLBody(subject, body),
		EntityType: entityType, EntityID: entityID, CreatedBy: createdBy,
	}); err != nil {
		log.Printf("queue email to %s: %v", to, err)
	}
}

// simpleHTMLBody wraps a plain-text body in minimal, inline-styled HTML. Escaped
// first: bodies interpolate names, memos and reasons typed by users, and none of
// that may become markup in a recipient's mail client.
func simpleHTMLBody(title, text string) string {
	esc := html.EscapeString(text)
	esc = strings.ReplaceAll(esc, "\n", "<br>")
	return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#222;line-height:1.6">` +
		`<h2 style="font-size:16px;margin:0 0 12px">` + html.EscapeString(title) + `</h2>` +
		`<div>` + esc + `</div>` +
		`<hr style="border:none;border-top:1px solid #eee;margin:20px 0">` +
		`<div style="font-size:12px;color:#888">Sent by LetterSheets ERP. Please do not reply to this message.</div></div>`
}

// ==================== BACKGROUND WORKER ====================

// StartEmailWorker drains the outbox forever on an interval. Launch it once, in
// a goroutine, at server start — and only when SMTP is configured and enabled
// (main.go checks cfg.SMTP.Ready()).
func (h *Handler) StartEmailWorker() {
	interval := time.Duration(h.cfg.SMTP.WorkerSeconds) * time.Second
	if interval < 5*time.Second {
		interval = 5 * time.Second
	}
	pass := func() {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("email worker recovered from panic: %v", rec)
			}
		}()
		h.RunEmailSweep(context.Background())
	}
	pass()

	// Housekeeping runs on its own daily ticker rather than a modulo of the
	// sweep counter, so changing worker_seconds cannot accidentally turn the
	// purge into an every-pass table scan.
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	purge := time.NewTicker(24 * time.Hour)
	defer purge.Stop()
	for {
		select {
		case <-ticker.C:
			pass()
		case <-purge.C:
			// Drop read notifications older than 90 days so the inbox table
			// does not grow without bound.
			if n, err := h.notifRepo.PurgeRead(context.Background(), 90); err == nil && n > 0 {
				log.Printf("notifications: purged %d read rows older than 90 days", n)
			}
		}
	}
}

// RunEmailSweep attempts one batch of due messages. Returns how many were sent.
func (h *Handler) RunEmailSweep(ctx context.Context) int {
	if !h.cfg.SMTP.Ready() || !h.mail.Enabled() {
		return 0
	}
	batch, err := h.notifRepo.ClaimDue(ctx, h.cfg.SMTP.BatchSize)
	if err != nil {
		log.Printf("email sweep: %v", err)
		return 0
	}
	sent := 0
	for _, e := range batch {
		err := h.mail.Send(mailer.Message{
			To: e.ToEmail, ToName: e.ToName, CC: e.CCEmail,
			Subject: e.Subject, Text: e.BodyText, HTML: e.BodyHTML,
		})
		if err != nil {
			log.Printf("email %s to %s failed (attempt %d): %v", e.ID, e.ToEmail, e.Attempts+1, err)
			if mErr := h.notifRepo.MarkAttemptFailed(ctx, e.ID, e.Attempts, err.Error()); mErr != nil {
				log.Printf("email %s: could not record failure: %v", e.ID, mErr)
			}
			continue
		}
		if err := h.notifRepo.MarkSent(ctx, e.ID); err != nil {
			log.Printf("email %s: sent but not recorded: %v", e.ID, err)
		}
		sent++
	}
	if sent > 0 {
		log.Printf("email worker: sent %d message(s)", sent)
	}
	return sent
}
