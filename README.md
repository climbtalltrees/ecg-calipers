# ECG Calipers

Installable web app (PWA) for measuring real ECGs with calipers you place yourself. Runs on iPhone, Android and laptops, and works offline.

**Scope and safety line:** this is a measurement aid. The user places every point. The app does no automatic wave detection and no rhythm interpretation. Any normal-range or threshold flag must cite the guideline it came from, with the value taken from that document.

**Privacy:** ECG images stay in the browser on the device. Nothing is uploaded.

## Version 1 (Measure mode)
- [x] Load from camera, image or PDF (first page)
- [x] Two-axis grid calibration, paper speed and gain settings
- [x] Time calipers: R-R (with multi-beat average), PR, QRS, QT, P wave, march out
- [x] Amplitude calipers: P, R, S; R:S ratio
- [x] QTc by Bazett and Fridericia
- [ ] Perspective correction for angled photos
- [x] Axis from leads I and aVF (II optional)
- [x] STE tool: user-tapped baseline and J point per lead, mm line, ST deviation, ST:QRS ratio
- [x] Cited adult normal-range and ST-threshold flags (AHA/ACC/HRS; Universal Definition of MI)
- [ ] Export with crop-out-identifiers prompt

## Develop
```
npm install
npm run dev
npm test
```
Deploys on Netlify (`netlify.toml`).
