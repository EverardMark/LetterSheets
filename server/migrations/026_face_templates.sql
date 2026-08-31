-- ============================================================================
-- 026_face_templates.sql — face recognition templates for the time clock
--
-- Storage model: the server holds CIPHERTEXT ONLY.
--
-- `embedding_enc` is encrypted client-side with the company key (AES-256-GCM,
-- iv||ciphertext, base64) exactly like employees.email_enc, so the server —
-- and anyone who reaches the database — never sees a face embedding. The
-- kiosk unwraps the company key at device sign-in, pulls the roster, decrypts
-- in memory and matches locally. That is what makes client-side matching a
-- privacy improvement rather than just a latency one.
--
-- A face embedding is biometric data: irrevocable (unlike a password, you
-- cannot reissue someone's face) and regulated as a special category under
-- GDPR Art. 9 and US biometric-privacy statutes. Two consequences are baked
-- into the schema below: consent is recorded per subject, and deletion is
-- real rather than a flag.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `face_templates` (
  `id`            varchar(36)  NOT NULL,
  `company_id`    varchar(36)  NOT NULL,
  `employee_id`   varchar(36)  NOT NULL,

  -- Encrypted with the company key, never readable by the server. Base64 of
  -- iv(12) || AES-256-GCM ciphertext — the same envelope utils/crypto.js
  -- produces, so the ERP and the kiosk interoperate without a second format.
  `embedding_enc` text         NOT NULL,

  -- Which model produced the embedding. Embeddings are only comparable within
  -- one model, so a kiosk running a different model must ignore these rows
  -- rather than silently match against a vector space they do not share.
  -- Without this column a model upgrade would produce confident wrong matches.
  `model`         varchar(64)  NOT NULL DEFAULT 'buffalo_s/w600k_mbf',
  `dims`          smallint     NOT NULL DEFAULT 512,

  -- Capture quality at enrollment (0..1). Kept so a kiosk can warn that a
  -- poor enrollment, not the camera, is why someone is rejected all week.
  `quality`       decimal(4,3) NOT NULL DEFAULT 0.000,

  -- Consent is a legal precondition for processing biometrics, so it is a
  -- column and not a checkbox that scrolled off a screen once. Recording who
  -- enrolled the subject and when is what makes the record defensible.
  `consent_at`    datetime     DEFAULT NULL,
  `enrolled_by`   varchar(36)  DEFAULT NULL,
  `device`        varchar(191) NOT NULL DEFAULT '',

  `created_at`    datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

  -- One face per employee. Unlike fingers there is only one to enroll, and a
  -- second row would silently widen that person's match surface over time.
  UNIQUE KEY `uq_face_employee` (`company_id`, `employee_id`),
  KEY `idx_face_company` (`company_id`),

  -- ON DELETE CASCADE, deliberately: deleting an employee must destroy their
  -- biometric template outright. A soft delete would leave a face embedding
  -- alive in the table after the person left, which is exactly the retention
  -- failure the statutes above are written about.
  CONSTRAINT `fk_face_company` FOREIGN KEY (`company_id`)
    REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_face_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ----------------------------
-- sp_get_face_templates — roster sync for a kiosk
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_face_templates`;
delimiter ;;
CREATE PROCEDURE `sp_get_face_templates`(IN p_company_id VARCHAR(36))
BEGIN
    -- Joined to employees so a kiosk gets the display name in the same round
    -- trip, and so templates belonging to deleted/inactive staff are dropped
    -- here rather than being matched against on the device.
    SELECT f.id, f.company_id, f.employee_id, f.embedding_enc, f.model, f.dims,
           f.quality, f.consent_at, f.enrolled_by, f.device,
           f.created_at, f.updated_at,
           e.first_name, e.last_name, e.department, e.position
    FROM face_templates f
    JOIN employees e ON e.id = f.employee_id
    WHERE f.company_id = p_company_id
      AND e.is_deleted = 0
      AND e.status = 'Active'
    ORDER BY e.last_name, e.first_name;
END
;;
delimiter ;

-- ----------------------------
-- sp_save_face_template — enroll or re-enroll (upsert)
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_save_face_template`;
delimiter ;;
CREATE PROCEDURE `sp_save_face_template`(IN p_id            VARCHAR(36),
    IN p_company_id    VARCHAR(36),
    IN p_employee_id   VARCHAR(36),
    IN p_embedding_enc TEXT,
    IN p_model         VARCHAR(64),
    IN p_dims          SMALLINT,
    IN p_quality       DECIMAL(4,3),
    IN p_device        VARCHAR(191),
    IN p_session_id    VARCHAR(36),
    IN p_changed_by    VARCHAR(36),
    IN p_ip_address    VARCHAR(45),
    IN p_user_agent    VARCHAR(500))
BEGIN
    DECLARE v_exists INT DEFAULT 0;

    -- Reject an employee from another tenant outright. The handler already
    -- scopes by session company, but the biometric table is the last place to
    -- rely on a single layer of tenant checking.
    IF NOT EXISTS (SELECT 1 FROM employees
                   WHERE id = p_employee_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'employee not found in this company';
    END IF;

    SELECT COUNT(*) INTO v_exists FROM face_templates
    WHERE company_id = p_company_id AND employee_id = p_employee_id;

    INSERT INTO face_templates
        (id, company_id, employee_id, embedding_enc, model, dims, quality,
         consent_at, enrolled_by, device)
    VALUES
        (p_id, p_company_id, p_employee_id, p_embedding_enc, p_model, p_dims,
         p_quality, NOW(), p_changed_by, p_device)
    ON DUPLICATE KEY UPDATE
        embedding_enc = p_embedding_enc,
        model         = p_model,
        dims          = p_dims,
        quality       = p_quality,
        consent_at    = NOW(),
        enrolled_by   = p_changed_by,
        device        = p_device;

    -- The audit row records THAT a face was enrolled, never the template. A
    -- change_history table that carried embeddings would quietly become a
    -- second, unencrypted copy of the biometric database.
    INSERT INTO change_history
        (id, company_id, changed_by, session_id, table_name, record_id,
         change_type, field_name, new_value, ip_address, user_agent)
    VALUES
        (UUID(), p_company_id, p_changed_by, p_session_id, 'face_templates',
         p_employee_id, IF(v_exists > 0, 'UPDATE', 'INSERT'), 'face_template',
         IF(v_exists > 0, 're-enrolled', 'enrolled'), p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- sp_delete_face_template — hard delete (see retention note above)
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_face_template`;
delimiter ;;
CREATE PROCEDURE `sp_delete_face_template`(IN p_company_id  VARCHAR(36),
    IN p_employee_id VARCHAR(36),
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    -- A hard DELETE, not is_deleted = 1. "Unenroll my face" has to actually
    -- destroy the template; a soft delete would keep the biometric on file
    -- while telling the employee it was removed.
    DELETE FROM face_templates
    WHERE company_id = p_company_id AND employee_id = p_employee_id;

    INSERT INTO change_history
        (id, company_id, changed_by, session_id, table_name, record_id,
         change_type, field_name, new_value, ip_address, user_agent)
    VALUES
        (UUID(), p_company_id, p_changed_by, p_session_id, 'face_templates',
         p_employee_id, 'DELETE', 'face_template', 'unenrolled',
         p_ip_address, p_user_agent);
END
;;
delimiter ;
