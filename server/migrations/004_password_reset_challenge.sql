-- ============================================================================
-- Migration 004: proof-of-possession for password reset (C2)
--
-- Closes the unauthenticated account-takeover in `reset_password`. The reset now
-- requires the caller to sign a server-issued random challenge with the ML-DSA
-- signing key from their recovery file; the server verifies the signature against
-- the account's currently-stored signing_public_key before overwriting anything.
--
-- Apply:  mysql -u <user> -p lettersheets < server/migrations/004_password_reset_challenge.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS `password_reset_challenges` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `challenge` varbinary(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_prc_user` (`user_id`),
  KEY `idx_prc_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP PROCEDURE IF EXISTS `sp_create_reset_challenge`;
delimiter ;;
CREATE PROCEDURE `sp_create_reset_challenge`(IN p_id CHAR(36), IN p_user_id CHAR(36),
    IN p_challenge VARBINARY(64), IN p_expires_at DATETIME)
BEGIN
    INSERT INTO password_reset_challenges (id, user_id, challenge, expires_at)
    VALUES (p_id, p_user_id, p_challenge, p_expires_at);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_reset_challenge`;
delimiter ;;
CREATE PROCEDURE `sp_get_reset_challenge`(IN p_id CHAR(36))
BEGIN
    SELECT user_id, challenge, expires_at, used
    FROM password_reset_challenges WHERE id = p_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_consume_reset_challenge`;
delimiter ;;
-- Atomically mark a challenge used; affected-rows = 1 only on the first consume
-- of an unused, unexpired challenge (guards against replay / double-use races).
CREATE PROCEDURE `sp_consume_reset_challenge`(IN p_id CHAR(36))
BEGIN
    UPDATE password_reset_challenges
    SET used = 1
    WHERE id = p_id AND used = 0 AND expires_at > NOW();
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_user_signing_keys`;
delimiter ;;
CREATE PROCEDURE `sp_get_user_signing_keys`(IN p_user_id CHAR(36))
BEGIN
    SELECT signing_public_key
    FROM user_company_access
    WHERE user_id = p_user_id AND is_active = 1 AND signing_public_key IS NOT NULL;
END
;;
delimiter ;
