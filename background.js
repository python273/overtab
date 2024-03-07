browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({'url': '/overtab.html'});
});

async function moveWebsiteTabsToRight(tab) {
  const currentTabUrl = new URL(tab.url);

  if (!currentTabUrl.hostname) return;

  const tabs = await browser.tabs.query({
      currentWindow: true,
      url: `*://*.${currentTabUrl.hostname}/*`
  });

  browser.tabs.move(tabs.map(t => t.id), {index: -1});
}

async function discardTab(tab) {
  if (tab.active) {
    const otherTabs = await browser.tabs.query({
      windowId: browser.windows.WINDOW_ID_CURRENT,
      discarded: false,
    });
    let i = 0;
    for (;i < otherTabs.length; i++) {
      if (otherTabs[i].id === tab.id) break;
    }

    let selectTab = null;
    if (i + 1 < otherTabs.length) {
      selectTab = otherTabs[i+1];
    } else if (i - 1 > 0) {
      selectTab = otherTabs[i-1];
    } else {
      selectTab = await browser.tabs.create({active: false});
    }

    await browser.tabs.update(selectTab.id, {active: true, highlighted: false});
  }
  await browser.tabs.discard(tab.id);
}

browser.contextMenus.create({
    id: 'discard-tab',
    title: 'Discard tab',
    contexts: ['tab'],
});
browser.contextMenus.create({
    contexts: ['tab'],
    type: 'separator',
});
browser.contextMenus.create({
    id: 'move-website-tabs-to-right',
    title: 'Move website tabs to right',
    contexts: ['tab'],
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'move-website-tabs-to-right':
      moveWebsiteTabsToRight(tab);
      break;
    case 'discard-tab':
      discardTab(tab);
      break;
  }
});
