-- Allow cancel completion events from the worker

ALTER TYPE "run_event_type" ADD VALUE IF NOT EXISTS 'run.canceled';
