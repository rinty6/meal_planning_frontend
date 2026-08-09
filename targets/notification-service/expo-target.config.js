/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'notification-service',
  name: 'PipNotificationService',

  // Appended to the main app's bundle id → com.goodhealthmate.app.PipNotificationService.
  // Apple requires an extension's bundle id to be prefixed by its host app's.
  bundleIdentifier: '.PipNotificationService',

  // The plugin defaults to 18.0, which would refuse to install the extension on
  // anything older. Match Expo SDK 54's own iOS floor instead so the extension
  // is available to every device that can already run the app.
  deploymentTarget: '15.1',

  frameworks: ['UserNotifications'],
};
