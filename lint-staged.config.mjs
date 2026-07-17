/**
 * Skip ESLint for paths ignored by .eslintrc.js (spec files, vite.config.ts,
 * Vue under src/components, and generated locales). Prettier still runs on
 * hand-written sources only — not src/generated (JSON.stringify output).
 */
function isGenerated(f) {
  return f.includes('/src/generated/') || f.includes('\\src\\generated\\');
}

export default {
  '*.{ts,vue}': (filenames) => {
    const sourceFiles = filenames.filter((f) => !isGenerated(f));
    if (!sourceFiles.length) {
      return [];
    }

    const eslintTargets = sourceFiles.filter((f) => {
      if (f.endsWith('.spec.ts') || f.endsWith('vite.config.ts')) {
        return false;
      }
      if (f.endsWith('.vue') && f.includes('/src/components/')) {
        return false;
      }
      return true;
    });
    const cmds = [];
    if (eslintTargets.length > 0) {
      cmds.push(
        `eslint --fix --max-warnings 0 ${eslintTargets
          .map((f) => JSON.stringify(f))
          .join(' ')}`
      );
    }
    cmds.push(
      `prettier --write ${sourceFiles.map((f) => JSON.stringify(f)).join(' ')}`
    );
    return cmds;
  },
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
