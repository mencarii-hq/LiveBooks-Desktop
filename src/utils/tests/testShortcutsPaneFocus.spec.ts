import test from 'tape';
import { reactive } from 'vue';
import type { Keys } from 'utils/types';
import { MAIN_PANE_ID } from '../deskPanes';
import { setShortcutOwnerPaneId } from '../paneNav';
import { Shortcuts } from '../shortcuts';

function makeKeys(): Keys {
  return reactive({
    pressed: new Set<string>(),
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
    repeat: false,
  });
}

test('Shortcuts: child pane chords do not fire when main is focused', (t) => {
  const shortcuts = new Shortcuts(makeKeys());
  let mainHits = 0;
  let paneHits = 0;

  shortcuts.set('main-ctx', ['KeyS'], () => {
    mainHits += 1;
  });

  setShortcutOwnerPaneId('pane-a');
  shortcuts.set('pane-ctx', ['KeyS'], () => {
    paneHits += 1;
  });
  setShortcutOwnerPaneId(null);

  shortcuts.setFocusedPaneId(MAIN_PANE_ID);
  shortcuts.triggerKey('KeyS');
  t.equal(mainHits, 1);
  t.equal(paneHits, 0);

  shortcuts.setFocusedPaneId('pane-a');
  shortcuts.triggerKey('KeyS');
  t.equal(mainHits, 1);
  t.equal(paneHits, 1);
  t.end();
});
