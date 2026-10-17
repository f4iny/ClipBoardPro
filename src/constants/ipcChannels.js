// Canonical IPC channel constants registry (LOW-01)
export const IPC_CHANNELS = {
  // Window controls
  WINDOW_MINIMIZE: 'window-minimize',
  WINDOW_MAXIMIZE: 'window-maximize',
  WINDOW_CLOSE: 'window-close',
  WINDOW_IS_MAXIMIZED: 'window-is-maximized',
  WINDOW_MAXIMIZED_EVENT: 'window-maximized',

  // System & Shell
  TRIM_MEMORY: 'trim-memory',
  OPEN_EXTERNAL: 'open-external',

  // Native Clipboard monitoring
  START_MONITORING: 'start-clipboard-monitoring',
  STOP_MONITORING: 'stop-clipboard-monitoring',
  GET_TEXT: 'get-clipboard-text',
  GET_IMAGE: 'get-clipboard-image',
  SET_TEXT: 'set-clipboard-text',
  SET_IMAGE: 'set-clipboard-image',
  CLIPBOARD_CHANGED: 'clipboard-changed',
  CLEAR_ALL_SHORTCUT: 'clear-all-shortcut',

  // Media storage lifecycle (ADR-0002)
  MEDIA_DELETE: 'media:delete',
  MEDIA_CLEAR_ALL: 'media:clear-all',
  MEDIA_RECONCILE: 'media:reconcile',

  // Preferences & App Lifecycle
  SET_CLOSE_BEHAVIOR: 'set-close-behavior',
  GET_CLOSE_BEHAVIOR: 'get-close-behavior',
  SET_START_MINIMIZED: 'set-start-minimized',
  GET_START_MINIMIZED: 'get-start-minimized',
  SET_AUTO_START: 'set-auto-start',
  GET_AUTO_START: 'get-auto-start',
  GET_AUTO_START_STATUS: 'get-auto-start-status',
  UPDATE_HOTKEYS: 'update-hotkeys',
  GET_HOTKEYS: 'get-hotkeys',
  SHOW_WINDOW: 'show-window',
  HIDE_WINDOW: 'hide-window',
  QUIT_APP: 'quit-app',
};

export default IPC_CHANNELS;
