-- ============================================================================
-- Migration 007: GitHub-Issues-style features for the ticketing module
--
--   * Labels        — many-to-many colored labels per ticket (tk_labels +
--                     tk_ticket_labels), separate from the single category.
--   * Timeline      — auto-logged activity events (tk_events): opened, status
--                     changed, assigned, priority changed, labeled/unlabeled.
--   * Reactions     — emoji reactions on comments (tk_comment_reactions).
--   * Comment edit  — sp_update_ticket_comment (author-only, tenant-scoped).
--
-- Every new procedure is company-scoped (IDOR-safe) via a join/guard against
-- tk_tickets / tk_labels, matching migrations 003 & 006. sp_get_tickets and
-- sp_get_ticket are redefined to embed the ticket's labels as a JSON array.
-- Apply BEFORE/with the matching server build (needs a privileged MySQL user —
-- CREATE TABLE / ALTER ROUTINE):
--   mysql -u root -p lettersheets < server/migrations/007_ticketing_github_features.sql
-- ============================================================================


-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS `tk_labels` (
  `id`          char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`  char(36)     NOT NULL,
  `name`        varchar(50)  NOT NULL,
  `color`       varchar(7)   DEFAULT '#6366f1',
  `description` varchar(255) DEFAULT NULL,
  `is_deleted`  tinyint(1)   DEFAULT '0',
  `created_at`  timestamp    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tklabel` (`company_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tk_ticket_labels` (
  `ticket_id` char(36) NOT NULL,
  `label_id`  char(36) NOT NULL,
  PRIMARY KEY (`ticket_id`,`label_id`),
  KEY `idx_ttl_label` (`label_id`),
  CONSTRAINT `tk_ticket_labels_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `tk_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tk_ticket_labels_ibfk_2` FOREIGN KEY (`label_id`)  REFERENCES `tk_labels`  (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tk_events` (
  `id`         char(36)    NOT NULL DEFAULT (uuid()),
  `ticket_id`  char(36)    NOT NULL,
  `actor_id`   char(36)    DEFAULT NULL,
  `event_type` varchar(30) NOT NULL,
  `old_value`  varchar(255) DEFAULT NULL,
  `new_value`  varchar(255) DEFAULT NULL,
  `created_at` timestamp   NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tkevt` (`ticket_id`,`created_at`),
  CONSTRAINT `tk_events_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `tk_tickets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tk_comment_reactions` (
  `comment_id` char(36)    NOT NULL,
  `user_id`    char(36)    NOT NULL,
  `emoji`      varchar(16) NOT NULL,
  `created_at` timestamp   NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`,`user_id`,`emoji`),
  KEY `idx_tkreact` (`comment_id`),
  CONSTRAINT `tk_comment_reactions_ibfk_1` FOREIGN KEY (`comment_id`) REFERENCES `tk_comments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------- Labels: CRUD ----------

DROP PROCEDURE IF EXISTS `sp_get_labels`;
delimiter ;;
CREATE PROCEDURE `sp_get_labels`(IN p_cid CHAR(36))
BEGIN
    SELECT id, company_id, name, color, description, is_deleted, created_at
    FROM tk_labels
    WHERE company_id = p_cid AND is_deleted = 0
    ORDER BY name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_create_label`;
delimiter ;;
CREATE PROCEDURE `sp_create_label`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(50), IN p_color VARCHAR(7), IN p_desc VARCHAR(255))
BEGIN
    INSERT INTO tk_labels (id, company_id, name, color, description)
    VALUES (p_id, p_cid, p_name, IFNULL(p_color, '#6366f1'), NULLIF(p_desc, ''));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_update_label`;
delimiter ;;
CREATE PROCEDURE `sp_update_label`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(50), IN p_color VARCHAR(7), IN p_desc VARCHAR(255))
BEGIN
    UPDATE tk_labels
    SET name = p_name, color = IFNULL(p_color, color), description = NULLIF(p_desc, '')
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_delete_label`;
delimiter ;;
CREATE PROCEDURE `sp_delete_label`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    -- Remove associations for this company's tickets, then soft-delete the label.
    DELETE tl FROM tk_ticket_labels tl
    JOIN tk_labels l ON l.id = tl.label_id
    WHERE tl.label_id = p_id AND l.company_id = p_cid;

    UPDATE tk_labels SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Labels: ticket associations (company-scoped) ----------

DROP PROCEDURE IF EXISTS `sp_add_ticket_label`;
delimiter ;;
CREATE PROCEDURE `sp_add_ticket_label`(IN p_ticket_id CHAR(36), IN p_label_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tk_tickets WHERE id = p_ticket_id AND company_id = p_cid AND is_deleted = 0)
       OR NOT EXISTS (SELECT 1 FROM tk_labels WHERE id = p_label_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket or label not found';
    END IF;
    INSERT IGNORE INTO tk_ticket_labels (ticket_id, label_id) VALUES (p_ticket_id, p_label_id);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_remove_ticket_label`;
delimiter ;;
CREATE PROCEDURE `sp_remove_ticket_label`(IN p_ticket_id CHAR(36), IN p_label_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    DELETE tl FROM tk_ticket_labels tl
    JOIN tk_tickets t ON t.id = tl.ticket_id AND t.company_id = p_cid
    WHERE tl.ticket_id = p_ticket_id AND tl.label_id = p_label_id;
END
;;
delimiter ;


-- ---------- Timeline events (company-scoped) ----------

DROP PROCEDURE IF EXISTS `sp_add_ticket_event`;
delimiter ;;
CREATE PROCEDURE `sp_add_ticket_event`(IN p_id CHAR(36), IN p_ticket_id CHAR(36), IN p_cid CHAR(36), IN p_actor CHAR(36), IN p_type VARCHAR(30), IN p_old VARCHAR(255), IN p_new VARCHAR(255))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tk_tickets WHERE id = p_ticket_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket not found';
    END IF;
    INSERT INTO tk_events (id, ticket_id, actor_id, event_type, old_value, new_value)
    VALUES (p_id, p_ticket_id, NULLIF(p_actor, ''), p_type, NULLIF(p_old, ''), NULLIF(p_new, ''));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_ticket_events`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket_events`(IN p_ticket_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT ev.id, ev.ticket_id, ev.actor_id, ev.event_type, ev.old_value, ev.new_value, ev.created_at,
        CONCAT(e.first_name, ' ', e.last_name) AS actor_name
    FROM tk_events ev
    INNER JOIN tk_tickets t ON t.id = ev.ticket_id AND t.company_id = p_cid
    LEFT JOIN employees e ON e.id = ev.actor_id
    WHERE ev.ticket_id = p_ticket_id
    ORDER BY ev.created_at ASC;
END
;;
delimiter ;


-- ---------- Comment edit (author-only, company-scoped) ----------

DROP PROCEDURE IF EXISTS `sp_update_ticket_comment`;
delimiter ;;
CREATE PROCEDURE `sp_update_ticket_comment`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_author CHAR(36), IN p_content TEXT)
BEGIN
    UPDATE tk_comments c
    INNER JOIN tk_tickets t ON t.id = c.ticket_id AND t.company_id = p_cid
    SET c.content = p_content
    WHERE c.id = p_id AND c.author_id = p_author AND c.is_deleted = 0;
END
;;
delimiter ;


-- ---------- Reactions (company-scoped, toggle) ----------

DROP PROCEDURE IF EXISTS `sp_toggle_comment_reaction`;
delimiter ;;
CREATE PROCEDURE `sp_toggle_comment_reaction`(IN p_comment_id CHAR(36), IN p_cid CHAR(36), IN p_user CHAR(36), IN p_emoji VARCHAR(16))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM tk_comments c
        INNER JOIN tk_tickets t ON t.id = c.ticket_id
        WHERE c.id = p_comment_id AND t.company_id = p_cid AND c.is_deleted = 0
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Comment not found';
    END IF;

    IF EXISTS (SELECT 1 FROM tk_comment_reactions WHERE comment_id = p_comment_id AND user_id = p_user AND emoji = p_emoji) THEN
        DELETE FROM tk_comment_reactions WHERE comment_id = p_comment_id AND user_id = p_user AND emoji = p_emoji;
    ELSE
        INSERT INTO tk_comment_reactions (comment_id, user_id, emoji) VALUES (p_comment_id, p_user, p_emoji);
    END IF;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_ticket_reactions`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket_reactions`(IN p_ticket_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT r.comment_id, r.emoji, r.user_id
    FROM tk_comment_reactions r
    INNER JOIN tk_comments c ON c.id = r.comment_id
    INNER JOIN tk_tickets t ON t.id = c.ticket_id AND t.company_id = p_cid
    WHERE c.ticket_id = p_ticket_id;
END
;;
delimiter ;


-- ---------- Tickets: embed labels JSON (redefine, adds trailing `labels` col) ----------

DROP PROCEDURE IF EXISTS `sp_get_tickets`;
delimiter ;;
CREATE PROCEDURE `sp_get_tickets`(IN p_cid CHAR(36), IN p_status VARCHAR(20), IN p_priority VARCHAR(10), IN p_catid CHAR(36), IN p_assigned CHAR(36), IN p_created CHAR(36))
BEGIN
    SELECT t.*,
        c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
        CONCAT(e1.first_name, ' ', e1.last_name) AS created_by_name,
        CONCAT(e2.first_name, ' ', e2.last_name) AS assigned_to_name,
        (SELECT COUNT(*) FROM tk_comments WHERE ticket_id = t.id AND is_deleted = 0) AS comment_count,
        CASE
            WHEN t.status IN ('Resolved','Closed') THEN 0
            WHEN t.due_date IS NOT NULL AND NOW() > t.due_date THEN 1
            ELSE 0
        END AS is_overdue,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', l.id, 'name', l.name, 'color', l.color))
           FROM tk_ticket_labels tl
           INNER JOIN tk_labels l ON l.id = tl.label_id AND l.is_deleted = 0
          WHERE tl.ticket_id = t.id) AS labels
    FROM tk_tickets t
    LEFT JOIN tk_categories c ON c.id = t.category_id
    LEFT JOIN employees e1 ON e1.id = t.created_by
    LEFT JOIN employees e2 ON e2.id = t.assigned_to
    WHERE t.company_id = p_cid AND t.is_deleted = 0
      AND (p_status = '' OR t.status = p_status)
      AND (p_priority = '' OR t.priority = p_priority)
      AND (p_catid = '' OR t.category_id = p_catid)
      AND (p_assigned = '' OR t.assigned_to = p_assigned)
      AND (p_created = '' OR t.created_by = p_created)
    ORDER BY
        FIELD(t.priority, 'Urgent','High','Medium','Low'),
        FIELD(t.status, 'Open','In Progress','On Hold','Resolved','Closed'),
        t.created_at DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_ticket`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT t.*,
        c.name AS category_name, c.color AS category_color, c.icon AS category_icon, c.sla_hours,
        CONCAT(e1.first_name, ' ', e1.last_name) AS created_by_name,
        CONCAT(e2.first_name, ' ', e2.last_name) AS assigned_to_name,
        CASE WHEN t.status NOT IN ('Resolved','Closed') AND t.due_date IS NOT NULL AND NOW() > t.due_date THEN 1 ELSE 0 END AS is_overdue,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', l.id, 'name', l.name, 'color', l.color))
           FROM tk_ticket_labels tl
           INNER JOIN tk_labels l ON l.id = tl.label_id AND l.is_deleted = 0
          WHERE tl.ticket_id = t.id) AS labels
    FROM tk_tickets t
    LEFT JOIN tk_categories c ON c.id = t.category_id
    LEFT JOIN employees e1 ON e1.id = t.created_by
    LEFT JOIN employees e2 ON e2.id = t.assigned_to
    WHERE t.id = p_id AND t.company_id = p_cid AND t.is_deleted = 0;
END
;;
delimiter ;
