const browser = window.msBrowser || window.browser || window.chrome;

const rootEl = document.querySelector('#root');

document.querySelectorAll('form').forEach(el => {
    el.addEventListener('submit', event => {
        event.preventDefault();
    });
});

const tabElId = (tabId) => `t_${tabId}`;

function getTabIdFromElement(tabEl) {
    return parseInt(tabEl.id.slice(2), 10);
}

function getTabIdFromEvent(event) {
    return getTabIdFromElement(event.target.closest('.tab'));
}

async function onTabClick(event) {
    event.preventDefault();
    const tabId = getTabIdFromEvent(event);
    if (discardTabOnClick) {
        document.getSelection().removeAllRanges();
        await browser.tabs.discard(tabId);
    } else if (closeTabOnClick) {
        await browser.tabs.remove(tabId);
    } else {
        await browser.tabs.update(tabId, {active: true, highlighted: false});
    }
}

async function onTabAuxclick(event) {
    if (event.which !== 2) return;

    event.preventDefault();
    const tabId = getTabIdFromEvent(event);
    await browser.tabs.remove(tabId);
}

function closeAllTabPopovers() {
    const els = document.querySelectorAll('.tabPopover');
    for (const el of els) {
        el.remove();
    }
}


async function showTabPopover(event) {
    const tabId = getTabIdFromEvent(event);
    const tab = await new Promise(resolve => {
        browser.tabs.get(tabId, resolve);
    });
    // get container
    if (tab.cookieStoreId && tab.cookieStoreId !== 'firefox-default') {
        tab.container = await browser.contextualIdentities.get(tab.cookieStoreId);
    }

    const tabEl = document.getElementById(tabElId(tabId));

    const pos = tabEl.getBoundingClientRect();

    const el = document.createElement('div');
    el.id = `tab_popover_${tabId}`;
    el.classList.add("tabPopover");
    el.style['position'] = 'absolute';
    el.style['top'] = `${pos.top + pos.height + window.scrollY}px`;
    el.style['left'] = `${pos.left + window.scrollX}px`;
    if (tab.container) {
        el.style['border-color'] = `${tab.container.colorCode}`;
    }

    const elTitle = document.createElement('div');
    elTitle.classList.add("tabPopoverTitle");
    elTitle.innerText = tab.title;
    el.appendChild(elTitle);

    const elUrl = document.createElement('a');
    elUrl.href = tab.url;
    elUrl.innerText = tab.url;
    el.appendChild(elUrl);

    el.addEventListener('mouseenter', () => {
        if (popoverTimeoutId) {
            clearTimeout(popoverTimeoutId);
        }
    })

    closeAllTabPopovers();
    document.body.appendChild(el);
}

let popoverTimeoutId;

async function closeTabPopover(event) {
    const tabId = getTabIdFromEvent(event);

    popoverTimeoutId = setTimeout(async () => {
        const el = document.getElementById(`tab_popover_${tabId}`);
        if (el) {
            el.remove();
        }
    }, 250);
}

const createTabEl = (tab) => {
    const tabEl = document.createElement('div');
    tabEl.id = tabElId(tab.id);
    tabEl.classList.add("tab");
    // if (tab.active) tabEl.classList.add("tabActive");
    // if (tab.highlighted) tabEl.classList.add("tabHighlighted");

    if (tab.container) {
        tabEl.style['border-top'] = `1.5px solid ${tab.container.colorCode}`;
    }

    if (tab.favIconUrl) {
        const tabIcon = document.createElement('img');
        tabIcon.classList.add("tabIcon");
        tabIcon.src = tab.favIconUrl;
        tabIcon.loading = 'lazy';
        tabIcon.decoding = 'async';
        tabEl.appendChild(tabIcon);
    }

    tabEl.appendChild(document.createTextNode(tab.title));

    tabEl.addEventListener('click', onTabClick);
    tabEl.addEventListener('auxclick', onTabAuxclick);
    tabEl.addEventListener('mouseenter', showTabPopover);
    tabEl.addEventListener('mouseleave', closeTabPopover);

    return tabEl;
}

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // console.log(tabId, changeInfo, tab);

    const newTabEl = createTabEl(tab);
    var currentTabEl = document.getElementById(tabElId(tabId));
    currentTabEl.parentElement.replaceChild(newTabEl, currentTabEl);

    // renderTabs().then(() => {});
});

