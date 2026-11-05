/**
 * Dialog events.
 */

import type { BrowsingContext } from 'webdriver-bidi-protocol';
import type { BiDiFacade } from '../bidi.js';
import { logDebug } from '../../utils/logger.js';

export class DialogEvents {
  private dialogs = new Map<
    BrowsingContext.BrowsingContext,
    BrowsingContext.UserPromptOpenedParameters
  >();
  private subscribed = false;

  constructor(private bidi: BiDiFacade) {}

  /**
   * Subscribe to BiDi dialog events.
   */
  async subscribe(): Promise<void> {
    if (this.subscribed) {
      return;
    }

    await this.bidi.subscribe([
      'browsingContext.userPromptOpened',
      'browsingContext.userPromptClosed',
    ]);

    this.bidi.on('browsingContext.userPromptOpened', (dialog) => {
      this.dialogs.set(dialog.context, dialog);
    });

    this.bidi.on('browsingContext.userPromptClosed', ({ context }) => {
      this.dialogs.delete(context);
    });

    this.subscribed = true;
    logDebug('Dialog listener ready');
  }

  getDialog(context: BrowsingContext.BrowsingContext) {
    return this.dialogs.get(context);
  }

  async raceAgainstDialogOpened<T>(
    fn: () => Promise<T>,
    dialogOpenedResult: (dialog: BrowsingContext.UserPromptOpenedParameters) => T
  ) {
    let removeListener!: () => void;
    const dialogOpened = new Promise<T>((resolve) => {
      const listener = (dialog: BrowsingContext.UserPromptOpenedParameters) =>
        resolve(dialogOpenedResult(dialog));
      this.bidi.on('browsingContext.userPromptOpened', listener);
      removeListener = () => this.bidi.off('browsingContext.userPromptOpened', listener);
    });
    try {
      const promise = fn();
      void dialogOpened.then(() =>
        promise.catch((error) =>
          logDebug(
            `Tool call errored after its handler returned early due to a dialog opening: ${String(error)}`
          )
        )
      );
      return await Promise.race([promise, dialogOpened]);
    } finally {
      removeListener();
    }
  }
}
