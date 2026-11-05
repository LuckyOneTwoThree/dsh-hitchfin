import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync, } from 'node:fs';
export const HITCHFIN_PATCH_BACKUP_SUFFIX = '.hitchfin.bak';
export function getPatchBackupPath(patchFilePath) {
    return `${patchFilePath}${HITCHFIN_PATCH_BACKUP_SUFFIX}`;
}
/**
 * Create a lossless backup of a user's `cordis.patch.yml` before any migration.
 * Never overwrites an existing backup unless `overwrite = true`.
 */
export function backupCordisPatch(patchFilePath, overwrite = false) {
    const backupPath = getPatchBackupPath(patchFilePath);
    if (!existsSync(patchFilePath)) {
        return { backedUp: false, backupPath };
    }
    if (existsSync(backupPath) && !overwrite) {
        return { backedUp: true, backupPath };
    }
    copyFileSync(patchFilePath, backupPath);
    return { backedUp: true, backupPath };
}
/**
 * Restore the original `cordis.patch.yml` from `.hitchfin.bak` and remove the backup file.
 */
export function restoreCordisPatch(patchFilePath, removeBackupAfterRestore = true) {
    const backupPath = getPatchBackupPath(patchFilePath);
    if (!existsSync(backupPath)) {
        return { restored: false };
    }
    const content = readFileSync(backupPath, 'utf8');
    writeFileSync(patchFilePath, content, 'utf8');
    if (removeBackupAfterRestore) {
        rmSync(backupPath, { force: true });
    }
    return { restored: true, content };
}
