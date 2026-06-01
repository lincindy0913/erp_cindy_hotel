import fs from 'fs';
import path from 'path';

// Root directory for contract files. Override via CONTRACTS_ROOT env var.
// Default: <project-root>/upload-data/supplier-contracts
function getContractsRoot() {
  if (process.env.CONTRACTS_ROOT) return process.env.CONTRACTS_ROOT;
  return path.join(process.cwd(), 'upload-data', 'supplier-contracts');
}

export function contractFilePath(supplierId, filename) {
  const dir = path.join(getContractsRoot(), String(supplierId));
  return { dir, filePath: path.join(dir, filename) };
}

export function saveContractFile(supplierId, safeName, buffer) {
  const timestamp = Date.now();
  const storedName = `${timestamp}-${safeName}`;
  const { dir, filePath } = contractFilePath(supplierId, storedName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath; // absolute path stored in DB
}

export function deleteContractFile(fileUrl) {
  try {
    if (fileUrl && fs.existsSync(fileUrl)) fs.unlinkSync(fileUrl);
  } catch {
    // Non-critical: log but don't throw (DB record will still be deleted)
    console.error('deleteContractFile: failed to delete', fileUrl);
  }
}

export function readContractFile(fileUrl) {
  return fs.readFileSync(fileUrl); // throws if not found
}
