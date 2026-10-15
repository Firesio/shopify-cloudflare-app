-- Carry the legacy `admin_users.notify_support` switch into per-topic preferences.
--
-- Support mail used to be one flag per account; it is now one choice per (topic, channel), and the
-- new defaults are "on" for support by email. Without this, everybody who had MUTED tickets would
-- start receiving ticket email the moment this ships. So each muted account gets an explicit
-- "off" row for both support topics by email. Accounts with notify_support = 1 need no row: the
-- default already matches. `notify_support` itself stays (forward-only; dropping it is a later,
-- separate deploy). OR IGNORE keeps a re-run, or a choice already stored, untouched.
INSERT OR IGNORE INTO `admin_notification_preferences` (`admin_user_id`, `topic`, `channel`, `enabled`, `updated_at`)
SELECT `admin_users`.`id`, `topics`.`topic`, 'email', 0, CAST(strftime('%s', 'now') AS integer) * 1000
FROM `admin_users`
CROSS JOIN (SELECT 'support_ticket_opened' AS `topic` UNION ALL SELECT 'support_ticket_reply') AS `topics`
WHERE `admin_users`.`notify_support` = 0;
