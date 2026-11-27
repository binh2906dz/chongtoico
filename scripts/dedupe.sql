-- Dọn job trùng: giữ lại đúng 1 job cho mỗi (campaign_id, telegram_id).
-- Job cũ hơn được giữ, job mới hơn bị xoá.
BEGIN;

-- 1. Ghi lại job nào phải giữ.
CREATE TEMP TABLE keep_jobs AS
SELECT DISTINCT ON (campaign_id, telegram_id) id
FROM notification_jobs
ORDER BY campaign_id, telegram_id, id;

-- 2. Xoá các job trùng (giữ lại job đã có trong keep_jobs).
DELETE FROM notification_jobs
WHERE id NOT IN (SELECT id FROM keep_jobs);

-- 3. Kiểm tra kết quả.
SELECT count(*) AS total_jobs,
       count(DISTINCT telegram_id) AS distinct_ids
FROM notification_jobs;

SELECT campaign_id, status, count(*) AS n FROM notification_jobs
GROUP BY campaign_id, status ORDER BY n DESC;

COMMIT;
