/** 1.0.1 — reserved hook; no schema change required for current Account model. */
async function execute() {
  // accountName remains the display field (linkDisplayField / titleField).
}

export default { execute, beforeMigrate: true };
