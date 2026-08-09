import UserNotifications

/// Attaches the Pip mascot still to an incoming push notification.
///
/// Why this exists: a push payload cannot carry an image (APNs caps it near 4KB),
/// so the backend sends a URL and iOS shows plain text unless something fetches
/// that URL. iOS will not do it on its own. This extension is woken by
/// `mutable-content: 1` — sent by the backend as `mutableContent: true` — fetches
/// the PNG, and hands the modified notification back to the system.
///
/// The whole thing is best-effort by design. Every failure path delivers the
/// original text notification: the artwork is decoration, never the message.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttemptContent: UNMutableNotificationContent?
  private var downloadTask: URLSessionDownloadTask?

  /// iOS allows roughly 30 seconds before it kills the extension. Time out well
  /// inside that so a slow network degrades to text rather than to nothing.
  private static let downloadTimeout: TimeInterval = 12

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    let mutableContent = request.content.mutableCopy() as? UNMutableNotificationContent
    self.bestAttemptContent = mutableContent

    guard
      let content = mutableContent,
      let imageURL = Self.imageURL(from: request.content.userInfo)
    else {
      contentHandler(request.content)
      return
    }

    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = Self.downloadTimeout
    configuration.timeoutIntervalForResource = Self.downloadTimeout

    downloadTask = URLSession(configuration: configuration)
      .downloadTask(with: imageURL) { [weak self] location, _, _ in
        guard let self else { return }
        defer { self.deliver() }

        guard let location else { return }
        // UNNotificationAttachment infers the media type from the file
        // extension, and URLSession's temp file has none — so the download must
        // be moved to a path that ends in .png before it can be attached.
        let destination = FileManager.default.temporaryDirectory
          .appendingPathComponent(UUID().uuidString)
          .appendingPathExtension(imageURL.pathExtension.isEmpty ? "png" : imageURL.pathExtension)

        do {
          try FileManager.default.moveItem(at: location, to: destination)
          let attachment = try UNNotificationAttachment(identifier: "pip", url: destination, options: nil)
          content.attachments = [attachment]
        } catch {
          // Leave content.attachments empty; deliver() still sends the text.
          try? FileManager.default.removeItem(at: destination)
        }
      }

    downloadTask?.resume()
  }

  /// Called when iOS is about to kill the extension. Deliver whatever we have.
  override func serviceExtensionTimeWillExpire() {
    downloadTask?.cancel()
    deliver()
  }

  /// Hands the notification back exactly once — `serviceExtensionTimeWillExpire`
  /// can race the download callback, and calling the handler twice is a crash.
  private func deliver() {
    guard let handler = contentHandler, let content = bestAttemptContent else { return }
    contentHandler = nil
    bestAttemptContent = nil
    handler(content)
  }

  /// Finds the image URL in the push payload.
  ///
  /// The backend puts it at `data.pipImage`, which Expo nests under the `body`
  /// key of `userInfo`. The other lookups are fallbacks: how Expo maps its
  /// `richContent.image` field into the APNs payload is undocumented, so this
  /// deliberately does not depend on that shape — but it will use it if present.
  private static func imageURL(from userInfo: [AnyHashable: Any]) -> URL? {
    let containers: [[AnyHashable: Any]] = [
      userInfo["body"] as? [AnyHashable: Any],
      userInfo,
    ].compactMap { $0 }

    for container in containers {
      if let string = container["pipImage"] as? String, let url = URL(string: string) {
        return url
      }
      if let rich = container["richContent"] as? [AnyHashable: Any],
         let string = rich["image"] as? String,
         let url = URL(string: string) {
        return url
      }
    }

    return nil
  }
}
