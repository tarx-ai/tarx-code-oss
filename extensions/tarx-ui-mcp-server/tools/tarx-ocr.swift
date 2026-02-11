#!/usr/bin/env swift
/**
 * TARX OCR - macOS Vision framework text recognition
 *
 * Usage: tarx-ocr <image-path>
 * Output: JSON array of {text, confidence, x, y, width, height}
 *
 * Compile: swiftc -O -o tools/tarx-ocr tools/tarx-ocr.swift -framework Vision -framework AppKit
 */

import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    let error = ["error": "Usage: tarx-ocr <image-path>"]
    if let data = try? JSONSerialization.data(withJSONObject: error),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

let imagePath = CommandLine.arguments[1]

guard FileManager.default.fileExists(atPath: imagePath) else {
    let error = ["error": "File not found: \(imagePath)"]
    if let data = try? JSONSerialization.data(withJSONObject: error),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    let error = ["error": "Failed to load image: \(imagePath)"]
    if let data = try? JSONSerialization.data(withJSONObject: error),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

let imageWidth = Double(cgImage.width)
let imageHeight = Double(cgImage.height)

let semaphore = DispatchSemaphore(value: 0)
var results: [[String: Any]] = []
var recognitionError: String? = nil

let request = VNRecognizeTextRequest { request, error in
    if let error = error {
        recognitionError = error.localizedDescription
        semaphore.signal()
        return
    }

    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        recognitionError = "No text observations found"
        semaphore.signal()
        return
    }

    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }

        let boundingBox = observation.boundingBox
        let x = boundingBox.origin.x * imageWidth
        let y = (1.0 - boundingBox.origin.y - boundingBox.height) * imageHeight
        let width = boundingBox.width * imageWidth
        let height = boundingBox.height * imageHeight

        results.append([
            "text": candidate.string,
            "confidence": candidate.confidence,
            "x": Int(x),
            "y": Int(y),
            "width": Int(width),
            "height": Int(height)
        ])
    }

    semaphore.signal()
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    recognitionError = error.localizedDescription
    semaphore.signal()
}

semaphore.wait()

if let error = recognitionError {
    let errorObj = ["error": error]
    if let data = try? JSONSerialization.data(withJSONObject: errorObj),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

let output: [String: Any] = [
    "success": true,
    "text": results.map { $0["text"] as? String ?? "" }.joined(separator: "\n"),
    "regions": results,
    "imageWidth": Int(imageWidth),
    "imageHeight": Int(imageHeight)
]

if let data = try? JSONSerialization.data(withJSONObject: output),
   let str = String(data: data, encoding: .utf8) {
    print(str)
}
