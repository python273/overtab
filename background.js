browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({
    "url": "/overtab.html"
  });
});
