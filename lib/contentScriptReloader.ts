chrome.runtime.onMessage.addListener(function (msg) {
  if (msg === 'reload') {
    console.log(
      '%c [ChromeExtensionReloader] Start reload ',
      'background:#41b883 ; padding: 1px; border-radius: 3px;  color: #fff'
    );
    setTimeout(() => {
      window.location.reload();
    }, 800);
  }
});
