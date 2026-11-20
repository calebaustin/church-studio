// cs-apple-ai: a tiny bridge so Church Studio's engine can use Apple Intelligence (the on-device
// Foundation Models in macOS 26+). Reads one JSON request on stdin, writes the answer to stdout.
//   {"op":"status"}                                   -> {"available":true} or {"available":false,"reason":"..."}
//   {"op":"ask","system":"...","prompt":"...","temperature":0.4,"stream":true}
// With stream, each chunk is a line: {"delta":"..."}; the last line is {"done":true}.
import Foundation
import FoundationModels

struct Req: Decodable { let op: String; let system: String?; let prompt: String?; let temperature: Double?; let stream: Bool?; let maxTokens: Int? }

func out(_ obj: [String: Any]) {
  let d = try! JSONSerialization.data(withJSONObject: obj)
  FileHandle.standardOutput.write(d); FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func reason(_ a: SystemLanguageModel.Availability) -> String? {
  switch a {
  case .available: return nil
  case .unavailable(.deviceNotEligible): return "This Mac can't run Apple Intelligence."
  case .unavailable(.appleIntelligenceNotEnabled): return "Turn on Apple Intelligence in System Settings first."
  case .unavailable(.modelNotReady): return "Apple Intelligence is still getting ready. Try again in a little while."
  default: return "Apple Intelligence isn't available right now."
  }
}

let input = FileHandle.standardInput.readDataToEndOfFile()
guard let req = try? JSONDecoder().decode(Req.self, from: input) else { out(["error": "Bad request"]); exit(1) }
let model = SystemLanguageModel.default
if let r = reason(model.availability) {
  out(req.op == "status" ? ["available": false, "reason": r] : ["error": r]); exit(req.op == "status" ? 0 : 2)
}
if req.op == "status" { out(["available": true]); exit(0) }

let sem = DispatchSemaphore(value: 0)
Task {
  do {
    let session = LanguageModelSession(instructions: req.system ?? "")
    var opts = GenerationOptions(temperature: req.temperature ?? 0.5)
    if let m = req.maxTokens { opts.maximumResponseTokens = m }
    if req.stream == true {
      var sent = ""
      for try await snap in session.streamResponse(to: req.prompt ?? "", options: opts) {
        let full = snap.content
        if full.count > sent.count, full.hasPrefix(sent) { out(["delta": String(full.dropFirst(sent.count))]) } else if full != sent { out(["replace": full]) }
        sent = full
      }
      out(["done": true])
    } else {
      let r = try await session.respond(to: req.prompt ?? "", options: opts)
      out(["text": r.content])
    }
  } catch {
    out(["error": "\(error)"])
  }
  sem.signal()
}
sem.wait()
