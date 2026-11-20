// cs-image-playground: opens Apple's Image Playground window (Apple Intelligence, macOS 15.1+) with a prompt
// and, optionally, a starting picture. When the person picks an image, prints {"file": "..."}; if they close
// it, prints {"cancel": true}. Apple only creates images for an app on screen, so this is a small app with
// its own window rather than a background call.
//   stdin: {"prompt":"...", "source":"/path/to/picture.png", "title":"Church Studio"}
import AppKit
import ImagePlayground

struct Req: Decodable { let prompt: String?; let source: String?; let title: String? }
func out(_ o: [String: Any]) {
  let d = try! JSONSerialization.data(withJSONObject: o)
  FileHandle.standardOutput.write(d); FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
let req = (try? JSONDecoder().decode(Req.self, from: FileHandle.standardInput.readDataToEndOfFile())) ?? Req(prompt: nil, source: nil, title: nil)

final class D: NSObject, NSApplicationDelegate, NSWindowDelegate, ImagePlaygroundViewController.Delegate {
  var win: NSWindow!
  func applicationDidFinishLaunching(_ n: Notification) {
    guard ImagePlaygroundViewController.isAvailable else { out(["error": "Image Playground isn't available on this Mac. Turn on Apple Intelligence in System Settings."]); exit(2) }
    let vc = ImagePlaygroundViewController()
    vc.delegate = self
    if let p = req.prompt, !p.isEmpty { vc.concepts = [.text(p)] }
    if let s = req.source, let img = NSImage(contentsOfFile: s) { vc.sourceImage = img }
    win = NSWindow(contentViewController: vc)
    win.title = req.title ?? "Image Playground"
    win.delegate = self
    win.center(); win.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }
  func imagePlaygroundViewController(_ c: ImagePlaygroundViewController, didCreateImageAt url: URL) { out(["file": url.path]); exit(0) }
  func imagePlaygroundViewControllerDidCancel(_ c: ImagePlaygroundViewController) { out(["cancel": true]); exit(0) }
  func windowWillClose(_ n: Notification) { out(["cancel": true]); exit(0) }
}
let app = NSApplication.shared
let d = D(); app.delegate = d
app.setActivationPolicy(.regular)
app.run()
