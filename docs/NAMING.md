# Name and icon

The app is **Church Studio**. Its mark is "CS" in Caveat (SIL Open Font License), white on green.

- App icon: `assets/build/icon.png` (1024 px). Regenerate it from the Caveat font if the mark changes.
- In the app, the menu shows the church's own logo and the words Church Studio. The app mark only appears in
  the welcome window.
- While the app runs, the Dock icon is the church's logo with a white circle in the bottom-right corner and
  "CS" cut out of it (`src/ui/dockIcon.js`). Light logos get a dark "CS" instead. People can turn this off
  in Settings › Church info.

To rename the app, change `APP_NAME` in `src/daemon/tools.js`, `productName` in `package.json`, and the brand
text in `src/ui/App.jsx`.