browser.tabs.onRemoved.addListener((tabId) => {
    const selectorsToRemove = [
        `#${tabElId(tabId)}`,
        `#tab_popover_${tabId}`,
    ];
    for (const s of selectorsToRemove) {
        const els = document.querySelectorAll(s);
        for (const el of els) {
            el.remove();
        }
    }
})

async function _renderTabs() {
    const currentWindowId = await new Promise(resolve => {
        browser.windows.getCurrent({}, window => { resolve(window.id) });
    });

    let containers = [];
    try {
        containers = await browser.contextualIdentities.query({});
    } catch (e) { }
    const containerByCookieStoreId = {};
    for (let container of containers) {
        containerByCookieStoreId[container.cookieStoreId] = container;
    }

    const tabsFilters = {};
    if (containerFilterValue) {
        tabsFilters.cookieStoreId = containerFilterValue;
    }
    if (showOnlyInRam) {
        tabsFilters.discarded = false;
    }
    let tabs = await new Promise(resolve => {
        browser.tabs.query(tabsFilters, resolve);
    });

    if (query || queryNegativeRegexp) {
        let newTabs = [];
        for (let tab of tabs) {
            let tabMatching = !query;
            if (query) {
                if (queryIsRegex) {
                    tabMatching = (
                        (tab.title && queryRegexp.test(tab.title)) ||
                        (tab.url && queryRegexp.test(tab.url))
                    );
                } else {
                    tabMatching = (
                        (tab.title && tab.title.indexOf(query) >= 0) ||
                        (tab.url && tab.url.indexOf(query) >= 0)
                    );
                }
            }
            if (tabMatching && queryNegativeRegexp) {
                if (
                    (tab.title && queryNegativeRegexp.test(tab.title)) ||
                    (tab.url && queryNegativeRegexp.test(tab.url))
                ) {
                    tabMatching = false;
                }
            }
            if (!tabMatching) continue;
            newTabs.push(tab);
        }
        tabs = newTabs;
    }

    for (let tab of tabs) {
        tab.container = containerByCookieStoreId[tab.cookieStoreId];
    }

    if (sortByUrl) {
        tabs.sort((a, b) => a.url.localeCompare(b.url));
    } else {
        tabs.sort((a, b) => b.index - a.index);  // reverse
    }

    const tabsByWindows = {};

    for (let tab of tabs) {
        let windowTabs = null;

        if (!tabsByWindows.hasOwnProperty(tab.windowId)) {
            windowTabs = [];
            tabsByWindows[tab.windowId] = windowTabs;
        } else {
            windowTabs = tabsByWindows[tab.windowId];
        }

        windowTabs.push(tab);
    }

    const windowsEl = document.createElement('div');
    windowsEl.id = "windows";

    // sort windows, first current window, then others
    const windowIds = Object.keys(tabsByWindows).sort((a, b) => {
        if (a == currentWindowId) return -1;
        if (b == currentWindowId) return 1;
        return 0;
    });

    for (let windowId of windowIds) {
        const windowTabs = tabsByWindows[windowId];
        if (!windowTabs.length) {
            continue;
        }

        const windowEl = document.createElement('div');
        windowEl.id = `window_${windowId}`;
        windowEl.classList.add("window");
        windowsEl.appendChild(windowEl);

        let subgroupEl = document.createElement('div');
        subgroupEl.classList.add("subgroup");
        windowEl.appendChild(subgroupEl);

        let privTime = windowTabs[0].lastAccessed;

        for (let tab of windowTabs) {
            if (splitByTime && (Math.abs(tab.lastAccessed - privTime) > 4 * 60 * 60 * 1000)) {
                const separatorEl = document.createElement('div');
                separatorEl.classList.add("separator");
                separatorEl.innerText = new Date(tab.lastAccessed).toLocaleString();
                windowEl.appendChild(separatorEl);

                subgroupEl = document.createElement('div');
                subgroupEl.classList.add("subgroup");
                windowEl.appendChild(subgroupEl);
            }

            privTime = tab.lastAccessed;
            const tabEl = createTabEl(tab);
            subgroupEl.appendChild(tabEl);
        }
    }

    const scrollEl = document.createElement('div');
    scrollEl.classList.add("extra-scroll");
    windowsEl.appendChild(scrollEl);

    rootEl.replaceChildren(windowsEl);
}

