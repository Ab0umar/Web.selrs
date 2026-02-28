# Required-To-Sync Column Whitelist

Date: 2026-02-25  
Source tables:
- `rece.csv` -> `op2026.dbo.PAJRNRCVH`
- `srvss.csv` -> `op2026.dbo.PAPAT_SRV`

Rule:
- Sync only these required business columns.
- Ignore null/empty values.
- Exclude auto-number and date/time workflow fields unless explicitly listed below.

## 1) PAJRNRCVH (rece) required columns

- `PAT_CD`
- `NAM`
- `NAM1`
- `NAM2`
- `NAM3`
- `TEL1`
- `ADDRS`
- `AGE`
- `GNDR`
- `BRNCH`
- `IDNO`  (`1` center, `2` external)
- `PAY`
- `DUE`
- `DRS_CD`
- `SEC_CD`
- `SRV_CD` (if available in deployment)
- `INV_NO`
- `CAINV_NO`
- `KSH_NO`

## 2) PAPAT_SRV (srvss) required columns

- `PAT_CD`
- `SRV_CD`
- `PAT_NM_AR`
- `PAT_NM_EN`
- `SRV_BY1`
- `CUR_SRV_BY`
- `PRG_BY`
- `SEC_CD`
- `PRG_SNO`
- `QTY`
- `PRC`
- `DISC_VL`
- `PA_VL`
- `INV_NO`
- `CAINV_NO`

## 3) Explicitly excluded (auto/date/workflow)

These are excluded from backfill unless a specific feature needs them:

- `TR_NO`
- `tr_noNew`
- `TR_TY`
- `TR_DT`
- `VST_NO`
- `SHFT`
- `DT`
- `BDT`
- `VST_DT`
- `ENTRYDATE`
- `UPDATEDATE`
- `TR_TIM`
- `REPIT_NO`
- `LN_NO`
- `AZTR_NO`
- `AZLN_NO`
- `OPTR_NO`
- `WF_TR_NO`
- `WF_LN_NO`
- `enter_no`
- `CUR_SRV_IDX`
- `T_BTCH_ID`
- `BTCH_ID`
- `TMP_NO`
- `TMP_DR_BTCHID`

## 4) Notes

- Treating doctor source priority: `DRS_CD` from `PAJRNRCVH` first, then service doctor fields from `PAPAT_SRV`.
- If a required field is missing in the latest row, sync should backfill from other non-empty rows for the same patient.
- For reports, non-empty non-auto/non-date values can be preserved in exam state (`mssqlBackfill`).
