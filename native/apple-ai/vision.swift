// cs-vision: looks at pictures with Apple's Vision framework, on this Mac (no AI helper or internet needed).
//   cs-vision <image>...   prints one JSON line per image: { file, labels: [[name, confidence]], faces, textChars }
// Labels are what the picture shows (for searchable tags); faces and text tell a full-screen sermon slide
// (text, no person) from a shot of the preacher.
import Foundation
import Vision
import CoreImage

func analyze(_ path: String) -> [String: Any] {
  let url = URL(fileURLWithPath: path)
  let handler = VNImageRequestHandler(url: url, options: [:])
  let classify = VNClassifyImageRequest()
  let faces = VNDetectFaceRectanglesRequest()
  let text = VNRecognizeTextRequest()
  text.recognitionLevel = .fast
  text.usesLanguageCorrection = false
  var out: [String: Any] = ["file": path]
  do {
    try handler.perform([classify, faces, text])
    let labels = (classify.results ?? [])
      .filter { $0.confidence > 0.25 }
      .prefix(10)
      .map { [$0.identifier, Double(round($0.confidence * 100) / 100)] as [Any] }
    out["labels"] = Array(labels)
    out["faces"] = faces.results?.count ?? 0
    out["textChars"] = (text.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ").count
  } catch {
    out["error"] = error.localizedDescription
  }
  return out
}

// ---------------------------------------------------------------- subjects (macOS 14 and later)
//   cs-vision --subjects <image> <out-dir>          one mask PNG per subject (white = subject), plus a JSON line:
//                                                   { subjects: [{ index, file, box: [x, y, w, h] }], width, height }
//   cs-vision --cutout <image> <out.png> <1,2,...> [--crop]
//                                                   the picked subjects on a see-through background
func emit(_ obj: [String: Any]) {
  if let d = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: d, encoding: .utf8) { print(s); fflush(stdout) }
}

func writePNG(_ image: CIImage, to path: String, gray: Bool) throws {
  let ctx = CIContext()
  let space = gray ? CGColorSpaceCreateDeviceGray() : CGColorSpace(name: CGColorSpace.sRGB)!
  try ctx.writePNGRepresentation(of: image, to: URL(fileURLWithPath: path), format: gray ? .L8 : .RGBA8, colorSpace: space)
}

@available(macOS 14.0, *)
func subjects(_ input: String, _ outDir: String) throws {
  let handler = VNImageRequestHandler(url: URL(fileURLWithPath: input), options: [:])
  let req = VNGenerateForegroundInstanceMaskRequest()
  try handler.perform([req])
  guard let obs = req.results?.first else { emit(["subjects": [], "width": 0, "height": 0]); return }
  var list: [[String: Any]] = []
  var w = 0, h = 0
  for idx in obs.allInstances {
    let buf = try obs.generateScaledMaskForImage(forInstances: IndexSet(integer: idx), from: handler)
    let mask = CIImage(cvPixelBuffer: buf)
    w = Int(mask.extent.width); h = Int(mask.extent.height)
    let file = (outDir as NSString).appendingPathComponent("subject-\(idx).png")
    try writePNG(mask, to: file, gray: true)
    // Where the subject is (0..1 from the top left), for the picker's click targets.
    var box: [Double] = [0, 0, 1, 1]
    let small = try obs.generateMask(forInstances: IndexSet(integer: idx))
    CVPixelBufferLockBaseAddress(small, .readOnly)
    let mw = CVPixelBufferGetWidth(small), mh = CVPixelBufferGetHeight(small), row = CVPixelBufferGetBytesPerRow(small)
    if let base = CVPixelBufferGetBaseAddress(small) {
      var x0 = mw, y0 = mh, x1 = 0, y1 = 0
      for y in 0..<mh {
        let line = base.advanced(by: y * row).assumingMemoryBound(to: Float32.self)
        for x in 0..<mw where line[x] > 0.5 { x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y) }
      }
      if x1 >= x0 && y1 >= y0 { box = [Double(x0) / Double(mw), Double(y0) / Double(mh), Double(x1 - x0 + 1) / Double(mw), Double(y1 - y0 + 1) / Double(mh)] }
    }
    CVPixelBufferUnlockBaseAddress(small, .readOnly)
    list.append(["index": idx, "file": file, "box": box])
  }
  emit(["subjects": list, "width": w, "height": h])
}

@available(macOS 14.0, *)
func cutout(_ input: String, _ output: String, _ picks: [Int], crop: Bool) throws {
  let handler = VNImageRequestHandler(url: URL(fileURLWithPath: input), options: [:])
  let req = VNGenerateForegroundInstanceMaskRequest()
  try handler.perform([req])
  guard let obs = req.results?.first else { emit(["error": "No subject found in this picture."]); return }
  let chosen = picks.isEmpty ? obs.allInstances : IndexSet(picks.filter { obs.allInstances.contains($0) })
  if chosen.isEmpty { emit(["error": "Those subjects aren't in this picture."]); return }
  let buf = try obs.generateMaskedImage(ofInstances: chosen, from: handler, croppedToInstancesExtent: crop)
  let img = CIImage(cvPixelBuffer: buf)
  try writePNG(img, to: output, gray: false)
  emit(["file": output, "width": Int(img.extent.width), "height": Int(img.extent.height)])
}

let args = Array(CommandLine.arguments.dropFirst())
if args.first == "--subjects" || args.first == "--cutout" {
  guard #available(macOS 14.0, *) else { emit(["error": "Cutting out subjects needs macOS 14 or later."]); exit(0) }
  do {
    if args.first == "--subjects", args.count >= 3 { try subjects(args[1], args[2]) }
    else if args.first == "--cutout", args.count >= 3 {
      let picks = args.count >= 4 && args[3] != "--crop" ? args[3].split(separator: ",").compactMap { Int($0) } : []
      try cutout(args[1], args[2], picks, crop: args.contains("--crop"))
    } else { emit(["error": "Missing arguments."]) }
  } catch { emit(["error": error.localizedDescription]) }
  exit(0)
}

for path in CommandLine.arguments.dropFirst() {
  let result = analyze(path)
  if let data = try? JSONSerialization.data(withJSONObject: result), let line = String(data: data, encoding: .utf8) {
    print(line)
    fflush(stdout)
  }
}
