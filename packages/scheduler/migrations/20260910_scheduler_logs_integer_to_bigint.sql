BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hai_scheduler_logs'
      AND column_name = 'started_at'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE public.hai_scheduler_logs
      ALTER COLUMN started_at TYPE BIGINT USING started_at::BIGINT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hai_scheduler_logs'
      AND column_name = 'finished_at'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE public.hai_scheduler_logs
      ALTER COLUMN finished_at TYPE BIGINT USING finished_at::BIGINT;
  END IF;
END
$$;

COMMIT;
