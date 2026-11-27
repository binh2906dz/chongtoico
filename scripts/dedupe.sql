-- Dọn job trùng: giữ lại đúng 1 job cho mỗi (campaign_id, telegram_id).
-- Job cũ hơn được giữ, job mới hơn bị xoá.
BEGIN;

CREATE TEMP TABLE keep_jobs AS
SELECT DISTINCT ON (campaign_id, telegram_id) id
FROM notification_jobs
ORDER BY campaign_id, telegram_id, id;

DELETE FROM notification_jobs
WHERE id NOT IN (SELECT id FROM keep_jobs);

SELECT count(*) AS total_jobs,
       count(DISTINCT telegram_id) AS distinct_ids
FROM notification_jobs;

SELECT campaign_id, status, count(*) AS n FROM notification_jobs
GROUP BY campaign_id, status ORDER BY n DESC;

COMMIT;
