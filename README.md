# ScoreLens for phones

[Open ScoreLens](https://kyoshi002.github.io/scorelens-phone/). On iPhone use Safari’s **Share → Add to Home Screen**. On Android use Chrome’s **Install app** or **Add to Home screen**. Open the Home Screen app while connected to Wi-Fi, choose **Download offline scanner**, and wait for **Scanner ready offline**.

Use **Open camera** or **Upload score** to read printed piano music, including multipage PDFs. Scans run on the device. Review the transcription against the printed music before practicing. Bookmark a piece to keep it in this browser’s library. Browser storage belongs to this site and device. Removing its data also removes its scanner and saved pieces.

The published site contains the browser application and its recognition files. It has no account system, upload endpoint, or PC scanner dependency. The models and software download from GitHub Pages during setup. Speed, recognition accuracy and available memory depend on the device and the score. Crop photos to keep both piano staves clear.

Choose **Learn to read** to see labeled whole notes on the treble and bass staves. Tap a note to hear it and see its piano key, or open **Rhythm & notation** to hear and tap written rhythms. Lessons work without downloading the scanner.

## Source and licenses

The application is available under the GNU Affero General Public License version 3. The public repository includes its corresponding source, including the worker and the score interpretation code. Third-party components keep their own licenses. Vendor source references, notices and build instructions accompany the distribution. Open `source/scorelens-source.zip` for the application build inputs and packaging tool.

To rebuild, extract that ZIP and run these commands from the extracted directory with Python 3.11 or newer and an internet connection. The preparation scripts verify pinned dependency downloads. The final command writes the static site to a fresh directory.

```sh
python tools/prepare_phone_engine.py
python tools/prepare_pdf_assets.py
python tools/stage_score_converter.py
python tools/build_phone.py dist
```
