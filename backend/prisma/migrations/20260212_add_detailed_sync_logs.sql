ALTER TABLE "sync_logs" ADD COLUMN "request_url" TEXT;
ALTER TABLE "sync_logs" ADD COLUMN "request_method" TEXT;
ALTER TABLE "sync_logs" ADD COLUMN "response_status" INTEGER;
ALTER TABLE "sync_logs" ADD COLUMN "response_body" TEXT;
ALTER TABLE "sync_logs" ADD COLUMN "duration" INTEGER DEFAULT 0;
ALTER TABLE "sync_logs" ALTER COLUMN "registros_processados" SET DEFAULT 0;
