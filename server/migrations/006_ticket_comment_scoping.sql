-- ============================================================================
-- Migration 006: multi-tenant scoping for ticket comments (IDOR: T1-T3)
--
-- tk_comments has no company_id column and is reachable only through its
-- ticket_id FK, but the three comment procedures keyed only on ticket/comment
-- id -- so any authenticated user in any company could read, add, or delete
-- comments on ANY tenant's ticket by UUID (same cross-tenant IDOR class as
-- C4-C8/H2 fixed in migration 003). These redefinitions add a company_id
-- parameter and enforce it via a join/guard against tk_tickets. Apply
-- BEFORE/with the matching server build.
--   mysql -u <user> -p lettersheets < server/migrations/006_ticket_comment_scoping.sql
-- ============================================================================


-- ---------- Ticket comments: read (T1) ----------
DROP PROCEDURE IF EXISTS `sp_get_ticket_comments`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket_comments`(IN p_ticket_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT tc.*,
        CONCAT(e.first_name, ' ', e.last_name) AS author_name
    FROM tk_comments tc
    INNER JOIN tk_tickets t ON t.id = tc.ticket_id AND t.company_id = p_cid AND t.is_deleted = 0
    LEFT JOIN employees e ON e.id = tc.author_id
    WHERE tc.ticket_id = p_ticket_id AND tc.is_deleted = 0
    ORDER BY tc.created_at ASC;
END
;;
delimiter ;


-- ---------- Ticket comments: add (T2) ----------
DROP PROCEDURE IF EXISTS `sp_add_ticket_comment`;
delimiter ;;
CREATE PROCEDURE `sp_add_ticket_comment`(IN p_id CHAR(36), IN p_ticket_id CHAR(36), IN p_author_id CHAR(36), IN p_content TEXT, IN p_is_internal TINYINT, IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tk_tickets WHERE id = p_ticket_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket not found';
    END IF;
    INSERT INTO tk_comments (id, ticket_id, author_id, content, is_internal)
    VALUES (p_id, p_ticket_id, p_author_id, p_content, IFNULL(p_is_internal, 0));
END
;;
delimiter ;


-- ---------- Ticket comments: delete (T3) ----------
DROP PROCEDURE IF EXISTS `sp_delete_ticket_comment`;
delimiter ;;
CREATE PROCEDURE `sp_delete_ticket_comment`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE tk_comments tc
    INNER JOIN tk_tickets t ON t.id = tc.ticket_id AND t.company_id = p_cid
    SET tc.is_deleted = 1
    WHERE tc.id = p_id;
END
;;
delimiter ;