let rendering = false;
let shouldRenderAgain = false;

async function renderTabs() {
    if (rendering) {
        shouldRenderAgain = true;
        return;
    }

    rendering = true;
    let first = true;

    while (first || shouldRenderAgain) {
        shouldRenderAgain = false;
        await _renderTabs();
        first = false;
    }
    rendering = false;
}

browser.tabs.onCreated.addListener((tabId) => { renderTabs().then(() => {}) });

let closeTabOnClick = false;
document.addEventListener('keydown', (e) => {
    if (e.key !== "Alt") return;
    closeTabOnClick = true;
    rootEl.classList.add('close-tab-on-click');
});
document.addEventListener('keyup', (e) => {
    if (e.key !== "Alt") return;
    closeTabOnClick = false;
    rootEl.classList.remove('close-tab-on-click');
});

let discardTabOnClick = false;
document.addEventListener('keydown', (e) => {
    if (e.key !== "Shift") return;
    discardTabOnClick = true;
    rootEl.classList.add('discard-tab-on-click');
});
document.addEventListener('keyup', (e) => {
    if (e.key !== "Shift") return;
    discardTabOnClick = false;
    rootEl.classList.remove('discard-tab-on-click');
});

// QUERY
let query = '';
let queryRegexp = new RegExp('', 'ig');

function onQueryInputChange(event) {
    closeAllTabPopovers();
    query = event.target.value.trimStart();
    queryRegexp = new RegExp(query, 'ig');
    renderTabs().then(() => {});
}

const queryInputEl = document.getElementById('queryInput');
queryInputEl.addEventListener('input', onQueryInputChange);

// QUERY NEGATIVE
let queryNegativeRegexp = null;
function setQueryNegativeRegexp(s) {
    queryNegativeRegexp = s ? new RegExp(s, 'ig') : null;
    localStorage['cfg-query-negative'] = s || '';
}
setQueryNegativeRegexp(localStorage['cfg-query-negative']);
function onQueryNegativeInputChange(event) {
    closeAllTabPopovers();
    setQueryNegativeRegexp(event.target.value);
    renderTabs().then(() => {});
}
const queryNegativeInputEl = document.getElementById('queryNegativeInput');
queryNegativeInputEl.addEventListener('input', onQueryNegativeInputChange);
queryNegativeInputEl.value = localStorage['cfg-query-negative'];

let sortByUrl = localStorage['cfg-sort-by-url'] === '1';

function onSortChange(event) {
    closeAllTabPopovers();
    sortByUrl = event.target.checked;
    localStorage['cfg-sort-by-url'] = sortByUrl ? '1' : '0';
    renderTabs().then(() => {});
}

const sortByUrlEl = document.getElementById('sortByUrl');
sortByUrlEl.addEventListener('change', onSortChange);
sortByUrlEl.checked = sortByUrl;

let queryIsRegex = localStorage['cfg-regex'] === '1';

function onQueryIsRegexChange(event) {
    closeAllTabPopovers();
    queryIsRegex = event.target.checked;
    localStorage['cfg-regex'] = queryIsRegex ? '1' : '0';
    renderTabs().then(() => {});
}

const queryIsRegexEl = document.getElementById('queryIsRegex');
queryIsRegexEl.addEventListener('change', onQueryIsRegexChange);
queryIsRegexEl.checked = queryIsRegex;

