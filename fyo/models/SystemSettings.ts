import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { ChangeArg, ListsMap, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { t } from 'fyo/utils/translation';
import { SelectOption } from 'schemas/types';
import { getCountryInfo } from 'utils/misc';
import { invalidateAndEmitRegionalLabelsChanged } from 'utils/regional';
import { Verb } from 'fyo/telemetry/types';

export default class SystemSettings extends Doc {
  _countryCodeBeforeSync?: string;
  _hideHomeMapBeforeSync?: boolean;
  dateFormat?: string;
  locale?: string;
  displayPrecision?: number;
  internalPrecision?: number;
  hideGetStarted?: boolean;
  hideHomeWorkflowMap?: boolean;
  desktopTheme?: 'classic' | 'modern';
  countryCode?: string;
  currency?: string;
  version?: string;
  instanceId?: string;
  darkMode?: boolean;
  displayTermsAndConditions?: boolean;

  validations: ValidationMap = {
    displayPrecision(value: DocValue) {
      if ((value as number) >= 0 && (value as number) <= 9) {
        return;
      }

      throw new ValidationError(
        t`Display Precision should have a value between 0 and 9.`
      );
    },
  };

  async change({ changed }: ChangeArg) {
    if (changed !== 'desktopTheme') {
      return;
    }
    await this.set('hideHomeWorkflowMap', this.desktopTheme === 'modern');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async beforeSync() {
    this._countryCodeBeforeSync = this.countryCode;
    this._hideHomeMapBeforeSync = !!this.hideHomeWorkflowMap;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async afterSync() {
    const before = (this._countryCodeBeforeSync ?? '').trim().toLowerCase();
    const after = (this.countryCode ?? '').trim().toLowerCase();
    if (before !== after) {
      invalidateAndEmitRegionalLabelsChanged();
    }
    if (!!this.hideHomeWorkflowMap !== !!this._hideHomeMapBeforeSync) {
      this.fyo.telemetry.log(Verb.Completed, 'home-map-opt-out', {
        optedOut: !!this.hideHomeWorkflowMap,
      });
      this.fyo.config.set('homeMapOptOut', !!this.hideHomeWorkflowMap);
    }
  }

  static lists: ListsMap = {
    locale() {
      const countryInfo = getCountryInfo();
      return Object.keys(countryInfo)
        .filter((c) => !!countryInfo[c]?.locale)
        .map(
          (c) =>
            ({
              value: countryInfo[c]?.locale,
              label: `${c} (${countryInfo[c]?.locale ?? t`Not Found`})`,
            } as SelectOption)
        );
    },
    currency() {
      const countryInfo = getCountryInfo();
      const currencies = Object.values(countryInfo)
        .map((ci) => ci?.currency as string)
        .filter(Boolean);
      return [...new Set(currencies)];
    },
  };
}
