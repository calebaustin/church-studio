// cs-vision: looks at pictures with Apple's Vision framework, on this Mac (no AI helper or internet needed).
//   cs-vision <image>...   prints one JSON line per image: { file, labels: [[name, confidence]], faces, textChars }
// Labels are what the picture shows (for searchable tags); faces and text tell a full-screen sermon slide
// (text, no person) from a shot of the preacher.
import Foundation
import Vision

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

for path in CommandLine.arguments.dropFirst() {
  let result = analyze(path)
  if let data = try? JSONSerialization.data(withJSONObject: result), let line = String(data: data, encoding: .utf8) {
    print(line)
    fflush(stdout)
  }
}
