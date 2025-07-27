/*
 Navicat Premium Dump SQL

 Source Server         : LetterSheets
 Source Server Type    : MySQL
 Source Server Version : 80042 (8.0.42-0ubuntu0.24.04.2)
 Source Host           : 13.114.51.50:3306
 Source Schema         : lettersheets

 Target Server Type    : MySQL
 Target Server Version : 80042 (8.0.42-0ubuntu0.24.04.2)
 File Encoding         : 65001

 Date: 27/07/2025 17:44:04
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for cities
-- ----------------------------
DROP TABLE IF EXISTS `cities`;
CREATE TABLE `cities` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province` int unsigned DEFAULT NULL,
  `state` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_city_province` (`province`),
  KEY `fk_city_state` (`state`),
  CONSTRAINT `fk_city_province` FOREIGN KEY (`province`) REFERENCES `provinces` (`id`),
  CONSTRAINT `fk_city_state` FOREIGN KEY (`state`) REFERENCES `states` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for companies
-- ----------------------------
DROP TABLE IF EXISTS `companies`;
CREATE TABLE `companies` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `city` int unsigned DEFAULT NULL,
  `state` int unsigned DEFAULT NULL,
  `province` int unsigned DEFAULT NULL,
  `zip_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_city_company` (`city`),
  KEY `fk_state_company` (`state`),
  KEY `fk_province_company` (`province`),
  KEY `fk_country_company` (`country`),
  CONSTRAINT `fk_city_company` FOREIGN KEY (`city`) REFERENCES `cities` (`id`),
  CONSTRAINT `fk_country_company` FOREIGN KEY (`country`) REFERENCES `countries` (`id`),
  CONSTRAINT `fk_province_company` FOREIGN KEY (`province`) REFERENCES `provinces` (`id`),
  CONSTRAINT `fk_state_company` FOREIGN KEY (`state`) REFERENCES `states` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for company_users
-- ----------------------------
DROP TABLE IF EXISTS `company_users`;
CREATE TABLE `company_users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company` bigint unsigned DEFAULT NULL,
  `user` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_company_comapnyusers` (`company`),
  KEY `fk_user_companyusers` (`user`),
  CONSTRAINT `fk_company_comapnyusers` FOREIGN KEY (`company`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_user_companyusers` FOREIGN KEY (`user`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for contact_persons
-- ----------------------------
DROP TABLE IF EXISTS `contact_persons`;
CREATE TABLE `contact_persons` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for countries
-- ----------------------------
DROP TABLE IF EXISTS `countries`;
CREATE TABLE `countries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for provinces
-- ----------------------------
DROP TABLE IF EXISTS `provinces`;
CREATE TABLE `provinces` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_province_country` (`country`),
  CONSTRAINT `fk_province_country` FOREIGN KEY (`country`) REFERENCES `countries` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for states
-- ----------------------------
DROP TABLE IF EXISTS `states`;
CREATE TABLE `states` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_states_country` (`country`),
  CONSTRAINT `fk_states_country` FOREIGN KEY (`country`) REFERENCES `countries` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `firstname` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastname` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `handle` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Procedure structure for spGetCities
-- ----------------------------
DROP PROCEDURE IF EXISTS `spGetCities`;
delimiter ;;
CREATE PROCEDURE `spGetCities`(IN strCountry VARCHAR(255))
BEGIN
  
	SELECT id FROM countries WHERE SHA2(id, 256) = strCountry INTO @country;
	
	SELECT SHA2(id, 256) AS id, `name` FROM provinces WHERE country = @country;
	
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for spGetCitiesByProvince
-- ----------------------------
DROP PROCEDURE IF EXISTS `spGetCitiesByProvince`;
delimiter ;;
CREATE PROCEDURE `spGetCitiesByProvince`(IN strProvince VARCHAR(255))
BEGIN
  
	SELECT id FROM provinces WHERE SHA2(id, 256) = strProvince INTO @province;
	
	SELECT SHA2(id, 256) AS id, `name` FROM cities WHERE province = @province;
	
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for spGetCitiesByState
-- ----------------------------
DROP PROCEDURE IF EXISTS `spGetCitiesByState`;
delimiter ;;
CREATE PROCEDURE `spGetCitiesByState`(IN strState VARCHAR(255))
BEGIN
  
	SELECT id FROM states WHERE SHA2(id, 256) = strState INTO @state;
	
	SELECT SHA2(id, 256) AS id, `name` FROM cities WHERE state = @state;
	
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for spGetCountries
-- ----------------------------
DROP PROCEDURE IF EXISTS `spGetCountries`;
delimiter ;;
CREATE PROCEDURE `spGetCountries`()
BEGIN
  
	SELECT SHA2(id, 256) AS id, `name` FROM countries;
	
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for spGetProvinces
-- ----------------------------
DROP PROCEDURE IF EXISTS `spGetProvinces`;
delimiter ;;
CREATE PROCEDURE `spGetProvinces`(IN strCountry VARCHAR(255))
BEGIN
  
	SELECT id FROM countries WHERE SHA2(id, 256) = strCountry INTO @country;
	
	SELECT SHA2(id, 256) AS id, `name` FROM provinces WHERE country = @country;
	
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for spGetStates
-- ----------------------------
DROP PROCEDURE IF EXISTS `spGetStates`;
delimiter ;;
CREATE PROCEDURE `spGetStates`(IN strCountry VARCHAR(255))
BEGIN
  
	SELECT id FROM countries WHERE SHA2(id, 256) = strCountry INTO @country;
	
	SELECT SHA2(id, 256) AS id, `name` FROM states WHERE country = @country;
	
	
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for spInsertUpdateCompany
-- ----------------------------
DROP PROCEDURE IF EXISTS `spInsertUpdateCompany`;
delimiter ;;
CREATE PROCEDURE `spInsertUpdateCompany`(IN strCompanyId VARCHAR(255),
IN strCompanyName VARCHAR(255),
IN strAddress VARCHAR(255),
IN strCity VARCHAR(100),
IN strState VARCHAR(100),
IN strProvince VARCHAR(100),
IN strZipCode VARCHAR(50),
IN strCountry VARCHAR(255))
BEGIN
  
	SELECT id FROM countries WHERE SHA2(id, 256) = strCountry INTO @country;
	
	SELECT id FROM cities WHERE SHA2(id, 256) = strCity INTO @city;
	
	SELECT id FROM states WHERE SHA2(id, 256) = strState INTO @state;
	
	SELECT id FROM provinces WHERE SHA2(id, 256) = strProvince INTO @province;
	
	IF(NOT EXISTS(SELECT id FROM companies WHERE SHA2(id, 256) = strCompanyId)) THEN
	
		INSERT INTO companies(
		
			`name`,
			address,
			city,
			state,
			province,
			zip_code,
			country
			
		)VALUES(
			strCompanyName,
			strAddress,
			@city,
			@state,
			@province,
			strZipCode,
			@country
		
			
		);
		
		SELECT LAST_INSERT_ID() INTO @result;
	
	END IF;
	
	SELECT SHA2(@result, 256) AS result;
	
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for spInsertUpdateCompanyUser
-- ----------------------------
DROP PROCEDURE IF EXISTS `spInsertUpdateCompanyUser`;
delimiter ;;
CREATE PROCEDURE `spInsertUpdateCompanyUser`(IN strCompany VARCHAR(255), IN strUser VARCHAR(255))
BEGIN
  
	
	IF(NOT EXISTS(SELECT id FROM company_users WHERE SHA2(company, 256) = strCompany AND SHA2(`user`, 256) = strUser)) THEN
	
		SELECT id FROM companies WHERE SHA2(id, 256) = strCompany INTO @company;
		
		SELECT id FROM users WHERE SHA2(id, 256) = strUser INTO @user;
		
		INSERT INTO company_users(company, `user`) VALUES(@company, @user);
		
		SELECT LAST_INSERT_ID() INTO @result;
	
	END IF;
	
	SELECT SHA2(@result, 256) AS result;
	
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for spInsertUpdateUser
-- ----------------------------
DROP PROCEDURE IF EXISTS `spInsertUpdateUser`;
delimiter ;;
CREATE PROCEDURE `spInsertUpdateUser`(IN strUserId VARCHAR(255),
IN strFirstname VARCHAR(255),
IN strLastname VARCHAR(255),
IN strHandle VARCHAR(255))
BEGIN
  
	
	IF(NOT EXISTS(SELECT id FROM users WHERE SHA2(id, 256) = strUserId)) THEN
	
		INSERT INTO users(
		
			firstname,
			lastname,
			handle
		)VALUES(
		
			strFirstname,
			strLastname,
			strHandle
		
		);
		
		SELECT LAST_INSERT_ID() INTO @result;
	
	END IF;
	
	SELECT SHA2(@result, 256) AS result;
	
END
;;
delimiter ;

SET FOREIGN_KEY_CHECKS = 1;
