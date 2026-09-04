-- Add canceled as a terminal run status

ALTER TYPE "run_status" ADD VALUE IF NOT EXISTS 'canceled';
