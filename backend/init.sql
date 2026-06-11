-- USERS 테이블 생성
CREATE TABLE USERS (
    ID VARCHAR(16) NOT NULL PRIMARY KEY,
    PASSWORD VARCHAR(64) NOT NULL, -- SHA256은 64자의 고정 길이 해시
    EMAIL VARCHAR(40),
    NICKNAME VARCHAR(20) NOT NULL,
    REGISTER TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 현재 시간을 기본값으로 설정
    LAST_LOGIN VARCHAR(255)  -- 새로운 필드 추가
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- INFO 테이블 생성
CREATE TABLE INFO (
    ID VARCHAR(16) NOT NULL,
    REGION VARCHAR(16),
    DISEASES VARCHAR(100),
    PRIMARY KEY (ID),
    FOREIGN KEY (ID) REFERENCES USERS(ID) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- 아래는 테이블 삭제
drop table auth_group_permissions;
drop table auth_user_user_permissions;
drop table auth_permission;
drop table auth_user_groups;
drop table auth_group;
drop table django_admin_log;
drop table django_content_type;
drop table django_migrations;
drop table django_session;
drop table auth_user;

DROP TABLE INFO;
DROP TABLE USERS;

-- 테스트용 계정 삭제
delete from info where id in (select id from users where last_login is null);
delete from users where last_login is null;