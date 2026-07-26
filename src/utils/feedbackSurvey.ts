import { Fyo, t } from 'fyo';
import { livebooksCloudFeedbackUrl } from 'src/utils/livebooksCloudUrls';
import { showDialog } from 'src/utils/interactive';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

/** Record first company-create wall clock (independent of telemetry). */
export function ensureFirstLaunchAt(fyo: Fyo): void {
  if (fyo.config.get('firstLaunchAt')) {
    return;
  }
  fyo.config.set('firstLaunchAt', new Date().toISOString());
}

export function openFeedbackSurvey(fyo?: Fyo): void {
  if (fyo) {
    fyo.config.set('feedbackSurveyDismissed', true);
  }
  ipc.openLink(livebooksCloudFeedbackUrl());
}

/**
 * One-time gentle prompt after 48h from firstLaunchAt.
 * Shows on next launch after elapsed time; dismiss forever.
 */
export async function maybePromptFeedbackSurvey(fyo: Fyo): Promise<void> {
  if (fyo.config.get('feedbackSurveyDismissed')) {
    return;
  }

  const firstLaunchAt = fyo.config.get('firstLaunchAt');
  if (typeof firstLaunchAt !== 'string' || !firstLaunchAt) {
    return;
  }

  const started = Date.parse(firstLaunchAt);
  if (Number.isNaN(started) || Date.now() - started < FORTY_EIGHT_HOURS_MS) {
    return;
  }

  const open = await showDialog({
    title: t`Give feedback`,
    detail: t`Got two minutes? Tell us what’s broken and whether you’d use encrypted cloud backup.`,
    type: 'info',
    buttons: [
      {
        label: t`Give feedback`,
        action: () => true,
        isPrimary: true,
      },
      {
        label: t`Not now`,
        action: () => false,
        isEscape: true,
      },
    ],
  });

  fyo.config.set('feedbackSurveyDismissed', true);
  if (open) {
    openFeedbackSurvey();
  }
}