let splitByTime = localStorage['cfg-split-by-time'] === '1';

function onSplitByTimeChange(event) {
    closeAllTabPopovers();
    splitByTime = event.target.checked;
    localStorage['cfg-split-by-time'] = splitByTime ? '1' : '0';
    renderTabs().then(() => {});
}

const splitByTimeEl = document.getElementById('splitByTime');
splitByTimeEl.addEventListener('change', onSplitByTimeChange);
splitByTimeEl.checked = splitByTime;

let showOnlyInRam = localStorage['cfg-show-only-in-ram'] === '1';

function onShowOnlyInRamChange(event) {
    closeAllTabPopovers();
    showOnlyInRam = event.target.checked;
    localStorage['cfg-show-only-in-ram'] = showOnlyInRam ? '1' : '0';
    renderTabs().then(() => {});
}

const showOnlyInRamEl = document.getElementById('showOnlyInRam');
showOnlyInRamEl.addEventListener('change', onShowOnlyInRamChange);
showOnlyInRamEl.checked = showOnlyInRam;

let containerFilterValue = '';

function onFilterByContainerChange(event) {
    closeAllTabPopovers();
    containerFilterValue = event.target.value;
    renderTabs().then(() => {});
}

const filterByContainerEl = document.getElementById('filterByContainer');
filterByContainerEl.addEventListener('input', onFilterByContainerChange);

(async () => {
    let containers = [];
    try {
        containers = await browser.contextualIdentities.query({});
    } catch (e) { }
    if (!containers.length) return;
    for (let container of containers) {
        const optionEl = document.createElement('option');
        optionEl.value = container.cookieStoreId;
        optionEl.innerText = container.name;
        filterByContainerEl.appendChild(optionEl);
    }
    filterByContainerEl.parentElement.style.display = 'block';
})().then(() => {});

document.getElementById('save-window').addEventListener('click', async () => {
    if (!confirm('Save window?')) return;

    const now = new Date();
    const folderName = `tabs_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const containerCache = {};
    try {
        (await browser.contextualIdentities.query({})).forEach(container => {
            containerCache[container.cookieStoreId] = container.name;
        });
    } catch (e) { }

    const folder = await new Promise(resolve => {
        browser.bookmarks.create({ title: folderName }, resolve);
    });
    const tabs = await new Promise(resolve => {
        browser.tabs.query({ currentWindow: true }, resolve);
    });

    for (const tab of tabs) {
        const containerName = containerCache[tab.cookieStoreId] || '';
        let title = tab.title;
        if (tab.cookieStoreId && tab.cookieStoreId !== 'firefox-default') {
            title = `%${containerName}% ${tab.title}`;
        }
        await new Promise(resolve => {
            browser.bookmarks.create({
                parentId: folder.id,
                title: title,
                url: tab.url
            }, resolve);
        });
    }

    alert(`Saved as ${folderName}`);
});

// document.getElementById('sort-by-url-browser').addEventListener('click', async () => {
//     if (!confirm('Sort browser tabs by URL?')) return;
//     const currentWindowTabs = await browser.tabs.query({ currentWindow: true });
//     currentWindowTabs.sort((a, b) => a.url.localeCompare(b.url));
//     for (let i = 0; i < currentWindowTabs.length; i++) {
//         await browser.tabs.move(currentWindowTabs[i].id, { index: i });
//     }
// });

document.getElementById('unload-visible-tabs').addEventListener('click', async function () {
    if (!confirm('Unload visible tabs?')) return;
    const currentWindowId = await new Promise(resolve => {
        browser.windows.getCurrent({}, window => { resolve(window.id) });
    });
    const tabElements = document.querySelectorAll(`#window_${currentWindowId} .tab`);
    for (const tabEl of tabElements) {
        const tabId = getTabIdFromElement(tabEl);
        await browser.tabs.discard(tabId);
    }
});

renderTabs().then(()=>{});
