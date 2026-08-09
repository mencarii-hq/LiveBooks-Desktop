/**
 * Test stub for src/errorHandling.ts, which is renderer-only at module
 * scope (router, initFyo). Node specs only need handleErrorWithDialog to
 * surface the error.
 */
module.exports = {
  handleErrorWithDialog: async (error) => {
    throw error;
  },
  handleError: async () => {},
};
