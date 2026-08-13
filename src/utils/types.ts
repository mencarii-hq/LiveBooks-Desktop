import type { Doc } from 'fyo/model/doc';
import type { Action } from 'fyo/model/types';
import type { ModelNameEnum } from 'models/types';
import type { Field, FieldType } from 'schemas/types';
import type { QueryFilter } from 'utils/db/types';
import type { Ref } from 'vue';
import type { toastDurationMap } from './ui';

export type DocRef<D extends Doc = Doc> = Ref<D | null>;

export type ToastType = 'info' | 'warning' | 'error' | 'success';
export type ToastDuration = keyof typeof toastDurationMap;

export interface MessageDialogButton {
  label: string;
  action: () => Promise<unknown> | unknown;
}

export interface MessageDialogOptions {
  message: string;
  detail?: string;
  buttons?: MessageDialogButton[];
}

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: ToastDuration;
  action?: () => void;
  actionText?: string;
}

export type WindowAction = 'close' | 'minimize' | 'maximize' | 'unmaximize';
export type SettingsTab =
  | ModelNameEnum.AccountingSettings
  | ModelNameEnum.Defaults
  | ModelNameEnum.PrintSettings
  | ModelNameEnum.SystemSettings
  | 'CheckPrinting';

export interface QuickEditOptions {
  doc: Doc;
  hideFields?: string[];
  showFields?: string[];
  defaults?: Record<string, unknown>;
}

export type SidebarConfig = SidebarRoot[];
export interface SidebarRoot {
  label: string;
  name: string;
  route: string;
  icon: string;
  iconSize?: string;
  iconHeight?: number;
  hidden?: () => boolean;
  items?: SidebarItem[];
  filters?: QueryFilter;
}

export interface SidebarItem {
  label: string;
  name: string;
  route: string;
  schemaName?: string;
  hidden?: () => boolean;
  filters?: QueryFilter;
}

export interface ExportField {
  fieldname: string;
  fieldtype: FieldType;
  label: string;
  export: boolean;
}

export interface ExportTableField {
  fieldname: string;
  label: string;
  target: string;
  fields: ExportField[];
}

export type ActionGroup = {
  group: string;
  label: string;
  type: string;
  actions: Action[];
};

export type DropdownItem = {
  label: string;
  value?: string;
  action?: () => unknown;
  group?: string;
  component?: { template: string };
  isGroup?: boolean;
};

export type UIGroupedFields = Map<string, Map<string, Field[]>>;
export type ExportFormat = 'csv' | 'json';
export type PeriodKey = 'This Year' | 'This Quarter' | 'This Month' | 'YTD';

export type PrintValues = {
  print: Record<string, unknown>;
  doc: Record<string, unknown>;
};

export interface DialogOptions {
  title: string;
  type?: ToastType;
  detail?: string | string[];
  /** Optional warning line (e.g. balance note), shown in red below `detail`. */
  detailEmphasis?: string;
  /** If set, user must type this exact phrase to enable the primary button. */
  confirmText?: string;
  /**
   * If set, shows a free-text input; the trimmed value is passed to
   * button actions. Primary button is disabled while the input is empty.
   */
  input?: DialogInputOptions;
  buttons?: DialogButton[];
}

export interface DialogInputOptions {
  placeholder?: string;
  value?: string;
}

export type DialogButton = {
  label: string;
  action: (inputValue?: string) => unknown;
  isPrimary?: boolean;
  isEscape?: boolean;
};

export type GetStartedConfigItem = {
  label: string;
  optional?: boolean;
  items: {
    key: string;
    label: string;
    icon: string;
    description: string;
    fieldname?: string;
    documentation?: string;
    action?: () => void;
    actionLabel?: string;
    viewLabel?: string;
    completedKey?: 'cloudSignedIn';
  }[];
};
