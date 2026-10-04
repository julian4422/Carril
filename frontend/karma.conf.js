// Karma: Jasmine + ChromeHeadless. Usa el Chrome instalado en macOS si CHROME_BIN no está definido.
const fs = require('fs');
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.CHROME_BIN && fs.existsSync(macChrome)) {
  process.env.CHROME_BIN = macChrome;
}

module.exports = function (config) {
  const coverageReporter = {
    dir: require('path').join(__dirname, 'coverage'),
    subdir: '.',
    reporters: [{ type: 'html' }, { type: 'text-summary' }, { type: 'lcovonly' }],
  };
  if (process.env.KARMA_COVERAGE_CHECK) {
    coverageReporter.check = { global: { lines: 80 } };
  }
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: { jasmine: { random: true }, clearContext: false },
    jasmineHtmlReporter: { suppressAll: true },
    coverageReporter,
    reporters: ['progress', 'kjhtml'],
    customLaunchers: {
      ChromeHeadlessCI: { base: 'ChromeHeadless', flags: ['--no-sandbox', '--disable-gpu'] },
    },
    restartOnFileChange: true,
  });
};
