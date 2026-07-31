type DeleteAccountHandler = (name: string) => void | Promise<void>;

let deleteAccountHandler: DeleteAccountHandler | null = null;

export function registerChartOfAccountsDelete(handler: DeleteAccountHandler) {
  deleteAccountHandler = handler;
}

export function unregisterChartOfAccountsDelete() {
  deleteAccountHandler = null;
}

export async function deleteChartOfAccountsAccount(name: string) {
  if (!deleteAccountHandler) {
    return;
  }
  await deleteAccountHandler(name);
}

export function hasChartOfAccountsDelete(): boolean {
  return !!deleteAccountHandler;
}
