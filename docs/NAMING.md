# Name and icon

The app is **Church Studio**. Its mark is "CS" in Caveat (SIL Open Font License), white on green.

- App icon: `assets/build/icon.png` (1024 px). Regenerate it from the Caveat font if the mark changes.
- In the app, the menu shows the church's own logo and the words Church Studio. The app mark only appears in
  the welcome window.
- The Dock always shows the Church Studio app icon. (A church-logo Dock icon was tried and removed in 0.13.0:
  it confused more than it helped.)

To rename the app, change `APP_NAME` in `src/daemon/tools.js`, `productName` in `package.json`, and the brand
text in `src/ui/App.jsx`.
