-- Optional DB-level protection against duplicate service rows.
-- Review key columns for your deployment before enabling.
-- Default unique key here: PAT_CD + SRV_CD + TR_NO (filtered for non-null values).

IF COL_LENGTH('op2026.dbo.PAPAT_SRV', 'PAT_CD') IS NULL
   OR COL_LENGTH('op2026.dbo.PAPAT_SRV', 'SRV_CD') IS NULL
   OR COL_LENGTH('op2026.dbo.PAPAT_SRV', 'TR_NO') IS NULL
BEGIN
  PRINT 'Skipped: required columns not found (PAT_CD, SRV_CD, TR_NO).';
  RETURN;
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('op2026.dbo.PAPAT_SRV')
    AND name = 'UX_PAPAT_SRV_PAT_SRV_TRNO'
)
BEGIN
  CREATE UNIQUE INDEX UX_PAPAT_SRV_PAT_SRV_TRNO
    ON op2026.dbo.PAPAT_SRV (PAT_CD, SRV_CD, TR_NO)
    WHERE PAT_CD IS NOT NULL AND SRV_CD IS NOT NULL AND TR_NO IS NOT NULL;
END
ELSE
BEGIN
  PRINT 'Index already exists: UX_PAPAT_SRV_PAT_SRV_TRNO';
END

