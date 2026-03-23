#!/usr/bin/env node
/**
 * 備份檔基本驗證：存在、大小門檻、.gz 可解壓（驗證 gzip 完整性）。
 * 用法: node scripts/verify-backup-archive.mjs <檔案路徑>
 * 環境變數: BACKUP_VERIFY_MIN_BYTES (預設 256)
 */
import fs from 'fs';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Writable } from 'stream';

const MIN_BYTES = Number(process.env.BACKUP_VERIFY_MIN_BYTES || 256);

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('用法: node scripts/verify-backup-archive.mjs <檔案路徑>');
    process.exit(2);
  }

  let st;
  try {
    st = await fs.promises.stat(filePath);
  } catch (e) {
    console.error(`[verify-backup] 無法讀取檔案: ${filePath}`, e.message);
    process.exit(1);
  }

  if (!st.isFile()) {
    console.error('[verify-backup] 路徑不是一般檔案');
    process.exit(1);
  }

  if (st.size < MIN_BYTES) {
    console.error(`[verify-backup] 檔案過小 (${st.size} < ${MIN_BYTES} bytes)，可能備份失敗`);
    process.exit(1);
  }

  const lower = filePath.toLowerCase();
  if (lower.endsWith('.gz')) {
    const drain = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });
    try {
      await pipeline(createReadStream(filePath), createGunzip(), drain);
    } catch (e) {
      console.error('[verify-backup] gzip 解壓失敗（檔案可能損毀）:', e.message);
      process.exit(1);
    }
  }

  console.log(`[verify-backup] OK: ${filePath} (${st.size} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
