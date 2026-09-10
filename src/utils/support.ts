export const SUPPORT_EMAIL = 'ben.cheng@mencarii.com';

export function openSupportEmail(): void {
  ipc.openLink(`mailto:${SUPPORT_EMAIL}`);
}
