# 📄 pdfSuite

> **A high-performance, privacy-first PDF productivity and transformation workspace running 100% client-side.**

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)
![HTML5](https://img.shields.io/badge/HTML5-Canvas%20%26%20Drag--Drop-orange.svg)
![PDF-Lib](https://img.shields.io/badge/Engine-pdf--lib%20%26%20pdf.js-red.svg)
![Privacy](https://img.shields.io/badge/Privacy-Zero%20Server%20Uploads-success.svg)

---

## 🌟 Executive Summary

**pdfSuite** is a complete, browser-native PDF management platform designed to replace heavy desktop utilities and untrusted third-party online converters. 

Unlike commercial cloud converters that upload confidential documents to remote servers, **pdfSuite processes every byte inside the browser memory**. Documents, signatures, and images never leave the user's machine, guaranteeing strict GDPR, HIPAA, and corporate data privacy compliance while incurring zero cloud hosting and storage costs.

---

## 🛠️ Feature Matrix (6-in-1 Suite)

| Feature | File | Key Technical Capabilities |
| :--- | :--- | :--- |
| **1. Merge PDFs** | [`pdf4/merge.html`](pdf4/merge.html) | Concatenates multiple PDF documents, preserves page geometry, dynamic list ordering. |
| **2. Transform PDFs** | [`pdf4/transform.html`](pdf4/transform.html) | Page rotation (90°/180°/270°), page reordering, extraction, and deletion. |
| **3. Convert PDFs** | [`pdf4/convert.html`](pdf4/convert.html) | PDF page rendering to high-res raster images (PNG/JPG), structured text extraction. |
| **4. Sign & Stamp** | [`pdf4/sign.html`](pdf4/sign.html) | Multi-modal signature input (freehand draw, typed cursive fonts, uploaded image), drag placement. |
| **5. Watermark & Numbers** | [`pdf4/watermark.html`](pdf4/watermark.html) | Diagonal 45° and horizontal text stamping, live Canvas overlay preview, dynamic multi-page numbering. |
| **6. Image to PDF** | [`pdf4/img2pdf.html`](pdf4/img2pdf.html) | Multi-format image conversion (JPG, PNG, WebP), thumbnail reordering, A4/Letter containment math. |
| **Advanced: Semantic Search** | [`pdf4/semantic/`](pdf4/semantic/) | Tokenization and vector semantic matching interface with authentication guard. |

---

## 🏗️ Architecture & Technical Highlights

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│                                                             │
│   ┌─────────────────┐       ┌───────────────────────────┐   │
│   │  User Interface │       │    HTML5 File API         │   │
│   │  (Grid / Cards) │       │ (Drag & Drop / FileReader)│   │
│   └────────┬────────┘       └─────────────┬─────────────┘   │
│            │                              │                 │
│            ▼                              ▼                 │
│   ┌─────────────────────────────────────────────────────┐   │
│   │            Binary Buffer Processing Pipeline         │   │
│   │           (ArrayBuffer -> Uint8Array -> Blob)       │   │
│   └────────┬──────────────────────────────┬─────────────┘   │
│            │                              │                 │
│            ▼                              ▼                 │
│   ┌─────────────────┐       ┌───────────────────────────┐   │
│   │  pdf.js Engine  │       │      pdf-lib Engine       │   │
│   │ (Page Preview & │       │ (Page Stitching, Rotation,│   │
│   │ Canvas Rendering│       │ Text Stamping, Embedding) │   │
│   └─────────────────┘       └─────────────┬─────────────┘   │
│                                           │                 │
│                                           ▼                 │
│                             ┌───────────────────────────┐   │
│                             │   Client-Side Download    │   │
│                             │  (URL.createObjectURL)   │   │
│                             └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1. In-Memory Binary Pipeline
File uploads are read using the `FileReader` API into standard `ArrayBuffer` structures. Mutations (merging, splitting, watermarking, signing) are performed directly on byte buffers through `pdf-lib` without any serialization penalties or server roundtrips. Final downloads are emitted directly from browser RAM via ephemeral `Blob` URLs (`URL.createObjectURL`).

### 2. Dual Coordinate Geometry
* **HTML5 Canvas Coordinates**: Origin `(0, 0)` is anchored at the **Top-Left** corner, with `Y` increasing downward.
* **PDF Specification Coordinates**: Origin `(0, 0)` is anchored at the **Bottom-Left** corner (Cartesian), with `Y` increasing upward.
* The application implements coordinate translation functions to map user canvas interactions (signature drawing, watermark positioning) directly into accurate PDF Cartesian coordinates.

### 3. Aspect Ratio Containment Algorithm
In the **Image to PDF** tool, images of arbitrary aspect ratios are dynamically scaled to fit standardized paper dimensions (A4: 595.28 × 841.89 pt, US Letter: 612 × 792 pt):
$$\text{scale} = \min\left(\frac{W_{\text{printable}}}{W_{\text{img}}},\, \frac{H_{\text{printable}}}{H_{\text{img}}}\right)$$
$$\text{offset}_x = M + \frac{W_{\text{printable}} - (W_{\text{img}} \times \text{scale})}{2}$$
$$\text{offset}_y = M + \frac{H_{\text{printable}} - (H_{\text{img}} \times \text{scale})}{2}$$
This guarantees that images are never distorted or clipped regardless of orientation.

---

## 🚀 Getting Started

### Prerequisites
* Any modern web browser (Chrome, Edge, Firefox, Safari).
* Python 3 or Node.js (for running a local HTTP static server).

### Running Locally

Clone the repository and serve the `pdf4` directory:

```bash
# Option 1: Using Python
python -m http.server 8080 --directory pdf4

# Option 2: Using Node.js (npx)
npx http-server pdf4 -p 8080 -c-1
```

Open your browser and navigate to:
```
http://localhost:8080
```

---

## 🎯 Interview Showcase: Key Discussion Points

If presenting this project in an engineering interview, emphasize:

1. **Why Client-Side Over Microservices?**
   * *Privacy*: Sensitive documents (medical, financial, legal) never traverse third-party servers.
   * *Cost & Scale*: No cloud compute or storage infrastructure is required; processing scales infinitely across client CPUs.
2. **Memory Efficiency**:
   * Slicing `ArrayBuffer` instances to prevent buffer detachment when passing data between the main thread and `pdf.js` worker threads.
3. **Graceful Fallbacks**:
   * The Image-to-PDF tool inspects MIME types: native JPEG/PNG buffers are embedded directly, while WebP and SVG files are rasterized through a canvas bridge before embedding.

---

## 📜 License
Distributed under the MIT License. Open for educational and personal use.
