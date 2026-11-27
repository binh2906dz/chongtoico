-- Lần cuối chiến dịch được đưa vào hàng đợi.
-- Scheduler nhìn vào cột này để không queue lại chiến dịch mỗi phút (B114).
ALTER TABLE "telegram_campaigns" ADD COLUMN IF NOT EXISTS "last_queued_at" timestamp with time zone;
