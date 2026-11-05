export declare const HITCHFIN_PATCH_BACKUP_SUFFIX = ".hitchfin.bak";
export declare function getPatchBackupPath(patchFilePath: string): string;
/**
 * Create a lossless backup of a user's `cordis.patch.yml` before any migration.
 * Never overwrites an existing backup unless `overwrite = true`.
 */
export declare function backupCordisPatch(patchFilePath: string, overwrite?: boolean): {
    backedUp: boolean;
    backupPath: string;
};
/**
 * Restore the original `cordis.patch.yml` from `.hitchfin.bak` and remove the backup file.
 */
export declare function restoreCordisPatch(patchFilePath: string, removeBackupAfterRestore?: boolean): {
    restored: boolean;
    content?: string;
};
