-- Chiến dịch khẩn cấp: bỏ qua mọi luật giới hạn tần suất, gửi ngay.
ALTER TABLE "telegram_campaigns" ADD COLUMN IF NOT EXISTS "is_emergency" boolean DEFAULT false NOT NULL;
